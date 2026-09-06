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
const particles = (scene) => scene.group.getObjectByName("content-sand-pile")?.visible
  ? scene.group.getObjectByName("content-sand-grains") : scene.group.getObjectByName("content-particles");
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
  geometry.computeBoundingBox();
  close(geometry.boundingBox.max.x - geometry.boundingBox.min.x, 0.08);
  close(geometry.boundingBox.max.y - geometry.boundingBox.min.y, 0.12);
  close(geometry.boundingBox.max.z - geometry.boundingBox.min.z, 0.05);
  scene.setPreset(descriptor);
  assert.equal(scene.group.children[0].geometry.type, "CylinderGeometry");
  scene.setPreset(preset());
  const preview = scene.group.children[0].geometry;
  preview.computeBoundingBox();
  close(preview.boundingBox.max.x - preview.boundingBox.min.x, 0.07);
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
  scene.setPreset(preset({ preset: "granular_beads" }), true);
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
  assert.deepEqual(before.bodyPosition, [0, 0, 0], 'liquid stays attached to its cavity');
  assert.ok(Math.abs(scene.group.getObjectByName('content-liquid').parent.userData.volumeFraction - 0.25) < 0.00001);
  tick(scene, 200, 5);
  assert.deepEqual(liquidSnapshot(scene), before);
  scene.setDeviceState({ ...state, fill: 0.25, velocityX: -0.9, energy: 0.9 });
  tick(scene);
  assert.notDeepEqual(liquidSnapshot(scene).surfaceVertices, before.surfaceVertices);
  scene.setDeviceState({ ...state, fill: 0.75 });
  tick(scene);
  assert.ok(Math.abs(scene.group.getObjectByName('content-liquid').parent.userData.volumeFraction - 0.75) < 0.00001);
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

test("large preview labels never obscure the contents in either source mode", () => {
  const scene = new ContainerScene();
  scene.setPreset(preset());
  assert.equal(scene.group.getObjectByName('container-preview-label'), undefined);
  scene.setDeviceState(state);
  assert.equal(scene.group.getObjectByName('container-preview-label'), undefined);
  scene.dispose();
});

test("material switches compose liquid and grains without leaving the previous ingredient", () => {
  const scene = new ContainerScene();
  scene.setDeviceState(state);
  for (const family of ["Liquid", "Granular", "Hybrid", "Custom", "Granular"]) {
    scene.setPreset(preset({ family }), true);
    tick(scene);
    assert.equal(!!particles(scene), family === "Granular" || family === "Hybrid");
    assert.equal(!!scene.group.getObjectByName("content-liquid"), family === "Liquid" || family === "Hybrid");
    if (particles(scene)) {
      const before = particlePositions(scene);
      tick(scene, 100, 10);
      assert.deepEqual(particlePositions(scene), before);
    }
    assert.equal(scene.group.getObjectByName("container-preview-label"), undefined);
  }
  scene.dispose();
});

function ownedResources(root, excluded) {
  const resources = new Set();
  const visit = object => {
    if (object === excluded) return;
    if (object.isInstancedMesh) resources.add(object);
    if (object.geometry) resources.add(object.geometry);
    for (const material of object.material ? [object.material].flat() : []) {
      resources.add(material);
      for (const value of Object.values(material)) if (value?.isTexture) resources.add(value);
    }
    for (const child of object.children) visit(child);
  };
  visit(root);
  return resources;
}

function watchDisposal(resources) {
  const calls = new Map([...resources].map(resource => [resource, 0]));
  for (const resource of resources) resource.addEventListener("dispose", () => calls.set(resource, calls.get(resource) + 1));
  return calls;
}

