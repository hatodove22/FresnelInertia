// Execute the shipped production-C++ Wasm in Node; no browser, SDK or device.
// Run from webxr: node --test tests/preview-engine.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const bundle = await build({
  entryPoints: [fileURLToPath(new URL("../src/lab/PreviewEngine.ts", import.meta.url))],
  bundle: true, format: "esm", platform: "node", write: false, logLevel: "silent"
});
const { PreviewEngine, previewPresets } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`);
const neutral = { dtS: 0.004, accelG: [0, 1, 0] };
const close = (actual, expected, tolerance = 1e-6) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
const finiteTree = value => {
  if (typeof value === "number") assert.ok(Number.isFinite(value));
  else if (value && typeof value === "object") Object.values(value).forEach(finiteTree);
};
const gesture = i => ({
  dtS: 0.004,
  accelG: [0.72 * Math.sin(i * 0.028), 1 + 0.28 * Math.sin(i * 0.04), 0],
  gyroDps: [0, 0, 32 * Math.cos(i * 0.028)]
});
const run = (engine, count, input = () => neutral) => {
  const frames = [];
  for (let i = 0; i < count; ++i) frames.push(engine.step(input(i)));
  return frames;
};

test("all four preview choices resolve actual C++ presets, not preview JSON guesses", async () => {
  for (const preset of previewPresets) {
    const engine = await PreviewEngine.create(preset);
    const frame = engine.step(neutral);
    finiteTree(frame);
    assert.equal(frame.source, "production-cpp-preview");
    assert.equal(frame.abiVersion, 1);
    assert.equal(frame.preset, preset);
    assert.equal(frame.frameCounter, 1);
    assert.equal(frame.eventsTotal, 0, "initial gravity establishes a baseline, not an impact");
    assert.equal(frame.channels.length, 4);
    assert.equal(frame.mass.pressure.enabled, preset === "liquid_soda_bottle");
    assert.equal(frame.parameters.granularPile, preset === "granular_sand_box");
  }
});

test("resting marble settles against its supporting wall without autonomous contacts", async () => {
  const engine = await PreviewEngine.create();
  const frames = run(engine, 250);
  close(frames.at(-1).mass.posNorm[0], 0);
  close(frames.at(-1).mass.posNorm[1], -1);
  assert.equal(frames.at(-1).eventsTotal, 0);
  assert.ok(frames.every(frame => frame.channels.every(value => value === 0)));
});

test("handled input reaches production events, four-channel envelopes, tilt and dynamic CG", async () => {
  const engine = await PreviewEngine.create();
  const frames = run(engine, 700, gesture);
  frames.forEach(finiteTree);
  assert.ok(frames.some(frame => frame.events.length > 0));
  assert.ok(frames.some(frame => frame.channels.some(value => value > 0)));
  assert.ok(frames.some(frame => Math.abs(frame.tilt.thumbDeg) > 1));
  const cgX = frames.map(frame => frame.tilt.cgX);
  assert.ok(Math.max(...cgX) - Math.min(...cgX) > 0.000001, "the light marble still changes the combined shell/content CG");
  assert.ok(frames.every(frame => Math.abs(frame.tilt.thumbDeg) <= 10.00001 && Math.abs(frame.tilt.indexDeg) <= 10.00001));
});

test("reset preserves applied parameters and repeats the same C++ trajectory exactly", async () => {
  const engine = await PreviewEngine.create("liquid_small_box");
  engine.setParam("container.viscosity", 0.73);
  const first = run(engine, 250, gesture);
  const reset = engine.reset();
  close(reset.container.viscosity, 0.73);
  assert.equal(reset.frameCounter, 0);
  assert.deepEqual(run(engine, 250, gesture), first);
});

test("separate Wasm instances never share preset, parameters or motion state", async () => {
  const first = await PreviewEngine.create();
  const second = await PreviewEngine.create("liquid_small_box");
  const before = second.snapshot();
  first.setParam("container.fill", 0.7);
  run(first, 50, gesture);
  assert.deepEqual(second.snapshot(), before);
  assert.equal(first.snapshot().preset, "granular_single_marble_box");
  assert.equal(second.snapshot().preset, "liquid_small_box");
});

test("invalid inputs and unsupported parameters reject without partially advancing state", async () => {
  const engine = await PreviewEngine.create();
  engine.step(neutral);
  const before = engine.snapshot();
  for (const dtS of [0, -1, NaN, Infinity, 2]) assert.throws(() => engine.step({ ...neutral, dtS }));
  assert.throws(() => engine.step({ dtS: 0.004, accelG: [NaN, 1, 0] }));
  assert.throws(() => engine.step({ dtS: 0.004, accelG: [0, 1] }));
  assert.throws(() => engine.setParam("container.fill", 2));
  assert.throws(() => engine.setParam("audio.runtime_enable", 1));
  assert.throws(() => engine.setParam("container.viscosity", NaN));
  assert.throws(() => engine.loadPreset("unknown"));
  assert.deepEqual(engine.snapshot(), before);
});

test("old and new sand are explicit preview options and reset does not change the chosen flag", async () => {
  const engine = await PreviewEngine.create("granular_sand_box");
  assert.equal(engine.snapshot().parameters.granularPile, true);
  const old = engine.setParam("features.enable_granular_pile_demo", 0);
  assert.equal(old.parameters.granularPile, false);
  assert.equal(engine.reset().parameters.granularPile, false);
  assert.equal(engine.loadPreset("granular_sand_box").parameters.granularPile, true);
});

test("a long input gap resets dynamics instead of replaying missed motion or contacts", async () => {
  const engine = await PreviewEngine.create();
  run(engine, 100, gesture);
  const frame = engine.step({ dtS: 0.2, accelG: [1, 0, 0] });
  assert.deepEqual(frame.mass.posNorm, [0, 0]);
  assert.deepEqual(frame.channels, [0, 0, 0, 0]);
  assert.equal(frame.events.length, 0);
  assert.equal(frame.tilt.thumbDeg, 0);
});

test("soda exposes a one-shot production pressure-pop state and replay reseals it", async () => {
  const engine = await PreviewEngine.create("liquid_soda_bottle");
  const frames = run(engine, 2000, i => ({
    dtS: 0.004, accelG: [0, 1 + 2.5 * Math.sin(i * 0.25), 0], gyroDps: [0, 0, 0]
  }));
  frames.forEach(finiteTree);
  const pops = frames.flatMap(frame => frame.events).filter(event => event.name === "pressure_pop");
  assert.equal(pops.length, 1);
  assert.equal(frames.at(-1).mass.pressure.phase, "spent");
  assert.equal(frames.at(-1).mass.pressure.burstSequence, 1);
  const reset = engine.reset();
  assert.equal(reset.mass.pressure.phase, "sealed");
  assert.equal(reset.mass.pressure.burstSequence, 0);
  close(reset.mass.pressure.charge, 0);
});
