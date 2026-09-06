import type { ContainerPreset, MaterialFamily } from "../types";
import type { PreviewEngineModule } from "./generated/preview-engine.js";

export const previewPresets = ["granular_single_marble_box", "granular_sand_box", "liquid_small_box", "liquid_soda_bottle"] as const;
export type PreviewPreset = typeof previewPresets[number];
export type Triple = [number, number, number];
export type Quad = [number, number, number, number];

/** Synthetic or recorded body-frame specific force, never the phone's pose. */
export interface PreviewInput {
  dtS: number;
  accelG: Triple;
  gyroDps?: Triple;
}

/** Model result only: no measured force, physical pressure, PCM or actuator state. */
export interface PreviewFrame {
  source: "production-cpp-preview";
  abiVersion: 1;
  preset: PreviewPreset;
  family: MaterialFamily;
  timeS: number;
  frameCounter: number;
  eventsTotal: number;
  container: ContainerPreset["container"];
  parameters: { granularPile: boolean; staticFriction: number; dynamicFriction: number; dampingX: number; dampingY: number; rebound: number; masterGain: number; tiltGain: number };
  mass: {
    posNorm: [number, number]; velNormS: [number, number]; energy: number; fill: number;
    wallContact: Quad; wallImpactSpeedNormS: Quad;
    pileSlope: number; granularFlow: number; granularPileActive: boolean;
    pressure: { enabled: boolean; phase: "sealed" | "burst" | "spent"; charge: number; phaseS: number; remaining: number; burstSequence: number };
  };
  tilt: { thumbDeg: number; indexDeg: number; cgX: number; cgY: number; commonForceN: number; differentialTorqueNm: number; apparentMassKg: number };
  drive: { low: Quad; high: Quad; noise: Quad };
  channels: Quad;
  events: { type: number; name: string; wall: number; amplitude: number; durationMs: number; densityHz: number }[];
}

/** Each instance owns isolated C++ state. No USB, serial or HapticLink imports. */
export class PreviewEngine {
  private constructor(private readonly module: PreviewEngineModule) {}

  static async create(preset: PreviewPreset = "granular_single_marble_box"): Promise<PreviewEngine> {
    // Separate generated chunk; ordinary startup/connected hardware does not load it.
    const { default: createModule } = await import("./generated/preview-engine.js");
    const engine = new PreviewEngine(await createModule());
    if (engine.call("preview_abi_version") !== 1) throw new Error("Unsupported preview engine ABI");
    engine.loadPreset(preset);
    return engine;
  }

  private call(name: string, args: (number | string)[] = []): number {
    return this.module.ccall(name, "number", args.map(value => typeof value as "number" | "string"), args) as number;
  }

  loadPreset(preset: PreviewPreset): PreviewFrame {
    if (!this.call("preview_load_preset", [preset])) throw new Error(`Unknown C++ preview preset: ${preset}`);
    return this.snapshot();
  }

  /** Parameter application resets dynamics, matching a stopped reconfiguration. */
  setParam(path: string, value: number): PreviewFrame {
    if (!Number.isFinite(value) || !this.call("preview_set_param", [path, value])) {
      throw new Error(`Unsupported or invalid preview parameter: ${path}`);
    }
    return this.snapshot();
  }

  reset(): PreviewFrame {
    if (!this.call("preview_reset")) throw new Error("Preview engine is not configured");
    return this.snapshot();
  }

  step(input: PreviewInput): PreviewFrame {
    const args = [input.dtS, ...input.accelG, ...(input.gyroDps ?? [0, 0, 0])];
    if (args.length !== 7 || !args.every(Number.isFinite) || !this.call("preview_step", args)) {
      throw new Error("Preview input requires finite body-frame IMU and 0 < dtS <= 1");
    }
    return this.snapshot();
  }

  snapshot(): PreviewFrame {
    const frame = JSON.parse(this.module.ccall("preview_snapshot", "string", [], []) as string) as PreviewFrame | null;
    if (!frame || frame.source !== "production-cpp-preview" || frame.abiVersion !== 1) {
      throw new Error("Invalid C++ preview snapshot");
    }
    return frame;
  }
}
