export interface SandSurfaceFlowInput {
  timeS?: number;
  fill: number;
  slope: number;
  flow: number;
  /** Shared body-x centroid velocity; its sign owns surface transport. */
  velocityX: number;
  widthM: number;
  depthM: number;
  heightM: number;
}

export interface SandSurfaceGrain {
  /** Normalized surface coordinates, centered on the container. */
  u: number;
  v: number;
  rotation: number;
  /** Current local flowing fraction; most grains remain stationary. */
  active: number;
  /** Recycling fades out/in at the edge instead of visibly teleporting. */
  visibility: number;
}

const clamp = (n: number, low: number, high: number) => Math.max(low, Math.min(high, n));
const smooth = (n: number) => { const t = clamp(n, 0, 1); return t * t * (3 - 2 * t); };
const hash = (n: number) => {
  let x = Math.imul((n | 0) ^ 0x9e3779b9, 0x45d9f3b);
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
};

// Local surface lanes, not a fore/aft transport field. Grains keep their v.
function lane(v: number) {
  return Math.max(smooth(1 - Math.abs(v + 0.31) / 0.095),
    smooth(1 - Math.abs(v - 0.025) / 0.115), smooth(1 - Math.abs(v - 0.32) / 0.075));
}

function valueNoise(x: number, seed: number) {
  const cell = Math.floor(x), f = smooth(x - cell);
  return hash(cell + seed) * (1 - f) + hash(cell + seed + 1) * f;
}

/** A thin presentation layer over the one-axis reported sand pile. Persistent
 * grains advect in the reported direction; shallow erosion/deposition changes
 * only during actual flow. No bulk physics, pitch CG, clock-driven oscillation,
 * sound or new haptic event is produced. ContainedVolume owns volume correction. */
export class SandSurfaceFlow {
  readonly grains: SandSurfaceGrain[];
  revision = 0;
  maxDisplacement = 0;
  private readonly initial: SandSurfaceGrain[];
  private readonly mobile: number[];
  private readonly rates: number[];
  private readonly nx = 29;
  private readonly nz = 19;
  private field = new Float64Array(this.nx * this.nz);
  private next = new Float64Array(this.nx * this.nz);
  private readonly flux = new Float64Array(this.nx * this.nz);
  private lastTime?: number;
  private lastSlope = 0;
  private direction = 0;
  private dimensions = "";
  private empty = false;

  constructor(count = 900) {
    if (!Number.isInteger(count) || count < 1 || count > 10000) throw new RangeError("Sand grain count must be 1–10000");
    const columns = Math.ceil(Math.sqrt(count)), rows = Math.ceil(count / columns);
    this.initial = Array.from({ length: count }, (_, i) => ({
      u: (i % columns + 0.15 + hash(i * 17 + 31) * 0.7) / columns - 0.5,
      v: (Math.floor(i / columns) + 0.15 + hash(i * 19 + 151) * 0.7) / rows - 0.5,
      rotation: hash(i * 23 + 277) * Math.PI * 2, active: 0, visibility: 1,
    }));
    this.grains = this.initial.map(grain => ({ ...grain }));
    this.mobile = this.initial.map((grain, i) => hash(i * 7 + 977) < 0.42 ? lane(grain.v) : 0);
    this.rates = this.initial.map((_, i) => 0.72 + hash(i * 29 + 1777) * 0.28);
    for (let z = 0; z < this.nz; z++) for (let x = 0; x < this.nx; x++) {
      const u = x / (this.nx - 1), v = z / (this.nz - 1) - 0.5;
      this.flux[z * this.nx + x] = lane(v) * (0.3 + 0.7 * valueNoise(u * 6.7, z * 11 + 811)) *
        smooth(u / 0.12) * smooth((1 - u) / 0.12);
    }
  }

  private quiet() {
    this.direction = 0;
    for (const grain of this.grains) grain.active = 0;
  }

  private resetSurface() {
    this.initial.forEach((grain, i) => Object.assign(this.grains[i], grain));
    this.field.fill(0); this.next.fill(0); this.quiet(); this.revision++;
  }

