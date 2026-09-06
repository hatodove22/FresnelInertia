// Real clipped geometry: volume, gravity, retention and state-driven carbonation.
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { Vector3, Euler, Quaternion } from "three";

const load = async path => {
  const output = await build({ entryPoints: [fileURLToPath(new URL(path, import.meta.url))], bundle: true, format: "esm", platform: "node", write: false, logLevel: "silent" });
  return import(`data:text/javascript;base64,${Buffer.from(output.outputFiles[0].text).toString("base64")}`);
};
const { ContainedVolume } = await load("../src/renderer/ContainedVolume.ts");
const { ContainerScene } = await load("../src/renderer/ContainerScene.ts");
const previousDocument = globalThis.document;
const context = new Proxy({}, { get: (target, key) => key in target ? target[key] : key === "createRadialGradient" || key === "createLinearGradient" ? () => ({ addColorStop() {} }) : () => {}, set: (target, key, value) => { target[key] = value; return true; } });
globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => context }) };
after(() => { globalThis.document = previousDocument; });

const size = new Vector3(0.08, 0.12, 0.05);
const fullVolume = size.x * size.y * size.z;
const close = (a, b, tolerance = 1e-7) => assert.ok(Math.abs(a - b) <= tolerance, `${a} != ${b}`);
function meshVolume(...geometries) {
  let volume = 0;
  for (const geometry of geometries) {
    const data = geometry.attributes.position.array;
    for (let i = 0; i < geometry.drawRange.count * 3; i += 9) {
      const a = new Vector3(...data.slice(i, i + 3)), b = new Vector3(...data.slice(i + 3, i + 6)), c = new Vector3(...data.slice(i + 6, i + 9));
      volume += a.dot(b.cross(c)) / 6;
    }
  }
  return Math.abs(volume);
}
function bounded(geometry) {
  const data = geometry.attributes.position.array;
  for (let i = 0; i < geometry.drawRange.count * 3; i++) {
    assert.ok(Number.isFinite(data[i]));
    assert.ok(Math.abs(data[i]) <= size.getComponent(i % 3) / 2 + 1e-7);
  }
}
const preset = family => ({ preset: family === "Liquid" ? "liquid_small_box" : "granular_sand_box", family, container: { span_x_m: size.x, span_y_m: size.y, span_z_m: size.z, fill: 0.5, particle_count: 0.9, particle_hardness: 0.35 } });
const state = { massX: 0, massY: -0.5, velocityX: 0, velocityY: 0, energy: 0, fill: 0.5, phaseS: 0 };
const content = { surfaceOffsetX: 0, surfaceOffsetY: 0, surfaceVelocityX: 0, surfaceVelocityY: 0, agitation: 0, particleSpread: 0, impactPulse: 0, wavePrimary: 0, waveSecondary: 0 };
const tick = (scene, time = 0) => scene.update({ x: 0, y: 0 }, content, time, 0.016);

test("clipped liquid keeps fill volume and wall bounds through side-on and inverted poses", () => {
  const volume = new ContainedVolume(size.clone());
  for (const normal of [new Vector3(0, 1, 0), new Vector3(1, 0, 0), new Vector3(0, 0, -1), new Vector3(0, -1, 0), new Vector3(0.8, 0.002, 0.6), new Vector3(0.3, 0.8, -0.4)]) {
    for (const fill of [0, 0.04, 0.35, 0.5, 0.9, 1]) {
      volume.update(fill, normal);
      close(volume.volume, fullVolume * fill, fullVolume * 1e-6);
      close(meshVolume(volume.body, volume.surface), fullVolume * fill, fullVolume * 2e-6);
      bounded(volume.body); bounded(volume.surface);
    }
  }
});

test("surface ripples change shape without lifting the body or creating liquid volume", () => {
  const volume = new ContainedVolume(size.clone());
  volume.update(0.5, new Vector3(0.4, 1, -0.3), 0.0005, 0.2);
  close(meshVolume(volume.body, volume.surface), fullVolume * 0.5, fullVolume * 1e-5);
  const before = Float32Array.from(volume.surface.attributes.position.array);
  const attribute = volume.surface.attributes.position;
  volume.update(0.5, new Vector3(0.4, 1, -0.3), 0.0005, 0.6);
  assert.equal(volume.surface.attributes.position, attribute, "model updates reuse GPU attributes");
  assert.notDeepEqual(volume.surface.attributes.position.array, before);
  bounded(volume.surface);
});

