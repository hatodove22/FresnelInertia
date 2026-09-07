import { SoundTimeline, type SoundFrame } from "./SoundState";
import { loadFoleyBank, type FoleyBank, type FoleyBankLoader } from "./FoleyBank";
export { impactSamples, flowSamples } from "./FoleySamples";

const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, Number.isFinite(v) ? v : lo));

interface Voice { source: AudioBufferSourceNode; gain: GainNode; pan: StereoPannerNode; loop: boolean }

/** A bounded Web-only sound branch. Construction is silent and allocates no
 * audio context. The UI calls enable from a deliberate user gesture. */
export class MaterialSound {
  enabled = false;
  volume = 0.35;
  error = "";
  onChange?: () => void;
  private context?: AudioContext;
  private master?: GainNode;
  private readonly timeline = new SoundTimeline();
  private readonly voices = new Set<Voice>();
  private flow?: Voice;
  private vent?: Voice;
  private bank?: FoleyBank;
  private bankLoading?: Promise<FoleyBank>;
  private generation = 0;
  private seed = 0;
  private lastWetContactS = -Infinity;

  constructor(private readonly makeContext = () => new AudioContext({ latencyHint: "interactive" }),
    private readonly loadBank: FoleyBankLoader = loadFoleyBank) {}
  get running() { return this.enabled && this.context?.state === "running"; }

  async enable() {
    const generation = ++this.generation;
    this.error = "";
    try {
      if (!this.context || this.context.state === "closed") {
        this.context = this.makeContext();
        this.bank = undefined; this.bankLoading = undefined;
        this.master = this.context.createGain();
        this.master.gain.value = this.volume;
        // Modest authored gains plus compression keep busy grains from masking
        // everything else. This is an acoustic mix, not a vibration limiter.
        const compressor = this.context.createDynamicsCompressor();
        compressor.threshold.value = -12; compressor.knee.value = 12;
        compressor.ratio.value = 4; compressor.attack.value = 0.003; compressor.release.value = 0.12;
        this.master.connect(compressor).connect(this.context.destination);
        this.context.onstatechange = () => {
          if (this.context?.state !== "running") this.silence();
          this.onChange?.();
        };
      }
      await this.context.resume();
      const context = this.context;
      if (!this.bank) {
        const pending = this.bankLoading ??= this.loadBank(context);
        try {
          const bank = await pending;
          if (this.context === context) this.bank = bank;
        } finally {
          if (this.bankLoading === pending) this.bankLoading = undefined;
        }
      }
      if (generation !== this.generation) return;
      this.enabled = this.context.state === "running";
      if (!this.enabled) this.error = "音声を再開できません。もう一度ONを押してください。";
      this.timeline.accept(null);
    } catch (error) {
      if (generation !== this.generation) return;
      this.enabled = false;
      this.error = `音声を開始できません: ${error instanceof Error ? error.message : String(error)}`;
    }
    this.onChange?.();
  }

  mute() {
    ++this.generation; this.enabled = false; this.error = "";
    this.silence(); this.onChange?.();
  }

  setVolume(value: number) {
    this.volume = clamp(value);
    if (this.master && this.context) {
      const now = this.context.currentTime;
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setTargetAtTime(this.volume, now, 0.015);
    }
  }

