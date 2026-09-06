// DOM/controller and shipped production-Wasm regressions; no browser or device.
// From webxr: node --test tests/offline-lab.test.mjs
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const previous = { document: globalThis.document, factory: globalThis.__offlineLabEngineFactory,
  navigator: Object.getOwnPropertyDescriptor(globalThis, "navigator") };
after(() => {
  globalThis.document = previous.document;
  if (previous.factory === undefined) delete globalThis.__offlineLabEngineFactory;
  else globalThis.__offlineLabEngineFactory = previous.factory;
  if (previous.navigator) Object.defineProperty(globalThis, "navigator", previous.navigator);
  else delete globalThis.navigator;
});
const importBundle = async options => {
  const output = await build({ bundle: true, format: "esm", platform: "node", write: false,
    logLevel: "silent", ...options });
  return import(`data:text/javascript;base64,${Buffer.from(output.outputFiles[0].text).toString("base64")}`);
};
const { OfflineLab } = await importBundle({
  entryPoints: [fileURLToPath(new URL("../src/offlineLab.ts", import.meta.url))],
  plugins: [{ name: "offline-lab-engine-boundary", setup(builder) {
    builder.onResolve({ filter: /HapticLink/ }, () => { throw new Error("Offline Lab must not import hardware controls"); });
    builder.onResolve({ filter: /\/lab\/PreviewEngine$/ }, () => ({ path: "engine", namespace: "offline-lab-test" }));
    builder.onLoad({ filter: /.*/, namespace: "offline-lab-test" }, () => ({ loader: "js",
      contents: "export const PreviewEngine = { create: (...args) => globalThis.__offlineLabEngineFactory(...args) };" }));
  } }]
});
const { PreviewEngine } = await importBundle({
  entryPoints: [fileURLToPath(new URL("../src/lab/PreviewEngine.ts", import.meta.url))]
});

const presets = ["granular_single_marble_box", "granular_sand_box", "liquid_small_box", "liquid_soda_bottle"];
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const near = (actual, expected, tolerance = 1e-7) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);

class Element {
  disabled = false; hidden = false; value = "0"; checked = true; textContent = "";
  dataset = {}; attributes = {};
  setAttribute(name, value) { this.attributes[name] = value; }
  click() { if (!this.disabled) this.onclick?.(); }
  input(value) { this.value = String(value); this.oninput?.(); }
  change(value) { this.checked = value; this.onchange?.(); }
}
function frame(preset = "granular_sand_box") {
  return { source: "production-cpp-preview", abiVersion: 1, preset,
    family: preset.startsWith("granular") ? "Granular" : "Liquid", timeS: 0, frameCounter: 0, eventsTotal: 0,
    container: { span_x_m: 0.06, span_y_m: 0.06, span_z_m: 0.04, fill: 0.35,
      headspace: 0.65, viscosity: 0.08, particle_count: 0.9, particle_hardness: 0.35 },
    parameters: { granularPile: preset === "granular_sand_box" },
    mass: { posNorm: [0, -0.65], velNormS: [0, 0], energy: 0, fill: 0.35,
      granularPileActive: preset === "granular_sand_box", pileSlope: 0, granularFlow: 0,
      pressure: { enabled: preset === "liquid_soda_bottle", phase: "sealed", charge: 0,
        phaseS: 0, remaining: 1, burstSequence: 0 } },
    tilt: { thumbDeg: 0, indexDeg: 0 }, channels: [0, 0, 0, 0], events: [] };
}
class FakeEngine {
  value = frame(); calls = []; failure = null;
  snapshot() { return structuredClone(this.value); }
  loadPreset(preset) { this.calls.push(["loadPreset", preset]); this.value = frame(preset); return this.snapshot(); }
  setParam(path, value) {
    this.calls.push(["setParam", path, value]);
    assert.equal(path, "features.enable_granular_pile_demo");
    this.value.parameters.granularPile = this.value.mass.granularPileActive = Boolean(value);
    return this.snapshot();
  }
  reset() {
    this.calls.push(["reset"]);
    const pile = this.value.parameters.granularPile;
    this.value = frame(this.value.preset);
    this.value.parameters.granularPile = this.value.mass.granularPileActive = pile;
    return this.snapshot();
  }
  step(input) {
    this.calls.push(["step", structuredClone(input)]);
    if (this.failure) throw this.failure;
    this.value.frameCounter++; this.value.timeS += input.dtS;
    this.value.mass.pressure.phaseS += input.dtS;
    this.value.channels = [0.2, 0.3, 0.4, 0.5];
    return this.snapshot();
  }
}
function fixture(factory) {
  const elements = new Map();
  const element = id => { if (!elements.has(id)) elements.set(id, new Element()); return elements.get(id); };
  element("lab-slow").checked = false;
  const buttons = presets.map(name => { const button = new Element(); button.dataset.labPreset = name; return button; });
  const meters = [0, 1, 2, 3].map(() => new Element());
  const classes = new Set();
  globalThis.document = { getElementById: element,
    querySelectorAll: selector => { assert.equal(selector, "[data-lab-preset]"); return buttons; },
    querySelector: selector => { const match = selector.match(/^\[data-lab-channel="(\d)"\]$/); assert.ok(match); return meters[Number(match[1])]; },
    body: { classList: { add: name => classes.add(name), remove: name => classes.delete(name), contains: name => classes.has(name) } }
  };
  let hardwareReads = 0;
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: Object.defineProperties({}, {
    usb: { get() { hardwareReads++; throw new Error("Unexpected USB access"); } },
    serial: { get() { hardwareReads++; throw new Error("Unexpected serial access"); } }
  }) });
  const engine = new FakeEngine(), creates = [], states = [], orientations = [], accelerations = [], applied = [], hookPresets = [];
  globalThis.__offlineLabEngineFactory = preset => { creates.push(preset); return factory ? factory(preset) : Promise.resolve(engine); };
  let allowed = true, closed = 0;
  const scene = { group: { position: { x: 0, y: 0, z: 0 } },
    setDeviceState: state => states.push(structuredClone(state)),
    setDeviceOrientation: state => orientations.push(structuredClone(state)),
    setDeviceAcceleration: (acceleration, dt) => accelerations.push({ acceleration: acceleration ? [...acceleration] : null, dt }),
    setPreset: (preset, actual) => applied.push({ preset: structuredClone(preset), actual }) };
  const lab = new OfflineLab(scene, { canEnter: () => allowed,
    onPreset: preset => hookPresets.push(structuredClone(preset)), onClose: () => { closed++; } });
  return { lab, engine, element, creates, states, orientations, accelerations, applied, hookPresets, classes, meters, scene,
    choose: preset => buttons.find(button => button.dataset.labPreset === preset).click(),
    allow: value => { allowed = value; }, closed: () => closed, hardwareReads: () => hardwareReads };
}

