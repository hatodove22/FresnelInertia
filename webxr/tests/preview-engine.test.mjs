// Execute the shipped production-C++ Wasm in Node; no browser, SDK or device.
// Run from webxr: node --test tests/preview-engine.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
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

test("all preview choices resolve actual C++ presets, not preview JSON guesses", async () => {
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
    assert.equal(frame.parameters.granularPile, preset === "granular_sand_box" || preset === "granular_sand_pile_box");
  }
});

test("explicit sand-pile preview resolves its FW preset and applied friction pair without changing ordinary Lab sand", async () => {
  const engine = await PreviewEngine.create("granular_sand_pile_box");
  const frame = engine.snapshot(), labSand = (await PreviewEngine.create("granular_sand_box")).snapshot();
  assert.equal(frame.preset, "granular_sand_pile_box");
  assert.equal(frame.family, "Granular");
  assert.equal(frame.parameters.granularPile, true);
  assert.deepEqual(frame.container, labSand.container);
  assert.deepEqual(frame.parameters, labSand.parameters);
  for (const friction of [.2, .55, .9]) {
    engine.setParam("mass.granular_static_friction", friction);
    engine.setParam("mass.granular_dynamic_friction", friction * 7 / 11);
    close(engine.snapshot().parameters.staticFriction, friction);
    close(engine.snapshot().parameters.dynamicFriction, friction * 7 / 11);
    const previous = engine.snapshot();
    for (const path of ["mass.granular_static_friction", "mass.granular_dynamic_friction"]) {
      for (const value of [-.001, 2.001, NaN, Infinity]) assert.throws(() => engine.setParam(path, value));
    }
    assert.deepEqual(engine.snapshot(), previous, "rejected friction writes leave applied state intact");
    const frames = run(engine, 350, gesture); frames.forEach(finiteTree);
    assert.ok(frames.every(state => state.parameters.granularPile));
  }
  engine.loadPreset("granular_sand_pile_box");
  assert.deepEqual(engine.snapshot().parameters, frame.parameters, "preset reload restores its own material defaults");
});

test("single coin metadata matches the production preset and retains the existing coin material", async () => {
  const metadata = JSON.parse(readFileSync(new URL("../../presets/granular_single_coin_box.json", import.meta.url), "utf8"));
  const engine = await PreviewEngine.create(metadata.preset);
  const single = engine.step(neutral);
  const coins = (await PreviewEngine.create("granular_coin_box")).step(neutral);
  assert.equal(single.family, metadata.family);
  for (const [key, value] of Object.entries(single.container)) close(value, metadata.container[key]);
  close(single.container.fill, 0.04);
  close(single.container.particle_count, 0.03);
  close(metadata.container.content_mass_full_kg * metadata.container.fill, 0.005);
  close(single.tilt.apparentMassKg, metadata.container.shell_mass_kg + 0.005);
  for (const key of ["span_x_m", "span_y_m", "span_z_m", "viscosity", "particle_hardness"]) {
    close(single.container[key], coins.container[key]);
  }
  assert.deepEqual(single.parameters, coins.parameters, "single inclusion keeps the coin response and output gains");
  close(coins.container.fill, 0.2);
  close(coins.container.particle_count, 0.25);
  close(coins.tilt.apparentMassKg, 0.075 + 0.120 * 0.2);
  const presetBundle = await build({
    entryPoints: [fileURLToPath(new URL("../src/presets.ts", import.meta.url))],
    bundle: true, format: "esm", platform: "node", write: false, logLevel: "silent"
  });
  const { findPreset } = await import(`data:text/javascript;base64,${Buffer.from(presetBundle.outputFiles[0].text).toString("base64")}`);
  const visual = findPreset(metadata.preset);
  assert.equal(visual.preset, metadata.preset, "ordinary preview resolves its own single-coin metadata");
  for (const [key, value] of Object.entries(single.container)) close(value, visual.container[key]);
});

