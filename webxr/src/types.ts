export type MaterialFamily = "Liquid" | "Granular" | "Hybrid" | "Detented" | "Custom";

export interface ContainerPreset {
  preset: string;
  family: MaterialFamily;
  container: {
    span_x_m: number;
    span_y_m: number;
    span_z_m: number;
    fill: number;
    headspace?: number;
    viscosity?: number;
    particle_count?: number;
    particle_hardness?: number;
  };
}

export interface TiltState {
  x: number;
  y: number;
}

export interface LocalContentState {
  surfaceOffsetX: number;
  surfaceOffsetY: number;
  surfaceVelocityX: number;
  surfaceVelocityY: number;
  agitation: number;
  particleSpread: number;
  impactPulse: number;
  wavePrimary: number;
  waveSecondary: number;
}

export interface VisualRuntime {
  preset: ContainerPreset;
  tilt: TiltState;
  content: LocalContentState;
}

export interface DemoUiElements {
  presetSelect: HTMLSelectElement;
  orientationButton: HTMLButtonElement;
  xrButton: HTMLButtonElement;
  questButton: HTMLButtonElement;
  modeBadge: HTMLElement;
  familyReadout: HTMLElement;
  fillReadout: HTMLElement;
  tiltReadout: HTMLElement;
}
