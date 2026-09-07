import type { HapticLinkState } from "../link/HapticLink";
import type { PreviewFrame } from "../lab/PreviewEngine";
import type { ContainerPreset, LocalContentState } from "../types";
import { resolvedPresetFromSnapshot } from "../visualState";

export type SoundMaterial = "coin" | "marble" | "sand" | "water" | "soda" | "hybrid";
export interface SoundEvent { kind: "impact" | "scrape" | "pop"; strength: number; pan: number }
export interface SoundFrame {
  source: "device" | "lab" | "preview";
  preset: string;
  timeS: number;
  material: SoundMaterial;
  flow: number;
  /** Speaker-only fizz gain from accepted burst state; absent/zero is not venting. */
  vent?: number;
  pan: number;
  events: SoundEvent[];
  /** Cumulative source event count; -1 means unavailable, never a guessed count. */
  serial: number;
  /** Source frame count, independent of the number of rendering updates. */
  step?: number;
  /** The shared soda burst sequence, when that state is present and valid. */
  popSerial?: number;
}

const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const clamp = (value: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, value));
const unit = (value: unknown) => finite(value) ? clamp(value, 0, 1) : 0;
const panOf = (value: unknown) => finite(value) ? clamp(value, -1, 1) : 0;
const counter = (value: unknown) => finite(value) && Number.isSafeInteger(value) && value >= 0 ? value : -1;
const pair = (value: unknown): value is [number, number] => Array.isArray(value) && value.length === 2 && value.every(finite);
const validTime = (value: unknown): value is number => finite(value) && value >= 0;
const validContainer = (preset: ContainerPreset) => !!preset?.container && [preset.container.span_x_m, preset.container.span_y_m,
  preset.container.span_z_m].every(value => finite(value) && value > 0) && finite(preset.container.fill);

function material(preset: ContainerPreset, pressureEnabled = false): SoundMaterial {
  // Applied family outranks an arbitrary preset name; coin names distinguish
  // the hard discs from the sparse-hard marble fallback within Granular only.
  if (preset.family === "Hybrid") return "hybrid";
  if (preset.family === "Liquid") return pressureEnabled || /soda/i.test(preset.preset) ? "soda" : "water";
  if (preset.family === "Granular") {
    if (/coin/i.test(preset.preset)) return "coin";
    if (/marble/i.test(preset.preset)) return "marble";
    return /sand/i.test(preset.preset) || unit(preset.container?.particle_hardness) < 0.8 ? "sand" : "marble";
  }
  return "marble";
}

interface Pressure {
  enabled: boolean;
  phase: string;
  phaseS: number;
  charge: number;
  remaining: number;
  sequence: number;
}
function pressure(value: Pressure | undefined): Pressure | undefined {
  return value?.enabled === true && ["sealed", "burst", "spent"].includes(value.phase) &&
    validTime(value.phaseS) && finite(value.charge) && finite(value.remaining) &&
    counter(value.sequence) >= 0 && value.sequence <= 65535 ? value : undefined;
}

function motionFlow(preset: ContainerPreset, velocity: [number, number], fill: number,
  granularFlow: unknown, burst?: Pressure): number {
  if (fill <= 0 || (burst && unit(burst.remaining) <= 0)) return 0;
  const speed = Math.hypot(velocity[0] * preset.container.span_x_m * 0.5,
    velocity[1] * preset.container.span_y_m * 0.5);
  // Only actual motion/flow or active venting excites the continuous sound.
  // An energy/charge residue at rest is not an autonomous sound source.
  const moving = Math.sqrt(clamp((speed - 0.0005) / 0.15, 0, 1));
  return unit(Math.max(moving, unit(granularFlow)) * Math.min(1, Math.sqrt(fill / 0.1)));
}

function pressureVent(burst: Pressure | undefined, fill: number): number {
  return burst?.phase === "burst" && fill > 0
    ? unit(unit(burst.charge) * Math.exp(-burst.phaseS / 1.1) * unit(burst.remaining) * Math.min(1, Math.sqrt(fill / 0.1))) : 0;
}

function eventPan(wall: unknown, fallback: number): number {
  if (wall === 0 || (typeof wall === "string" && wall.toLowerCase() === "front")) return 0.85;
  if (wall === 1 || (typeof wall === "string" && wall.toLowerCase() === "back")) return -0.85;
  return fallback;
}
function eventKind(type: unknown): SoundEvent["kind"] | null {
  const names = ["none", "wallhit", "rolltrain", "impactcluster", "dropletcluster", "roofslap", "scrape", "pressurepop"];
  const name = typeof type === "string" ? type.replace(/_/g, "").toLowerCase() : typeof type === "number" ? names[type] : "";
  if (["wallhit", "impactcluster", "dropletcluster", "roofslap"].includes(name)) return "impact";
  if (name === "rolltrain" || name === "scrape") return "scrape";
  return name === "pressurepop" ? "pop" : null;
}
function soundEvent(type: unknown, amplitude: unknown, wall: unknown, pan: number, burst?: Pressure): SoundEvent | null {
  const kind = eventKind(type), strength = unit(amplitude);
  if (!kind || strength <= 0 || (kind === "pop" && (!burst || burst.phase !== "burst" || burst.sequence <= 0))) return null;
  return { kind, strength, pan: eventPan(wall, pan) };
}