test("query lab route starts one asynchronous offline open and never touches hardware", async () => {
  const pending = deferred(), f = fixture(() => pending.promise);
  const main = readFileSync(new URL("../src/main.ts", import.meta.url), "utf8");
  const route = main.match(/if \(new URLSearchParams\(window\.location\.search\)\.get\("lab"\) === "1"\) void offlineLab\.open\(\);/);
  assert.ok(route, "main keeps its explicit ?lab=1 startup route");
  const runRoute = new Function("window", "offlineLab", route[0]);
  runRoute({ location: { search: "" } }, f.lab);
  assert.deepEqual(f.creates, []);
  runRoute({ location: { search: "?lab=1" } }, f.lab);
  assert.deepEqual(f.creates, ["granular_sand_box"]);
  assert.equal(f.lab.active, false);
  assert.equal(f.element("lab-open").disabled, true);
  await f.lab.open();
  assert.equal(f.creates.length, 1);
  pending.resolve(f.engine);
  await pending.promise; await Promise.resolve();
  assert.equal(f.lab.active, true);
  assert.equal(f.classes.has("offline-lab-active"), true);
  assert.equal(f.element("lab-open").disabled, false);
  assert.equal(f.hardwareReads(), 0);
});

test("canEnter rejects hardware/XR ownership before and after async creation", async () => {
  const pending = deferred(), f = fixture(() => pending.promise);
  f.allow(false); await f.lab.open();
  assert.equal(f.creates.length, 0);
  f.allow(true); const opening = f.lab.open(); f.allow(false);
  pending.resolve(f.engine); await opening;
  assert.equal(f.lab.active, false);
  assert.equal(f.applied.length, 0);
  f.allow(true); await f.lab.open();
  assert.equal(f.lab.active, true);
  f.allow(false);
  assert.equal(f.lab.update(0.016), null);
  assert.equal(f.lab.active, false);
  assert.equal(f.closed(), 1);
  assert.equal(f.hardwareReads(), 0);
});

