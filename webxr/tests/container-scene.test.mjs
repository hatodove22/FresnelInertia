// Pure scene-state checks: actual THREE geometry/matrices, no WebGL or device I/O.
// Run from webxr: node --test tests/container-scene.test.mjs
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { NoColorSpace, LinearFilter, LinearMipmapLinearFilter } from "three";

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

test("dense grains sit on a volume-filled bed and retain the reported pile slope", () => {
  const scene = new ContainerScene();
  scene.setPreset(preset(), true);
  for (const slope of [0, 0.65, -0.65]) {
    scene.setDeviceState({ ...state, pileSlope: slope, granularFlow: 0, phaseS: 1 });
    tick(scene);
    const body = scene.group.getObjectByName("content-sand-body");
    const surface = scene.group.getObjectByName("content-sand-surface");
    assert.ok(body && surface, "sand is a filled solid, not a floating grain cloud");
    const positions = particlePositions(scene);
    assert.ok(positions.length > 1);
    if (slope === 0) close(body.userData.centroid[0], 0);
    else assert.equal(Math.sign(body.userData.centroid[0]), Math.sign(slope));
    assert.ok(body.userData.centroid[1] < 0);
    for (const p of positions) {
      assert.ok(Math.abs(p[0]) <= 0.08 / 2 + 1e-7);
      assert.ok(Math.abs(p[1]) <= 0.12 / 2 + 1e-7);
      assert.ok(Math.abs(p[2]) <= 0.05 / 2 + 1e-7);
    }
    const bed = Array.from(surface.geometry.attributes.position.array);
    tick(scene, 99, 3);
    assert.deepEqual(particlePositions(scene), positions);
    assert.deepEqual(Array.from(surface.geometry.attributes.position.array), bed);
  }
});

