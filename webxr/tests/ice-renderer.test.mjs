// Actual Three geometry/poses, without WebGL, browser globals or hardware.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const bundled = await build({ stdin: { contents: `
  export { IceContentRenderer } from './src/renderer/IceContentRenderer';
  export { ContainerGeometry } from './src/renderer/ContainerGeometry';
  export { ContainedVolume } from './src/renderer/ContainedVolume';
  import * as THREE from 'three'; export { THREE };
`, resolveDir: fileURLToPath(new URL('..', import.meta.url)), loader: 'ts' },
  bundle: true, format: 'esm', platform: 'node', write: false, logLevel: 'silent' });
const { IceContentRenderer, ContainerGeometry, ContainedVolume, THREE } =
  await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`);
const quiet = { surfaceOffsetX: 0, surfaceOffsetY: 0, surfaceVelocityX: 0, surfaceVelocityY: 0,
  agitation: 0, particleSpread: 0, impactPulse: 0, wavePrimary: 0, waveSecondary: 0 };
const state = { massX: 0, massY: -0.35, velocityX: 0, velocityY: 0, energy: 0, fill: 0.65, phaseS: 1 };
const cubeCorners = [-0.5, 0.5].flatMap(x => [-0.5, 0.5].flatMap(y => [-0.5, 0.5].map(z => new THREE.Vector3(x, y, z))));
function fixture({ shape = 'box', resolved = shape === 'box', dimensions = [0.07, 0.07, 0.09], count = 0.18, fill = 0.65 } = {}) {
  const preset = { preset: 'hybrid_ice_water', family: 'Hybrid', visual_shape: shape,
    container: { span_x_m: dimensions[0], span_y_m: dimensions[1], span_z_m: dimensions[2],
      fill, viscosity: 0.2, particle_count: count, particle_hardness: 0.95 } };
  const geometry = new ContainerGeometry(preset, resolved), volume = new ContainedVolume(geometry.liquidHull());
  volume.update(fill, new THREE.Vector3(0, 1, 0));
  const ice = new IceContentRenderer(preset, geometry);
  ice.updateDevice({ ...state, fill }, volume);
  const bodies = ice.group.getObjectByName('content-particles');
  return { ice, volume, geometry, bodies, preset };
}
function pose(mesh, index) {
  const matrix = new THREE.Matrix4(); mesh.getMatrixAt(index, matrix);
  const position = new THREE.Vector3(), rotation = new THREE.Quaternion(), scale = new THREE.Vector3();
  matrix.decompose(position, rotation, scale);
  return { matrix, position, rotation, scale };
}
function assertContained(f) {
  for (let i = 0; i < f.bodies.count; i++) {
    const p = pose(f.bodies, i);
    assert.ok(p.matrix.elements.every(Number.isFinite));
    assert.ok(p.scale.toArray().every(value => value > 0));
    for (const corner of cubeCorners) {
      const point = corner.clone().applyMatrix4(p.matrix);
      assert.ok(f.volume.contains(point), `chunk ${i} outside ${f.geometry.shape}: ${point.toArray()}`);
      if (f.geometry.shape === 'box') assert.ok(point.y >= -f.geometry.dimensions.y * 0.475 - 1e-8, 'ice enters the visible glass base');
    }
  }
}
function snapshot(ice) {
  ice.group.updateMatrixWorld(true);
  const result = [];
  ice.group.traverse(node => {
    result.push([node.name, ...node.matrix.elements]);
    if (node.instanceMatrix) result.push(Array.from(node.instanceMatrix.array));
  });
  return result;
}
function release(f) { f.ice.dispose(); f.volume.body.dispose(); f.volume.surface.dispose(); }

test('ice is a few legible translucent rounded chunks with sparse internal details', () => {
  const f = fixture();
  assert.equal(f.bodies.count, 4);
  assert.equal(f.bodies.userData.ice, true);
  assert.ok(f.bodies.material.transmission > 0);
  assert.equal(f.bodies.material.transparent, true);
  assert.ok(f.bodies.material.opacity > 0.2 && f.bodies.material.opacity < 0.8);
  assert.equal(f.bodies.material.depthWrite, false, 'clear bodies must not occlude their internal transparent details');
  assert.ok(f.bodies.material.ior >= 1.3 && f.bodies.material.ior < 1.4);
  assert.equal(f.bodies.material.roughnessMap.colorSpace, THREE.NoColorSpace);
  assert.equal(f.bodies.material.bumpMap, f.bodies.material.roughnessMap);
  assert.ok(pose(f.bodies, 0).scale.x > 0.012, 'chunks should remain visually legible in the ordinary box');
  const pockets = f.ice.group.getObjectByName('ice-air-pockets');
  assert.equal(pockets.isInstancedMesh, true);
  assert.equal(pockets.count, 20, 'small air pockets share one draw call');
  assertContained(f); release(f);
});

