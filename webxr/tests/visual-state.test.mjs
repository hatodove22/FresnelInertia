// Presentation-independent adapters: no DOM, WebGL, transport or hardware.
import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const bundle = await build({
  entryPoints: [fileURLToPath(new URL("../src/visualState.ts", import.meta.url))],
  bundle: true, format: "esm", platform: "node", write: false, metafile: true, logLevel: "silent"
});
const { resolvedPresetFromSnapshot, contentFromSnapshot, orientationFromSnapshot, sanitizeDeviceContent,
  deviceParticleLayout, deviceParticlePose, visualSampleInterval } =
  await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`);
const config = { span_x_m: 0.08, span_y_m: 0.12, span_z_m: 0.05, fill: 0.5, particle_count: 0.6 };
const state = { massX: 0.5, massY: -0.4, velocityX: 0.2, velocityY: -0.3, energy: 0.4, fill: 0.5 };
const size = { x: 0.08, y: 0.12, z: 0.05 };
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-12, `${actual} != ${expected}`);

test('visual recovery timing handles repeated samples, device restart, clock wrap and gaps without catch-up', () => {
  close(visualSampleInterval(null, 1000), 0.1);
  close(visualSampleInterval(1000, 1100), 0.1);
  close(visualSampleInterval(1000, 1050), 0.05);
  close(visualSampleInterval(1000, 1000), 0);
  close(visualSampleInterval(10000, 20), 0.1);
  close(visualSampleInterval(0xfffffff0, 84), 0.1);
  close(visualSampleInterval(1000, 9000), 0.1);
  close(visualSampleInterval(1000, NaN), 0);
});

test("visual model imports no rendering, UI or transport implementation", () => {
  assert.equal(Object.keys(bundle.metafile.inputs).length, 1);
});

test("reported preset adapter copies actual dimensions and rejects absent or invalid configuration", () => {
  const snapshot = { preset: "device_only_material", resolved: { family: "Liquid", container: { ...config } } };
  const applied = resolvedPresetFromSnapshot(snapshot);
  assert.equal(applied.preset, snapshot.preset);
  assert.equal(applied.visual_shape, "box");
  close(applied.container.span_y_m, 0.12);
  snapshot.resolved.container.fill = 0.9;
  close(applied.container.fill, 0.5);
  assert.equal(resolvedPresetFromSnapshot(null), null);
  assert.equal(resolvedPresetFromSnapshot({ preset: "liquid_small_box" }), null);
  for (const invalid of [{ span_x_m: 0 }, { span_z_m: -0.1 }, { span_y_m: NaN }, { fill: Infinity }]) {
    assert.equal(resolvedPresetFromSnapshot({ ...snapshot, resolved: { family: "Liquid", container: { ...config, ...invalid } } }), null);
  }
  assert.equal(resolvedPresetFromSnapshot({ ...snapshot, resolved: { family: "Unknown", container: config } }), null);
});

test("motion adapter holds missing data and owns a bounded copy of reported state", () => {
  assert.equal(contentFromSnapshot({}, 0.6), null);
  assert.equal(contentFromSnapshot({ mass: { pos_norm: [1, 1] } }, 0.6), null);
  const snapshot = { mass: { pos_norm: [2, -2], vel_norm_s: [NaN, 0.8], energy: Infinity } };
  const applied = contentFromSnapshot(snapshot, 0.6);
  assert.deepEqual(applied, { massX: 1, massY: -1, velocityX: 0, velocityY: 0.8, energy: 0, fill: 0.6, slosh: undefined });
  snapshot.mass.pos_norm[0] = 0;
  assert.equal(applied.massX, 1);
  const sanitized = sanitizeDeviceContent({ ...state, slosh: 2, fill: -1 });
  assert.equal(sanitized.slosh, 1);
  assert.equal(sanitized.fill, 0);
});

test("gravity adaptation is explicit per snapshot and never mutates the previous filter state", () => {
  const previous = [0, 1, 0];
  const snapshot = { imu: { valid: true, accel_g: [1, 0, 0] } };
  const first = orientationFromSnapshot(snapshot, previous);
  assert.deepEqual(first.gravity, [0.3, 0.7, 0]);
  assert.deepEqual(previous, [0, 1, 0]);
  assert.deepEqual(orientationFromSnapshot(snapshot, previous), first);
  assert.equal(orientationFromSnapshot({ imu: { valid: false, accel_g: [0, 1, 0] } }, previous), null);
  assert.equal(orientationFromSnapshot({ imu: { valid: true, accel_g: [0, Infinity, 0] } }, previous), null);
});

test("pure particle layout preserves mass centroid for odd/even clouds and wall contacts", () => {
  for (const count of [1, 17, 74]) for (const mass of [[0.6, -0.7], [-1, 1], [0, 0]]) {
    const layout = deviceParticleLayout(size, { ...state, massX: mass[0], massY: mass[1] }, "Granular", count === 1);
    const poses = Array.from({ length: count }, (_, i) => deviceParticlePose(layout, i, count));
    close(poses.reduce((sum, p) => sum + p.x, 0) / count, layout.cx);
    close(poses.reduce((sum, p) => sum + p.y, 0) / count, layout.cy);
    close(poses.reduce((sum, p) => sum + p.z, 0) / count, 0);
    for (const pose of poses) for (const axis of ["x", "y", "z"]) {
      assert.ok(Math.abs(pose[axis]) <= size[axis] / 2 - layout.radius + 1e-12);
    }
  }
});