test("close cancels a pending open and cached re-entry does not arm or reuse old motion", async () => {
  const pending = deferred(), f = fixture(() => pending.promise);
  const opening = f.lab.open(); f.lab.close();
  pending.resolve(f.engine); await opening;
  assert.equal(f.lab.active, false);
  assert.equal(f.applied.length, 0);
  await f.lab.open(); f.lab.update(0.016);
  assert.equal(f.engine.snapshot().frameCounter, 1);
  f.lab.close(); f.lab.close();
  assert.equal(f.closed(), 1);
  assert.equal(f.states.at(-1), null);
  assert.equal(f.lab.update(0.016), null);
  await f.lab.open();
  assert.equal(f.engine.snapshot().frameCounter, 0);
  assert.equal(f.hardwareReads(), 0);
});

test("load failure stays inactive and the next explicit open can retry", async () => {
  let attempts = 0;
  const f = fixture(() => ++attempts === 1 ? Promise.reject(new Error("module unavailable")) : Promise.resolve(f.engine));
  await f.lab.open();
  assert.equal(f.lab.active, false);
  assert.match(f.element("lab-open").textContent, /module unavailable/);
  assert.equal(f.element("lab-open").disabled, false);
  await f.lab.open();
  assert.equal(f.lab.active, true);
});

test("manual angles feed body-frame specific force into the engine exactly once per update", async () => {
  const f = fixture(); await f.lab.open();
  f.element("lab-roll").input(35); f.element("lab-pitch").input(20);
  const output = f.lab.update(0.02), input = f.engine.calls.at(-1)[1];
  near(input.dtS, 0.02);
  near(input.accelG[0], Math.sin(35 * Math.PI / 180) * Math.cos(20 * Math.PI / 180));
  near(input.accelG[1], Math.cos(35 * Math.PI / 180) * Math.cos(20 * Math.PI / 180));
  near(input.accelG[2], -Math.sin(20 * Math.PI / 180));
  near(output.tilt.x, 20 * Math.PI / 180); near(output.tilt.y, 35 * Math.PI / 180);
  assert.equal(f.engine.calls.filter(call => call[0] === "step").length, 1);
  assert.deepEqual(f.orientations.at(-1), { pitchRad: output.tilt.x, rollRad: output.tilt.y });
  assert.equal(f.element("mode-badge").textContent, "C++ Lab");
  assert.deepEqual(f.meters.map(meter => meter.value), [0.2, 0.3, 0.4, 0.5]);
});

test("pause holds model, pressure and visual state; reset restarts without hardware operations", async () => {
  const f = fixture(); await f.lab.open(); f.lab.update(0.02);
  f.element("lab-pause").click();
  const before = f.engine.snapshot(), visual = structuredClone(f.states.at(-1));
  for (let i = 0; i < 20; i++) f.lab.update(0.02);
  assert.deepEqual(f.engine.snapshot(), before);
  assert.deepEqual(f.states.at(-1), visual);
  assert.match(f.element("lab-status").textContent, /一時停止/);
  f.element("lab-reset").click();
  assert.equal(f.engine.snapshot().frameCounter, 0);
  assert.equal(f.element("lab-roll").value, "0");
  assert.equal(f.element("lab-pause").textContent, "一時停止");
  f.lab.update(0.02);
  assert.equal(f.engine.snapshot().frameCounter, 1);
  assert.equal(f.hardwareReads(), 0);
});

test("slow playback scales the input and model clocks together and pause freezes both", async () => {
  const f = fixture(); await f.lab.open(); f.choose("liquid_soda_bottle");
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const slowControl = html.match(/<input\b[^>]*\bid="lab-slow"[^>]*>/)?.[0];
  assert.ok(slowControl, "slow playback has an explicit Lab control");
  assert.doesNotMatch(slowControl, /\bchecked\b/, "ordinary playback remains the HTML default");
  assert.equal(f.element("lab-slow").checked, false);
  f.element("lab-slow").change(true); f.element("lab-shake").click();

  const checkStep = (wallDt, modelDt, expectedTime) => {
    f.lab.update(wallDt);
    const input = f.engine.calls.at(-1)[1];
    near(input.dtS, modelDt);
    near(input.accelG[0], 1.65 * Math.sin(expectedTime * Math.PI * 10));
    near(input.accelG[1], 1 + 0.35 * Math.cos(expectedTime * Math.PI * 10));
    near(f.accelerations.at(-1).acceleration[0], input.accelG[0]);
    near(f.accelerations.at(-1).acceleration[1], input.accelG[1] - 1);
    near(f.accelerations.at(-1).dt, modelDt);
    near(f.engine.snapshot().timeS, expectedTime);
    near(f.states.at(-1).phaseS, expectedTime);
    near(f.states.at(-1).pressure.phaseS, expectedTime);
  };
  checkStep(0.04, 0.01, 0.01);
  f.element("lab-pause").click();
  const before = f.engine.snapshot(), visual = structuredClone(f.states.at(-1));
  const position = { ...f.scene.group.position }, meters = f.meters.map(meter => meter.value);
  const callCount = f.engine.calls.length, accelerationCount = f.accelerations.length;
  for (let i = 0; i < 20; i++) f.lab.update(0.04);
  assert.equal(f.engine.calls.length, callCount);
  assert.equal(f.accelerations.length, accelerationCount);
  assert.deepEqual(f.engine.snapshot(), before);
  assert.deepEqual(f.states.at(-1), visual);
  assert.deepEqual(f.scene.group.position, position);
  assert.deepEqual(f.meters.map(meter => meter.value), meters);
  f.element("lab-pause").click();
  checkStep(0.04, 0.01, 0.02);
  f.element("lab-slow").change(false);
  checkStep(0.04, 0.04, 0.06);
  assert.equal(f.hardwareReads(), 0);
});

