import assert from "node:assert/strict";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { Euler, Matrix4, Quaternion, Vector3 } from "three";

const previousDocument = globalThis.document;
const context = new Proxy({}, { get: (target, key) => key in target ? target[key] : () => {}, set: (target, key, value) => { target[key] = value; return true; } });
globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => context }) };
after(() => { globalThis.document = previousDocument; });
const bundle = await build({ entryPoints: [fileURLToPath(new URL("../src/renderer/CoinContentRenderer.ts", import.meta.url))], bundle: true, format: "esm", platform: "node", write: false, logLevel: "silent" });
const { CoinContentRenderer } = await import("data:text/javascript;base64," + Buffer.from(bundle.outputFiles[0].text).toString("base64"));
const preset = (single = false, size = [0.05, 0.05, 0.03]) => ({ preset: single ? "granular_single_coin_box" : "granular_coin_box", family: "Granular", container: {
  span_x_m: size[0], span_y_m: size[1], span_z_m: size[2], fill: single ? 0.04 : 0.2, particle_count: single ? 0.03 : 0.25, particle_hardness: 0.9
} });
const state = { massX: 0, massY: -1, velocityX: 0, velocityY: 0, energy: 0, fill: 0.2, phaseS: 0 };
const orientation = (pitch = 0, roll = 0) => new Quaternion().setFromEuler(new Euler(pitch * Math.PI / 180, 0, roll * Math.PI / 180));
async function make(single = false, size) {
  const condition = preset(single, size), dimensions = new Vector3(condition.container.span_x_m, condition.container.span_y_m, condition.container.span_z_m);
  const renderer = new CoinContentRenderer(condition, { dimensions });
  assert.equal(renderer.status, "loading");
  await renderer.ready;
  assert.equal(renderer.status, "ready", renderer.error);
  assert.equal(renderer.error, undefined);
  return { renderer, condition, dimensions, mesh: renderer.group.getObjectByName("content-particles") };
}
const matrices = item => Array.from(item.mesh.instanceMatrix.array);
const poses = item => Array.from({ length: item.mesh.count }, (_, i) => {
  const matrix = new Matrix4().fromArray(item.mesh.instanceMatrix.array, i * 16);
  const position = new Vector3(), rotation = new Quaternion(), scale = new Vector3();
  matrix.decompose(position, rotation, scale);
  return { position, rotation, scale, matrix };
});
const center = item => poses(item).reduce((sum, pose) => sum.add(pose.position), new Vector3()).divideScalar(item.mesh.count);
function stepFor(item, seconds, pose = orientation(), start = 0, acceleration, source = state) {
  for (let i = 1; i <= Math.round(seconds * 120); i++) item.renderer.updateDevice({ ...source, phaseS: start + i / 120 }, pose, acceleration);
}
function maximumTravel(before, after) {
  return Math.max(...before.map((pose, i) => pose.position.distanceTo(after[i].position)));
}

test("the first accepted sample establishes a quiet baseline and aggregate mass/velocity cannot prescribe any coin pose", async () => {
  for (const single of [false, true]) {
    const reference = await make(single), alternate = await make(single);
    try {
      const initial = matrices(reference);
      const changedSource = Object.freeze({ ...state, massX: 1, massY: 1, velocityX: 20, velocityY: -20, energy: 1 });
      reference.renderer.updateDevice(state, orientation(40, -40), [2, 0, -2]);
      alternate.renderer.updateDevice(changedSource, orientation(40, -40), [2, 0, -2]);
      matrices(reference).forEach((value, i) => assert.ok(Math.abs(value - initial[i]) < 1e-7, "first input only converts to physics float precision"));
      assert.deepEqual(matrices(alternate), matrices(reference), "mass or velocity fields cannot teleport the initial coins");
      for (let i = 1; i <= 120; i++) {
        const clock = i / 120, pose = orientation(20, -30);
        reference.renderer.updateDevice({ ...state, phaseS: clock }, pose);
        alternate.renderer.updateDevice(Object.freeze({ ...changedSource, phaseS: clock, massX: Math.sin(i), massY: Math.cos(i) }), pose);
      }
      assert.deepEqual(matrices(reference), matrices(alternate), "only physical inputs influence the same deterministic trajectory");
      assert.equal(changedSource.massX, 1);
    } finally { reference.renderer.dispose(); alternate.renderer.dispose(); }
  }
});

test("one and eight finite bodies move in both signed pitch and roll directions without prescribed symmetry", async () => {
  for (const single of [false, true]) for (const axis of ["x", "z"]) {
    const item = await make(single);
    try {
      assert.equal(item.mesh.count, single ? 1 : 8);
      item.renderer.updateDevice(state);
      stepFor(item, 1.2, axis === "x" ? orientation(0, -35) : orientation(35));
      const positive = center(item)[axis];
      stepFor(item, 1.2, axis === "x" ? orientation(0, 35) : orientation(-35), 1.2);
      const negative = center(item)[axis];
      assert.ok(positive > 0.002 && negative < -0.002,
        (single ? "one" : "eight") + " coins need useful signed " + axis + " travel: " + positive + "/" + negative);
    } finally { item.renderer.dispose(); }
  }
});

