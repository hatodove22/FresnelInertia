/** Deterministic, dimensionless design sketches. Never an actuator controller.
 * No device telemetry, transport, DOM, THREE, wall clock, or firmware constants.
 * A shared state is projected into all the proposed visual and haptic cues.
 */
export type ScenarioId = 'magnet' | 'pour' | 'seed';
export type CueEvent = 'rest' | 'roll' | 'attach' | 'release' | 'flow' | 'empty' | 'wake' | 'tap';
export interface SketchFrame {
  scenario: ScenarioId;
  time: number;
  tilt: number;
  x: number;
  velocity: number;
  remaining: number;
  arousal: number;
  attached: -1 | 0 | 1;
  pulses: readonly number[];
  event: CueEvent;
  eventCount: number;
}
export interface CueProjection { slow: readonly [number, number]; fast: readonly number[]; centroid: number; }
const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
const finite = (n: number, fallback = 0) => Number.isFinite(n) ? n : fallback;
const stepSeconds = 1 / 120;

export class ScenarioModel {
  private state!: SketchFrame;
  private pulses = [0, 0, 0, 0];
  private targetTilt = 0;
  private accumulator = 0;
  private impulse = false;
  private releaseCooldown = 0;
  private eventAccumulator = 0;

  constructor(scenario: ScenarioId = 'magnet') { this.reset(scenario); }

  reset(scenario: ScenarioId = this.state.scenario) {
    this.pulses = [0, 0, 0, 0];
    this.targetTilt = this.accumulator = this.releaseCooldown = this.eventAccumulator = 0;
    this.impulse = false;
    this.state = { scenario, time: 0, tilt: 0, x: -.35, velocity: .25, remaining: 1, arousal: .08, attached: 0, pulses: this.pulses, event: 'rest', eventCount: 0 };
  }

  setTilt(degrees: number) { this.targetTilt = clamp(finite(degrees), -35, 35) * Math.PI / 180; }
  shake() { this.impulse = true; }
  /** Fixed steps make equal input traces independent of animation frame rate. */
  advance(seconds: number) {
    this.accumulator += clamp(finite(seconds), 0, .1);
    while (this.accumulator + 1e-10 >= stepSeconds) {
      this.step(stepSeconds); this.accumulator -= stepSeconds;
    }
    return this.snapshot();
  }
  snapshot(): SketchFrame { return { ...this.state, pulses: [...this.pulses] }; }
  private emit(event: CueEvent, wall: number, strength: number) {
    this.state.event = event; this.state.eventCount++;
    this.pulses[wall] = Math.max(this.pulses[wall], clamp(strength, 0, 1));
  }
  private step(dt: number) {
    const s = this.state;
    s.time += dt; s.tilt += (this.targetTilt - s.tilt) * (1 - Math.exp(-dt * 8));
    this.releaseCooldown = Math.max(0, this.releaseCooldown - dt);
    this.pulses.forEach((p, i) => this.pulses[i] = p * Math.exp(-dt * 6));
    const shaken = this.impulse; this.impulse = false;
    if (s.scenario === 'pour') {
      const rate = Math.max(0, Math.abs(s.tilt) - .3) * .75;
      const before = s.remaining;
      s.remaining = Math.max(0, s.remaining - rate * dt);
      s.x += (Math.sin(s.tilt) * .8 - s.x) * (1 - Math.exp(-dt * 3));
      // Depletion lowers event density; individual grains remain conspicuous.
      this.eventAccumulator += rate * dt * (12 + s.remaining * 150);
      if (s.remaining > 0 && this.eventAccumulator >= 1) {
        this.eventAccumulator %= 1;
        this.emit('flow', s.tilt >= 0 ? 1 : 0, .18 + s.remaining * .55);
      }
      if (before > 0 && s.remaining === 0) this.emit('empty', 3, .4);
      if (shaken && s.remaining > 0) this.emit('flow', 3, .55);
    } else if (s.scenario === 'magnet') {
      if (shaken) {
        if (s.attached) this.emit('release', s.attached > 0 ? 1 : 0, 1);
        else this.emit('roll', 3, .65);
        s.velocity = s.x > 0 ? -2.8 : 2.8; s.attached = 0; this.releaseCooldown = .65;
      }
      if (!s.attached) {
        s.velocity = (s.velocity + Math.sin(s.tilt) * 4.5 * dt) * Math.exp(-dt * .5);
        s.x += s.velocity * dt;
        if (Math.abs(s.x) >= .82) {
          const side = s.x > 0 ? 1 : -1;
          s.x = side * .82;
          if (!this.releaseCooldown) { s.attached = side; s.velocity = 0; this.emit('attach', side > 0 ? 1 : 0, .85); }
          else s.velocity *= -.5;
        }
      }
    } else {
      if (shaken) { s.arousal = clamp(s.arousal + .68, 0, 1); this.emit('wake', 2, .8); }
      const motion = Math.abs(this.targetTilt - s.tilt);
      s.arousal = clamp(s.arousal + motion * dt * 1.8 - dt * .035, .03, 1);
      const destination = Math.sin(s.time * 1.8) * s.arousal * .7 + Math.sin(s.tilt) * .3;
      s.velocity = (destination - s.x) * 3;
      s.x += s.velocity * dt;
      this.eventAccumulator += dt * (.15 + s.arousal * 1.9);
      if (this.eventAccumulator >= 1) { this.eventAccumulator %= 1; this.emit('tap', s.x > 0 ? 1 : 0, s.arousal * .7); }
    }
  }
}

/** Proposed cue relationships only: normalized relative levels, not N or degrees. */
export function projectCues(frame: SketchFrame): CueProjection {
  const amount = frame.scenario === 'pour' ? frame.remaining : 1;
  const bias = clamp(frame.x * amount, -1, 1);
  const dynamic = frame.scenario === 'seed' ? Math.sin(frame.time * 2) * frame.arousal * .12 : 0;
  return { slow: [clamp(bias + dynamic, -1, 1), clamp(-bias + dynamic, -1, 1)], fast: frame.pulses, centroid: bias };
}
