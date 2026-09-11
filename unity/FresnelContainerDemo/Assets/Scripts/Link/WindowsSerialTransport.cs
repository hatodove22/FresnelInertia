using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Win32.SafeHandles;

namespace Fresnel.UnityDemo.Link
{
    /// <summary>Windows CDC/serial at 115200 8N1. No System.IO.Ports or Unity main-thread blocking.</summary>
    public sealed class WindowsSerialTransport : IHapticTransport
    {
        public event Action<string> Received;
        public event Action<string> Faulted;
        readonly object gate = new object();
        readonly SemaphoreSlim writeGate = new SemaphoreSlim(1, 1);
        SafeFileHandle handle;
        CancellationTokenSource cancellation;
        Task reader;
        bool opening, disposed;
        public bool IsOpen { get { lock (gate) return handle != null && !handle.IsClosed && !handle.IsInvalid && cancellation != null && !cancellation.IsCancellationRequested; } }

        public static string[] GetPorts()
        {
#if UNITY_EDITOR_WIN || UNITY_STANDALONE_WIN || FRESNEL_WINDOWS_TEST
            // QueryDosDevice enumerates names without opening or sending anything to a device.
            var buffer = new char[65536];
            uint count = Native.QueryDosDevice(null, buffer, buffer.Length);
            if (count == 0) return Array.Empty<string>();
            var ports = new List<string>();
            foreach (string name in new string(buffer, 0, (int)count).Split('\0'))
                if (Regex.IsMatch(name, @"^COM[1-9][0-9]{0,4}$")) ports.Add(name);
            ports.Sort((a, b) => int.Parse(a.Substring(3)).CompareTo(int.Parse(b.Substring(3))));
            return ports.ToArray();
#else
            return Array.Empty<string>();
#endif
        }

