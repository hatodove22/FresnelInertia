// Bundle the TypeScript import graph with the project's existing build tooling.
// Run: node --test webxr/test/haptic-link.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { setImmediate as turn, setTimeout as delay } from "node:timers/promises";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
const linkBundle = await build({ entryPoints: [fileURLToPath(new URL('../src/link/HapticLink.ts', import.meta.url))],
  bundle: true, platform: 'node', format: 'esm', write: false, logLevel: 'silent' });
const { HapticLink, hapticLinkCapabilities, parseHapticLinkLine, parseTiltGainReadback, tiltGainsMatch } =
  await import(`data:text/javascript;base64,${Buffer.from(linkBundle.outputFiles[0].text).toString('base64')}`);

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const snapshot = (overrides = {}) => ({
  timestamp_ms: 1200, frame_counter: 120, preset: "marble_box", run_mode: "Idle",
  imu: { valid: true, accel_g: [0, 0.707, 0.707], gyro_dps: [0, 0, 0] },
  mass: { pos_norm: [0.2, -1], vel_norm_s: [0.4, 0], energy: 0.2, fill: 0.4 },
  safety: { imu_stale_safe_stop: false, audio_zero_asserted: true, tilt_disarmed: true },
  resolved: {
    family: "Granular",
    container: { span_x_m: 0.08, span_y_m: 0.05, span_z_m: 0.09, fill: 0.4, headspace: 0.6, viscosity: 0.02, particle_count: 1, particle_hardness: 0.9 },
    model: { coherent_container_demo: true, device_frame_transform: true }
  },
  future: { text: "触感", unknown: [1, 2, 3] },
  ...overrides
});
const jsonLine = (value = snapshot()) => `${JSON.stringify(value)}\n`;
const ackLine = (request, result = "applied") =>
  `haptic_link_ack: request=${request} result=${result} session=1234ABCD frame=121 detail=execution result\n`;
const outcome = promise => promise.then(value => ({ value }), error => ({ error }));

class FakeTransport {
  kind = "serial";
  writes = [];
  closed = 0;
  async open(onBytes, onClose) { this.onBytes = onBytes; this.onClose = onClose; }
  async write(bytes) {
    const text = decoder.decode(bytes);
    this.writes.push(text);
    await this.onWrite?.(text);
  }
  async close() { this.closed++; }
  send(text) { this.onBytes(encoder.encode(text)); }
  accept(request, operation, result = "applied") {
    this.send(`haptic_link_tx: request=${request} operation=${operation}\n${ackLine(request, result)}`);
  }
}

async function fixture(t, options = {}) {
  const wire = new FakeTransport();
  const link = new HapticLink({ transportFactory: async () => wire, ...options });
  t.after(() => link.disconnect());
  await link.connect();
  return { link, wire };
}

test("parser preserves full v3 telemetry and accepts legacy unknown config", () => {
  const original = snapshot();
  assert.deepEqual(parseHapticLinkLine(jsonLine(original)), { kind: "telemetry", snapshot: original });
  const legacy = snapshot();
  delete legacy.resolved;
  const parsed = parseHapticLinkLine(jsonLine(legacy));
  assert.equal(parsed.kind, "telemetry");
  assert.equal(parsed.snapshot.resolved, undefined);
  assert.equal(parseHapticLinkLine("boot: ready").kind, "diagnostic");
  assert.equal(parseHapticLinkLine(" "), null);
  assert.equal(parseHapticLinkLine("{malformed").kind, "diagnostic");
  assert.equal(parseHapticLinkLine('{"timestamp_ms":1}').kind, "diagnostic");
  assert.equal(parseHapticLinkLine(jsonLine(snapshot({ imu: { accel_g: [1, 2] } }))).kind, "diagnostic");
  assert.equal(parseHapticLinkLine(jsonLine(snapshot({ mass: { pos_norm: [1, "2"] } }))).kind, "diagnostic");
  assert.equal(parseHapticLinkLine(jsonLine(snapshot({ resolved: null }))).kind, "diagnostic");
  assert.equal(parseHapticLinkLine(jsonLine(snapshot({ resolved: { container: { fill: "0.2" } } }))).kind, "diagnostic");
  assert.equal(parseHapticLinkLine(jsonLine(snapshot({ resolved: { model: { coherent_container_demo: 1 } } }))).kind, "diagnostic");
});

test("v4 demo state and PressurePop are retained without inferring them for v3", () => {
  const frame = snapshot();
  frame.mass.demo = {
    pile_slope: -0.35, granular_flow: 0.25, granular_pile_active: true,
    pressure: { enabled: true, phase: "burst", charge: 0.9, phase_s: 1.234, remaining: 0.75, burst_sequence: 7 }
  };
  frame.last_event = { type: "PressurePop", primary_wall: "Top", amplitude: 0.8 };
  assert.deepEqual(parseHapticLinkLine(jsonLine(frame)), { kind: "telemetry", snapshot: frame });
  assert.equal(parseHapticLinkLine(jsonLine(snapshot())).snapshot.mass.demo, undefined);
  for (const phase of ["sealed", "burst", "spent"]) {
    frame.mass.demo.pressure.phase = phase;
    assert.equal(parseHapticLinkLine(jsonLine(frame)).kind, "telemetry");
  }
});

test("v5 named heartbeat is preserved without creating a beat for legacy/preset-only frames", () => {
  const frame = snapshot({ preset: "heartbeat_soft_object" });
  assert.equal(parseHapticLinkLine(jsonLine(frame)).snapshot.mass.heartbeat, undefined);
  frame.mass.heartbeat = { enabled: true, phase: 0.125, bpm: 72, beat_sequence: 4294967295,
    primary: 0.8, secondary: 0.1, contraction: 0.6 };
  frame.last_event = { type: "HeartbeatPulse", primary_wall: "None", amplitude: 0.8 };
  assert.deepEqual(parseHapticLinkLine(jsonLine(frame)), { kind: "telemetry", snapshot: frame });
  assert.equal(parseHapticLinkLine(jsonLine(frame)).snapshot.mass.demo, undefined);
  const missing = structuredClone(frame); delete missing.mass.heartbeat;
  assert.equal(parseHapticLinkLine(jsonLine(missing)).kind, "diagnostic");
  const wallHit = structuredClone(frame); wallHit.last_event.primary_wall = "Top";
  assert.equal(parseHapticLinkLine(jsonLine(wallHit)).kind, "diagnostic");
});

