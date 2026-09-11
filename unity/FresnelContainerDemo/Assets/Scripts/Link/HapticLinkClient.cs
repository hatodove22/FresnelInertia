using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.Linq;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using Newtonsoft.Json.Linq;

namespace Fresnel.UnityDemo.Link
{
    /// <summary>
    /// Single outstanding bridge request, bounded mixed-line framing, execution ACK authority.
    /// All continuations avoid Unity's synchronization context; State is safe to poll on the main thread.
    /// </summary>
    public sealed class HapticLinkClient : IDisposable
    {
        sealed class Pending
        {
            public string Text;
            public int Operation;
            public uint? Request;
            public string Session;
            public double Deadline;
            public double QueueDeadline;
            public readonly TaskCompletionSource<CommandAck> Completion = new TaskCompletionSource<CommandAck>(TaskCreationOptions.RunContinuationsAsynchronously);
        }

        readonly object gate = new object();
        readonly HapticLinkOptions options;
        readonly Func<double> clock;
        readonly List<Pending> queue = new List<Pending>();
        readonly HashSet<uint> retired = new HashSet<uint>();
        readonly Queue<uint> retiredOrder = new Queue<uint>();
        readonly StringBuilder line = new StringBuilder();
        readonly Timer timer;
        IHapticTransport transport;
        Action<string> receiveHandler, faultHandler;
        Pending active;
        bool connected, connecting, paired, discardLine, disposed;
        long generation, sequence, snapshotRevision;
        string session, error;
        JObject snapshot;
        CommandAck lastAck;
        double lastTelemetry = double.NegativeInfinity;
        string lastSample;

        public HapticLinkClient(HapticLinkOptions options = null)
        {
            this.options = options ?? new HapticLinkOptions();
            if (this.options.CommandTimeoutMs < 1 || this.options.StaleAfterMs < 1 ||
                this.options.DiscoveryTimeoutMs < 1 || this.options.DiscoveryRetryIntervalMs < 1)
                throw new ArgumentOutOfRangeException(nameof(options));
            clock = this.options.MonotonicMilliseconds ?? (() => Stopwatch.GetTimestamp() * 1000.0 / Stopwatch.Frequency);
            if (this.options.AutomaticTimer) timer = new Timer(_ => Tick(), null, 25, 25);
        }

        public HapticLinkState State
        {
            get
            {
                lock (gate)
                {
                    double age = Math.Max(0, clock() - lastTelemetry) / 1000;
                    return new HapticLinkState { Connected = connected, Connecting = connecting, Paired = paired,
                        Stale = !connected || age * 1000 > options.StaleAfterMs, LastTelemetryAge = age,
                        PendingCommand = active?.Text, Error = error, LastAck = lastAck, SnapshotRevision = snapshotRevision,
                        Snapshot = snapshot == null ? null : (JObject)snapshot.DeepClone() };
                }
            }
        }
        public bool Connected { get { lock (gate) return connected; } }
        public bool Paired { get { lock (gate) return paired; } }
        public bool Stale { get { lock (gate) return !connected || Math.Max(0, clock() - lastTelemetry) > options.StaleAfterMs; } }
        public string PendingCommand { get { lock (gate) return active?.Text; } }
        public string Error { get { lock (gate) return error; } }
        public CommandAck LastAck { get { lock (gate) return lastAck; } }
        public JObject Snapshot { get { lock (gate) return snapshot == null ? null : (JObject)snapshot.DeepClone(); } }
        public double LastTelemetryAge { get { lock (gate) return Math.Max(0, clock() - lastTelemetry) / 1000; } }
        public long SnapshotRevision { get { lock (gate) return snapshotRevision; } }

