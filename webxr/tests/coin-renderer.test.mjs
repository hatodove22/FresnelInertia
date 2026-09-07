import assert from "node:assert/strict";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { Matrix4, Quaternion, Vector3 } from "three";

const previousDocument = globalThis.document;
const context = new Proxy({}, { get: (target, key) => key in target ? target[key] : () => {}, set: (target, key, value) => { target[key] = value; return true; } });
globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => context }) };
after(() => { globalThis.document = previousDocument; });
const bundle = await build({ entryPoints: [fileURLToPath(new URL("../src/renderer/ContainerScene.ts", import.meta.url))], bundle: true, format: "esm", platform: "node", write: false, logLevel: "silent" });
const { ContainerScene } = await import("data:text/javascript;base64," + Buffer.from(bundle.outputFiles[0].text).toString("base64"));
const preset = (single = false, size = [0.05, 0.05, 0.03]) => ({ preset: single ? "granular_single_coin_box" : "granular_coin_box", family: "Granular", container: {
  span_x_m: size[0], span_y_m: size[1], span_z_m: size[2], fill: single ? 0.04 : 0.2, particle_count: single ? 0.03 : 0.25, particle_hardness: 0.9
} });
const quiet = { surfaceOffsetX: 0, surfaceOffsetY: 0, surfaceVelocityX: 0, surfaceVelocityY: 0, agitation: 0, particleSpread: 0, impactPulse: 0, wavePrimary: 0, waveSecondary: 0 };
const state = { massX: 0, massY: -1, velocityX: 0, velocityY: 0, energy: 0, fill: 0.2, phaseS: 0 };
const mesh = scene => scene.group.getObjectByName("content-particles");
const tick = (scene, time = 1, dt = 1 / 60) => scene.update({ x: 0, y: 0 }, quiet, time, dt);
const matrices = scene => Array.from(mesh(scene).instanceMatrix.array);
const poses = scene => Array.from({ length: mesh(scene).count }, (_, i) => {
  const matrix = new Matrix4().fromArray(mesh(scene).instanceMatrix.array, i * 16);
  const position = new Vector3(), rotation = new Quaternion(), scale = new Vector3();
  matrix.decompose(position, rotation, scale);
  return { position, rotation, scale, matrix };
});
const center = scene => poses(scene).reduce((sum, pose) => sum.add(pose.position), new Vector3()).divideScalar(mesh(scene).count);
async function make(single = false, connected = true, size, particleCount) {
  const scene = new ContainerScene(), condition = preset(single, size);
  if (particleCount !== undefined) condition.container.particle_count = particleCount;
  scene.setPreset(condition, true);
  if (connected) scene.setDeviceState({ ...state, fill: condition.container.fill });
  await scene.whenPresentationReady();
  tick(scene, 0, 0);
  return scene;
}
function assertBounds(scene, size, tolerance = 0.0003) {
  const vertices = mesh(scene).geometry.attributes.position;
  let lowest = Infinity;
  for (const pose of poses(scene)) {
    assert.ok(pose.position.toArray().every(Number.isFinite));
    assert.ok(Math.abs(pose.rotation.length() - 1) < 1e-5);
    assert.ok(pose.scale.x > 0 && Math.abs(pose.scale.x - pose.scale.y) < 1e-8);
    for (let k = 0; k < vertices.count; k++) {
      const point = new Vector3().fromBufferAttribute(vertices, k).applyMatrix4(pose.matrix);
      lowest = Math.min(lowest, point.y);
      point.toArray().forEach((value, axis) => assert.ok(Number.isFinite(value) &&
        Math.abs(value) <= size[axis] * [0.48, 0.474, 0.48][axis] + tolerance,
      "coin outside axis " + axis + ": " + value + ", size " + size));
    }
  }
  return lowest;
}

test("single coin remains a full-sized minted disc in ordinary preview and connected presentation", async () => {
  for (const connected of [false, true]) {
    const scene = await make(true, connected);
    try {
      assert.equal(mesh(scene).count, 1);
      assert.equal(mesh(scene).geometry.type, "CylinderGeometry");
      assert.equal(mesh(scene).geometry.parameters.height, 0.16);
      assert.equal(mesh(scene).userData.coin, true);
      assert.ok(mesh(scene).material[1].map && mesh(scene).material[2].map);
      assert.notEqual(mesh(scene).material[1].map, mesh(scene).material[2].map, "distinct minted faces make physical orientation legible");
      assert.ok(poses(scene)[0].scale.x > 0.008, "a legible disc, not a sparse grain");
      assert.ok(new Vector3(0, 1, 0).applyQuaternion(poses(scene)[0].rotation).y > 0.99, "quiet initial coin lies flat");
    } finally { scene.dispose(); }
  }
});

test("all supported initial size/count combinations have finite geometry and fit their real cavity", async () => {
  for (const single of [false, true]) for (const size of [[0.05, 0.05, 0.03], [0.03, 0.09, 0.08], [0.16, 0.02, 0.03], [0.08, 0.08, 0.04]]) {
    for (const particleCount of [0.05, 0.25, 0.7, 1]) {
      const scene = await make(single, true, size, particleCount);
      try {
        assert.equal(mesh(scene).count, single ? 1 : Math.round(3 + particleCount * 20));
        assertBounds(scene, size, 1e-6);
      } finally { scene.dispose(); }
    }
  }
});

