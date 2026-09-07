import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { Vector3 } from "three";

const output = await build({ entryPoints: [fileURLToPath(new URL("../src/renderer/LiquidSlosh.ts", import.meta.url))], bundle: true, format: "esm", platform: "node", write: false, logLevel: "silent" });
const { LiquidSlosh } = await import(`data:text/javascript;base64,${Buffer.from(output.outputFiles[0].text).toString("base64")}`);
const size = new Vector3(0.08, 0.1, 0.06);
const base = { timeS: 0, normal: new Vector3(0, 1, 0), massX: 0, massY: -0.4, velocityX: 0, velocityY: 0, activity: 0, fill: 0.5, viscosity: 0.12 };
const frame = (slosh, timeS, values = {}) => slosh.update({ ...base, timeS, ...values });
const samples = result => [-0.4, -0.2, 0, 0.2, 0.4].flatMap(u => [-0.4, 0, 0.4].map(v => result.displacement(u, v)));
const capture = result => ({ normal: result.normal.toArray(), activity: result.activity, flow: result.flow.toArray(), revision: result.revision, waves: samples(result) });
const peak = result => Math.max(...samples(result).map(Math.abs));

test("first frame and repeated resting samples have no invented motion", () => {
  const slosh = new LiquidSlosh(size);
  for (let i = 0; i < 120; i++) {
    const result = frame(slosh, i / 60);
    assert.equal(result.activity, 0);
    assert.equal(peak(result), 0);
    assert.deepEqual(result.normal.toArray(), [0, 1, 0]);
  }
});

test("a static noncentral content state does not drift or manufacture a splash", () => {
  const slosh = new LiquidSlosh(size);
  const values = { massX: 0.6, massY: -1, activity: 0.4, normal: new Vector3(0.4, 1, 0.2).normalize() };
  const initial = capture(frame(slosh, 0, values));
  for (let i = 1; i < 120; i++) {
    const result = frame(slosh, i / 60, values);
    assert.ok(result.activity < 1e-12);
    assert.equal(peak(result), 0);
    assert.ok(result.flow.toArray().every((value, index) => Math.abs(value - initial.flow[index]) < 1e-12));
    assert.ok(result.normal.distanceTo(values.normal) < 1e-12);
  }
});

test("roll and pitch excite distinct directional waves and lag the bulk surface", () => {
  const roll = new LiquidSlosh(size), pitch = new LiquidSlosh(size);
  frame(roll, 0); frame(pitch, 0);
  const rollNormal = new Vector3(0.5, 1, 0).normalize();
  const pitchNormal = new Vector3(0, 1, 0.5).normalize();
  let r, p;
  for (let i = 1; i <= 8; i++) {
    r = frame(roll, i / 60, { normal: rollNormal });
    p = frame(pitch, i / 60, { normal: pitchNormal });
  }
  assert.ok(r.normal.x > 0 && r.normal.x < rollNormal.x);
  assert.ok(p.normal.z > 0 && p.normal.z < pitchNormal.z);
  assert.ok(peak(r) > 0.0002 && peak(p) > 0.0002, "millimetre-scale shape, not normal-map noise only");
  assert.notDeepEqual(samples(r), samples(p));
  assert.ok(Math.abs(r.displacement(0.35, 0) - r.displacement(-0.35, 0)) > 0.0002);
  assert.ok(Math.abs(p.displacement(0, 0.35) - p.displacement(0, -0.35)) > 0.0002);
});

test("surface overshoots then rings down after a tilt is held", () => {
  const slosh = new LiquidSlosh(size);
  frame(slosh, 0);
  const normal = new Vector3(0.45, 1, 0).normalize();
  let overshoot = false, earlyPeak = 0, final;
  for (let i = 1; i <= 300; i++) {
    final = frame(slosh, i / 60, { normal });
    overshoot ||= final.normal.x > normal.x + 0.015;
    if (i < 90) earlyPeak = Math.max(earlyPeak, peak(final));
  }
  assert.ok(overshoot);
  assert.ok(earlyPeak > 0.001);
  assert.ok(peak(final) < earlyPeak * 0.03);
  assert.ok(final.activity < 0.015);
  assert.ok(final.normal.distanceTo(normal) < 0.004);
});

