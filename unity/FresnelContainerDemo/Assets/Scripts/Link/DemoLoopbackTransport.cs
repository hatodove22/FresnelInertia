using System;
using System.Diagnostics;
using System.Globalization;
using System.Threading;
using System.Threading.Tasks;
using Newtonsoft.Json.Linq;

namespace Fresnel.UnityDemo.Link
{
    /// <summary>
    /// Automated player-test bridge. Synthetic telemetry is explicitly separate from real device
    /// acquisition; the application must expose this only in its --studio-test verification mode.
    /// </summary>
    public sealed class DemoLoopbackTransport : IHapticTransport
    {
        readonly MockHapticTransport fixture = new MockHapticTransport();
        readonly object gate = new object();
        readonly Stopwatch clock = new Stopwatch();
        Timer timer;
        long frame;
        bool audio, tilt;
        double motionTime, previousTime;
        public event Action<string> Received;
        public event Action<string> Faulted;
        public bool IsOpen => fixture.IsOpen;
        public string[] Commands => fixture.Commands;
        public bool EmitTelemetry = true;

        public DemoLoopbackTransport()
        {
            fixture.Received += text => Received?.Invoke(text);
            fixture.Faulted += message => Faulted?.Invoke(message);
        }

        public async Task OpenAsync(string endpoint)
        {
            await fixture.OpenAsync(endpoint).ConfigureAwait(false);
            lock (gate)
            {
                frame = 0; previousTime = 0; motionTime = 0; audio = false; tilt = false;
                clock.Restart(); timer = new Timer(_ => Publish(), null, 0, 100);
            }
        }

        public async Task WriteAsync(string text)
        {
            string command = text.Trim();
            lock (gate)
            {
                if (command == "stop") { audio = false; tilt = false; }
                else if (command == "audio on") audio = true;
                else if (command == "audio off") audio = false;
                else if (command == "tilt on") tilt = true;
                else if (command == "tilt off") tilt = false;
            }
            await fixture.WriteAsync(text).ConfigureAwait(false);
            if (command != "status") Publish();
        }

        void Publish()
        {
            JObject state;
            lock (gate)
            {
                if (!fixture.IsOpen || !EmitTelemetry) return;
                double now = clock.Elapsed.TotalSeconds;
                if (fixture.RunMode == "live") motionTime += Math.Max(0, now - previousTime);
                previousTime = now;
                double position = Math.Sin(motionTime * 1.8) * .75;
                bool running = fixture.RunMode == "live";
                state = fixture.CreateSnapshot(++frame, (long)(now * 1000));
                state["mass"]["pos_norm"] = new JArray(position, Math.Sin(motionTime * .8) * .2);
                state["mass"]["vel_norm_s"] = new JArray(running ? Math.Cos(motionTime * 1.8) * 1.35 : 0, 0);
                state["mass"]["energy"] = running ? .2 + Math.Abs(position) * .4 : 0;
                state["imu"]["accel_g"] = new JArray(position * .22, 0, .98);
                state["audio"]["runtime_enabled"] = audio;
                state["audio"]["output_silenced"] = !running || !audio;
                state["safety"]["audio_zero_asserted"] = !running || !audio;
                state["safety"]["tilt_disarmed"] = !tilt;
                state["actuators"] = new JArray(running && audio ? .25 : 0, running && audio ? .1 : 0, 0, 0);
                state["tilt_servo"]["state"] = tilt ? 4 : 0;
                state["tilt_servo"]["status_age_ms"] = 0;
                var devices = new JArray();
                for (int i = 0; i < 2; ++i)
                {
                    int raw = 2048 + (tilt ? (int)(position * 80 * (i == 0 ? 1 : -1)) : 0);
                    devices.Add(new JObject { ["id"] = i + 1, ["status_valid"] = true, ["torque_enabled"] = tilt,
                        ["home_position_raw"] = 2048, ["goal_position_raw"] = raw, ["present_position_raw"] = raw,
                        ["hardware_error"] = 0, ["operating_mode"] = 3, ["present_current_ma"] = 0,
                        ["input_voltage_v"] = 5, ["temperature_c"] = 25 });
                }
                state["tilt_servo"]["devices"] = devices;
                bool water = fixture.Preset == "liquid_small_box";
                bool sand = fixture.Preset == "granular_sand_pile_box";
                bool heartbeat = fixture.Preset == "heartbeat_soft_object";
                // Canonical geometry/material parameters come from the fixture's chosen preset.
                // particle_count remains normalized (marble .03 / sand .90), never visual particle count.
                if (sand)
                {
                    state["mass"]["demo"] = new JObject { ["pile_slope"] = position * .4,
                        ["granular_flow"] = running ? .4 : 0, ["granular_pile_active"] = true,
                        ["pressure"] = new JObject { ["enabled"] = false, ["phase"] = "sealed", ["charge"] = 0,
                            ["phase_s"] = 0, ["remaining"] = 1, ["burst_sequence"] = 0 } };
                }
                if (heartbeat)
                {
                    double beats = motionTime * 72 / 60;
                    double phase = beats - Math.Floor(beats);
                    double primary = running ? Math.Exp(-Math.Pow((phase - .10) * 16, 2)) : 0;
                    double secondary = running ? Math.Exp(-Math.Pow((phase - .32) * 20, 2)) * .55 : 0;
                    state["mass"]["heartbeat"] = new JObject { ["enabled"] = true, ["phase"] = phase,
                        ["bpm"] = 72, ["beat_sequence"] = (long)Math.Floor(beats), ["primary"] = primary,
                        ["secondary"] = secondary, ["contraction"] = Math.Min(1, primary + secondary) };
                }
            }
            fixture.EmitSnapshot(state);
        }

        public void Fail(string message = "Loopback cable removed") => fixture.Fail(message);
        public async Task CloseAsync()
        {
            lock (gate) { timer?.Dispose(); timer = null; clock.Stop(); }
            await fixture.CloseAsync().ConfigureAwait(false);
        }
        public void Dispose() { lock (gate) { timer?.Dispose(); timer = null; } fixture.Dispose(); }
    }
}
