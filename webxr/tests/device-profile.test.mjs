// Optional normal-demo profile UI, without a browser, physical device or IO.
import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { setImmediate as turn } from 'node:timers/promises';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
const { HapticLinkError } = await bundle('../src/link/HapticLink.ts');

class FakeLink {
  state = { connection: 'disconnected', paired: null, stale: true, pendingCommand: null, telemetry: null, error: null };
  listeners = []; calls = []; active = null;
  subscribe(callback) { this.listeners.push(callback); callback(this.state); }
  emit() { this.listeners.forEach(callback => callback(this.state)); }
  publish(preset = 'liquid_small_box') {
    this.state = { ...this.state, connection: 'connected', paired: true, stale: false, telemetry: {
      timestamp_ms: 1000, frame_counter: 100, preset, run_mode: 'idle', mass: { fill: .55 },
      audio: { runtime_enabled: false }, safety: { tilt_disarmed: true }, tilt_servo: { state: 2, fault: 0 },
      resolved: { family: preset === 'liquid_small_box' ? 'Liquid' : 'Granular', container: {
        span_x_m: .075, span_y_m: .085, span_z_m: .035, fill: .55, headspace: .45,
        viscosity: .12, particle_count: .1, particle_hardness: .2
      }, model: { coherent_container_demo: true } }
    } }; this.emit();
  }
  request(name, ...args) {
    const call = { name, args }; this.calls.push(call); this.active = call;
    this.state.pendingCommand = name; this.emit();
    return new Promise((resolve, reject) => Object.assign(call, { resolve, reject })).finally(() => {
      if (this.active === call) { this.active = null; this.state.pendingCommand = null; this.emit(); }
    });
  }
  applyTuning(...args) { return this.request('applyTuning', ...args); }
  start(...args) { return this.request('start', ...args); }
  stop() {
    if (this.active?.name === 'applyTuning') this.active.reject(new HapticLinkError('cancelled', 'Stop cancelled profile'));
    return this.request('stop');
  }
  loadPreset(...args) { return this.request('loadPreset', ...args); }
}
const prior = Object.fromEntries(['document', 'window', 'localStorage', 'Option', '__profileTestLink', '__profileTestError'].map(key => [key, globalThis[key]]));
globalThis.__profileTestLink = FakeLink; globalThis.__profileTestError = HapticLinkError;
after(() => { for (const [key, value] of Object.entries(prior)) { if (value === undefined) delete globalThis[key]; else globalThis[key] = value; } });
async function bundle(path, plugins = []) {
  const result = await build({ entryPoints: [fileURLToPath(new URL(path, import.meta.url))], bundle: true,
    format: 'esm', platform: 'node', write: false, logLevel: 'silent', plugins });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
}
const { DeviceDemo } = await bundle('../src/deviceDemo.ts', [{ name: 'profile-test-link', setup(build) {
  build.onResolve({ filter: /\/link\/HapticLink$/ }, () => ({ path: 'link', namespace: 'profile-test' }));
  build.onLoad({ filter: /.*/, namespace: 'profile-test' }, () => ({ loader: 'js', contents:
    'export const HapticLink=globalThis.__profileTestLink; export const HapticLinkError=globalThis.__profileTestError;' }));
} }]);
const { serializeProfile, PROFILE_STORAGE_PREFIX } = await bundle('../src/tuning/TuningProfile.ts');
const { createProfile } = await bundle('../src/tuning/ProfileFromSession.ts');
const { createSession, demoDefinitions } = await bundle('../src/tuning/TuningSession.ts');
const profile = (demo = 'water', mode = 'device') => createProfile(createSession(mode, [.5, .5, .5, .5, .5], '目標', '参照', 177,
  { space: 'combined', demo, fixed: { 'tilt.k_phi': 4 } }));

class Element {
  value = ''; textContent = ''; checked = true; disabled = false; dataset = {}; options = []; files = [];
  add(option) { this.options.push(option); }
  replaceChildren(...options) { this.options = options; this.value = options[0]?.value ?? ''; }
  click() { if (!this.disabled) this.onclick?.(); }
}
function fixture(profiles = []) {
  const elements = new Map(), listeners = new Map(), stored = new Map();
  const element = id => { if (!elements.has(id)) elements.set(id, new Element()); return elements.get(id); };
  globalThis.document = { getElementById: element, body: { classList: { toggle() {} } }, createElement: () => new Element() };
  globalThis.Option = class { constructor(text, value) { this.text = text; this.value = value; } };
  globalThis.window = { addEventListener: (name, callback) => listeners.set(name, callback) };
  globalThis.localStorage = { get length() { return stored.size; }, key: i => [...stored.keys()][i],
    getItem: key => stored.get(key) ?? null, setItem: (key, value) => stored.set(key, value) };
  for (const value of profiles) stored.set(PROFILE_STORAGE_PREFIX + value.sourceSession.id, serializeProfile(value));
  const demo = new DeviceDemo({ setPreset() {}, setDeviceState() {}, setDeviceOrientation() {} }, { onPreset() {}, onPreview() {} });
  const choose = value => { element('device-profile-select').value = PROFILE_STORAGE_PREFIX + value.sourceSession.id; element('device-profile-select').onchange(); };
  return { demo, link: demo.link, element, stored, listeners, choose };
}