test("liquid uses reported mass, activity and fill, without a visual clock", () => {
  const scene = new ContainerScene();
  scene.setPreset(preset({ preset: "liquid", family: "Liquid" }), true);
  scene.setDeviceState({ ...state, fill: 0.25 });
  tick(scene);
  const before = liquidSnapshot(scene);
  assert.deepEqual(before.bodyPosition, [0, 0, 0], "constrained liquid must not translate as a floating box");
  const body = scene.group.getObjectByName("content-liquid");
  close(body.userData.fillVolume, 0.08 * 0.12 * 0.05 * 0.25);
  assert.ok(before.bodyVertices.some((value, index) => index % 3 === 1 && Math.abs(value + 0.06) < 1e-7), "liquid touches its supporting floor");
  tick(scene, 200, 5);
  assert.deepEqual(liquidSnapshot(scene), before);
  scene.setDeviceState({ ...state, fill: 0.25, velocityX: -0.9, energy: 0.9 });
  tick(scene);
  assert.notDeepEqual(liquidSnapshot(scene).surfaceVertices, before.surfaceVertices);
  scene.setDeviceState({ ...state, fill: 0.75 });
  tick(scene);
  close(body.userData.fillVolume, 0.08 * 0.12 * 0.05 * 0.75);
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

test("continuous soda jet consumes the pressure snapshot and freezes independently of render elapsed time", () => {
  const scene = new ContainerScene();
  scene.setPreset(preset({ preset: "liquid_soda_bottle", family: "Liquid" }), true);
  const pressure = { phase: "burst", phaseS: 0.37, charge: 0.62, remaining: 0.58, burstSequence: 17 };
  scene.setDeviceState({ ...state, phaseS: 12.9, pressure });
  tick(scene);
  const jet = scene.group.getObjectByName("content-soda-jet");
  assert.equal(jet.visible, true);
  assert.equal(jet.userData.sharedPhaseS, 0.37, "the burst clock, not the general model clock, controls the jet");
  assert.equal(jet.userData.burstSequence, 17);
  const geometry = () => jet.children.map(mesh => Array.from(mesh.geometry.attributes.position.array));
  const before = geometry();
  const versions = jet.children.map(mesh => mesh.geometry.attributes.position.version);
  pressure.phaseS = 1.2; // Caller-owned objects cannot change a held snapshot.
  tick(scene, 1200, 60);
  assert.deepEqual(geometry(), before);
  assert.deepEqual(jet.children.map(mesh => mesh.geometry.attributes.position.version), versions);
  scene.setDeviceState({ ...state, phaseS: 12.9, pressure: { ...pressure, phaseS: 0.55 } });
  tick(scene);
  assert.notDeepEqual(geometry(), before);

  for (const reset of [{ ...pressure, phase: "sealed", phaseS: 0, burstSequence: 0, remaining: 1 },
    { ...pressure, phase: "spent", phaseS: 2.8, remaining: 0.25 }, undefined]) {
    scene.setDeviceState({ ...state, pressure: reset });
    tick(scene);
    assert.equal(jet.visible, false);
    assert.equal(scene.group.getObjectByName("content-soda-spray").visible, false);
  }
});

test("empty water and exhausted soda hide the optical contact and floor as well as the liquid", () => {
  const scene = new ContainerScene();
  scene.setPreset(preset({ preset: "liquid", family: "Liquid" }), true);
  scene.setDeviceState({ ...state, phaseS: 2 });
  tick(scene);
  const contact = scene.group.getObjectByName("content-liquid-contact");
  const floor = scene.group.getObjectByName("content-liquid-caustics");
  assert.equal(contact.visible, true);
  assert.equal(floor.visible, true);
  for (const empty of [{ ...state, fill: 0 },
    { ...state, pressure: { phase: "spent", phaseS: 3, charge: 0, remaining: 0, burstSequence: 1 } }]) {
    scene.setDeviceState(empty);
    tick(scene);
    assert.equal(contact.visible, false);
    assert.equal(floor.visible, false);
    assert.equal(scene.group.getObjectByName("content-liquid").visible, false);
    assert.equal(scene.group.getObjectByName("content-liquid-surface").visible, false);
    assert.equal(scene.group.getObjectByName("content-soda-jet").visible, false);
  }
});

test("contained water uses refractive coverage and an unbiased linear normal-data texture", () => {
  const scene = new ContainerScene();
  scene.setPreset(preset({ preset: "liquid", family: "Liquid" }), true);
  scene.setDeviceState(state);
  tick(scene);
  for (const name of ["content-liquid", "content-liquid-surface"]) {
    const material = scene.group.getObjectByName(name).material;
    assert.equal(material.type, "MeshPhysicalMaterial");
    assert.equal(material.opacity, 1, "optical transmission, not faded alpha, carries water transparency");
    assert.ok(material.transmission > 0.8);
    assert.equal(material.ior, 1.333);
    assert.ok(material.thickness > 0);
    assert.ok(material.attenuationDistance > 0);
  }
  const normalMap = scene.group.getObjectByName("content-liquid-surface").material.normalMap;
  assert.equal(normalMap.isDataTexture, true);
  assert.equal(normalMap.colorSpace, NoColorSpace);
  assert.equal(normalMap.magFilter, LinearFilter);
  assert.equal(normalMap.minFilter, LinearMipmapLinearFilter);
  assert.equal(normalMap.generateMipmaps, true);
  const pixels = normalMap.image.data;
  for (const component of [0, 1]) {
    let sum = 0;
    for (let at = component; at < pixels.length; at += 4) sum += pixels[at];
    assert.ok(Math.abs(sum / (pixels.length / 4) - 127.5) < 0.15, "both normal axes remain centered rather than biased");
  }
});

test("preset rebuild disposes new optics exactly once while retaining shared baseline materials and grip pads", () => {
  const scene = new ContainerScene();
  const marble = preset({ preset: "granular_single_marble_box", family: "Granular" });
  scene.setPreset(marble, true);
  scene.setDeviceState(state);
  tick(scene);
  const shared = new Set([scene.group.children[0].material, scene.group.children[1].material, particles(scene).material]);
  const grip = scene.gripProxy.group;
  const pads = grip.children.filter(object => object.isMesh);
  const padGeometry = pads.map(pad => pad.geometry);
  for (const pad of pads) shared.add(pad.material);
  const preserved = new Map();
  for (const resource of [...shared, ...new Set(padGeometry)]) {
    preserved.set(resource, 0);
    resource.addEventListener("dispose", () => preserved.set(resource, preserved.get(resource) + 1));
  }

  scene.setPreset(preset({ preset: "liquid_soda_bottle", family: "Liquid" }), true);
  scene.setDeviceState({ ...state, pressure: { phase: "burst", phaseS: 0.4, charge: 0.6, remaining: 0.7, burstSequence: 1 } });
  tick(scene);
  const owned = new Set();
  const record = object => {
    if (!object.geometry || !object.material) return;
    owned.add(object.geometry);
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      assert.equal(shared.has(material), false, "new optical meshes own their materials");
      owned.add(material);
      if (material.map) owned.add(material.map);
      if (material.normalMap) owned.add(material.normalMap);
    }
  };
  record(scene.group.children[0]); // Per-liquid vessel clone.
  for (const name of ["container-preview-label", "content-liquid", "content-liquid-surface",
    "content-soda-bubbles", "content-soda-spray", "content-soda-jet", "content-liquid-contact", "content-liquid-caustics"]) {
    scene.group.getObjectByName(name).traverse(record);
  }
  const disposed = new Map([...owned].map(resource => [resource, 0]));
  for (const resource of owned) resource.addEventListener("dispose", () => disposed.set(resource, disposed.get(resource) + 1));

  scene.setPreset(marble, true);
  assert.ok(owned.size > 20, "covers helper meshes, transmission optics, labels and cloned normal texture");
  for (const [resource, count] of disposed) assert.equal(count, 1, `${resource.type ?? "texture"} released exactly once`);
  for (const count of preserved.values()) assert.equal(count, 0, "shared materials and grip pads survive comparisons");
  assert.equal(scene.gripProxy.group, grip);
  assert.equal(grip.parent, scene.group);
  assert.deepEqual(pads.map(pad => pad.geometry), padGeometry);
  assert.ok(shared.has(scene.group.children[0].material), "marble returns to its existing vessel material");
  assert.ok(shared.has(particles(scene).material), "marble retains its existing content material");
  assert.equal(scene.group.getObjectByName("content-soda-jet"), undefined);
  scene.setPreset(marble, true);
  for (const count of disposed.values()) assert.equal(count, 1, "later comparisons do not dispose retired helpers again");
});