        public async Task ConnectAsync(IHapticTransport next, string endpoint)
        {
            if (next == null) throw new ArgumentNullException(nameof(next));
            long epoch;
            lock (gate)
            {
                if (disposed) throw new ObjectDisposedException(nameof(HapticLinkClient));
                if (connected || connecting) throw new HapticLinkException("connected", "Haptic Link is already open or connecting");
                epoch = ++generation; ++sequence; connecting = true; paired = false; session = null; error = null;
                snapshot = null; lastSample = null; lastTelemetry = double.NegativeInfinity; lastAck = null;
                line.Clear(); discardLine = false; retired.Clear(); retiredOrder.Clear(); transport = next;
                receiveHandler = text => Receive(epoch, text);
                faultHandler = message => TransportFault(epoch, message);
                next.Received += receiveHandler; next.Faulted += faultHandler;
            }
            try
            {
                await next.OpenAsync(endpoint).ConfigureAwait(false);
                CheckGeneration(epoch);
                // Observation only. Connecting and reconnecting cannot change content or arm outputs.
                await next.WriteAsync("status\n").ConfigureAwait(false);
                lock (gate)
                {
                    CheckGeneration(epoch);
                    connected = true; connecting = false;
                }
            }
            catch (Exception ex)
            {
                bool current; lock (gate) current = epoch == generation;
                if (current) await DisconnectCoreAsync(ex.Message).ConfigureAwait(false);
                else await CloseTransportAsync(next).ConfigureAwait(false);
                throw;
            }
        }

        public Task DisconnectAsync() => DisconnectCoreAsync(null);

        async Task DisconnectCoreAsync(string message)
        {
            IHapticTransport old;
            lock (gate)
            {
                ++generation; ++sequence; old = transport; transport = null;
                if (old != null) { old.Received -= receiveHandler; old.Faulted -= faultHandler; }
                connected = false; connecting = false; paired = false; session = null; error = message;
                var ex = new HapticLinkException("disconnected", message ?? "Haptic Link disconnected");
                if (active != null) { active.Completion.TrySetException(ex); active = null; }
                CancelQueued(ex); line.Clear(); discardLine = false;
            }
            if (old != null)
            {
                try { await old.CloseAsync().ConfigureAwait(false); }
                catch (Exception ex) { lock (gate) if (!connected && !connecting) error = ex.Message; }
                old.Dispose();
            }
        }

        static async Task CloseTransportAsync(IHapticTransport old)
        {
            try { await old.CloseAsync().ConfigureAwait(false); } catch { }
            old.Dispose();
        }

        void TransportFault(long epoch, string message)
        {
            lock (gate) if (epoch != generation) return;
            _ = DisconnectCoreAsync(message ?? "Device disconnected");
        }

        void CheckGeneration(long epoch)
        {
            lock (gate) if (epoch != generation) throw new HapticLinkException("cancelled", "Connection changed");
        }
        void CheckSequence(long current)
        {
            lock (gate)
            {
                if (!connected) throw new HapticLinkException("disconnected", "Haptic Link disconnected");
                if (current != sequence) throw new HapticLinkException("cancelled", "Command sequence superseded by another action");
            }
        }

        public async Task<CommandAck> GetStateAsync()
        {
            long current; lock (gate) current = sequence;
            double deadline = clock() + options.DiscoveryTimeoutMs;
            for (;;)
            {
                CheckSequence(current);
                try
                {
                    var ack = await CommandAsync("get state", 2, false, deadline).ConfigureAwait(false);
                    CheckSequence(current); return ack;
                }
                catch (HapticLinkException ex)
                {
                    CheckSequence(current);
                    bool retry = ex.Code == "rejected" &&
                        (Regex.IsMatch(ex.Message, @"^haptic_link: command rejected; (AtomS3 source not discovered|link not paired|prior request pending)$") ||
                         ex.Message.StartsWith("not_paired:", StringComparison.Ordinal) || ex.Message.StartsWith("bad_session:", StringComparison.Ordinal));
                    double remaining = deadline - clock();
                    if (!retry || remaining <= 0) throw;
                    await Task.Delay(Math.Max(1, (int)Math.Min(options.DiscoveryRetryIntervalMs, remaining))).ConfigureAwait(false);
                    CheckSequence(current);
                    if (clock() >= deadline) throw;
                }
            }
        }

        public Task<CommandAck> SetAudioAsync(bool enabled) => CommandAsync(enabled ? "audio on" : "audio off", 5);
        public Task<CommandAck> SetTiltAsync(bool enabled) => CommandAsync(enabled ? "tilt on" : "tilt off", 9);
        public Task<CommandAck> ClearTiltFaultAsync() => CommandAsync("tilt clear", 10);

        public async Task<CommandAck> StartAsync(bool audio, bool tilt)
        {
            long current; lock (gate) current = ++sequence;
            try
            {
                await CommandAsync("live", 4).ConfigureAwait(false); CheckSequence(current);
                await SetAudioAsync(audio).ConfigureAwait(false); CheckSequence(current);
                var ack = await SetTiltAsync(tilt).ConfigureAwait(false); CheckSequence(current); return ack;
            }
            catch
            {
                bool cleanup; lock (gate) cleanup = connected && sequence == current;
                if (cleanup) try { await StopAsync().ConfigureAwait(false); } catch { }
                throw;
            }
        }

