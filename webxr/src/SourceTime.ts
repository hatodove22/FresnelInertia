/** Presentation advances on accepted source samples, never on render/audio time.
 * Classify only: each consumer owns its previous time, identity, missing-data
 * handling and material-specific reset. There is no shared mutable clock. */
export type SourceTimeStep =
  | { readonly kind: "missing"; readonly timeS: undefined; readonly elapsedS: 0 }
  | { readonly kind: "initial" | "duplicate" | "advance" | "rewind" | "gap";
      readonly timeS: number; readonly elapsedS: number };

export const MAX_PRESENTATION_GAP_S = 0.5;

/** Only `advance` permits integrating elapsedS. Exactly 0.5 s is accepted;
 * a longer gap or rewind requires the consumer's existing rebase behavior.
 * Source/session/counter changes and device millisecond wrap are not inferred. */
export function sourceTimeStep(previousS: number | undefined, currentS: number | undefined): SourceTimeStep {
  if (!Number.isFinite(currentS)) return { kind: "missing", timeS: undefined, elapsedS: 0 };
  const timeS = currentS!;
  if (previousS === undefined || !Number.isFinite(previousS)) return { kind: "initial", timeS, elapsedS: 0 };
  if (timeS === previousS) return { kind: "duplicate", timeS, elapsedS: 0 };
  const elapsedS = timeS - previousS;
  return { kind: elapsedS < 0 ? "rewind" : elapsedS > MAX_PRESENTATION_GAP_S ? "gap" : "advance", timeS, elapsedS };
}
