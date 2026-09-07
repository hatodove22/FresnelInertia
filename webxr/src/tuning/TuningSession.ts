import { PreferenceOptimizer } from "./PreferenceOptimizer";
import { demoDefinitions, type DemoId, type DemoPreset } from "./RepresentativeDemos";
import { axisDefinitions as parameterAxes, fixedParameterValues, normalizedParameterValues, TuningParameterError,
  type AxisDefinition, type TuningSpace } from "./TuningParameterSpace";
export { demoDefinitions, type DemoId, type DemoDefinition, type DemoPreset } from "./RepresentativeDemos";
export type { AxisDefinition, TuningSpace } from "./TuningParameterSpace";

export type SessionMode = "rehearsal" | "device";
export type Choice = "a" | "b" | "tie" | "skip";
export type Point = number[];
export interface TuningSessionOptions { space: "combined"; fixed: Record<string, number>; demo?: DemoId }
export interface TuningTrial { id: number; a: Point; b: Point }
export interface TuningObservation { a: Point; b: Point; preference: Exclude<Choice, "skip"> }
export interface TuningHistoryEntry { trial: TuningTrial; choice: Choice; note: string; at: string }
interface SessionFields {
  id: string;
  createdAt: string;
  mode: SessionMode;
  objective: string;
  reference: string;
  baseline: Point;
  incumbent: Point;
  trial: TuningTrial | null;
  observations: TuningObservation[];
  history: TuningHistoryEntry[];
  /** Fixed initial seed: proposal and blinded A/B order use separate streams. */
  seed: number;
}
/** Legacy comparisons retain their original three-value application contract. */
export interface TuningSessionV1 extends SessionFields { version: 1 }
/** Vibration/material and fingertip-tilt gains are one combined preference
 * search. Only the redundant pseudo-force multiplier stays fixed. */
export interface TuningSessionV2 extends SessionFields { version: 2; space: "combined"; fixed: Record<string, number> }
/** Material-specific joint search. The selected preset and second-axis meaning
 * are fixed for the entire history, not inferred from the current UI. */
export interface TuningSessionV3 extends SessionFields { version: 3; space: "combined"; fixed: Record<string, number>; demo: DemoId }
export type TuningSession = TuningSessionV1 | TuningSessionV2 | TuningSessionV3;

export const MAX_SESSION_HISTORY = 60;
const MAX_IMPORT_BYTES = 1024 * 1024;
const MAX_TEXT_LENGTH = 300;
const copyPoint = (point: readonly number[]): Point => [...point];
const samePoint = (a: readonly number[], b: readonly number[]) => a.length === b.length && a.every((value, index) => value === b[index]);
const copyTrial = (trial: TuningTrial): TuningTrial => ({ id: trial.id, a: copyPoint(trial.a), b: copyPoint(trial.b) });
function invalid(message: string): never { throw new Error(`Invalid tuning session: ${message}`); }
function inParameterSpace<T>(action: () => T): T {
  try { return action(); }
  catch (error) { if (error instanceof TuningParameterError) invalid(error.message); throw error; }
}

