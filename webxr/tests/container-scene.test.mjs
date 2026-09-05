// Pure scene-state checks: actual THREE geometry/matrices, no WebGL or device I/O.
// Run from webxr: node --test tests/container-scene.test.mjs
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const previousDocument = globalThis.document;
const context = new Proxy({}, {
  get: (target, key) => key in target ? target[key] :
    key === "createRadialGradient" || key === "createLinearGradient"
      ? () => ({ addColorStop() {} }) : () => {},
  set: (target, key, value) => { target[key] = value; return true; }
});
globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => context }) };
after(() => { globalThis.document = previousDocument; });
const bundle = await build({
  entryPoints: [fileURLToPath(new URL("../src/renderer/ContainerScene.ts", import.meta.url))],
  bundle: true, format: "esm", platform: "node", write: false, logLevel: "silent"
});
const { ContainerScene } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`);

const content = {
  surfaceOffsetX: 0.8, surfaceOffsetY: -0.7, surfaceVelocityX: 1,
  surfaceVelocityY: 1, agitation: 0.9, particleSpread: 0.8,
  impactPulse: 0.9, wavePrimary: 0.8, waveSecondary: 0.7
};
const state = { massX: 0.5, massY: -0.4, velocityX: 0.2, velocityY: -0.3, energy: 0.4, fill: 0.5 };
const preset = (overrides = {}) => ({
  preset: "granular_sand", family: "Granular", visual_shape: "box",
  container: { span_x_m: 0.08, span_y_m: 0.12, span_z_m: 0.05, fill: 0.5, particle_count: 0.6, particle_hardness: 0.5 },
  ...overrides
});
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-7, `${actual} != ${expected}`);
const tick = (scene, elapsed = 0, dt = 0.016) => scene.update({ x: 0.6, y: -0.3 }, content, elapsed, dt);
const particles = (scene) => scene.group.getObjectByName("content-particles");
const particlePositions = (scene) => {
  const mesh = particles(scene);
  return Array.from({ length: mesh.count }, (_, i) => Array.from(mesh.instanceMatrix.array.slice(i * 16 + 12, i * 16 + 15)));
};
const liquidSnapshot = (scene) => {
  const body = scene.group.getObjectByName("content-liquid");
  const surface = scene.group.getObjectByName("content-liquid-surface");
  return {
    bodyPosition: body.position.toArray(), bodyScale: body.scale.toArray(),
    surfacePosition: surface.position.toArray(),
    bodyVertices: Array.from(body.geometry.attributes.position.array),
    surfaceVertices: Array.from(surface.geometry.attributes.position.array)
  };
};

test("connected dimensions use all resolved spans and box, preview keeps its shape", () => {
  const scene = new ContainerScene();
  const descriptor = preset({ visual_shape: "cylinder_bottle" });
  scene.setPreset(descriptor, true);
  const geometry = scene.group.children[0].geometry;
  assert.equal(geometry.type, "BoxGeometry");
  assert.equal(geometry.parameters.width, 0.08);
  assert.equal(geometry.parameters.height, 0.12);
  assert.equal(geometry.parameters.depth, 0.05);
  scene.setPreset(descriptor);
  assert.equal(scene.group.children[0].geometry.type, "CylinderGeometry");
  scene.setPreset(preset());
  assert.equal(scene.group.children[0].geometry.parameters.width, 0.07);
});

test("single marble follows reported x/y immediately and freezes without new state", () => {
  const scene = new ContainerScene();
  scene.setPreset(preset({ preset: "granular_single_marble" }), true);
  scene.setDeviceState(state);
  tick(scene);
  assert.equal(particles(scene).count, 1);
  const radius = 0.05 * 0.085;
  const position = particlePositions(scene)[0];
  close(position[0], state.massX * (0.08 / 2 - radius));
  close(position[1], state.massY * (0.12 / 2 - radius));
  close(position[2], 0);
  const before = Array.from(particles(scene).instanceMatrix.array);
  tick(scene, 1234, 12);
  assert.deepEqual(Array.from(particles(scene).instanceMatrix.array), before);
  scene.setDeviceState({ ...state, massX: -1, massY: 1 });
  tick(scene, 1235);
  const changed = particlePositions(scene)[0];
  close(changed[0], -(0.08 / 2 - radius));
  close(changed[1], 0.12 / 2 - radius);
});

test("sparse hard descriptor also selects a single marble", () => {
  const scene = new ContainerScene();
  const descriptor = preset();
  descriptor.container.particle_count = 0.08;
  descriptor.container.particle_hardness = 0.9;
  scene.setPreset(descriptor, true);
  scene.setDeviceState(state);
  tick(scene);
  assert.equal(particles(scene).count, 1);
});

test("illustrative grains keep their centroid on reported x/y, including walls", () => {
  const scene = new ContainerScene();
  scene.setPreset(preset(), true);
  const radius = 0.05 * 0.025;
  for (const mass of [[0.6, -0.7], [-1, 1], [0, 0]]) {
    scene.setDeviceState({ ...state, massX: mass[0], massY: mass[1] });
    tick(scene);
    const positions = particlePositions(scene);
    assert.ok(positions.length > 1);
    const centroid = positions.reduce((sum, p) => sum.map((value, i) => value + p[i]), [0, 0, 0]).map(value => value / positions.length);
    close(centroid[0], mass[0] * (0.08 / 2 - radius));
    close(centroid[1], mass[1] * (0.12 / 2 - radius));
    close(centroid[2], 0);
    for (const p of positions) {
      assert.ok(Math.abs(p[0]) <= 0.08 / 2 - radius + 1e-7);
      assert.ok(Math.abs(p[1]) <= 0.12 / 2 - radius + 1e-7);
      assert.ok(Math.abs(p[2]) <= 0.05 / 2 - radius + 1e-7);
    }
    tick(scene, 99, 3);
    assert.deepEqual(particlePositions(scene), positions);
  }
});

test("liquid uses reported mass, activity and fill, without a visual clock", () => {
  const scene = new ContainerScene();
  scene.setPreset(preset({ preset: "liquid", family: "Liquid" }), true);
  scene.setDeviceState({ ...state, fill: 0.25 });
  tick(scene);
  const before = liquidSnapshot(scene);
  close(before.bodyPosition[0], state.massX * 0.08 * (1 - 0.78) / 2);
  close(before.bodyPosition[1], state.massY * (0.12 - 0.12 * 0.25) / 2);
  close(before.surfacePosition[1] - before.bodyPosition[1], 0.12 * 0.25 / 2);
  tick(scene, 200, 5);
  assert.deepEqual(liquidSnapshot(scene), before);
  scene.setDeviceState({ ...state, fill: 0.25, velocityX: -0.9, energy: 0.9 });
  tick(scene);
  assert.notDeepEqual(liquidSnapshot(scene).surfaceVertices, before.surfaceVertices);
  scene.setDeviceState({ ...state, fill: 0.75 });
  tick(scene);
  close(liquidSnapshot(scene).surfacePosition[1] - liquidSnapshot(scene).bodyPosition[1], 0.12 * 0.75 / 2);
});

test("empty state hides contents; clearing device state restores animated preview", () => {
  const scene = new ContainerScene();
  scene.setPreset(preset({ family: "Hybrid" }), true);
  scene.setDeviceState({ ...state, fill: 0 });
  tick(scene);
  assert.equal(particles(scene).visible, false);
  assert.equal(scene.group.getObjectByName("content-liquid").visible, false);
  assert.equal(scene.group.getObjectByName("content-liquid-surface").visible, false);
  scene.setDeviceState(null);
  scene.setPreset(preset());
  tick(scene, 0);
  const before = particlePositions(scene);
  tick(scene, 1, 0.1);
  assert.notDeepEqual(particlePositions(scene), before);
});

test("connected orientation directly maps pitch to x and roll to z; stale pose freezes", () => {
  const scene = new ContainerScene();
  scene.setPreset(preset(), true);
  scene.setDeviceState(state);
  const orientation = { pitchRad: 0.32, rollRad: -0.71 };
  scene.setDeviceOrientation(orientation);
  orientation.pitchRad = 1; // Input objects cannot mutate the held telemetry.
  tick(scene);
  close(scene.group.rotation.x, 0.32);
  close(scene.group.rotation.y, 0);
  close(scene.group.rotation.z, -0.71);
  scene.update({ x: -1, y: 1 }, content, 1000, 5);
  close(scene.group.rotation.x, 0.32);
  close(scene.group.rotation.z, -0.71);
  scene.setDeviceOrientation({ pitchRad: NaN, rollRad: Infinity });
  tick(scene);
  close(scene.group.rotation.x, 0.32);
  close(scene.group.rotation.z, -0.71);
  scene.setDeviceOrientation({ pitchRad: -0.4, rollRad: 0.6 });
  tick(scene);
  close(scene.group.rotation.x, -0.4);
  close(scene.group.rotation.z, 0.6);
  scene.setDeviceState(null);
  scene.group.rotation.set(0, 0, 0);
  tick(scene);
  close(scene.group.rotation.x, -0.3 * 0.62 * 0.16);
  close(scene.group.rotation.z, -0.6 * 0.62 * 0.16);
});

test("front label stays in preview but never occludes connected contents", () => {
  const scene = new ContainerScene();
  scene.setPreset(preset());
  const label = () => scene.group.getObjectByName("container-preview-label");
  assert.equal(label().visible, true);
  scene.setDeviceState(state);
  assert.equal(label().visible, false);
  scene.setPreset(preset({ preset: "granular_single_marble_box" }), true);
  tick(scene);
  assert.equal(label().visible, false);
  scene.setDeviceState(null);
  scene.setPreset(preset());
  assert.equal(label().visible, true);
});
