import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { Vector3 } from "three";

const bundle = await build({
  entryPoints: [fileURLToPath(new URL("../src/renderer/SodaJet.ts", import.meta.url))],
  bundle: true, format: "esm", platform: "node", write: false, logLevel: "silent"
});
const { SodaJet } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`);
const size = new Vector3(0.055, 0.1, 0.055);
const state = { charge: 0.65, phase: "burst", phaseS: 0.35, remaining: 0.7, burstSequence: 1 };
const snapshot = jet => jet.group.children.map(mesh => Array.from(mesh.geometry.attributes.position.array));

test("jet is connected indexed geometry with fixed buffers and bounded finite vertices", () => {
  const jet = new SodaJet(size);
  const attributes = jet.group.children.map(mesh => mesh.geometry.attributes.position);
  for (const phaseS of [0.001, 0.1, 0.3, 0.65, 1, 1.5, 1.799]) {
    jet.update({ ...state, phaseS });
    assert.equal(jet.group.visible, true);
    for (const [index, mesh] of jet.group.children.entries()) {
      assert.equal(mesh.geometry.attributes.position, attributes[index]);
      assert.ok(mesh.geometry.index.count > 100, "continuous indexed triangles, not particle instances");
      const values = mesh.geometry.attributes.position.array;
      for (let at = 0; at < values.length; at += 3) {
        assert.ok(Number.isFinite(values[at]) && Number.isFinite(values[at + 1]) && Number.isFinite(values[at + 2]));
        assert.ok(Math.abs(values[at]) <= size.x * 0.55);
        assert.ok(Math.abs(values[at + 2]) <= size.z * 0.55);
        assert.ok(values[at + 1] >= size.y / 2 - 1e-7);
        assert.ok(values[at + 1] <= size.y / 2 + size.x * 1.1);
      }
      assert.ok(Array.from(mesh.geometry.attributes.normal.array).every(Number.isFinite));
    }
    const core = jet.group.getObjectByName("content-soda-jet-core");
    assert.ok(Math.abs(core.geometry.attributes.position.array[1] - size.y / 2) < 1e-7, "jet stays attached to the mouth");
  }
  jet.dispose();
});

test("phase-driven jet freezes, rewinds and replays deterministically without another clock", () => {
  const jet = new SodaJet(size);
  jet.update(state);
  const before = snapshot(jet);
  const versions = jet.group.children.map(mesh => mesh.geometry.attributes.position.version);
  jet.update({ ...state });
  assert.deepEqual(snapshot(jet), before);
  assert.deepEqual(jet.group.children.map(mesh => mesh.geometry.attributes.position.version), versions, "unchanged snapshots skip GPU writes");
  jet.update({ ...state, phaseS: 0.65 });
  assert.notDeepEqual(snapshot(jet), before);
  jet.update(state);
  assert.deepEqual(snapshot(jet), before);
  jet.update({ ...state, burstSequence: 2 });
  assert.notDeepEqual(snapshot(jet), before);
  jet.dispose();
});

test("jet has a substantial connected base and four unequal short liquid sheets, not radial petals", () => {
  const jet = new SodaJet(size);
  jet.update(state);
  const core = jet.group.getObjectByName("content-soda-jet-core").geometry.attributes.position.array;
  const baseRadius = Math.hypot(core[0], core[2]);
  assert.ok(baseRadius > size.x * 0.055, "the continuous base carries visible fluid mass");
  const sheets = jet.group.getObjectByName("content-soda-jet-sheets").geometry.attributes.position;
  const verticesPerSheet = 19 * 9;
  assert.equal(sheets.count, verticesPerSheet * 4);
  const heights = Array.from({ length: 4 }, (_, index) => sheets.getY(index * verticesPerSheet));
  assert.equal(new Set(heights).size, 4, "sheet attachment heights are deliberately asymmetric");
  const tipRadii = Array.from({ length: 4 }, (_, index) => {
    const at = (index + 1) * verticesPerSheet - 5;
    return Math.hypot(sheets.getX(at), sheets.getZ(at));
  });
  assert.ok(Math.max(...tipRadii) - Math.min(...tipRadii) > size.x * 0.035);
  jet.dispose();
});

test("non-burst, exhausted and invalid snapshots hide; reset does not retain the old burst", () => {
  const jet = new SodaJet(size);
  assert.equal(jet.group.visible, false);
  for (const pressure of [undefined, { ...state, phase: "sealed" }, { ...state, phase: "spent" },
    { ...state, phaseS: 1.8 }, { ...state, phaseS: NaN }, { ...state, remaining: 0 }, { ...state, charge: Infinity }]) {
    jet.update(state);
    assert.equal(jet.group.visible, true);
    jet.update(pressure);
    assert.equal(jet.group.visible, false);
  }
  jet.update({ ...state, phase: "sealed", phaseS: 0, burstSequence: 0 });
  jet.update(state);
  assert.equal(jet.group.visible, true);
  jet.dispose();
});

test("optical materials use transmission with opaque coverage and texture detail has no clock", () => {
  const jet = new SodaJet(size);
  for (const mesh of jet.group.children) {
    assert.equal(mesh.material.type, "MeshPhysicalMaterial");
    assert.ok(mesh.material.transmission > 0);
    assert.equal(mesh.material.opacity, 1);
    assert.equal(mesh.material.ior, 1.333);
  }
  const foam = jet.group.getObjectByName("content-soda-jet-foam");
  const shader = { uniforms: {}, vertexShader: "#include <common>\n#include <begin_vertex>", fragmentShader: "#include <common>\n#include <color_fragment>" };
  foam.material.onBeforeCompile(shader);
  assert.ok(shader.uniforms.sodaFoamScale.value > 0);
  assert.match(shader.fragmentShader, /dFdx\(foamPoint\)/, "subpixel foam detail fades rather than shimmers");
  assert.doesNotMatch(shader.fragmentShader, /time|phase/);
  jet.dispose();
});

test("dispose releases every owned geometry/material exactly once", () => {
  const jet = new SodaJet(size);
  let released = 0;
  for (const mesh of jet.group.children) {
    mesh.geometry.addEventListener("dispose", () => released++);
    mesh.material.addEventListener("dispose", () => released++);
  }
  jet.dispose(); jet.dispose(); jet.update(state);
  assert.equal(released, 6);
  assert.equal(jet.group.children.length, 0);
  assert.equal(jet.group.visible, false);
});