test("malformed heartbeat is ignored; receiving/reconnecting never starts output", async t => {
  const { link, wire } = await fixture(t);
  const initialWrites = [...wire.writes];
  wire.send(jsonLine());
  const heartbeat = { enabled: true, phase: 0.2, bpm: 72, beat_sequence: 3,
    primary: 0.5, secondary: 0, contraction: 0.4 };
  for (const mutate of [
    h => { h.enabled = false; }, h => { h.enabled = 1; }, h => { h.phase = 1; },
    h => { h.phase = -0.001; }, h => { h.phase = null; }, h => { h.bpm = 39; },
    h => { h.bpm = 141; }, h => { h.bpm = Infinity; }, h => { h.beat_sequence = 2 ** 32; },
    h => { h.beat_sequence = -1; }, h => { h.beat_sequence = 1.5; },
    h => { h.primary = -0.1; }, h => { h.secondary = 1.1; },
    h => { h.contraction = NaN; }, h => { delete h.primary; }
  ]) {
    const frame = snapshot({ frame_counter: 999 });
    frame.mass.heartbeat = structuredClone(heartbeat);
    mutate(frame.mass.heartbeat);
    assert.equal(parseHapticLinkLine(jsonLine(frame)).kind, "diagnostic");
    wire.send(jsonLine(frame));
    assert.equal(link.state.telemetry.frame_counter, 120);
  }
  const frame = snapshot(); frame.mass.heartbeat = heartbeat;
  wire.send(jsonLine(frame));
  assert.deepEqual(link.state.telemetry.mass.heartbeat, heartbeat);
  assert.deepEqual(wire.writes, initialWrites);
  wire.send(jsonLine());
  assert.equal(link.state.telemetry.mass.heartbeat, undefined, "ordinary frame clears previous pulse");
  await link.disconnect();
  await link.connect();
  assert.equal(link.state.stale, true, "retained diagnostics are not a fresh connection");
  assert.equal(link.state.telemetry.mass.heartbeat, undefined);
  assert.ok(!wire.writes.some(text => /(?:start|audio on|tilt arm)/i.test(text)));
});

test("malformed optional demo fields are rejected without replacing latest state", async t => {
  const { link, wire } = await fixture(t);
  const initialWrites = [...wire.writes];
  wire.send(jsonLine());
  const demo = {
    pile_slope: 0.2, granular_flow: 0.1, granular_pile_active: true,
    pressure: { enabled: false, phase: "sealed", charge: 0, phase_s: 0, remaining: 1, burst_sequence: 0 }
  };
  const invalid = [
    d => { d.pile_slope = null; }, d => { delete d.granular_flow; },
    d => { d.granular_flow = 1.01; }, d => { d.granular_flow = -0.01; },
    d => { d.granular_pile_active = 1; }, d => { d.pressure = null; },
    d => { d.pressure.enabled = 0; }, d => { d.pressure.phase = "open"; },
    d => { d.pressure.phase = ["sealed"]; }, d => { d.pressure.charge = 1.1; },
    d => { d.pressure.phase_s = -1; }, d => { d.pressure.remaining = -0.01; },
    d => { d.pressure.burst_sequence = 1.5; }, d => { d.pressure.burst_sequence = 65536; }
  ];
  for (const mutate of invalid) {
    const frame = snapshot({ frame_counter: 999 });
    frame.mass.demo = structuredClone(demo);
    mutate(frame.mass.demo);
    assert.equal(parseHapticLinkLine(jsonLine(frame)).kind, "diagnostic");
    wire.send(jsonLine(frame));
    assert.equal(link.state.telemetry.frame_counter, 120);
  }
  assert.deepEqual(wire.writes, initialWrites);
});

test("mixed lines and byte-split UTF-8 survive buffering; huge junk recovers", async t => {
  const { link, wire } = await fixture(t);
  const states = [];
  const unsubscribe = link.subscribe(state => states.push(state));
  wire.send("boot text\r\nespnow_bridge: ready=1 paired=1 session=1234ABCD\n");
  const bytes = encoder.encode(jsonLine());
  for (const byte of bytes) wire.onBytes(new Uint8Array([byte]));
  assert.deepEqual(link.state.telemetry, snapshot());
  assert.equal(link.state.paired, true);
  assert.equal(link.state.stale, false);
  wire.send("x".repeat(17000));
  wire.send(`${jsonLine(snapshot({ frame_counter: 200 }))}${jsonLine(snapshot({ frame_counter: 201 }))}`);
  assert.equal(link.state.telemetry.frame_counter, 201);
  wire.send("{bad json}\n");
  assert.equal(link.state.telemetry.frame_counter, 201);
  assert.ok(states.length >= 4);
  unsubscribe();
});

test("connect/reconnect observes status only; disconnected snapshots stay stale", async t => {
  const { link, wire } = await fixture(t, { staleAfterMs: 5 });
  assert.deepEqual(wire.writes, ["status\n"]);
  assert.equal(link.state.stale, true);
  wire.send(jsonLine());
  assert.equal(link.state.stale, false);
  await delay(10);
  assert.equal(link.state.stale, true);
  await link.disconnect();
  assert.equal(link.state.telemetry.preset, "marble_box");
  assert.equal(link.state.stale, true);
  await link.connect();
  assert.deepEqual(wire.writes, ["status\n", "status\n"]);
  assert.equal(link.state.stale, true);
});

test("queue allows one outstanding request and ignores unmatched TX/ACK", async t => {
  const { link, wire } = await fixture(t);
  const first = outcome(link.getState());
  const second = outcome(link.setParam("container.fill", 0.5));
  assert.deepEqual(wire.writes, ["status\n", "get state\n"]);
  wire.accept(90, 1); // Auto-pair traffic is not our get-state execution.
  wire.send(ackLine(3)); // Even a valid ACK cannot match before our TX.
  assert.equal(link.state.pendingCommand, "get state");
  wire.send("haptic_link_tx: request=4 operation=2\n");
  wire.send(ackLine(5));
  assert.equal(link.state.pendingCommand, "get state");
  wire.send(ackLine(4));
  assert.equal((await first).value.requestId, 4);
  assert.deepEqual(wire.writes, ["status\n", "get state\n", "set container.fill 0.5\n"]);
  wire.send(ackLine(4)); // A duplicate cannot complete the next operation.
  assert.equal(link.state.pendingCommand, "set container.fill 0.5");
  wire.accept(6, 7);
  assert.equal((await second).value.requestId, 6);
  assert.equal(link.state.pendingCommand, null);
});

