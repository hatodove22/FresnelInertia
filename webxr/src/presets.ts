import granularBeadBox from "../../presets/granular_bead_box.json";
import granularCoinBox from "../../presets/granular_coin_box.json";
import granularSandBox from "../../presets/granular_sand_box.json";
import hybridIceWater from "../../presets/hybrid_ice_water.json";
import liquidDenseJar from "../../presets/liquid_dense_jar.json";
import liquidHalfTube from "../../presets/liquid_half_tube.json";
import liquidSmallBox from "../../presets/liquid_small_box.json";
import type { ContainerPreset, MaterialFamily, VisualContainerShape } from "./types";

const rawPresets = [
  liquidSmallBox,
  liquidDenseJar,
  liquidHalfTube,
  granularCoinBox,
  granularSandBox,
  granularBeadBox,
  hybridIceWater
];

const families = new Set<MaterialFamily>(["Liquid", "Granular", "Hybrid", "Detented", "Custom"]);

function asPreset(value: unknown): ContainerPreset {
  const candidate = value as Partial<ContainerPreset> & { visual_shape?: VisualContainerShape };
  if (!candidate.preset || !candidate.family || !families.has(candidate.family)) {
    throw new Error("Invalid haptics preset metadata");
  }
  const container = candidate.container;
  if (!container?.span_x_m || !container.span_y_m || !container.span_z_m || container.fill === undefined) {
    throw new Error(`Preset ${candidate.preset} is missing container dimensions`);
  }
  return {
    preset: candidate.preset,
    family: candidate.family,
    visual_shape: candidate.visual_shape,
    container: {
      span_x_m: container.span_x_m,
      span_y_m: container.span_y_m,
      span_z_m: container.span_z_m,
      fill: container.fill,
      headspace: container.headspace,
      viscosity: container.viscosity,
      particle_count: container.particle_count,
      particle_hardness: container.particle_hardness
    }
  };
}

const basePresets = rawPresets.map(asPreset);
const denseJarBase = asPreset(liquidDenseJar);
const liquidBoxBase = asPreset(liquidSmallBox);
const bottlePreset: ContainerPreset = {
  ...denseJarBase,
  preset: "liquid_cylinder_bottle",
  visual_shape: "cylinder_bottle",
  container: {
    ...denseJarBase.container,
    span_x_m: 0.07,
    span_y_m: 0.07,
    span_z_m: 0.09,
    fill: 0.62
  }
};
const tumblerPreset: ContainerPreset = {
  ...liquidBoxBase,
  preset: "liquid_plastic_tumbler",
  visual_shape: "tumbler_cup",
  container: {
    ...liquidBoxBase.container,
    span_x_m: 0.07,
    span_y_m: 0.07,
    span_z_m: 0.07,
    fill: 0.52,
    viscosity: 0.24
  }
};

export const presets = [basePresets[0], bottlePreset, tumblerPreset, ...basePresets.slice(1)];

export function findPreset(name: string): ContainerPreset {
  return presets.find((preset) => preset.preset === name) ?? presets[0];
}
