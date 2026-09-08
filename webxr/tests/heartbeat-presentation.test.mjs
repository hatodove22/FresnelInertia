import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

async function bundled(path) {
  const result = await build({ entryPoints: [fileURLToPath(new URL(path, import.meta.url))],
    bundle: true, format: 'esm', platform: 'node', write: false, logLevel: 'silent' });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
}
const { ContainerScene } = await bundled('../src/renderer/ContainerScene.ts');
const { PreviewEngine } = await bundled('../src/lab/PreviewEngine.ts');
const { fromLabSound, fromDeviceSound, SoundTimeline } = await bundled('../src/audio/SoundState.ts');
const { heartbeatSamples } = await bundled('../src/audio/HeartbeatSamples.ts');
const preset = { preset: 'heartbeat_soft_object', family: 'Custom',
  container: { span_x_m: .065, span_y_m: .085, span_z_m: .05, fill: .65 } };
const quiet = { surfaceOffsetX: 0, surfaceOffsetY: 0, surfaceVelocityX: 0, surfaceVelocityY: 0,
  agitation: 0, particleSpread: 0, impactPulse: 0, wavePrimary: 0, waveSecondary: 0 };
const state = contraction => ({ massX: 0, massY: 0, velocityX: 0, velocityY: 0, energy: 0, fill: .65,
  phaseS: 1, heartbeat: { phase: .2, primary: .5, secondary: 0, contraction, bpm: 72, beatSequence: 1 } });

test('heart is one soft object, and only shared contraction deforms its surface', () => {
  const scene = new ContainerScene(); scene.setPreset(preset, true);
  scene.setDeviceState(state(0));
  assert.equal(scene.group.getObjectByName('container-shell'), undefined);
  const body = scene.group.getObjectByName('heartbeat-soft-body'); assert.ok(body);
  const rest = Array.from(body.geometry.attributes.position.array);
  const tick = time => scene.update({ x: 0, y: 0 }, quiet, time, .016);
  scene.setDeviceState(state(1)); tick(0);
  const contracted = Array.from(body.geometry.attributes.position.array);
  assert.notDeepEqual(contracted, rest); assert.ok(contracted.every(Number.isFinite));
  tick(10); tick(1000);
  assert.deepEqual(Array.from(body.geometry.attributes.position.array), contracted, 'render clock cannot invent another beat');
  scene.setDeviceState(state(0)); tick(1001);
  assert.deepEqual(Array.from(body.geometry.attributes.position.array), rest, 'relaxation returns exact authored rest geometry');
  scene.setDeviceState({ ...state(1), heartbeat: undefined }); tick(1002);
  assert.deepEqual(Array.from(body.geometry.attributes.position.array), rest, 'missing telemetry is not a visual oscillator');
  scene.dispose(); scene.dispose();
});

test('production heartbeat generates named doublets, shared deformation, four channels and tilt at rest', async () => {
  const engine = await PreviewEngine.create('heartbeat_soft_object');
  const timeline = new SoundTimeline(); const heard = [], frames = [];
  for (let i = 0; i < 400; ++i) {
    const frame = engine.step({ dtS: .01, accelG: [0, 1, 0] }); frames.push(frame);
    const sound = fromLabSound(frame);
    assert.equal(sound.material, 'heartbeat'); assert.equal(sound.flow, 0);
    const accepted = timeline.accept(sound);
    if (accepted) heard.push(...accepted.events);
  }
  assert.ok(heard.length >= 8 && heard.length <= 10, `72 BPM doublets for4seconds: ${heard.length}`);
  assert.ok(heard.every(event => event.kind === 'beat'));
  assert.ok(new Set(heard.map(event => event.strength.toFixed(2))).size >= 2, 'main and softer second pulse');
  assert.ok(frames.some(frame => frame.mass.heartbeat.contraction > .95));
  assert.ok(frames.some(frame => frame.channels.every(level => level > .01)), 'all four output channels');
  assert.ok(frames.some(frame => Math.abs(frame.tilt.thumbDeg - frames[0].tilt.thumbDeg) > .5));
  const last = fromLabSound(frames.at(-1));
  assert.equal(timeline.accept(last), null, 'repeated sourceframe is silent');
  timeline.accept(null);
  assert.equal(timeline.accept(last), null, 'paused source cannot resume an old beat');
  assert.deepEqual(timeline.accept({ ...last, timeS: last.timeS + 2, step: last.step + 1 }).events, [], 'gap discards backlog');
});

test('live named pulse requires active heartbeat state and silences on Stop, stale, or pending command', () => {
  const link = { connection: 'connected', paired: true, stale: false, pendingCommand: null,
    telemetry: { preset: preset.preset, timestamp_ms: 1000, frame_counter: 100, run_mode: 'live', evt_total: 1,
      resolved: { family: 'Custom', container: preset.container },
      mass: { pos_norm: [0, 0], vel_norm_s: [0, 0], fill: .65,
        heartbeat: { enabled: true, phase: .1, primary: .7, secondary: 0, contraction: .3, bpm: 72, beat_sequence: 1 } },
      last_event: { type: 'HeartbeatPulse', amplitude: .95, primary_wall: 'None' } } };
  assert.equal(fromDeviceSound(link).material, 'heartbeat');
  assert.deepEqual(fromDeviceSound(link).events, [{ kind: 'beat', strength: .95, pan: 0 }]);
  for (const patch of [{ stale: true }, { paired: false }, { pendingCommand: 'stop' }]) assert.equal(fromDeviceSound({ ...link, ...patch }), null);
  link.telemetry.mass.heartbeat.enabled = false;
  assert.deepEqual(fromDeviceSound(link).events, [], 'no pulse state, no beat event');
  link.telemetry.run_mode = 'idle'; assert.equal(fromDeviceSound(link), null);
});

test('authored heart thud is deterministic, brief, bounded and edge-tapered', () => {
  for (const rate of [8000, 24000, 48000, 96000]) {
    const pcm = heartbeatSamples(rate); assert.deepEqual(pcm, heartbeatSamples(rate));
    assert.equal(pcm.length, Math.round(rate * .17));
    assert.equal(Math.abs(pcm[0]), 0); assert.equal(Math.abs(pcm.at(-1)), 0);
    assert.ok(pcm.every(value => Number.isFinite(value) && Math.abs(value) < .9));
    assert.ok(pcm.reduce((sum, value) => sum + value * value, 0) / pcm.length > .0005);
  }
  for (const rate of [NaN, 0, 7999, 192001]) assert.throws(() => heartbeatSamples(rate));
});
