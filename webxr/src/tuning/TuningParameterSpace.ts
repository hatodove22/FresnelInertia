import type { DemoId } from "./RepresentativeDemos";

export type TuningSpace = "water" | "combined";
export interface AxisDefinition {
  key: string; label: string; min: number; max: number; paths: string[];
  /** Multiply the axis value for a coupled path; omitted paths use one. */
  pathScale?: Record<string, number>;
}
export interface ParameterDefinition { path: string; min: number; max: number }
export type TuningParameterContext =
  | { space: "water"; demo?: "water" }
  | { space: "combined"; demo?: DemoId; fixed: Record<string, number> };

// Keep the fraction available as well as its scale: the remote boundary's
// existing left-to-right multiply/divide and the mapper's scale differ by ULPs.
export const SAND_FRICTION_RATIO = Object.freeze({ numerator: 7, denominator: 11 });
const WATER_AXES: AxisDefinition[] = [
  { key: "resonance.master_gain", label: "振動の強さ", min: 0.1, max: 1, paths: ["resonance.master_gain"] },
  { key: "mass.damping_ratio_x", label: "水の減衰", min: 0.05, max: 1.5, paths: ["mass.damping_ratio_x", "mass.damping_ratio_y"] },
];
const TILT_AXES: AxisDefinition[] = [
  // Content-position cue gain in the coherent law, not the independent
  // mechanical/output limit (max_total_cmd_deg).
  { key: "tilt.max_tilt_deg", label: "内容物位置", min: 0, max: 10, paths: ["tilt.max_tilt_deg"] },
  { key: "tilt.k_cm", label: "上下慣性", min: 0, max: 1, paths: ["tilt.k_cm"] },
  { key: "tilt.k_tau", label: "重心・横慣性", min: 0, max: 1, paths: ["tilt.k_tau"] },
];
const AXES: Record<TuningSpace, AxisDefinition[]> = { water: WATER_AXES, combined: [...WATER_AXES, ...TILT_AXES] };
const SAND_FRICTION: AxisDefinition = {
  key: "mass.granular_static_friction", label: "砂の流れにくさ", min: 0.2, max: 0.9,
  paths: ["mass.granular_static_friction", "mass.granular_dynamic_friction"],
  pathScale: { "mass.granular_dynamic_friction": SAND_FRICTION_RATIO.numerator / SAND_FRICTION_RATIO.denominator },
};
// Water identifies phi*cm and phi*tau, not all three independently. The search
// fixes positive phi; the remote command boundary separately permits zero.
const FIXED_PHI: AxisDefinition = { key: "tilt.k_phi", label: "擬似力全体倍率", min: 0, max: 8, paths: ["tilt.k_phi"] };

export class TuningParameterError extends Error {}
function invalid(message: string): never { throw new TuningParameterError(message); }

/** Fresh definitions: consumers cannot mutate another caller's bounds/order. */
export function axisDefinitions(exploration: TuningSpace, material: DemoId = "water"): AxisDefinition[] {
  if (exploration !== "water" && exploration !== "combined") invalid("unknown exploration space");
  if (material !== "water" && material !== "marble" && material !== "sand") invalid("unknown representative demo");
  if (exploration === "water" && material !== "water") invalid("legacy water space cannot select another demo");
  return AXES[exploration].map((axis, index) => {
    const selected = index === 1 && material === "sand" ? SAND_FRICTION : axis;
    return { ...selected, paths: [...selected.paths],
      ...(material === "marble" && index === 1 ? { label: "転がりの減衰" } : {}),
      ...(selected.pathScale ? { pathScale: { ...selected.pathScale } } : {}) };
  });
}

function physicalDefinitions(axes: AxisDefinition[]): ParameterDefinition[] {
  return axes.flatMap(axis => axis.paths.map(path => {
    const scale = axis.pathScale?.[path] ?? 1;
    return { path, min: axis.min * scale, max: axis.max * scale };
  }));
}

/** Ordered physical paths, including fixed phi only for joint candidates.
 * These are search bounds, not a universal parser/remote acceptance policy. */
export function parameterDefinitions(exploration: TuningSpace, material: DemoId = "water"): ParameterDefinition[] {
  const axes = axisDefinitions(exploration, material);
  return physicalDefinitions(exploration === "combined" ? [...axes, FIXED_PHI] : axes);
}

/** The four tilt fields also follow the existing tilt_v1 readback order. */
export function tiltParameterDefinitions(): ParameterDefinition[] {
  return physicalDefinitions([...TILT_AXES, FIXED_PHI]);
}

/** Search-only fixed-coordinate validation; not the remote phi=0 policy. */
export function fixedParameterValues(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value))) invalid("fixed must be a plain object");
  const keys = FIXED_PHI.paths, own = Object.keys(value);
  if (own.length !== keys.length || own.some(key => !keys.includes(key)) || keys.some(key => !Object.hasOwn(value, key)))
    invalid("fixed contains missing or unknown fields");
  const result: Record<string, number> = {};
  for (const path of keys) {
    const number = (value as Record<string, unknown>)[path];
    if (typeof number !== "number" || !Number.isFinite(number) || number < FIXED_PHI.min || number > FIXED_PHI.max)
      invalid(`fixed.${path} is outside its parameter bounds`);
    if (number === 0) invalid("fixed.tilt.k_phi must be positive so both inertia axes remain active");
    result[path] = number;
  }
  return result;
}

/** Pure normalized-coordinate mapping. No sessions, inference, storage or IO.
 * Explicit context prevents today's UI/material from reinterpreting old points. */
export function normalizedParameterValues(normalized: readonly number[], context: TuningParameterContext = { space: "water" }): Record<string, number> {
  const axes = axisDefinitions(context.space, context.demo);
  if (!Array.isArray(normalized) || normalized.length !== axes.length ||
      !Array.from(normalized).every(value => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1))
    invalid(`point must contain exactly ${axes.length} finite normalized coordinates`);
  const coordinates = [...normalized];
  const values = context.space === "combined" ? fixedParameterValues(context.fixed) : {};
  axes.forEach((axis, index) => {
    const value = axis.min + coordinates[index] * (axis.max - axis.min);
    for (const path of axis.paths) values[path] = value * (axis.pathScale?.[path] ?? 1);
  });
  const result: Record<string, number> = {};
  for (const axis of [...axes, FIXED_PHI]) for (const path of axis.paths)
    if (Object.hasOwn(values, path)) result[path] = values[path];
  return result;
}