  update(input: SandSurfaceFlowInput): void {
    const validSize = [input.widthM, input.depthM, input.heightM].every(n => Number.isFinite(n) && n > 0);
    if (!Number.isFinite(input.timeS) || !validSize || !Number.isFinite(input.fill) || !Number.isFinite(input.slope)) {
      this.quiet(); this.lastTime = undefined; return;
    }
    // A repeated accepted sample may be rendered arbitrarily often; even its
    // changed UI values cannot advance this layer while the source is paused.
    if (input.timeS === this.lastTime) return;
    const time = input.timeS!, dt = this.lastTime === undefined ? 0 : time - this.lastTime;
    const dimensions = `${input.widthM}/${input.depthM}/${input.heightM}`;
    const fill = clamp(input.fill, 0, 1);
    const allowance = Math.min(input.widthM * 0.018, input.depthM * 0.018, input.heightM * 0.012) *
      clamp(Math.min(fill / 0.12, (1 - fill) / 0.08), 0, 1);
    if (allowance !== this.maxDisplacement) { this.maxDisplacement = allowance; this.revision++; }
    const changedDimensions = this.dimensions !== "" && this.dimensions !== dimensions;
    if (changedDimensions || dt < 0 || (fill <= 0 && !this.empty)) this.resetSurface();
    this.empty = fill <= 0;
    this.dimensions = dimensions;
    const slopeDelta = input.slope - this.lastSlope;
    this.lastSlope = input.slope;
    const first = this.lastTime === undefined;
    this.lastTime = time;
    if (first || changedDimensions || dt <= 0 || dt > 0.5 || fill <= 0) { this.quiet(); return; }
    const flow = Number.isFinite(input.flow) ? clamp(input.flow, 0, 1) : 0;
    if (flow === 0) { this.quiet(); return; }
    const velocity = Number.isFinite(input.velocityX) ? input.velocityX : 0;
    const direction = Math.abs(velocity) > 1e-5 ? Math.sign(velocity) :
      Math.abs(slopeDelta) > 1e-7 ? Math.sign(slopeDelta) : this.direction;
    if (!direction) { this.quiet(); return; }
    this.direction = direction;
    const speed = 0.05 + Math.sqrt(flow) * 0.35;
    for (let i = 0; i < this.grains.length; i++) {
      const grain = this.grains[i], mobile = this.mobile[i];
      grain.active = mobile > 0.04 ? flow * mobile : 0;
      if (grain.active === 0) continue;
      const travel = direction * (0.05 + (speed - 0.05) * this.rates[i]) * dt;
      grain.u = ((grain.u + 0.5 + travel) % 1 + 1) % 1 - 0.5;
      grain.rotation += travel * Math.PI * 2 * (6 + this.rates[i] * 8);
      grain.visibility = smooth((0.5 - Math.abs(grain.u)) / 0.045);
    }
    // Upwind transport plus divergence of an irregular local surface flux.
    // Equal source/sink neighbours form small erosion/deposition patches. The
    // height field never flows in v and stops exactly, retaining its last relief.
    const steps = Math.max(1, Math.ceil(dt * 120)), stepS = dt / steps;
    for (let step = 0; step < steps; step++) {
      const cfl = speed * stepS * (this.nx - 1), decay = Math.exp(-flow * stepS * 0.45);
      for (let z = 0; z < this.nz; z++) for (let x = 0; x < this.nx; x++) {
        const index = z * this.nx + x, upstream = x - direction;
        const old = this.field[index], upstreamHeight = upstream >= 0 && upstream < this.nx ? this.field[z * this.nx + upstream] : 0;
        const upstreamFlux = upstream >= 0 && upstream < this.nx ? this.flux[z * this.nx + upstream] : 0;
        const divergence = upstreamFlux - this.flux[index];
        this.next[index] = clamp(((1 - cfl) * old + cfl * upstreamHeight) * decay + divergence * flow * stepS * 3.5, -1, 1);
      }
      [this.field, this.next] = [this.next, this.field];
    }
    this.revision++;
  }

  /** Normalized u/v in; bounded metres out. No mutation or clock reads. */
  displacement(u: number, v: number): number {
    if (!Number.isFinite(u) || !Number.isFinite(v) || Math.abs(u) > 0.5 || Math.abs(v) > 0.5) return 0;
    const x = (u + 0.5) * (this.nx - 1), z = (v + 0.5) * (this.nz - 1);
    const x0 = Math.min(this.nx - 2, Math.floor(x)), z0 = Math.min(this.nz - 2, Math.floor(z));
    const a = smooth(x - x0), b = smooth(z - z0), index = z0 * this.nx + x0;
    const low = this.field[index] * (1 - a) + this.field[index + 1] * a;
    const high = this.field[index + this.nx] * (1 - a) + this.field[index + this.nx + 1] * a;
    return (low * (1 - b) + high * b) * this.maxDisplacement;
  }
}
