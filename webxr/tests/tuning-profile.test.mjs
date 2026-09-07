import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

async function bundled(path) {
  const result = await build({ entryPoints: [fileURLToPath(new URL(path, import.meta.url))], bundle: true,
    platform: 'node', format: 'esm', write: false, logLevel: 'silent' });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
}
const { parseProfile, serializeProfile, profileParametersFor, PROFILE_STORAGE_PREFIX } =
  await bundled('../src/tuning/TuningProfile.ts');
const { createProfile } = await bundled('../src/tuning/ProfileFromSession.ts');
const { createSession, recordChoice, parameterValues, demoDefinitions } = await bundled('../src/tuning/TuningSession.ts');
const { PreviewEngine } = await bundled('../src/lab/PreviewEngine.ts');
const clone = value => JSON.parse(JSON.stringify(value));
const create = (demo = 'water', mode = 'device') => createSession(mode, [.6, .5, .4, .3, .7], '持った実物らしさ', '同じ把持', 42,
  { space: 'combined', demo, fixed: { 'tilt.k_phi': 3.2 } });
const common = ['resonance.master_gain', 'tilt.max_tilt_deg', 'tilt.k_cm', 'tilt.k_tau', 'tilt.k_phi'];

test('all representative demos export a detached portable selection, never history or an applied-state claim', () => {
  for (const definition of demoDefinitions) {
    const initial = create(definition.id), state = recordChoice(initial, 'b'), before = clone(state);
    const profile = createProfile(state);
    assert.equal(profile.format, 'haptic-tuning-profile-v1');
    assert.deepEqual(profile.sourceSession, { id: state.id, version: 3, mode: 'device' });
    assert.equal(profile.demo, definition.id);
    assert.equal(profile.preset, definition.preset);
    assert.equal(profile.createdAt, state.createdAt);
    assert.equal(profile.objective, state.objective);
    assert.equal(profile.reference, state.reference);
    assert.equal(profile.comparisonCount, 1);
    assert.equal(profile.reviewStatus, 'self-reported-preference');
    assert.deepEqual(profile.parameters, parameterValues(state.incumbent, state));
    assert.equal(Object.keys(profile.parameters).length, 7);
    assert.deepEqual(parseProfile(serializeProfile(profile)), profile);
    for (const excluded of ['history', 'observations', 'trial', 'incumbent', 'receipts', 'started', 'readback']) assert.equal(excluded in profile, false);
    profile.parameters['tilt.k_phi'] = 1;
    profile.sourceSession.id = 'modified-id';
    assert.deepEqual(state, before);
  }
  assert.equal(PROFILE_STORAGE_PREFIX, 'haptic-tuning-profile-v1:');
});

test('rehearsal, zero judgments and skipped-only device sessions cannot become evaluated selections', () => {
  for (const mode of ['device', 'rehearsal']) {
    const initial = create('water', mode), skipped = recordChoice(initial, 'skip'), tied = recordChoice(skipped, 'tie');
    assert.equal(createProfile(initial).comparisonCount, 0);
    assert.equal(createProfile(skipped).comparisonCount, 0, 'skip is not a subjective comparison result');
    assert.equal(createProfile(tied).comparisonCount, 1, 'tie is genuine reported evidence');
    assert.equal(createProfile(initial).reviewStatus, mode === 'device' ? 'not-evaluated' : 'rehearsal-only');
    assert.equal(createProfile(tied).reviewStatus, mode === 'device' ? 'self-reported-preference' : 'rehearsal-only');
  }
});