function text(value: unknown, name: string, maxLength = MAX_TEXT_LENGTH): string {
  if (typeof value !== "string" || value.length > maxLength) invalid(`${name} must be a string of at most ${maxLength} characters`);
  return value;
}
function date(value: unknown, name: string): string {
  const result = text(value, name, 24);
  const parsed = new Date(result);
  if (!Number.isFinite(parsed.valueOf()) || parsed.toISOString() !== result) invalid(`${name} must be a canonical ISO date`);
  return result;
}
function point(value: unknown, name: string, dimensions = 2): Point {
  if (!Array.isArray(value) || value.length !== dimensions || !Array.from(value).every(v => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1))
    invalid(`${name} must contain exactly ${dimensions} finite normalized coordinates`);
  return copyPoint(value);
}
function integer(value: unknown, name: string, max: number): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > max) invalid(`${name} is outside its integer bounds`);
  return value;
}
function mode(value: unknown): SessionMode {
  if (value !== "rehearsal" && value !== "device") invalid("unknown mode");
  return value;
}
function choice(value: unknown): Choice {
  if (value !== "a" && value !== "b" && value !== "tie" && value !== "skip") invalid("unknown choice");
  return value;
}
function object(value: unknown, keys: readonly string[], name: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value))) invalid(`${name} must be a plain object`);
  const own = Object.keys(value);
  if (own.length !== keys.length || own.some(key => !keys.includes(key)) || keys.some(key => !Object.hasOwn(value, key)))
    invalid(`${name} contains missing or unknown fields`);
  return value as Record<string, unknown>;
}
function combinedSpace(value: unknown): "combined" {
  if (value !== "combined") invalid("joint sessions require the combined exploration space");
  return value;
}
function demo(value: unknown): DemoId {
  if (value !== "water" && value !== "marble" && value !== "sand") invalid("unknown representative demo");
  return value;
}
/** Compatibility entry point; the definitions no longer belong to history. */
export function axisDefinitions(exploration: TuningSpace, material: DemoId = "water"): AxisDefinition[] {
  return inParameterSpace(() => parameterAxes(exploration, material));
}
export function getSessionSpace(session: TuningSession): TuningSpace {
  if (session.version === 1) return "water";
  if (session.version === 2 || session.version === 3) return combinedSpace(session.space);
  return invalid("unsupported version");
}
/** Older saved sessions always retain their original water context. */
export function getSessionDemo(session: TuningSession): DemoId {
  if (session.version === 1 || session.version === 2) return "water";
  if (session.version === 3) return demo(session.demo);
  return invalid("unsupported version");
}
export function getSessionPreset(session: TuningSession): DemoPreset {
  const material = getSessionDemo(session);
  return demoDefinitions.find(definition => definition.id === material)!.preset;
}
function fixedParameters(value: unknown): Record<string, number> {
  return inParameterSpace(() => fixedParameterValues(value));
}
function sessionOptions(value: unknown): TuningSessionOptions {
  const withDemo = value !== null && typeof value === "object" && Object.hasOwn(value, "demo");
  const raw = object(value, ["space", "fixed", ...(withDemo ? ["demo"] : [])], "options"), exploration = combinedSpace(raw.space);
  return { space: exploration, fixed: fixedParameters(raw.fixed), ...(withDemo ? { demo: demo(raw.demo) } : {}) };
}
function trial(value: unknown, name: string, dimensions: number): TuningTrial {
  const raw = object(value, ["id", "a", "b"], name);
  const id = integer(raw.id, `${name}.id`, MAX_SESSION_HISTORY);
  if (id < 1) invalid(`${name}.id must start at one`);
  const a = point(raw.a, `${name}.a`, dimensions), b = point(raw.b, `${name}.b`, dimensions);
  if (samePoint(a, b)) invalid(`${name} compares identical candidates`);
  return { id, a, b };
}
function hasIncumbent(pair: TuningTrial, incumbent: Point) {
  return samePoint(pair.a, incumbent) || samePoint(pair.b, incumbent);
}

/** Validate into fresh known-field objects. The history is authoritative: its
 * votes and consecutive incumbent chain must agree with every summary field. */