test("a freshly initialized resting liquid maps to world up at each roll, pitch and combined pose", () => {
  for (const [pitch, roll] of [[0, 0.75], [0.5, 0], [-0.6, 1.3], [0, Math.PI / 2]]) {
    // A new sample stream initializes quietly in its current orientation.
    // Subsequent orientation changes are intentionally allowed to excite slosh.
    const scene = new ContainerScene();
    scene.setPreset(preset("Liquid"), true);
    scene.setDeviceState(state);
    scene.setDeviceOrientation({ pitchRad: pitch, rollRad: roll });
    tick(scene);
    const surface = scene.group.getObjectByName("content-liquid-surface");
    const positions = surface.geometry.attributes.position;
    const rotation = new Quaternion().setFromEuler(new Euler(pitch, 0, roll));
    let height;
    for (let i = 0; i < surface.geometry.drawRange.count; i++) {
      const point = new Vector3().fromBufferAttribute(positions, i).applyQuaternion(rotation);
      if (height === undefined) height = point.y;
      close(point.y, height);
    }
  }
});

test("decorative wave fields preserve actual mesh volume and wall bounds even near corners", () => {
  const volume = new ContainedVolume(size.clone());
  let revision = 0;
  for (const normal of [new Vector3(0, 1, 0), new Vector3(1, 0, 0), new Vector3(0, 0, -1),
    new Vector3(0, -1, 0), new Vector3(0.75, 0.15, -0.7), new Vector3(-0.4, 0.8, 0.7)]) {
    for (const fill of [0.01, 0.12, 0.5, 0.9, 0.99]) {
      // An intentionally excessive input must be globally compressed, not
      // individually clipped after displacement (which would lose volume).
      volume.update(fill, normal, 0, 0, {
        revision: ++revision,
        displacement: (u, v) => Math.sin(u * 11 + v * 8) * 4 + 3
      });
      close(meshVolume(volume.body, volume.surface), fullVolume * fill, fullVolume * 5e-6);
      bounded(volume.body); bounded(volume.surface);
      const positions = volume.surface.attributes.position;
      for (const edge of volume.boundary) {
        let closest = Infinity;
        for (let i = 0; i < volume.surface.drawRange.count; i++) {
          closest = Math.min(closest, edge.distanceTo(new Vector3().fromBufferAttribute(positions, i)));
        }
        assert.ok(closest < 1e-7, "the visible waterline remains attached to the exact wall intersection");
      }
    }
  }
});

test("wave revision updates reusable geometry while duplicate revisions freeze it", () => {
  const volume = new ContainedVolume(size.clone());
  let phase = 0;
  const waves = { revision: 1, displacement: (u, v) => Math.sin(u * 13 + v * 9 + phase) * 0.0018 };
  volume.update(0.5, new Vector3(0, 1, 0), 0, 0, waves);
  const position = volume.surface.attributes.position;
  const before = Float32Array.from(position.array);
  const version = position.version;
  phase = 0.8;
  volume.update(0.5, new Vector3(0, 1, 0), 0, 0, waves);
  assert.equal(position.version, version, "a held wave snapshot does not upload new geometry");
  assert.deepEqual(position.array, before);
  volume.update(0.5, new Vector3(0, 1, 0), 0, 0, { ...waves, revision: 2 });
  assert.equal(volume.surface.attributes.position, position);
  assert.notDeepEqual(position.array, before);
  close(meshVolume(volume.body, volume.surface), fullVolume * 0.5, fullVolume * 5e-6);
});

test("water uses smooth shared normals instead of a triangle-faceted free surface", () => {
  const volume = new ContainedVolume(size.clone());
  volume.update(0.5, new Vector3(0, 1, 0), 0, 0, {
    revision: 1, displacement: (u, v) => Math.sin(u * 9) * Math.cos(v * 11) * 0.002
  });
  const position = volume.surface.attributes.position, normal = volume.surface.attributes.normal;
  const seen = new Map();
  let duplicates = 0;
  for (let i = 0; i < volume.surface.drawRange.count; i++) {
    const key = [position.getX(i), position.getY(i), position.getZ(i)].map(value => value.toFixed(8)).join(",");
    const n = new Vector3().fromBufferAttribute(normal, i);
    assert.ok(Number.isFinite(n.length()));
    close(n.length(), 1, 1e-5);
    if (seen.has(key)) {
      assert.ok(n.distanceTo(seen.get(key)) < 1e-4, "coincident surface vertices share their averaged normal");
      duplicates++;
    } else seen.set(key, n);
  }
  assert.ok(duplicates > 100, "compares enough shared vertices to catch flat triangle shading");
});

