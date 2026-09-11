using System;
using System.IO;
using System.Linq;
using System.Text;
using System.Text.RegularExpressions;
using UnityEngine;

namespace Fresnel.UnityDemo.Profiles
{
    /// <summary>Local portable selections. Reading or saving a slot never applies settings or starts output.</summary>
    public sealed class ProfileStore
    {
        public string DirectoryPath { get; }
        public ProfileStore(string directory = null)
        {
            DirectoryPath = Path.GetFullPath(directory ?? Path.Combine(Application.persistentDataPath, "Profiles"));
            Directory.CreateDirectory(DirectoryPath);
        }

        public TuningProfile LoadSlot(string slot) => LoadFile(SlotName(slot));
        public void SaveSlot(string slot, TuningProfile profile) => SaveFile(SlotName(slot), profile);
        public TuningProfile ImportSlot(string slot, string json)
        {
            var profile = ProfileCodec.Parse(json);
            SaveSlot(slot, profile);
            return ProfileCodec.Validate(profile);
        }
        public string ExportSlot(string slot) => ProfileCodec.Serialize(LoadSlot(slot));
        public bool HasSlot(string slot) => File.Exists(FullPath(SlotName(slot)));
        public string[] ListFiles() => Directory.EnumerateFiles(DirectoryPath, "*.json", SearchOption.TopDirectoryOnly)
            .Select(Path.GetFileName).OrderBy(name => name, StringComparer.Ordinal).ToArray();

        public TuningProfile LoadFile(string name)
        {
            string path = FullPath(name);
            if (new FileInfo(path).Length > ProfileCodec.MaxBytes) throw new FormatException("Invalid tuning profile: import exceeds 16 KiB");
            return ProfileCodec.Parse(File.ReadAllText(path, new UTF8Encoding(false, true)));
        }
        public void SaveFile(string name, TuningProfile profile)
        {
            string json = ProfileCodec.Serialize(profile); // Validate before any IO.
            string path = FullPath(name);
            string temp = path + "." + Guid.NewGuid().ToString("N") + ".tmp";
            try
            {
                File.WriteAllText(temp, json, new UTF8Encoding(false));
                if (File.Exists(path)) File.Replace(temp, path, null);
                else File.Move(temp, path);
            }
            finally { if (File.Exists(temp)) File.Delete(temp); }
        }

        private static string SlotName(string slot)
        {
            if (slot != "A" && slot != "B") throw new ArgumentException("Profile slot must be A or B", nameof(slot));
            return "slot-" + slot + ".json";
        }
        private string FullPath(string name)
        {
            if (name == null || !Regex.IsMatch(name, @"\A[a-zA-Z0-9][a-zA-Z0-9_.-]{0,95}\.json\z") || name.Contains(".."))
                throw new ArgumentException("Use a local profile filename ending in .json", nameof(name));
            return Path.Combine(DirectoryPath, name);
        }
    }
}
