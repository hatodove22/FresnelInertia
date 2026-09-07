import * as THREE from "three";
import { sourceTimeStep } from "../SourceTime";

export interface LiquidSloshInput {
  timeS: number;
  normal: THREE.Vector3;
  massX: number;
  massY: number;
  velocityX: number;
  velocityY: number;
  activity: number;
  fill: number;
  viscosity: number;
  /** Optional accepted body-frame acceleration residual (g), not tracking. */
  acceleration?: readonly number[];
}

export interface LiquidSloshResult {
  /** Presentation-only surface orientation; not a new content or haptic state. */
  normal: THREE.Vector3;
  activity: number;
  flow: THREE.Vector2;
  revision: number;
  maxDisplacement: number;
  /** Normal-coordinate displacement in metres, with u/v in [-0.5, 0.5]. */
  displacement: (u: number, v: number) => number;
}

const finite = (value: number, fallback = 0) => Number.isFinite(value) ? value : fallback;
const clamp = THREE.MathUtils.clamp;

/**
 * Small, deliberately visual slosh model. Input changes excite damped tank
 * modes; they are never a source of contacts, mass motion or actuator commands.
 * The supplied sample time is its only clock, so stale telemetry and Lab pause
 * freeze the complete surface (including its normal-map advection).
 */
export class LiquidSlosh {
  private readonly size: THREE.Vector3;
  private readonly position = new THREE.Vector3(0, 1, 0);
  private readonly velocity = new THREE.Vector3();
  private readonly previousNormal = new THREE.Vector3(0, 1, 0);
  private readonly target = new THREE.Vector3(0, 1, 0);
  private readonly acceleration = new THREE.Vector3();
  private readonly q = new Float64Array(6);
  private readonly dq = new Float64Array(6);
  private lastTime: number | undefined;
  private previousMassX = 0;
  private previousMassY = 0;
  private previousVelocityX = 0;
  private previousVelocityY = 0;
  private previousActivity = 0;
  private readonly previousAcceleration = new THREE.Vector3();
  private readonly inputAcceleration = new THREE.Vector3();
  private limit = 0;
  private readonly result: LiquidSloshResult = {
    normal: new THREE.Vector3(0, 1, 0),
    activity: 0,
    flow: new THREE.Vector2(),
    revision: 0,
    maxDisplacement: 0,
    displacement: (u, v) => this.displacement(u, v)
  };

  constructor(size: THREE.Vector3) {
    this.size = new THREE.Vector3(
      clamp(finite(size.x, 0.06), 0.005, 2),
      clamp(finite(size.y, 0.06), 0.005, 2),
      clamp(finite(size.z, 0.06), 0.005, 2)
    );
  }