test("non-discovery bridge rejection and timeout release queued work without retry", async t => {
  const { link, wire } = await fixture(t);
  const first = outcome(link.getState());
  const second = outcome(link.getState());
  wire.send("haptic_link: command rejected; peer setup failed\n");
  assert.equal((await first).error.code, "rejected");
  wire.send("haptic_link_tx: request=2 operation=2\n");
  wire.send("haptic_link: timeout request=1\n");
  assert.equal(link.state.pendingCommand, "get state");
  wire.send("haptic_link: timeout request=2\n");
  assert.equal((await second).error.code, "timeout");
  assert.equal(link.state.pendingCommand, null);
});

test("client timeout does not confuse a late old ACK with the next command", async t => {
  const { link, wire } = await fixture(t, { commandTimeoutMs: 15 });
  const first = outcome(link.getState());
  wire.send("haptic_link_tx: request=1 operation=2\n");
  assert.equal((await first).error.code, "timeout");
  const second = outcome(link.setAudio(false));
  wire.send(ackLine(1));
  assert.equal(link.state.pendingCommand, "audio off");
  wire.accept(2, 5);
  assert.equal((await second).value.requestId, 2);
});

test("read-only discovery retries missing source and Hello races, but succeeds only on its ACK", async t => {
  const { link, wire } = await fixture(t, { discoveryTimeoutMs: 300, discoveryRetryIntervalMs: 5 });
  let attempts = 0;
  wire.onWrite = text => {
    if (text !== "get state\n") return;
    attempts++;
    if (attempts === 1) wire.send("haptic_link: command rejected; AtomS3 source not discovered\n");
    else if (attempts === 2) wire.send("haptic_link: command rejected; link not paired\n");
    else if (attempts === 3) wire.send("haptic_link: command rejected; prior request pending\n");
    else if (attempts === 4) wire.accept(4, 2, "not_paired");
    else if (attempts === 5) wire.accept(5, 2, "bad_session");
    else {
      wire.accept(90, 1); // Hello is not the requested state ACK.
      wire.send(`haptic_link_tx: request=6 operation=2\n${jsonLine()}`);
    }
  };
  let settled = false;
  const pending = outcome(link.getState()).then(result => { settled = true; return result; });
  for (let wait = 0; wait < 100 && attempts < 6; wait++) await delay(2);
  assert.equal(attempts, 6);
  assert.equal(settled, false);
  assert.equal(link.state.pendingCommand, "get state");
  assert.equal(link.state.telemetry.preset, "marble_box");
  wire.send(ackLine(6));
  assert.equal((await pending).value.requestId, 6);
  assert.equal(link.state.error, null);
  assert.deepEqual(wire.writes, ["status\n", ...Array(6).fill("get state\n")]);
});

test("permanently missing source ends within the discovery budget without later retries", async t => {
  const { link, wire } = await fixture(t, { discoveryTimeoutMs: 40, discoveryRetryIntervalMs: 6 });
  wire.onWrite = text => {
    if (text === "get state\n") wire.send("haptic_link: command rejected; AtomS3 source not discovered\n");
  };
  const started = Date.now();
  const result = await outcome(link.getState());
  assert.ok(result.error);
  assert.ok(Date.now() - started < 250);
  assert.ok(wire.writes.length >= 3 && wire.writes.length <= 9);
  const count = wire.writes.length;
  await delay(25);
  assert.equal(wire.writes.length, count);
  assert.ok(wire.writes.slice(1).every(text => text === "get state\n"));
});

test("Stop cancels a sleeping discovery retry without sending output or another read", async t => {
  const { link, wire } = await fixture(t, { discoveryTimeoutMs: 200, discoveryRetryIntervalMs: 25 });
  wire.onWrite = text => {
    if (text === "get state\n") wire.send("haptic_link: command rejected; prior request pending\n");
    if (text === "stop\n") wire.accept(30, 3);
  };
  const pending = outcome(link.getState());
  await turn();
  assert.equal((await link.stop()).result, "applied");
  assert.equal((await pending).error.code, "cancelled");
  await delay(35);
  assert.deepEqual(wire.writes, ["status\n", "get state\n", "stop\n"]);
});

test("disconnect and a replacement connection cancel old discovery retries", async t => {
  for (const reconnect of [false, true]) {
    const { link, wire } = await fixture(t, { discoveryTimeoutMs: 200, discoveryRetryIntervalMs: 25 });
    wire.onWrite = text => {
      if (text === "get state\n") wire.send("haptic_link: command rejected; link not paired\n");
    };
    const pending = outcome(link.getState());
    await turn();
    await link.disconnect();
    if (reconnect) await link.connect();
    assert.equal((await pending).error.code, reconnect ? "cancelled" : "disconnected");
    await delay(35);
    assert.deepEqual(wire.writes, reconnect ? ["status\n", "get state\n", "status\n"] : ["status\n", "get state\n"]);
  }
});

test("discovery budget includes the final ACK wait, and ACK timeout is not retried", async t => {
  const { link, wire } = await fixture(t, { commandTimeoutMs: 500, discoveryTimeoutMs: 40, discoveryRetryIntervalMs: 5 });
  let attempts = 0;
  wire.onWrite = text => {
    if (text !== "get state\n") return;
    if (++attempts === 1) wire.send("haptic_link: command rejected; link not paired\n");
    else wire.send("haptic_link_tx: request=2 operation=2\n");
  };
  const started = Date.now();
  assert.equal((await outcome(link.getState())).error.code, "timeout");
  assert.ok(Date.now() - started < 250);
  await delay(20);
  assert.equal(attempts, 2);
});

test("expired queued discovery is removed without disturbing the active command", async t => {
  const { link, wire } = await fixture(t, { commandTimeoutMs: 500, discoveryTimeoutMs: 25 });
  const audio = outcome(link.setAudio(false));
  assert.equal((await outcome(link.getState())).error.code, "timeout");
  assert.equal(link.state.pendingCommand, "audio off");
  wire.accept(1, 5);
  assert.equal((await audio).value.result, "applied");
  await delay(20);
  assert.deepEqual(wire.writes, ["status\n", "audio off\n"]);
});