test("both depth acceleration signs produce opposing inertia for one/eight coins without mutating input", async () => {
  for (const single of [false, true]) for (const sign of [-1, 1]) {
    const item = await make(single);
    try {
      const source = Object.freeze({ ...state }), acceleration = Object.freeze([0, 0, sign]);
      const q = orientation(), copy = q.clone();
      item.renderer.updateDevice(source, q, acceleration);
      stepFor(item, 0.25, q, 0, acceleration, source);
      assert.ok(center(item).z * sign < -0.001, "accepted " + sign + " g acceleration produces opposing depth travel");
      assert.deepEqual(acceleration, [0, 0, sign]);
      assert.deepEqual(source, state); assert.ok(q.equals(copy));
    } finally { item.renderer.dispose(); }
  }
});

test("source pause freezes all rigid poses even when aggregate state, orientation and acceleration change", async () => {
  const item = await make();
  try {
    item.renderer.updateDevice(state);
    stepFor(item, 0.6, orientation(35, -25));
    const held = matrices(item);
    for (let i = 0; i < 120; i++) item.renderer.updateDevice(Object.freeze({ ...state, phaseS: 0.6, massX: Math.sin(i), massY: Math.cos(i), velocityX: i }),
      orientation(-45, 45), Object.freeze([3, 2, -3]));
    assert.deepEqual(matrices(item), held, "unchanged source time holds translation and rotation");
  } finally { item.renderer.dispose(); }
});

test("missing source time and a long gap hold the last pose and discard motion; rewind restores the initial pile", async () => {
  for (const interruption of ["missing", "gap"]) {
    const item = await make(true);
    try {
      item.renderer.updateDevice(state);
      const initial = matrices(item);
      stepFor(item, 0.05, orientation(), 0, [0, 0, -0.6]);
      const moving = matrices(item);
      assert.notDeepEqual(moving, initial);
      item.renderer.updateDevice({ ...state, phaseS: interruption === "missing" ? undefined : 10 }, orientation(-35));
      assert.deepEqual(matrices(item), moving, "interruption holds a pose instead of snapping to the center");
      const nextTime = interruption === "missing" ? 0.06 : 10;
      // With gravity cancelled, travel here would expose retained stale velocity.
      item.renderer.updateDevice({ ...state, phaseS: nextTime }, orientation(), [0, -1, 0]);
      const before = poses(item);
      item.renderer.updateDevice({ ...state, phaseS: nextTime + 1 / 120 }, orientation(), [0, -1, 0]);
      assert.ok(maximumTravel(before, poses(item)) < 0.00003, "stale momentum was cleared");
      item.renderer.updateDevice({ ...state, phaseS: 0 });
      assert.deepEqual(matrices(item), initial, "rewinding restarts the same initial physical arrangement");
    } finally { item.renderer.dispose(); }
  }
});

test("gravity and contacts rearrange individual bodies while every visible disc remains inside the cavity", async () => {
  for (const single of [false, true]) for (const size of [[0.05, 0.05, 0.03], [0.03, 0.09, 0.08], [0.16, 0.02, 0.03]]) {
    const item = await make(single, size), vertices = item.mesh.geometry.attributes.position;
    try {
      item.renderer.updateDevice(state);
      const initial = poses(item);
      let changedRelativePose = false;
      for (let i = 1; i <= 240; i++) {
        const q = orientation(i < 120 ? 55 : -45, i < 120 ? -40 : 45);
        item.renderer.updateDevice({ ...state, phaseS: i / 120 }, q, [0, i < 10 ? -1.6 : 0, 0]);
        const current = poses(item);
        if (!single) for (let j = 1; j < current.length; j++) {
          const before = initial[j].position.clone().sub(initial[0].position);
          const after = current[j].position.clone().sub(current[0].position);
          if (before.distanceTo(after) > 0.0005 || current[j].rotation.angleTo(initial[j].rotation) > 0.15) changedRelativePose = true;
        }
        if (i % 12) continue;
        for (const pose of current) for (let k = 0; k < vertices.count; k++) {
          const point = new Vector3().fromBufferAttribute(vertices, k).applyMatrix4(pose.matrix);
          point.toArray().forEach((value, axis) => assert.ok(Number.isFinite(value) &&
            Math.abs(value) <= size[axis] * [0.48, 0.474, 0.48][axis] + 0.0003,
          "finite disc outside cavity axis " + axis + ": " + value + ", size " + size));
        }
      }
      if (!single) assert.ok(changedRelativePose, "coins separate, tilt and collide independently instead of following a rigid grid");
    } finally { item.renderer.dispose(); }
  }
});
