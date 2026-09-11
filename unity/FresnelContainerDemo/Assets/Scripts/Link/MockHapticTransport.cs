using System;
using System.Collections.Generic;
using System.Globalization;
using System.Threading.Tasks;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace Fresnel.UnityDemo.Link
{
    /// <summary>Hardware-free bridge fixture. Only explicit Emit calls advance motion telemetry.</summary>
    public sealed class MockHapticTransport : IHapticTransport
    {
        public event Action<string> Received;
        public event Action<string> Faulted;
        readonly object gate = new object();
        readonly List<string> writes = new List<string>();
        readonly Dictionary<string, double> gains = new Dictionary<string, double>
        { ["tilt.max_tilt_deg"] = 10, ["tilt.k_cm"] = .35, ["tilt.k_tau"] = .25, ["tilt.k_phi"] = 4 };
        bool open;
        uint nextRequest;
        public bool IsOpen { get { lock (gate) return open; } }
        public bool AutoAcknowledge = true;
        public string Session = "1234ABCD";
        public string Preset = "granular_single_marble_box";
        public string RunMode = "idle";
        public string RejectCommand;
        public string RejectResult = "rejected";
        public string RejectDetail = "Mock execution rejection";
        public string StateDetailOverride;
        public Action<MockHapticTransport, string> OnWrite;
        public uint LastRequest { get { lock (gate) return nextRequest; } }
        public string[] Commands { get { lock (gate) return writes.ToArray(); } }

        public Task OpenAsync(string endpoint) { lock (gate) open = true; return Task.CompletedTask; }
        public Task CloseAsync() { lock (gate) open = false; return Task.CompletedTask; }
        public void Dispose() { lock (gate) open = false; }

        public Task WriteAsync(string text)
        {
            lock (gate)
            {
                if (!open) return Task.FromException(new InvalidOperationException("Mock transport closed"));
                writes.Add(text.TrimEnd('\r', '\n'));
            }
            if (OnWrite != null) { OnWrite(this, text.Trim()); return Task.CompletedTask; }
            Respond(text.Trim()); return Task.CompletedTask;
        }

        public void Respond(string command)
        {
            if (command == "status") { Emit("espnow_bridge: ready=1 paired=1 session=" + Session + "\n"); return; }
            int operation = command == "get state" ? 2 : command == "stop" ? 3 : command == "live" ? 4 :
                command.StartsWith("audio ", StringComparison.Ordinal) ? 5 : command.StartsWith("preset load ", StringComparison.Ordinal) ? 6 :
                command.StartsWith("set ", StringComparison.Ordinal) ? 7 : command == "tilt clear" ? 10 : command.StartsWith("tilt ", StringComparison.Ordinal) ? 9 : 0;
            uint request; lock (gate) request = ++nextRequest;
            Emit($"haptic_link_tx: request={request} operation={operation}\n");
            if (!AutoAcknowledge) return;
            if (command == RejectCommand) { EmitAck(request, RejectResult, RejectDetail); return; }
            if (command == "stop") RunMode = "idle";
            if (command == "live") RunMode = "live";
            if (command.StartsWith("preset load ", StringComparison.Ordinal)) Preset = command.Substring(12);
            if (command.StartsWith("set ", StringComparison.Ordinal))
            {
                string[] words = command.Split(' ');
                if (words.Length == 3 && gains.ContainsKey(words[1])) gains[words[1]] = double.Parse(words[2], CultureInfo.InvariantCulture);
            }
            string detail = command == "get state" ? StateDetailOverride ?? string.Format(CultureInfo.InvariantCulture,
                "tilt_v1={0:G6},{1:G6},{2:G6},{3:G6}", gains["tilt.max_tilt_deg"], gains["tilt.k_cm"], gains["tilt.k_tau"], gains["tilt.k_phi"]) : "ok";
            EmitAck(request, "applied", detail);
        }

        public void Emit(string fragment) { if (IsOpen) Received?.Invoke(fragment); }
        public void EmitAck(uint request, string result = "applied", string detail = "ok", string session = null, ulong frame = 1)
            => Emit($"haptic_link_ack: request={request} result={result} session={session ?? Session} frame={frame} detail={detail}\n");
        public void EmitSnapshot(JObject snapshot) => Emit(snapshot.ToString(Formatting.None) + "\n");
        public void Fail(string message) { Faulted?.Invoke(message); }

        public JObject CreateSnapshot(long frame = 1, long timestampMs = 100)
        {
            bool water = Preset == "liquid_small_box";
            bool sand = Preset == "granular_sand_pile_box";
            bool heartbeat = Preset == "heartbeat_soft_object";
            double fill = water ? .55 : sand ? .35 : heartbeat ? 1 : .04;
            return new JObject
            {
                ["timestamp_ms"] = timestampMs, ["frame_counter"] = frame, ["preset"] = Preset, ["run_mode"] = RunMode,
                ["imu"] = new JObject { ["valid"] = true, ["accel_g"] = new JArray(0, 0, 1), ["gyro_dps"] = new JArray(0, 0, 0) },
                ["mass"] = new JObject { ["pos_norm"] = new JArray(.25, -.1), ["vel_norm_s"] = new JArray(.1, -.02), ["fill"] = fill, ["energy"] = .12 },
                ["audio"] = new JObject { ["runtime_enabled"] = false, ["output_silenced"] = true },
                ["safety"] = new JObject { ["imu_stale_safe_stop"] = false, ["tilt_disarmed"] = true, ["audio_zero_asserted"] = true },
                ["tilt_servo"] = new JObject { ["state"] = 0, ["fault"] = 0, ["devices"] = new JArray(
                    new JObject { ["id"] = 1, ["status_valid"] = false, ["torque_enabled"] = false },
                    new JObject { ["id"] = 2, ["status_valid"] = false, ["torque_enabled"] = false }) },
                ["last_event"] = new JObject { ["type"] = "None", ["primary_wall"] = "None", ["amplitude"] = 0 },
                ["actuators"] = new JArray(0, 0, 0, 0), ["evt_total"] = 0, ["new_evt"] = 0,
                ["resolved"] = new JObject { ["family"] = water ? "Liquid" : heartbeat ? "Custom" : "Granular", ["container"] = new JObject {
                    ["span_x_m"] = heartbeat ? .065 : water || sand ? .060 : .050,
                    ["span_y_m"] = heartbeat ? .085 : water || sand ? .060 : .050,
                    ["span_z_m"] = heartbeat ? .050 : water ? .060 : sand ? .040 : .050, ["fill"] = fill,
                    ["headspace"] = 1 - fill, ["viscosity"] = water || heartbeat ? .30 : sand ? .08 : .01,
                    ["particle_count"] = sand ? .90 : water || heartbeat ? 0 : .03,
                    ["particle_hardness"] = sand ? .35 : water || heartbeat ? 0 : 1 },
                    ["model"] = new JObject { ["coherent_container_demo"] = true, ["device_frame_transform"] = true } }
            };
        }
    }
}