  update(frame: SoundFrame | null) {
    if (!this.running || !frame) { this.silence(); return; }
    const result = this.timeline.accept(frame);
    if (!result) return; // Duplicate telemetry cannot extend the sound envelope.
    if (result.reset) this.stopVoices();
    const { material, flow, pan } = result.frame;
    const ctx = this.context!, now = ctx.currentTime;
    const flowBuffer = this.bank?.get(`flow:${material}`);
    if (flow > 0.002 && !this.flow && flowBuffer) this.flow = this.voice(flowBuffer, true);
    if (this.flow) {
      const gain = this.flow.gain.gain;
      // Friction is subordinate to the contact, especially for isolated solids.
      const level = clamp(flow) ** 1.3 * ({ coin: 0.18, marble: 0.14, sand: 0.34, water: 0.38, soda: 0.30, hybrid: 0.34 }[material]);
      gain.cancelScheduledValues(now); gain.setValueAtTime(gain.value, now);
      gain.linearRampToValueAtTime(level, now + 0.035);
      // Fresh 10 Hz source frames renew this envelope. A stalled page/radio
      // cannot leave a continuous hiss latched on, even before stale reporting.
      gain.setValueAtTime(level, now + 0.18);
      gain.linearRampToValueAtTime(0, now + 0.26);
      this.flow.pan.pan.setTargetAtTime(clamp(pan, -0.65, 0.65), now, 0.025);
    }
    // The recorded fizz is pressure release, not ordinary liquid movement.
    // Sealed shaking can slosh; only an accepted burst can renew this bed.
    const vent = material === "soda" ? clamp(result.frame.vent ?? 0) : 0;
    const ventBuffer = this.bank?.get("vent:soda");
    if (vent > 0.002 && !this.vent && ventBuffer && this.voices.size < 9) this.vent = this.voice(ventBuffer, true);
    if (this.vent) {
      if (vent <= 0.002) {
        this.stopVoice(this.vent); this.vent = undefined;
      } else {
        const gain = this.vent.gain.gain, level = vent ** 0.7 * 0.48;
        gain.cancelScheduledValues(now); gain.setValueAtTime(gain.value, now);
        gain.linearRampToValueAtTime(level, now + 0.035);
        gain.setValueAtTime(level, now + 0.18);
        gain.linearRampToValueAtTime(0, now + 0.26);
        this.vent.pan.pan.setTargetAtTime(clamp(pan, -0.4, 0.4), now, 0.025);
      }
    }
    // The opening is the salient event: never lose it to ordinary contact
    // chatter or a full pool of earlier ringing voices.
    const wet = material === "water" || material === "hybrid" || material === "soda";
    let contacts = result.events.filter(e => e.kind !== "pop");
    if (wet) {
      // Voice a broad splash from the strongest fresh contact. Dense C++
      // droplet batches should not pile up into a machine-gun hiss. Dropped
      // accents are never queued; no independent slosh/collision clock runs.
      contacts = result.frame.timeS - this.lastWetContactS >= 0.35
        ? contacts.sort((a, b) => b.strength - a.strength).slice(0, 1) : [];
    }
    const events = [...result.events.filter(e => e.kind === "pop").slice(-1), ...contacts.slice(-3)];
    for (const event of events) {
      // Recorded swashes carry their own natural water tail. Let at most two
      // overlap; dropped source contacts are discarded, never replayed later.
      if (wet && event.kind !== "pop" && [...this.voices].filter(v => !v.loop).length >= 2) continue;
      if (event.kind === "pop" && this.voices.size >= 9) {
        const old = [...this.voices].find(v => !v.loop);
        if (old) this.stopVoice(old);
      }
      if (this.voices.size >= 9) break;
      const variation = (++this.seed) % 4;
      // Liquid RollTrain/Scrape is the model's flowing-water cue, not a dry
      // solid scrape. Energetic flow voices the same broad slosh as an arrival;
      // gentle movement keeps the smaller wet sample. This remaps timbre only.
      const surge = wet && event.kind === "scrape" && (flow >= 0.25 || event.strength >= 0.35);
      const sampleKind = surge ? "impact" : event.kind;
      const buffer = this.bank?.get(sampleKind === "pop" ? `pop:${variation}` : `${material}:${sampleKind}:${variation}`);
      if (!buffer) continue;
      const voice = this.voice(buffer, false);
      if (wet && event.kind !== "pop") this.lastWetContactS = result.frame.timeS;
      voice.gain.gain.value = event.kind === "pop" ? clamp(event.strength) * 0.85
        : wet ? Math.sqrt(clamp(event.strength)) * (sampleKind === "scrape" ? 0.30 : 0.52)
        : clamp(event.strength) * 0.60;
      voice.pan.pan.value = clamp(event.pan, -0.65, 0.65);
    }
  }

  /** Stop, source/preset changes, pause and page hiding all cancel old tails. */
  silence() { this.timeline.accept(null); this.stopVoices(); }

  private voice(buffer: AudioBuffer, loop: boolean): Voice {
    const ctx = this.context!, source = ctx.createBufferSource(), gain = ctx.createGain(), pan = ctx.createStereoPanner();
    source.buffer = buffer; source.loop = loop; gain.gain.value = 0;
    source.connect(gain).connect(pan).connect(this.master!);
    const voice = { source, gain, pan, loop }; this.voices.add(voice);
    source.onended = () => { source.disconnect(); gain.disconnect(); pan.disconnect(); this.voices.delete(voice); };
    source.start(); return voice;
  }

  private stopVoices() {
    this.lastWetContactS = -Infinity;
    if (!this.context) return;
    for (const voice of this.voices) this.stopVoice(voice);
    this.flow = undefined;
    this.vent = undefined;
  }

  private stopVoice(voice: Voice) {
    if (!this.context) return;
    const now = this.context.currentTime;
    voice.gain.gain.cancelScheduledValues(now);
    voice.gain.gain.setValueAtTime(voice.gain.gain.value, now);
    voice.gain.gain.linearRampToValueAtTime(0, now + 0.012);
    voice.source.stop(now + 0.015);
    this.voices.delete(voice);
  }

  async dispose() {
    this.mute(); this.bank = undefined;
    if (this.context) { this.context.onstatechange = null; await this.context.close(); }
    this.context = undefined; this.master = undefined;
  }
}
