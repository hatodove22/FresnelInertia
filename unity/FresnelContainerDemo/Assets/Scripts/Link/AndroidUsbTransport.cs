using System;
using System.Collections.Generic;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
#if UNITY_ANDROID && !UNITY_EDITOR
using UnityEngine;
using UnityEngine.Scripting;
#endif

namespace Fresnel.UnityDemo.Link
{
    /// <summary>Native Android CDC USB host. Call Open/GetDevices from Unity's main thread; receive/fault events may arrive on a worker.
    /// Permission and data transfers are asynchronous. Closing the port never claims that physical outputs are off.</summary>
    public sealed class AndroidUsbTransport : IHapticTransport
    {
        public event Action<string> Received;
        public event Action<string> Faulted;
#if UNITY_ANDROID && !UNITY_EDITOR
        private const string NativeClass = "com.fresnel.hapticusb.UsbHostBridge";
        private readonly object gate = new object();
        private readonly int unityThreadId = Thread.CurrentThread.ManagedThreadId;
        [ThreadStatic] private static bool insideJavaCallback;
        private readonly Dictionary<long, TaskCompletionSource<bool>> writes = new Dictionary<long, TaskCompletionSource<bool>>();
        private AndroidJavaObject native;
        private Callbacks callbacks;
        private bool open, disposed;
        private long nextWrite;
        private Task closing = Task.CompletedTask;
        public bool IsOpen { get { lock (gate) return open && native != null && !disposed; } }

        public static string[] GetDevices()
        {
            using (var unity = new AndroidJavaClass("com.unity3d.player.UnityPlayer"))
            using (var activity = unity.GetStatic<AndroidJavaObject>("currentActivity"))
            using (var bridge = new AndroidJavaClass(NativeClass))
                return bridge.CallStatic<string[]>("getDevices", activity) ?? Array.Empty<string>();
        }

        public async Task OpenAsync(string endpoint)
        {
            if (string.IsNullOrWhiteSpace(endpoint)) throw new ArgumentException("Select an attached Android USB device", nameof(endpoint));
            Callbacks pending;
            lock (gate)
            {
                if (disposed) throw new ObjectDisposedException(nameof(AndroidUsbTransport));
                if (native != null || !closing.IsCompleted) throw new InvalidOperationException("USB session is already open or closing");
                pending = callbacks = new Callbacks(this);
                using (var unity = new AndroidJavaClass("com.unity3d.player.UnityPlayer"))
                using (var activity = unity.GetStatic<AndroidJavaObject>("currentActivity"))
                    native = new AndroidJavaObject(NativeClass, activity, pending);
            }
            try
            {
                using (AttachWorker()) native.Call("open", endpoint);
                if (await Task.WhenAny(pending.Opened.Task, Task.Delay(31000)) != pending.Opened.Task)
                    throw new TimeoutException("USB permission/open timed out");
                await pending.Opened.Task;
            }
            catch { await CloseAsync(); throw; }
        }

        public async Task WriteAsync(string text)
        {
            if (text == null || Encoding.UTF8.GetByteCount(text) > 4096) throw new ArgumentException("USB write exceeds 4096 bytes", nameof(text));
            AndroidJavaObject active;
            TaskCompletionSource<bool> result;
            long id;
            lock (gate)
            {
                if (!IsOpen) throw new InvalidOperationException("USB is closed");
                if (writes.Count >= 32) throw new InvalidOperationException("USB write queue is full");
                active = native; id = ++nextWrite; result = Completion(); writes.Add(id, result);
            }
            try
            {
                using (AttachWorker()) active.Call("write", id, text);
                if (await Task.WhenAny(result.Task, Task.Delay(2000)) != result.Task)
                {
                    OnFault(callbacks, "USB write timed out; output state is unknown");
                    await CloseAsync();
                    throw new TimeoutException("USB write timed out");
                }
                await result.Task;
            }
            finally { lock (gate) writes.Remove(id); }
        }

        public Task CloseAsync()
        {
            lock (gate)
            {
                if (native == null) return closing;
                var active = native; var receiver = callbacks;
                native = null; callbacks = null; open = false;
                receiver.Opened.TrySetCanceled();
                foreach (var result in writes.Values) result.TrySetCanceled();
                writes.Clear();
                return closing = FinishClose(active, receiver);
            }
        }
        private async Task FinishClose(AndroidJavaObject active, Callbacks receiver)
        {
            try
            {
                using (AttachWorker()) active.Call("close");
                if (await Task.WhenAny(receiver.Closed.Task, Task.Delay(1500)) != receiver.Closed.Task)
                    throw new TimeoutException("Android USB close did not confirm resource release");
                await receiver.Closed.Task;
            }
            finally { using (AttachWorker()) active.Dispose(); }
        }
        public void Dispose()
        {
            lock (gate) disposed = true;
            // Dispose cannot block Unity. Cleanup is bounded; CloseAsync is the observable orderly-close API.
            _ = CloseAsync().ContinueWith(task => { if (task.IsFaulted) { var ignored = task.Exception; } }, TaskScheduler.Default);
        }

