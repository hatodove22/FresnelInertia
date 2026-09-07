import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { Vector3 } from 'three';

async function bundled(path) {
  const result = await build({ entryPoints: [fileURLToPath(new URL(path, import.meta.url))],
    bundle: true, format: 'esm', platform: 'node', write: false, logLevel: 'silent' });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
}
const { sourceTimeStep, MAX_PRESENTATION_GAP_S } = await bundled('../src/SourceTime.ts');
const { LiquidSlosh } = await bundled('../src/renderer/LiquidSlosh.ts');
const { SolidDepthMotion } = await bundled('../src/renderer/SolidDepthMotion.ts');
const { SandSurfaceFlow } = await bundled('../src/renderer/SandSurfaceFlow.ts');

test('source time distinguishes missing, first and duplicate samples without coercion', () => {
  for (const current of [undefined, NaN, Infinity, -Infinity, null, '1']) {
    assert.deepEqual(sourceTimeStep(0, current), { kind: 'missing', timeS: undefined, elapsedS: 0 });
  }
  for (const previous of [undefined, NaN, Infinity]) {
    assert.deepEqual(sourceTimeStep(previous, 1), { kind: 'initial', timeS: 1, elapsedS: 0 });
  }
  assert.deepEqual(sourceTimeStep(1, 1), { kind: 'duplicate', timeS: 1, elapsedS: 0 });
  assert.deepEqual(sourceTimeStep(-0, 0), { kind: 'duplicate', timeS: 0, elapsedS: 0 });
});

test('exactly half a second still advances; gaps and rewinds retain the original delta', () => {
  assert.equal(MAX_PRESENTATION_GAP_S, 0.5);
  for (const current of [Number.MIN_VALUE, 0.1, 0.5]) {
    assert.deepEqual(sourceTimeStep(0, current), { kind: 'advance', timeS: current, elapsedS: current });
  }
  assert.deepEqual(sourceTimeStep(0, 0.5000001), { kind: 'gap', timeS: 0.5000001, elapsedS: 0.5000001 });
  assert.deepEqual(sourceTimeStep(2, 1), { kind: 'rewind', timeS: 1, elapsedS: -1 });
});

test('classification is stateless and does not infer source identity or millisecond wrap', () => {
  const expected = sourceTimeStep(3, 3.25);
  sourceTimeStep(undefined, 90);
  sourceTimeStep(90, undefined);
  sourceTimeStep(90, 1);
  assert.deepEqual(sourceTimeStep(3, 3.25), expected);
  assert.equal(sourceTimeStep(-1, -0.75).kind, 'advance', 'finite negative time remains a consumer policy');
  assert.equal(sourceTimeStep(0xffffffff / 1000, 0).kind, 'rewind', 'device wrap adaptation is a separate contract');
});

test('missing-time policy stays material-owned: water holds its baseline; marble clears it', () => {
  const input = { timeS: 0, normal: new Vector3(0, 1, 0), massX: 0, massY: -0.4,
    velocityX: 0, velocityY: 0, activity: 0, fill: 0.5, viscosity: 0.12 };
  const state = result => ({ normal: result.normal.toArray(), activity: result.activity,
    flow: result.flow.toArray(), revision: result.revision, wave: result.displacement(0.2, -0.3) });
  const water = new LiquidSlosh(new Vector3(0.05, 0.05, 0.03));
  const continuous = new LiquidSlosh(new Vector3(0.05, 0.05, 0.03));
  const tilted = { ...input, timeS: 0.05, normal: new Vector3(0.4, 1, 0).normalize() };
  for (const model of [water, continuous]) { model.update(input); model.update(tilted); }
  const held = state(water.update(tilted));
  assert.deepEqual(state(water.update({ ...input, timeS: NaN })), held);
  assert.deepEqual(state(water.update({ ...tilted, timeS: 0.1 })), state(continuous.update({ ...tilted, timeS: 0.1 })));

  const marble = new SolidDepthMotion('marble');
  const motion = { timeS: 0, gravityZ: 0.6, supportG: 1, halfTravelM: 0.02, fill: 0.2 };
  marble.update(motion);
  assert.ok(marble.update({ ...motion, timeS: 0.05 }).offsetM > 0);
  assert.deepEqual(marble.update({ ...motion, timeS: undefined }), { offsetM: 0, velocityMps: 0 });
  assert.deepEqual(marble.update({ ...motion, timeS: 0.1 }), { offsetM: 0, velocityMps: 0 }, 'next sample is a fresh baseline');
});

test('sand validates geometry before duplicate detection and retains its deposit when quieted', () => {
  const sand = new SandSurfaceFlow(100);
  const input = { timeS: 0, widthM: 0.05, depthM: 0.03, heightM: 0.05,
    fill: 0.4, slope: 0.1, flow: 0.8, velocityX: 0.2 };
  const pose = () => sand.grains.map(({ u, v, rotation }) => ({ u, v, rotation }));
  sand.update(input); sand.update({ ...input, timeS: 0.05 });
  const held = pose(), relief = sand.displacement(0.1, 0.1);
  assert.ok(sand.grains.some(grain => grain.active > 0));
  sand.update({ ...input, timeS: 0.05, widthM: NaN });
  assert.ok(sand.grains.every(grain => grain.active === 0));
  assert.deepEqual(pose(), held); assert.equal(sand.displacement(0.1, 0.1), relief);
  sand.update({ ...input, timeS: 0.1 });
  assert.deepEqual(pose(), held, 'valid recovery establishes a new baseline without transport');
});