        public async Task OpenAsync(string endpoint)
        {
#if UNITY_EDITOR_WIN || UNITY_STANDALONE_WIN || FRESNEL_WINDOWS_TEST
            if (endpoint == null || !Regex.IsMatch(endpoint, @"^COM[1-9][0-9]{0,4}$", RegexOptions.IgnoreCase))
                throw new ArgumentException("Select a Windows COM port", nameof(endpoint));
            CancellationToken token;
            lock (gate)
            {
                if (disposed) throw new ObjectDisposedException(nameof(WindowsSerialTransport));
                if (opening || handle != null) throw new InvalidOperationException("Serial port is already open or opening");
                opening = true; cancellation = new CancellationTokenSource(); token = cancellation.Token;
            }
            SafeFileHandle opened = null;
            try
            {
                opened = await Task.Run(() =>
                {
                    token.ThrowIfCancellationRequested();
                    var file = Native.CreateFile(@"\\.\" + endpoint.ToUpperInvariant(), 0xC0000000, 0, IntPtr.Zero, 3, 0, IntPtr.Zero);
                    if (file.IsInvalid) { file.Dispose(); throw Win32("Open " + endpoint); }
                    try
                    {
                        var settings = new Native.Dcb { Length = (uint)Marshal.SizeOf<Native.Dcb>() };
                        if (!Native.GetCommState(file, ref settings)) throw Win32("Read serial settings");
                        settings.BaudRate = 115200; settings.Flags = 0x11; // binary + DTR enabled; no RTS reset pulse
                        settings.ByteSize = 8; settings.Parity = 0; settings.StopBits = 0;
                        if (!Native.SetCommState(file, ref settings)) throw Win32("Set 115200 8N1");
                        var timeouts = new Native.Timeouts { ReadInterval = uint.MaxValue, ReadConstant = 75, WriteConstant = 500 };
                        if (!Native.SetCommTimeouts(file, ref timeouts)) throw Win32("Set serial timeouts");
                        // Buffers are bounded; do not purge evidence or emit a reset/boot sequence.
                        Native.SetupComm(file, 4096, 4096);
                        return file;
                    }
                    catch { file.Dispose(); throw; }
                }, token).ConfigureAwait(false);
                lock (gate)
                {
                    token.ThrowIfCancellationRequested();
                    handle = opened; opening = false;
                    var current = opened;
                    reader = Task.Factory.StartNew(() => ReadLoop(current, token), token, TaskCreationOptions.LongRunning, TaskScheduler.Default);
                }
            }
            catch
            {
                opened?.Dispose();
                lock (gate) { opening = false; cancellation?.Cancel(); }
                throw;
            }
#else
            await Task.CompletedTask;
            throw new PlatformNotSupportedException("Native COM transport requires Windows");
#endif
        }

        void ReadLoop(SafeFileHandle file, CancellationToken token)
        {
            var decoder = Encoding.UTF8.GetDecoder();
            var bytes = new byte[1024];
            // A carried UTF-8 prefix can yield two UTF-16 chars before this block's ASCII bytes.
            var characters = new char[1026];
            try
            {
                while (!token.IsCancellationRequested)
                {
                    if (!Native.ReadFile(file, bytes, bytes.Length, out int count, IntPtr.Zero))
                    {
                        if (token.IsCancellationRequested) return;
                        throw Win32("Serial read");
                    }
                    if (count > 0)
                    {
                        int decoded = decoder.GetChars(bytes, 0, count, characters, 0, false);
                        if (decoded > 0 && !token.IsCancellationRequested) Received?.Invoke(new string(characters, 0, decoded));
                    }
                }
            }
            catch (Exception ex) { if (!token.IsCancellationRequested) Faulted?.Invoke(ex.Message); }
        }

        public async Task WriteAsync(string text)
        {
            if (text == null || Encoding.UTF8.GetByteCount(text) > 4096) throw new ArgumentException("Serial write is empty or too large");
            SafeFileHandle file; CancellationToken token;
            lock (gate)
            {
                if (!IsOpen) throw new InvalidOperationException("Serial port is closed");
                file = handle; token = cancellation.Token;
            }
            await writeGate.WaitAsync(token).ConfigureAwait(false);
            try
            {
                await Task.Run(() =>
                {
                    token.ThrowIfCancellationRequested();
                    byte[] bytes = Encoding.UTF8.GetBytes(text);
                    if (!Native.WriteFile(file, bytes, bytes.Length, out int written, IntPtr.Zero)) throw Win32("Serial write");
                    if (written != bytes.Length) throw new InvalidOperationException("Serial command write was incomplete");
                }, token).ConfigureAwait(false);
            }
            finally { writeGate.Release(); }
        }

        public async Task CloseAsync()
        {
            SafeFileHandle file; Task reading; CancellationTokenSource source;
            lock (gate)
            {
                source = cancellation; source?.Cancel();
                file = handle; handle = null; reading = reader; reader = null;
            }
            if (file != null && !file.IsClosed && !file.IsInvalid) Native.CancelIoEx(file, IntPtr.Zero);
            if (reading != null)
            {
                try { await Task.WhenAny(reading, Task.Delay(1500)).ConfigureAwait(false); } catch { }
            }
            // A write has a 500 ms native timeout; close remains bounded even after unplug.
            bool ownsWriter = await writeGate.WaitAsync(1000).ConfigureAwait(false);
            try { file?.Dispose(); }
            finally { if (ownsWriter) writeGate.Release(); }
            // Keep the cancelled source alive until any bounded worker has observed its token.
        }

        public void Dispose()
        {
            lock (gate) { if (disposed) return; disposed = true; }
            _ = CloseAsync();
        }

        static Exception Win32(string action) => new Win32Exception(Marshal.GetLastWin32Error(), action + " failed");
        static class Native
        {
            [StructLayout(LayoutKind.Sequential)] public struct Dcb
            {
                public uint Length, BaudRate, Flags;
                public ushort Reserved, XonLimit, XoffLimit;
                public byte ByteSize, Parity, StopBits, XonChar, XoffChar, ErrorChar, EofChar, EventChar;
                public ushort Reserved1;
            }
            [StructLayout(LayoutKind.Sequential)] public struct Timeouts
            { public uint ReadInterval, ReadMultiplier, ReadConstant, WriteMultiplier, WriteConstant; }
            [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
            public static extern uint QueryDosDevice(string device, [Out] char[] target, int length);
            [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
            public static extern SafeFileHandle CreateFile(string path, uint access, uint sharing, IntPtr security, uint creation, uint flags, IntPtr template);
            [DllImport("kernel32.dll", SetLastError = true)] [return: MarshalAs(UnmanagedType.Bool)]
            public static extern bool GetCommState(SafeFileHandle handle, ref Dcb dcb);
            [DllImport("kernel32.dll", SetLastError = true)] [return: MarshalAs(UnmanagedType.Bool)]
            public static extern bool SetCommState(SafeFileHandle handle, ref Dcb dcb);
            [DllImport("kernel32.dll", SetLastError = true)] [return: MarshalAs(UnmanagedType.Bool)]
            public static extern bool SetCommTimeouts(SafeFileHandle handle, ref Timeouts timeouts);
            [DllImport("kernel32.dll", SetLastError = true)] [return: MarshalAs(UnmanagedType.Bool)]
            public static extern bool SetupComm(SafeFileHandle handle, uint input, uint output);
            [DllImport("kernel32.dll", SetLastError = true)] [return: MarshalAs(UnmanagedType.Bool)]
            public static extern bool ReadFile(SafeFileHandle handle, [Out] byte[] buffer, int length, out int read, IntPtr overlapped);
            [DllImport("kernel32.dll", SetLastError = true)] [return: MarshalAs(UnmanagedType.Bool)]
            public static extern bool WriteFile(SafeFileHandle handle, byte[] buffer, int length, out int written, IntPtr overlapped);
            [DllImport("kernel32.dll", SetLastError = true)] [return: MarshalAs(UnmanagedType.Bool)]
            public static extern bool CancelIoEx(SafeFileHandle handle, IntPtr overlapped);
        }
    }
}
