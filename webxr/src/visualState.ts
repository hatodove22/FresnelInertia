import type { DeviceSnapshot } from "./link/HapticLink";
import type { ContainerPreset, MaterialFamily } from "./types";

/** Aggregate firmware state, not measured positions of individual visible grains. */
export interface DeviceContentState {
  massX: number;
  massY: number;
  velocityX: number;
  velocityY: number;
  energy: number;
  fill: number;
  slosh?: number;
}

/** THREE XYZ-compatible, gravity-referenced angles; there is no absolute yaw. */
export interface DeviceOrientation {
  pitchRad: number;
  rollRad: number;
}

export interface ContainerSize { x: number; y: number; z: number }

/** A presentation accepts applied values; it does not own commands or simulation. */
export interface DeviceVisualSink {
  setPreset(preset: ContainerPreset, useResolvedDimensions: boolean): void;
  setDeviceState(state: DeviceContentState | null): void;
  setDeviceOrientation(orientation: DeviceOrientation | null): void;
  /** Body-frame high-pass acceleration, in g; presentation only. */
  setDeviceAcceleration?(acceleration: readonly number[] | null, elapsedSeconds?: number): void;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const finite = (value: number, fallback = 0) => Number.isFinite(value) ? value : fallback;
const families = new Set(["Liquid", "Granular", "Hybrid", "Detented", "Custom"]);

/** Display only reported configuration; never substitute local preset JSON. */
export function resolvedPresetFromSnapshot(snapshot: DeviceSnapshot | null): ContainerPreset | null {
  const resolved = snapshot?.resolved;
  const config = resolved?.container;
  if (!snapshot || !resolved || !config || !families.has(String(resolved.family)) ||
      ![config.span_x_m, config.span_y_m, config.span_z_m, config.fill].every(Number.isFinite) ||
      Number(config.span_x_m) <= 0 || Number(config.span_y_m) <= 0 || Number(config.span_z_m) <= 0) return null;
  return {
    preset: snapshot.preset, family: resolved.family as MaterialFamily, visual_shape: "box",
    container: {
      span_x_m: Number(config.span_x_m), span_y_m: Number(config.span_y_m), span_z_m: Number(config.span_z_m),
      fill: Number(config.fill), headspace: config.headspace, viscosity: config.viscosity,
      particle_count: config.particle_count, particle_hardness: config.particle_hardness
    }
  };
}

export function sanitizeDeviceContent(state: DeviceContentState): DeviceContentState {
  return {
    massX: clamp(finite(state.massX), -1, 1), massY: clamp(finite(state.massY), -1, 1),
    velocityX: finite(state.velocityX), velocityY: finite(state.velocityY),
    energy: clamp(finite(state.energy), 0, 1), fill: clamp(finite(state.fill), 0, 1),
    slosh: state.slosh === undefined ? undefined : clamp(finite(state.slosh), 0, 1)
  };
}

/** Missing motion holds the previous scene; it is not permission to simulate. */
export function contentFromSnapshot(snapshot: DeviceSnapshot, appliedFill: number): DeviceContentState | null {
  const mass = snapshot.mass;
  if (!mass?.pos_norm || !mass.vel_norm_s) return null;
  return sanitizeDeviceContent({
    massX: mass.pos_norm[0], massY: mass.pos_norm[1],
    velocityX: mass.vel_norm_s[0], velocityY: mass.vel_norm_s[1],
    energy: mass.energy ?? 0, fill: mass.fill ?? appliedFill
  });
}

/** Call once per accepted snapshot, never once per animation frame. */
export function orientationFromSnapshot(snapshot: DeviceSnapshot, previousGravity: readonly number[] | null) {
  const raw = snapshot.imu?.valid && snapshot.imu.accel_g;
  if (!raw || raw.length !== 3 || !raw.every(Number.isFinite)) return null;
  const body = snapshot.resolved?.model?.device_frame_transform
    ? [-raw[1], (raw[0] + raw[2]) * Math.SQRT1_2, (raw[2] - raw[0]) * Math.SQRT1_2] : [...raw];
  const gravity = previousGravity ? body.map((value, i) => previousGravity[i] + 0.3 * (value - previousGravity[i])) : body;
  // At rest, body specific force is R^T * world +Y. These signs make
  // R * body force point world-up and content travel point downhill.
  return { gravity, acceleration: body.map((value, i) => value - gravity[i]), orientation: {
    pitchRad: -Math.atan2(gravity[2], Math.hypot(gravity[0], gravity[1])),
    rollRad: Math.atan2(gravity[0], gravity[1])
  } };
}

/** Device milliseconds define display recovery time, not the number of packets.
 * A restart/long gap takes one small step on resumption, without catch-up motion. */
export function visualSampleInterval(previousMs: number | null, currentMs: number) {
  if (!Number.isFinite(currentMs)) return 0;
  if (previousMs === null || !Number.isFinite(previousMs)) return 0.1;
  const elapsedMs = (currentMs - previousMs + 0x100000000) % 0x100000000;
  return elapsedMs <= 500 ? Math.max(0, elapsedMs) / 1000 : 0.1;
}

export function isSingleMarble(preset: ContainerPreset, resolvedDimensions: boolean) {
  return resolvedDimensions && (/marble/i.test(preset.preset) ||
    ((preset.container.particle_count ?? 1) <= 0.1 && (preset.container.particle_hardness ?? 0) >= 0.8));
}

/** State-derived visual layout in body x/y. No time, integration or collisions. */
export function deviceParticleLayout(size: ContainerSize, state: DeviceContentState, family: MaterialFamily, single: boolean) {
  const radius = Math.min(size.x, size.y, size.z) * (single ? 0.085 : family === "Hybrid" ? 0.047 : 0.025);
  const cx = state.massX * Math.max(0, size.x * 0.5 - radius);
  const cy = state.massY * Math.max(0, size.y * 0.5 - radius);
  const spread = single ? 0 : 0.12 + state.fill * 0.22 + state.energy * 0.06;
  return {
    radius, cx, cy,
    sx: Math.max(0, Math.min(size.x * spread, size.x * 0.5 - radius - Math.abs(cx))),
    sy: Math.max(0, Math.min(size.y * spread, size.y * 0.5 - radius - Math.abs(cy))),
    sz: Math.max(0, Math.min(size.z * spread, size.z * 0.5 - radius)),
    angle: Math.atan2(state.velocityY, state.velocityX)
  };
}

/** Symmetric illustrative grains keep their centroid on the reported mass. */
export function deviceParticlePose(layout: ReturnType<typeof deviceParticleLayout>, index: number, count: number) {
  const seed = Math.floor(index / 2) * 9.173 + 0.31;
  const sign = count % 2 === 1 && index === count - 1 ? 0 : index % 2 === 0 ? 1 : -1;
  return {
    x: layout.cx + sign * Math.sin(seed * 1.7) * layout.sx,
    y: layout.cy + sign * Math.cos(seed * 2.3) * layout.sy,
    z: sign * Math.sin(seed * 1.3) * layout.sz,
    seed
  };
}
