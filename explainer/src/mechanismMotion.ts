/** Presentation commands, independent of device transports and firmware. */
export type MechanismMode = 'common' | 'differential' | 'impact';
export type FourPulses = [number, number, number, number];
export interface DevicePose { leftDeg: number; rightDeg: number; pulse: FourPulses }
export const CONTACT_LIMIT_DEG = 10;
const finite = (v: number) => Number.isFinite(v) ? v : 0;
export const contactAngle = (v: number) => Math.max(-CONTACT_LIMIT_DEG, Math.min(CONTACT_LIMIT_DEG, finite(v)));
export function normalizePose(pose: DevicePose): DevicePose {
  return {leftDeg: contactAngle(pose.leftDeg), rightDeg: contactAngle(pose.rightDeg),
    pulse: Array.from({length: 4}, (_, i) => Math.max(0, Math.min(1, finite(pose.pulse[i])))) as FourPulses};
}
/** Reversible deterministic teaching sequence; not measured actuator data. */
export function mechanismPose(mode: MechanismMode, time: number, manualAngle?: number): DevicePose {
  const t = Math.max(0, finite(time));
  const angle = manualAngle === undefined ? Math.sin(t * Math.PI / 3.5) * 10 : contactAngle(manualAngle);
  if (mode !== 'impact') return {leftDeg: angle, rightDeg: mode === 'common' ? angle : -angle, pulse: [0, 0, 0, 0]};
  const phase = (t + 1e-10) % 5.6;
  const channel = Math.min(3, Math.floor(phase / 1.4));
  const age = phase - channel * 1.4;
  const pulse = Array.from({length: 4}, (_, i) => i === channel ? Math.exp(-age * 4.8) : 0) as FourPulses;
  const impactAngle = manualAngle === undefined ? angle * .55 : angle;
  return {leftDeg: impactAngle, rightDeg: impactAngle, pulse};
}