test("water Shake uses a broad sway while other presets retain their shared 5 Hz input and body motion", async () => {
  const f = fixture(); await f.lab.open();
  for (const preset of presets) {
    for (const slow of [false, true]) {
      f.choose(preset);
      f.element("lab-slow").change(slow);
      f.element("lab-shake").click();
      f.lab.update(0.1);
      const input = f.engine.calls.at(-1)[1];
      const time = slow ? 0.025 : 0.1;
      const omega = preset === "liquid_small_box" ? Math.PI * 2.7 : Math.PI * 10;
      near(input.dtS, time);
      near(input.accelG[0], 1.65 * Math.sin(time * omega));
      near(input.accelG[1], 1 + 0.35 * Math.cos(time * omega));
      near(input.accelG[2], 0);
      near(f.accelerations.at(-1).acceleration[0], input.accelG[0]);
      near(f.accelerations.at(-1).acceleration[1], input.accelG[1] - 1);
      near(f.accelerations.at(-1).dt, time);
      assert.equal(f.scene.group.position.x, 0, "Lab no longer competes with desktop placement");
      near(f.engine.snapshot().timeS, time);
      near(f.states.at(-1).phaseS, time);
      const count = f.accelerations.length;
      f.element("lab-pause").click(); f.lab.update(0.1);
      assert.equal(f.accelerations.length, count, "paused positional response cannot decay between source samples");
    }
  }
  assert.equal(f.hardwareReads(), 0);
});

test("manual input during pause cannot change displayed orientation while leaving the model frozen", async () => {
  const f = fixture(); await f.lab.open(); f.lab.update(0.02);
  f.element("lab-pause").click();
  const before = f.engine.snapshot(), orientation = structuredClone(f.orientations.at(-1));
  f.element("lab-roll").input(40); f.lab.update(0.02);
  assert.ok(f.engine.snapshot().frameCounter > before.frameCounter ||
    JSON.stringify(f.orientations.at(-1)) === JSON.stringify(orientation),
    "manual input must either resume the model or keep its frozen display orientation");
});

test("Reset clears positional recovery immediately while Pause holds its last sample", async () => {
  const f = fixture(); await f.lab.open();
  f.element("lab-shake").click(); f.lab.update(0.04);
  assert.ok(Math.abs(f.accelerations.at(-1).acceleration[0]) > 0.1);
  const count = f.accelerations.length;
  f.element("lab-pause").click(); f.lab.update(0.1);
  assert.equal(f.accelerations.length, count);
  f.element("lab-reset").click();
  assert.equal(f.accelerations.at(-1).acceleration, null, "reset does not leave the old gesture's slow recentering cue");
  f.lab.update(0.02);
  assert.deepEqual(f.accelerations.at(-1).acceleration, [0, 0, 0]);
  assert.equal(f.hardwareReads(), 0);
});

test("old/new sand changes the production flag without reselection silently restoring new mode", async () => {
  const f = fixture(); await f.lab.open();
  f.element("lab-pile").change(false); f.lab.update(0.02);
  assert.deepEqual(f.engine.calls.filter(call => call[0] === "setParam"), [["setParam", "features.enable_granular_pile_demo", 0]]);
  assert.equal(f.states.at(-1).pileSlope, undefined);
  f.element("lab-reset").click();
  assert.equal(f.engine.snapshot().parameters.granularPile, false);
  f.element("lab-pile").change(true); f.lab.update(0.02);
  assert.equal(f.states.at(-1).pileSlope, 0);
  f.choose("liquid_soda_bottle");
  assert.equal(f.element("lab-sand-option").hidden, true);
  assert.equal(f.element("lab-pressure").hidden, false);
  assert.equal(f.applied.at(-1).preset.preset, "liquid_soda_bottle");
});

