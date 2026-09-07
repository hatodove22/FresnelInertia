/** Explicit material context: normalized coordinates are never portable votes
 * between demos, even when two demos happen to share parameter paths. */
export type DemoId = "water" | "marble" | "sand";
export type DemoPreset = "liquid_small_box" | "granular_single_marble_box" | "granular_sand_pile_box";
export interface DemoDefinition { readonly id: DemoId; readonly label: string; readonly preset: DemoPreset }
export const demoDefinitions: readonly DemoDefinition[] = Object.freeze([
  Object.freeze({ id: "water" as const, label: "水", preset: "liquid_small_box" }),
  Object.freeze({ id: "marble" as const, label: "ビー玉", preset: "granular_single_marble_box" }),
  Object.freeze({ id: "sand" as const, label: "砂", preset: "granular_sand_pile_box" }),
]);