test("connected one/eight coin visuals follow both physical tilt axes while source mass alone cannot teleport them", async () => {
  for (const single of [false, true]) for (const axis of ["x", "z"]) for (const sign of [-1, 1]) {
    const scene = await make(single);
    try {
      assert.equal(mesh(scene).count, single ? 1 : 8);
      const before = matrices(scene);
      scene.setDeviceState({ ...state, massX: sign, massY: 1, velocityX: 20, velocityY: -20 }); tick(scene);
      assert.deepEqual(matrices(scene), before, "same-time aggregate state is not a pose command");
      scene.setDeviceOrientation({ pitchRad: axis === "z" ? sign * 0.61 : 0, rollRad: axis === "x" ? -sign * 0.61 : 0 });
      for (let i = 1; i <= 120; i++) {
        scene.setDeviceState({ ...state, phaseS: i / 120 }); tick(scene, i / 120);
      }
      assert.ok(center(scene)[axis] * sign > 0.002, (single ? "one" : "eight") + " coins respond along " + axis + "/" + sign);
      assertBounds(scene, [0.05, 0.05, 0.03]);
    } finally { scene.dispose(); }
  }
});

test("repeated source snapshots and render frames hold poses; empty source hides the coins", async () => {
  const scene = await make();
  try {
    scene.setDeviceOrientation({ pitchRad: 0.6, rollRad: -0.4 });
    for (let i = 1; i <= 90; i++) { scene.setDeviceState({ ...state, phaseS: i / 120 }); tick(scene); }
    const held = matrices(scene);
    for (let i = 0; i < 60; i++) {
      scene.setDeviceState({ ...state, phaseS: 0.75, massX: i % 2 ? 1 : -1, massY: 1 });
      scene.setDeviceOrientation({ pitchRad: -0.7, rollRad: 0.7 });
      scene.setDeviceAcceleration([0, 0, 4]); tick(scene, 500 + i, 0.05);
    }
    assert.deepEqual(matrices(scene), held);
    scene.setDeviceState({ ...state, phaseS: 0.75, fill: 0 }); tick(scene);
    assert.equal(mesh(scene).visible, false);
  } finally { scene.dispose(); }
});

test("ordinary preview moves promptly along either tilt axis at 30/60/120 fps", async () => {
  for (const single of [false, true]) for (const axis of ["x", "z"]) {
    const progress = [];
    for (const fps of [30, 60, 120]) {
      const scene = await make(single, false);
      try {
        const initial = center(scene)[axis], amount = (30 * Math.PI / 180) / 0.62;
        for (let i = 1; i <= fps * 0.6; i++) scene.update({ x: axis === "x" ? amount : 0, y: axis === "z" ? amount : 0 }, quiet, i / fps, 1 / fps);
        const displacement = center(scene)[axis] - initial;
        assert.ok(displacement > 0.002, (single ? "one" : "eight") + "/" + axis + "/" + fps + " fps responds in 0.6 s: " + displacement);
        assertBounds(scene, [0.05, 0.05, 0.03]);
        progress.push(displacement);
      } finally { scene.dispose(); }
    }
    assert.ok(Math.max(...progress) - Math.min(...progress) < 0.004,
      "frame-rate changes must not produce a different gross direction/travel: " + progress);
  }
});

test("contact-driven coins settle on bounded support without collapsing to a point or continually bouncing", async () => {
  for (const single of [false, true]) {
    const scene = await make(single, false);
    try {
      for (let i = 1; i <= 90; i++) scene.update({ x: 0.8, y: 0.5 }, quiet, i / 60, 1 / 60);
      for (let i = 1; i <= 600; i++) tick(scene, 1.5 + i / 60);
      const rest = poses(scene), bottom = assertBounds(scene, [0.05, 0.05, 0.03]);
      assert.ok(Math.abs(bottom + 0.05 * 0.474) < 0.0003, "the resting pile has floor support");
      for (let i = 1; i <= 120; i++) tick(scene, 11.5 + i / 60);
      const later = poses(scene);
      rest.forEach((pose, i) => {
        assert.ok(pose.position.distanceTo(later[i].position) < 0.00015, "settled translation stays quiet");
        assert.ok(pose.rotation.angleTo(later[i].rotation) < 0.08, "settled orientation stays quiet");
      });
      for (let i = 0; i < later.length; i++) for (let j = i + 1; j < later.length; j++) {
        assert.ok(later[i].position.distanceTo(later[j].position) > later[i].scale.x * 0.08,
          "independent finite coins cannot share the same center");
      }
    } finally { scene.dispose(); }
  }
});

test("coin graphics dispose independently and replacement retains the accepted marble path", async () => {
  const first = await make(), second = await make();
  const firstMesh = mesh(first), firstTexture = firstMesh.material[1].map, secondTexture = mesh(second).material[1].map;
  assert.notEqual(firstTexture, secondTexture);
  let released = 0, otherReleased = 0, geometryReleased = 0;
  firstTexture.addEventListener("dispose", () => released++);
  secondTexture.addEventListener("dispose", () => otherReleased++);
  firstMesh.geometry.addEventListener("dispose", () => geometryReleased++);
  first.setPreset({ ...preset(), preset: "granular_single_marble_box" }, true);
  first.setDeviceState(state); await first.whenPresentationReady(); tick(first);
  assert.equal(released, 1); assert.equal(geometryReleased, 1); assert.equal(otherReleased, 0);
  assert.equal(mesh(first).count, 1); assert.equal(mesh(first).geometry.type, "SphereGeometry");
  first.dispose(); second.dispose(); second.dispose();
  assert.equal(otherReleased, 1);
});