test("viscosity damps waves and container size changes their rhythm", () => {
  const thin = new LiquidSlosh(size), thick = new LiquidSlosh(size), larger = new LiquidSlosh(size.clone().multiplyScalar(2));
  frame(thin, 0); frame(thick, 0); frame(larger, 0);
  const normal = new Vector3(0.5, 1, 0.2).normalize();
  let thinEnergy = 0, thickEnergy = 0, difference = 0;
  for (let i = 1; i <= 180; i++) {
    const a = frame(thin, i / 60, { normal, viscosity: 0 });
    const b = frame(thick, i / 60, { normal, viscosity: 0.8 });
    const c = frame(larger, i / 60, { normal, viscosity: 0 });
    if (i > 60) { thinEnergy += a.activity; thickEnergy += b.activity; }
    if (i < 60) difference += Math.abs(a.normal.x - c.normal.x);
  }
  assert.ok(thickEnergy < thinEnergy * 0.4);
  assert.ok(difference > 1, "larger tank must not reuse an arbitrary shared sine frequency");
});

test("duplicate samples freeze the whole view even when ancillary inputs change", () => {
  const slosh = new LiquidSlosh(size);
  frame(slosh, 0);
  const result = frame(slosh, 0.1, { normal: new Vector3(0.4, 1, 0.3), velocityX: 3, activity: 0.8 });
  const before = capture(result);
  for (let i = 0; i < 4; i++) {
    assert.deepEqual(capture(frame(slosh, 0.1, { normal: new Vector3(-1, 0, 1), fill: 0, activity: 1 })), before);
  }
  assert.deepEqual(capture(frame(slosh, NaN)), before);
});

test("rewind and long telemetry gap reset without replaying an old splash", () => {
  const slosh = new LiquidSlosh(size);
  frame(slosh, 2);
  frame(slosh, 2.1, { velocityX: 8, activity: 1 });
  for (const time of [0, 4]) {
    const normal = new Vector3(0, 1, 0.3).normalize();
    const result = frame(slosh, time, { normal });
    assert.equal(peak(result), 0);
    assert.equal(result.activity, 0);
    assert.ok(result.normal.distanceTo(normal) < 1e-12);
  }
});

test("mass and velocity transients create waves without a tilt change", () => {
  const slosh = new LiquidSlosh(size);
  frame(slosh, 0);
  const result = frame(slosh, 0.1, { massX: 0.5, velocityX: 2.1, activity: 0.65 });
  assert.ok(peak(result) > 0.0005);
  assert.ok(result.activity > 0.1);
  assert.ok(result.flow.length() > 0.001);
});

test("accepted fore/aft and vertical acceleration excite water without firmware mass travel", () => {
  for (const acceleration of [[0, 0, 1.2], [0, -1.2, 0]]) {
    const slosh = new LiquidSlosh(size);
    frame(slosh, 0, { acceleration: [0, 0, 0] });
    const result = frame(slosh, 0.1, { acceleration });
    assert.ok(peak(result) > 0.0002, `visible acceleration-driven waves for ${acceleration}`);
    const before = capture(result);
    assert.deepEqual(capture(frame(slosh, 0.1, { acceleration: [8, 8, 8] })), before);
    for (let i = 1; i <= 300; i++) frame(slosh, 0.1 + i / 60, { acceleration });
    assert.ok(peak(result) < 0.00002, "a held acceleration residual cannot excite waves indefinitely");
  }
});

test("a first or recovered acceleration sample establishes a quiet baseline", () => {
  const slosh = new LiquidSlosh(size);
  assert.equal(peak(frame(slosh, 0, { acceleration: [1, -1, 2] })), 0);
  frame(slosh, 0.1, { acceleration: [-1, 1, -2] });
  assert.equal(peak(frame(slosh, 2, { acceleration: [2, -2, 3] })), 0);
  assert.equal(peak(frame(slosh, 0, { acceleration: [NaN, Infinity, -Infinity] })), 0);
});

test("extreme inputs stay finite and displacement remains inside the declared bound", () => {
  const slosh = new LiquidSlosh(size);
  for (let i = 0; i < 180; i++) {
    const result = frame(slosh, i / 60, { normal: new Vector3(i % 2 ? 1e308 : -1e308, i % 3 ? 0 : NaN, Infinity), velocityX: i % 2 ? 1e20 : -1e20, velocityY: NaN, massX: Infinity, massY: 1e30, activity: 200, viscosity: -200 });
    assert.ok(result.normal.toArray().every(Number.isFinite));
    assert.ok(Math.abs(result.normal.length() - 1) < 1e-9);
    assert.ok(Number.isFinite(result.activity) && result.activity >= 0 && result.activity <= 1);
    assert.ok(result.flow.toArray().every(Number.isFinite));
    for (const height of [...samples(result), result.displacement(NaN, Infinity)]) {
      assert.ok(Number.isFinite(height));
      assert.ok(Math.abs(height) <= Math.min(size.x, size.y, size.z) * 0.18 + 1e-12);
      assert.ok(Math.abs(height) <= result.maxDisplacement + 1e-12);
    }
  }
  const empty = frame(slosh, 3, { fill: 0 });
  assert.equal(peak(empty), 0);
  assert.equal(empty.activity, 0);
});
