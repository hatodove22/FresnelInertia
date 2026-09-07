import { sourceTimeStep } from "../SourceTime";

export interface SolidDepthInput {
  timeS?: number;
  /** Body-local unit gravity; positive points toward the +z wall. */
  gravityZ: number;
  /** Contact-normal gravity magnitude (g); zero while off the support. */
  supportG: number;
  halfTravelM: number;
  fill: number;
  /** Accepted body acceleration residual (g), opposed by visual inertia. */
  accelerationZ?: number;
}

const finite = (value: number | undefined, fallback = 0) => Number.isFinite(value) ? value! : fallback;
const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));

/** One presentation-only degree of freedom. Never writes the reported x/y
 * state, emits contacts, or advances on render time. Material/preset ownership
 * resets it; missing/rewound/stale clocks cannot replay an unseen gesture. */
export class SolidDepthMotion {
  private lastTime?: number;
  private readonly result = { offsetM: 0, velocityMps: 0 };

  constructor(private readonly kind: "coin" | "marble") {}

  reset() {
    this.lastTime = undefined;
    this.result.offsetM = this.result.velocityMps = 0;
  }

  update(input: SolidDepthInput) {
    const sample = sourceTimeStep(this.lastTime, input.timeS);
    if (sample.kind === "missing") { this.reset(); return this.result; }
    if (sample.kind === "duplicate") return this.result;
    const time = sample.timeS, dt = sample.elapsedS;
    const travel = clamp(finite(input.halfTravelM), 0, 1);
    if (sample.kind !== "advance" || travel < 1e-7 || finite(input.fill) <= 0) {
      this.result.offsetM = this.result.velocityMps = 0;
      this.lastTime = time;
      return this.result;
    }
    this.lastTime = time;
    // SI travel gives small real-scale vessels a prompt response. Rolling
    // inertia distinguishes a marble from a sliding coin without a new FW model.
    const coin = this.kind === "coin";
    const gravity = clamp(finite(input.gravityZ), -1, 1);
    const support = clamp(finite(input.supportG), 0, 1);
    const acceleration = clamp(finite(input.accelerationZ), -4, 4);
    const force = (gravity - acceleration * 0.55) * 9.80665;
    const staticResistance = support * 9.80665 * (coin ? 0.16 : 0.018);
    const rollingResistance = support * 9.80665 * (coin ? 0.11 : 0.012);
    const inertia = coin ? 1 : 5 / 7;
    const steps = Math.max(1, Math.ceil(dt * 240)), h = dt / steps;
    this.result.offsetM = clamp(this.result.offsetM, -travel, travel);
    for (let i = 0; i < steps; i++) {
      const old = this.result.velocityMps;
      if (Math.abs(old) < 0.0001 && Math.abs(force) <= staticResistance) this.result.velocityMps = 0;
      else {
        const friction = Math.sign(Math.abs(old) > 0.0001 ? old : force) * rollingResistance;
        const next = (old + (force - friction) * inertia * h) * Math.exp(-h * (coin ? 0.45 : 0.7));
        this.result.velocityMps = old * next < 0 && Math.abs(force) <= staticResistance
          ? 0 : clamp(next, -1.2, 1.2);
      }
      this.result.offsetM += this.result.velocityMps * h;
      if (Math.abs(this.result.offsetM) >= travel) {
        this.result.offsetM = clamp(this.result.offsetM, -travel, travel);
        if (this.result.velocityMps * this.result.offsetM > 0) {
          const rebound = -this.result.velocityMps * (coin ? 0.16 : 0.34);
          this.result.velocityMps = Math.abs(rebound) < 0.025 ? 0 : rebound;
        }
      }
    }
    return this.result;
  }
}