test("only exact discovery failures retry; other rejection, invalid and send failures do not", async t => {
  for (const line of [
    "haptic_link: command rejected; peer setup failed\n",
    "haptic_link: command rejected; link not paired extra text\n",
    "haptic_link: invalid command\n",
    "haptic_link: command send failed\n",
    "haptic_link: timeout\n"
  ]) {
    const { link, wire } = await fixture(t, { discoveryTimeoutMs: 40, discoveryRetryIntervalMs: 5 });
    wire.onWrite = text => { if (text === "get state\n") wire.send(line); };
    assert.ok((await outcome(link.getState())).error);
    await delay(10);
    assert.deepEqual(wire.writes, ["status\n", "get state\n"]);
  }
  const { link, wire } = await fixture(t, { discoveryTimeoutMs: 40, discoveryRetryIntervalMs: 5 });
  wire.onWrite = () => { throw new Error("link not paired"); }; // Transport error, not bridge rejection.
  assert.equal((await outcome(link.getState())).error.code, "transport");
  await delay(10);
  assert.deepEqual(wire.writes, ["status\n", "get state\n"]);
});

test("non-pairing execution ACK failures are not retried by getState", async t => {
  for (const result of ["rejected", "invalid", "busy", "unsupported"]) {
    const { link, wire } = await fixture(t, { discoveryTimeoutMs: 40, discoveryRetryIntervalMs: 5 });
    wire.onWrite = text => { if (text === "get state\n") wire.accept(1, 2, result); };
    assert.equal((await outcome(link.getState())).error.code, "rejected");
    await delay(10);
    assert.deepEqual(wire.writes, ["status\n", "get state\n"]);
  }
});

test("Live and actuator commands never gain discovery retries", async t => {
  const { link, wire } = await fixture(t, { discoveryTimeoutMs: 80, discoveryRetryIntervalMs: 5 });
  wire.onWrite = text => {
    if (text === "stop\n") wire.accept(20, 3);
    else wire.send("haptic_link: command rejected; link not paired\n");
  };
  assert.equal((await outcome(link.start({ audio: true, tilt: true }))).error.code, "rejected");
  assert.equal((await outcome(link.setAudio(true))).error.code, "rejected");
  assert.equal((await outcome(link.setTilt(true))).error.code, "rejected");
  await delay(20);
  assert.deepEqual(wire.writes, ["status\n", "live\n", "stop\n", "audio on\n", "tilt on\n"]);
});

test("Stop cancels unsent queue and Start continuation while Live is pending", async t => {
  const { link, wire } = await fixture(t);
  const started = outcome(link.start({ audio: true, tilt: true }));
  const property = outcome(link.setParam("container.fill", 0.8));
  const stopped = outcome(link.stop());
  assert.equal((await property).error.code, "cancelled");
  assert.deepEqual(wire.writes, ["status\n", "live\n"]);
  wire.accept(1, 4);
  assert.equal((await started).error.code, "cancelled");
  assert.deepEqual(wire.writes, ["status\n", "live\n", "stop\n"]);
  wire.accept(2, 3);
  assert.equal((await stopped).value.requestId, 2);
  assert.equal(link.state.pendingCommand, null);
});

test("Stop after audio dispatch waits for its ACK and never dispatches tilt on", async t => {
  const { link, wire } = await fixture(t);
  const started = outcome(link.start({ audio: true, tilt: true }));
  wire.accept(1, 4);
  await turn();
  assert.equal(wire.writes.at(-1), "audio on\n");
  const stopped = outcome(link.stop());
  wire.accept(2, 5);
  assert.equal((await started).error.code, "cancelled");
  assert.equal(wire.writes.at(-1), "stop\n");
  wire.accept(3, 3);
  assert.equal((await stopped).value.result, "applied");
  assert.equal(wire.writes.includes("tilt on\n"), false);
});

test("failed combined Start requests Stop and reports the original failure", async t => {
  const { link, wire } = await fixture(t);
  const started = outcome(link.start({ audio: true, tilt: true }));
  wire.accept(1, 4);
  await turn();
  wire.accept(2, 5);
  await turn();
  wire.accept(3, 9, "rejected");
  await turn();
  assert.equal(wire.writes.at(-1), "stop\n");
  wire.accept(4, 3);
  assert.equal((await started).error.code, "rejected");
  assert.deepEqual(wire.writes, ["status\n", "live\n", "audio on\n", "tilt on\n", "stop\n"]);
});

test("preset change stops, loads, gets state and waits for real telemetry", async t => {
  const { link, wire } = await fixture(t);
  wire.send(jsonLine());
  const changed = outcome(link.loadPreset("water_box"));
  assert.equal(wire.writes.at(-1), "stop\n");
  wire.accept(1, 3);
  await turn();
  assert.equal(wire.writes.at(-1), "preset load water_box\n");
  wire.accept(2, 6);
  await turn();
  assert.equal(wire.writes.at(-1), "get state\n");
  wire.accept(3, 2);
  assert.equal((await changed).value.requestId, 2);
  assert.equal(link.state.telemetry.preset, "marble_box");
  wire.send(jsonLine(snapshot({ preset: "water_box" })));
  assert.equal(link.state.telemetry.preset, "water_box");
  assert.deepEqual(wire.writes, ["status\n", "stop\n", "preset load water_box\n", "get state\n"]);
});

test("heartbeat rejected by older firmware remains stopped and never invents applied state", async t => {
  const { link, wire } = await fixture(t);
  wire.send(jsonLine());
  const changed = outcome(link.loadPreset("heartbeat_soft_object"));
  wire.accept(1, 3);
  await turn();
  assert.equal(wire.writes.at(-1), "preset load heartbeat_soft_object\n");
  wire.accept(2, 6, "rejected");
  assert.equal((await changed).error.code, "rejected");
  assert.equal(link.state.telemetry.preset, "marble_box");
  assert.equal(link.state.telemetry.mass.heartbeat, undefined);
  assert.deepEqual(wire.writes, ["status\n", "stop\n", "preset load heartbeat_soft_object\n"]);
});

