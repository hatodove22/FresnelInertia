using System;
using System.Globalization;
using System.IO;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace Fresnel.UnityDemo.Link
{
    /// <summary>Decoded UTF-8 fragments; boundaries need not coincide with lines.</summary>
    public interface IHapticTransport : IDisposable
    {
        event Action<string> Received;
        event Action<string> Faulted;
        bool IsOpen { get; }
        Task OpenAsync(string endpoint);
        Task WriteAsync(string text);
        Task CloseAsync();
    }

    public sealed class CommandAck
    {
        public uint RequestId { get; }
        public string Result { get; }
        public string Session { get; }
        public ulong Frame { get; }
        public string Detail { get; }
        public bool Applied => Result == "applied";
        public CommandAck(uint requestId, string result, string session, ulong frame, string detail)
        { RequestId = requestId; Result = result; Session = session; Frame = frame; Detail = detail; }
        public override string ToString() => $"{Result}: {Detail} (request {RequestId}, frame {Frame})";
    }

    public sealed class HapticLinkException : Exception
    {
        public string Code { get; }
        public HapticLinkException(string code, string message) : base(message) { Code = code; }
    }

    /// <summary>A detached point-in-time view. Snapshot can be edited without modifying client state.</summary>
    public sealed class HapticLinkState
    {
        public bool Connected { get; internal set; }
        public bool Connecting { get; internal set; }
        public bool Paired { get; internal set; }
        public bool Stale { get; internal set; }
        public string PendingCommand { get; internal set; }
        public string Error { get; internal set; }
        public CommandAck LastAck { get; internal set; }
        public JObject Snapshot { get; internal set; }
        public long SnapshotRevision { get; internal set; }
        /// <summary>Seconds since a new motion sample was received; infinity before first telemetry.</summary>
        public double LastTelemetryAge { get; internal set; }
    }

    public sealed class HapticLinkOptions
    {
        public int CommandTimeoutMs = 2200;
        public int StaleAfterMs = 1000;
        public int DiscoveryTimeoutMs = 3500;
        public int DiscoveryRetryIntervalMs = 150;
        /// <summary>Optional monotonic milliseconds provider for deterministic verification.</summary>
        public Func<double> MonotonicMilliseconds;
        public bool AutomaticTimer = true;
    }

    public enum BridgeLineKind { Diagnostic, Telemetry, Tx, Ack, Status, Error }
    public sealed class BridgeLine
    {
        public BridgeLineKind Kind;
        public JObject Snapshot;
        public uint RequestId;
        public bool HasRequestId;
        public int Operation;
        public CommandAck Ack;
        public bool Paired;
        public string Session;
        public string Message;
    }

    /// <summary>The existing StampC5 text contract. Unknown snapshot fields are preserved.</summary>
    public static class HapticLinkProtocol
    {
        public const int MaximumLineLength = 16384;
        static readonly Regex Tx = new Regex(@"^haptic_link_tx:\s+request=(\d+)\s+operation=(\d+)$");
        static readonly Regex Ack = new Regex(@"^haptic_link_ack:\s+request=(\d+)\s+result=(\S+)\s+session=([0-9A-Fa-f]{1,8})\s+frame=(\d+)\s+detail=(.*)$");
        static readonly Regex Paired = new Regex(@"\bpaired=([01])\b");
        static readonly Regex Session = new Regex(@"\bsession=([0-9A-Fa-f]{1,8})\b");
        static readonly Regex Request = new Regex(@"\brequest=(\d+)\b");
        static readonly Regex Error = new Regex(@"^haptic_link:\s+(?:command rejected|command send failed|timeout|invalid|set syntax)");

        public static BridgeLine Parse(string raw)
        {
            var result = new BridgeLine { Kind = BridgeLineKind.Diagnostic };
            if (raw == null || raw.Length > MaximumLineLength) return result;
            string line = raw.Trim();
            if (line.StartsWith("{", StringComparison.Ordinal))
            {
                try
                {
                    using (var reader = new JsonTextReader(new StringReader(line)) { MaxDepth = 32, DateParseHandling = DateParseHandling.None })
                    {
                        var snapshot = JObject.Load(reader);
                        if (reader.Read()) return result;
                        if (!ValidSnapshot(snapshot)) return result;
                        result.Kind = BridgeLineKind.Telemetry;
                        result.Snapshot = snapshot;
                    }
                }
                catch (Exception ex) when (ex is JsonException || ex is InvalidOperationException || ex is ArgumentException ||
                    ex is FormatException || ex is OverflowException || ex is InvalidCastException) { }
                return result;
            }
            var match = Tx.Match(line);
            if (match.Success && uint.TryParse(match.Groups[1].Value, out uint request) &&
                int.TryParse(match.Groups[2].Value, out int operation))
            {
                result.Kind = BridgeLineKind.Tx; result.RequestId = request;
                result.HasRequestId = true; result.Operation = operation; return result;
            }
            match = Ack.Match(line);
            if (match.Success && uint.TryParse(match.Groups[1].Value, out request) &&
                ulong.TryParse(match.Groups[4].Value, out ulong frame))
            {
                result.Kind = BridgeLineKind.Ack;
                result.Ack = new CommandAck(request, match.Groups[2].Value,
                    NormalizeSession(match.Groups[3].Value), frame, match.Groups[5].Value);
                return result;
            }
            if (line.StartsWith("espnow_bridge:", StringComparison.Ordinal))
            {
                match = Paired.Match(line);
                if (!match.Success) return result;
                result.Kind = BridgeLineKind.Status; result.Paired = match.Groups[1].Value == "1";
                match = Session.Match(line);
                result.Session = match.Success ? NormalizeSession(match.Groups[1].Value) : null;
                return result;
            }
            if (Error.IsMatch(line))
            {
                result.Kind = BridgeLineKind.Error; result.Message = line;
                match = Request.Match(line);
                if (match.Success && uint.TryParse(match.Groups[1].Value, out request))
                { result.RequestId = request; result.HasRequestId = true; }
            }
            return result;
        }

        static string NormalizeSession(string session) => uint.Parse(session, NumberStyles.HexNumber, CultureInfo.InvariantCulture).ToString("X8");
        static bool Number(JToken token) => token != null && (token.Type == JTokenType.Float || token.Type == JTokenType.Integer) &&
            !double.IsNaN(token.Value<double>()) && !double.IsInfinity(token.Value<double>());
        static bool Unit(JToken token) => Number(token) && token.Value<double>() >= 0 && token.Value<double>() <= 1;
        static bool Boolean(JToken token) => token != null && token.Type == JTokenType.Boolean;
        static bool UnsignedInteger(JToken token, double maximum) => Number(token) && token.Value<double>() >= 0 &&
            token.Value<double>() <= maximum && Math.Floor(token.Value<double>()) == token.Value<double>();
        static bool Vector(JToken token, int length)
        {
            if (!(token is JArray array) || array.Count != length) return false;
            foreach (var element in array) if (!Number(element)) return false;
            return true;
        }
        static bool OptionalVector(JObject group, string field, int length) => group?[field] == null || Vector(group[field], length);
        static bool ObjectOrMissing(JObject obj, string name) => obj[name] == null || obj[name] is JObject;

        public static bool ValidSnapshot(JObject value)
        {
            if (!UnsignedInteger(value["timestamp_ms"], ulong.MaxValue) || !UnsignedInteger(value["frame_counter"], ulong.MaxValue) ||
                value["preset"]?.Type != JTokenType.String || value["run_mode"]?.Type != JTokenType.String) return false;
            foreach (string group in new[] { "imu", "mass", "audio", "safety", "tilt_servo", "last_event", "resolved" })
                if (!ObjectOrMissing(value, group)) return false;
            var imu = value["imu"] as JObject;
            var mass = value["mass"] as JObject;
            if (!OptionalVector(imu, "accel_g", 3) || !OptionalVector(imu, "gyro_dps", 3) ||
                !OptionalVector(mass, "pos_norm", 2) || !OptionalVector(mass, "vel_norm_s", 2)) return false;
            if (value["actuators"] != null && !Vector(value["actuators"], 4)) return false;
            if (mass?["demo"] != null)
            {
                if (!(mass["demo"] is JObject demo) || !Number(demo["pile_slope"]) || !Unit(demo["granular_flow"]) ||
                    !Boolean(demo["granular_pile_active"]) || !(demo["pressure"] is JObject pressure)) return false;
                string phase = pressure["phase"]?.Type == JTokenType.String ? pressure["phase"].Value<string>() : "";
                if (!Boolean(pressure["enabled"]) || (phase != "sealed" && phase != "burst" && phase != "spent") ||
                    !Unit(pressure["charge"]) || !Unit(pressure["remaining"]) || !Number(pressure["phase_s"]) ||
                    pressure["phase_s"].Value<double>() < 0 || !UnsignedInteger(pressure["burst_sequence"], 65535)) return false;
            }
            if (mass?["heartbeat"] != null)
            {
                if (!(mass["heartbeat"] is JObject heartbeat) || !Boolean(heartbeat["enabled"]) || !heartbeat["enabled"].Value<bool>() ||
                    !Unit(heartbeat["phase"]) || heartbeat["phase"].Value<double>() >= 1 || !Unit(heartbeat["primary"]) ||
                    !Unit(heartbeat["secondary"]) || !Unit(heartbeat["contraction"]) || !Number(heartbeat["bpm"]) ||
                    heartbeat["bpm"].Value<double>() < 40 || heartbeat["bpm"].Value<double>() > 140 ||
                    !UnsignedInteger(heartbeat["beat_sequence"], uint.MaxValue)) return false;
            }
            if (value["last_event"]?["type"]?.Value<string>() == "HeartbeatPulse" &&
                (!(mass?["heartbeat"] is JObject) || value["last_event"]?["primary_wall"]?.Value<string>() != "None")) return false;
            if (value["resolved"] is JObject resolved)
            {
                // Wire v1/v2 omit resolved entirely; v3+ supply this complete canonical group.
                // In particular particle_count is a normalized material parameter, not a count.
                if (resolved["family"]?.Type != JTokenType.String || !(resolved["container"] is JObject container) ||
                    !(resolved["model"] is JObject model)) return false;
                string family = resolved["family"].Value<string>();
                if (family != "Liquid" && family != "Granular" && family != "Hybrid" && family != "Detented" && family != "Custom") return false;
                foreach (string key in new[] { "span_x_m", "span_y_m", "span_z_m" })
                    if (!Number(container[key]) || container[key].Value<double>() <= 0) return false;
                foreach (string key in new[] { "fill", "headspace", "viscosity", "particle_count", "particle_hardness" })
                    if (!Unit(container[key])) return false;
                foreach (string key in new[] { "coherent_container_demo", "device_frame_transform" })
                    if (!Boolean(model[key])) return false;
            }
            // NaN/Infinity accepted by Json.NET are never valid device observations, even in extension fields.
            foreach (var descendant in value.Descendants())
                if (descendant is JValue scalar && (scalar.Type == JTokenType.Float || scalar.Type == JTokenType.Integer) && !Number(scalar)) return false;
            return true;
        }
    }
}
