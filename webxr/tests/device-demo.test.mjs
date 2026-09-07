// Controller regressions without a browser service, GPU, or physical device.
// Run from webxr: node --test tests/device-demo.test.mjs
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";
import { setImmediate as turn } from "node:timers/promises";
import { build } from "esbuild";
import { Euler, Vector3 } from "three";
import { HapticLinkError } from "../src/link/HapticLink.ts";

class FakeHapticLink {
  static Error = HapticLinkError;
  state = {
    connection: "disconnected", transport: null, paired: null, stale: true,
    telemetry: null, lastTelemetryAt: null, pendingCommand: null, error: null, lastAck: null
  };
  listeners = new Set();
  calls = [];
  activeRequest = null;
  subscribe(listener) { this.listeners.add(listener); listener(this.state); return () => this.listeners.delete(listener); }
  emit() { for (const listener of this.listeners) listener(this.state); }
  patch(fields) { this.state = { ...this.state, ...fields }; this.emit(); }
  publish(telemetry) {
    this.patch({ connection: "connected", transport: "serial", paired: true, stale: false, telemetry, lastTelemetryAt: Date.now() });
  }
  request(name, ...args) {
    const entry = { name, args };
    this.calls.push(entry);
    const pending = new Promise((resolve, reject) => { entry.resolve = resolve; entry.reject = reject; });
    this.activeRequest = entry;
    this.patch({ pendingCommand: name });
    return pending.finally(() => {
      if (this.activeRequest === entry) { this.activeRequest = null; this.patch({ pendingCommand: null }); }
    });
  }
  async connect(kind) {
    this.calls.push({ name: "connect", args: [kind] });
    this.patch({ connection: "connected", transport: "serial", stale: true });
  }
  async disconnect() {
    this.calls.push({ name: "disconnect", args: [] });
    this.patch({ connection: "disconnected", transport: null, stale: true });
  }
  getState() { return this.request("getState"); }
  start(outputs) { return this.request("start", outputs); }
  stop() { return this.request("stop"); }
  loadPreset(name) { return this.request("loadPreset", name); }
  setParam(path, value) { return this.request("setParam", path, value); }
  clearTiltFault() { return this.request("clearTiltFault"); }
  pending(name) {
    const found = this.calls.findLast(call => call.name === name && call.resolve);
    assert.ok(found, `No pending ${name} call`);
    return found;
  }
}