const tuningValues = () => ({
  "resonance.master_gain": 0.65, "mass.damping_ratio_x": 0.25, "mass.damping_ratio_y": 0.4
});

const fullTuningValues = () => ({ ...tuningValues(), "mass.damping_ratio_y": .25, "tilt.max_tilt_deg": 6, "tilt.k_cm": .4, "tilt.k_tau": .3, "tilt.k_phi": 4 });
const sandTuningValues = (friction = .55) => ({ "resonance.master_gain": .65,
  "mass.granular_static_friction": friction, "mass.granular_dynamic_friction": friction * 7 / 11,
  "tilt.max_tilt_deg": 6, "tilt.k_cm": .4, "tilt.k_tau": .3, "tilt.k_phi": 4 });
const readback = p => `tilt_v1=${["tilt.max_tilt_deg", "tilt.k_cm", "tilt.k_tau", "tilt.k_phi"].map(k => p[k].toPrecision(6)).join(",")}`;
function respondToTuning(wire, { old = false, mismatch = false } = {}) {
  const applied = fullTuningValues(); let id = 0;
  wire.onWrite = async raw => {
    const command = raw.trim();
    const operation = command === "stop" ? 3 : command === "get state" ? 2 : command.startsWith("preset load") ? 6 : 7;
    if (command.startsWith("set ")) { const [, key, number] = command.split(" "); applied[key] = Number(number); }
    const actual = mismatch && id > 2 ? { ...applied, "tilt.k_tau": .99 } : applied;
    const detail = command === "get state" && !old ? readback(actual) : "applied";
    ++id;
    wire.send(`haptic_link_tx: request=${id} operation=${operation}\nhaptic_link_ack: request=${id} result=applied session=1234ABCD frame=${121+id} detail=${detail}\n`);
  };
}

test("tilt readback is versioned, finite, complete and tolerant only of wire float precision", () => {
  const expected = fullTuningValues();
  assert.equal(tiltGainsMatch(parseTiltGainReadback(readback(expected)), expected), true);
  assert.equal(tiltGainsMatch(parseTiltGainReadback("tilt_v1=6,0.4,0.300002,4"), expected), true);
  assert.equal(tiltGainsMatch(parseTiltGainReadback("tilt_v1=6,0.4,0.31,4"), expected), false);
  for (const text of ["applied", "tilt_v1_unavailable", "tilt_v1=4,.3,.2", "tilt_v1=4,.3,.2,", "tilt_v1=4,NaN,.2,4", "tilt_v1=4,.3,Infinity,4", "tilt_v1=4,.3,.2,4,0", "tilt_v2=6,.4,.3,4"])
    assert.equal(parseTiltGainReadback(text), null, text);
  assert.equal(parseTiltGainReadback("tilt_v1=15,0.4,0.3,9")["tilt.k_phi"], 9, "readback does not clamp local settings");
  for (const value of [null, "0.4", NaN]) assert.equal(tiltGainsMatch({ ...parseTiltGainReadback(readback(expected)), "tilt.k_cm":value },expected),false);
});

test("full tuning probes support, applies fixed and searched branches, verifies tilt readback, never starts", async t => {
  const { wire, link } = await fixture(t); respondToTuning(wire);
  const values = fullTuningValues(), result = await link.applyTuning("liquid_small_box", values);
  assert.equal(result.length, 11);
  assert.deepEqual(wire.writes, ["status\n", "stop\n", "get state\n", "preset load liquid_small_box\n",
    ...Object.entries(values).map(([key, value]) => `set ${key} ${value}\n`), "get state\n"]);
  assert.equal(tiltGainsMatch(parseTiltGainReadback(result.at(-1).detail), values), true);
});

test("old firmware is rejected before any preset or parameter change", async t => {
  const { wire, link } = await fixture(t); respondToTuning(wire, { old: true });
  await assert.rejects(link.applyTuning("liquid_small_box", fullTuningValues()), /AtomS3 FW/);
  assert.deepEqual(wire.writes, ["status\n", "stop\n", "get state\n", "stop\n"]);
});

test("mismatched final readback stops instead of granting successful application", async t => {
  const { wire, link } = await fixture(t); respondToTuning(wire, { mismatch: true });
  await assert.rejects(link.applyTuning("liquid_small_box", fullTuningValues()), /読み戻し/);
  assert.equal(wire.writes.at(-1), "stop\n");
  assert.ok(!wire.writes.some(v => /^(live|tilt on|audio on)/.test(v)));
});

test("invalid tilt candidates cause zero IO", async t => {
  const { wire, link } = await fixture(t), before = [...wire.writes];
  for (const [key, maximum] of [["tilt.max_tilt_deg", 10], ["tilt.k_cm", 1], ["tilt.k_tau", 1], ["tilt.k_phi", 8]]) {
    for (const value of [NaN, Infinity, -.001, maximum+.001, "0.5"]) {
      await assert.rejects(link.applyTuning("liquid_small_box", { ...fullTuningValues(), [key]: value }));
    }
  }
  assert.deepEqual(wire.writes, before);
});

test("shared search definitions preserve remote zero-phi and stricter friction acceptance policies", async t => {
  for (const [preset, base] of [["liquid_small_box", fullTuningValues()], ["granular_single_marble_box", fullTuningValues()],
    ["granular_sand_pile_box", sandTuningValues()]]) {
    const { wire, link } = await fixture(t); respondToTuning(wire);
    const values = { ...base, "tilt.k_phi": 0 };
    if (preset === "granular_sand_pile_box") values["mass.granular_dynamic_friction"] += 5e-13;
    assert.equal((await link.applyTuning(preset, values)).length, 11);
    assert.ok(!wire.writes.some(text => /^(live|audio on|tilt on)\n$/.test(text)));
  }
  const { wire, link } = await fixture(t), before = [...wire.writes];
  await assert.rejects(link.applyTuning("granular_sand_pile_box", {
    ...sandTuningValues(), "mass.granular_dynamic_friction": sandTuningValues()["mass.granular_dynamic_friction"] + 2e-12,
  }), /7\/11/);
  assert.deepEqual(wire.writes, before);
});

