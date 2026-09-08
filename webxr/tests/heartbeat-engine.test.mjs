// Execute the shipped, generated C++ engine: no browser, hardware or JS beat clock.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const bundle = await build({
  entryPoints: [fileURLToPath(new URL('../src/lab/PreviewEngine.ts', import.meta.url))],
  bundle: true, format: 'esm', platform: 'node', write: false, logLevel: 'silent',
});
const { PreviewEngine } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const neutral = { dtS: 0.004, accelG: [0, 1, 0] };
const quiet = frame => {
  assert.equal(frame.events.length, 0);
  assert.ok(frame.channels.every(value => value === 0));
};

test('heartbeat named state, doublet events, all four channels and opposed tilt share production time', async () => {
  const engine = await PreviewEngine.create('heartbeat_soft_object');
  const initial = engine.snapshot();
  assert.equal(initial.family, 'Custom');
  assert.equal(initial.mass.heartbeat.enabled, true);
  assert.equal(initial.mass.heartbeat.bpm, 72);
  assert.equal(initial.mass.heartbeat.beatSequence, 0);
  quiet(initial);
  let primary = 0, secondary = 0, peak = 0, peakTilt = 0;
  for (let i = 0; i < 1500; ++i) {
    const frame = engine.step(neutral), pulse = frame.mass.heartbeat;
    assert.ok(pulse.phase >= 0 && pulse.phase < 1);
    assert.ok(pulse.primary >= 0 && pulse.primary <= 1);
    assert.ok(pulse.secondary >= 0 && pulse.secondary <= 0.580001);
    assert.ok(pulse.contraction >= 0 && pulse.contraction <= 1);
    assert.deepEqual(frame.mass.posNorm, [0, 0]);
    assert.ok(frame.mass.wallContact.every(value => value === 0));
    for (const event of frame.events) {
      assert.equal(event.name, 'heartbeat_pulse');
      assert.equal(event.type, 8);
      assert.equal(event.wall, 255, 'a beat is not a fabricated wall hit');
      if (event.amplitude > 0.8) ++primary; else ++secondary;
    }
    assert.ok(frame.drive.low.every(value => value === frame.drive.low[0]));
    assert.ok(Math.abs(frame.tilt.thumbDeg + frame.tilt.indexDeg) < 1e-6);
    peak = Math.max(peak, ...frame.channels);
    peakTilt = Math.max(peakTilt, Math.abs(frame.tilt.thumbDeg));
  }
  assert.equal(primary, 8);
  assert.equal(secondary, 7);
  assert.ok(peak > 0.1 && peakTilt > 3);
});

test('heartbeat reset/gap stays quiet and starts a new source epoch without a backlog', async () => {
  const engine = await PreviewEngine.create('heartbeat_soft_object');
  for (let i = 0; i < 70; ++i) engine.step(neutral);
  assert.ok(engine.snapshot().mass.heartbeat.beatSequence > 0);
  const gap = engine.step({ ...neutral, dtS: 0.2 });
  quiet(gap);
  assert.equal(gap.mass.heartbeat.phase, 0);
  assert.equal(gap.mass.heartbeat.beatSequence, 0);
  for (let i = 0; i < 10; ++i) quiet(engine.step(neutral));
  engine.reset();
  assert.equal(engine.snapshot().timeS, 0);
  assert.equal(engine.snapshot().mass.heartbeat.phase, 0);
  quiet(engine.snapshot());
});

test('heartbeat preview parameters are bounded, reset shared state, and ordinary presets stay opted out', async () => {
  const engine = await PreviewEngine.create('heartbeat_soft_object');
  for (const bpm of [40, 72, 140]) {
    engine.setParam('heartbeat.bpm', bpm);
    assert.equal(engine.snapshot().mass.heartbeat.bpm, bpm);
    assert.equal(engine.snapshot().mass.heartbeat.phase, 0);
  }
  for (const invalid of [39.9, 140.1, NaN, Infinity]) {
    const before = engine.snapshot();
    assert.throws(() => engine.setParam('heartbeat.bpm', invalid));
    assert.deepEqual(engine.snapshot(), before);
  }
  for (const preset of ['liquid_small_box', 'granular_single_marble_box', 'granular_coin_box', 'liquid_soda_bottle', 'granular_sand_pile_box']) {
    const ordinary = await PreviewEngine.create(preset);
    assert.equal(ordinary.snapshot().mass.heartbeat.enabled, false);
    for (let i = 0; i < 400; ++i) {
      const frame = ordinary.step(neutral);
      assert.equal(frame.mass.heartbeat.enabled, false);
      assert.ok(frame.events.every(event => event.type !== 8));
    }
  }
});
