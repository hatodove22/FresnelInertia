import { getSessionDemo, getSessionPreset, parameterValues, parseSession, type TuningSession } from "./TuningSession";
import { parseProfile, profileReviewStatus, type TuningProfile } from "./TuningProfile";

/** The only history-to-profile adapter. Portable profile readers do not import
 * sessions or the optimizer. V1 cannot supply historically unsaved tilt values. */
export function createProfile(session: TuningSession): TuningProfile {
  const state = parseSession(JSON.stringify(session));
  if (state.version === 1) throw new Error("Invalid tuning profile: legacy v1 has no saved tilt values; start a new session to export a complete profile");
  return parseProfile(JSON.stringify({ format: "haptic-tuning-profile-v1", sourceSession: { id: state.id, version: state.version, mode: state.mode },
    demo: getSessionDemo(state), preset: getSessionPreset(state), objective: state.objective, reference: state.reference,
    createdAt: state.createdAt, comparisonCount: state.observations.length,
    reviewStatus: profileReviewStatus(state.mode, state.observations.length), parameters: parameterValues(state.incumbent, state) }));
}
