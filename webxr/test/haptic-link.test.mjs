// Node 24's native TypeScript stripping runs this without adding dependencies.
// Run: node --test webxr/test/haptic-link.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { setImmediate as turn, setTimeout as delay } from "node:timers/promises";
import { HapticLink, hapticLinkCapabilities, parseHapticLinkLine } from "../src/link/HapticLink.ts";

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
