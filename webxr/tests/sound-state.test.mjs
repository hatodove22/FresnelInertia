// Pure source projections and playback identity; no browser/audio/device access.
import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const bundled = async path => {
  const result = await build({ entryPoints: [fileURLToPath(new URL(path, import.meta.url))],
    bundle: true, format: "esm", platform: "node", write: false, logLevel: "silent" });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`);
};
const { fromDeviceSound, fromLabSound, fromPreviewSound, SoundTimeline } = await bundled("../src/audio/SoundState.ts");
const { PreviewEngine } = await bundled("../src/lab/PreviewEngine.ts");
const preset = (name = "granular_single_coin_box", family = "Granular") => ({ preset: name, family,
  container: { span_x_m: 0.05, span_y_m: 0.05, span_z_m: 0.03, fill: 0.04,
    headspace: 0.96, viscosity: 0.05, particle_count: 0.03, particle_hardness: 0.9 } });
const device = () => ({ connection: "connected", transport: "usb", paired: true, stale: false,
  lastTelemetryAt: 1000, pendingCommand: null, error: null, lastAck: null,
  telemetry: { timestamp_ms: 1000, frame_counter: 10, preset: "granular_single_coin_box", run_mode: "live",
    resolved: { family: "Granular", container: preset().container },
    mass: { pos_norm: [0.4, -1], vel_norm_s: [1, 0], fill: 0.04, energy: 0.8 },
    evt_total: 3, new_evt: 1, last_event: { type: "WallHit", amplitude: 0.7, primary_wall: "Front" } } });
const content = (changes = {}) => ({ surfaceOffsetX: 0.3, surfaceOffsetY: 0, surfaceVelocityX: 1,
  surfaceVelocityY: 0, agitation: 0, particleSpread: 0, impactPulse: 0, wavePrimary: 0, waveSecondary: 0, ...changes });
const frame = (changes = {}) => ({ source: "device", preset: "granular_coin_box", timeS: 1, serial: 10,
  step: 100, material: "coin", flow: 0.3, pan: 0.2, events: [{ kind: "impact", strength: 0.7, pan: 0.2 }], ...changes });
const advance = (value, changes = {}) => ({ ...value, timeS: value.timeS + 0.1, step: (value.step ?? 0) + 1, ...changes });
const burstState = (changes = {}) => ({ pile_slope: 0, granular_flow: 0, granular_pile_active: false,
  pressure: { enabled: true, phase: "burst", phase_s: 0.05, charge: 0.95, remaining: 0.9, burst_sequence: 1, ...changes } });
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-7, `${actual} != ${expected}`);

test("device sound requires fresh live resolved motion but does not depend on device audio enable", () => {
  const state = device();
  const before = structuredClone(state), output = fromDeviceSound(state);
  assert.equal(output.source, "device"); assert.equal(output.serial, 3); assert.equal(output.step, 10);
  assert.equal(output.material, "coin"); assert.ok(output.flow > 0);
  assert.deepEqual(output.events, [{ kind: "impact", strength: 0.7, pan: 0.85 }]);
  assert.deepEqual(state, before);
  for (const patch of [{ connection: "connecting" }, { connection: "disconnected" }, { paired: false }, { stale: true }, { telemetry: null }]) {
    assert.equal(fromDeviceSound({ ...device(), ...patch }), null);
  }
  for (const run_mode of ["idle", "replay", "fault"]) {
    const state = device(); state.telemetry.run_mode = run_mode; assert.equal(fromDeviceSound(state), null);
  }
  state.telemetry.audio = { runtime_enabled: false }; state.paired = null;
  assert.ok(fromDeviceSound(state), "browser sound is independent of the vibration-output checkbox");
});

test("pending mutations and their older-than-ACK telemetry stay silent; reads can continue", () => {
  for (const pendingCommand of ["stop", "live", "audio off", "tilt clear", "preset load granular_coin_box", "set container.fill 0.2"]) {
    assert.equal(fromDeviceSound({ ...device(), pendingCommand }), null);
  }
  for (const pendingCommand of ["get state", "status"]) assert.ok(fromDeviceSound({ ...device(), pendingCommand }));
  for (const detail of ["safe_idle", "preset_loaded", "parameter_applied", "audio_disabled", "tilt_armed"]) {
    const state = device();
    state.lastAck = { requestId: 2, result: "applied", session: "test", frame: 10, detail };
    assert.equal(fromDeviceSound(state), null);
    state.telemetry.frame_counter = 11; state.telemetry.timestamp_ms += 4;
    assert.ok(fromDeviceSound(state), "only a newer live snapshot resumes the sound source");
  }
});

test("malformed motion/configuration rejects and missing/unsafe counters never invent an event", () => {
  for (const mutate of [s => { delete s.resolved; }, s => { delete s.mass; },
    s => { s.mass.vel_norm_s = [1, NaN]; }, s => { s.mass.pos_norm = [0]; },
    s => { s.mass.fill = Infinity; }, s => { s.resolved.container.span_x_m = 0; },
    s => { s.timestamp_ms = -1; }, s => { s.frame_counter = 1.5; }]) {
    const state = device(); mutate(state.telemetry); assert.equal(fromDeviceSound(state), null);
  }
  for (const value of [undefined, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    const state = device(); state.telemetry.evt_total = value;
    const output = fromDeviceSound(state);
    assert.equal(output.serial, -1); assert.deepEqual(output.events, []); assert.ok(output.flow > 0);
  }
  for (const type of ["None", "made_up", undefined]) {
    const state = device(); state.telemetry.last_event.type = type;
    assert.deepEqual(fromDeviceSound(state).events, []);
  }
});

test("material fallback respects applied family and sparse hard solids without treating coins as marbles", () => {
  for (const [name, family, hardness, expected] of [
    ["granular_single_coin_box", "Granular", 0.9, "coin"], ["granular_coin_box", "Granular", 0.9, "coin"],
    ["granular_single_marble_box", "Granular", 1, "marble"], ["custom_hard", "Granular", 0.9, "marble"],
    ["granular_sand_box", "Granular", 0.35, "sand"], ["custom_soft", "Granular", undefined, "sand"],
    ["liquid_soda_bottle", "Liquid", 0, "soda"], ["granular_coin_box", "Liquid", 1, "water"],
    ["hybrid_ice_water", "Hybrid", 1, "hybrid"], ["detented_custom", "Detented", 0, "marble"]
  ]) {
    const p = preset(name, family); p.container.particle_hardness = hardness;
    assert.equal(fromPreviewSound(p, content(), 1).material, expected);
  }
});

test("continuous flow follows motion, active pile flow and burst envelope, never energy or sealed charge alone", () => {
  const state = device(); state.telemetry.mass.vel_norm_s = [0, 0]; state.telemetry.last_event.type = "None";
  assert.equal(fromDeviceSound(state).flow, 0, "stationary residual energy is quiet");
  state.telemetry.mass.demo = burstState({ phase: "sealed" });
  assert.equal(fromDeviceSound(state).flow, 0, "sealed charge is not audible venting");
  state.telemetry.mass.demo.granular_flow = 0.8;
  assert.equal(fromDeviceSound(state).flow, 0, "inactive pile metadata cannot excite flow");
  state.telemetry.mass.demo.granular_pile_active = true;
  assert.ok(fromDeviceSound(state).flow > 0);
  state.telemetry.mass.demo = burstState();
  assert.equal(fromDeviceSound(state).flow, 0, "a non-liquid family cannot invent pressure sound");
  state.telemetry.resolved.family = "Liquid";
  assert.equal(fromDeviceSound(state).flow, 0, 'pressure release is not fake liquid movement');
  const early = fromDeviceSound(state).vent;
  state.telemetry.mass.demo.pressure.phase_s = 2;
  assert.ok(early > fromDeviceSound(state).vent);
  state.telemetry.mass.demo.pressure.phase = "spent";
  assert.equal(fromDeviceSound(state).flow, 0); assert.equal(fromDeviceSound(state).vent, 0);
  state.telemetry.mass.fill = 0;
  state.telemetry.mass.vel_norm_s = [20, 20]; state.telemetry.last_event.type = "WallHit";
  assert.equal(fromDeviceSound(state).flow, 0); assert.deepEqual(fromDeviceSound(state).events, []);
});

test("first/duplicate snapshots suppress old transients and event-counter jumps play latest device event once", () => {
  const timeline = new SoundTimeline(), first = frame();
  assert.deepEqual(timeline.accept(first).events, []);
  assert.equal(timeline.accept(first), null);
  assert.deepEqual(timeline.accept(advance(first)).events, [], "retained last_event is not a new event");
  const next = advance(first, { timeS: 1.2, step: 102, serial: 800 });
  assert.equal(timeline.accept(next).events.length, 1, "799 unseen event increments do not create a catch-up train");
  assert.equal(timeline.accept(next), null);
  assert.deepEqual(timeline.accept(advance(next)).events, []);
});

test("same-time or repeated-step updates cannot refresh scheduling or defer a duplicate event", () => {
  for (const same of ["time", "step"]) {
    const timeline = new SoundTimeline(), first = frame(); timeline.accept(first);
    const duplicate = advance(first, { serial: 11, ...(same === "time" ? { timeS: 1 } : { step: 100 }) });
    assert.equal(timeline.accept(duplicate), null);
    assert.deepEqual(timeline.accept(advance(duplicate)).events, []);
  }
});

test("rewind, long gap, source/preset changes and counter confidence changes baseline without old impacts", () => {
  for (const changed of [{ source: "lab" }, { preset: "granular_single_marble_box", material: "marble" },
    { timeS: 0.9 }, { timeS: 1.6 }, { step: 99 }, { serial: 9 }, { serial: -1 }]) {
    const timeline = new SoundTimeline(); timeline.accept(frame());
    const output = timeline.accept(advance(frame(), changed));
    assert.equal(output.reset, true); assert.deepEqual(output.events, []);
  }
  const timeline = new SoundTimeline(); timeline.accept(frame({ serial: -1 }));
  assert.deepEqual(timeline.accept(advance(frame(), { serial: 50 })).events, []);
  assert.equal(timeline.accept(frame({ timeS: NaN })), null);
  assert.equal(timeline.accept(frame()).reset, true);
});

test("null interrupts tails and reopening the same source snapshot cannot replay or renew them", () => {
  const timeline = new SoundTimeline(), first = frame(); timeline.accept(first);
  const latest = advance(first, { serial: 11 }); assert.equal(timeline.accept(latest).events.length, 1);
  assert.equal(timeline.accept(null), null);
  assert.equal(timeline.accept(null), null);
  assert.equal(timeline.accept(latest), null, "mute/pause/reconnect cannot replay the retained source sample");
  const resumed = timeline.accept(advance(latest, { serial: 15 }));
  assert.equal(resumed.reset, true); assert.deepEqual(resumed.events, []);
  assert.equal(timeline.accept(advance(latest, { timeS: 1.3, step: 103, serial: 16 })).events.length, 1);
});

test("producer object reuse cannot mutate the timeline baseline", () => {
  const timeline = new SoundTimeline(), value = frame(); timeline.accept(value);
  value.timeS += 0.1; value.step++; value.serial++;
  assert.equal(timeline.accept(value).events.length, 1);
  value.timeS = 0;
  assert.equal(timeline.accept(value).reset, true);
});

test("soda pop needs a current shared burst and advancing event/pressure identities", () => {
  const state = device(), timeline = new SoundTimeline();
  state.telemetry.preset = "liquid_soda_bottle"; state.telemetry.resolved.family = "Liquid";
  state.telemetry.last_event.type = "PressurePop";
  assert.deepEqual(fromDeviceSound(state).events, [], "no pop is inferred from the preset or a legacy retained event");
  state.telemetry.mass.demo = burstState({ phase: "sealed", burst_sequence: 0 });
  timeline.accept(fromDeviceSound(state));
  state.telemetry.mass.demo = burstState(); state.telemetry.evt_total++; state.telemetry.frame_counter++; state.telemetry.timestamp_ms += 100;
  assert.equal(timeline.accept(fromDeviceSound(state)).events[0].kind, "pop");
  assert.equal(timeline.accept(fromDeviceSound(state)), null);
  state.telemetry.evt_total++; state.telemetry.frame_counter++; state.telemetry.timestamp_ms += 100;
  assert.deepEqual(timeline.accept(fromDeviceSound(state)).events, [], "a persistent old pop cannot replay under another count");
  state.telemetry.mass.demo.pressure.phase = "spent";
  assert.deepEqual(fromDeviceSound(state).events, []);
  state.telemetry.mass.demo = burstState({ burst_sequence: 2 });
  state.telemetry.evt_total++; state.telemetry.frame_counter++; state.telemetry.timestamp_ms += 100;
  assert.equal(timeline.accept(fromDeviceSound(state)).events[0].kind, "pop");
  for (const value of [NaN, -1, 65536]) {
    state.telemetry.mass.demo.pressure.burst_sequence = value;
    assert.deepEqual(fromDeviceSound(state).events, []);
  }
});

test("production Lab events and counters become sound candidates only in their actual step", async () => {
  const engine = await PreviewEngine.create("granular_single_coin_box"), timeline = new SoundTimeline();
  let impacts = 0;
  for (let i = 0; i < 500; i++) {
    const model = engine.step({ dtS: 0.004, accelG: [0.8 * Math.sin(i * 0.04), 1, 0] });
    const sound = fromLabSound(model), accepted = timeline.accept(sound);
    assert.equal(sound.serial, model.eventsTotal); assert.equal(sound.step, model.frameCounter);
    assert.equal(sound.timeS, model.timeS); assert.equal(sound.source, "lab");
    assert.equal(sound.events.length, model.events.length);
    impacts += accepted.events.filter(event => event.kind === "impact").length;
    assert.equal(timeline.accept(sound), null, "render repeats do not repeat a C++ event");
  }
  assert.ok(impacts > 0);
  const reset = timeline.accept(fromLabSound(engine.reset()));
  assert.equal(reset.reset, true); assert.deepEqual(reset.events, []);
});

test("Lab maps event kinds and wall pan while malformed or empty model data stays quiet", async () => {
  const model = (await PreviewEngine.create("granular_coin_box")).step({ dtS: 0.004, accelG: [0, 1, 0] });
  model.eventsTotal = 10;
  model.events = ["wall_hit", "impact_cluster", "droplet_cluster", "roof_slap", "roll_train", "scrape"].map((name, i) => ({ name, amplitude: 2, wall: i % 4 }));
  const sound = fromLabSound(model);
  assert.deepEqual(sound.events.map(event => event.kind), ["impact", "impact", "impact", "impact", "scrape", "scrape"]);
  assert.ok(sound.events.every(event => event.strength === 1));
  assert.equal(sound.events[0].pan, 0.85); assert.equal(sound.events[1].pan, -0.85);
  model.mass.fill = 0; model.mass.velNormS = [100, 100];
  assert.equal(fromLabSound(model).flow, 0); assert.deepEqual(fromLabSound(model).events, []);
  model.mass.fill = 0.2; model.mass.velNormS = [NaN, 0];
  assert.equal(fromLabSound(model).flow, 0); assert.deepEqual(fromLabSound(model).events, []);
});

test("preview impact uses motion and a hysteresis latch, not an autonomous wall/energy pulse train", () => {
  const timeline = new SoundTimeline(), p = preset();
  const submit = (time, strength, changes = {}) => timeline.accept(fromPreviewSound(p, content({ impactPulse: strength, ...changes }), time));
  assert.deepEqual(submit(1, 0.9).events, [], "enabling on a retained impact is quiet");
  assert.deepEqual(submit(1.1, 0.6).events, []);
  assert.deepEqual(submit(1.2, 0).events, []);
  assert.equal(submit(1.3, 0.8).events.length, 1);
  assert.equal(submit(1.3, 0.8), null);
  assert.deepEqual(submit(1.4, 0.3).events, []);
  assert.deepEqual(submit(1.5, 0.1).events, []);
  assert.deepEqual(submit(1.6, 0).events, []);
  assert.equal(submit(1.7, 0.5).events.length, 1);
  const stationary = fromPreviewSound(p, content({ surfaceVelocityX: 0, impactPulse: 1, agitation: 1 }), 2);
  assert.equal(stationary.flow, 0); assert.deepEqual(stationary.events, []);
  p.container.fill = 0;
  assert.equal(fromPreviewSound(p, content({ impactPulse: 1 }), 2).flow, 0);
  assert.deepEqual(fromPreviewSound(p, content({ impactPulse: 1 }), 2).events, []);
});

test("preview same-time changes consume the impact latch without delayed replay", () => {
  const timeline = new SoundTimeline(), p = preset();
  timeline.accept(fromPreviewSound(p, content(), 1));
  assert.equal(timeline.accept(fromPreviewSound(p, content({ impactPulse: 0.8 }), 1)), null);
  assert.deepEqual(timeline.accept(fromPreviewSound(p, content({ impactPulse: 0.8 }), 1.1)).events, []);
});

test("production soda shake yields exactly one audible opening followed by the shared spent state", async () => {
  const engine = await PreviewEngine.create("liquid_soda_bottle"), timeline = new SoundTimeline();
  let pops = 0, ventFrames = 0, sealedMovementFrames = 0, last;
  for (let i = 0; i < 800; i++) {
    const t = (i + 1) * 0.0125, shaking = t < 4.5;
    last = engine.step({ dtS: 0.0125, accelG: [shaking ? 1.65 * Math.sin(t * Math.PI * 10) : 0,
      1 + (shaking ? 0.35 * Math.cos(t * Math.PI * 10) : 0), 0] });
    const sound = fromLabSound(last);
    pops += timeline.accept(sound)?.events.filter(e => e.kind === "pop").length ?? 0;
    if (last.mass.pressure.phase === 'burst') {
      if (sound.vent > 0) ventFrames++;
    } else {
      assert.equal(sound.vent ?? 0, 0, 'only actual burst frames may voice recorded fizz');
      if (last.mass.pressure.phase === 'sealed' && sound.flow > 0) sealedMovementFrames++;
    }
  }
  assert.equal(pops, 1);
  assert.ok(ventFrames > 10 && sealedMovementFrames > 10);
  assert.equal(last.mass.pressure.phase, "spent");
  assert.equal(fromLabSound(last).vent, 0);
});