function validated(value: unknown, expectedMode?: SessionMode, allowPending = false): TuningSession {
  const version = (value as Partial<TuningSession> | null)?.version;
  if (version !== 1 && version !== 2 && version !== 3 && value && typeof value === "object") invalid("unsupported version");
  const raw = object(value, ["version", "id", "createdAt", "mode", "objective", "reference", "baseline",
    "incumbent", "trial", "observations", "history", "seed", ...(version === 2 || version === 3 ? ["space", "fixed"] : []),
    ...(version === 3 ? ["demo"] : [])], "session");
  const exploration = version === 2 || version === 3 ? combinedSpace(raw.space) : "water";
  const fixed = version === 2 || version === 3 ? fixedParameters(raw.fixed) : undefined;
  const material = version === 3 ? demo(raw.demo) : "water";
  const dimensions = axisDefinitions(exploration, material).length;
  const id = text(raw.id, "id", 96);
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{1,95}$/.test(id)) invalid("invalid id");
  const createdAt = date(raw.createdAt, "createdAt"), sessionMode = mode(raw.mode);
  if (expectedMode !== undefined && mode(expectedMode) !== sessionMode) invalid("session mode does not match this workspace");
  const objective = text(raw.objective, "objective"), reference = text(raw.reference, "reference");
  const baseline = point(raw.baseline, "baseline", dimensions), savedIncumbent = point(raw.incumbent, "incumbent", dimensions);
  const seed = integer(raw.seed, "seed", 0xffffffff);
  if (!Array.isArray(raw.history) || raw.history.length > MAX_SESSION_HISTORY) invalid("history exceeds 60 trials");
  if (!Array.isArray(raw.observations) || raw.observations.length > MAX_SESSION_HISTORY) invalid("observations exceed 60 votes");
  const history: TuningHistoryEntry[] = [], observations: TuningObservation[] = [];
  let incumbent = copyPoint(baseline), previousAt = createdAt;
  for (const [index, value] of raw.history.entries()) {
    const entry = object(value, ["trial", "choice", "note", "at"], `history[${index}]`);
    const pair = trial(entry.trial, `history[${index}].trial`, dimensions), chosen = choice(entry.choice);
    if (pair.id !== index + 1 || !hasIncumbent(pair, incumbent)) invalid("history is not a consecutive incumbent comparison");
    const note = text(entry.note, "note"), at = date(entry.at, "at");
    if (at < previousAt) invalid("history timestamps precede the session or previous vote");
    previousAt = at;
    history.push({ trial: pair, choice: chosen, note, at });
    if (chosen !== "skip") observations.push({ a: copyPoint(pair.a), b: copyPoint(pair.b), preference: chosen });
    if (chosen === "a" || chosen === "b") incumbent = copyPoint(pair[chosen]);
  }
  if (!samePoint(incumbent, savedIncumbent)) invalid("incumbent disagrees with history");
  if (observations.length !== raw.observations.length) invalid("vote count disagrees with history");
  for (const [index, value] of raw.observations.entries()) {
    const observation = object(value, ["a", "b", "preference"], `observations[${index}]`);
    const a = point(observation.a, "observation.a", dimensions), b = point(observation.b, "observation.b", dimensions);
    const preference = choice(observation.preference), expected = observations[index];
    if (preference === "skip" || preference !== expected.preference || !samePoint(a, expected.a) || !samePoint(b, expected.b))
      invalid("observation disagrees with the recorded comparison");
  }
  const activeTrial = raw.trial === null ? null : trial(raw.trial, "trial", dimensions);
  if (history.length === MAX_SESSION_HISTORY && activeTrial !== null) invalid("completed session cannot have an active trial");
  if (history.length < MAX_SESSION_HISTORY && activeTrial === null && !allowPending) invalid("incomplete session must preserve its active A/B trial");
  if (activeTrial && (activeTrial.id !== history.length + 1 || !hasIncumbent(activeTrial, incumbent)))
    invalid("active trial does not match the current incumbent/history");
  const fields: SessionFields = { id, createdAt, mode: sessionMode, objective, reference, baseline, incumbent,
    trial: activeTrial, observations, history, seed };
  if (version === 3) return { version: 3, ...fields, space: "combined", fixed: fixed!, demo: material };
  return version === 2 ? { version: 2, ...fields, space: "combined", fixed: fixed! } : { version: 1, ...fields };
}

function mixedSeed(seed: number, trialId: number, stream: number): number {
  let value = (seed ^ Math.imul(trialId, 0x9e3779b9) ^ stream) >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x85ebca6b);
  value = Math.imul(value ^ (value >>> 13), 0xc2b2ae35);
  return (value ^ (value >>> 16)) >>> 0;
}

/** Without a session (or for v1), return only the original water values. V2/v3
 * map all five joint coordinates plus their explicitly saved fixed phi. Sand
 * couples static/dynamic friction instead of the pile model's unused damping.
 * This function cannot apply values or start any hardware output. */