  update(input: LiquidSloshInput): LiquidSloshResult {
    // A repeated sample, even with changed ancillary fields, is not new motion.
    const sample = sourceTimeStep(this.lastTime, input.timeS);
    if (sample.kind === "missing" || sample.kind === "duplicate") return this.result;
    this.target.set(clamp(finite(input.normal.x), -1e6, 1e6), clamp(finite(input.normal.y, 1), -1e6, 1e6), clamp(finite(input.normal.z), -1e6, 1e6));
    if (this.target.lengthSq() < 1e-12) this.target.set(0, 1, 0);
    this.target.normalize();
    const mx = clamp(finite(input.massX), -2, 2);
    const my = clamp(finite(input.massY), -2, 2);
    const vx = clamp(finite(input.velocityX), -12, 12);
    const vy = clamp(finite(input.velocityY), -12, 12);
    const activity = clamp(finite(input.activity), 0, 1);
    const fill = clamp(finite(input.fill, 0.5), 0, 1);
    const viscosity = clamp(finite(input.viscosity), 0, 1);
    this.inputAcceleration.set(
      clamp(finite(input.acceleration?.[0] ?? 0), -8, 8),
      clamp(finite(input.acceleration?.[1] ?? 0), -8, 8),
      clamp(finite(input.acceleration?.[2] ?? 0), -8, 8)
    );
    const dt = sample.elapsedS;
    // The broad surge and its drawdown now deform the actual free surface;
    // there is no second plane, attached sheet or separate lifetime/volume.
    this.limit = Math.min(this.size.x, this.size.y, this.size.z) * 0.18 * Math.min(1, fill * 10, (1 - fill) * 10);
    this.result.maxDisplacement = this.limit;

    if (sample.kind !== "advance" || this.limit < 1e-12) {
      // Entering a view, loading a preset or recovering stale telemetry must not
      // replay an unseen impulse. The next actual motion will excite the water.
      this.position.copy(this.target);
      this.velocity.set(0, 0, 0);
      this.q.fill(0);
      this.dq.fill(0);
      this.result.normal.copy(this.target);
      this.result.activity = 0;
      this.result.flow.set(clamp(mx * 0.12, -0.4, 0.4), 0);
    } else {
      const depth = Math.max(this.size.y * fill, 0.002);
      // Reduced gravity slows small real-scale tank modes enough to read on a
      // display. Size/depth still determine their relative frequency.
      const omega = (length: number, mode = 1) => {
        const k = Math.PI * mode / length;
        return clamp(Math.sqrt(9.81 * k * Math.tanh(k * depth)) * 0.62, 3.2, 29);
      };
      const ox = omega(this.size.x), oz = omega(this.size.z);
      const frequencies = [ox, oz, omega(this.size.x, 2), omega(this.size.z, 2), Math.hypot(ox, oz), Math.hypot(ox * 1.45, oz)];
      const span = Math.min(this.size.x, this.size.z);
      const normalX = clamp(this.target.x - this.previousNormal.x, -1, 1);
      const normalZ = clamp(this.target.z - this.previousNormal.z, -1, 1);
      const changeX = clamp((mx - this.previousMassX) * 0.17 + (vx - this.previousVelocityX) * 0.025, -0.65, 0.65);
      const changeY = clamp((my - this.previousMassY) * 0.10 + (vy - this.previousVelocityY) * 0.015, -0.45, 0.45);
      const agitation = Math.max(0, activity - this.previousActivity) * 0.075;
      // Changes, not a residual activity level, excite waves. The fore/aft
      // channel is visual detail; it does not add body-z haptic contacts.
      const accelX = clamp(this.inputAcceleration.x - this.previousAcceleration.x, -3, 3) * 0.24;
      const accelY = clamp(this.inputAcceleration.y - this.previousAcceleration.y, -3, 3) * 0.06;
      const accelZ = clamp(this.inputAcceleration.z - this.previousAcceleration.z, -3, 3) * 0.24;
      const kickX = normalX * 0.5 + changeX * 1.35 + accelX;
      const kickZ = normalZ * 0.5 + accelZ;
      const kicks = [kickX, kickZ, changeY * 0.70 + agitation + accelY, changeY * 0.46 + agitation * 0.63 + accelY * 0.7,
        (normalX + normalZ) * 0.095 + changeX * 0.24, (normalX - normalZ) * 0.055 + changeY * 0.3];
      for (let i = 0; i < this.q.length; i++) {
        this.dq[i] = clamp(this.dq[i] + kicks[i] * span * frequencies[i], -this.limit * frequencies[i] * 3, this.limit * frequencies[i] * 3);
      }

      // Inverted poses have no unique small-angle lag direction. Reacquire the
      // valid plane rather than integrating through a zero-length normal.
      if (this.position.dot(this.target) < -0.85) {
        this.position.copy(this.target);
        this.velocity.set(0, 0, 0);
      }
      const steps = Math.ceil(dt / (1 / 120));
      const h = dt / steps;
      const damping = 0.15 + viscosity * 0.56;
      const bulkOmega = Math.min(ox, oz) * 0.86;
      for (let step = 0; step < steps; step++) {
        this.acceleration.copy(this.target).sub(this.position).multiplyScalar(bulkOmega * bulkOmega)
          .addScaledVector(this.velocity, -2 * (0.19 + viscosity * 0.5) * bulkOmega);
        this.velocity.addScaledVector(this.acceleration, h);
        this.position.addScaledVector(this.velocity, h).normalize();
        this.velocity.addScaledVector(this.position, -this.velocity.dot(this.position));
        for (let i = 0; i < this.q.length; i++) {
          const w = frequencies[i];
          this.dq[i] += (-w * w * this.q[i] - 2 * damping * w * this.dq[i]) * h;
          this.q[i] += this.dq[i] * h;
          if (Math.abs(this.q[i]) > this.limit) {
            this.q[i] = clamp(this.q[i], -this.limit, this.limit);
            this.dq[i] *= 0.35;
          }
        }
      }
      this.result.normal.copy(this.position);
      const modeEnergy = this.q.reduce((sum, value, i) => sum + Math.hypot(value, this.dq[i] / frequencies[i]), 0);
      const bulkEnergy = this.position.distanceTo(this.target) * 0.4 + this.velocity.length() / bulkOmega * 0.12;
      this.result.activity = clamp(modeEnergy / Math.max(this.limit, 1e-9) * 0.35 + bulkEnergy, 0, 1);
      const flowX = clamp(mx * 0.12 + this.q[0] / span * 2.5 + this.velocity.x * 0.018, -0.4, 0.4);
      const flowZ = clamp(this.q[1] / span * 2.5 + this.velocity.z * 0.018, -0.4, 0.4);
      this.result.flow.lerp(new THREE.Vector2(flowX, flowZ), 1 - Math.exp(-dt * 7));
    }
    this.previousNormal.copy(this.target);
    this.previousMassX = mx;
    this.previousMassY = my;
    this.previousVelocityX = vx;
    this.previousVelocityY = vy;
    this.previousActivity = activity;
    this.previousAcceleration.copy(this.inputAcceleration);
    this.lastTime = sample.timeS;
    this.result.revision++;
    return this.result;
  }

  private displacement(u: number, v: number): number {
    const x = clamp(finite(u), -0.5, 0.5) * Math.PI;
    const z = clamp(finite(v), -0.5, 0.5) * Math.PI;
    const q = this.q;
    const broad = q[0] * Math.sin(x) + q[1] * Math.sin(z);
    const reflected = (q[2] * Math.cos(2 * x) + q[3] * Math.cos(2 * z)
      + q[4] * Math.sin(x) * Math.sin(z) + q[5] * Math.sin(2 * x) * Math.cos(z)) * 0.42;
    // Stokes-like steepening raises the broad moving shoulder, not an isolated
    // central spout. The geometry owner removes its area-weighted mean, so the
    // neighbouring water is drawn down instead of retaining a flat cap below.
    const crest = this.limit > 0 ? broad * broad / this.limit * 0.48 : 0;
    const wave = broad + reflected + crest;
    // Smooth saturation avoids a clipped, planar top on a strong wave.
    return this.limit > 0 ? this.limit * Math.tanh(wave / this.limit) : 0;
  }
}