const previous = { document: globalThis.document, Option: globalThis.Option, mock: globalThis.__deviceDemoTestLink };
globalThis.__deviceDemoTestLink = FakeHapticLink;
after(() => {
  globalThis.document = previous.document;
  globalThis.Option = previous.Option;
  if (previous.mock === undefined) delete globalThis.__deviceDemoTestLink;
  else globalThis.__deviceDemoTestLink = previous.mock;
});
const bundle = await build({
  entryPoints: [fileURLToPath(new URL("../src/deviceDemo.ts", import.meta.url))],
  bundle: true, format: "esm", platform: "node", write: false, logLevel: "silent",
  plugins: [{
    name: "device-demo-fake-link",
    setup(build) {
      build.onResolve({ filter: /\/link\/HapticLink$/ }, () => ({ path: "link", namespace: "device-demo-test" }));
      build.onLoad({ filter: /.*/, namespace: "device-demo-test" }, () => ({ contents: "export const HapticLink = globalThis.__deviceDemoTestLink; export const HapticLinkError = HapticLink.Error;", loader: "js" }));
    }
  }]
});
const { DeviceDemo } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`);
const sceneBundle = await build({
  entryPoints: [fileURLToPath(new URL("../src/renderer/ContainerScene.ts", import.meta.url))],
  bundle: true, format: "esm", platform: "node", write: false, logLevel: "silent"
});
const { ContainerScene } = await import(`data:text/javascript;base64,${Buffer.from(sceneBundle.outputFiles[0].text).toString("base64")}`);

class FakeElement {
  disabled = false;
  value = "";
  checked = false;
  textContent = "";
  dataset = {};
  options = [];
  add(option) { this.options.push(option); if (!this.value) this.value = option.value; }
  click() { if (!this.disabled) this.onclick?.(); }
}

function fixture(target) {
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) elements.set(id, new FakeElement());
    return elements.get(id);
  };
  const context = new Proxy({}, {
    get: (object, key) => key in object ? object[key] : /create.*Gradient/.test(String(key)) ? () => ({ addColorStop() {} }) : () => {},
    set: (object, key, value) => { object[key] = value; return true; }
  });
  globalThis.document = {
    getElementById: element, body: { classList: { toggle() {} } },
    createElement: () => ({ width: 0, height: 0, getContext: () => context })
  };
  globalThis.Option = class { constructor(text, value) { this.text = text; this.value = value; } };
  element("device-transport").value = "auto";
  element("device-audio").checked = true;
  element("device-tilt").checked = true;
  const presets = [];
  const states = [];
  const orientations = [];
  const accelerations = [];
  const accelerationIntervals = [];
  const hookPresets = [];
  const previews = [];
  const panels = [];
  const container = {
    setPreset: (preset, connected) => { presets.push({ preset: structuredClone(preset), connected }); target?.setPreset(preset, connected); },
    setDeviceState: state => { states.push(structuredClone(state)); target?.setDeviceState(state); },
    setDeviceOrientation: orientation => { orientations.push(structuredClone(orientation)); target?.setDeviceOrientation(orientation); },
    setDeviceAcceleration: (acceleration, interval) => {
      accelerations.push(structuredClone(acceleration)); accelerationIntervals.push(interval);
      target?.setDeviceAcceleration(acceleration, interval);
    }
  };
  const demo = new DeviceDemo(container, {
    onPreset: preset => hookPresets.push(structuredClone(preset)),
    onPreview: () => previews.push(true),
    onPanel: (state, callbacks) => panels.push({ state: structuredClone(state), callbacks })
  });
  return { demo, link: demo.link, element, presets, states, orientations, accelerations, accelerationIntervals, hookPresets, previews, panels };
}

const snapshot = (overrides = {}) => ({
  timestamp_ms: 1000, frame_counter: 100, preset: "granular_single_marble_box", run_mode: "idle",
  imu: { valid: true, accel_g: [Math.SQRT1_2, 0, Math.SQRT1_2], gyro_dps: [0, 0, 0] },
  mass: { pos_norm: [0.2, -1], vel_norm_s: [0.3, 0], energy: 0.2, fill: 0.4 },
  audio: { runtime_enabled: false, output_silenced: true },
  safety: { tilt_disarmed: true, imu_stale_safe_stop: false, audio_zero_asserted: true },
  tilt_servo: { fault: 0, state: 0 },
  resolved: {
    family: "Granular",
    container: { span_x_m: 0.08, span_y_m: 0.06, span_z_m: 0.07, fill: 0.4, headspace: 0.6, viscosity: 0.02, particle_count: 0.08, particle_hardness: 0.9 },
    model: { coherent_container_demo: true, device_frame_transform: true }
  },
  ...overrides
});
const liquid = () => {
  const value = snapshot({ preset: "liquid_small_box" });
  value.resolved.family = "Liquid";
  value.resolved.container.span_y_m = 0.1;
  return value;
};
const servoRetry = (overrides = {}) => snapshot({
  run_mode: "live", audio: { runtime_enabled: true, output_silenced: false },
  safety: { tilt_disarmed: false }, tilt_servo: { state: 1, fault: 2 },
  ...overrides
});
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);

test("preview is explicit; receiving resolved state updates geometry but never starts outputs", () => {
  const { demo, link, element, presets, hookPresets } = fixture();
  assert.equal(demo.active, false);
  assert.equal(element("device-start").disabled, true);
  assert.equal(element("device-stop").disabled, true);
  assert.equal(demo.update(0.016), null);
  link.publish(snapshot());
  assert.equal(demo.active, true);
  assert.equal(element("device-start").disabled, false);
  assert.equal(element("device-stop").disabled, false);
  assert.equal(element("preset-select").disabled, true);
  assert.equal(presets.at(-1).connected, true);
  assert.equal(hookPresets.at(-1).container.span_y_m, 0.06);
  assert.match(element("device-status").textContent, /IDLE/);
  assert.match(element("device-detail").textContent, /80 × 60 × 70 mm/);
  assert.deepEqual(link.calls, []);
});

test("stale reconnect with legacy telemetry cannot reuse the previous applied geometry for Start", () => {
  const { demo, link, element, states } = fixture();
  link.publish(snapshot());
  demo.update(0.016);
  const before = structuredClone(states);
  link.patch({ connection: "disconnected", stale: true });
  demo.update(0.2);
  assert.deepEqual(states, before, "disconnected scene holds its last state");
  assert.equal(element("device-start").disabled, true);
  link.patch({ connection: "connected", stale: true });
  assert.equal(element("device-start").disabled, true);
  const legacy = snapshot({ preset: "granular_sand_box" });
  delete legacy.resolved;
  link.publish(legacy);
  assert.equal(element("device-start").disabled, true, "fresh legacy state must not inherit old resolved config");
  assert.match(element("device-status").textContent, /FW|寸法|材質/);
  assert.deepEqual(link.calls, []);
});

test("same-frame immediate metadata and mass snapshots reach the scene", () => {
  const { demo, link, states, presets } = fixture();
  link.publish(snapshot());
  demo.update(0.016);
  const changed = snapshot();
  changed.resolved.container.fill = 0.75;
  changed.mass.fill = 0.75;
  link.publish(changed); // Command publication keeps timestamp/frame unchanged.
  demo.update(0.016);
  assert.equal(presets.at(-1).preset.container.fill, 0.75);
  assert.equal(states.at(-1).fill, 0.75, "frame-only dedup must not hide command metadata");
  const reset = structuredClone(changed);
  reset.mass.pos_norm = [-0.8, -0.7];
  link.publish(reset);
  demo.update(0.016);
  assert.equal(states.at(-1).massX, -0.8);
  assert.equal(states.at(-1).massY, -0.7);
  const count = states.length;
  demo.update(0.2);
  assert.equal(states.length, count, "an unchanged snapshot is not a new simulated sample");
});

test("resolved metadata before first mass sample keeps the actual scene out of preview simulation", () => {
  const scene = new ContainerScene();
  const { demo, link, states } = fixture(scene);
  const descriptor = snapshot();
  scene.setPreset({ preset: descriptor.preset, family: "Granular", container: descriptor.resolved.container });
  const render = elapsed => {
    const frame = demo.update(0.016);
    assert.notEqual(frame, null);
    scene.update(frame.tilt, frame.content, elapsed, 0.016);
    return scene.group.getObjectByName("content-particles");
  };
  link.publish(snapshot({ mass: undefined }));
  const mesh = render(0);
  assert.equal(mesh.visible, false, "missing mass must not display an independently animated preview");
  assert.equal(states.at(-1).fill, 0);
  const held = Array.from(mesh.instanceMatrix.array);
  const stateCount = states.length;
  render(100);
  link.patch({ stale: true });
  render(200);
  assert.deepEqual(Array.from(mesh.instanceMatrix.array), held);
  assert.equal(states.length, stateCount, "the placeholder is installed once, not integrated each frame");
  link.publish(snapshot());
  render(300);
  assert.equal(mesh.visible, true);
  assert.equal(states.at(-1).massX, 0.2);
  assert.notDeepEqual(Array.from(mesh.instanceMatrix.array), held);
  assert.deepEqual(link.calls, [], "receiving state never sends output commands");
  scene.dispose();
});

const demoState = (overrides = {}) => ({
  granular_pile_active: false, pile_slope: 0, granular_flow: 0,
  pressure: { enabled: false, phase: "sealed", charge: 0, phase_s: 0, remaining: 1, burst_sequence: 0 },
  ...overrides
});

test("v4 material dynamics and positional recovery consume one shared fresh snapshot", () => {
  const { demo, link, states, accelerations, accelerationIntervals } = fixture();
  const value = liquid();
  value.preset = "liquid_soda_bottle";
  value.mass.demo = demoState({ pressure: {
    enabled: true, phase: "burst", charge: 0.9, phase_s: 0.08, remaining: 0.95, burst_sequence: 1
  } });
  link.publish(value); demo.update(0.016);
  assert.equal(states.at(-1).phaseS, value.timestamp_ms / 1000);
  assert.equal(states.at(-1).pressure.phaseS, 0.08);
  const acceptedStates = states.length, acceptedAccelerations = accelerations.length;
  for (let i = 0; i < 30; ++i) demo.update(1 / 60);
  link.patch({ stale: true }); demo.update(0.2);
  assert.equal(states.length, acceptedStates, "render/stale frames cannot advance the burst or water clock");
  assert.equal(accelerations.length, acceptedAccelerations, "position recovery also holds with no fresh sample");
  const next = structuredClone(value);
  next.timestamp_ms += 100;
  next.mass.demo.pressure.phase_s += 0.1;
  link.publish(next); demo.update(0.016);
  assert.equal(states.at(-1).phaseS, 1.1);
  close(states.at(-1).pressure.phaseS, 0.18);
  close(accelerationIntervals.at(-1), 0.1);
  assert.deepEqual(link.calls, [], "reading a shared state never commands hardware");
});

test("v4 shared pile slope and flow reach the scene without deriving another surface from CG", () => {
  const { demo, link, states } = fixture();
  const value = snapshot({ preset: "granular_sand_pile_box", timestamp_ms: 12450 });
  value.mass.pos_norm = [-0.12, -0.6];
  value.mass.demo = demoState({ granular_pile_active: true, pile_slope: -0.37, granular_flow: 0.65 });
  link.publish(value); demo.update(0.016);
  assert.equal(states.at(-1).massX, -0.12);
  assert.equal(states.at(-1).pileSlope, -0.37);
  assert.equal(states.at(-1).granularFlow, 0.65);
  assert.equal(states.at(-1).phaseS, 12.45);
  assert.equal(states.at(-1).pressure, undefined);
  const held = structuredClone(value);
  held.mass.demo.granular_flow = 0;
  link.publish(held); demo.update(0.016);
  assert.equal(states.at(-1).pileSlope, -0.37);
  assert.equal(states.at(-1).granularFlow, 0, "same-frame state publications can settle flow without inventing motion");
  assert.deepEqual(link.calls, []);
});

test("v4 pressure phase, charge, remaining content and burst clock are mapped from one snapshot", () => {
  const { demo, link, states } = fixture();
  for (const [phase, charge, remaining, phaseS] of [
    ["sealed", 0.72, 1, 1.2], ["burst", 0.91, 0.6, 0.33], ["spent", 0, 0.25, 2.4]
  ]) {
    const value = liquid();
    value.preset = "liquid_soda_bottle";
    value.mass.demo = demoState({ pressure: {
      enabled: true, phase, charge, remaining, phase_s: phaseS, burst_sequence: phase === "sealed" ? 0 : 1
    } });
    link.publish(value); demo.update(0.016);
    const rendered = states.at(-1);
    assert.equal(rendered.fill, value.mass.fill, "renderer receives original fill plus the shared remaining fraction");
    assert.equal(rendered.pressure.phase, phase);
    assert.equal(rendered.pressure.charge, charge);
    assert.equal(rendered.pressure.remaining, remaining);
    assert.equal(rendered.pressure.phaseS, phaseS);
    assert.equal(rendered.pressure.burstSequence, phase === "sealed" ? 0 : 1);
    assert.equal(rendered.pileSlope, undefined);
  }
  assert.deepEqual(link.calls, []);
});

test("inactive v4 and absent legacy demo state clear enhanced visuals regardless of preset name", () => {
  const { demo, link, states } = fixture();
  const enhanced = liquid();
  enhanced.preset = "liquid_soda_bottle";
  enhanced.mass.demo = demoState({ granular_pile_active: true, pile_slope: 0.4, granular_flow: 0.5,
    pressure: { enabled: true, phase: "burst", charge: 0.8, phase_s: 0.2, remaining: 0.7, burst_sequence: 1 } });
  link.publish(enhanced); demo.update(0.016);
  assert.ok(states.at(-1).pressure);
  for (const present of [true, false]) {
    const value = structuredClone(enhanced);
    if (present) {
      // Disabled fields may retain numbers; activity flags are authoritative.
      value.mass.demo.granular_pile_active = false;
      value.mass.demo.pressure.enabled = false;
    } else delete value.mass.demo;
    link.publish(value); demo.update(0.016);
    assert.equal(states.at(-1).pileSlope, undefined);
    assert.equal(states.at(-1).granularFlow, undefined);
    assert.equal(states.at(-1).pressure, undefined);
    assert.equal(states.at(-1).massX, value.mass.pos_norm[0]);
  }
  const legacySand = snapshot({ preset: "granular_sand_pile_box" });
  link.publish(legacySand); demo.update(0.016);
  assert.equal(states.at(-1).pileSlope, undefined, "a preset label is not evidence of a shared pile state");
  assert.deepEqual(link.calls, []);
});

test("preset request and ACK alone do not claim a new visible material", async () => {
  const { demo, link, element, hookPresets } = fixture();
  link.publish(snapshot());
  const pending = demo.selectPreset("liquid_small_box");
  assert.deepEqual(link.calls.map(call => call.name), ["loadPreset"]);
  assert.equal(hookPresets.at(-1).preset, "granular_single_marble_box");
  assert.equal(element("device-start").disabled, true);
  assert.equal(element("device-stop").disabled, false);
  link.pending("loadPreset").resolve({ result: "applied" });
  await pending;
  assert.equal(hookPresets.at(-1).preset, "granular_single_marble_box");
  assert.equal(element("device-start").disabled, true, "ACK without matching applied geometry is still pending");
  link.publish(liquid());
  assert.equal(hookPresets.at(-1).preset, "liquid_small_box");
  assert.equal(hookPresets.at(-1).container.span_y_m, 0.1);
  assert.equal(element("device-start").disabled, false);
  assert.deepEqual(link.calls.map(call => call.name), ["loadPreset"]);
});

test("single-coin rejection on old firmware preserves the applied material and never substitutes other commands", async () => {
  const { demo, link, element, hookPresets } = fixture();
  link.publish(liquid());
  const option = element("device-preset").options.find(option => option.value === "granular_single_coin_box");
  assert.match(option.text, /コイン1枚.*新FW/);
  const pending = demo.selectPreset(option.value);
  assert.deepEqual(link.calls.map(call => [call.name, ...call.args]), [["loadPreset", "granular_single_coin_box"]]);
  link.pending("loadPreset").reject(new HapticLinkError("rejected", "rejected: preset_load_failed"));
  await pending;
  assert.match(element("device-status").textContent, /preset_load_failed.*コイン1枚.*AtomS3 FW/);
  assert.equal(hookPresets.at(-1).preset, "liquid_small_box");
  assert.equal(element("device-preset").value, "liquid_small_box");
  assert.equal(link.calls.length, 1);
  assert.equal(element("device-stop").disabled, false);
});

test("single coin becomes visible only from the device's resolved accepted state", async () => {
  const { demo, link, element, hookPresets } = fixture();
  link.publish(liquid());
  const pending = demo.selectPreset("granular_single_coin_box");
  link.pending("loadPreset").resolve({ result: "applied" });
  await pending;
  assert.equal(hookPresets.at(-1).preset, "liquid_small_box");
  assert.equal(element("device-start").disabled, true);
  const applied = snapshot({ preset: "granular_single_coin_box" });
  applied.resolved.container = { span_x_m: 0.05, span_y_m: 0.05, span_z_m: 0.03,
    fill: 0.04, headspace: 0.96, viscosity: 0.05, particle_count: 0.03, particle_hardness: 0.9 };
  applied.mass.fill = 0.04;
  link.publish(applied);
  assert.equal(hookPresets.at(-1).preset, "granular_single_coin_box");
  assert.deepEqual(hookPresets.at(-1).container, applied.resolved.container);
  assert.equal(element("device-start").disabled, false);
  assert.deepEqual(link.calls.map(call => call.name), ["loadPreset"]);
});

for (const reconnect of [false, true]) {
  test(`${reconnect ? "new connection" : "explicit state refresh"} abandons an old preset wait only after state ACK`, async () => {
    const { demo, link, element, hookPresets, panels } = fixture();
    link.publish(liquid());
    const selection = demo.selectPreset("granular_sand_box");
    link.pending("loadPreset").resolve({ result: "applied" });
    await selection;
    link.publish(snapshot()); // Device restarted into its boot preset instead.
    assert.match(element("device-status").textContent, /材質を適用中/);
    assert.equal(element("device-start").disabled, true);
    assert.equal(element("device-preset").value, "liquid_small_box");
    if (reconnect) link.patch({ connection: "disconnected", stale: true, telemetry: null });

    element("device-connect").click();
    await turn();
    link.publish(snapshot());
    assert.match(element("device-status").textContent, /材質を適用中/);
    assert.equal(element("device-start").disabled, true, "telemetry alone must not finish explicit recovery");
    assert.equal(element("device-preset").value, "liquid_small_box");
    link.pending("getState").resolve({ result: "applied" });
    await turn();

    assert.equal(element("device-preset").value, "granular_single_marble_box");
    assert.equal(hookPresets.at(-1).preset, "granular_single_marble_box");
    assert.equal(hookPresets.some(preset => preset.preset === "granular_sand_box"), false);
    assert.match(element("device-status").textContent, /IDLE.*振動 OFF.*傾き OFF/);
    assert.equal(element("device-start").disabled, false);
    assert.equal(panels.at(-1).state.canStart, true);
    assert.equal(panels.at(-1).state.appliedPreset, "granular_single_marble_box");
    assert.deepEqual(link.calls.map(call => call.name), reconnect ? ["loadPreset", "connect", "getState"] : ["loadPreset", "getState"]);
  });
}

test("failed explicit state refresh preserves the old preset wait and does not claim recovery", async () => {
  const { demo, link, element, panels } = fixture();
  link.publish(snapshot());
  const selection = demo.selectPreset("liquid_small_box");
  link.pending("loadPreset").resolve({ result: "applied" });
  await selection;
  element("device-connect").click();
  link.publish(snapshot());
  link.pending("getState").reject(new HapticLinkError("timeout", "State request timed out"));
  await turn();
  link.publish(snapshot());
  assert.match(element("device-status").textContent, /確認が必要: State request timed out/);
  assert.equal(element("device-preset").value, "granular_single_marble_box");
  assert.equal(element("device-start").disabled, true);
  assert.equal(panels.at(-1).state.canStart, false);
  assert.equal(element("device-connect").disabled, false);
  assert.deepEqual(link.calls.map(call => call.name), ["loadPreset", "getState"]);
});

test("Stop is passed to transport while a preset operation is busy", async () => {
  const { demo, link, element } = fixture();
  link.publish(snapshot());
  const selection = demo.selectPreset("liquid_small_box");
  assert.equal(element("device-stop").disabled, false);
  const stopping = demo.stop();
  assert.deepEqual(link.calls.map(call => call.name), ["loadPreset", "stop"]);
  link.pending("loadPreset").reject(new Error("Superseded by Stop"));
  link.pending("stop").resolve({ result: "applied" });
  await Promise.all([selection, stopping]);
  assert.equal(link.calls.some(call => call.name === "start"), false);
});

test("Start is explicit and output labels continue to reflect telemetry, not desired checkboxes", async () => {
  const { demo, link, element } = fixture();
  link.publish(snapshot());
  element("device-audio").checked = true;
  element("device-tilt").checked = false;
  const started = demo.start();
  assert.deepEqual(link.pending("start").args, [{ audio: true, tilt: false }]);
  assert.match(element("device-status").textContent, /振動 OFF/);
  assert.match(element("device-status").textContent, /傾き OFF/);
  link.pending("start").resolve({ result: "applied" });
  await started;
  assert.match(element("device-status").textContent, /振動 OFF/);
  link.publish(snapshot({ run_mode: "live", audio: { runtime_enabled: true } }));
  assert.match(element("device-status").textContent, /LIVE.*振動 ON/);
  assert.match(element("device-status").textContent, /傾き OFF/);
});

test("the existing servo recovery button is outside collapsed settings", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  const button = html.indexOf('id="device-clear"');
  const settings = html.match(/<details\b[^>]*class="device-settings"[^>]*>[\s\S]*?<\/details>/)?.[0];
  assert.ok(button >= 0, "The recovery action remains in the page");
  assert.ok(settings, "Device settings remain available");
  assert.doesNotMatch(settings, /id="device-clear"/, "Recovery must not require opening settings");
  assert.equal(html.match(/id="device-clear"/g).length, 1);
  assert.match(html.slice(button, button + 160), /停止してサーボ復帰/);
});

test("fresh servo retry shows unconfirmed tilt, blocks Start and follows device recovery without commands", async () => {
  const { demo, link, element, panels } = fixture();
  link.publish(servoRetry());
  assert.match(element("device-status").textContent, /サーボ通信を再試行中.*振動 ON.*傾きフィードバック未確認/);
  assert.doesNotMatch(element("device-status").textContent, /停止してサーボ復帰|傾き ON/);
  assert.equal(element("device-status").dataset.level, "warning");
  assert.equal(element("device-start").disabled, true);
  assert.equal(element("device-stop").disabled, false);
  assert.equal(element("device-clear").disabled, false);
  assert.equal(element("device-preset").disabled, false);
  assert.equal(panels.at(-1).state.canStart, false);
  assert.equal(panels.at(-1).state.canStop, true);
  await assert.rejects(demo.start(), /サーボ通信を再試行中/);
  element("device-start").click();
  assert.deepEqual(link.calls, [], "neither recovery telemetry nor blocked Start sends a command");

  link.publish(servoRetry({ tilt_servo: { state: 4, fault: 0 } }));
  assert.match(element("device-status").textContent, /LIVE.*振動 ON.*傾き ON/);
  assert.doesNotMatch(element("device-status").textContent, /再試行|未確認/);
  assert.equal(element("device-start").disabled, false);
  assert.equal(element("device-status").dataset.level, "live");
  assert.deepEqual(link.calls, [], "the device, not the browser, resumes after link recovery");

  link.publish(servoRetry());
  link.publish(servoRetry({ tilt_servo: { state: 5, fault: 2 }, safety: { tilt_disarmed: true } }));
  assert.match(element("device-status").textContent, /fault 2.*停止してサーボ復帰.*実機で開始/);
  assert.doesNotMatch(element("device-status").textContent, /再試行中/);
  assert.equal(element("device-clear").disabled, false);
  assert.deepEqual(link.calls, [], "exhausted recovery must not initiate a browser clear/rearm");
});

test("servo retry reports actual audio state rather than desired enabled outputs", () => {
  const { link, element } = fixture();
  assert.equal(element("device-audio").checked, true);
  link.publish(servoRetry({ audio: { runtime_enabled: false, output_silenced: true } }));
  assert.match(element("device-status").textContent, /再試行中.*振動 OFF/);
  link.publish(servoRetry({ audio: undefined }));
  assert.match(element("device-status").textContent, /再試行中.*振動 未確認/);
  assert.doesNotMatch(element("device-status").textContent, /振動 ON/);
});

test("only the exact live requested-tilt communication retry state is described as automatic recovery", () => {
  for (const overrides of [
    { tilt_servo: undefined }, { tilt_servo: { state: 1 } },
    { tilt_servo: { fault: 2 } }, { tilt_servo: { state: 1, fault: 3 } },
    { tilt_servo: { state: 5, fault: 2 } }, { tilt_servo: { state: 1, fault: 0 } },
    { safety: undefined }, { safety: {} }, { safety: { tilt_disarmed: true } },
    { run_mode: "idle" }
  ]) {
    const { link, element } = fixture();
    link.publish(servoRetry(overrides));
    assert.doesNotMatch(element("device-status").textContent, /再試行中/, JSON.stringify(overrides));
    assert.deepEqual(link.calls, []);
  }
});

test("stale, disconnected, unpaired or missing telemetry cannot keep a servo retry claim alive", () => {
  for (const fields of [
    { stale: true }, { connection: "disconnected" }, { paired: false }, { telemetry: null }
  ]) {
    const { link, element } = fixture();
    link.publish(servoRetry());
    assert.match(element("device-status").textContent, /再試行中/);
    link.patch(fields);
    assert.doesNotMatch(element("device-status").textContent, /再試行中/, JSON.stringify(fields));
    assert.deepEqual(link.calls, []);
  }
});

test("servo retry does not conceal transport errors or rejected commands", async () => {
  const { demo, link, element } = fixture();
  link.publish(servoRetry());
  link.patch({ error: "USB read failed" });
  assert.match(element("device-status").textContent, /確認が必要: USB read failed.*サーボ通信を再試行中/);
  assert.doesNotMatch(element("device-status").textContent, /停止してサーボ復帰/);
  link.patch({ error: null });
  const stopping = demo.stop();
  link.pending("stop").reject(new HapticLinkError("rejected", "rejected: stop_failed"));
  await stopping;
  assert.match(element("device-status").textContent, /確認が必要: rejected: stop_failed.*サーボ通信を再試行中/);
  assert.equal(element("device-stop").disabled, false);
  assert.equal(element("device-start").disabled, true);
  assert.deepEqual(link.calls.map(call => call.name), ["stop"]);
});

test("Stop remains available during the retry grace and confirmed Stop does not restart output", async () => {
  const { demo, link, element, panels } = fixture();
  link.publish(servoRetry());
  const stopping = demo.stop();
  assert.deepEqual(link.calls.map(call => call.name), ["stop"]);
  assert.equal(element("device-stop").disabled, false);
  assert.equal(panels.at(-1).state.canStop, true);
  link.publish(servoRetry());
  assert.match(element("device-status").textContent, /再試行中/, "request alone does not confirm Stop");
  link.publish(snapshot({ tilt_servo: { state: 2, fault: 0 } }));
  link.pending("stop").resolve({ result: "applied" });
  await stopping;
  assert.match(element("device-status").textContent, /IDLE.*振動 OFF.*傾き OFF/);
  assert.doesNotMatch(element("device-status").textContent, /再試行中/);
  assert.deepEqual(link.calls.map(call => call.name), ["stop"]);
});

test("manual servo recovery can cancel the retry grace through the existing Stop-first flow", async () => {
  const { link, element } = fixture();
  link.publish(servoRetry());
  element("device-clear").click();
  assert.deepEqual(link.calls.map(call => call.name), ["stop"]);
  link.publish(snapshot());
  link.pending("stop").resolve({ result: "applied" });
  await turn();
  link.pending("clearTiltFault").resolve({ result: "applied" });
  await turn();
  link.pending("getState").resolve({ result: "applied" });
  await turn();
  assert.deepEqual(link.calls.map(call => call.name), ["stop", "clearTiltFault", "getState"]);
  assert.match(element("device-status").textContent, /IDLE.*振動 OFF.*傾き OFF/);
});

test("servo fault recovery stops, clears and reads state without starting either output", async () => {
  const { link, element } = fixture();
  link.publish(snapshot({ tilt_servo: { fault: 3, state: 4 } }));
  assert.match(element("device-status").textContent, /fault 3.*停止してサーボ復帰.*実機で開始/);
  assert.equal(element("device-status").dataset.level, "warning");
  assert.equal(element("device-clear").disabled, false);
  assert.deepEqual(link.calls, [], "fault telemetry must not initiate recovery");

  element("device-clear").click();
  assert.deepEqual(link.calls.map(call => call.name), ["stop"]);
  assert.equal(element("device-clear").disabled, true);
  assert.equal(element("device-start").disabled, true);
  assert.equal(element("device-stop").disabled, false);
  element("device-clear").click();
  assert.equal(link.calls.length, 1, "a second recovery click must not overlap the first");
  link.pending("stop").resolve({ result: "applied" });
  await turn();
  assert.deepEqual(link.calls.map(call => call.name), ["stop", "clearTiltFault"]);
  link.pending("clearTiltFault").resolve({ result: "applied" });
  await turn();
  assert.deepEqual(link.calls.map(call => call.name), ["stop", "clearTiltFault", "getState"]);
  assert.match(element("device-status").textContent, /fault 3/, "ACK alone does not claim a healthy servo");
  link.publish(snapshot());
  link.pending("getState").resolve({ result: "applied" });
  await turn();
  assert.match(element("device-status").textContent, /IDLE.*振動 OFF.*傾き OFF/);
  assert.equal(element("device-start").disabled, false);
  assert.equal(element("device-clear").disabled, false);
  assert.equal(link.calls.some(call => call.name === "start"), false);

  element("device-start").click();
  assert.deepEqual(link.pending("start").args, [{ audio: true, tilt: true }]);
  link.pending("start").resolve({ result: "applied" });
  await turn();
});

test("failed servo recovery keeps the fault and execution error visible and permits explicit retry", async () => {
  const { link, element } = fixture();
  const fault = snapshot({ tilt_servo: { fault: 3, state: 4 } });
  link.publish(fault);
  element("device-clear").click();
  link.pending("stop").resolve({ result: "applied" });
  await turn();
  link.pending("clearTiltFault").reject(new HapticLinkError("rejected", "rejected: tilt_preflight_failed"));
  await turn();
  assert.match(element("device-status").textContent, /tilt_preflight_failed.*fault 3.*停止してサーボ復帰/);
  assert.equal(element("device-status").dataset.level, "warning");
  assert.equal(element("device-clear").disabled, false);
  assert.deepEqual(link.calls.map(call => call.name), ["stop", "clearTiltFault"]);
  link.publish(fault);
  assert.equal(link.calls.length, 2, "telemetry must not silently retry a rejected recovery");

  element("device-clear").click();
  link.pending("stop").resolve({ result: "applied" });
  await turn();
  link.pending("clearTiltFault").resolve({ result: "applied" });
  await turn();
  link.publish(snapshot());
  link.pending("getState").resolve({ result: "applied" });
  await turn();
  assert.deepEqual(link.calls.map(call => call.name), ["stop", "clearTiltFault", "stop", "clearTiltFault", "getState"]);
  assert.doesNotMatch(element("device-status").textContent, /tilt_preflight_failed|fault/);
  assert.match(element("device-status").textContent, /IDLE.*振動 OFF.*傾き OFF/);
});

test("priority Stop remains available while servo recovery is busy and no continuation arms output", async () => {
  const { demo, link, element } = fixture();
  link.publish(snapshot({ tilt_servo: { fault: 3, state: 4 } }));
  element("device-clear").click();
  link.pending("stop").resolve({ result: "applied" });
  await turn();
  assert.equal(element("device-stop").disabled, false);
  const stopping = demo.stop();
  assert.deepEqual(link.calls.map(call => call.name), ["stop", "clearTiltFault", "stop"]);
  link.pending("stop").resolve({ result: "applied" });
  await stopping;
  assert.equal(element("device-clear").disabled, true, "Stop completion must not hide the unfinished recovery");
  link.pending("clearTiltFault").reject(new HapticLinkError("cancelled", "Superseded by Stop"));
  await turn();
  assert.equal(element("device-clear").disabled, false);
  assert.doesNotMatch(element("device-status").textContent, /確認が必要|Superseded/);
  assert.equal(link.calls.some(call => call.name === "start" || call.name === "getState"), false);
});

test("an already dispatched clear may finish across priority Stop but its continuation only reads state", async () => {
  const { demo, link, element } = fixture();
  link.publish(snapshot({ tilt_servo: { fault: 3, state: 4 } }));
  element("device-clear").click();
  link.pending("stop").resolve({ result: "applied" });
  await turn();
  const stopping = demo.stop();
  link.pending("clearTiltFault").resolve({ result: "applied" });
  await turn();
  assert.deepEqual(link.calls.map(call => call.name), ["stop", "clearTiltFault", "stop", "getState"]);
  link.pending("stop").resolve({ result: "applied" });
  await stopping;
  assert.equal(element("device-start").disabled, true, "the recovery state request is still pending");
  link.publish(snapshot());
  link.pending("getState").resolve({ result: "applied" });
  await turn();
  assert.equal(element("device-clear").disabled, false);
  assert.match(element("device-status").textContent, /IDLE.*振動 OFF.*傾き OFF/);
  assert.equal(link.calls.some(call => call.name === "start"), false);
});

test("stale telemetry freezes content and pose without switching to local simulation", () => {
  const { demo, link, states, orientations, accelerations } = fixture();
  link.publish(snapshot());
  const active = demo.update(0.016);
  const before = { states: structuredClone(states), orientations: structuredClone(orientations), accelerations: structuredClone(accelerations) };
  const stale = snapshot({ frame_counter: 102, mass: { pos_norm: [-1, 1], vel_norm_s: [2, 3], energy: 1, fill: 1 } });
  link.patch({ telemetry: stale, stale: true });
  const held = demo.update(5);
  assert.notEqual(held, null);
  assert.deepEqual(held, active);
  assert.deepEqual({ states, orientations, accelerations }, before);
});

test("device-frame mounting transform and legacy identity both give neutral gravity pose", () => {
  for (const transformed of [true, false]) {
    const { demo, link, orientations } = fixture();
    const value = snapshot();
    value.resolved.model.device_frame_transform = transformed;
    if (!transformed) value.imu.accel_g = [0, 1, 0];
    link.publish(value);
    demo.update(0.016);
    close(orientations.at(-1).pitchRad, 0);
    close(orientations.at(-1).rollRad, 0);
  }
});

test("non-neutral roll, pitch and combined display poses map body specific force to world up", () => {
  for (const [pitch, roll] of [[0, 0.4], [0.3, 0], [0.3, 0.4], [-0.25, -0.5]]) {
    // R = Rx(pitch) Rz(roll), so a_body = R^T * world +Y.
    const body = [Math.sin(roll) * Math.cos(pitch), Math.cos(roll) * Math.cos(pitch), -Math.sin(pitch)];
    const raw = [(body[1] - body[2]) * Math.SQRT1_2, -body[0], (body[1] + body[2]) * Math.SQRT1_2];
    const { demo, link, orientations } = fixture();
    const value = snapshot();
    value.imu.accel_g = raw;
    link.publish(value);
    demo.update(0.016);
    const pose = orientations.at(-1);
    close(pose.pitchRad, pitch);
    close(pose.rollRad, roll);
    const world = new Vector3(...body).applyEuler(new Euler(pose.pitchRad, 0, pose.rollRad, "XYZ"));
    close(world.x, 0);
    close(world.y, 1);
    close(world.z, 0);
  }
});

test("recorded marble and sand rest samples put the reported contact on the downhill side", () => {
  // Actual near-rest samples from the 2026-09-05 handling logs: t=55478/83312 ms.
  const cases = [
    { raw: [0.788915098, 0.352546543, 0.531616688], mass: [1, -1] },
    { raw: [0.801854551, 0.240485996, 0.541870594], mass: [1, -1] }
  ];
  for (const { raw, mass } of cases) {
    const { demo, link, orientations, states } = fixture();
    const value = snapshot();
    value.imu.accel_g = raw;
    value.mass.pos_norm = mass;
    link.publish(value);
    demo.update(0.016);
    const pose = orientations.at(-1);
    const rotation = new Euler(pose.pitchRad, 0, pose.rollRad, "XYZ");
    const body = new Vector3(-raw[1], (raw[0] + raw[2]) * Math.SQRT1_2, (raw[2] - raw[0]) * Math.SQRT1_2);
    const world = body.normalize().applyEuler(rotation);
    close(world.x, 0);
    close(world.y, 1);
    close(world.z, 0);
    const lateral = new Vector3(states.at(-1).massX, 0, 0).applyEuler(rotation);
    assert.ok(lateral.y < 0, "the sampled +X contact must be lower than the -X side, not higher");
  }
});

test("return to preview requests Stop before disconnect and clearing device state", async () => {
  const { link, element, states, presets, previews, demo, panels } = fixture();
  link.publish(snapshot());
  demo.update(0.016);
  const presetCount = presets.length;
  element("device-preview").click();
  assert.deepEqual(link.calls.map(call => call.name), ["stop"]);
  assert.equal(previews.length, 0);
  link.pending("stop").resolve({ result: "applied" });
  await turn();
  assert.deepEqual(link.calls.map(call => call.name), ["stop", "disconnect"]);
  assert.equal(states.at(-1), null);
  assert.equal(previews.length, 1);
  assert.equal(demo.active, false);
  assert.equal(element("preset-select").disabled, false);
  assert.equal(panels.at(-1).state, null);
  assert.equal(presets.length, presetCount, "retained disconnected telemetry must not reapply connected geometry after onPreview");
});

test("busy state survives Stop finishing first and expected Start cancellation is not an error", async () => {
  const { demo, link, element } = fixture();
  link.publish(snapshot());
  element("device-start").click();
  const stopping = demo.stop();
  assert.deepEqual(link.calls.map(call => call.name), ["start", "stop"]);
  link.pending("stop").resolve({ result: "applied" });
  await stopping;
  assert.equal(element("device-start").disabled, true, "original Start still has an unfinished controller operation");
  link.pending("start").reject(new HapticLinkError("cancelled", "Superseded by Stop"));
  await turn();
  assert.equal(element("device-start").disabled, false);
  assert.doesNotMatch(element("device-status").textContent, /確認が必要|Superseded/);
});

test("MR panel receives the same applied state and desired-output changes do not send commands", async () => {
  const { link, panels, hookPresets } = fixture();
  assert.equal(panels.at(-1).state, null);
  link.publish(snapshot());
  const panel = panels.at(-1);
  assert.equal(panel.state.appliedPreset, hookPresets.at(-1).preset);
  assert.equal(panel.state.canStart, true);
  assert.equal(panel.state.canStop, true);
  panel.callbacks.onOutputsChanged({ audio: false, tilt: true });
  assert.deepEqual(link.calls, []);
  assert.equal(panels.at(-1).state.audioDesired, false);
  assert.equal(panels.at(-1).state.tiltDesired, true);
  panels.at(-1).callbacks.onStart();
  assert.deepEqual(link.pending("start").args, [{ audio: false, tilt: true }]);
  assert.equal(panels.at(-1).state.canStart, false);
  assert.equal(panels.at(-1).state.canStop, true);
  link.pending("start").resolve({ result: "applied" });
  await turn();
  assert.match(panels.at(-1).state.status, /IDLE.*振動 OFF.*傾き OFF/);
});

test("connect requests state, not outputs, and leaves Start disabled until resolved telemetry", async () => {
  const { link, element } = fixture();
  element("device-connect").click();
  await turn();
  assert.deepEqual(link.calls.map(call => call.name), ["connect", "getState"]);
  assert.equal(element("device-start").disabled, true);
  link.pending("getState").resolve({ result: "applied" });
  await turn();
  assert.equal(element("device-start").disabled, true);
  link.publish(snapshot());
  assert.equal(element("device-start").disabled, false);
  assert.deepEqual(link.calls.map(call => call.name), ["connect", "getState"]);
});

test("a failed discovery can be retried on the existing USB link without output commands", async () => {
  const { link, element } = fixture();
  element("device-connect").click();
  await turn();
  link.pending("getState").reject(new HapticLinkError("rejected", "haptic_link: command rejected; AtomS3 source not discovered"));
  await turn();
  assert.match(element("device-status").textContent, /source not discovered/);
  assert.equal(element("device-connect").disabled, false);
  assert.equal(element("device-connect").textContent, "状態を再取得");
  assert.equal(element("device-start").disabled, true);
  element("device-connect").click();
  assert.equal(element("device-connect").disabled, true);
  link.publish(snapshot());
  link.pending("getState").resolve({ result: "applied" });
  await turn();
  assert.deepEqual(link.calls.map(call => call.name), ["connect", "getState", "getState"]);
  assert.doesNotMatch(element("device-status").textContent, /source not discovered/);
  assert.match(element("device-status").textContent, /IDLE.*振動 OFF.*傾き OFF/);
  assert.equal(element("device-start").disabled, false);
});

test("fresh broadcast telemetry does not enable output while the bridge reports unpaired", () => {
  const { link, element, panels } = fixture();
  link.publish(snapshot());
  link.patch({ paired: false });
  assert.equal(element("device-start").disabled, true);
  assert.equal(element("device-preset").disabled, true);
  assert.equal(element("device-stop").disabled, false);
  assert.equal(element("device-connect").disabled, false);
  assert.match(element("device-status").textContent, /ペアリング待ち/);
  assert.equal(panels.at(-1).state.canStart, false);
  assert.deepEqual(link.calls, []);
  link.patch({ paired: true });
  assert.equal(element("device-start").disabled, false);
});


test('acceleration is projected once per new snapshot and never from render time', () => {
  const { demo, link, accelerations, accelerationIntervals } = fixture();
  const sample = snapshot(); sample.resolved.model.device_frame_transform = false;
  sample.imu = {valid:true,accel_g:[0,1,0]};
  link.publish(sample);demo.update(0.016);
  assert.deepEqual(accelerations.at(-1),[0,0,0]);
  link.publish({...sample,timestamp_ms:1050,frame_counter:200,imu:{valid:true,accel_g:[0.8,1,0]}});demo.update(0.016);
  assert.ok(accelerations.at(-1)[0]>0.5);
  assert.deepEqual(accelerationIntervals,[0.1,0.05]);
  const count=accelerations.length;
  for(let i=0;i<60;i++)demo.update(0.016);
  assert.equal(accelerations.length,count);
  link.patch({stale:true}); demo.update(10);
  assert.equal(accelerations.length,count);
  link.publish({...sample,timestamp_ms:9000,frame_counter:201});demo.update(0.016);
  assert.equal(accelerationIntervals.at(-1),0.1,'resuming after a gap does not fast-forward recovery');
});
