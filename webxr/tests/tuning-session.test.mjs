import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

const bundled = await build({ entryPoints: [fileURLToPath(new URL('../src/tuning/TuningSession.ts', import.meta.url))],
  bundle: true, format: 'esm', platform: 'node', write: false, logLevel: 'silent' });
const { createSession, nextTrial, recordChoice, parseSession, parameterValues, MAX_SESSION_HISTORY,
  getSessionSpace, getSessionDemo, getSessionPreset, demoDefinitions, axisDefinitions } =
  await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`);
const create = (seed = 173, mode = 'rehearsal') => createSession(mode, [0.4, 0.5], '軽快に転がる', '手元のビー玉', seed);
const clone = state => JSON.parse(JSON.stringify(state));
const persisted = state => parseSession(JSON.stringify(state), state.mode);
const samePoint = (a, b) => a.every((value, index) => value === b[index]);
const combinedFixed = { 'tilt.k_phi': 4 };
const createV2 = (seed = 177, mode = 'rehearsal') => createSession(mode,
  [0.4, 0.5, 0.6, 0.3, 0.5], '振動と傾きを合わせた実物らしさ', '', seed,
  { space: 'combined', fixed: combinedFixed });
const createV3 = (demo = 'water', seed = 177, mode = 'rehearsal') => createSession(mode,
  [0.4, 0.5, 0.6, 0.3, 0.5], '振動と傾きを合わせた実物らしさ', '', seed,
  { space: 'combined', fixed: combinedFixed, demo });

test('normalized axes return only the exact bounded three physical parameter paths', () => {
  assert.deepEqual(parameterValues([0, 0]), { 'resonance.master_gain': 0.1, 'mass.damping_ratio_x': 0.05, 'mass.damping_ratio_y': 0.05 });
  assert.deepEqual(parameterValues([1, 1]), { 'resonance.master_gain': 1, 'mass.damping_ratio_x': 1.5, 'mass.damping_ratio_y': 1.5 });
  for (const point of [[-0.001, 0], [0, 1.001], [0.5], [0, 0, 0], [NaN, 0], [Infinity, 0], ['0', 0], new Array(2)])
    assert.throws(() => parameterValues(point), /normalized/);
});

test('first and subsequent seeded proposals are reproducible; in-progress next is idempotent and persisted unchanged', () => {
  let a = create(), b = create();
  assert.deepEqual(a.trial, b.trial);
  assert.deepEqual(nextTrial(a), a);
  assert.deepEqual(persisted(a), a);
  for (const choice of ['b', 'tie', 'skip', 'a', 'b']) {
    a = recordChoice(a, choice); b = recordChoice(b, choice);
    assert.deepEqual(a.trial, b.trial);
    assert.deepEqual(a.observations, b.observations);
    assert.deepEqual(a.incumbent, b.incumbent);
    assert.deepEqual(persisted(a), a);
    assert.ok(a.trial.a.every(value => value >= 0 && value <= 1) && a.trial.b.every(value => value >= 0 && value <= 1));
    assert.ok(!samePoint(a.trial.a, a.trial.b));
  }
});

test('A/B position is seeded independently: the incumbent can be either label', () => {
  const orders = new Set();
  for (let seed = 0; seed < 12; seed++) {
    const state = create(seed);
    orders.add(samePoint(state.trial.a, state.incumbent) ? 'a' : 'b');
  }
  assert.deepEqual([...orders].sort(), ['a', 'b']);
});

test('skip records no preference; tie is genuine evidence; notes never affect the optimizer', () => {
  const original = create(), saved = clone(original);
  const skipped = recordChoice(original, 'skip', '操作ミスで比較できず');
  assert.deepEqual(original, saved, 'choice must not mutate the persisted active pair');
  assert.equal(skipped.observations.length, 0);
  assert.deepEqual(skipped.incumbent, original.incumbent);
  assert.equal(skipped.history[0].choice, 'skip');
  assert.equal(skipped.history[0].note, '操作ミスで比較できず');
  const tied = recordChoice(original, 'tie', '区別できない');
  assert.equal(tied.observations.length, 1);
  assert.equal(tied.observations[0].preference, 'tie');
  assert.deepEqual(tied.incumbent, original.incumbent);
  assert.deepEqual(persisted(tied), tied);
  assert.deepEqual(recordChoice(original, 'a', '説明A').trial, recordChoice(original, 'a', '説明B').trial);
  assert.throws(() => recordChoice(original, 'unknown'), /unknown choice/);
  assert.throws(() => recordChoice(original, undefined), /unknown choice/);
});

test('winner becomes incumbent and every nested transition/import object is detached', () => {
  const state = create(), saved = clone(state), chosen = [...state.trial.b];
  const next = recordChoice(state, 'b');
  assert.deepEqual(next.incumbent, chosen);
  assert.ok(samePoint(next.trial.a, chosen) || samePoint(next.trial.b, chosen));
  next.history[0].trial.b[0] = 0.123;
  next.observations[0].b[1] = 0.234;
  next.baseline[0] = 0.345;
  assert.deepEqual(state, saved);
  const copy = nextTrial(state);
  copy.trial.a[0] = 0.987; copy.incumbent[0] = 0.876;
  assert.deepEqual(state, saved);
  const parsed = persisted(state);
  parsed.trial.a[0] = 0.765;
  assert.deepEqual(state, saved);
});

test('rehearsal/device imports are isolated and serializable state cannot silently change modes', () => {
  for (const mode of ['rehearsal', 'device']) {
    const state = create(101, mode), json = JSON.stringify(state);
    assert.deepEqual(parseSession(json, mode), state);
    assert.equal(parseSession(json).mode, mode);
    assert.throws(() => parseSession(json, mode === 'device' ? 'rehearsal' : 'device'), /mode/);
  }
  assert.throws(() => createSession('practice', [0, 0], '', ''), /mode/);
});

test('strict imports reject corrupted schema, summary/history mismatches and prototype fields', () => {
  const state = recordChoice(recordChoice(create(), 'b', '選択'), 'skip');
  const mutations = [
    value => { value.version = 2; },
    value => { value.extra = true; },
    value => { delete value.reference; },
    value => { value.seed = -1; },
    value => { value.seed = 2 ** 32; },
    value => { value.baseline = [0, 2]; },
    value => { value.baseline = [0, null]; },
    value => { value.incumbent = [0.011, 0.012]; },
    value => { value.observations = []; },
    value => { value.observations[0].preference = 'tie'; },
    value => { value.observations[0].a = [0, 0]; },
    value => { value.history[0].choice = 'unknown'; },
    value => { value.history[1].trial.id = 1; },
    value => { value.history[0].trial.a = [0.02, 0.03]; value.history[0].trial.b = [0.04, 0.05]; },
    value => { value.history[0].at = 'not-a-date'; },
    value => { value.history[1].at = '2000-01-01T00:00:00.000Z'; },
    value => { value.trial.id++; },
    value => { value.trial.a = value.trial.b; },
    value => { value.trial = null; },
    value => { value.history[0].note = 'x'.repeat(301); }
  ];
  for (const mutate of mutations) {
    const modified = clone(state); mutate(modified);
    assert.throws(() => parseSession(JSON.stringify(modified)), /Invalid tuning session/);
  }
  assert.throws(() => parseSession(JSON.stringify(state).replace('"version":1', '"__proto__":{},"version":1')), /unknown fields/);
  assert.throws(() => parseSession(JSON.stringify(state).replace('"choice":"b"', '"constructor":{},"choice":"b"')), /unknown fields/);
  assert.throws(() => nextTrial(Object.assign(Object.create({ polluted: true }), state)), /plain object/);
  assert.throws(() => parseSession('{broken'), /malformed JSON/);
  assert.throws(() => parseSession('null'), /plain object/);
});

test('text, seed, history and UTF-8 import size are bounded; 60 comparisons end without another proposal', () => {
  assert.throws(() => createSession('rehearsal', [0.4, 0.5], 'x'.repeat(301), ''), /at most 300/);
  assert.throws(() => createSession('rehearsal', [0.4, 0.5], '', 'x'.repeat(301)), /at most 300/);
  for (const seed of [-1, 0.5, NaN, Infinity, 2 ** 32]) assert.throws(() => create(seed), /seed/);
  assert.throws(() => parseSession(' '.repeat(1024 * 1024 + 1)), /1 MiB/);
  assert.throws(() => parseSession('砂'.repeat(400000)), /1 MiB/);
  let state = create(777);
  for (let index = 0; index < MAX_SESSION_HISTORY; index++) state = recordChoice(state, 'skip');
  assert.equal(state.history.length, 60);
  assert.equal(state.observations.length, 0);
  assert.equal(state.trial, null);
  assert.deepEqual(persisted(state), state);
  assert.deepEqual(nextTrial(state), state);
  assert.throws(() => recordChoice(state, 'a'), /no active comparison/);
  const overflow = clone(state); overflow.history.push(clone(overflow.history[59]));
  assert.throws(() => parseSession(JSON.stringify(overflow)), /history exceeds/);
});

test('a full 60-vote learned session remains bounded, replayable and retains its baseline', () => {
  let state = create(909);
  const baseline = [...state.baseline];
  for (let index = 0; index < MAX_SESSION_HISTORY; index++) {
    const before = state, pair = clone(state.trial);
    const selected = index % 7 === 0 ? 'tie' : pair.a[0] + pair.a[1] > pair.b[0] + pair.b[1] ? 'a' : 'b';
    state = recordChoice(state, selected);
    assert.deepEqual(before.trial, pair);
    assert.deepEqual(state.baseline, baseline);
  }
  assert.equal(state.observations.length, 60);
  assert.equal(state.history.length, 60);
  assert.equal(state.trial, null);
  assert.deepEqual(persisted(state), state);
});

test('legacy v1 remains a two-axis session and never invents tilt values when resumed', () => {
  let state = create(173);
  for (const choice of ['b', 'tie', 'skip']) state = recordChoice(state, choice);
  const loaded = persisted(state);
  assert.equal(loaded.version, 1);
  assert.equal(getSessionSpace(loaded), 'water');
  assert.equal(Object.hasOwn(loaded, 'space'), false);
  assert.equal(Object.hasOwn(loaded, 'fixed'), false);
  assert.deepEqual(loaded, state);
  assert.deepEqual(parameterValues(loaded.trial.a, loaded), parameterValues(loaded.trial.a));
  assert.deepEqual(Object.keys(parameterValues(loaded.baseline, loaded)),
    ['resonance.master_gain', 'mass.damping_ratio_x', 'mass.damping_ratio_y']);
  const next = recordChoice(loaded, 'a');
  assert.equal(next.version, 1);
  assert.equal(next.trial.a.length, 2);
  assert.throws(() => parameterValues([0, 0, 0], loaded), /normalized/);
  const invalid = clone(loaded); invalid.space = 'combined'; invalid.fixed = combinedFixed;
  assert.throws(() => parseSession(JSON.stringify(invalid)), /unknown fields/);
});

test('v2 jointly maps all five vibration/material/tilt axes and keeps only phi fixed', () => {
  const state = createV2();
  assert.equal(state.version, 2);
  assert.equal(getSessionSpace(state), 'combined');
  assert.equal(state.trial.a.length, 5);
  assert.equal(state.trial.b.length, 5);
  assert.deepEqual(state.fixed, combinedFixed);
  assert.deepEqual(parameterValues([0, 0, 0, 0, 0], state), { ...combinedFixed,
    'resonance.master_gain': 0.1, 'mass.damping_ratio_x': 0.05, 'mass.damping_ratio_y': 0.05,
    'tilt.max_tilt_deg': 0, 'tilt.k_cm': 0, 'tilt.k_tau': 0 });
  assert.deepEqual(parameterValues([1, 1, 1, 1, 1], state), { ...combinedFixed,
    'resonance.master_gain': 1, 'mass.damping_ratio_x': 1.5, 'mass.damping_ratio_y': 1.5,
    'tilt.max_tilt_deg': 10, 'tilt.k_cm': 1, 'tilt.k_tau': 1 });
  const values = parameterValues([0.2, 0.8, 0.25, 0.5, 0.75], state);
  assert.deepEqual(Object.keys(values), ['resonance.master_gain', 'mass.damping_ratio_x', 'mass.damping_ratio_y',
    'tilt.max_tilt_deg', 'tilt.k_cm', 'tilt.k_tau', 'tilt.k_phi']);
  assert.equal(values['resonance.master_gain'], 0.1 + 0.2 * 0.9);
  assert.equal(values['mass.damping_ratio_x'], 0.05 + 0.8 * 1.45);
  assert.equal(values['mass.damping_ratio_y'], values['mass.damping_ratio_x']);
  assert.equal(values['tilt.max_tilt_deg'], 2.5);
  assert.equal(values['tilt.k_cm'], 0.5);
  assert.equal(values['tilt.k_tau'], 0.75);
  assert.equal(values['tilt.k_phi'], 4);
  assert.equal(Object.hasOwn(values, 'tilt.max_total_cmd_deg'), false, 'the independent physical command bound is not explored');
  assert.deepEqual(axisDefinitions('combined').map(axis => [axis.key, axis.min, axis.max]),
    [['resonance.master_gain', 0.1, 1], ['mass.damping_ratio_x', 0.05, 1.5],
      ['tilt.max_tilt_deg', 0, 10], ['tilt.k_cm', 0, 1], ['tilt.k_tau', 0, 1]]);
  assert.deepEqual(axisDefinitions('water').map(axis => [axis.key, axis.min, axis.max]),
    [['resonance.master_gain', 0.1, 1], ['mass.damping_ratio_x', 0.05, 1.5]]);
  const definitions = axisDefinitions('combined'); definitions[2].max = 999; definitions[3].paths[0] = 'tilt.max_total_cmd_deg';
  assert.equal(axisDefinitions('combined')[2].max, 10);
  assert.equal(axisDefinitions('combined')[3].paths[0], 'tilt.k_cm');
  assert.throws(() => parameterValues([0, 0], state), /normalized/);
  assert.throws(() => parameterValues([0, 0, 0, 0, 1.001], state), /normalized/);
  assert.throws(() => parameterValues(new Array(5), state), /normalized/);
  assert.throws(() => axisDefinitions('tilt'), /space/);
  assert.throws(() => axisDefinitions('other'), /space/);
  assert.deepEqual(persisted(state), state);
});

test('v2 seeded joint proposals and all five coordinates survive mode-specific in-progress roundtrips', () => {
  for (const mode of ['rehearsal', 'device']) {
    let state = createV2(715, mode), other = createV2(715, mode);
    const fixed = clone(state.fixed), baseline = [...state.baseline];
    for (const chosen of ['b', 'tie', 'skip', 'a', 'b']) {
      const saved = clone(state);
      assert.deepEqual(nextTrial(state), state, 'next does not replace the in-progress pair');
      state = recordChoice(state, chosen); other = recordChoice(other, chosen);
      assert.deepEqual(state.trial, other.trial);
      assert.deepEqual(state.fixed, fixed);
      assert.deepEqual(state.baseline, baseline);
      assert.deepEqual(persisted(state), state);
      assert.equal(state.trial.a.length, 5);
      assert.equal(state.trial.b.length, 5);
      for (const candidate of [state.trial.a, state.trial.b]) {
        const parameters = parameterValues(candidate, state);
        assert.equal(Object.keys(parameters).length, 7);
        for (const [path, value] of Object.entries(fixed)) assert.equal(parameters[path], value);
      }
      assert.deepEqual(saved.fixed, fixed);
      assert.throws(() => parseSession(JSON.stringify(state), mode === 'device' ? 'rehearsal' : 'device'), /mode/);
    }
    const copied = persisted(state); copied.fixed['tilt.k_phi'] = 2;
    assert.deepEqual(state.fixed, fixed, 'imported fixed context does not alias its source');
    const next = recordChoice(state, 'skip'); next.fixed['tilt.k_phi'] = 1;
    assert.deepEqual(state.fixed, fixed, 'transitions deep-copy fixed context too');
  }
  const mutable = { space: 'combined', fixed: { ...combinedFixed } };
  const state = createSession('rehearsal', [0.4, 0.5, 0.6, 0.3, 0.5], '', '', 42, mutable);
  mutable.fixed['tilt.k_phi'] = 0.2;
  assert.equal(state.fixed['tilt.k_phi'], 4);
});

test('v2 rejects split spaces, wrong dimensions, missing/unknown fixed values and inconsistent fifth coordinates', () => {
  const state = recordChoice(recordChoice(createV2(), 'b'), 'tie');
  const mutations = [
    value => { value.version = 3; },
    value => { delete value.space; },
    value => { value.space = 'unknown'; },
    value => { value.space = 'water'; },
    value => { value.space = 'tilt'; },
    value => { delete value.fixed; },
    value => { delete value.fixed['tilt.k_phi']; },
    value => { value.fixed['tilt.max_total_cmd_deg'] = 10; },
    value => { value.fixed['tilt.k_cm'] = 0.5; },
    value => { value.fixed['resonance.master_gain'] = 0.48; },
    value => { value.fixed['mass.damping_ratio_y'] = 0.35; },
    value => { value.fixed['tilt.k_phi'] = 8.01; },
    value => { value.fixed['tilt.k_phi'] = 0; },
    value => { value.fixed['tilt.k_phi'] = null; },
    value => { value.fixed['tilt.k_phi'] = '4'; },
    value => { value.baseline.pop(); },
    value => { value.trial.b.pop(); },
    value => { value.observations[0].a.pop(); },
    value => { value.history[0].trial.b.pop(); },
    value => { value.incumbent[4] = 0.123456789; },
    value => { value.observations[0].a[4] = 0.123456789; },
    value => { value.history[0].trial.a[4] = 0.111; value.history[0].trial.b[4] = 0.222; },
  ];
  for (const mutate of mutations) {
    const modified = clone(state); mutate(modified);
    assert.throws(() => parseSession(JSON.stringify(modified)), /Invalid tuning session/);
  }
  const badOptions = [
    { space: 'combined' }, { space: 'combined', fixed: combinedFixed, other: true },
    { space: 'combined', fixed: { 'tilt.k_phi': NaN } },
    { space: 'combined', fixed: { 'tilt.k_phi': Infinity } },
    { space: 'combined', fixed: { 'tilt.k_phi': 0 } },
    { space: 'combined', fixed: { 'tilt.k_phi': 8.01 } },
    { space: 'water', fixed: combinedFixed }, { space: 'tilt', fixed: combinedFixed },
  ];
  for (const options of badOptions)
    assert.throws(() => createSession('rehearsal', [0, 0, 0, 0, 0], '', '', 5, options), /Invalid tuning session/);
  assert.throws(() => parseSession(JSON.stringify(state).replace('"fixed":{', '"fixed":{"__proto__":{},')), /unknown fields/);
});

test('a full learned 5D combined session finishes at 60 without changing the fixed multiplier', () => {
  let state = createV2(238);
  const fixed = clone(state.fixed);
  for (let index = 0; index < MAX_SESSION_HISTORY; index++) {
    const pair = state.trial;
    const utility = point => -point.reduce((sum, value, axis) => sum + (value - [0.7, 0.3, 0.5, 0.35, 0.7][axis]) ** 2, 0) -
      2 * (point[0] * point[2] - 0.35) ** 2 - (point[1] * point[3] - 0.105) ** 2;
    state = recordChoice(state, index % 9 === 0 ? 'tie' : utility(pair.a) > utility(pair.b) ? 'a' : 'b');
  }
  assert.equal(state.trial, null);
  assert.equal(state.history.length, 60);
  assert.equal(state.observations.length, 60);
  assert.deepEqual(state.fixed, fixed);
  assert.deepEqual(persisted(state), state);
  assert.equal(Object.keys(parameterValues(state.incumbent, state)).length, 7);
});

test('v3 material context selects the exact representative preset; legacy sessions remain water', () => {
  assert.deepEqual(demoDefinitions.map(({ id, preset }) => [id, preset]), [
    ['water', 'liquid_small_box'], ['marble', 'granular_single_marble_box'], ['sand', 'granular_sand_pile_box'],
  ]);
  for (const definition of demoDefinitions) {
    const state = createV3(definition.id);
    assert.equal(state.version, 3);
    assert.equal(getSessionSpace(state), 'combined');
    assert.equal(getSessionDemo(state), definition.id);
    assert.equal(getSessionPreset(state), definition.preset);
    assert.equal(state.trial.a.length, 5);
    assert.equal(state.history.length, 0);
    assert.equal(state.observations.length, 0);
    assert.deepEqual(persisted(state), state);
  }
  for (const old of [create(), createV2()]) {
    assert.equal(getSessionDemo(old), 'water');
    assert.equal(getSessionPreset(old), 'liquid_small_box');
    assert.equal(Object.hasOwn(persisted(old), 'demo'), false, 'old files are not silently migrated');
    const unexpectedDemo = { ...clone(old), demo: 'sand' };
    assert.throws(() => parseSession(JSON.stringify(unexpectedDemo)), /unknown fields/);
  }
  assert.deepEqual(parameterValues(createV2().baseline, createV2()), parameterValues(createV3('water').baseline, createV3('water')));
});

test('v3 sand explores effective coupled friction, not unused pile damping; water and marble retain damping', () => {
  const sand = createV3('sand'), sandAxis = axisDefinitions('combined', 'sand')[1];
  assert.deepEqual(sandAxis, { key: 'mass.granular_static_friction', label: '砂の流れにくさ', min: 0.2, max: 0.9,
    paths: ['mass.granular_static_friction', 'mass.granular_dynamic_friction'], pathScale: { 'mass.granular_dynamic_friction': 7 / 11 } });
  for (const coordinate of [0, 0.25, 0.5, 0.75, 1]) {
    const values = parameterValues([0.4, coordinate, 0.6, 0.3, 0.5], sand);
    assert.deepEqual(Object.keys(values), ['resonance.master_gain', 'mass.granular_static_friction', 'mass.granular_dynamic_friction',
      'tilt.max_tilt_deg', 'tilt.k_cm', 'tilt.k_tau', 'tilt.k_phi']);
    assert.equal(values['mass.granular_static_friction'], 0.2 + coordinate * (0.9 - 0.2));
    assert.equal(values['mass.granular_dynamic_friction'], values['mass.granular_static_friction'] * (7 / 11));
    assert.ok(values['mass.granular_dynamic_friction'] < values['mass.granular_static_friction']);
    assert.equal(values['tilt.k_phi'], 4);
    assert.equal(Object.hasOwn(values, 'mass.damping_ratio_x'), false);
    assert.equal(Object.hasOwn(values, 'mass.damping_ratio_y'), false);
  }
  const middle = parameterValues([0, 0.5, 0, 0, 0], sand);
  assert.ok(Math.abs(middle['mass.granular_static_friction'] - 0.55) < 1e-12);
  assert.ok(Math.abs(middle['mass.granular_dynamic_friction'] - 0.35) < 1e-12);
  for (const material of ['water', 'marble']) {
    const axis = axisDefinitions('combined', material)[1];
    assert.equal(axis.key, 'mass.damping_ratio_x');
    assert.equal(axis.min, 0.05); assert.equal(axis.max, 1.5);
    assert.deepEqual(axis.paths, ['mass.damping_ratio_x', 'mass.damping_ratio_y']);
    assert.deepEqual(parameterValues([1, 1, 1, 1, 1], createV3(material)), parameterValues([1, 1, 1, 1, 1], createV2()));
  }
  sandAxis.pathScale['mass.granular_dynamic_friction'] = 2;
  sandAxis.paths[0] = 'mass.damping_ratio_x';
  assert.equal(axisDefinitions('combined', 'sand')[1].pathScale['mass.granular_dynamic_friction'], 7 / 11);
  assert.equal(axisDefinitions('combined', 'sand')[1].paths[0], 'mass.granular_static_friction');
  assert.throws(() => axisDefinitions('water', 'sand'), /legacy water/);
  assert.throws(() => axisDefinitions('combined', 'coins'), /demo/);
});

test('v3 seeded proposals, fixed phi, votes and in-progress pairs persist within each demo and mode', () => {
  for (const material of ['water', 'marble', 'sand']) for (const mode of ['rehearsal', 'device']) {
    let state = createV3(material, 743, mode), other = createV3(material, 743, mode);
    for (const chosen of ['a', 'tie', 'skip', 'b']) {
      assert.deepEqual(nextTrial(state), state);
      const snapshot = clone(state);
      state = recordChoice(state, chosen); other = recordChoice(other, chosen);
      assert.equal(state.version, 3);
      assert.equal(state.demo, material);
      assert.deepEqual(state.fixed, combinedFixed);
      assert.deepEqual(state.trial, other.trial);
      assert.deepEqual(state.observations, other.observations);
      assert.deepEqual(persisted(state), state);
      assert.equal(Object.keys(parameterValues(state.trial.a, state)).length, 7);
      assert.equal(snapshot.demo, material);
      assert.throws(() => parseSession(JSON.stringify(state), mode === 'device' ? 'rehearsal' : 'device'), /mode/);
    }
    assert.equal(state.history.length, 4);
    assert.equal(state.observations.length, 3, 'skip must not become a material vote');
    const fresh = createV3(material === 'sand' ? 'water' : 'sand', state.seed, state.mode);
    assert.equal(fresh.history.length, 0, 'changing material creates a separate untrained session');
    assert.equal(fresh.observations.length, 0);
    assert.notEqual(fresh.id, state.id);
    assert.deepEqual(fresh.incumbent, fresh.baseline);
    const copy = persisted(state); copy.fixed['tilt.k_phi'] = 2;
    copy.trial.a[0] = 0.01; copy.history[0].trial.b[1] = 0.01;
    assert.equal(state.fixed['tilt.k_phi'], 4);
    assert.deepEqual(state.trial, other.trial);
  }
});

test('v3 imports reject absent/unknown/material-changing nested metadata and incompatible version/context', () => {
  const original = recordChoice(recordChoice(createV3('sand'), 'a'), 'tie');
  const mutations = [
    value => { delete value.demo; },
    value => { value.demo = 'granular_sand_pile_box'; },
    value => { value.demo = null; },
    value => { value.demo = ['sand']; },
    value => { value.preset = 'liquid_small_box'; },
    value => { value.version = 2; },
    value => { value.version = 4; },
    value => { value.space = 'water'; },
    value => { value.history[0].demo = 'water'; },
    value => { value.history[0].trial.demo = 'water'; },
    value => { value.observations[0].demo = 'water'; },
    value => { value.fixed['mass.granular_dynamic_friction'] = 0.35; },
    value => { value.fixed['tilt.k_phi'] = 0; },
    value => { value.fixed['tilt.k_phi'] = 8.01; },
    value => { value.observations[0].a[1] = 0.12345678; },
    value => { value.trial.a.push(0); },
  ];
  for (const mutate of mutations) {
    const state = clone(original); mutate(state);
    assert.throws(() => parseSession(JSON.stringify(state)), /Invalid tuning session/);
  }
  for (const material of [undefined, null, 'coins', 'granular_sand_pile_box', 1])
    assert.throws(() => createSession('rehearsal', [0, 0, 0, 0, 0], '', '', 5,
      { space: 'combined', fixed: combinedFixed, demo: material }), /demo/);
  assert.throws(() => parseSession(JSON.stringify(original).replace('"demo":"sand"', '"demo":"sand","__proto__":{}')), /unknown fields/);
  assert.deepEqual(persisted(original), original, 'a rejected import cannot mutate the current history');
});