export function parameterValues(normalized: readonly number[], session?: TuningSession): Record<string, number> {
  const exploration = session ? getSessionSpace(session) : "water";
  return inParameterSpace(() => normalizedParameterValues(normalized, exploration === "combined" && session && session.version !== 1
    ? { space: exploration, demo: getSessionDemo(session), fixed: session.fixed } : { space: "water" }));
}

export function createSession(sessionMode: SessionMode, baseline: readonly number[], objective: string,
  reference: string, seed = Date.now() >>> 0, options?: TuningSessionOptions): TuningSession {
  const createdAt = new Date().toISOString();
  const selected = options === undefined ? undefined : sessionOptions(options);
  const dimensions = axisDefinitions(selected?.space ?? "water", selected?.demo).length;
  const fields: SessionFields = { id: `tuning-${Date.now().toString(36)}-${integer(seed, "seed", 0xffffffff).toString(36)}${selected?.demo ? `-${selected.demo}` : ""}`,
    createdAt, mode: mode(sessionMode), objective: text(objective, "objective"), reference: text(reference, "reference"),
    baseline: point(baseline, "baseline", dimensions), incumbent: point(baseline, "baseline", dimensions), trial: null, observations: [], history: [], seed };
  const initial: TuningSession = selected?.demo ? { version: 3, ...fields, space: "combined", fixed: selected.fixed, demo: selected.demo } :
    selected ? { version: 2, ...fields, space: "combined", fixed: selected.fixed } : { version: 1, ...fields };
  return nextTrial(initial);
}

/** Idempotent for an in-progress comparison. Reloading, rendering, or pressing
 * Next twice must never replace an already presented A/B pair. No autoplay. */
export function nextTrial(state: TuningSession): TuningSession {
  const result = validated(state, undefined, true);
  if (result.trial || result.history.length === MAX_SESSION_HISTORY) return result;
  const dimensions = axisDefinitions(getSessionSpace(result), getSessionDemo(result)).length;
  const optimizer = new PreferenceOptimizer(dimensions);
  optimizer.fit(result.observations);
  const id = result.history.length + 1;
  const exclude = [copyPoint(result.baseline), ...result.history.flatMap(entry => [copyPoint(entry.trial.a), copyPoint(entry.trial.b)])];
  const proposed = optimizer.suggest(result.incumbent, mixedSeed(result.seed, id, 0x1b873593), exclude);
  const candidate = point(proposed.point, "proposal", dimensions);
  if (samePoint(candidate, result.incumbent)) invalid("optimizer returned the incumbent as its challenger");
  const incumbentIsA = (mixedSeed(result.seed, id, 0x5bd1e995) & 1) === 0;
  result.trial = { id, a: copyPoint(incumbentIsA ? result.incumbent : candidate), b: copyPoint(incumbentIsA ? candidate : result.incumbent) };
  return result;
}

export function recordChoice(state: TuningSession, selected: Choice, note = ""): TuningSession {
  const result = validated(state), chosen = choice(selected), memo = text(note, "note");
  const pair = result.trial;
  if (!pair) invalid("there is no active comparison to record");
  const previousAt = result.history.at(-1)?.at ?? result.createdAt;
  const at = new Date(Math.max(Date.now(), Date.parse(previousAt))).toISOString();
  result.history.push({ trial: copyTrial(pair), choice: chosen, note: memo, at });
  if (chosen !== "skip") result.observations.push({ a: copyPoint(pair.a), b: copyPoint(pair.b), preference: chosen });
  if (chosen === "a" || chosen === "b") result.incumbent = copyPoint(pair[chosen]);
  result.trial = null;
  return nextTrial(result);
}

export function parseSession(json: string, expectedMode?: SessionMode): TuningSession {
  if (typeof json !== "string" || json.length > MAX_IMPORT_BYTES || new TextEncoder().encode(json).byteLength > MAX_IMPORT_BYTES)
    invalid("import exceeds 1 MiB");
  let value: unknown;
  try { value = JSON.parse(json); } catch { invalid("malformed JSON"); }
  return validated(value, expectedMode);
}
