import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
import * as THREE from 'three';

const result = await build({ stdin: { contents: `export { ContainedVolume } from './src/renderer/ContainedVolume'; export { ContainerGeometry } from './src/renderer/ContainerGeometry';`, resolveDir: process.cwd() }, bundle: true, format: 'esm', platform: 'node', write: false });
const { ContainedVolume, ContainerGeometry } = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
const preset = { preset: 'liquid', family: 'Liquid', container: { span_x_m: 0.05, span_y_m: 0.12, span_z_m: 0.08, fill: 0.5 } };

test('liquid volume and wall bounds survive empty/full, narrow boxes, sideways and inverted poses', () => {
  for (const shape of ['box', 'tumbler_cup', 'cylinder_bottle']) {
    const cavity = new ContainerGeometry({ ...preset, visual_shape: shape }, shape === 'box');
    const hull = cavity.liquidHull();
    const volume = new ContainedVolume(hull, cavity.dimensions.x);
    const hullCenter = hull.flat().reduce((p, q) => p.add(q), new THREE.Vector3()).divideScalar(hull.flat().length);
    for (const fill of [0, 0.001, 0.04, 0.5, 0.95, 0.999, 1]) for (const normal of [[0, 1, 0], [1, 0, 0], [0, -1, 0], [0.7, 0.2, -0.6]]) {
      const up = new THREE.Vector3(...normal).normalize();
      volume.update(fill, up);
      assert.ok(Math.abs(volume.volume / volume.capacity - fill) < 0.00002, `${shape} fill ${fill}`);
      for (const geometry of [volume.body, volume.surface]) {
        const positions = geometry.getAttribute('position');
        for (let i = 0; i < geometry.drawRange.count; i++) {
          const point = new THREE.Vector3().fromBufferAttribute(positions, i);
          assert.ok(point.toArray().every(Number.isFinite));
          assert.ok(point.dot(up) <= volume.level + 1e-7);
          for (const face of hull) {
            const n = new THREE.Vector3().subVectors(face[1], face[0]).cross(new THREE.Vector3().subVectors(face[2], face[0])).normalize();
            const d = face[0].dot(n);
            assert.ok(hullCenter.dot(n) <= d + 1e-8, 'outward hull winding');
            assert.ok(point.dot(n) <= d + 1e-7, 'all drawn vertices inside cavity');
          }
        }
      }
    }
    const version = volume.body.getAttribute('position').version;
    volume.update(1, new THREE.Vector3(0.7, 0.2, -0.6).normalize());
    assert.equal(volume.body.getAttribute('position').version, version, 'unchanged state avoids mesh uploads');
    volume.update(0.5, new THREE.Vector3(1, 0, 0));
    const uv = volume.surface.getAttribute('uv');
    let uvArea = 0;
    for (let i = 0; i < volume.surface.drawRange.count; i += 3) {
      uvArea += Math.abs((uv.getX(i + 1) - uv.getX(i)) * (uv.getY(i + 2) - uv.getY(i)) -
        (uv.getX(i + 2) - uv.getX(i)) * (uv.getY(i + 1) - uv.getY(i)));
    }
    assert.ok(uvArea > 0.001, 'sideways free surface has non-degenerate texture coordinates');
    volume.body.dispose(); volume.surface.dispose();
  }
});

test('upright rectangular fill gives the expected horizontal height and capacity', () => {
  const cavity = new ContainerGeometry(preset, true);
  const volume = new ContainedVolume(cavity.liquidHull(), cavity.dimensions.x);
  assert.ok(Math.abs(volume.capacity - 0.05 * 0.12 * 0.08 * 0.96 ** 3) < 1e-12);
  volume.update(0.25, new THREE.Vector3(0, 1, 0));
  assert.ok(Math.abs(volume.level - -0.12 * 0.96 * 0.25) < 1e-6);
});