test("single marble and sand pile apply their complete material-specific candidates without Start", async t => {
  for (const [preset, values] of [["granular_single_marble_box", fullTuningValues()],
    ...[.2, .55, .9].flatMap(friction => [["granular_sand_pile_box", sandTuningValues(friction)],
      ["granular_sand_pile_box", { ...sandTuningValues(friction), "mass.granular_dynamic_friction": friction * (7 / 11) }]])]) {
    const { wire, link } = await fixture(t); respondToTuning(wire);
    const result = await link.applyTuning(preset, values);
    assert.equal(result.length, 11);
    assert.deepEqual(wire.writes, ["status\n", "stop\n", "get state\n", `preset load ${preset}\n`,
      ...Object.entries(values).map(([path, value]) => `set ${path} ${value}\n`), "get state\n"]);
    assert.equal(tiltGainsMatch(parseTiltGainReadback(result.at(-1).detail), values), true);
    assert.ok(!wire.writes.some(text => /^(live|audio on|tilt on)\n$/.test(text)));
  }
});

test("joint tuning validates material paths and coupled axes before any IO while legacy remains water-only", async t => {
  const { wire, link } = await fixture(t), before = [...wire.writes];
  const cases = [
    ["granular_single_marble_box", tuningValues()], ["granular_sand_pile_box", tuningValues()],
    ["granular_sand_box", sandTuningValues()], ["granular_coin_box", fullTuningValues()],
    ["granular_sand_pile_box", fullTuningValues()], ["liquid_small_box", sandTuningValues()],
    ["granular_single_marble_box", sandTuningValues()],
    ["granular_sand_pile_box\nlive", sandTuningValues()],
    ["granular_sand_pile_box", { ...sandTuningValues(), "mass.granular_dynamic_friction": .34 }],
    ["granular_sand_pile_box", { ...sandTuningValues(), "mass.damping_ratio_x": .3 }],
    ["granular_single_marble_box", { ...fullTuningValues(), "mass.damping_ratio_y": .26 }],
    ["liquid_small_box", { ...fullTuningValues(), "mass.damping_ratio_y": .26 }]
  ];
  for (const path of ["mass.granular_static_friction", "mass.granular_dynamic_friction"]) {
    const missing = sandTuningValues(); delete missing[path];
    cases.push(["granular_sand_pile_box", missing]);
    for (const value of [NaN, Infinity, -Infinity, -.01, 0, 1, "0.55"])
      cases.push(["granular_sand_pile_box", { ...sandTuningValues(), [path]: value }]);
  }
  for (const friction of [.199999, .900001]) cases.push(["granular_sand_pile_box", sandTuningValues(friction)]);
  for (const [preset, values] of cases) await assert.rejects(link.applyTuning(preset, values));
  assert.deepEqual(wire.writes, before);
});

test("new material transactions retain cancellation at every phase, including capability and final readback", async t => {
  for (const [preset, values] of [["granular_single_marble_box", fullTuningValues()], ["granular_sand_pile_box", sandTuningValues()]]) {
    const steps = [["stop\n", 3], ["get state\n", 2], [`preset load ${preset}\n`, 6],
      ...Object.entries(values).map(([key, value]) => [`set ${key} ${value}\n`, 7]), ["get state\n", 2]];
    const accept = (wire, request, operation, result = "applied") => wire.send(
      `haptic_link_tx: request=${request} operation=${operation}\nhaptic_link_ack: request=${request} result=${result} session=1234ABCD frame=121 detail=${operation === 2 ? readback(values) : "applied"}\n`);
    for (const interruption of ["stop", "disconnect"]) for (let phase = 0; phase < steps.length; phase++) {
      const { wire, link } = await fixture(t), applying = outcome(link.applyTuning(preset, values));
      for (let index = 0; index < phase; index++) {
        assert.equal(wire.writes.at(-1), steps[index][0]);
        accept(wire, index + 1, steps[index][1]); await turn();
      }
      assert.equal(wire.writes.at(-1), steps[phase][0]);
      const expected = ["status\n", ...steps.slice(0, phase + 1).map(([text]) => text)];
      if (interruption === "stop") {
        const stopped = outcome(link.stop()); accept(wire, phase + 1, steps[phase][1]);
        assert.equal((await applying).error.code, "cancelled");
        accept(wire, 100, 3); assert.equal((await stopped).value.result, "applied");
        expected.push("stop\n");
      } else {
        await link.disconnect(); assert.equal((await applying).error.code, "disconnected");
      }
      await turn(); assert.deepEqual(wire.writes, expected);
      await link.disconnect();
    }
  }
});

test("unsupported new-material FW and partial friction rejection leave the transaction stopped", async t => {
  for (const preset of ["granular_single_marble_box", "granular_sand_pile_box"]) {
    const { wire, link } = await fixture(t); respondToTuning(wire, { old: true });
    await assert.rejects(link.applyTuning(preset, preset === "granular_sand_pile_box" ? sandTuningValues() : fullTuningValues()), /AtomS3 FW/);
    assert.deepEqual(wire.writes, ["status\n", "stop\n", "get state\n", "stop\n"]);
  }
  const { wire, link } = await fixture(t); respondToTuning(wire);
  const respond = wire.onWrite;
  wire.onWrite = raw => raw.startsWith("set mass.granular_dynamic_friction ") ?
    wire.accept(99, 7, "rejected") : respond(raw);
  await assert.rejects(link.applyTuning("granular_sand_pile_box", sandTuningValues()), /rejected/);
  assert.equal(wire.writes.at(-1), "stop\n");
  assert.equal(wire.writes.filter(text => text.startsWith("set tilt.")).length, 0);
});

const tuningSteps = [
  ["stop\n", 3], ["preset load liquid_small_box\n", 6],
  ["set resonance.master_gain 0.65\n", 7], ["set mass.damping_ratio_x 0.25\n", 7],
  ["set mass.damping_ratio_y 0.4\n", 7], ["get state\n", 2]
];
async function advanceTuning(wire, phase) {
  for (let index = 0; index < phase; index++) {
    assert.equal(wire.writes.at(-1), tuningSteps[index][0]);
    wire.accept(index + 1, tuningSteps[index][1]);
    await turn();
  }
  assert.equal(wire.writes.at(-1), tuningSteps[phase][0]);
}

