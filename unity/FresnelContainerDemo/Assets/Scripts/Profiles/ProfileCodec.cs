using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Text;
using System.Text.RegularExpressions;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace Fresnel.UnityDemo.Profiles
{
    /// <summary>A portable selected setting. It is not device readback, a Start authorization or tactile validation.</summary>
    [Serializable]
    public sealed class TuningProfile
    {
        public string format = ProfileCodec.Format;
        public ProfileSourceSession sourceSession;
        public string demo, preset, objective, reference, createdAt, reviewStatus;
        public int comparisonCount;
        public Dictionary<string, double> parameters;
    }

    [Serializable]
    public sealed class ProfileSourceSession
    {
        public string id, mode;
        public int version;
    }

    public static class ProfileCodec
    {
        public const string Format = "haptic-tuning-profile-v1";
        public const int MaxBytes = 16384;
        public static readonly string[] CommonPaths = { "resonance.master_gain", "tilt.max_tilt_deg", "tilt.k_cm", "tilt.k_tau", "tilt.k_phi" };
        private static readonly string[] ProfileKeys = { "format", "sourceSession", "demo", "preset", "objective", "reference", "createdAt", "comparisonCount", "reviewStatus", "parameters" };
        private static readonly string[] SourceKeys = { "id", "version", "mode" };

        public static string PresetFor(string demo)
        {
            switch (demo)
            {
                case "water": return "liquid_small_box";
                case "marble": return "granular_single_marble_box";
                case "sand": return "granular_sand_pile_box";
                default: throw Invalid("unsupported demo");
            }
        }

        public static string DemoForPreset(string preset)
        {
            foreach (string demo in new[] { "water", "marble", "sand" }) if (PresetFor(demo) == preset) return demo;
            throw Invalid("unsupported preset");
        }

        public static string ReviewStatus(string mode, int count)
        {
            if (mode != "device" && mode != "rehearsal") throw Invalid("unsupported source mode");
            return mode == "rehearsal" ? "rehearsal-only" : count == 0 ? "not-evaluated" : "self-reported-preference";
        }

        public static TuningProfile Parse(string json)
        {
            if (json == null || json.Length > MaxBytes || Encoding.UTF8.GetByteCount(json) > MaxBytes) throw Invalid("import exceeds 16 KiB");
            JObject raw;
            try
            {
                StrictJson.Check(json);
                using (var reader = new JsonTextReader(new StringReader(json)) { DateParseHandling = DateParseHandling.None, MaxDepth = 24 })
                    raw = JObject.Load(reader);
            }
            catch (Exception e) when (e is JsonException || e is FormatException || e is InvalidOperationException)
            { throw Invalid("malformed JSON"); }
            return FromObject(raw);
        }

        public static TuningProfile Validate(TuningProfile profile)
        {
            if (profile == null || profile.sourceSession == null || profile.parameters == null) throw Invalid("profile contains missing fields");
            // Construct only data fields: caller-owned dictionaries are never retained.
            var raw = new JObject {
                ["format"] = profile.format,
                ["sourceSession"] = new JObject { ["id"] = profile.sourceSession.id, ["version"] = profile.sourceSession.version, ["mode"] = profile.sourceSession.mode },
                ["demo"] = profile.demo, ["preset"] = profile.preset, ["objective"] = profile.objective, ["reference"] = profile.reference,
                ["createdAt"] = profile.createdAt, ["comparisonCount"] = profile.comparisonCount, ["reviewStatus"] = profile.reviewStatus,
                ["parameters"] = JObject.FromObject(profile.parameters)
            };
            return FromObject(raw);
        }

        public static string Serialize(TuningProfile profile)
        {
            var result = JsonConvert.SerializeObject(Validate(profile), Formatting.Indented);
            if (Encoding.UTF8.GetByteCount(result) > MaxBytes) throw Invalid("export exceeds 16 KiB");
            return result;
        }

        public static Dictionary<string, double> ValidateParameters(IReadOnlyDictionary<string, double> values, string demo, bool requireCoupled = true)
        {
            PresetFor(demo);
            string first = demo == "sand" ? "mass.granular_static_friction" : "mass.damping_ratio_x";
            string second = demo == "sand" ? "mass.granular_dynamic_friction" : "mass.damping_ratio_y";
            var paths = new[] { CommonPaths[0], first, second, CommonPaths[1], CommonPaths[2], CommonPaths[3], CommonPaths[4] };
            double scale = demo == "sand" ? 7.0 / 11.0 : 1;
            double materialMin = demo == "sand" ? .2 : .05, materialMax = demo == "sand" ? .9 : 1.5;
            var minimum = new[] { .1, materialMin, materialMin * scale, 0, 0, 0, 0 };
            var maximum = new[] { 1, materialMax, materialMax * scale, 10, 1, 1, 8 };
            if (values == null || values.Count != paths.Length || values.Keys.Any(key => !paths.Contains(key))) throw Invalid("parameters contains missing or unknown fields");
            var result = new Dictionary<string, double>(StringComparer.Ordinal);
            for (int i = 0; i < paths.Length; ++i)
            {
                if (!values.TryGetValue(paths[i], out double n) || double.IsNaN(n) || double.IsInfinity(n) || n < minimum[i] || n > maximum[i] || (i == 6 && n == 0))
                    throw Invalid("parameter " + paths[i] + " is outside its bounds");
                result.Add(paths[i], n);
            }
            double expected = result[first] * scale;
            if (requireCoupled && Math.Abs(result[second] - expected) > Math.Max(1e-9, Math.Abs(expected) * 1e-9))
                throw Invalid("parameter " + second + " disagrees with the coupled material axis");
            return result;
        }

        /// <summary>Exact same-demo reuse; explicit cross-demo transfer retains the independently obtained target material pair.</summary>
        public static Dictionary<string, double> ParametersFor(TuningProfile profile, string targetDemo, IReadOnlyDictionary<string, double> targetBaseline)
        {
            var source = Validate(profile);
            var target = ValidateParameters(targetBaseline, targetDemo, false);
            if (source.demo == targetDemo) return new Dictionary<string, double>(source.parameters);
            foreach (string key in CommonPaths) target[key] = source.parameters[key];
            return target;
        }

        /// <summary>Explicit compiled assembled-device defaults, audited against Parameters.hpp + HardwareProfiles.hpp.
        /// Not a backup of device settings: preset overlays and preserved session tilt may differ.</summary>
        public static Dictionary<string, double> ShippedBaselineValues(string demo)
        {
            PresetFor(demo);
            var p = new Dictionary<string, double> {
                ["resonance.master_gain"] = demo == "marble" ? .62 : .48,
                ["tilt.max_tilt_deg"] = 10, ["tilt.k_cm"] = .35, ["tilt.k_tau"] = .25, ["tilt.k_phi"] = 4
            };
            if (demo == "sand") { p["mass.granular_static_friction"] = .55; p["mass.granular_dynamic_friction"] = .35; }
            else { p["mass.damping_ratio_x"] = .35; p["mass.damping_ratio_y"] = .35; }
            return ValidateParameters(p, demo, false);
        }

        public static TuningProfile ShippedBaselineProfile(string demo)
        {
            return CreateSelection(demo, ShippedBaselineValues(demo), "rehearsal", "Compiled assembled baseline",
                "Parameters.hpp + HardwareProfiles.hpp; authored defaults, not a backup or measured readback");
        }

        /// <summary>New authored selection with zero judgments; imported session history is never invented.</summary>
        public static TuningProfile CreateSelection(string demo, IReadOnlyDictionary<string, double> values, string mode = "rehearsal", string objective = "Unity selected setting", string reference = "")
        {
            return Validate(new TuningProfile {
                sourceSession = new ProfileSourceSession { id = "unity-" + Guid.NewGuid().ToString("N"), version = 3, mode = mode },
                demo = demo, preset = PresetFor(demo), objective = objective, reference = reference,
                createdAt = DateTime.UtcNow.ToString("yyyy-MM-dd'T'HH:mm:ss.fff'Z'", CultureInfo.InvariantCulture),
                comparisonCount = 0, reviewStatus = ReviewStatus(mode, 0), parameters = ValidateParameters(values, demo)
            });
        }

        private static TuningProfile FromObject(JObject raw)
        {
            ExactKeys(raw, ProfileKeys, "profile");
            if (Text(raw["format"], "format") != Format) throw Invalid("unsupported format");
            var source = raw["sourceSession"] as JObject;
            ExactKeys(source, SourceKeys, "sourceSession");
            string id = Text(source["id"], "sourceSession.id", 96);
            if (!Regex.IsMatch(id, @"\A[a-zA-Z0-9][a-zA-Z0-9_-]{1,95}\z")) throw Invalid("invalid source session id");
            int version = Integer(source["version"], "source version", 2, 3);
            string mode = Text(source["mode"], "source mode");
            string demo = Text(raw["demo"], "demo"), preset = Text(raw["preset"], "preset", 96);
            if (preset != PresetFor(demo)) throw Invalid("demo and preset disagree");
            if (version == 2 && demo != "water") throw Invalid("v2 source sessions only describe water");
            string created = Text(raw["createdAt"], "createdAt", 24);
            if (!CanonicalDate(created)) throw Invalid("createdAt must be a canonical ISO date");
            int count = Integer(raw["comparisonCount"], "comparisonCount", 0, 60);
            string review = ReviewStatus(mode, count);
            if (Text(raw["reviewStatus"], "reviewStatus") != review) throw Invalid("reviewStatus disagrees with source mode or comparisonCount");
            if (!(raw["parameters"] is JObject data)) throw Invalid("parameters must be a plain object");
            var parameters = new Dictionary<string, double>(StringComparer.Ordinal);
            foreach (var property in data.Properties())
            {
                if (property.Value.Type != JTokenType.Float && property.Value.Type != JTokenType.Integer) throw Invalid("parameter " + property.Name + " is outside its bounds");
                parameters[property.Name] = property.Value.Value<double>();
            }
            return new TuningProfile {
                sourceSession = new ProfileSourceSession { id = id, mode = mode, version = version }, demo = demo, preset = preset,
                createdAt = created, comparisonCount = count, reviewStatus = review,
                objective = Text(raw["objective"], "objective"), reference = Text(raw["reference"], "reference"),
                parameters = ValidateParameters(parameters, demo)
            };
        }

        private static void ExactKeys(JObject obj, string[] keys, string label)
        {
            if (obj == null) throw Invalid(label + " must be a plain object");
            if (obj.Count != keys.Length || obj.Properties().Any(p => !keys.Contains(p.Name))) throw Invalid(label + " contains missing or unknown fields");
        }
        private static string Text(JToken token, string label, int max = 300)
        {
            if (token == null || token.Type != JTokenType.String || token.Value<string>().Length > max) throw Invalid(label + " is not bounded text");
            return token.Value<string>();
        }
        private static int Integer(JToken token, string label, int min, int max)
        {
            if (token == null || (token.Type != JTokenType.Integer && token.Type != JTokenType.Float)) throw Invalid(label + " is outside its bounds");
            double value = token.Value<double>();
            if (double.IsNaN(value) || value < min || value > max || Math.Floor(value) != value) throw Invalid(label + " is outside its bounds");
            return (int)value;
        }
        private static bool CanonicalDate(string text)
        {
            // JS Date supports year 0000; DateTime does not. Validate the canonical 24-character calendar representation directly.
            var m = Regex.Match(text, @"\A([0-9]{4})-([0-9]{2})-([0-9]{2})T([0-9]{2}):([0-9]{2}):([0-9]{2})\.([0-9]{3})Z\z");
            if (!m.Success) return false;
            int y = int.Parse(m.Groups[1].Value), month = int.Parse(m.Groups[2].Value), day = int.Parse(m.Groups[3].Value);
            if (month < 1 || month > 12 || int.Parse(m.Groups[4].Value) > 23 || int.Parse(m.Groups[5].Value) > 59 || int.Parse(m.Groups[6].Value) > 59) return false;
            int[] days = { 31, y % 4 == 0 && (y % 100 != 0 || y % 400 == 0) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31 };
            return day >= 1 && day <= days[month - 1];
        }
        private static FormatException Invalid(string message) => new FormatException("Invalid tuning profile: " + message);

        // Json.NET intentionally accepts JavaScript extensions. A bounded syntax gate retains JSON.parse's import grammar;
        // object/value decoding remains owned by Json.NET (including JSON's last-duplicate-key behavior).
        private sealed class StrictJson
        {
            private readonly string text; private int at;
            private StrictJson(string text) { this.text = text; }
            public static void Check(string text) { var reader = new StrictJson(text); reader.Value(0); reader.White(); if (reader.at != text.Length) throw new FormatException(); }
            private void White() { while (at < text.Length && (text[at] == ' ' || text[at] == '\r' || text[at] == '\n' || text[at] == '\t')) ++at; }
            private void Value(int depth)
            {
                White(); if (depth > 24 || at >= text.Length) throw new FormatException();
                char c = text[at];
                if (c == '"') { Quoted(); return; }
                if (c == '{' || c == '[')
                {
                    bool obj = c == '{'; char close = obj ? '}' : ']'; ++at; White();
                    if (Take(close)) return;
                    do { if (obj) { White(); Quoted(); White(); Need(':'); } Value(depth + 1); White(); if (Take(close)) return; Need(','); } while (true);
                }
                foreach (string token in new[] { "true", "false", "null" })
                    if (at + token.Length <= text.Length && string.CompareOrdinal(text, at, token, 0, token.Length) == 0) { at += token.Length; return; }
                Take('-'); if (!Take('0')) Digits(true); if (Take('.')) Digits(true); if (Take('e') || Take('E')) { if (!Take('+')) Take('-'); Digits(true); }
            }
            private void Digits(bool required) { int start = at; while (at < text.Length && text[at] >= '0' && text[at] <= '9') ++at; if (required && start == at) throw new FormatException(); }
            private void Quoted()
            {
                Need('"'); while (at < text.Length) {
                    char c = text[at++]; if (c == '"') return; if (c < 32) throw new FormatException(); if (c != '\\') continue;
                    if (at >= text.Length) throw new FormatException(); c = text[at++];
                    if (c == 'u') { for (int i = 0; i < 4; i++) { if (at >= text.Length || !Uri.IsHexDigit(text[at++])) throw new FormatException(); } }
                    else if ("\"\\/bfnrt".IndexOf(c) < 0) throw new FormatException();
                } throw new FormatException();
            }
            private bool Take(char c) { if (at < text.Length && text[at] == c) { ++at; return true; } return false; }
            private void Need(char c) { if (!Take(c)) throw new FormatException(); }
        }
    }
}