/** Aggregate live telemetry supplies at most its latest reported event. */
export function fromDeviceSound(state: HapticLinkState): SoundFrame | null {
  // These are the existing command strings. Read-only discovery may continue;
  // mutations silence immediately, before a delayed Idle/configuration snapshot.
  if (state.pendingCommand && !/^(get state|status)$/.test(state.pendingCommand.trim())) return null;
  const snapshot = state.telemetry, mass = snapshot?.mass;
  const preset = resolvedPresetFromSnapshot(snapshot);
  if (state.connection !== "connected" || state.paired === false || state.stale ||
    snapshot?.run_mode !== "live" || typeof snapshot.preset !== "string" || !snapshot.preset.trim() || !validTime(snapshot.timestamp_ms) ||
    counter(snapshot.frame_counter) < 0 || !preset || !validContainer(preset) || !mass ||
    !pair(mass.pos_norm) || !pair(mass.vel_norm_s) || !finite(mass.fill)) return null;
  const ack = state.lastAck;
  if (ack?.result === "applied" && counter(ack.frame) >= snapshot.frame_counter &&
    /^(safe_idle|live_output_still_gated|audio_enabled|audio_disabled|preset_loaded|parameter_applied|tilt_disarmed|tilt_armed|tilt_fault_cleared)$/.test(ack.detail)) return null;
  const reported = mass.demo?.pressure;
  const burst = preset.family === "Liquid" ? pressure(reported && { enabled: reported.enabled, phase: reported.phase,
    phaseS: reported.phase_s, charge: reported.charge, remaining: reported.remaining, sequence: reported.burst_sequence }) : undefined;
  const fill = unit(mass.fill), pan = panOf(mass.pos_norm[0]), serial = counter(snapshot.evt_total);
  const event = serial > 0 && fill > 0 && (!burst || unit(burst.remaining) > 0)
    ? soundEvent(snapshot.last_event?.type, snapshot.last_event?.amplitude, snapshot.last_event?.primary_wall, pan, burst) : null;
  return { source: "device", preset: preset.preset, timeS: snapshot.timestamp_ms / 1000, serial,
    step: snapshot.frame_counter, popSerial: burst?.sequence, material: material(preset, !!burst), pan,
    flow: motionFlow(preset, mass.vel_norm_s, fill, mass.demo?.granular_pile_active ? mass.demo.granular_flow : 0, burst),
    ...(burst ? { vent: pressureVent(burst, fill) } : {}),
    events: event ? [event] : [] };
}

/** Current C++ events are used directly; no haptic impulses are inferred from the rendered coins. */
export function fromLabSound(frame: PreviewFrame): SoundFrame {
  const preset: ContainerPreset = { preset: frame.preset, family: frame.family, container: frame.container };
  const valid = frame.source === "production-cpp-preview" && frame.abiVersion === 1 &&
    validContainer(preset) && validTime(frame.timeS) && counter(frame.frameCounter) >= 0 &&
    pair(frame.mass?.posNorm) && pair(frame.mass?.velNormS) && finite(frame.mass.fill);
  const reported = frame.mass?.pressure;
  const burst = preset.family === "Liquid" ? pressure(reported && { enabled: reported.enabled, phase: reported.phase, phaseS: reported.phaseS,
    charge: reported.charge, remaining: reported.remaining, sequence: reported.burstSequence }) : undefined;
  const fill = valid ? unit(frame.mass.fill) : 0, pan = valid ? panOf(frame.mass.posNorm[0]) : 0;
  const serial = counter(frame.eventsTotal);
  const events: SoundEvent[] = [];
  if (valid && fill > 0 && serial > 0 && (!burst || unit(burst.remaining) > 0) && Array.isArray(frame.events)) {
    for (const event of frame.events.slice(0, 16)) {
      const mapped = event && soundEvent(event.name, event.amplitude, event.wall, pan, burst);
      if (mapped) events.push(mapped);
    }
  }
  return { source: "lab", preset: frame.preset, timeS: validTime(frame.timeS) ? frame.timeS : 0,
    serial, step: counter(frame.frameCounter), popSerial: burst?.sequence, material: material(preset, !!burst), pan,
    flow: valid ? motionFlow(preset, frame.mass.velNormS, fill, frame.mass.granularPileActive ? frame.mass.granularFlow : 0, burst) : 0,
    ...(burst ? { vent: valid ? pressureVent(burst, fill) : 0 } : {}),
    events };
}