test("water tuning applies a copied complete candidate and returns execution ACKs without starting or inventing readback", async t => {
  const { link, wire } = await fixture(t);
  wire.send(jsonLine());
  const values = tuningValues();
  const applying = outcome(link.applyTuning("liquid_small_box", values));
  values["resonance.master_gain"] = 4; // Caller mutation cannot change an in-flight candidate.
  await advanceTuning(wire, tuningSteps.length - 1);
  wire.accept(6, 2);
  const result = await applying;
  assert.equal(result.error, undefined);
  assert.deepEqual(result.value.map(ack => ack.requestId), [1, 2, 3, 4, 5, 6]);
  assert.ok(result.value.every(ack => ack.result === "applied"));
  assert.deepEqual(wire.writes, ["status\n", ...tuningSteps.map(([text]) => text)]);
  assert.deepEqual(link.state.telemetry, snapshot(), "ACKs must not manufacture a preset or parameter snapshot");
  assert.equal(link.state.pendingCommand, null);
});

test("water tuning validates the preset and complete bounded candidate before any IO", async t => {
  const { link, wire } = await fixture(t);
  const cases = [
    ["granular_coin_box", tuningValues()], ["liquid_small_box\nlive", tuningValues()],
    ["liquid_small_box", null], ["liquid_small_box", []],
    ["liquid_small_box", {}],
    ["liquid_small_box", { ...tuningValues(), "tilt.k_phi": 4 }],
    ["liquid_small_box", { ...tuningValues(), [Symbol("extra")]: 1 }]
  ];
  for (const [path, minimum, maximum] of [["resonance.master_gain", 0.1, 1],
    ["mass.damping_ratio_x", 0.05, 1.5], ["mass.damping_ratio_y", 0.05, 1.5]]) {
    const missing = tuningValues(); delete missing[path];
    cases.push(["liquid_small_box", missing]);
    for (const value of [NaN, Infinity, -Infinity, "0.4", minimum - 0.001, maximum + 0.001]) {
      cases.push(["liquid_small_box", { ...tuningValues(), [path]: value }]);
    }
  }
  for (const [preset, values] of cases) await assert.rejects(link.applyTuning(preset, values));
  assert.deepEqual(wire.writes, ["status\n"]);
});

test("water tuning accepts inclusive parameter bounds", async t => {
  for (const [gain, damping] of [[0.1, 0.05], [1, 1.5]]) {
    const { link, wire } = await fixture(t);
    let request = 0;
    wire.onWrite = text => wire.accept(++request, text === "stop\n" ? 3 :
      text.startsWith("preset load ") ? 6 : text.startsWith("set ") ? 7 : 2);
    const result = await link.applyTuning("liquid_small_box", {
      "resonance.master_gain": gain, "mass.damping_ratio_x": damping, "mass.damping_ratio_y": damping
    });
    assert.equal(result.length, 6);
    assert.ok(wire.writes.includes(`set resonance.master_gain ${gain}\n`));
    assert.ok(wire.writes.includes(`set mass.damping_ratio_y ${damping}\n`));
    assert.ok(!wire.writes.some(text => /^(live|audio on|tilt on)\n$/.test(text)));
  }
});

test("water tuning rejection after a partial apply sends Stop and preserves the original failure without rollback", async t => {
  const { link, wire } = await fixture(t);
  const applying = outcome(link.applyTuning("liquid_small_box", tuningValues()));
  await advanceTuning(wire, 3);
  wire.accept(4, 7, "rejected");
  await turn();
  assert.equal(wire.writes.at(-1), "stop\n");
  wire.accept(5, 3);
  assert.equal((await applying).error.code, "rejected");
  assert.deepEqual(wire.writes, ["status\n", ...tuningSteps.slice(0, 4).map(([text]) => text), "stop\n"]);
});

for (const interruption of ["Stop", "disconnect", "reconnect"]) {
  for (let phase = 0; phase < tuningSteps.length; phase++) {
    test(`water tuning ${interruption} at phase ${phase + 1} prevents every later write and Start`, async t => {
      const { link, wire } = await fixture(t);
      const oldReceive = wire.onBytes;
      const applying = outcome(link.applyTuning("liquid_small_box", tuningValues()));
      await advanceTuning(wire, phase);
      const expected = ["status\n", ...tuningSteps.slice(0, phase + 1).map(([text]) => text)];
      if (interruption === "Stop") {
        const stopped = outcome(link.stop());
        wire.accept(phase + 1, tuningSteps[phase][1]); // Already-sent command can finish, not continue the transaction.
        assert.equal((await applying).error.code, "cancelled");
        wire.accept(100, 3);
        assert.equal((await stopped).value.result, "applied");
        expected.push("stop\n");
      } else {
        await link.disconnect();
        if (interruption === "reconnect") { await link.connect(); expected.push("status\n"); }
        oldReceive(encoder.encode(`haptic_link_tx: request=${phase + 1} operation=${tuningSteps[phase][1]}\n${ackLine(phase + 1)}`));
        assert.equal((await applying).error.code, "disconnected");
      }
      await turn();
      assert.deepEqual(wire.writes, expected);
      assert.equal(link.state.pendingCommand, null);
    });
  }
}

test("disconnect rejects pending work; old connection callbacks cannot alter new state", async t => {
  const { link, wire } = await fixture(t);
  const oldReceive = wire.onBytes;
  const oldClose = wire.onClose;
  const first = outcome(link.getState());
  const second = outcome(link.setAudio(true));
  await link.disconnect();
  assert.equal((await first).error.code, "disconnected");
  assert.equal((await second).error.code, "disconnected");
  await link.connect();
  oldReceive(encoder.encode(jsonLine()));
  oldClose(new Error("old disconnect"));
  assert.equal(link.state.connection, "connected");
  assert.equal(link.state.telemetry, null);
  assert.deepEqual(wire.writes, ["status\n", "get state\n", "status\n"]);
});

test("cancelled chooser cannot silently reconnect or send commands", async t => {
  const wire = new FakeTransport();
  let choose;
  const link = new HapticLink({ transportFactory: () => new Promise(resolve => { choose = resolve; }) });
  t.after(() => link.disconnect());
  const connecting = outcome(link.connect());
  await link.disconnect();
  choose(wire);
  assert.equal((await connecting).error.code, "cancelled");
  assert.equal(link.state.connection, "disconnected");
  assert.deepEqual(wire.writes, []);
  assert.equal(wire.closed, 1);
});