test("model failure stays visible on subsequent paused frames until an explicit reset", async () => {
  const f = fixture(); await f.lab.open();
  f.engine.failure = new Error("invalid synthetic frame");
  f.lab.update(0.02);
  assert.match(f.element("lab-status").textContent, /invalid synthetic frame/);
  const count = f.engine.calls.length;
  f.lab.update(0.02);
  assert.equal(f.engine.calls.length, count);
  assert.match(f.element("lab-status").textContent, /invalid synthetic frame/);
  f.engine.failure = null; f.element("lab-reset").click(); f.lab.update(0.02);
  assert.doesNotMatch(f.element("lab-status").textContent, /invalid synthetic frame/);
});

test("model failure keeps the last successful visual pose when angle or resume controls are used", async () => {
  const f = fixture(); await f.lab.open(); f.lab.update(0.02);
  const before = f.engine.snapshot(), orientation = structuredClone(f.orientations.at(-1));
  f.engine.failure = new Error("invalid synthetic frame"); f.lab.update(0.02);
  const count = f.engine.calls.length;
  f.element("lab-roll").input(40); f.element("lab-pause").click(); f.element("lab-shake").click();
  f.lab.update(0.02);
  assert.equal(f.engine.calls.length, count, "failed input is not silently retried by unrelated controls");
  assert.equal(f.engine.snapshot().frameCounter, before.frameCounter);
  assert.deepEqual(f.orientations.at(-1), orientation);
  assert.match(f.element("lab-status").textContent, /invalid synthetic frame/);
});

test("sweep runs the shipped production wrapper and visibly distinguishes retained pile from old sand", async () => {
  for (const enabled of [true, false]) {
    let engine;
    const f = fixture(async preset => (engine = await PreviewEngine.create(preset)));
    await f.lab.open();
    f.element("lab-pile").change(enabled); f.element("lab-sweep").click();
    const level = [];
    let peakChannel = 0, peakTilt = 0;
    for (let i = 0; i < 250; i++) {
      f.lab.update(0.02);
      const state = engine.snapshot();
      assert.equal(state.source, "production-cpp-preview");
      peakChannel = Math.max(peakChannel, ...state.channels);
      peakTilt = Math.max(peakTilt, Math.abs(state.tilt.thumbDeg), Math.abs(state.tilt.indexDeg));
      if (i > 190 && i < 235) level.push(state.mass);
    }
    assert.equal(engine.snapshot().parameters.granularPile, enabled);
    assert.ok(peakChannel > 0 && peakTilt > 0.1);
    assert.ok(level.every(mass => mass.posNorm[0] < -0.04));
    if (enabled) {
      assert.ok(level.every(mass => mass.granularPileActive && mass.pileSlope < -0.05));
      assert.ok(level.every(mass => Math.abs(mass.posNorm[0]) < 0.9));
      near(level[0].pileSlope, level.at(-1).pileSlope, 0.02);
    } else assert.ok(level.every(mass => !mass.granularPileActive));
    f.lab.close();
    assert.equal(f.hardwareReads(), 0);
  }
});

test("Shake connects to production pressure charge, one pop and a shared spent state", async () => {
  let engine;
  const f = fixture(async preset => (engine = await PreviewEngine.create(preset)));
  await f.lab.open(); f.choose("liquid_soda_bottle"); f.element("lab-shake").click();
  let pops = 0, charge = 0;
  for (let i = 0; i < 450; i++) {
    f.lab.update(0.02);
    const state = engine.snapshot();
    pops += state.events.filter(event => event.name === "pressure_pop").length;
    charge = Math.max(charge, state.mass.pressure.charge);
    assert.deepEqual(f.states.at(-1).pressure, state.mass.pressure);
  }
  assert.equal(pops, 1);
  assert.ok(charge > 0.9);
  assert.equal(engine.snapshot().mass.pressure.phase, "spent");
  assert.match(f.element("lab-status").textContent, /噴出完了/);
  f.element("lab-reset").click(); f.lab.update(0.02);
  assert.equal(engine.snapshot().mass.pressure.phase, "sealed");
  assert.equal(engine.snapshot().mass.pressure.burstSequence, 0);
  assert.equal(f.hardwareReads(), 0);
});