/** Explicit browser-local approximation; its impact pulse is latched by SoundTimeline. */
export function fromPreviewSound(preset: ContainerPreset, content: LocalContentState, timeS: number): SoundFrame {
  const valid = validContainer(preset) && validTime(timeS) && finite(content.surfaceVelocityX) && finite(content.surfaceVelocityY);
  const fill = valid ? unit(preset.container.fill) : 0, pan = panOf(content.surfaceOffsetX);
  const velocity: [number, number] = valid ? [content.surfaceVelocityX, content.surfaceVelocityY] : [0, 0];
  const flow = valid ? motionFlow(preset, velocity, fill, 0) : 0;
  const strength = unit(content.impactPulse);
  return { source: "preview", preset: preset.preset, timeS: validTime(timeS) ? timeS : 0, serial: -1,
    material: material(preset), pan, flow, events: flow > 0 && strength > 0.05 ? [{ kind: "impact", strength, pan }] : [] };
}

/** Null means silence/reset; a repeated source sample means no new scheduling. */
export class SoundTimeline {
  private previous?: SoundFrame;
  private interrupted?: SoundFrame;
  private previewImpact = false;
  private lastPop?: number;

  accept(frame: SoundFrame | null): { frame: SoundFrame; events: SoundEvent[]; reset: boolean } | null {
    if (!frame || !["device", "lab", "preview"].includes(frame.source) || !validTime(frame.timeS) ||
      typeof frame.preset !== "string" || !frame.preset || !finite(frame.flow) || !finite(frame.pan) ||
      !Number.isSafeInteger(frame.serial) || frame.serial < -1 || !Array.isArray(frame.events)) {
      if (this.previous) this.interrupted = this.previous;
      this.previous = undefined; this.previewImpact = false; this.lastPop = undefined;
      return null;
    }
    if (!this.previous && this.interrupted && frame.source === this.interrupted.source &&
      frame.preset === this.interrupted.preset && frame.timeS === this.interrupted.timeS &&
      frame.step === this.interrupted.step) return null;
    this.interrupted = undefined;
    const previous = this.previous;
    const reset = !previous || frame.source !== previous.source || frame.preset !== previous.preset ||
      frame.timeS < previous.timeS || frame.timeS - previous.timeS > 0.5 ||
      (frame.step !== undefined && previous.step !== undefined && frame.step < previous.step) ||
      (frame.source !== "preview" && (frame.serial < previous.serial || (frame.serial < 0) !== (previous.serial < 0)));
    const candidates = frame.events.filter(event => event && ["impact", "scrape", "pop"].includes(event.kind) &&
      finite(event.strength) && event.strength > 0 && finite(event.pan)).slice(-16)
      .map(event => ({ kind: event.kind, strength: unit(event.strength), pan: panOf(event.pan) }));
    const pulse = Math.max(0, ...candidates.filter(event => event.kind === "impact").map(event => event.strength));
    // Copy scalar identity, so mutation/reuse of a producer object cannot hide a rewind.
    this.previous = { ...frame, events: [] };
    if (reset) {
      this.previewImpact = pulse >= 0.18;
      this.lastPop = frame.popSerial;
      return { frame, events: [], reset: true };
    }
    if (frame.timeS === previous.timeS || (frame.step !== undefined && frame.step === previous.step)) {
      // Consume duplicate counters too: a later timestamp must not replay an
      // event that arrived only as a same-time metadata refresh.
      if (frame.popSerial !== undefined) this.lastPop = frame.popSerial;
      if (frame.source === "preview") {
        if (pulse >= 0.18) this.previewImpact = true;
        else if (pulse <= 0.07) this.previewImpact = false;
      }
      return null;
    }
    let events: SoundEvent[] = [];
    if (frame.source === "preview") {
      if (pulse <= 0.07) this.previewImpact = false;
      else if (pulse >= 0.18 && !this.previewImpact) {
        this.previewImpact = true;
        events = candidates.filter(event => event.kind === "impact").slice(-1);
      }
    } else if (frame.serial >= 0 && frame.serial > previous.serial) {
      events = frame.source === "device" ? candidates.slice(-1) : candidates;
      events = events.filter(event => event.kind !== "pop" || (frame.popSerial !== undefined && frame.popSerial > 0 && frame.popSerial !== this.lastPop));
    }
    if (frame.popSerial !== undefined) this.lastPop = frame.popSerial;
    return { frame, events, reset: false };
  }
}