test("preset and source rebuilds dispose replaced resources exactly once and preserve grip pads", () => {
  const scene = new ContainerScene();
  scene.setPreset(preset({ family: "Hybrid", visual_shape: "cylinder_bottle" }));
  const pad = scene.gripProxy.group.children[0];
  const gripCalls = watchDisposal([pad.geometry, pad.material]);
  const old = watchDisposal(ownedResources(scene.group, scene.gripProxy.group));
  assert.ok(old.size > 12, "includes vessel, liquid normal texture and instance buffers");
  scene.setPreset(preset({ family: "Liquid", visual_shape: "tumbler_cup" }));
  assert.ok([...old.values()].every(count => count === 1));
  assert.deepEqual([...gripCalls.values()], [0, 0]);
  const preview = watchDisposal(ownedResources(scene.group, scene.gripProxy.group));
  scene.setDeviceState(state);
  assert.ok([...preview.values()].every(count => count === 1));
  const connected = watchDisposal(ownedResources(scene.group, scene.gripProxy.group));
  scene.setDeviceState({ ...state, massX: -0.5 });
  tick(scene);
  assert.ok([...connected.values()].every(count => count === 0), "new samples update existing resources");
  scene.dispose();
  scene.dispose();
  tick(scene);
  assert.equal(scene.group.children.length, 0);
  assert.ok([...connected.values()].every(count => count === 1));
  assert.ok([...old.values()].every(count => count === 1));
  assert.deepEqual([...gripCalls.values()], [1, 1], "two grip pads share one geometry/material within the owner");
  assert.throws(() => scene.setPreset(preset()), /disposed/);
});

test("independent preview and device scenes cannot mutate or dispose each other's materials", () => {
  const preview = new ContainerScene();
  const device = new ContainerScene();
  const liquid = preset({ family: "Liquid" });
  preview.setPreset(liquid);
  device.setPreset(liquid, true);
  device.setDeviceState(state);
  tick(device);
  const map = scene => scene.group.getObjectByName("content-liquid-surface").material.normalMap;
  assert.notEqual(map(preview), map(device));
  const resources = watchDisposal(ownedResources(device.group));
  const phase = map(device).offset.toArray();
  const shape = liquidSnapshot(device);
  tick(preview, 500, 0.03);
  assert.deepEqual(map(device).offset.toArray(), phase);
  preview.dispose();
  assert.ok([...resources.values()].every(count => count === 0));
  tick(device, 1000, 5);
  assert.deepEqual(liquidSnapshot(device), shape);
  device.dispose();
  assert.ok([...resources.values()].every(count => count === 1));
});

test("accepted single-marble mesh and material stay unchanged", () => {
  const scene = new ContainerScene();
  scene.setPreset(preset({ preset: "granular_single_marble_box" }), true);
  scene.setDeviceState(state);
  tick(scene);
  const mesh = particles(scene);
  assert.equal(mesh.count, 1);
  assert.equal(mesh.geometry.type, "SphereGeometry");
  assert.equal(mesh.geometry.parameters.widthSegments, 10);
  assert.equal(mesh.geometry.parameters.heightSegments, 8);
  assert.equal(mesh.material.color.getHexString(), "d8c071");
  assert.equal(mesh.material.roughness, 0.76);
  scene.dispose();
});


test('rotated vessels keep every shell/rim/cap vertex above the desktop; XR translation is retained', () => {
  for (const shape of ['box', 'cylinder_bottle', 'tumbler_cup']) {
    const scene = new ContainerScene();
    scene.setPreset(preset({ visual_shape: shape }));
    scene.setDeviceState(state);
    for (const [pitchRad, rollRad] of [[0,0], [0.7,-0.5], [Math.PI / 2,0], [0,Math.PI], [2.8,-2.2]]) {
      scene.setDeviceOrientation({pitchRad,rollRad}); tick(scene);
      scene.group.updateMatrixWorld(true);
      const heights = [];
      for (const child of scene.group.children) {
        if (!child.geometry) continue; // Direct children are vessel meshes/edges only.
        const positions = child.geometry.getAttribute('position');
        for (let i=0;i<positions.count;i++) heights.push(child.localToWorld(child.position.clone().fromBufferAttribute(positions,i)).y);
      }
      close(Math.min(...heights), 0.8248);
    }
    scene.setDesktopPresentation(false);
    scene.group.position.set(0.4,1.1,-0.3); tick(scene);
    assert.deepEqual(scene.group.position.toArray(), [0.4,1.1,-0.3]);
    scene.dispose();
  }
});

