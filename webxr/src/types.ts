export type MaterialFamily = "Liquid" | "Granular" | "Hybrid" | "Detented" | "Custom";
export type VisualContainerShape = "box" | "cylinder_bottle" | "tumbler_cup";

export interface ContainerPreset {
  preset: string;
  family: MaterialFamily;
  visual_shape?: VisualContainerShape;
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

export interface SpatialPanelState {
  shakeBoost: number;
  dampingPreview: number;
}

export interface DemoUiElements {
  presetSelect: HTMLSelectElement;
  shakeBoostSlider: HTMLInputElement;
  shakeBoostValue: HTMLOutputElement;
  dampingPreviewSlider: HTMLInputElement;
  dampingPreviewValue: HTMLOutputElement;
  stimulusSelect: HTMLSelectElement;
  conditionInput: HTMLInputElement;
  repeatInput: HTMLInputElement;
  trialStartStopButton: HTMLButtonElement;
  trialMarkButton: HTMLButtonElement;
  trialNextButton: HTMLButtonElement;
  trialElapsed: HTMLElement;
  exportFormatSelect: HTMLSelectElement;
  exportButton: HTMLButtonElement;
  orientationButton: HTMLButtonElement;
  xrButton: HTMLButtonElement;
  questButton: HTMLButtonElement;
  touchModeButton: HTMLButtonElement;
  tiltModeButton: HTMLButtonElement;
  handModeButton: HTMLButtonElement;
  resetButton: HTMLButtonElement;
  modeBadge: HTMLElement;
  familyReadout: HTMLElement;
  fillReadout: HTMLElement;
  tiltReadout: HTMLElement;
}