test("pile slope owns retained bed geometry, while only flowing surface grains advance", () => {
  const scene = new ContainerScene();
  scene.setPreset(preset("Granular"), true);
  scene.setDeviceState({ ...state, pileSlope: 0.55, granularFlow: 0, phaseS: 0 });
  tick(scene);
  const bed = scene.group.getObjectByName("content-sand-surface");
  const grains = scene.group.getObjectByName("content-particles");
  const bedBefore = Float32Array.from(bed.geometry.attributes.position.array);
  const grainBefore = Float32Array.from(grains.instanceMatrix.array);
  scene.setDeviceState({ ...state, pileSlope: 0.55, granularFlow: 0, phaseS: 3 });
  scene.setDeviceOrientation({ pitchRad: 0.2, rollRad: -0.4 });
  tick(scene, 30);
  assert.deepEqual(bed.geometry.attributes.position.array, bedBefore);
  assert.deepEqual(grains.instanceMatrix.array, grainBefore);
  scene.setDeviceState({ ...state, pileSlope: 0.55, granularFlow: 0.8, phaseS: 4 });
  tick(scene);
  assert.notDeepEqual(grains.instanceMatrix.array, grainBefore);
  assert.deepEqual(bed.geometry.attributes.position.array, bedBefore);
});

test("sand grain shading is object-locked per fragment, not diagonal vertex-color bands", () => {
  const scene = new ContainerScene();
  scene.setPreset(preset("Granular"), true);
  scene.setDeviceState({ ...state, pileSlope: 0.55 });
  tick(scene);
  for (const name of ["content-sand-body", "content-sand-surface"]) {
    const mesh = scene.group.getObjectByName(name);
    assert.equal(mesh.material.vertexColors, false);
    assert.equal(mesh.geometry.hasAttribute("color"), false);
    const shader = { uniforms: {}, vertexShader: "#include <common>\n#include <begin_vertex>", fragmentShader: "#include <common>\n#include <color_fragment>" };
    mesh.material.onBeforeCompile(shader);
    assert.ok(shader.uniforms.sandGrainSize.value > 0);
    assert.match(shader.vertexShader, /vSandPosition = position/);
    assert.match(shader.fragmentShader, /dFdx\(grainPosition\)/, "subpixel grains fade instead of aliasing");
    assert.doesNotMatch(shader.fragmentShader, /sin\(|cos\(|time|phase/, "no periodic stripe or clock-driven texture");
  }
});

test("carbonation uses shared phase/remaining state and freezes without new snapshots", () => {
  const scene = new ContainerScene();
  scene.setPreset(preset("Liquid"), true);
  scene.setDeviceState({ ...state, pressure: { charge: 0.8, phase: "sealed", phaseS: 1, remaining: 1, burstSequence: 0 } });
  tick(scene);
  const bubbles = scene.group.getObjectByName("content-soda-bubbles");
  const spray = scene.group.getObjectByName("content-soda-spray");
  assert.equal(bubbles.visible, true);
  assert.equal(spray.visible, false);
  scene.setDeviceState({ ...state, pressure: { charge: 1, phase: "burst", phaseS: 0.3, remaining: 0.6, burstSequence: 1 } });
  tick(scene);
  assert.equal(spray.visible, true);
  assert.ok(Array.from(spray.instanceMatrix.array).some((value, index) => index % 16 === 0 && value > 0));
  const frozen = Float32Array.from(spray.instanceMatrix.array);
  tick(scene, 300);
  assert.deepEqual(spray.instanceMatrix.array, frozen);
  close(scene.group.getObjectByName("content-liquid").userData.fillVolume, fullVolume * state.fill * 0.6);
  scene.setDeviceState({ ...state, pressure: { charge: 0, phase: "spent", phaseS: 3, remaining: 0, burstSequence: 1 } });
  tick(scene);
  assert.equal(bubbles.visible, false);
  assert.equal(spray.visible, false);
  assert.equal(scene.group.getObjectByName("content-liquid").visible, false);
});
