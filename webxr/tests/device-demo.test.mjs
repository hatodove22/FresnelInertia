// Controller regressions without a browser service, GPU, or physical device.
// Run from webxr: node --test tests/device-demo.test.mjs
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";
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