test('ordinary and tilted ice straddle the actual liquid plane, including forward/back pitch', () => {
  const f = fixture();
  const levelPoses = Array.from({ length: f.bodies.count }, (_, i) => pose(f.bodies, i).position.toArray());
  for (const normal of [new THREE.Vector3(0, 1, 0), new THREE.Vector3(0.12, 1, 0.28)]) {
    f.volume.update(0.65, normal); f.ice.updateDevice(state, f.volume);
    for (let i = 0; i < f.bodies.count; i++) {
      const p = pose(f.bodies, i), distances = cubeCorners.map(corner => f.volume.normal.dot(corner.clone().applyMatrix4(p.matrix)) - f.volume.level);
      assert.ok(Math.min(...distances) < -0.002, 'ice must have a submerged portion');
      assert.ok(Math.max(...distances) > 0.001, 'ice must have an exposed portion');
      assert.ok(f.volume.heightAt(p.position.x, p.position.z) > p.position.y, 'chunk center stays below its local waterline');
    }
    assertContained(f);
  }
  assert.notDeepEqual(Array.from({ length: f.bodies.count }, (_, i) => pose(f.bodies, i).position.toArray()), levelPoses);
  release(f);
});

test('complete oriented chunks stay inside boxes and round hulls at extreme fills and poses', () => {
  const normals = [[0, 1, 0], [1, 0, 0], [0, -1, 0], [0.9, 0.02, 0.4], [-0.2, 0.7, 0.7]];
  for (const shape of ['box', 'tumbler_cup', 'cylinder_bottle']) for (const count of [0, 0.18, 1]) {
    const f = fixture({ shape, count });
    for (const fill of [0.000001, 0.05, 0.5, 0.999999, 1]) for (const normal of normals) {
      f.volume.update(fill, new THREE.Vector3(...normal));
      f.ice.updateDevice({ ...state, fill, massX: normal[0] > 0 ? 1 : -1, velocityX: 200, velocityY: -200 }, f.volume);
      assert.equal(f.ice.group.visible, true);
      assertContained(f);
    }
    release(f);
  }
});

test('anisotropic small containers fit all chunks without overlapping their bounding spheres', () => {
  for (const dimensions of [[0.012, 0.08, 0.10], [0.09, 0.016, 0.04], [0.16, 0.05, 0.025]]) {
    const f = fixture({ dimensions, count: 1 });
    f.volume.update(0.75, new THREE.Vector3(0.7, 0.4, -0.2));
    f.ice.updateDevice({ ...state, massX: 1, velocityX: 5, velocityY: -3, fill: 0.75 }, f.volume);
    assertContained(f);
    for (let a = 0; a < f.bodies.count; a++) for (let b = a + 1; b < f.bodies.count; b++) {
      const pa = pose(f.bodies, a), pb = pose(f.bodies, b);
      assert.ok(pa.position.distanceTo(pb.position) >= (pa.scale.length() + pb.scale.length()) * 0.5 - 1e-8,
        'formation fitting must preserve non-overlap');
    }
    release(f);
  }
});

test('same source snapshots and elapsed preview time never invent idle bobbing or drift', () => {
  const f = fixture();
  f.ice.updateDevice(state, f.volume); const before = snapshot(f.ice);
  f.ice.updateDevice({ ...state, phaseS: 9999 }, f.volume);
  assert.deepEqual(snapshot(f.ice), before);
  f.ice.updatePreview(quiet, 1, 1 / 60, new THREE.Quaternion(), f.volume); const preview = snapshot(f.ice);
  f.ice.updatePreview(quiet, 999999, 30, new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), 0.8), f.volume);
  assert.deepEqual(snapshot(f.ice), preview, 'the supplied liquid volume, not a separate preview clock/pose, owns the surface');
  f.ice.updateDevice({ ...state, massX: 0.8, velocityX: 2 }, f.volume);
  assert.notDeepEqual(snapshot(f.ice), before);
  f.ice.updateDevice(state, f.volume); assert.deepEqual(snapshot(f.ice), before);
  release(f);
});

test('empty fill hides every ice detail and invalid motion cannot create nonfinite matrices', () => {
  const f = fixture();
  f.ice.updateDevice({ ...state, fill: 0 }, f.volume); assert.equal(f.ice.group.visible, false);
  f.volume.update(0, new THREE.Vector3(0, 1, 0)); f.ice.updateDevice(state, f.volume); assert.equal(f.ice.group.visible, false);
  f.volume.update(0.65, new THREE.Vector3(NaN, Infinity, 0));
  f.ice.updateDevice({ ...state, massX: NaN, massY: Infinity, velocityX: NaN, velocityY: -Infinity }, f.volume);
  assert.equal(f.ice.group.visible, true); assertContained(f); release(f);
});

test('disposing ice releases shared owned resources once and never disposes borrowed liquid geometry', () => {
  const f = fixture(), resources = new Set(), calls = new Map();
  f.ice.group.traverse(node => {
    if (node.geometry) resources.add(node.geometry);
    if (node.isInstancedMesh) resources.add(node);
    for (const material of node.material ? Array.isArray(node.material) ? node.material : [node.material] : []) {
      resources.add(material);
      for (const value of Object.values(material)) if (value?.isTexture) resources.add(value);
    }
  });
  for (const resource of [...resources, f.volume.body, f.volume.surface]) {
    calls.set(resource, 0); resource.addEventListener('dispose', () => calls.set(resource, calls.get(resource) + 1));
  }
  const parent = new THREE.Group(); parent.add(f.ice.group);
  f.ice.dispose(); f.ice.dispose(); f.ice.updateDevice(state, f.volume);
  assert.equal(parent.children.length, 0); assert.equal(f.ice.group.children.length, 0);
  assert.ok([...resources].every(resource => calls.get(resource) === 1));
  assert.equal(calls.get(f.volume.body), 0); assert.equal(calls.get(f.volume.surface), 0);
  f.volume.body.dispose(); f.volume.surface.dispose();
});