        public Task<CommandAck> StopAsync()
        {
            lock (gate)
            {
                ++sequence;
                CancelQueued(new HapticLinkException("cancelled", "Superseded by Stop"));
                // A bridge permits only one in-flight request. Keep its ID until ACK/timeout;
                // priority Stop is next, and cancelled sequences cannot enable another output.
                return CommandAsync("stop", 3, true);
            }
        }

        public async Task<CommandAck> LoadPresetAsync(string name)
        {
            if (name == null || !Regex.IsMatch(name, @"^[A-Za-z0-9_-]{1,63}$")) throw new ArgumentException("Invalid preset name", nameof(name));
            Task<CommandAck> stopped; long current;
            lock (gate) { stopped = StopAsync(); current = sequence; }
            await stopped.ConfigureAwait(false); CheckSequence(current);
            var ack = await CommandAsync("preset load " + name, 6).ConfigureAwait(false); CheckSequence(current);
            await GetStateAsync().ConfigureAwait(false); CheckSequence(current); return ack;
        }

        public Task<CommandAck> SetParamAsync(string path, float value) => SetParamAsync(path, (double)value);
        public Task<CommandAck> SetParamAsync(string path, double value)
        {
            if (path == null || !Regex.IsMatch(path, @"^[A-Za-z_][A-Za-z0-9_.]{0,46}$") || double.IsNaN(value) || double.IsInfinity(value))
                throw new ArgumentException("Invalid numeric property");
            return CommandAsync("set " + path + " " + value.ToString("R", CultureInfo.InvariantCulture), 7);
        }

        static readonly string[] TiltPaths = { "tilt.max_tilt_deg", "tilt.k_cm", "tilt.k_tau", "tilt.k_phi" };

        /// <summary>Applied values returned by GetState; a configuration readback, not servo feedback.</summary>
        public static Dictionary<string, double> ParseTiltGainReadback(string detail)
        {
            if (detail == null || !detail.StartsWith("tilt_v1=", StringComparison.Ordinal)) return null;
            string[] values = detail.Substring(8).Split(',');
            if (values.Length != 4) return null;
            var result = new Dictionary<string, double>();
            for (int i = 0; i < 4; ++i)
            {
                if (!Regex.IsMatch(values[i], @"^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$") ||
                    !double.TryParse(values[i], NumberStyles.Float, CultureInfo.InvariantCulture, out double number) ||
                    double.IsNaN(number) || double.IsInfinity(number)) return null;
                result[TiltPaths[i]] = number;
            }
            return result;
        }

        public static bool TiltGainsMatch(IReadOnlyDictionary<string, double> actual, IReadOnlyDictionary<string, double> requested)
        {
            if (actual == null || requested == null || actual.Count != 4) return false;
            foreach (string path in TiltPaths)
                if (!actual.TryGetValue(path, out double value) || !requested.TryGetValue(path, out double wanted) ||
                    double.IsNaN(value) || double.IsInfinity(value) || double.IsNaN(wanted) || double.IsInfinity(wanted) ||
                    Math.Abs(value - wanted) > Math.Max(1e-6, Math.Abs(wanted) * 1e-5)) return false;
            return true;
        }

