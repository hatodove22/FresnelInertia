import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { axisDefinitions, parameterDefinitions, tiltParameterDefinitions, normalizedParameterValues,
  fixedParameterValues, SAND_FRICTION_RATIO } from '../src/tuning/TuningParameterSpace.ts';

const tiltPaths = ['tilt.max_tilt_deg', 'tilt.k_cm', 'tilt.k_tau', 'tilt.k_phi'];
const pathsFor = demo => ['resonance.master_gain', ...(demo === 'sand'
  ? ['mass.granular_static_friction', 'mass.granular_dynamic_friction']
  : ['mass.damping_ratio_x', 'mass.damping_ratio_y']), ...tiltPaths];

test('physical definitions retain exact paths, order and ranges independently of session history', () => {
  assert.deepEqual(parameterDefinitions('water'), [
    { path: 'resonance.master_gain', min: .1, max: 1 },
    { path: 'mass.damping_ratio_x', min: .05, max: 1.5 },
    { path: 'mass.damping_ratio_y', min: .05, max: 1.5 },
  ]);
  assert.deepEqual(tiltParameterDefinitions(), [
    { path: tiltPaths[0], min: 0, max: 10 }, { path: tiltPaths[1], min: 0, max: 1 },
    { path: tiltPaths[2], min: 0, max: 1 }, { path: tiltPaths[3], min: 0, max: 8 },
  ]);
  for (const demo of ['water', 'marble', 'sand'])
    assert.deepEqual(parameterDefinitions('combined', demo).map(value => value.path), pathsFor(demo));
  assert.deepEqual(parameterDefinitions('combined', 'sand').slice(1, 3), [
    { path: 'mass.granular_static_friction', min: .2, max: .9 },
    { path: 'mass.granular_dynamic_friction', min: .2 * (7 / 11), max: .9 * (7 / 11) },
  ]);
  assert.deepEqual(SAND_FRICTION_RATIO, { numerator: 7, denominator: 11 });
});

test('mapping preserves the previous floating-point expressions and insertion order, including endpoints', () => {
  for (const demo of ['water', 'marble', 'sand']) for (const coordinate of [0, Number.EPSILON, .123456789, .5, 1 - Number.EPSILON, 1]) {
    const point = [coordinate, coordinate, 1 - coordinate, coordinate / 3, coordinate * .7];
    const material = demo === 'sand' ? .2 + point[1] * (.9 - .2) : .05 + point[1] * (1.5 - .05);
    const expected = {
      'resonance.master_gain': .1 + point[0] * (1 - .1),
      ...(demo === 'sand' ? { 'mass.granular_static_friction': material, 'mass.granular_dynamic_friction': material * (7 / 11) }
        : { 'mass.damping_ratio_x': material, 'mass.damping_ratio_y': material }),
      'tilt.max_tilt_deg': point[2] * 10, 'tilt.k_cm': point[3], 'tilt.k_tau': point[4], 'tilt.k_phi': 3.2,
    };
    const values = normalizedParameterValues(point, { space: 'combined', demo, fixed: { 'tilt.k_phi': 3.2 } });
    assert.deepEqual(values, expected);
    assert.deepEqual(Object.keys(values), pathsFor(demo));
    if (demo === 'water') assert.deepEqual(normalizedParameterValues(point.slice(0, 2)),
      Object.fromEntries(Object.entries(expected).slice(0, 3)));
  }
});

test('definitions and mapped values are detached; malformed normalized or fixed inputs remain rejected', () => {
  const axes = axisDefinitions('combined', 'sand');
  axes[1].paths[0] = 'changed'; axes[1].pathScale['mass.granular_dynamic_friction'] = 12; axes[0].max = 99;
  const limits = parameterDefinitions('combined', 'water'); limits[0].min = -1;
  const tilt = tiltParameterDefinitions(); tilt[0].max = 99;
  assert.equal(axisDefinitions('combined', 'sand')[1].paths[0], 'mass.granular_static_friction');
  assert.equal(axisDefinitions('combined', 'sand')[1].pathScale['mass.granular_dynamic_friction'], 7 / 11);
  assert.equal(parameterDefinitions('combined', 'water')[0].min, .1);
  assert.equal(tiltParameterDefinitions()[0].max, 10);
  const context = { space: 'combined', demo: 'water', fixed: { 'tilt.k_phi': 4 } };
  const first = normalizedParameterValues([.5, .5, .5, .5, .5], context); first['tilt.k_phi'] = 6;
  assert.equal(context.fixed['tilt.k_phi'], 4);
  for (const point of [[], new Array(5), [0, 0, 0, 0, NaN], [0, 0, 0, 0, Infinity], [0, 0, 0, 0, '0'], [0, 0, 0, 0, 1.01]])
    assert.throws(() => normalizedParameterValues(point, context), /normalized/);
  for (const fixed of [null, [], {}, { 'tilt.k_phi': 0 }, { 'tilt.k_phi': 9 }, { 'tilt.k_phi': NaN }, { 'tilt.k_phi': 4, extra: 1 }])
    assert.throws(() => fixedParameterValues(fixed), /fixed/);
  assert.throws(() => axisDefinitions('water', 'sand'), /legacy water/);
  assert.throws(() => axisDefinitions('combined', 'unknown'), /demo/);
});

test('parameter, portable-profile and transport/ordinary-demo graphs do not import sessions or an optimizer', async () => {
  for (const path of ['tuning/TuningParameterSpace', 'tuning/TuningProfile', 'link/HapticLink', 'deviceDemo']) {
    const result = await build({ entryPoints: [fileURLToPath(new URL(`../src/${path}.ts`, import.meta.url))],
      bundle: true, platform: 'browser', format: 'esm', write: false, metafile: true, logLevel: 'silent' });
    assert.ok(!Object.keys(result.metafile.inputs).some(input => /(?:TuningSession|PreferenceOptimizer|ProfileFromSession)\.ts$/.test(input)), path);
  }
});
