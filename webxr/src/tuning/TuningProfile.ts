import { axisDefinitions, demoDefinitions, getSessionDemo, getSessionPreset, parameterValues, parseSession,
  type DemoId, type SessionMode, type TuningSession } from "./TuningSession";

export type { DemoId } from "./TuningSession";
export const PROFILE_STORAGE_PREFIX = "haptic-tuning-profile-v1:";
export type ProfileReviewStatus = "rehearsal-only" | "not-evaluated" | "self-reported-preference";

/** A portable selected setting, NOT training data, measured device readback,
 * an authorization to start output, or a claim of tactile/physical validation.
 * createdAt preserves the source session's creation time, not export time.
 * comparisonCount counts A/B/tie judgments; skipped attempts do not count. */
export interface TuningProfile {
  format: "haptic-tuning-profile-v1";
  sourceSession: { id: string; version: 2 | 3; mode: SessionMode };
  demo: DemoId;
  preset: string;
  objective: string;
  reference: string;
  createdAt: string;
  comparisonCount: number;
  reviewStatus: ProfileReviewStatus;
  parameters: Record<string, number>;
}

const MAX_PROFILE_BYTES = 16384;
const COMMON_PATHS = ["resonance.master_gain", "tilt.max_tilt_deg", "tilt.k_cm", "tilt.k_tau", "tilt.k_phi"] as const;
function invalid(message: string): never { throw new Error(`Invalid tuning profile: ${message}`); }
function object(value: unknown, keys: readonly string[], name: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value))) invalid(`${name} must be a plain object`);
  const own = Reflect.ownKeys(value);
  if (own.length !== keys.length || own.some(key => typeof key !== "string" || !keys.includes(key)) ||
      keys.some(key => !Object.hasOwn(value, key))) invalid(`${name} contains missing or unknown fields`);
  for (const key of keys) if (!Object.hasOwn(Object.getOwnPropertyDescriptor(value, key)!, "value"))
    invalid(`${name} must contain data fields`);
  return value as Record<string, unknown>;
}
function text(value: unknown, name: string, maximum = 300): string {
  if (typeof value !== "string" || value.length > maximum) invalid(`${name} is not bounded text`);
  return value;
}
function demo(value: unknown): DemoId {
  const definition = demoDefinitions.find(definition => definition.id === value);
  if (!definition) invalid("unsupported demo");
  return definition.id;
}
function reviewStatus(mode: SessionMode, count: number): ProfileReviewStatus {
  return mode === "rehearsal" ? "rehearsal-only" : count === 0 ? "not-evaluated" : "self-reported-preference";
}

/** Use the same path bounds as the session mapper. Target baselines may retain
 * their shipped x/y differences: transfer never silently re-fits or couples
 * a material-specific pair. No values are clipped or numerically coerced. */
function parameters(value: unknown, selectedDemo: DemoId, requireCoupled = true): Record<string, number> {
  const definitions = axisDefinitions("combined", selectedDemo);
  const limits = definitions.flatMap(axis => axis.paths.map(path => {
    const scale = axis.pathScale?.[path] ?? 1;
    return { path, min: axis.min * scale, max: axis.max * scale };
  }));
  limits.push({ path: "tilt.k_phi", min: 0, max: 8 });
  if (limits.length !== 7 || new Set(limits.map(limit => limit.path)).size !== 7) invalid("unsupported parameter definition");
  const raw = object(value, limits.map(limit => limit.path), "parameters"), result: Record<string, number> = {};
  for (const { path, min, max } of limits) {
    const value = raw[path];
    if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max ||
        (path === "tilt.k_phi" && value === 0)) invalid(`parameter ${path} is outside its bounds`);
    result[path] = value;
  }
  if (requireCoupled) for (const axis of definitions) {
    const first = axis.paths[0], unscaled = result[first] / (axis.pathScale?.[first] ?? 1);
    for (const path of axis.paths.slice(1)) {
      const expected = unscaled * (axis.pathScale?.[path] ?? 1);
      if (Math.abs(result[path] - expected) > Math.max(1e-9, Math.abs(expected) * 1e-9))
        invalid(`parameter ${path} disagrees with the coupled material axis`);
    }
  }
  return result;
}

