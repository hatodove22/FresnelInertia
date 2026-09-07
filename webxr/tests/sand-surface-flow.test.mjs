import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

const bundled = await build({ entryPoints: [fileURLToPath(new URL('../src/renderer/SandSurfaceFlow.ts', import.meta.url))],
  bundle: true, format: 'esm', platform: 'node', write: false, logLevel: 'silent' });
const { SandSurfaceFlow } = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`);
const base = { timeS: 0, fill: 0.4, slope: 0, flow: 0, velocityX: 0, widthM: 0.05, depthM: 0.03, heightM: 0.05 };
const posed = surface => surface.grains.map(({ u, v, rotation, visibility }) => ({ u, v, rotation, visibility }));
const relief = surface => Array.from({ length: 33 * 23 }, (_, i) => surface.displacement((i % 33) / 32 - 0.5, Math.floor(i / 33) / 22 - 0.5));
const rms = values => Math.sqrt(values.reduce((sum, value) => sum + value * value, 0) / values.length);
const near = (a, b, tolerance = 1e-12) => assert.ok(Math.abs(a - b) <= tolerance, `${a} != ${b}`);
const run = (surface, flow = 0.8, direction = 1, seconds = 1, fps = 60, start = 0) => {
  for (let i = 1; i <= Math.round(seconds * fps); i++) surface.update({ ...base, timeS: start + i / fps, flow, velocityX: direction * 0.2 });
};

test('persistent seeded grains are finite and a static sloped pile does not animate by time alone', () => {
  const surface = new SandSurfaceFlow(), other = new SandSurfaceFlow();
  assert.equal(surface.grains.length, 900);
  assert.deepEqual(surface.grains, other.grains);
  const initial = posed(surface);
  surface.update({ ...base, slope: 1.1, flow: 1, velocityX: 2 });
  assert.deepEqual(posed(surface), initial, 'initial flowing snapshot is a baseline, not unseen playback');
  const revision = surface.revision;
  for (let i = 1; i <= 180; i++) surface.update({ ...base, timeS: i / 60, slope: i / 180 });
  assert.deepEqual(posed(surface), initial);
  assert.equal(surface.revision, revision);
  assert.ok(relief(surface).every(value => value === 0));
  assert.ok(surface.grains.every(grain => Object.values(grain).every(Number.isFinite) && Math.abs(grain.u) <= 0.5 && Math.abs(grain.v) <= 0.5));
});

test('only a local minority advects in one reported direction at 0.05–0.4 container widths per second', () => {
  for (const direction of [-1, 1]) {
    const surface = new SandSurfaceFlow(); surface.update(base);
    const initial = posed(surface);
    let previous = posed(surface), moving = new Set();
    for (let step = 1; step <= 120; step++) {
      surface.update({ ...base, timeS: step / 120, flow: 0.9, velocityX: direction * 0.2 });
      surface.grains.forEach((grain, i) => {
        assert.equal(grain.v, initial[i].v, 'there is no fore/aft material transport');
        const delta = grain.u - previous[i].u;
        if (grain.active > 0) {
          moving.add(i);
          const wrapped = delta * direction < -0.5 ? delta + direction : delta;
          assert.ok(wrapped * direction > 0, 'a flowing grain never follows a sine back toward its starting point');
          assert.ok(Math.abs(wrapped) * 120 >= 0.05 - 1e-10 && Math.abs(wrapped) * 120 <= 0.4 + 1e-10);
          assert.ok((grain.rotation - previous[i].rotation) * direction > 0);
        } else {
          assert.equal(grain.u, initial[i].u); assert.equal(grain.rotation, initial[i].rotation);
        }
      });
      previous = posed(surface);
    }
    assert.ok(moving.size > 900 * 0.10 && moving.size < 900 * 0.35, 'static majority surrounds narrow moving lanes');
  }
});

test('actual velocity owns transport sign; fresh slope change is a compatible fallback, not downhill slope', () => {
  const preferred = new SandSurfaceFlow(), fallback = new SandSurfaceFlow(), held = new SandSurfaceFlow();
  for (const surface of [preferred, fallback, held]) surface.update(base);
  preferred.update({ ...base, timeS: 0.1, flow: 1, slope: 0.2, velocityX: -0.2 });
  fallback.update({ ...base, timeS: 0.1, flow: 1, slope: 0.2, velocityX: 0 });
  held.update({ ...base, timeS: 0.1, flow: 1, slope: 0, velocityX: 0 });
  const initial = new SandSurfaceFlow();
  const index = preferred.grains.findIndex((grain, i) => grain.active > 0 && Math.abs(initial.grains[i].u) < 0.3);
  assert.ok(index >= 0);
  assert.ok(preferred.grains[index].u < initial.grains[index].u);
  assert.ok(fallback.grains[index].u > initial.grains[index].u, 'positive slope growth deposits toward positive x');
  assert.deepEqual(posed(held), posed(initial), 'unattributed flow cannot invent a direction from a stationary pile');
});

test('recycling is confined to faded edges, without visible cross-container teleporting', () => {
  const surface = new SandSurfaceFlow(); surface.update(base);
  let previous = posed(surface), wraps = 0;
  for (let i = 1; i <= 600; i++) {
    surface.update({ ...base, timeS: i / 120, flow: 1, velocityX: 1 });
    surface.grains.forEach((grain, index) => {
      assert.ok(grain.u >= -0.5 && grain.u <= 0.5 && grain.v >= -0.5 && grain.v <= 0.5);
      assert.ok(grain.visibility >= 0 && grain.visibility <= 1);
      if (grain.u - previous[index].u < -0.5) {
        wraps++;
        assert.ok(previous[index].visibility < 0.04 && grain.visibility < 0.04, 'both sides of a wrap are nearly invisible');
      }
    });
    previous = posed(surface);
  }
  assert.ok(wraps > 100, 'exercise repeated flow instead of stopping at the first wall');
});

test('small erosion/deposition follows the transport sign and rests exactly at zero flow', () => {
  for (const direction of [-1, 1]) {
    const surface = new SandSurfaceFlow(); surface.update(base); run(surface, 0.8, direction);
    const field = relief(surface), grains = posed(surface), revision = surface.revision;
    assert.ok(Math.min(...field) < -0.00001 && Math.max(...field) > 0.00001, 'moving surface contains erosion and deposition');
    assert.ok(surface.maxDisplacement < base.widthM * 0.05);
    assert.ok(field.every(value => Number.isFinite(value) && Math.abs(value) <= surface.maxDisplacement));
    let moment = 0;
    for (let z = 0; z <= 40; z++) for (let x = 0; x <= 60; x++) {
      const u = x / 60 - 0.5;
      moment += u * surface.displacement(u, z / 40 - 0.5);
    }
    assert.ok(moment * direction > 0, 'shallow relief is transported in the source direction');
    for (let i = 1; i <= 240; i++) surface.update({ ...base, timeS: 1 + i / 60, slope: 0.5 });
    assert.deepEqual(posed(surface), grains); assert.deepEqual(relief(surface), field);
    assert.equal(surface.revision, revision, 'no hidden settling or oscillation clock continues at rest');
    assert.ok(surface.grains.every(grain => grain.active === 0));
  }
});

test('source duplicate, missing clock and gap hold; rewind and changed dimensions reset without catch-up', () => {
  const surface = new SandSurfaceFlow(); surface.update(base); run(surface);
  const grains = posed(surface), field = relief(surface), revision = surface.revision;
  for (let i = 0; i < 10; i++) surface.update({ ...base, timeS: 1, flow: 1, velocityX: -1, slope: -3 });
  assert.deepEqual(posed(surface), grains); assert.deepEqual(relief(surface), field); assert.equal(surface.revision, revision);
  surface.update({ ...base, timeS: undefined, flow: 1, velocityX: 1 });
  surface.update({ ...base, timeS: 10, flow: 1, velocityX: 1 });
  assert.deepEqual(posed(surface), grains); assert.deepEqual(relief(surface), field);
  surface.update({ ...base, timeS: 12, flow: 1, velocityX: 1 });
  assert.deepEqual(posed(surface), grains); assert.deepEqual(relief(surface), field);
  surface.update({ ...base, timeS: 0, flow: 1, velocityX: 1 });
  assert.deepEqual(posed(surface), posed(new SandSurfaceFlow())); assert.ok(relief(surface).every(value => value === 0));
  run(surface);
  surface.update({ ...base, timeS: 1.1, flow: 1, velocityX: 1, widthM: 0.08 });
  assert.deepEqual(posed(surface), posed(new SandSurfaceFlow())); assert.ok(relief(surface).every(value => value === 0));
});

test('stronger source flow travels farther and source sample rates share the same motion', () => {
  const distances = [];
  for (const flow of [0.1, 1]) {
    const surface = new SandSurfaceFlow(); surface.update(base);
    const initial = posed(surface); run(surface, flow, 1, 0.3);
    const i = surface.grains.findIndex((grain, index) => grain.active > 0 && Math.abs(initial[index].u) < 0.1);
    distances.push(surface.grains[i].u - initial[i].u);
  }
  assert.ok(distances[1] > distances[0] * 1.7);
  let reference;
  for (const fps of [10, 30, 60, 120]) {
    const surface = new SandSurfaceFlow(); surface.update(base); run(surface, 0.65, 1, 1, fps);
    if (reference) {
      surface.grains.forEach((grain, i) => { near(grain.u, reference.grains[i].u, 1e-11); near(grain.rotation, reference.grains[i].rotation, 1e-10); });
      const expected = relief(reference), current = relief(surface);
      assert.ok(rms(current.map((value, i) => value - expected[i])) < 0.000002);
    } else reference = surface;
  }
});

test('empty, invalid and extreme inputs cannot create non-finite grains or unbounded relief', () => {
  const surface = new SandSurfaceFlow(); surface.update(base); run(surface);
  for (const override of [{ timeS: NaN }, { slope: NaN }, { widthM: Infinity }, { heightM: 0 }, { fill: NaN }, { flow: NaN, velocityX: NaN }]) {
    surface.update({ ...base, timeS: 2, ...override });
    assert.ok(surface.grains.every(grain => Object.values(grain).every(Number.isFinite)));
    assert.ok(relief(surface).every(value => Number.isFinite(value) && Math.abs(value) <= surface.maxDisplacement));
  }
  surface.update({ ...base, timeS: 3, fill: 0 });
  const empty = posed(surface), revision = surface.revision;
  for (let i = 1; i <= 10; i++) surface.update({ ...base, timeS: 3 + i / 10, fill: 0 });
  assert.deepEqual(posed(surface), empty); assert.equal(surface.maxDisplacement, 0); assert.equal(surface.revision, revision);
  assert.equal(surface.displacement(NaN, 0), 0); assert.equal(surface.displacement(0, Infinity), 0); assert.equal(surface.displacement(1, 0), 0);
});
