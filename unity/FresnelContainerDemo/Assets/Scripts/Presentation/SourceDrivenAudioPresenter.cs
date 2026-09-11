using System;
using UnityEngine;

namespace Fresnel.UnityDemo.Presentation
{
    /// <summary>Occurrence gate shared by the optional speaker branch and its regressions.
    /// A 10 Hz latest-event observer cannot reconstruct every physical contact.</summary>
    public sealed class SourceEventGate
    {
        private ulong? eventTotal;
        private double? time;
        private string preset;
        public void Reset() { eventTotal = null; time = null; preset = null; }
        public bool Accept(ContentFrame frame)
        {
            if (frame == null || !frame.HasMotion || !frame.IsFreshMotion) return false;
            bool play = eventTotal.HasValue && time.HasValue && preset == frame.Preset &&
                frame.SourceStep == SourceStep.Advance && frame.SourceTimeS > time.Value &&
                frame.EventTotal > eventTotal.Value && frame.NewEvents > 0 &&
                frame.EventType != "None" && frame.RunMode == "live";
            eventTotal = frame.EventTotal; time = frame.SourceTimeS; preset = frame.Preset;
            return play;
        }
    }

    /// <summary>Quiet, explicitly enabled authored Foley. This is speaker presentation,
    /// not actuator PCM or a recorded biological heartbeat. No autonomous beat scheduling.</summary>
    public sealed class SourceDrivenAudioPresenter : IDisposable
    {
        public bool Enabled { get; private set; }
        private bool stale;
        private readonly SourceEventGate gate = new SourceEventGate();
        private readonly GameObject owner;
        private readonly AudioSource source;
        private readonly AudioClip marble, sand, water, heart;
        public SourceDrivenAudioPresenter(Transform parent)
        {
            owner = new GameObject("Optional source-driven speaker"); owner.transform.SetParent(parent, false);
            source = owner.AddComponent<AudioSource>(); source.playOnAwake = false;
            source.spatialBlend = 0; source.volume = .18f;
            marble = BuildClip("Authored solid contact", .11f, 0);
            sand = BuildClip("Authored granular contact", .17f, 1);
            water = BuildClip("Authored liquid contact", .17f, 2);
            heart = BuildClip("Authored fictional pulse", .18f, 3);
        }
        public void SetEnabled(bool enabled)
        {
            if (Enabled == enabled) return;
            Enabled = enabled; Reset();
        }
        public void SetStale(bool value)
        {
            if (stale == value) return;
            stale = value; Reset();
        }
        public void Reset() { gate.Reset(); if (source != null) source.Stop(); }
        public void Apply(ContentFrame frame)
        {
            if (!Enabled || stale) return;
            if (frame == null || frame.RunMode != "live" || frame.SourceStep == SourceStep.Gap || frame.SourceStep == SourceStep.Rewind)
            {
                source.Stop(); gate.Accept(frame); return;
            }
            if (!gate.Accept(frame)) return;
            string name = frame.Preset.ToLowerInvariant();
            bool beat = frame.EventType == "HeartbeatPulse" && frame.Heartbeat != null;
            AudioClip clip = beat ? heart : name.Contains("sand") ? sand : frame.Family == "Liquid" ? water : marble;
            source.panStereo = Mathf.Clamp(frame.MassPosition.x, -1, 1) * .5f;
            source.pitch = beat ? .95f + frame.Heartbeat.Primary * .10f : .9f + frame.EventAmplitude * .2f;
            source.PlayOneShot(clip, Mathf.Clamp(frame.EventAmplitude, .04f, .85f));
        }
        private static AudioClip BuildClip(string name, float duration, int kind)
        {
            const int rate = 24000;
            var samples = new float[Mathf.CeilToInt(duration * rate)];
            uint noiseState = 14317;
            float filtered = 0;
            for (int i = 0; i < samples.Length; i++)
            {
                float t = i / (float)rate, normalized = t / duration;
                noiseState = noiseState * 1664525 + 1013904223;
                float noise = (noiseState >> 8) / 8388607.5f - 1;
                filtered += .16f * (noise - filtered);
                float envelope = Mathf.Sin(Mathf.Clamp01(t / .003f) * Mathf.PI * .5f) * Mathf.Exp(-(kind == 3 ? 28 : 36) * t) * (1 - normalized);
                float value = kind == 3 ? Mathf.Sin(2 * Mathf.PI * (58 * t + 17 * t * Mathf.Exp(-30 * t))) * .7f + filtered * .10f :
                    kind == 2 ? Mathf.Sin(2 * Mathf.PI * (520 * t - 400 * t * t)) * .28f + filtered * .8f :
                    kind == 1 ? filtered * .85f + noise * .1f : Mathf.Sin(2 * Mathf.PI * 1390 * t) * .37f + noise * Mathf.Exp(-160 * t) * .5f;
                samples[i] = Mathf.Clamp(value * envelope, -.85f, .85f);
            }
            var clip = AudioClip.Create(name, samples.Length, 1, rate, false); clip.SetData(samples, 0); return clip;
        }
        public void Dispose()
        {
            Reset();
            UnityEngine.Object.Destroy(owner); UnityEngine.Object.Destroy(marble);
            UnityEngine.Object.Destroy(sand); UnityEngine.Object.Destroy(water); UnityEngine.Object.Destroy(heart);
        }
    }
}