function validated(value: unknown): TuningProfile {
  const raw = object(value, ["format", "sourceSession", "demo", "preset", "objective", "reference", "createdAt",
    "comparisonCount", "reviewStatus", "parameters"], "profile");
  if (raw.format !== "haptic-tuning-profile-v1") invalid("unsupported format");
  const source = object(raw.sourceSession, ["id", "version", "mode"], "sourceSession");
  const id = text(source.id, "sourceSession.id", 96);
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{1,95}$/.test(id)) invalid("invalid source session id");
  if (source.version !== 2 && source.version !== 3) invalid("source version must retain all seven parameters");
  if (source.mode !== "device" && source.mode !== "rehearsal") invalid("unsupported source mode");
  const selectedDemo = demo(raw.demo);
  if (source.version === 2 && selectedDemo !== "water") invalid("v2 source sessions only describe water");
  const preset = text(raw.preset, "preset", 96);
  if (preset !== demoDefinitions.find(definition => definition.id === selectedDemo)!.preset) invalid("demo and preset disagree");
  const createdAt = text(raw.createdAt, "createdAt", 24), date = new Date(createdAt);
  if (!Number.isFinite(date.valueOf()) || date.toISOString() !== createdAt) invalid("createdAt must be a canonical ISO date");
  const count = raw.comparisonCount;
  if (typeof count !== "number" || !Number.isInteger(count) || count < 0 || count > 60) invalid("comparisonCount is outside 0..60");
  const status = reviewStatus(source.mode, count);
  if (raw.reviewStatus !== status) invalid("reviewStatus disagrees with source mode or comparisonCount");
  return { format: "haptic-tuning-profile-v1", sourceSession: { id, version: source.version, mode: source.mode },
    demo: selectedDemo, preset, objective: text(raw.objective, "objective"), reference: text(raw.reference, "reference"),
    createdAt, comparisonCount: count, reviewStatus: status, parameters: parameters(raw.parameters, selectedDemo) };
}

/** V2 water and V3 material sessions are supported. V1 is deliberately rejected:
 * its three-value history never saved tilt settings, so reconstructing seven
 * selected values from today's defaults would invent historical information. */
export function createProfile(session: TuningSession): TuningProfile {
  const state = parseSession(JSON.stringify(session));
  if (state.version === 1) invalid("legacy v1 has no saved tilt values; start a new session to export a complete profile");
  return validated({ format: "haptic-tuning-profile-v1", sourceSession: { id: state.id, version: state.version, mode: state.mode },
    demo: getSessionDemo(state), preset: getSessionPreset(state), objective: state.objective, reference: state.reference,
    createdAt: state.createdAt, comparisonCount: state.observations.length,
    reviewStatus: reviewStatus(state.mode, state.observations.length), parameters: parameterValues(state.incumbent, state) });
}

export function parseProfile(json: string): TuningProfile {
  if (typeof json !== "string" || json.length > MAX_PROFILE_BYTES || new TextEncoder().encode(json).byteLength > MAX_PROFILE_BYTES)
    invalid("import exceeds 16 KiB");
  let value: unknown;
  try { value = JSON.parse(json); } catch { invalid("malformed JSON"); }
  return validated(value);
}

export function serializeProfile(profile: TuningProfile): string {
  return JSON.stringify(validated(profile), null, 2);
}

/** Returns only seven configuration values. Same-demo reuse is exact; changing
 * material copies common vibration/tilt values onto the caller's independently
 * obtained target shipped baseline, keeping target damping/friction untouched.
 * It does not copy votes, change mode, save, apply, or start any output. */
export function profileParametersFor(profile: TuningProfile, targetDemo: DemoId,
  targetBaselineValues: Record<string, number>): Record<string, number> {
  const source = validated(profile), target = demo(targetDemo), baseline = parameters(targetBaselineValues, target, false);
  if (source.demo === target) return { ...source.parameters };
  for (const path of COMMON_PATHS) baseline[path] = source.parameters[path];
  return baseline;
}