        /// <summary>
        /// Complete seven-value stopped profile application. Validates before all IO; probes capability,
        /// waits for every execution ACK, and checks the four available numeric readbacks. Never Starts.
        /// </summary>
        public async Task<CommandAck[]> ApplyTuningAsync(string preset, IReadOnlyDictionary<string, double> parameters)
        {
            bool sand = preset == "granular_sand_pile_box";
            if (parameters == null || parameters.Count != 7 ||
                (!sand && preset != "liquid_small_box" && preset != "granular_single_marble_box"))
                throw new ArgumentException("A joint profile requires water, one marble or retained sand and exactly seven parameters");
            string[] paths = new[] { "resonance.master_gain",
                sand ? "mass.granular_static_friction" : "mass.damping_ratio_x",
                sand ? "mass.granular_dynamic_friction" : "mass.damping_ratio_y" }.Concat(TiltPaths).ToArray();
            double[] minimum = { .1, sand ? .2 : .05, sand ? 0 : .05, 0, 0, 0, 0 };
            double[] maximum = { 1, sand ? .9 : 1.5, sand ? 2 : 1.5, 10, 1, 1, 8 };
            var copied = new Dictionary<string, double>();
            for (int i = 0; i < paths.Length; ++i)
            {
                if (!parameters.TryGetValue(paths[i], out double value) || double.IsNaN(value) || double.IsInfinity(value) ||
                    value < minimum[i] || value > maximum[i] || (i == 6 && value <= 0))
                    throw new ArgumentException("Invalid tuning parameter: " + paths[i]);
                copied.Add(paths[i], value);
            }
            if (sand ? Math.Abs(copied[paths[2]] - copied[paths[1]] * 7 / 11) > 1e-12 : copied[paths[1]] != copied[paths[2]])
                throw new ArgumentException(sand ? "Sand dynamic friction must equal static friction * 7/11" : "Both damping axes must match");
            Task<CommandAck> stopped; long current;
            lock (gate) { stopped = StopAsync(); current = sequence; }
            try
            {
                var acks = new List<CommandAck> { await stopped.ConfigureAwait(false) }; CheckSequence(current);
                var capability = await GetStateAsync().ConfigureAwait(false); CheckSequence(current); acks.Add(capability);
                if (ParseTiltGainReadback(capability.Detail) == null)
                    throw new HapticLinkException("unsupported", "Device firmware has no tilt_v1 gain readback; profile was not applied");
                acks.Add(await CommandAsync("preset load " + preset, 6).ConfigureAwait(false)); CheckSequence(current);
                foreach (string path in paths)
                { acks.Add(await SetParamAsync(path, copied[path]).ConfigureAwait(false)); CheckSequence(current); }
                var final = await GetStateAsync().ConfigureAwait(false); CheckSequence(current); acks.Add(final);
                if (!TiltGainsMatch(ParseTiltGainReadback(final.Detail), copied))
                    throw new HapticLinkException("readback", "Applied tilt gains do not match the profile; outputs remain stopped");
                return acks.ToArray();
            }
            catch
            {
                bool cleanup; lock (gate) cleanup = connected && sequence == current;
                if (cleanup) try { await StopAsync().ConfigureAwait(false); } catch { }
                throw;
            }
        }

        Task<CommandAck> CommandAsync(string text, int operation, bool priority = false, double deadline = double.PositiveInfinity)
        {
            lock (gate)
            {
                if (!connected || transport == null) return Task.FromException<CommandAck>(new HapticLinkException("disconnected", "Connect Haptic Link first"));
                if (queue.Count >= 64) return Task.FromException<CommandAck>(new HapticLinkException("busy", "Too many pending commands"));
                var item = new Pending { Text = text, Operation = operation, QueueDeadline = deadline };
                if (priority) queue.Insert(0, item); else queue.Add(item);
                Pump(); return item.Completion.Task;
            }
        }

        void Pump()
        {
            if (active != null || !connected || transport == null || queue.Count == 0) return;
            active = queue[0]; queue.RemoveAt(0);
            active.Deadline = Math.Min(clock() + options.CommandTimeoutMs, active.QueueDeadline);
            if (active.Deadline <= clock()) { Finish(new HapticLinkException("timeout", "State discovery window expired"), null); return; }
            active.Session = session; error = null;
            _ = WriteCommandAsync(transport, active);
        }

        async Task WriteCommandAsync(IHapticTransport writer, Pending item)
        {
            try { await writer.WriteAsync(item.Text + "\n").ConfigureAwait(false); }
            catch (Exception ex)
            {
                lock (gate) if (active == item) Finish(new HapticLinkException("transport", ex.Message), null);
            }
        }

        void Retire(uint request)
        {
            if (retired.Add(request)) retiredOrder.Enqueue(request);
            while (retiredOrder.Count > 256) retired.Remove(retiredOrder.Dequeue());
        }
        void Finish(Exception exception, CommandAck ack)
        {
            var item = active;
            if (item == null) return;
            active = null;
            if (item.Request.HasValue) Retire(item.Request.Value);
            if (ack != null) lastAck = ack;
            if (exception != null) { error = exception.Message; item.Completion.TrySetException(exception); }
            else item.Completion.TrySetResult(ack);
            Pump();
        }
        void CancelQueued(Exception exception)
        {
            foreach (var item in queue) item.Completion.TrySetException(exception);
            queue.Clear();
        }

