// Presentation dynamics consume source snapshots only; no firmware or hardware.
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { Vector3 } from "three";

const previousDocument = globalThis.document;
const context = new Proxy({}, {
  get: (target, key) => key in target ? target[key] :
    key === "createRadialGradient" || key === "createLinearGradient" ? () => ({ addColorStop() {} }) : () => {},
  set: (target, key, value) => { target[key] = value; return true; }
});
globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => context }) };
after(() => { globalThis.document = previousDocument; });
const bundle = await build({
  entryPoints: [fileURLToPath(new URL("../src/renderer/ContainerScene.ts", import.meta.url))],
  bundle: true, format: "esm", platform: "node", write: false, logLevel: "silent"
});
const { ContainerScene } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`);

const quiet = { massX: 0, massY: -1, velocityX: 0, velocityY: 0, energy: 0, fill: 0.55 };
const content = { surfaceOffsetX: 0, surfaceOffsetY: 0, surfaceVelocityX: 0, surfaceVelocityY: 0,
  agitation: 0, particleSpread: 0, impactPulse: 0, wavePrimary: 0, waveSecondary: 0 };
const defaultSize = [0.08, 0.12, 0.05];
function create({ size = defaultSize, viscosity = 0.3 } = {}) {
  const scene = new ContainerScene();
  scene.setPreset({ preset: "liquid_small_box", family: "Liquid", container: {
    span_x_m: size[0], span_y_m: size[1], span_z_m: size[2], fill: quiet.fill, viscosity
  } }, true);
  return scene;
}
function step(scene, timeS, pitch = 0, roll = 0, overrides = {}, elapsed = timeS ?? 0) {
  scene.setDeviceState({ ...quiet, ...overrides, phaseS: timeS });
  scene.setDeviceOrientation({ pitchRad: pitch, rollRad: roll });
  scene.update({ x: 0, y: 0 }, content, elapsed, 1 / 60);
}
const surface = scene => scene.group.getObjectByName("content-liquid-surface");
const body = scene => scene.group.getObjectByName("content-liquid");
function metrics(scene) {
  const mesh = surface(scene), positions = mesh.geometry.attributes.position;
  const areaNormal = new Vector3();
  const a = new Vector3(), b = new Vector3(), c = new Vector3();
  for (let i = 0; i < mesh.geometry.drawRange.count; i += 3) {
    a.fromBufferAttribute(positions, i); b.fromBufferAttribute(positions, i + 1); c.fromBufferAttribute(positions, i + 2);
    areaNormal.add(b.sub(a).cross(c.sub(a)));
  }
  areaNormal.normalize();
  let low = Infinity, high = -Infinity;
  for (let i = 0; i < mesh.geometry.drawRange.count; i++) {
    const height = areaNormal.dot(a.fromBufferAttribute(positions, i));
    low = Math.min(low, height); high = Math.max(high, height);
  }
  return { normal: areaNormal, roughness: high - low, activity: mesh.userData.visualActivity };
}
function geometrySnapshot(scene) {
  const names = ["content-liquid", "content-liquid-surface", "content-liquid-contact", "content-liquid-caustics"];
  const objects = [];
  for (const name of names) scene.group.getObjectByName(name).traverse(object => {
    if (object.geometry?.attributes.position) objects.push({
      name: object.name, positions: Array.from(object.geometry.attributes.position.array),
      normals: object.geometry.attributes.normal ? Array.from(object.geometry.attributes.normal.array) : undefined,
      version: object.geometry.attributes.position.version, drawCount: object.geometry.drawRange.count
    });
  });
  const material = surface(scene).material;
  return { objects, offset: material.normalMap.offset.toArray(), normalScale: material.normalScale.toArray() };
}
function checkVolumeAndBounds(scene, size = defaultSize, fill = quiet.fill) {
  let signedVolume = 0;
  const a = new Vector3(), b = new Vector3(), c = new Vector3();
  for (const mesh of [body(scene), surface(scene)]) {
    const position = mesh.geometry.attributes.position;
    for (let i = 0; i < mesh.geometry.drawRange.count; i++) {
      a.fromBufferAttribute(position, i);
      for (let axis = 0; axis < 3; axis++) assert.ok(Number.isFinite(a.getComponent(axis)) && Math.abs(a.getComponent(axis)) <= size[axis] * 0.96 / 2 + 1e-7);
    }
    for (let i = 0; i < mesh.geometry.drawRange.count; i += 3) {
      a.fromBufferAttribute(position, i); b.fromBufferAttribute(position, i + 1); c.fromBufferAttribute(position, i + 2);
      signedVolume += a.dot(b.cross(c)) / 6;
    }
  }
  // Reported dimensions describe the outer vessel; both branches now share the
  // remote wall/base allowance rather than filling through the glass shell.
  const expected = size.reduce((a, b) => a * b, 1) * 0.96 ** 3 * fill;
  assert.ok(Math.abs(Math.abs(signedVolume) - expected) < size.reduce((a, b) => a * b, 1) * 6e-6,
    "deformed closed geometry retains the reported content volume");
}

test("pitch alone creates lag and ripples, then settles and reacts to return without firmware energy", () => {
  const scene = create();
  step(scene, 0);
  assert.equal(surface(scene).userData.visualDynamics, true);
  assert.ok(metrics(scene).roughness < 1e-7);
  let peakRoughness = 0, peakWorldTilt = 0, peakActivity = 0;
  for (let frame = 1; frame <= 180; frame++) {
    const pitch = 0.5 * Math.min(frame / 12, 1);
    step(scene, frame / 60, pitch);
    const result = metrics(scene);
    peakRoughness = Math.max(peakRoughness, result.roughness);
    peakWorldTilt = Math.max(peakWorldTilt, result.normal.clone().applyQuaternion(scene.group.quaternion).angleTo(new Vector3(0, 1, 0)));
    peakActivity = Math.max(peakActivity, result.activity);
    if (frame % 12 === 0) checkVolumeAndBounds(scene);
  }
  assert.ok(peakRoughness > 0.00015, `visible fore/aft waves, measured ${peakRoughness} m`);
  assert.ok(peakWorldTilt > 0.08, "the waterline has visible inertial lag instead of instant gravity locking");
  assert.ok(peakActivity > 0.1);
  const settled = metrics(scene);
  assert.ok(settled.roughness < peakRoughness * 0.05, "held orientation eventually rests");
  assert.ok(settled.normal.clone().applyQuaternion(scene.group.quaternion).angleTo(new Vector3(0, 1, 0)) < 0.01);
  let returnRoughness = 0;
  for (let frame = 181; frame <= 204; frame++) {
    step(scene, frame / 60, 0.5 * Math.max(0, 1 - (frame - 180) / 12));
    returnRoughness = Math.max(returnRoughness, metrics(scene).roughness);
  }
  assert.ok(returnRoughness > 0.00015, "returning the container excites a fresh visual response");
  assert.deepEqual(quiet, { massX: 0, massY: -1, velocityX: 0, velocityY: 0, energy: 0, fill: 0.55 }, "no presentation state is written back to model inputs");
});

test("held source time freezes surface, optical flow and contact geometry despite rendering time", () => {
  const scene = create();
  step(scene, 0);
  for (let frame = 1; frame <= 18; frame++) step(scene, frame / 60, 0.45, -0.3);
  const before = geometrySnapshot(scene);
  const activity = surface(scene).userData.visualActivity;
  for (const elapsed of [2, 40, 500]) scene.update({ x: 1, y: 1 }, content, elapsed, 0.25);
  assert.deepEqual(geometrySnapshot(scene), before);
  assert.equal(surface(scene).userData.visualActivity, activity);
  step(scene, 18 / 60, 0.45, -0.3, {}, 1000);
  assert.deepEqual(geometrySnapshot(scene), before, "even a repeated source snapshot is held");
  step(scene, 19 / 60, 0.45, -0.3);
  assert.notDeepEqual(geometrySnapshot(scene), before, "new source time resumes the existing slosh");
});

test("source rewind and long recovery gaps rebase water quietly at the new pose", () => {
  const scene = create();
  step(scene, 0);
  for (let frame = 1; frame <= 10; frame++) step(scene, frame / 60, 0.5);
  assert.ok(metrics(scene).roughness > 1e-5);
  step(scene, 0, -0.35, 0.4);
  const fresh = create();
  step(fresh, 0, -0.35, 0.4);
  assert.deepEqual(Array.from(surface(scene).geometry.attributes.position.array), Array.from(surface(fresh).geometry.attributes.position.array));
  assert.deepEqual(surface(scene).material.normalMap.offset.toArray(), surface(fresh).material.normalMap.offset.toArray());
  assert.ok(metrics(scene).roughness < 1e-7);
  for (let frame = 1; frame <= 10; frame++) step(scene, frame / 60, 0.3, -0.2);
  step(scene, 5, 0.2, 0.7);
  assert.ok(metrics(scene).roughness < 1e-7, "an unseen multi-second interval is not integrated as an impulse");
  assert.equal(surface(scene).userData.visualActivity, 0);
  checkVolumeAndBounds(scene);
});

test("missing source time keeps a static fallback and never substitutes the render clock", () => {
  const scene = create();
  step(scene, undefined, 0.4, -0.3);
  assert.equal(surface(scene).userData.visualDynamics, false);
  const initial = geometrySnapshot(scene);
  for (const elapsed of [1, 30, 900]) scene.update({ x: 1, y: 1 }, content, elapsed, 0.1);
  assert.deepEqual(geometrySnapshot(scene), initial);
  assert.ok(metrics(scene).roughness < 1e-7);
  step(scene, undefined, -0.2, 0.5, {}, 1000);
  assert.ok(metrics(scene).normal.clone().applyQuaternion(scene.group.quaternion).angleTo(new Vector3(0, 1, 0)) < 1e-6,
    "missing-time fallback still respects the current reported orientation");
  step(scene, 3, -0.2, 0.5);
  assert.equal(surface(scene).userData.visualDynamics, true);
  assert.ok(metrics(scene).roughness < 1e-7, "the first timed sample starts quietly");
});

test("resolved viscosity changes the integrated visible response", () => {
  const water = create({ viscosity: 0.02 }), viscous = create({ viscosity: 0.95 });
  step(water, 0); step(viscous, 0);
  let waterTail = 0, viscousTail = 0;
  for (let frame = 1; frame <= 90; frame++) {
    step(water, frame / 60, 0.45, 0.25);
    step(viscous, frame / 60, 0.45, 0.25);
    if (frame >= 40) {
      waterTail += metrics(water).roughness;
      viscousTail += metrics(viscous).roughness;
    }
  }
  assert.ok(waterTail > viscousTail * 2, `resolved viscosity damps the visible ringdown: ${waterTail} vs ${viscousTail}`);
  checkVolumeAndBounds(water); checkVolumeAndBounds(viscous);
});

test("resolved dimensions determine slosh response and geometry instead of the legacy visual scale", () => {
  const smallSize = [0.04, 0.05, 0.03], largeSize = [0.16, 0.2, 0.12];
  const small = create({ size: smallSize }), large = create({ size: largeSize });
  step(small, 0); step(large, 0);
  for (let frame = 1; frame <= 20; frame++) {
    step(small, frame / 60, 0.45, 0.3);
    step(large, frame / 60, 0.45, 0.3);
  }
  assert.ok(metrics(small).normal.distanceTo(metrics(large).normal) > 0.05, "different tank spans produce different wave frequencies");
  checkVolumeAndBounds(small, smallSize); checkVolumeAndBounds(large, largeSize);
  assert.ok(Math.abs(body(small).userData.fillVolume / body(large).userData.fillVolume - 1 / 64) < 1e-6);
});