test("only explicit valid numeric properties/preset names are transmitted", async t => {
  const { link, wire } = await fixture(t);
  await assert.rejects(link.setParam("container.fill\naudio on", 1));
  await assert.rejects(link.setParam("container.fill", Infinity));
  await assert.rejects(link.loadPreset("water_box\nlive"));
  assert.deepEqual(wire.writes, ["status\n"]);
  const clear = outcome(link.clearTiltFault());
  assert.equal(wire.writes.at(-1), "tilt clear\n");
  wire.accept(1, 10);
  await clear;
});

function useNavigator(t, navigator) {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: navigator });
  t.after(() => {
    if (descriptor) Object.defineProperty(globalThis, "navigator", descriptor);
    else delete globalThis.navigator;
  });
}

test("Web Serial desktop path reads streams and cleanly closes reader/writer locks", async t => {
  const writes = [];
  let source;
  let baud;
  let closed = 0;
  let usbRequests = 0;
  const port = {
    readable: new ReadableStream({ start(controller) { source = controller; } }),
    writable: new WritableStream({ write(bytes) { writes.push(decoder.decode(bytes)); } }),
    async open(options) { baud = options.baudRate; },
    async close() { assert.equal(this.readable.locked, false); assert.equal(this.writable.locked, false); closed++; }
  };
  useNavigator(t, {
    serial: { requestPort: async () => port },
    usb: { requestDevice: async () => { usbRequests++; throw new Error("Should prefer Web Serial"); } }
  });
  assert.deepEqual(hapticLinkCapabilities(), { serial: true, usb: true });
  const link = new HapticLink();
  t.after(() => link.disconnect());
  await link.connect();
  assert.equal(baud, 115200);
  assert.equal(link.state.transport, "serial");
  assert.equal(usbRequests, 0);
  source.enqueue(encoder.encode(jsonLine()));
  await turn();
  assert.deepEqual(link.state.telemetry, snapshot());
  assert.deepEqual(writes, ["status\n"]);
  await link.disconnect();
  assert.equal(closed, 1);
});

function usbDevice() {
  const endpoint = (endpointNumber, direction) => ({ endpointNumber, direction, type: "bulk", packetSize: 64 });
  const config = {
    configurationValue: 4,
    interfaces: [
      { interfaceNumber: 0, alternates: [{ alternateSetting: 0, interfaceClass: 0xff, endpoints: [endpoint(1, "in"), endpoint(2, "out")] }] },
      { interfaceNumber: 2, alternates: [{ alternateSetting: 0, interfaceClass: 0x02, endpoints: [] }] },
      { interfaceNumber: 3, alternates: [{ alternateSetting: 1, interfaceClass: 0x0a, endpoints: [endpoint(7, "out"), endpoint(8, "in")] }] }
    ]
  };
  return {
    configuration: null, configurations: [config], calls: [], pending: null, closed: 0,
    async open() { this.calls.push(["open"]); },
    async selectConfiguration(number) { this.calls.push(["config", number]); this.configuration = config; },
    async claimInterface(number) { this.calls.push(["claim", number]); },
    async selectAlternateInterface(number, setting) { this.calls.push(["alternate", number, setting]); },
    async controlTransferOut(setup, bytes) {
      assert.ok(this.calls.some(call => call[0] === "claim" && call[1] === setup.index), "control interface must be claimed");
      this.calls.push(["control", setup, bytes ? [...new Uint8Array(bytes)] : null]);
      return { status: "ok" };
    },
    transferIn(endpoint, length) {
      this.calls.push(["in", endpoint, length]);
      return new Promise((resolve, reject) => { this.pending = { resolve, reject }; });
    },
    async transferOut(endpoint, bytes) {
      this.calls.push(["out", endpoint, decoder.decode(bytes)]);
      return { status: "ok", bytesWritten: bytes.byteLength };
    },
    async close() { this.closed++; this.pending?.reject(new Error("device closed")); },
    receive(text) {
      const bytes = encoder.encode(`padding${text}`);
      this.pending.resolve({ status: "ok", data: new DataView(bytes.buffer, 7, bytes.byteLength - 7) });
    }
  };
}

test("WebUSB selects CDC descriptors, claims control/data, respects DataView offset and closes pending read", async t => {
  const device = usbDevice();
  useNavigator(t, { usb: { requestDevice: async options => {
    assert.deepEqual(options.filters, [{ vendorId: 0x303a }]);
    return device;
  } } });
  const link = new HapticLink();
  t.after(() => link.disconnect());
  await link.connect("usb");
  assert.equal(link.state.transport, "usb");
  assert.ok(device.calls.some(call => call[0] === "claim" && call[1] === 3));
  assert.ok(device.calls.some(call => call[0] === "claim" && call[1] === 2));
  assert.ok(!device.calls.some(call => call[0] === "claim" && call[1] === 0));
  assert.ok(device.calls.some(call => call[0] === "alternate" && call[1] === 3 && call[2] === 1));
  const controls = device.calls.filter(call => call[0] === "control");
  assert.deepEqual(controls[0][2], [0, 0xc2, 1, 0, 0, 0, 8]);
  assert.equal(controls[0][1].index, 2);
  assert.equal(controls[1][1].value, 1); // DTR, not RTS/reset.
  assert.ok(device.calls.some(call => call[0] === "out" && call[1] === 7 && call[2] === "status\n"));
  assert.ok(device.calls.some(call => call[0] === "in" && call[1] === 8 && call[2] >= 512));
  device.receive(jsonLine());
  await turn();
  assert.deepEqual(link.state.telemetry, snapshot());
  assert.equal(device.calls.filter(call => call[0] === "in").length, 2, "next read starts immediately without probe throttling");
  await link.disconnect();
  assert.equal(device.closed, 1);
});

test("WebUSB never treats an arbitrary vendor/JTAG interface as serial", async t => {
  const device = usbDevice();
  device.configurations[0].interfaces.splice(1);
  useNavigator(t, { usb: { requestDevice: async () => device } });
  const link = new HapticLink();
  t.after(() => link.disconnect());
  await assert.rejects(link.connect("usb"), /No CDC serial/);
  assert.equal(link.state.connection, "disconnected");
  assert.equal(device.closed, 1);
  assert.ok(!device.calls.some(call => call[0] === "out"));
});