test('v2 water is complete and portable; v1 cannot invent the unsaved tilt settings', () => {
  const v2 = createSession('device', [.2, .3, .4, .5, .6], '', '', 14, { space: 'combined', fixed: { 'tilt.k_phi': 4 } });
  const profile = createProfile(v2);
  assert.equal(profile.demo, 'water');
  assert.equal(profile.sourceSession.version, 2);
  assert.deepEqual(parseProfile(serializeProfile(profile)).parameters, parameterValues(v2.incumbent, v2));
  const v1 = createSession('device', [.2, .3], '', '', 14);
  assert.throws(() => createProfile(v1), /legacy v1.*tilt/);
  const corrupted = clone(v2); corrupted.incumbent = [0, 0, 0, 0, 0];
  assert.throws(() => createProfile(corrupted), /incumbent/);
});

test('same-demo reuse is exact while cross-demo transfer preserves only common gains on the target material baseline', () => {
  for (const sourceDemo of ['water', 'marble', 'sand']) for (const targetDemo of ['water', 'marble', 'sand']) {
    const profile = createProfile(create(sourceDemo));
    const baseline = parameterValues([.1, .8, .9, .2, .3], create(targetDemo));
    // Target material baselines may have independent shipped pair values. The
    // transfer helper must preserve those values, not force the source ratio.
    const specific = Object.keys(baseline).filter(path => !common.includes(path));
    baseline[specific[1]] *= .9;
    const before = clone({ profile, baseline });
    const transferred = profileParametersFor(profile, targetDemo, baseline);
    assert.equal(Object.keys(transferred).length, 7);
    if (sourceDemo === targetDemo) assert.deepEqual(transferred, profile.parameters);
    else {
      for (const path of common) assert.equal(transferred[path], profile.parameters[path]);
      for (const path of specific) assert.equal(transferred[path], baseline[path]);
      for (const path of Object.keys(profile.parameters).filter(path => !common.includes(path))) {
        if (!(path in baseline)) assert.equal(path in transferred, false);
      }
    }
    transferred['tilt.k_phi'] = 1;
    assert.deepEqual({ profile, baseline }, before, 'no shared mutable data or votes cross the boundary');
  }
});

test('strict imports reject schema, mode/review, metadata, counts, ranges and material-coupling mismatches', () => {
  const base = createProfile(create());
  const mutations = [
    value => { value.format = 'haptic-preference-v2'; }, value => { value.history = []; },
    value => { delete value.reference; }, value => { value.sourceSession.version = 1; },
    value => { value.sourceSession.mode = 'physical-verified'; }, value => { value.sourceSession.id = '../escape'; },
    value => { value.reviewStatus = 'self-reported-preference'; }, value => { value.comparisonCount = -1; },
    value => { value.comparisonCount = 61; }, value => { value.comparisonCount = .5; },
    value => { value.createdAt = '2026-09-09'; }, value => { value.objective = 'x'.repeat(301); },
    value => { value.demo = 'soda'; }, value => { value.preset = 'granular_coin_box'; },
    value => { value.parameters['tilt.k_phi'] = 0; }, value => { value.parameters['tilt.max_tilt_deg'] = 10.01; },
    value => { value.parameters['tilt.k_cm'] = '0.3'; }, value => { value.parameters['tilt.k_tau'] = null; },
    value => { value.parameters['audio.output_peak_limit'] = .1; }, value => { delete value.parameters['tilt.k_cm']; },
    value => { value.parameters['mass.damping_ratio_y'] += .01; },
  ];
  for (const mutate of mutations) { const value = clone(base); mutate(value); assert.throws(() => parseProfile(JSON.stringify(value)), /Invalid tuning profile/); }
  const sand = createProfile(create('sand'));
  sand.parameters['mass.granular_dynamic_friction'] += .01;
  assert.throws(() => parseProfile(JSON.stringify(sand)), /coupled/);
  const v2wrongDemo = createProfile(create('marble')); v2wrongDemo.sourceSession.version = 2;
  assert.throws(() => parseProfile(JSON.stringify(v2wrongDemo)), /v2.*water/);
  assert.throws(() => parseProfile(JSON.stringify(base).replace('"parameters":{', '"parameters":{"__proto__":{},')), /unknown fields/);
  assert.throws(() => parseProfile('{broken'), /malformed JSON/);
  assert.throws(() => parseProfile('null'), /plain object/);
  assert.throws(() => parseProfile('砂'.repeat(6000)), /16 KiB/);
});