test('saved profiles are optional selections with truthful mode/count labels; selection and refresh send no commands', () => {
  const water = profile(), marble = profile('marble', 'rehearsal'), f = fixture([water, marble]);
  assert.equal(f.element('device-profile-select').value, '');
  assert.equal(f.element('device-profile-select').options.length, 3);
  assert.equal(f.element('device-profile-apply').disabled, true);
  f.choose(water);
  assert.match(f.element('device-profile-detail').textContent, /未評価.*比較0件/);
  f.link.publish();
  assert.equal(f.element('device-profile-apply').disabled, false);
  f.choose(marble);
  assert.equal(f.element('device-profile-apply').disabled, true);
  assert.match(f.element('device-profile-detail').textContent, /練習のみ.*触覚評価なし/);
  assert.match(f.element('device-profile-detail').textContent, /同じ実機材質/);
  f.listeners.get('focus')();
  f.listeners.get('storage')({ key: PROFILE_STORAGE_PREFIX + marble.sourceSession.id });
  assert.deepEqual(f.link.calls, []);
});

test('saved profile material labels come from the shared demo definitions', () => {
  for (const definition of demoDefinitions) {
    const selected = profile(definition.id), f = fixture([selected]);
    f.choose(selected);
    assert.ok(f.element('device-profile-detail').textContent.startsWith(`${definition.label} · `));
    assert.ok(f.element('device-profile-select').options[1].text.startsWith(`${definition.label} · `));
    assert.deepEqual(f.link.calls, []);
  }
});

test('same-preset apply sends exact seven values through the existing stopped transaction and never auto-starts', async () => {
  const selected = profile(), f = fixture([selected]); f.link.publish(); f.choose(selected);
  f.element('device-profile-apply').click();
  assert.deepEqual(f.link.calls.map(call => [call.name, ...call.args]), [['applyTuning', selected.preset, selected.parameters]]);
  assert.equal(f.element('device-start').disabled, true);
  assert.equal(f.element('device-stop').disabled, false);
  f.link.calls[0].resolve([]); await turn();
  assert.equal(f.element('device-start').disabled, false);
  assert.match(f.element('device-profile-detail').textContent, /停止中.*別ボタン/);
  assert.equal(f.link.calls.some(call => call.name === 'start'), false);
});

test('cross-demo/stale selection rejects before IO, including stale DOM handlers', async () => {
  const selected = profile('sand'), f = fixture([selected]); f.link.publish(); f.choose(selected);
  f.element('device-profile-apply').onclick(); await turn();
  assert.deepEqual(f.link.calls, []);
  assert.match(f.element('device-status').textContent, /同じ実機/);
  f.link.publish(selected.preset); f.link.state.stale = true; f.link.emit();
  f.element('device-profile-apply').onclick(); await turn();
  assert.deepEqual(f.link.calls, []);
});

test('Stop cancels partial profile application and blocks Start until an explicit successful reconfiguration', async () => {
  const selected = profile(), f = fixture([selected]); f.link.publish(); f.choose(selected);
  f.element('device-profile-apply').click();
  f.element('device-stop').click();
  f.link.calls.find(call => call.name === 'stop').resolve({}); await turn();
  assert.equal(f.element('device-start').disabled, true);
  assert.match(f.element('device-profile-detail').textContent, /未完了/);
  assert.deepEqual(f.link.calls.map(call => call.name), ['applyTuning', 'stop']);
  f.element('device-profile-apply').click();
  f.link.calls.at(-1).resolve([]); await turn();
  assert.equal(f.element('device-start').disabled, false);
  assert.equal(f.link.calls.some(call => call.name === 'start'), false);

  f.element('device-profile-apply').click();
  f.link.calls.at(-1).reject(new Error('mismatched numeric readback')); await turn();
  assert.equal(f.element('device-start').disabled, true);
  const reselect = f.demo.selectPreset(selected.preset);
  f.link.publish(selected.preset); f.link.calls.at(-1).resolve({}); await reselect;
  assert.equal(f.element('device-start').disabled, false);
});

test('profile import/storage refresh remain output-free and invalid history JSON cannot enter the result library', async () => {
  const selected = profile('sand'), f = fixture();
  const file = f.element('device-profile-import');
  file.files = [{ size: 1, text: async () => serializeProfile(selected) }]; file.onchange(); await turn();
  assert.equal(f.stored.size, 1);
  assert.equal(f.element('device-profile-select').value, PROFILE_STORAGE_PREFIX + selected.sourceSession.id);
  assert.match(f.element('device-profile-detail').textContent, /まだ適用していません/);
  assert.deepEqual(f.link.calls, []);
  const water = profile(); f.stored.set(PROFILE_STORAGE_PREFIX + water.sourceSession.id, serializeProfile(water));
  f.listeners.get('storage')({ key: PROFILE_STORAGE_PREFIX + water.sourceSession.id });
  assert.equal(f.element('device-profile-select').options.length, 3);
  file.files = [{ size: 1, text: async () => JSON.stringify({ format: 'haptic-preference-v3', session: {} }) }];
  file.onchange(); await turn();
  assert.equal(f.stored.size, 2);
  assert.match(f.element('device-status').textContent, /Invalid tuning profile/);
  assert.deepEqual(f.link.calls, []);
});
