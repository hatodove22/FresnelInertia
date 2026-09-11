using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace Fresnel.UnityDemo.Link
{
    /// <summary>Deterministic parser, sequencing and fault regressions; never enumerates or opens hardware.</summary>
    public static class ProtocolRegression
    {
        public sealed class Report
        {
            public int Passed;
            public readonly List<string> Checks = new List<string>();
            public override string ToString() => $"Haptic Link: {Passed}/{Passed} software checks PASS (mock transport, no hardware)";
        }
        sealed class TestClock { public double Now; }
        sealed class Fixture : IDisposable
        {
            public readonly TestClock Clock = new TestClock();
            public readonly MockHapticTransport Transport = new MockHapticTransport();
            public readonly HapticLinkClient Client;
            public Fixture()
            {
                Client = new HapticLinkClient(new HapticLinkOptions { AutomaticTimer = false, MonotonicMilliseconds = () => Clock.Now,
                    CommandTimeoutMs = 200, StaleAfterMs = 1000, DiscoveryTimeoutMs = 300, DiscoveryRetryIntervalMs = 1 });
                Await(Client.ConnectAsync(Transport, "mock"));
            }
            public void Dispose() { Await(Client.DisconnectAsync()); Client.Dispose(); }
        }
        static void Await(Task task)
        {
            if (!SpinWait.SpinUntil(() => task.IsCompleted, 5000)) throw new Exception("Regression task did not settle");
            task.GetAwaiter().GetResult();
        }
        static T Await<T>(Task<T> task) { Await((Task)task); return task.GetAwaiter().GetResult(); }
        static void Until(Func<bool> condition)
        { if (!SpinWait.SpinUntil(condition, 5000)) throw new Exception("Regression condition did not settle"); }
        static void Fails(Task task, string code)
        {
            try { Await(task); } catch (HapticLinkException ex) when (ex.Code == code) { return; }
            throw new Exception("Expected Haptic Link error " + code);
        }
        static void Check(Report report, bool condition, string label)
        { if (!condition) throw new Exception("Haptic Link regression: " + label); report.Passed++; report.Checks.Add(label); }

        public static Report Run()
        {
            var report = new Report();
            var mock = new MockHapticTransport();
            var snapshot = mock.CreateSnapshot();
            Check(report, HapticLinkProtocol.Parse(snapshot.ToString(Formatting.None)).Kind == BridgeLineKind.Telemetry, "v3 resolved snapshot accepted");
            var legacy = (JObject)snapshot.DeepClone(); legacy.Remove("resolved"); legacy.Remove("tilt_servo");
            Check(report, HapticLinkProtocol.Parse(legacy.ToString(Formatting.None)).Kind == BridgeLineKind.Telemetry, "v1 legacy missing capabilities accepted without guessing");
            var v4 = (JObject)snapshot.DeepClone();
            v4["mass"]["demo"] = JObject.Parse(@"{'pile_slope':0.2,'granular_flow':0.5,'granular_pile_active':true,'pressure':{'enabled':false,'phase':'sealed','charge':0.4,'phase_s':0,'remaining':1,'burst_sequence':0}}");
            Check(report, HapticLinkProtocol.Parse(v4.ToString(Formatting.None)).Kind == BridgeLineKind.Telemetry, "v4 sand/pressure snapshot accepted");
            var v5 = (JObject)snapshot.DeepClone();
            v5["mass"]["heartbeat"] = JObject.Parse(@"{'enabled':true,'phase':0.25,'primary':0.8,'secondary':0.2,'contraction':0.7,'bpm':72,'beat_sequence':12}");
            v5["last_event"]["type"] = "HeartbeatPulse";
            Check(report, HapticLinkProtocol.Parse(v5.ToString(Formatting.None)).Kind == BridgeLineKind.Telemetry, "v5 named shared heartbeat accepted");
            v5["mass"]["heartbeat"]["phase"] = 1;
            Check(report, HapticLinkProtocol.Parse(v5.ToString(Formatting.None)).Kind == BridgeLineKind.Diagnostic, "out-of-range heartbeat rejected");
            var bad = (JObject)snapshot.DeepClone(); bad["imu"]["accel_g"] = new JArray(0, 1);
            Check(report, HapticLinkProtocol.Parse(bad.ToString(Formatting.None)).Kind == BridgeLineKind.Diagnostic, "malformed vector rejected");
            bad = (JObject)snapshot.DeepClone(); bad["resolved"]["family"] = "granular";
            Check(report, HapticLinkProtocol.Parse(bad.ToString(Formatting.None)).Kind == BridgeLineKind.Diagnostic, "noncanonical material-family casing rejected");
            bad = (JObject)snapshot.DeepClone(); bad["resolved"]["container"]["particle_count"] = 180;
            Check(report, HapticLinkProtocol.Parse(bad.ToString(Formatting.None)).Kind == BridgeLineKind.Diagnostic, "literal visual particle count rejected from normalized parameter");
            bad = (JObject)snapshot.DeepClone(); bad["resolved"]["container"]["span_y_m"] = 0;
            Check(report, HapticLinkProtocol.Parse(bad.ToString(Formatting.None)).Kind == BridgeLineKind.Diagnostic, "zero resolved geometry span rejected");
            bad = (JObject)snapshot.DeepClone(); ((JObject)bad["resolved"]["model"]).Remove("device_frame_transform");
            Check(report, HapticLinkProtocol.Parse(bad.ToString(Formatting.None)).Kind == BridgeLineKind.Diagnostic, "incomplete v3 resolved model rejected");
            bad = (JObject)snapshot.DeepClone(); bad["mass"]["energy"] = double.NaN;
            Check(report, HapticLinkProtocol.Parse(bad.ToString(Formatting.None, new JsonConverter[0]).Replace("\"NaN\"", "NaN")).Kind == BridgeLineKind.Diagnostic, "nonfinite extension rejected");
            Check(report, HapticLinkProtocol.Parse("{\"timestamp_ms\":").Kind == BridgeLineKind.Diagnostic, "malformed JSON ignored");
            Check(report, HapticLinkProtocol.Parse("haptic_link_ack: request=4294967296 result=applied session=ABCD frame=1 detail=ok").Kind == BridgeLineKind.Diagnostic, "oversized request ID rejected");

            using (var f = new Fixture())
            {
                Check(report, f.Client.Connected && f.Client.Paired && f.Client.Stale, "connection shows observation state with no telemetry");
                Check(report, f.Transport.Commands.SequenceEqual(new[] { "status" }), "connection sends no preset, Live or enable command");
                string ndjson = snapshot.ToString(Formatting.None) + "\r\n";
                f.Transport.Emit("startup diagnostic\n" + ndjson.Substring(0, 17));
                Check(report, f.Client.Snapshot == null, "partial line does not publish state");
                f.Transport.Emit(ndjson.Substring(17));
                Check(report, !f.Client.Stale && f.Client.Snapshot["mass"]["pos_norm"][0].Value<double>() == .25, "fragmented mixed-line telemetry published");
                var detached = f.Client.Snapshot; detached["preset"] = "corrupted";
                Check(report, f.Client.Snapshot["preset"].Value<string>() != "corrupted", "snapshot getter protects shared state");
                long revision = f.Client.SnapshotRevision;
                f.Clock.Now = 1001; f.Transport.Emit(ndjson);
                Check(report, f.Client.Stale && f.Client.SnapshotRevision == revision + 1, "duplicate configuration snapshot updates revision without refreshing old motion");
                f.Transport.EmitSnapshot(f.Transport.CreateSnapshot(2, 200));
                Check(report, !f.Client.Stale, "new source sample recovers freshness");
                f.Transport.Emit(new string('x', HapticLinkProtocol.MaximumLineLength + 100));
                f.Transport.Emit(ndjson); // completes discarded oversize line; embedded JSON must not be parsed
                Check(report, f.Client.Snapshot["frame_counter"].Value<int>() == 2, "oversize fragments discard complete line");
                f.Transport.Emit(ndjson);
                Check(report, f.Client.Snapshot["frame_counter"].Value<int>() == 1, "framing recovers after oversized line");
                f.Transport.AutoAcknowledge = false;
                var get = f.Client.GetStateAsync();
                uint request = f.Transport.LastRequest;
                f.Transport.EmitSnapshot(f.Transport.CreateSnapshot(3, 300));
                Check(report, !get.IsCompleted, "telemetry does not count as execution ACK");
                f.Transport.EmitAck(request + 1);
                f.Transport.EmitAck(request, session: "DEADBEEF");
                Check(report, !get.IsCompleted, "wrong request and old-session ACK cannot complete command");
                f.Transport.EmitAck(request);
                Check(report, Await(get).Applied, "exact request/session execution ACK completes command");
                var timeout = f.Client.SetParamAsync("mass.damping_ratio_x", .2f);
                f.Clock.Now += 201; f.Client.Tick(); Fails(timeout, "timeout");
                Check(report, f.Client.Error.Contains("No execution ACK"), "monotonic command timeout exposes error");
                uint retiredRequest = f.Transport.LastRequest;
                var following = f.Client.SetParamAsync("mass.damping_ratio_x", .3f);
                f.Transport.EmitAck(retiredRequest);
                Check(report, !following.IsCompleted, "late ACK cannot complete following command");
                f.Transport.EmitAck(f.Transport.LastRequest); Await(following);
            }
            using (var f = new Fixture())
            {
                int attempts = 0;
                f.Transport.OnWrite = (transport, command) =>
                {
                    if (command == "get state" && ++attempts < 3)
                    { f.Clock.Now += 20; transport.Emit("haptic_link: command rejected; AtomS3 source not discovered\n"); }
                    else transport.Respond(command);
                };
                Check(report, Await(f.Client.GetStateAsync()).Applied && attempts == 3, "bounded discovery retries local pairing readiness rejection");
            }
            using (var f = new Fixture())
            {
                int attempts = 0;
                f.Transport.OnWrite = (transport, command) =>
                {
                    if (command == "get state" && ++attempts == 1)
                    {
                        transport.AutoAcknowledge = false; transport.Respond(command);
                        transport.EmitAck(transport.LastRequest, "bad_session", "source restarted", "00000000");
                        transport.AutoAcknowledge = true; transport.Session = "BEEF1234";
                    }
                    else transport.Respond(command);
                };
                Check(report, Await(f.Client.GetStateAsync()).Session == "BEEF1234" && f.Client.Paired,
                    "explicit zero-session rejection recovers through new discovery execution ACK");
            }
            using (var f = new Fixture())
            {
                f.Transport.AutoAcknowledge = false;
                var start = f.Client.StartAsync(true, true);
                var stop = f.Client.StopAsync();
                Check(report, !f.Transport.Commands.Contains("stop"), "Stop respects single bridge in-flight request");
                f.Transport.EmitAck(f.Transport.LastRequest);
                Until(() => f.Transport.Commands.Contains("stop"));
                f.Transport.EmitAck(f.Transport.LastRequest);
                Await(stop); Fails(start, "cancelled");
                Check(report, !f.Transport.Commands.Contains("audio on") && !f.Transport.Commands.Contains("tilt on"), "Stop supersedes remaining Start steps");
            }
            using (var f = new Fixture())
            {
                f.Transport.RejectCommand = "tilt on";
                Fails(f.Client.StartAsync(true, true), "rejected");
                Check(report, f.Transport.Commands.SequenceEqual(new[] { "status", "live", "audio on", "tilt on", "stop" }), "partial Start rejection executes cleanup Stop");
            }
            using (var f = new Fixture())
            {
                Await(f.Client.LoadPresetAsync("liquid_small_box"));
                Check(report, f.Transport.Commands.SequenceEqual(new[] { "status", "stop", "preset load liquid_small_box", "get state" }), "preset change stops and confirms without auto Start");
                int before = f.Transport.Commands.Length;
                try { Await(f.Client.LoadPresetAsync("water\nlive")); throw new Exception("Invalid preset accepted"); } catch (ArgumentException) { }
                Check(report, f.Transport.Commands.Length == before, "preset injection rejected before IO");
            }
            using (var f = new Fixture())
            {
                var gains = Profile();
                var acks = Await(f.Client.ApplyTuningAsync("liquid_small_box", gains));
                Check(report, acks.Length == 11 && acks.All(ack => ack.Applied), "profile uses eleven execution ACKs");
                Check(report, f.Transport.Commands[1] == "stop" && f.Transport.Commands[2] == "get state" &&
                    f.Transport.Commands.Last() == "get state" && !f.Transport.Commands.Contains("live"), "profile probes and verifies applied tilt gains without Start");
                int before = f.Transport.Commands.Length; gains["mass.damping_ratio_y"] = .4;
                try { Await(f.Client.ApplyTuningAsync("liquid_small_box", gains)); throw new Exception("Uncoupled profile accepted"); } catch (ArgumentException) { }
                Check(report, f.Transport.Commands.Length == before, "invalid full profile rejected before Stop or writes");
            }
            using (var f = new Fixture())
            {
                f.Transport.StateDetailOverride = "legacy_state";
                Fails(f.Client.ApplyTuningAsync("liquid_small_box", Profile()), "unsupported");
                Check(report, !f.Transport.Commands.Any(command => command.StartsWith("preset load") || command.StartsWith("set ")), "old firmware rejected before applying profile values");
            }
            using (var f = new Fixture())
            {
                f.Transport.AutoAcknowledge = false;
                var pending = f.Client.SetParamAsync("mass.damping_ratio_x", .2f);
                f.Transport.Emit("espnow_bridge: paired=1 session=DEADBEEF\n");
                Fails(pending, "rejected");
                Check(report, f.Client.Stale && f.Client.Snapshot == null, "new bridge session invalidates old sample and in-flight request");
            }
            using (var f = new Fixture())
            {
                f.Transport.AutoAcknowledge = false;
                var pending = f.Client.SetParamAsync("mass.damping_ratio_x", .2f);
                f.Transport.Fail("Mock cable removed"); Fails(pending, "disconnected");
                Check(report, !f.Client.Connected && f.Client.Stale && f.Client.Error == "Mock cable removed", "transport fault cancels command and marks observation stale");
                var next = new MockHapticTransport(); Await(f.Client.ConnectAsync(next, "mock2"));
                Check(report, next.Commands.SequenceEqual(new[] { "status" }) && f.Client.Snapshot == null, "reconnect clears previous state and never arms");
            }
            return report;
        }

        static Dictionary<string, double> Profile() => new Dictionary<string, double>
        {
            ["resonance.master_gain"] = .48, ["mass.damping_ratio_x"] = .35, ["mass.damping_ratio_y"] = .35,
            ["tilt.max_tilt_deg"] = 8, ["tilt.k_cm"] = .4, ["tilt.k_tau"] = .3, ["tilt.k_phi"] = 4
        };
    }
}
