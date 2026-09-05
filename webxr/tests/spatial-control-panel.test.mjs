// Run from webxr: node --test tests/spatial-control-panel.test.mjs
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { Vector3 } from "three";

const previousDocument = globalThis.document;
const painted = [];
const context = new Proxy({}, {
  get: (target, key) => key in target ? target[key] : key === "fillText"
    ? (text) => painted.push({ text, stroke: target.strokeStyle }) : () => {},
  set: (target, key, value) => { target[key] = value; return true; }
});
globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => context }) };
after(() => { globalThis.document = previousDocument; });
const bundle = await build({
  entryPoints: [fileURLToPath(new URL("../src/renderer/SpatialControlPanel.ts", import.meta.url))],
  bundle: true, format: "esm", platform: "node", write: false, logLevel: "silent"
});
const { SpatialControlPanel } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`);

const initial = {
  presetNames: ["granular_single_marble_box", "granular_sand_box", "liquid_small_box", "hybrid_ice_water", "beads", "coins"],
  appliedPreset: "granular_single_marble_box", status: "LIVE / Vibration ON / Tilt OFF",
  detail: "80 x 120 x 50 mm / fill 50%", available: true, canStart: true,
  canStop: true, audioDesired: true, tiltDesired: false
};
function fixture() {
  const events = [];
  const panel = new SpatialControlPanel({
    presetNames: ["preview_one", "preview_two"], selectedPreset: "preview_one",
    stimulusOptions: [{ value: "manual", label: "Manual" }], selectedStimulus: "manual",
    onPresetSelected: name => events.push(["preview-preset", name]),
    onStimulusSelected: name => events.push(["stimulus", name]),
    onStateChanged: state => events.push(["slider", state]),
    onTrialStartStop: () => events.push(["trial"]), onTrialMark: () => events.push(["mark"]),
    onTrialNext: () => events.push(["next"]), onReset: () => events.push(["reset"])
  });
  const callbacks = {
    onPresetSelected: name => events.push(["preset", name]),
    onStart: () => events.push(["start"]), onStop: () => events.push(["stop"]),
    onOutputsChanged: outputs => events.push(["outputs", outputs])
  };
  const point = (u, v) => {
    panel.group.updateMatrixWorld(true);
    return new Vector3((u / 1024 - 0.5) * 0.42, (0.5 - v / 780) * 0.32, 0).applyMatrix4(panel.group.matrixWorld);
  };
  const touch = (u, v, pressed = true, sourceId) => panel.interactPoint(point(u, v), pressed, sourceId);
  const ray = (u, v, pressed, sourceId) => {
    const target = point(u, v);
    const normal = new Vector3(0, 0, 1).transformDirection(panel.group.matrixWorld);
    const origin = target.clone().addScaledVector(normal, 0.3);
    return panel.interactRay(origin, normal.negate(), pressed, sourceId);
  };
  const click = (u, v) => { touch(u, v); touch(u, v, false); };
  panel.setDeviceMode(initial, callbacks);
  return { panel, events, callbacks, touch, ray, click };
}
function selection(panel) {
  painted.length = 0;
  panel.update();
  return painted.filter(item => item.stroke === "rgba(158, 236, 230, 0.72)").map(item => item.text);
}

test("connected panel exposes status and real presets without running callbacks", () => {
  const { panel, events } = fixture();
  selection(panel);
  const labels = painted.map(item => item.text);
  assert.ok(labels.includes("Device Panel"));
  assert.ok(labels.includes("granular single marble box"));
  assert.ok(labels.includes("Start") && labels.includes("STOP"));
  assert.ok(!labels.includes("Sliders") && !labels.includes("Trial") && !labels.includes("Stimulus"));
  assert.deepEqual(events, []);
});

test("preset click requests only; applied highlight changes only after root state", () => {
  const { panel, events, click } = fixture();
  click(100, 253);
  assert.deepEqual(events, [["preset", "granular_sand_box"]]);
  assert.ok(selection(panel).includes("granular single marble box"));
  panel.setDeviceMode({ ...initial, appliedPreset: "granular_sand_box" });
  assert.ok(selection(panel).includes("granular sand box"));
  assert.equal(events.length, 1);
});

test("desired outputs request changes without Start or optimistic checkbox state", () => {
  const { panel, events, click } = fixture();
  click(650, 337);
  assert.deepEqual(events, [["outputs", { audio: false, tilt: false }]]);
  selection(panel);
  assert.ok(painted.some(item => item.text === "[x] Vibration"));
  panel.setDeviceMode({ ...initial, audioDesired: false });
  click(650, 413);
  assert.deepEqual(events[1], ["outputs", { audio: false, tilt: true }]);
  click(650, 507);
  assert.deepEqual(events[2], ["start"]);
});

test("Stop remains available while busy; other controls and preview hits do not", () => {
  const { panel, events, click } = fixture();
  panel.setDeviceMode({ ...initial, available: false, canStart: false, status: "Preset pending" });
  for (const xy of [[100, 253], [650, 337], [650, 413], [650, 507], [650, 710], [900, 200]]) click(...xy);
  assert.deepEqual(events, []);
  click(650, 589);
  assert.deepEqual(events, [["stop"]]);
  panel.setDeviceMode({ ...initial, available: false, canStart: false, canStop: false });
  click(650, 589);
  assert.equal(events.length, 1);
});

test("holding a control does not resend it when telemetry updates", () => {
  const { panel, events, touch } = fixture();
  touch(650, 589);
  panel.setDeviceMode({ ...initial, status: "Stop pending", available: false });
  touch(650, 589);
  assert.deepEqual(events, [["stop"]]);
  touch(650, 589, false);
  touch(650, 589);
  assert.equal(events.length, 2);
});

test("release during a busy-disabled control permits the next deliberate press", () => {
  const { panel, events, touch, click } = fixture();
  touch(650, 507);
  panel.setDeviceMode({ ...initial, available: false, canStart: false });
  touch(650, 507, false);
  panel.setDeviceMode(initial);
  click(650, 507);
  assert.deepEqual(events, [["start"], ["start"]]);
});

test("device pagination works, and null restores the existing preview controls", () => {
  const { panel, events, click } = fixture();
  click(460, 145);
  click(100, 199);
  assert.deepEqual(events, [["preset", "coins"]]);
  panel.setDeviceMode(null);
  click(650, 710);
  assert.deepEqual(events[1], ["reset"]);
  click(750, 337);
  assert.equal(events[2][0], "slider");
  selection(panel);
  assert.ok(painted.some(item => item.text === "Experiment Panel"));
  panel.setDeviceMode(initial);
  assert.equal(events.length, 3); // Reconnect never starts outputs.
});

test("inactive other hands and off-panel controllers never re-trigger a held hand action", () => {
  const { events, touch, ray } = fixture();
  touch(650, 589, true, "hand-0");
  for (let frame = 0; frame < 5; frame += 1) {
    touch(2000, 2000, false, "hand-1");
    ray(2000, 2000, false, "controller-0");
    ray(2000, 2000, false, "controller-1");
    touch(650, 589, true, "hand-0");
  }
  assert.deepEqual(events, [["stop"]]);
  touch(650, 589, false, "hand-0");
  touch(650, 589, true, "hand-0");
  assert.deepEqual(events, [["stop"], ["stop"]]);
});

test("held controller action survives other sources releasing over or outside the panel", () => {
  const { events, touch, ray } = fixture();
  assert.equal(ray(650, 507, true, "controller-0"), true);
  for (let frame = 0; frame < 5; frame += 1) {
    ray(650, 507, false, "controller-1");
    touch(650, 507, false, "hand-0");
    touch(2000, 2000, false, "hand-1");
    ray(650, 507, true, "controller-0");
  }
  assert.deepEqual(events, [["start"]]);
  ray(650, 507, false, "controller-0");
  ray(650, 507, true, "controller-0");
  assert.deepEqual(events, [["start"], ["start"]]);
});

test("source release and leaving the panel clear only that source; session reset clears all", () => {
  const { panel, events, touch, ray } = fixture();
  touch(650, 589, true, "hand-0");
  ray(650, 507, true, "controller-0");
  panel.releaseInteraction("hand-0");
  touch(650, 589, true, "hand-0");
  ray(650, 507, true, "controller-0");
  assert.deepEqual(events, [["stop"], ["start"], ["stop"]]);
  ray(2000, 2000, true, "controller-0");
  touch(650, 589, true, "hand-0");
  ray(650, 507, true, "controller-0");
  assert.equal(events.length, 4);
  panel.resetInteractions();
  touch(650, 589, true, "hand-0");
  ray(650, 507, true, "controller-0");
  assert.deepEqual(events.slice(-2), [["stop"], ["start"]]);
  assert.equal(events.length, 6);
});

test("preview sliders remain continuously adjustable while a source is held", () => {
  const { panel, events, touch, ray } = fixture();
  panel.setDeviceMode(null);
  for (const x of [600, 750, 900]) {
    touch(x, 337, true, "hand-0");
    touch(2000, 2000, false, "hand-1");
    ray(2000, 2000, false, "controller-0");
  }
  assert.equal(events.length, 3);
  assert.ok(events.every(event => event[0] === "slider"));
  assert.ok(events[0][1].shakeBoost < events[1][1].shakeBoost);
  assert.ok(events[1][1].shakeBoost < events[2][1].shakeBoost);
});
