import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { Vector3 } from "three";

async function load(path) {
  const output = await build({ entryPoints: [fileURLToPath(new URL(path, import.meta.url))], bundle: true, format: "esm", platform: "node", write: false, logLevel: "silent" });
  return import(`data:text/javascript;base64,${Buffer.from(output.outputFiles[0].text).toString("base64")}`);
}
const { ContainedVolume } = await load("../src/renderer/ContainedVolume.ts");
const { LiquidContactLine } = await load("../src/renderer/LiquidContactLine.ts");
const size = new Vector3(0.08, 0.12, 0.05);
const close = (a, b, tolerance = 1e-8) => assert.ok(Math.abs(a - b) < tolerance, `${a} != ${b}`);

test("contact polygon exactly follows the clipped plane for pitch, roll and side-on poses", () => {
  const volume = new ContainedVolume(size);
  const line = new LiquidContactLine(size);
  for (const normal of [new Vector3(0, 1, 0), new Vector3(0, 1, 0.8), new Vector3(0.5, 0.8, -0.9), new Vector3(0, 0, 1), new Vector3(0, -1, 0)]) {
    volume.update(0.4, normal, 0.0005, 1.2);
    assert.ok(volume.boundary.length >= 3 && volume.boundary.length <= 6);
    for (const point of volume.boundary) {
      close(volume.normal.dot(point), volume.offset);
      assert.ok(["x", "y", "z"].some(axis => Math.abs(Math.abs(point[axis]) - size[axis] / 2) < 1e-8));
    }
    line.update(volume, 0.4, 0.8);
    assert.equal(line.group.visible, true);
    for (const mesh of line.group.children) {
      const position = mesh.geometry.attributes.position;
      assert.ok(mesh.geometry.drawRange.count > 0);
      for (let i = 0; i < mesh.geometry.drawRange.count * 3; i++) {
        assert.ok(Number.isFinite(position.array[i]));
        assert.ok(Math.abs(position.array[i]) <= size.getComponent(i % 3) / 2 + 1e-8);
      }
    }
  }
  line.dispose(); volume.dispose();
});

test("pitch moves the optical contact while identical snapshots freeze all buffers", () => {
  const volume = new ContainedVolume(size);
  const line = new LiquidContactLine(size);
  volume.update(0.5, new Vector3(0, 1, 0));
  line.update(volume, 0.5, 0.5);
  const wet = line.group.getObjectByName("content-liquid-meniscus");
  const level = Float32Array.from(wet.geometry.attributes.position.array);
  volume.update(0.5, new Vector3(0, 1, -0.8));
  line.update(volume, 0.5, 0.5);
  assert.notDeepEqual(wet.geometry.attributes.position.array, level);
  const frozen = line.group.children.map(mesh => Float32Array.from(mesh.geometry.attributes.position.array));
  line.update(volume, 0.5, 0.5);
  line.group.children.forEach((mesh, i) => assert.deepEqual(mesh.geometry.attributes.position.array, frozen[i]));
  line.dispose(); volume.dispose();
});

test("empty, full and invalid fill have no phantom waterline or foam", () => {
  const volume = new ContainedVolume(size);
  const line = new LiquidContactLine(size);
  for (const fill of [0, 1, NaN]) {
    volume.update(fill, new Vector3(0.3, 0.8, -0.6));
    line.update(volume, fill, 1);
    assert.equal(volume.boundary.length, 0);
    assert.equal(line.group.visible, false);
    for (const mesh of line.group.children) assert.equal(mesh.geometry.drawRange.count, 0);
  }
  volume.update(0.5, new Vector3(0, 1, 0));
  line.update(volume, 0.5, 0);
  assert.equal(line.group.getObjectByName("content-liquid-foam-edge").visible, false);
  line.dispose(); volume.dispose();
});

test("changing polygon topology reuses bounded GPU attributes and disposal is idempotent", () => {
  const volume = new ContainedVolume(size);
  const line = new LiquidContactLine(size);
  const resources = line.group.children.flatMap(mesh => [mesh.geometry, mesh.material]);
  const attributes = line.group.children.map(mesh => [mesh.geometry.attributes.position, mesh.geometry.attributes.normal]);
  const boundary = volume.boundary;
  for (let step = 0; step < 40; step++) {
    const fill = 0.05 + step / 45;
    volume.update(fill, new Vector3(Math.sin(step), Math.cos(step * 0.3), Math.sin(step * 0.7)));
    line.update(volume, fill, step / 40);
    assert.equal(volume.boundary, boundary);
    line.group.children.forEach((mesh, i) => {
      assert.equal(mesh.geometry.attributes.position, attributes[i][0]);
      assert.equal(mesh.geometry.attributes.normal, attributes[i][1]);
      assert.ok(mesh.geometry.drawRange.count <= attributes[i][0].count);
    });
  }
  const calls = new Map(resources.map(resource => [resource, 0]));
  resources.forEach(resource => resource.addEventListener("dispose", () => calls.set(resource, calls.get(resource) + 1)));
  line.dispose(); line.dispose();
  resources.forEach(resource => assert.equal(calls.get(resource), 1));
  assert.equal(line.group.children.length, 0);
  assert.equal(line.group.visible, false);
  volume.dispose();
});