test('public pure helpers revalidate objects and target baselines without silent clipping/coercion', () => {
  const profile = createProfile(create()), baseline = { ...profile.parameters };
  for (const invalid of [NaN, Infinity, -Infinity, '4']) {
    const value = clone(profile); value.parameters['tilt.k_phi'] = invalid;
    assert.throws(() => serializeProfile(value), /bounds/);
    assert.throws(() => profileParametersFor(value, 'water', baseline), /bounds/);
  }
  const prototype = Object.assign(Object.create({ inherited: true }), profile);
  assert.throws(() => serializeProfile(prototype), /plain object/);
  const symbol = clone(profile); symbol[Symbol('hidden')] = 1;
  assert.throws(() => serializeProfile(symbol), /unknown fields/);
  const getter = clone(profile); Object.defineProperty(getter, 'objective', { get: () => 'surprise' });
  assert.throws(() => serializeProfile(getter), /data fields/);
  assert.throws(() => profileParametersFor(profile, 'unknown', baseline), /unsupported demo/);
  assert.throws(() => profileParametersFor(profile, 'sand', baseline), /unknown fields/);
  const badBaseline = { ...baseline, 'tilt.k_cm': 2 };
  assert.throws(() => profileParametersFor(profile, 'water', badBaseline), /bounds/);
});

test('portable profiles retain their own coupling tolerance and exact derived sand endpoint bounds', () => {
  for (const demo of ['water', 'marble', 'sand']) {
    const original = createProfile(create(demo));
    const path = demo === 'sand' ? 'mass.granular_dynamic_friction' : 'mass.damping_ratio_y';
    const near = clone(original); near.parameters[path] += 5e-10;
    assert.equal(parseProfile(JSON.stringify(near)).parameters[path], near.parameters[path]);
    const outside = clone(original); outside.parameters[path] += 2e-9;
    assert.throws(() => parseProfile(JSON.stringify(outside)), /coupled/);
  }
  for (const friction of [.2, .9]) for (const dynamic of [friction * (7 / 11), friction * 7 / 11]) {
    const value = createProfile(create('sand'));
    value.parameters['mass.granular_static_friction'] = friction;
    value.parameters['mass.granular_dynamic_friction'] = dynamic;
    if (dynamic >= .2 * (7 / 11) && dynamic <= .9 * (7 / 11))
      assert.equal(parseProfile(JSON.stringify(value)).parameters['mass.granular_dynamic_friction'], dynamic);
    else assert.throws(() => parseProfile(JSON.stringify(value)), /bounds/);
  }
});

test('actual shipped Wasm defaults are admissible target baselines for all three demos', async () => {
  const source = createProfile(create());
  for (const definition of demoDefinitions) {
    const frame = (await PreviewEngine.create(definition.preset)).snapshot(), p = frame.parameters;
    const baseline = { 'resonance.master_gain': p.masterGain,
      ...(definition.id === 'sand' ? { 'mass.granular_static_friction': p.staticFriction, 'mass.granular_dynamic_friction': p.dynamicFriction } :
        { 'mass.damping_ratio_x': p.dampingX, 'mass.damping_ratio_y': p.dampingY }),
      'tilt.max_tilt_deg': p.tiltPositionGain, 'tilt.k_cm': p.tiltKcm, 'tilt.k_tau': p.tiltKtau, 'tilt.k_phi': p.tiltGain };
    const result = profileParametersFor(source, definition.id, baseline);
    assert.ok(Object.values(result).every(Number.isFinite));
    if (definition.id !== 'water') for (const key of Object.keys(baseline).filter(key => !common.includes(key)))
      assert.equal(result[key], baseline[key], `${definition.id} keeps its actual shipped material response`);
  }
});
