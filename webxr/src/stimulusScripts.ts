import type { TiltState } from "./types";

export type StimulusScriptName = "manual" | "gentle_roll" | "wall_tap" | "swirl" | "settle";

export const stimulusScripts: Array<{ value: StimulusScriptName; label: string }> = [
  { value: "manual", label: "Manual" },
  { value: "gentle_roll", label: "Gentle roll" },
  { value: "wall_tap", label: "Wall tap" },
  { value: "swirl", label: "Swirl" },
  { value: "settle", label: "Settle" }
];

const tau = Math.PI * 2;

export function scriptedTilt(script: StimulusScriptName, elapsedSeconds: number): TiltState {
  if (script === "manual") {
    return { x: 0, y: 0 };
  }

  if (script === "gentle_roll") {
    const phase = (elapsedSeconds % 4.8) / 4.8;
    return {
      x: Math.sin(phase * tau) * 0.34,
      y: Math.sin(phase * tau + Math.PI * 0.5) * 0.18
    };
  }

  if (script === "wall_tap") {
    const cycle = elapsedSeconds % 1.4;
    const direction = Math.floor(elapsedSeconds / 1.4) % 2 === 0 ? 1 : -1;
    const attack = cycle < 0.1 ? cycle / 0.1 : Math.max(0, 1 - (cycle - 0.1) / 0.34);
    return {
      x: direction * attack * 0.86,
      y: Math.sin(cycle * 18) * attack * 0.08
    };
  }

  if (script === "swirl") {
    const phase = (elapsedSeconds % 3.2) / 3.2;
    const wobble = Math.sin(elapsedSeconds * 3.7) * 0.05;
    return {
      x: Math.sin(phase * tau) * 0.52,
      y: Math.cos(phase * tau) * 0.42 + wobble
    };
  }

  const cycle = elapsedSeconds % 5.0;
  const decay = Math.exp(-cycle * 1.15);
  return {
    x: Math.sin(cycle * 7.2) * 0.42 * decay,
    y: Math.cos(cycle * 5.4) * 0.24 * decay
  };
}