        private void OnOpened(Callbacks sender)
        {
            lock (gate) { if (sender != callbacks || native == null || disposed) return; open = true; sender.Opened.TrySetResult(true); }
        }
        private void OnData(Callbacks sender, string base64)
        {
            lock (gate) { if (sender != callbacks || !open) return; }
            try
            {
                // Keep a UTF-8 decoder per attachment so split multibyte text cannot corrupt the bounded line decoder.
                byte[] bytes = Convert.FromBase64String(base64);
                if (bytes.Length > 4096) throw new FormatException("USB receive block exceeds 4096 bytes");
                char[] characters = new char[bytes.Length + 2];
                int count = sender.Utf8.GetChars(bytes, 0, bytes.Length, characters, 0, false);
                if (count > 0) Received?.Invoke(new string(characters, 0, count));
            }
            catch (Exception error) { OnFault(sender, "USB decoding: " + error.Message); }
        }
        private void OnWritten(Callbacks sender, long id)
        {
            lock (gate) if (sender == callbacks && writes.TryGetValue(id, out var result)) result.TrySetResult(true);
        }
        private void OnFault(Callbacks sender, string message)
        {
            lock (gate)
            {
                if (sender == null || sender != callbacks) return;
                open = false;
                var error = new InvalidOperationException(message);
                sender.Opened.TrySetException(error);
                foreach (var result in writes.Values) result.TrySetException(error);
            }
            Faulted?.Invoke(message);
        }
        private static TaskCompletionSource<bool> Completion() => new TaskCompletionSource<bool>(TaskCreationOptions.RunContinuationsAsynchronously);

        // HapticLink deliberately uses ConfigureAwait(false). Attach CLR workers for these short JNI calls;
        // never detach Unity's main thread or a Java-owned callback thread.
        private JniWorkerScope AttachWorker() => new JniWorkerScope(Thread.CurrentThread.ManagedThreadId != unityThreadId && !insideJavaCallback);
        private readonly struct JniWorkerScope : IDisposable
        {
            private readonly bool attached;
            internal JniWorkerScope(bool attach)
            {
                attached = attach;
                if (attach && AndroidJNI.AttachCurrentThread() != 0) throw new InvalidOperationException("Could not attach USB worker to Android JNI");
            }
            public void Dispose() { if (attached) AndroidJNI.DetachCurrentThread(); }
        }
        private static void JavaCallback(Action action)
        {
            bool previous = insideJavaCallback;
            insideJavaCallback = true;
            try { action(); } finally { insideJavaCallback = previous; }
        }

        [Preserve]
        private sealed class Callbacks : AndroidJavaProxy
        {
            private readonly AndroidUsbTransport owner;
            internal readonly TaskCompletionSource<bool> Opened = Completion(), Closed = Completion();
            internal readonly Decoder Utf8 = new UTF8Encoding(false, true).GetDecoder();
            internal Callbacks(AndroidUsbTransport owner) : base(NativeClass + "$Listener") { this.owner = owner; }
            [Preserve] public void onOpened() => JavaCallback(() => owner.OnOpened(this));
            [Preserve] public void onData(string base64) => JavaCallback(() => owner.OnData(this, base64));
            [Preserve] public void onWritten(long id) => JavaCallback(() => owner.OnWritten(this, id));
            [Preserve] public void onFault(string message) => JavaCallback(() => owner.OnFault(this, message));
            [Preserve] public void onClosed() => JavaCallback(() => Closed.TrySetResult(true));
            [Preserve] public void onDevicesChanged() { /* Explicit Refresh/GetDevices never auto-opens attached hardware. */ }
        }
#else
        public bool IsOpen => false;
        public static string[] GetDevices() => Array.Empty<string>();
        public Task OpenAsync(string endpoint) => Task.FromException(new PlatformNotSupportedException("Native Android USB host requires an Android player"));
        public Task WriteAsync(string text) => Task.FromException(new InvalidOperationException("Android USB is closed"));
        public Task CloseAsync() => Task.CompletedTask;
        public void Dispose() { Received = null; Faulted = null; }
#endif
    }
}
