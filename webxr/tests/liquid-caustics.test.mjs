import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { Vector3 } from "three";

const output = await build({ entryPoints: [fileURLToPath(new URL("../src/renderer/LiquidCaustics.ts", import.meta.url))], bundle: true, format: "esm", platform: "node", write: false, logLevel: "silent" });
const { LiquidCaustics } = await import(`data:text/javascript;base64,${Buffer.from(output.outputFiles[0].text).toString("base64")}`);
const volumeOutput = await build({ entryPoints: [fileURLToPath(new URL("../src/renderer/ContainedVolume.ts", import.meta.url))], bundle: true, format: "esm", platform: "node", write: false, logLevel: "silent" });
const { ContainedVolume } = await import(`data:text/javascript;base64,${Buffer.from(volumeOutput.outputFiles[0].text).toString("base64")}`);
const size = new Vector3(0.055, 0.100, 0.040);
function compile(material) {
  const shader = { uniforms: {}, vertexShader: "#include <common>\n#include <begin_vertex>", fragmentShader: "#include <common>\n#include <color_fragment>\n#include <emissivemap_fragment>" };
  material.onBeforeCompile(shader);
  return shader;
}

test("one opaque floor quad supports transmission at the actual inner dimensions", () => {
  const floor = new LiquidCaustics(size);
  const { mesh } = floor;
  assert.equal(mesh.geometry.attributes.position.count, 4);
  assert.equal(mesh.geometry.parameters.width, size.x);
  assert.equal(mesh.geometry.parameters.height, size.z);
  assert.ok(mesh.position.y > -size.y / 2 && mesh.position.y < -size.y / 2 + 0.0001);
  assert.equal(mesh.material.transparent, false);
  assert.equal(mesh.material.opacity, 1);
  assert.equal(mesh.material.depthWrite, true);
  assert.equal(mesh.material.map, null);
  assert.match(mesh.userData.renderingApproximation, /not ray traced/);
  floor.dispose();
});

test("shader has a bounded antialiased branching pattern and only shared state uniforms", () => {
  const floor = new LiquidCaustics(size);
  const shader = compile(floor.mesh.material);
  assert.deepEqual(Object.keys(shader.uniforms).sort(), ["causticActivity", "causticClip", "causticFill", "causticFloorY", "causticPhase", "causticPlane", "causticScale"]);
  assert.match(shader.fragmentShader, /for \(int y = -1; y <= 1; y\+\+\)/);
  assert.match(shader.fragmentShader, /for \(int x = -1; x <= 1; x\+\+\)/);
  assert.match(shader.fragmentShader, /fwidth\(gap\)/);
  assert.match(shader.fragmentShader, /nextNearest/);
  assert.match(shader.fragmentShader, /float t = causticPhase \* 0\.45/);
  assert.doesNotMatch(shader.fragmentShader, /causticPhase \* causticActivity/,
    "caller-owned advection must not jump or reverse just because activity decays");
  assert.doesNotMatch(shader.fragmentShader, /sampler|texture2D|iTime|uTime/);
  floor.dispose();
});

test("tilted low fill clips dry floor against the exact supplied free-surface plane", () => {
  const floor = new LiquidCaustics(size);
  const volume = new ContainedVolume(size);
  const shader = compile(floor.mesh.material);
  volume.update(0.06, new Vector3(0.65, 0.75, -0.55));
  floor.update(0.06, 0.3, 2.1, volume);
  const { causticClip, causticPlane, causticFloorY } = shader.uniforms;
  assert.equal(causticClip.value, 1);
  assert.deepEqual(causticPlane.value.toArray(), [...volume.normal.toArray(), volume.offset]);
  assert.match(shader.vertexShader, /vCausticFloorPosition = position \+ vec3\(0.0, causticFloorY, 0.0\)/);
  assert.match(shader.fragmentShader, /dot\(causticPlane.xyz, vCausticFloorPosition\) > causticPlane.w\) discard/);
  const wetCorners = [];
  for (const x of [-size.x / 2, size.x / 2]) for (const z of [-size.z / 2, size.z / 2]) {
    wetCorners.push(volume.normal.dot(new Vector3(x, causticFloorY.value, z)) <= volume.offset);
  }
  assert.ok(wetCorners.some(Boolean), "some floor stays under liquid");
  assert.ok(wetCorners.some(value => !value), "some floor is exposed and must be discarded");
  volume.update(1, new Vector3(0.65, 0.75, -0.55));
  floor.update(1, 0, 0, volume);
  for (const x of [-size.x / 2, size.x / 2]) for (const z of [-size.z / 2, size.z / 2]) {
    assert.ok(volume.normal.dot(new Vector3(x, causticFloorY.value, z)) <= volume.offset);
  }
  floor.update(0.5, 0, 0);
  assert.equal(causticClip.value, 0, "three-argument callers remain compatible");
  floor.update(0.5, 0, 0, { normal: new Vector3(NaN, 1, 0), offset: Infinity });
  assert.equal(causticClip.value, 0);
  for (const uniform of Object.values(shader.uniforms)) {
    const values = uniform.value?.toArray ? uniform.value.toArray() : [uniform.value];
    assert.ok(values.every(Number.isFinite));
  }
  floor.dispose(); volume.dispose();
});

test("fill gates visibility and identical snapshots preserve uniforms and geometry", () => {
  const floor = new LiquidCaustics(size);
  const shader = compile(floor.mesh.material);
  const geometry = floor.mesh.geometry;
  const position = geometry.attributes.position;
  floor.update(0.6, 0.72, 3.25);
  assert.equal(floor.mesh.visible, true);
  const values = () => Object.fromEntries(Object.entries(shader.uniforms).map(([key, uniform]) => [key, uniform.value?.toArray ? uniform.value.toArray() : uniform.value]));
  const frozen = values();
  floor.update(0.6, 0.72, 3.25);
  assert.deepEqual(values(), frozen);
  assert.equal(floor.mesh.geometry, geometry);
  assert.equal(geometry.attributes.position, position);
  floor.update(0, 0.3, 4);
  assert.equal(floor.mesh.visible, false);
  floor.update(NaN, Infinity, NaN);
  assert.equal(floor.mesh.visible, false);
  assert.equal(shader.uniforms.causticActivity.value, 0);
  assert.equal(shader.uniforms.causticPhase.value, 0);
  floor.dispose();
});

test("disposal releases the two owned resources exactly once", () => {
  const floor = new LiquidCaustics(size);
  let geometries = 0, materials = 0;
  floor.mesh.geometry.addEventListener("dispose", () => geometries++);
  floor.mesh.material.addEventListener("dispose", () => materials++);
  floor.dispose(); floor.dispose();
  floor.update(0.8, 1, 20);
  assert.equal(geometries, 1);
  assert.equal(materials, 1);
  assert.equal(floor.mesh.visible, false);
});