test('acceleration cue is bounded, cannot drift, freezes without samples and returns to rest', () => {
  const scene = new ContainerScene();
  scene.setPreset(preset(),true); scene.setDeviceState(state);
  scene.setDeviceOrientation({pitchRad:0,rollRad:0});
  tick(scene);
  const anchor = scene.getDesktopTarget(scene.group.position.clone()).toArray();
  for(let i=0;i<100;i++) { scene.setDeviceAcceleration([10,0,-10]); tick(scene); }
  const offset = scene.group.position.toArray();
  assert.ok(Math.hypot(offset[0],offset[2]+0.72) <= 0.05*0.18+1e-10);
  assert.ok(Math.hypot(offset[0],offset[2]+0.72) > 0.008);
  tick(scene,999,5);
  assert.deepEqual(scene.group.position.toArray(),offset);
  scene.setDeviceAcceleration([NaN,Infinity,0]); tick(scene);
  assert.deepEqual(scene.group.position.toArray(),offset);
  assert.deepEqual(scene.getDesktopTarget(scene.group.position.clone()).toArray(),anchor,'camera anchor must not cancel translation');
  for(let i=0;i<100;i++) {scene.setDeviceAcceleration([0,0,0]);tick(scene);}
  close(scene.group.position.x,0); close(scene.group.position.z,-0.72);
  scene.setDeviceAcceleration([1,0,0]);tick(scene);
  scene.setDeviceAcceleration(null);tick(scene);
  close(scene.group.position.x,0);
  scene.dispose();
});

test('round preview vessels constrain complete particles to their changing inner radius', () => {
  const scene = new ContainerScene();
  scene.setPreset(preset({family:'Hybrid',visual_shape:'tumbler_cup'}));
  for(let frame=0;frame<120;frame++) {
    scene.update({x:0.9,y:-0.8},content,frame/60,1/60);
    const mesh = particles(scene);
    for(let i=0;i<mesh.count;i++) {
      const m = mesh.instanceMatrix.array.slice(i*16,(i+1)*16);
      const radius = Math.hypot(m[0],m[1],m[2]);
      const inner = (0.052+(0.07-0.052)*Math.min(1,Math.max(0,(m[13]+0.035)/0.07)))*0.48;
      assert.ok(Math.hypot(m[12],m[14])+radius <= inner+1e-7);
    }
  }
  scene.dispose();
});

test('quiet positional cue recenters gently over seconds at different sample rates without levelling a held tilt', () => {
  const recovered = [];
  for (const rate of [5, 10, 20]) {
    const scene = new ContainerScene();
    scene.setPreset(preset(), true); scene.setDeviceState(state);
    scene.setDeviceOrientation({pitchRad:0.3,rollRad:-0.4});
    scene.setDeviceAcceleration([5,0,0],0.1); tick(scene);
    const start = scene.group.position.x;
    const anchor = scene.getDesktopTarget(scene.group.position.clone()).toArray();
    for (let i=0;i<rate*0.8;i++) { scene.setDeviceAcceleration([0,0,0],1/rate); tick(scene); }
    const fraction = scene.group.position.x/start;
    assert.ok(fraction>0.32 && fraction<0.42, 'still returns gently, not an immediate snap');
    recovered.push(scene.group.position.x);
    close(scene.group.rotation.x,0.3); close(scene.group.rotation.z,-0.4);
    assert.deepEqual(scene.getDesktopTarget(scene.group.position.clone()).toArray(),anchor);
    const held = scene.group.position.toArray();
    for(let i=0;i<60;i++) tick(scene,20+i,1/60);
    assert.deepEqual(scene.group.position.toArray(),held,'no fresh samples means no recovery animation');
    for(let i=0;i<rate*1.6;i++) { scene.setDeviceAcceleration([0,0,0],1/rate); tick(scene); }
    assert.ok(Math.abs(scene.group.position.x/start)<0.06,'at least 94% returned after 2.4 s');
    scene.dispose();
  }
  recovered.forEach(value=>close(value,recovered[0]));
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
    const sand = scene.group.getObjectByName('content-sand-grains');
    const positions = Array.from({ length: sand.count }, (_, i) => Array.from(sand.instanceMatrix.array.slice(i * 16 + 12, i * 16 + 15)));
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
    assert.deepEqual(Array.from({ length: sand.count }, (_, i) => Array.from(sand.instanceMatrix.array.slice(i * 16 + 12, i * 16 + 15))), positions);
    assert.deepEqual(Array.from(surface.geometry.attributes.position.array), bed);
  }
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
