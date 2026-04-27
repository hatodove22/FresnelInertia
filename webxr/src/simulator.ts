import type { ContainerPreset, LocalContentState, TiltState } from "./types";
import type { SpatialPanelState } from "./types";

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const mix = (from: number, to: number, factor: number) => from + (to - from) * factor;

export class VisualSimulator {
  private content: LocalContentState = {
    surfaceOffsetX: 0,
    surfaceOffsetY: 0,
    surfaceVelocityX: 0,
    surfaceVelocityY: 0,
    agitation: 0,
    particleSpread: 0.2,
    impactPulse: 0,
    wavePrimary: 0,
    waveSecondary: 0
  };

  private previousTilt: TiltState = { x: 0, y: 0 };
  private phase = 0;

  update(preset: ContainerPreset, tilt: TiltState, dt: number, panelState?: SpatialPanelState): LocalContentState {
    const viscosity = preset.container.viscosity ?? 0.12;
    const particleCount = preset.container.particle_count ?? 0;
    const hardness = preset.container.particle_hardness ?? 0.3;
    const fill = preset.container.fill;
    const familyGain = preset.family === "Liquid" ? 0.86 : preset.family === "Hybrid" ? 0.64 : 0.42;
    const deltaTilt = Math.hypot(tilt.x - this.previousTilt.x, tilt.y - this.previousTilt.y);
    const shakeBoost = 0.65 + (panelState?.shakeBoost ?? 0.35) * 1.4;
    const dampingPreview = panelState?.dampingPreview ?? 0.5;
    const targetX = clamp(tilt.x * familyGain, -0.92, 0.92);
    const targetY = clamp(tilt.y * familyGain, -0.92, 0.92);
    const naturalHz = mix(2.8, 1.15, clamp(viscosity, 0, 1)) * mix(1.18, 0.82, fill);
    const omega = naturalHz * Math.PI * 2;
    const damping = mix(0.34, 0.92, clamp(viscosity, 0, 1)) * mix(0.7, 1.3, dampingPreview);

    this.content.surfaceVelocityX += (targetX - this.content.surfaceOffsetX) * omega * omega * dt;
    this.content.surfaceVelocityY += (targetY - this.content.surfaceOffsetY) * omega * omega * dt;
    this.content.surfaceVelocityX *= Math.exp(-damping * omega * dt);
    this.content.surfaceVelocityY *= Math.exp(-damping * omega * dt);
    this.content.surfaceOffsetX = clamp(this.content.surfaceOffsetX + this.content.surfaceVelocityX * dt, -0.98, 0.98);
    this.content.surfaceOffsetY = clamp(this.content.surfaceOffsetY + this.content.surfaceVelocityY * dt, -0.98, 0.98);

    this.content.agitation = mix(
      this.content.agitation,
      clamp(deltaTilt * 13 * shakeBoost + Math.hypot(this.content.surfaceVelocityX, this.content.surfaceVelocityY) * 0.1, 0, 1),
      clamp(dt * 4.6, 0.02, 0.25)
    );
    const wallContact = Math.max(Math.abs(this.content.surfaceOffsetX), Math.abs(this.content.surfaceOffsetY));
    this.content.impactPulse = mix(
      this.content.impactPulse,
      clamp((wallContact - 0.72) * 3.6 + deltaTilt * hardness * 5.2, 0, 1),
      clamp(dt * 8.0, 0.04, 0.44)
    );
    this.content.particleSpread = mix(
      this.content.particleSpread,
      clamp(0.16 + particleCount * 0.48 + hardness * this.content.agitation * 0.42 + wallContact * 0.16, 0.14, 0.96),
      clamp(dt * mix(2.6, 6.5, hardness), 0.02, 0.28)
    );
    this.phase += dt * mix(2.5, 7.2, this.content.agitation);
    this.content.wavePrimary = Math.sin(this.phase * mix(1.0, 1.8, 1 - viscosity)) * this.content.agitation;
    this.content.waveSecondary = Math.cos(this.phase * 1.73 + fill * 2.1) * this.content.agitation;

    this.previousTilt = { ...tilt };
    return { ...this.content };
  }
}