        /// <summary>Called by the internal timer; exposed for a deterministic injected clock.</summary>
        public void Tick()
        {
            lock (gate)
            {
                if (disposed) return;
                double now = clock();
                for (int i = queue.Count - 1; i >= 0; --i)
                    if (queue[i].QueueDeadline <= now)
                    {
                        queue[i].Completion.TrySetException(new HapticLinkException("timeout", "State discovery window expired while queued"));
                        queue.RemoveAt(i);
                    }
                if (active != null && active.Deadline <= now)
                    Finish(new HapticLinkException("timeout", "No execution ACK for " + active.Text), null);
            }
        }

        void Receive(long epoch, string fragments)
        {
            if (fragments == null) return;
            lock (gate)
            {
                if (generation != epoch || disposed) return;
                // Stream through arbitrary fragments without allocating an unbounded concatenation.
                foreach (char ch in fragments)
                {
                    if (ch == '\n')
                    {
                        string complete = discardLine ? null : line.ToString();
                        line.Clear(); discardLine = false;
                        // Release this frame before a synchronous mock/transport callback can reply
                        // to the next pumped command reentrantly.
                        if (complete != null) HandleLine(HapticLinkProtocol.Parse(complete));
                    }
                    else if (!discardLine)
                    {
                        if (line.Length == HapticLinkProtocol.MaximumLineLength) { line.Clear(); discardLine = true; }
                        else line.Append(ch);
                    }
                }
            }
        }

        void HandleLine(BridgeLine parsed)
        {
            switch (parsed.Kind)
            {
                case BridgeLineKind.Telemetry:
                    snapshot = parsed.Snapshot;
                    ++snapshotRevision;
                    string sample = snapshot["timestamp_ms"] + ":" + snapshot["frame_counter"];
                    // Configuration ACK snapshots can repeat a measured sample. Keep their settings,
                    // but duplicates cannot make old IMU/content observations appear fresh.
                    if (sample != lastSample) { lastSample = sample; lastTelemetry = clock(); }
                    break;
                case BridgeLineKind.Status:
                    paired = parsed.Paired;
                    if (parsed.Session != null && parsed.Session != "00000000")
                    {
                        bool changed = session != null && session != parsed.Session;
                        session = parsed.Session;
                        if (changed)
                        {
                            snapshot = null; lastSample = null; lastTelemetry = double.NegativeInfinity;
                            CancelQueued(new HapticLinkException("cancelled", "Bridge session changed"));
                            if (active != null) Finish(new HapticLinkException("rejected", "bad_session: Bridge session changed"), null);
                        }
                    }
                    break;
                case BridgeLineKind.Tx:
                    if (active != null && !active.Request.HasValue && active.Operation == parsed.Operation && !retired.Contains(parsed.RequestId))
                    { active.Request = parsed.RequestId; active.Session = session; }
                    break;
                case BridgeLineKind.Ack:
                    var ack = parsed.Ack;
                    if (active == null || active.Request != ack.RequestId) break;
                    // A matching request ID from a previous pairing is never execution success.
                    bool pairingFailure = ack.Result == "not_paired" || ack.Result == "bad_session";
                    if (active.Session != null && ack.Session != active.Session && !pairingFailure) break;
                    if (ack.Applied && ack.Session == "00000000")
                    { Finish(new HapticLinkException("rejected", "bad_session: Applied ACK has no pairing session"), ack); break; }
                    if (ack.Applied) { paired = true; session = ack.Session; }
                    // Explicit pairing failures may carry session zero. They are rejection, never
                    // success; clearing the old session allows bounded GetState discovery to recover.
                    else if (pairingFailure) { paired = false; session = null; }
                    Finish(ack.Applied ? null : new HapticLinkException("rejected", ack.Result + ": " + ack.Detail), ack);
                    break;
                case BridgeLineKind.Error:
                    if (active != null && (!parsed.HasRequestId || active.Request == parsed.RequestId))
                        Finish(new HapticLinkException(parsed.Message.Contains("timeout") ? "timeout" : "rejected", parsed.Message), null);
                    break;
            }
        }

        public void Dispose()
        {
            lock (gate) { if (disposed) return; disposed = true; }
            timer?.Dispose();
            _ = DisconnectCoreAsync(null);
        }
    }
}