test("single coin uses production wall hits with bounded simultaneous model outputs, then settles quietly", async () => {
  const engine = await PreviewEngine.create("granular_single_coin_box");
  const frames = run(engine, 700, gesture);
  frames.forEach(finiteTree);
  const events = frames.flatMap(frame => frame.events);
  assert.ok(events.some(event => event.name === "wall_hit"));
  assert.equal(events.some(event => event.name === "impact_cluster"), false, "one inclusion is not a dense impact cluster");
  assert.ok(frames.some(frame => frame.channels.some(value => value > 0) && Math.abs(frame.tilt.thumbDeg) > 0.1));
  assert.ok(frames.every(frame => frame.mass.posNorm.every(value => Math.abs(value) <= 1.00001)));
  assert.ok(frames.every(frame => Math.abs(frame.tilt.thumbDeg) <= 10.00001 && Math.abs(frame.tilt.indexDeg) <= 10.00001));
  const resting = run(engine, 1500).slice(-250);
  assert.ok(resting.every(frame => frame.events.length === 0 && frame.channels.every(value => value === 0)));
  assert.ok(resting.at(-1).mass.velNormS.every(value => Math.abs(value) < 0.001));
  const coins = run(await PreviewEngine.create("granular_coin_box"), 700, gesture);
  assert.ok(coins.some(frame => frame.events.some(event => event.name === "impact_cluster")));
  engine.reset();
  assert.deepEqual(run(engine, 700, gesture), frames, "reselection is not required for deterministic replay");
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

test("tilt gains expose applied numbers, preserve reset values and reject out-of-range writes atomically", async () => {
  const engine = await PreviewEngine.create("liquid_small_box");
  const defaults = engine.snapshot().parameters;
  close(defaults.tiltGain, 4);
  close(defaults.tiltKcm, 0.35);
  close(defaults.tiltKtau, 0.25);
  close(defaults.tiltPositionGain, 10);
  for (const [path, field, maximum] of [
    ["tilt.k_phi", "tiltGain", 8], ["tilt.k_cm", "tiltKcm", 1], ["tilt.k_tau", "tiltKtau", 1],
    ["tilt.max_tilt_deg", "tiltPositionGain", 10]
  ]) {
    for (const value of [0, maximum / 3, maximum]) {
      const frame = engine.setParam(path, value);
      close(frame.parameters[field], value);
      assert.equal(frame.frameCounter, 0);
      close(engine.reset().parameters[field], value);
    }
    engine.step(neutral);
    const before = engine.snapshot();
    for (const invalid of [-0.001, maximum + 0.001, NaN, Infinity]) {
      assert.throws(() => engine.setParam(path, invalid));
      assert.deepEqual(engine.snapshot(), before);
    }
  }
  assert.deepEqual(engine.loadPreset("liquid_small_box").parameters, defaults);
});

test("each tilt gain changes calculated angles without changing content, events or vibration", async () => {
  for (const [path, value] of [["tilt.k_phi", 4], ["tilt.k_cm", 0.35], ["tilt.k_tau", 0.25], ["tilt.max_tilt_deg", 10]]) {
    const off = await PreviewEngine.create("liquid_small_box");
    const on = await PreviewEngine.create("liquid_small_box");
    off.setParam(path, 0);
    on.setParam(path, value);
    const baseline = run(off, 400, gesture);
    const varied = run(on, 400, gesture);
    let greatestAngleChange = 0;
    for (let i = 0; i < baseline.length; i++) {
      const a = baseline[i], b = varied[i];
      finiteTree(b);
      for (const key of ["mass", "events", "eventsTotal", "drive", "channels", "container"]) {
        assert.deepEqual(a[key], b[key], `${path} must not change ${key}`);
      }
      close(a.tilt.cgX, b.tilt.cgX);
      close(a.tilt.cgY, b.tilt.cgY);
      greatestAngleChange = Math.max(greatestAngleChange,
        Math.abs(a.tilt.thumbDeg - b.tilt.thumbDeg), Math.abs(a.tilt.indexDeg - b.tilt.indexDeg));
      for (const frame of [a, b]) {
        assert.ok(Math.abs(frame.tilt.thumbDeg) <= 10.00001 && Math.abs(frame.tilt.indexDeg) <= 10.00001);
      }
    }
    assert.ok(greatestAngleChange > 0.1, `${path} must measurably affect its intended preview branch`);
    if (path === "tilt.k_phi") {
      assert.ok(baseline.some(frame => Math.abs(frame.tilt.thumbDeg) > 0.1), "zero pseudo-force gain retains the separate position cue");
    }
  }
});

test("position gain scales only the common base cue while zero preserves the separate inertia correction", async () => {
  const weak = await PreviewEngine.create("liquid_small_box");
  const strong = await PreviewEngine.create("liquid_small_box");
  for (const engine of [weak, strong]) engine.setParam("tilt.k_phi", 0);
  weak.setParam("tilt.max_tilt_deg", 3);
  strong.setParam("tilt.max_tilt_deg", 6);
  // Gentle fixed tilt avoids both the existing slew bound and total-angle cap.
  const input = () => ({ ...neutral, accelG: [0.1, 0.995, 0] });
  const a = run(weak, 500, input).at(-1), b = run(strong, 500, input).at(-1);
  assert.ok(Math.abs(a.tilt.thumbDeg) > 0.01);
  close(a.tilt.thumbDeg, a.tilt.indexDeg);
  close(b.tilt.thumbDeg, 2 * a.tilt.thumbDeg);
  close(b.tilt.indexDeg, 2 * a.tilt.indexDeg);
  assert.deepEqual(a.mass, b.mass);
  assert.deepEqual(a.channels, b.channels);
  close(a.tilt.commonForceN, b.tilt.commonForceN);
  close(a.tilt.differentialTorqueNm, b.tilt.differentialTorqueNm);

  const inertiaOnly = await PreviewEngine.create("liquid_small_box");
  inertiaOnly.setParam("tilt.max_tilt_deg", 0);
  const frames = run(inertiaOnly, 400, gesture);
  assert.ok(frames.some(frame => Math.abs(frame.tilt.thumbDeg) > 0.1), "zero position gain is not a tilt Stop");
  assert.ok(frames.some(frame => Math.abs(frame.tilt.thumbDeg - frame.tilt.indexDeg) > 0.1));
});

test("ordinary water gain products are equivalent, not three independently identifiable tilt axes", async () => {
  const a = await PreviewEngine.create("liquid_small_box");
  const b = await PreviewEngine.create("liquid_small_box");
  // Identical phi*cm and phi*tau products; the soda recoil exception is absent.
  for (const [path, value] of [["tilt.k_phi", 2], ["tilt.k_cm", 0.5], ["tilt.k_tau", 0.25]]) a.setParam(path, value);
  for (const [path, value] of [["tilt.k_phi", 4], ["tilt.k_cm", 0.25], ["tilt.k_tau", 0.125]]) b.setParam(path, value);
  const first = run(a, 400, gesture), second = run(b, 400, gesture);
  for (let i = 0; i < first.length; i++) {
    close(first[i].tilt.thumbDeg, second[i].tilt.thumbDeg);
    close(first[i].tilt.indexDeg, second[i].tilt.indexDeg);
    assert.deepEqual(first[i].mass, second[i].mass);
    assert.deepEqual(first[i].channels, second[i].channels);
  }
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

test("shipped soda model retains the sharper opening on its actual pop timeline", async () => {
  const engine = await PreviewEngine.create("liquid_soda_bottle");
  // Synthetic gyro charges pressure while constant acceleration isolates the
  // recoil from vertical IMU inertia; this is not a physical handling trace.
  let pops = 0, atNinetyPercent = null, sawVent = false;
  for (let i = 0; i < 2600; i++) {
    const frame = engine.step({ ...neutral, gyroDps: [0, 0, 500] });
    const pop = frame.events.filter(event => event.name === "pressure_pop");
    pops += pop.length;
    if (pop.length) {
      // The core substeps at 2 ms; a 4 ms returned frame may already include
      // the first post-opening substep while retaining that frame's pop event.
      close(frame.mass.pressure.phaseS, 0, neutral.dtS);
      close(frame.tilt.commonForceN, -0.055);
      assert.ok(frame.tilt.thumbDeg > 0, "kick starts on the pop frame");
    }
    if (frame.mass.pressure.phase === "burst") {
      close(frame.tilt.thumbDeg, frame.tilt.indexDeg);
      assert.ok(Math.abs(frame.tilt.thumbDeg) <= 5.00001, "existing common-angle bound is retained");
      if (atNinetyPercent === null && frame.tilt.thumbDeg >= 4.5) atNinetyPercent = frame.mass.pressure.phaseS;
      if (frame.mass.pressure.phaseS >= 0.16) {
        sawVent = true;
        close(frame.tilt.commonForceN, -0.007 * frame.mass.pressure.charge);
      }
    }
  }
  assert.equal(pops, 1);
  assert.ok(atNinetyPercent !== null && atNinetyPercent <= 0.044, `opening arrived late: ${atNinetyPercent}`);
  assert.equal(sawVent, true);
  assert.equal(engine.snapshot().mass.pressure.phase, "spent");
  assert.equal(engine.reset().mass.pressure.burstSequence, 0);
  close(engine.step(neutral).tilt.commonForceN, 0);
});
