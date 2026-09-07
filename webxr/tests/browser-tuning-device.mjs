// Actual Chromium UI, injected Web Serial only. No physical USB or audio access.
// Use the same FRESNEL_* host-runtime variables as browser-demo.mjs.
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.FRESNEL_PLAYWRIGHT_MODULE || 'playwright');
const channel = process.env.FRESNEL_BROWSER_CHANNEL || 'chrome';
const url = new URL('/tune.html', process.env.FRESNEL_DEMO_URL || 'https://localhost:8081');
const browser = await chromium.launch({ ...(channel === 'chromium' ? {} : { channel }),
  headless: true, args: ['--mute-audio'] });
const page = await browser.newPage({ ignoreHTTPSErrors: true, viewport: { width: 1280, height: 900 } });
const errors = [], forbiddenRequests = [];
page.on('pageerror', error => errors.push(error.message));
await page.route('**/*', async route => {
  const request = route.request(), target = new URL(request.url());
  if (target.origin !== url.origin || request.resourceType() === 'media' || /\.(?:wav|mp3|ogg|m4a)(?:\?|$)/i.test(target.pathname)) {
    forbiddenRequests.push(request.url()); await route.abort();
  } else await route.continue();
});
await page.addInitScript(() => {
  const forbidden = [], commands = [], acknowledgements = [];
  const block = name => (..._args) => { forbidden.push(name); throw new Error(`Unexpected tuning-test IO: ${name}`); };
  window.AudioContext = block('AudioContext');
  window.webkitAudioContext = block('webkitAudioContext');
  HTMLMediaElement.prototype.play = block('HTMLMediaElement.play');
  Object.defineProperty(navigator, 'usb', { configurable: true, value: {
    requestDevice: block('usb.requestDevice'), getDevices: block('usb.getDevices')
  } });
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: {
    getUserMedia: block('getUserMedia'), getDisplayMedia: block('getDisplayMedia')
  } });
  const model = {
    timestamp_ms: 10000, frame_counter: 100, preset: 'liquid_small_box', run_mode: 'idle', evt_total: 0,
    imu: { valid: true, accel_g: [Math.SQRT1_2, 0, Math.SQRT1_2], gyro_dps: [0, 0, 0] },
    mass: { pos_norm: [0, -1], vel_norm_s: [0, 0], energy: 0, fill: .55 },
    audio: { runtime_enabled: false, output_silenced: true },
    safety: { imu_stale_safe_stop: false, audio_zero_asserted: true, tilt_disarmed: true },
    tilt_servo: { state: 2, fault: 0 },
    resolved: { family: 'Liquid', container: {
      span_x_m: .075, span_y_m: .085, span_z_m: .035, fill: .55, headspace: .45,
      viscosity: .12, particle_count: .1, particle_hardness: .2
    }, model: { coherent_container_demo: true, device_frame_transform: true } }
  };
  const defaults = { 'resonance.master_gain': .48, 'mass.damping_ratio_x': .35, 'mass.damping_ratio_y': .35,
    'mass.granular_static_friction': .55, 'mass.granular_dynamic_friction': .35,
    'tilt.max_tilt_deg': 10, 'tilt.k_cm': .35, 'tilt.k_tau': .25, 'tilt.k_phi': 4 };
  let parameters = { ...defaults }, controller, timer, id = 0, requests = 0, holdNext = false, held;
  let currentFirmware = true, mismatchNextApply = false, mismatchReadback = false, holdStop = false;
  const presets = {
    liquid_small_box: { family: 'Liquid', gain: .48, span: [.075, .085, .035], fill: .55, headspace: .45, viscosity: .12, particle_count: .1, particle_hardness: .2 },
    granular_single_marble_box: { family: 'Granular', gain: .62, span: [.05, .05, .05], fill: .04, headspace: .96, viscosity: .01, particle_count: .03, particle_hardness: 1 },
    granular_sand_pile_box: { family: 'Granular', gain: .4, span: [.06, .06, .04], fill: .35, headspace: .65, viscosity: .1, particle_count: .9, particle_hardness: .35 },
  };
  const setPreset = preset => {
    const config = presets[preset];
    if (!config) throw new Error('Unknown mock preset');
    model.preset = preset; model.resolved.family = config.family;
    Object.assign(model.resolved.container, { span_x_m: config.span[0], span_y_m: config.span[1], span_z_m: config.span[2],
      fill: config.fill, headspace: config.headspace, viscosity: config.viscosity,
      particle_count: config.particle_count, particle_hardness: config.particle_hardness });
    model.mass.fill = config.fill;
    // Real Idle telemetry publishes neutral MassState, not active pile motion.
    model.mass.demo = { pile_slope: 0, granular_flow: 0, granular_pile_active: false,
      pressure: { enabled: false, phase: 'sealed', charge: 0, phase_s: 0, remaining: 1, burst_sequence: 0 } };
  };
  const encode = new TextEncoder(), decode = new TextDecoder();
  const line = value => controller?.enqueue(encode.encode(`${value}\n`));
  const publish = () => { model.frame_counter++; model.timestamp_ms += 100; line(JSON.stringify(model)); };
  const idle = () => {
    model.run_mode = 'idle'; model.audio.runtime_enabled = false; model.audio.output_silenced = true;
    model.safety.audio_zero_asserted = true; model.safety.tilt_disarmed = true; model.tilt_servo.state = 2;
  };
  const port = {
    readable: null, writable: null,
    async open(options) {
      if (options.baudRate !== 115200) throw new Error('Unexpected mock baud rate');
      this.readable = new ReadableStream({ start(value) { controller = value; }, cancel() { controller = null; } });
      this.writable = new WritableStream({ write(bytes) {
        for (const command of decode.decode(bytes).trim().split('\n')) {
          commands.push(command);
          if (command === 'status') { line('espnow_bridge: paired=1 session=1234ABCD'); publish(); continue; }
          const operation = command === 'get state' ? 2 : command === 'stop' ? 3 : command === 'live' ? 4 :
            command.startsWith('audio ') ? 5 : command.startsWith('preset load ') ? 6 : command.startsWith('set ') ? 7 : 9;
          const request = ++id;
          line(`haptic_link_tx: request=${request} operation=${operation}`);
          let result = 'applied';
          if (command === 'stop') idle();
          else if (command === 'live') model.run_mode = 'live';
          else if (command === 'audio on') {
            model.audio.runtime_enabled = true; model.audio.output_silenced = false; model.safety.audio_zero_asserted = false;
          } else if (command === 'tilt on') { model.safety.tilt_disarmed = false; model.tilt_servo.state = 4; }
          else if (command.startsWith('preset load ')) {
            const preset = command.slice('preset load '.length);
            if (!Object.hasOwn(presets, preset) || model.run_mode !== 'idle') result = 'rejected';
            else {
              // Production preset loading changes material response but keeps
              // the applied tilt calibration/gains; it is not an Atom reboot.
              setPreset(preset);
              for (const path of ['resonance.master_gain', 'mass.damping_ratio_x', 'mass.damping_ratio_y',
                'mass.granular_static_friction', 'mass.granular_dynamic_friction']) {
                parameters[path] = defaults[path];
              }
              parameters['resonance.master_gain'] = presets[preset].gain;
            }
          } else if (command.startsWith('set ')) {
            const [, path, raw] = command.split(' '), value = Number(raw);
            if (!Object.hasOwn(defaults, path) || !Number.isFinite(value) || model.run_mode !== 'idle' ||
                (!currentFirmware && path.startsWith('tilt.'))) result = 'rejected';
            else {
              parameters[path] = value;
              if (mismatchNextApply && path === 'tilt.k_phi') {
                mismatchNextApply = false; mismatchReadback = true;
              }
            }
          } else if (command !== 'get state') result = 'rejected';
          const finish = () => {
            let detail = 'mock_execution';
            if (command === 'get state' && currentFirmware) {
              const values = ['tilt.max_tilt_deg', 'tilt.k_cm', 'tilt.k_tau', 'tilt.k_phi'].map(path => parameters[path]);
              if (mismatchReadback) { values[3] += .25; mismatchReadback = false; }
              detail = `tilt_v1=${values.map(value => value.toPrecision(6)).join(',')}`;
            }
            acknowledgements.push({ command, result, detail });
            line(`haptic_link_ack: request=${request} result=${result} session=1234ABCD frame=${model.frame_counter} detail=${detail}`);
            publish();
          };
          if (holdNext && command.startsWith('set mass.damping_ratio_x ')) { holdNext = false; held = finish; }
          else if (holdStop && command === 'stop') { holdStop = false; held = finish; }
          else finish();
        }
      } });
      timer = setInterval(publish, 100);
    },
    async close() { clearInterval(timer); }
  };
  Object.defineProperty(navigator, 'serial', { configurable: true, value: {
    requestPort: async () => { requests++; return port; }, getPorts: block('serial.getPorts')
  } });
  window.__tuningMock = {
    snapshot: () => ({ commands: [...commands], forbidden: [...forbidden], requests,
      model: structuredClone(model), parameters: { ...parameters }, acknowledgements: [...acknowledgements], held: !!held }),
    setCurrentFirmware(value) { currentFirmware = value; },
    setPresetFixture(preset) { setPreset(preset); publish(); },
    mismatchNextApply() { mismatchNextApply = true; },
    mismatchNextState() { mismatchReadback = true; },
    setIdleTiltFixture(values) {
      if (model.run_mode !== 'idle') throw new Error('Tilt fixture requires stopped mock outputs');
      ['tilt.max_tilt_deg', 'tilt.k_cm', 'tilt.k_tau', 'tilt.k_phi'].forEach((path, index) => parameters[path] = values[index]);
    },
    reboot() {
      // Stamp's port and session stay open; Atom returns to the SAME water config.
      // The parameter values are deliberately not present in its telemetry.
      idle(); parameters = { ...defaults }; model.frame_counter = 0; model.timestamp_ms = 0; publish();
    },
    unplug() {
      // USB loss does not send a radio Stop: the simulated Atom remains Live.
      clearInterval(timer); const source = controller; controller = null; source?.error(new Error('Mock USB unplugged'));
    },
    holdNextSet() { holdNext = true; },
    holdNextStop() { holdStop = true; },
    releaseSet() { const finish = held; held = undefined; finish?.(); }
  };
});

const probe = () => page.evaluate(() => window.__tuningMock.snapshot());
const saved = () => page.evaluate(() => {
  const key = document.querySelector('#saved').value;
  return key ? JSON.parse(localStorage.getItem(key)) : null;
});
const parameterPaths = ['resonance.master_gain', 'mass.damping_ratio_x', 'mass.damping_ratio_y',
  'tilt.max_tilt_deg', 'tilt.k_cm', 'tilt.k_tau', 'tilt.k_phi'];
const tiltPaths = parameterPaths.slice(3);
const presetFor = session => ({ water: 'liquid_small_box', marble: 'granular_single_marble_box', sand: 'granular_sand_pile_box' })[session.demo || 'water'];
const parametersFor = (point, session) => {
  const values = session.version !== 1 ? { ...session.fixed } : {};
  const materialPaths = session.demo === 'sand'
    ? ['mass.granular_static_friction', 'mass.granular_dynamic_friction'] : parameterPaths.slice(1, 3);
  Object.assign(values, { 'resonance.master_gain': .1 + point[0] * .9 });
  if (session.demo === 'sand') {
    values[materialPaths[0]] = .2 + point[1] * (.9 - .2);
    values[materialPaths[1]] = values[materialPaths[0]] * (7 / 11);
  } else Object.assign(values, { 'mass.damping_ratio_x': .05 + point[1] * 1.45, 'mass.damping_ratio_y': .05 + point[1] * 1.45 });
  if (session.version !== 1) {
    Object.assign(values, { 'tilt.max_tilt_deg': point[2] * 10, 'tilt.k_cm': point[3], 'tilt.k_tau': point[4] });
  }
  return Object.fromEntries(['resonance.master_gain', ...materialPaths, ...tiltPaths].filter(path => Object.hasOwn(values, path)).map(path => [path, values[path]]));
};
const applyCommands = (point, session) => ['stop', ...(session.version !== 1 ? ['get state'] : []),
  `preset load ${presetFor(session)}`, ...Object.entries(parametersFor(point, session)).map(([path, value]) => `set ${path} ${value}`), 'get state'];
const outputCommands = ['live', 'audio on', 'tilt on'];
const startCommands = session => [...(session.version !== 1 ? ['get state'] : []), ...outputCommands];
async function apply(slot) {
  const before = (await probe()).commands.length, archive = await saved(), session = archive.session, point = session.trial[slot];
  await page.locator(`#apply-${slot}:enabled`).click();
  await page.waitForFunction(({ slot, count }) => {
    const key = document.querySelector('#saved').value;
    return key && JSON.parse(localStorage.getItem(key)).receipts.length > count && !document.querySelector(`#apply-${slot}`).disabled;
  }, { slot, count: archive.receipts.length });
  const current = await probe();
  assert.deepEqual(current.commands.slice(before), applyCommands(point, session));
  assert.equal(current.model.run_mode, 'idle');
  assert.equal(current.model.audio.runtime_enabled, false);
  assert.equal(current.model.safety.tilt_disarmed, true);
  assert.equal(await page.locator('#output-state').innerText(), '実機の停止状態を確認');
  const expected = parametersFor(point, session);
  for (const [path, value] of Object.entries(expected)) assert.equal(current.parameters[path], value);
  const receipt = (await saved()).receipts.at(-1);
  assert.equal(receipt.ackFrames.length, session.version !== 1 ? 11 : 6);
  assert.deepEqual(receipt.parameters, expected);
  if (session.version !== 1) {
    const lastReadback = current.acknowledgements.at(-1);
    assert.equal(lastReadback.command, 'get state');
    assert.match(lastReadback.detail, /^tilt_v1=/);
    const values = lastReadback.detail.slice(8).split(',').map(Number);
    for (let i = 0; i < 4; i++) {
      const requested = expected[parameterPaths[i + 3]];
      assert.ok(Math.abs(values[i] - requested) <= Math.max(1e-6, Math.abs(requested) * 5e-6), 'six-significant-digit FW readback order and rounding');
    }
  }
}
async function start(slot) {
  await page.locator('#handling').check();
  const before = (await probe()).commands.length, session = (await saved()).session;
  await page.locator(`#start-${slot}:enabled`).click();
  await page.waitForFunction(slot => document.querySelector(`#card-${slot}`).dataset.tested === 'true' &&
    !document.querySelector(`#apply-${slot}`).disabled, slot);
  assert.deepEqual((await probe()).commands.slice(before), startCommands(session));
  await assertLiveCannotRestart(slot);
}
async function assertLiveCannotRestart(activeSlot) {
  assert.equal((await probe()).model.run_mode, 'live');
  for (const slot of ['a', 'b', 'baseline', 'preferred']) {
    assert.equal(await page.locator(`#start-${slot}`).isDisabled(), true, `LIVE disables Start for ${slot}`);
  }
  const before = (await probe()).commands.length;
  // Normal user clicks cannot reach a disabled button. Invoke its existing
  // DOM handler to also check the controller guard against a stale UI event.
  await page.locator(`#start-${activeSlot}`).evaluate(button => button.onclick(new MouseEvent('click')));
  await page.locator('#apply-a:enabled').waitFor();
  assert.deepEqual((await probe()).commands.slice(before), [], 'a redundant LIVE Start must not read state or wait for Idle');
  assert.equal((await probe()).model.run_mode, 'live');
}

try {
  await page.goto(url.href, { waitUntil: 'networkidle' });
  await page.locator('#new-session:enabled').waitFor();
  assert.equal(await page.locator('vite-error-overlay').count(), 0);
  assert.deepEqual((await probe()).commands, []);
  assert.equal((await probe()).requests, 0, 'opening the workspace must not open a port');
  assert.equal(await page.locator('#space').count(), 0, 'vibration and tilt are not separated into different search spaces');
  await page.locator('#mode').selectOption('device');
  await page.locator('#new-session').click();
  assert.equal((await saved()).session.version, 3);
  assert.equal((await saved()).session.demo, 'water');
  assert.equal((await saved()).session.space, 'combined');
  assert.equal((await saved()).session.trial.a.length, 5);
  assert.deepEqual(Object.keys((await saved()).session.fixed), ['tilt.k_phi']);
  await page.locator('#connect:enabled').click();
  await page.locator('#apply-a:enabled').waitFor();
  assert.deepEqual((await probe()).commands, ['status', 'get state']);

  // An old FW can still send ordinary ACKs and fresh container state. Neither
  // is evidence that it supports the new tilt paths: reject before preset/set.
  await page.evaluate(() => window.__tuningMock.setCurrentFirmware(false));
  await page.locator('#handling').check();
  const beforeOld = await probe(), oldReceiptCount = (await saved()).receipts.length;
  await page.locator('#apply-a').click();
  await page.waitForFunction(() => document.querySelector('#status').textContent.includes('新しいAtomS3 FW') &&
    !document.querySelector('#apply-a').disabled);
  assert.deepEqual((await probe()).commands.slice(beforeOld.commands.length), ['stop', 'get state', 'stop']);
  assert.deepEqual((await probe()).parameters, beforeOld.parameters);
  assert.equal((await saved()).receipts.length, oldReceiptCount);
  assert.equal(await page.locator('#start-a').isDisabled(), true);
  assert.equal(await page.locator('#start-b').isDisabled(), true);
  await page.evaluate(() => window.__tuningMock.setCurrentFirmware(true));
  await page.locator('#handling').uncheck();

  await apply('a');
  assert.equal(await page.locator('#start-a').isDisabled(), true, 'the separate handling confirmation still gates Start');
  await start('a');

  // A complete set of execution ACKs alone must not authorize Start when the
  // final applied-number readback disagrees, even after A was previously live.
  const beforeMismatch = (await probe()).commands.length, mismatchArchive = await saved();
  await page.evaluate(() => window.__tuningMock.mismatchNextApply());
  await page.locator('#apply-b').click();
  await page.waitForFunction(() => document.querySelector('#status').textContent.includes('読み戻し') &&
    document.querySelector('#status').textContent.includes('一致しません') && !document.querySelector('#apply-b').disabled);
  assert.deepEqual((await probe()).commands.slice(beforeMismatch), [...applyCommands(mismatchArchive.session.trial.b, mismatchArchive.session), 'stop']);
  assert.equal((await saved()).receipts.length, mismatchArchive.receipts.length, 'mismatched readback is not a successful receipt');
  assert.equal(await page.locator('#start-a').isDisabled(), true);
  assert.equal(await page.locator('#start-b').isDisabled(), true);
  assert.equal((await probe()).model.run_mode, 'idle');

  await apply('b'); await start('b');
  const priorVote = (await probe()).commands.length;
  await page.locator('#handling').blur();
  await page.keyboard.press('a');
  await page.waitForFunction(() => {
    const key = document.querySelector('#saved').value;
    return key && JSON.parse(localStorage.getItem(key)).session.history.length === 1;
  });
  await page.waitForTimeout(150);
  assert.deepEqual((await probe()).commands.slice(priorVote), ['stop'], 'voting must stop but never apply/start the next proposal');
  const archive = await saved();
  assert.equal(archive.session.trial.id, 2);
  assert.deepEqual(archive.receipts.map(r => [r.trial, r.slot, r.started]), [[1, 'a', true], [1, 'b', true]]);
  assert.ok(archive.receipts.every(r => r.ackFrames.length === 11 && Object.keys(r.parameters).length === 7));
  for (const receipt of archive.receipts) {
    for (const [path, value] of Object.entries(archive.session.fixed)) assert.equal(receipt.parameters[path], value);
  }
  assert.equal(await page.locator('#start-a').isDisabled(), true);
  assert.equal(await page.locator('#start-b').isDisabled(), true);

  await apply('a'); await start('a');
  const beforeReboot = (await probe()).commands.length;
  await page.evaluate(() => window.__tuningMock.reboot());
  await page.waitForFunction(() => document.querySelector('#start-a').disabled &&
    document.querySelector('#card-a').dataset.tested === 'false');
  assert.ok((await probe()).commands.slice(beforeReboot).every(command => !outputCommands.includes(command)));
  assert.equal(await page.locator('[data-choice="a"]').isDisabled(), true, 'a same-config reboot must revoke the old A/B evidence');
  await apply('a'); await start('a');
  await page.evaluate(() => window.__tuningMock.unplug());
  await page.locator('#connect:enabled').waitFor();
  assert.match(await page.locator('#output-state').innerText(), /未確認|不明/);
  assert.doesNotMatch(await page.locator('#output-state').innerText(), /実機出力なし/);
  assert.equal((await probe()).model.run_mode, 'live', 'the mock deliberately keeps Atom running after USB loss');

  await page.locator('#connect').click();
  await page.locator('#apply-b:enabled').waitFor();
  const beforeCancel = (await probe()).commands.length;
  const receiptCount = (await saved()).receipts.length;
  const cancelSession = (await saved()).session, candidate = cancelSession.trial.b;
  await page.evaluate(() => window.__tuningMock.holdNextSet());
  await page.locator('#apply-b').click();
  await page.waitForFunction(() => window.__tuningMock.snapshot().held);
  await page.locator('#stop').click();
  await page.evaluate(() => window.__tuningMock.releaseSet());
  await page.locator('#apply-b:enabled').waitFor();
  await page.waitForTimeout(100);
  const expectedCancellation = applyCommands(candidate, cancelSession);
  assert.deepEqual((await probe()).commands.slice(beforeCancel),
    [...expectedCancellation.slice(0, expectedCancellation.findIndex(command => command.startsWith('set mass.damping_ratio_x ')) + 1), 'stop']);
  assert.equal((await saved()).receipts.length, receiptCount, 'a canceled partial apply is not a successful receipt');
  assert.equal(await page.locator('#start-a').isDisabled(), true);
  assert.equal(await page.locator('#start-b').isDisabled(), true);
  assert.equal((await probe()).model.run_mode, 'idle');

  // Keyboard workflow: typing, held-key repeats and composition are not votes
  // or output intent. Normal Q/W each apply the complete candidate and then
  // deliberately start it; A/D each record one choice and stop.
  await page.locator('#handling').uncheck();
  await page.locator('#handling').blur();
  const beforeUnconfirmed = (await probe()).commands.length;
  await page.keyboard.press('q');
  await page.waitForTimeout(100);
  await page.locator('#apply-a:enabled').waitFor();
  assert.deepEqual((await probe()).commands.slice(beforeUnconfirmed), [],
    'Q must not send any command without the handling confirmation');
  assert.equal(await page.locator('#start-a').isDisabled(), true);
  await page.locator('#handling').check();
  const beforeIgnoredKeys = (await probe()).commands.length, ignoredHistory = (await saved()).session.history.length;
  await page.locator('#note').focus();
  for (const key of ['q', 'w', 'a', 'd', 's', 'x']) await page.keyboard.press(key);
  await page.locator('#note').blur();
  await page.evaluate(() => {
    for (const key of ['q', 'w', 'a', 'd', 's', 'x']) {
      document.dispatchEvent(new KeyboardEvent('keydown', { key, code: `Key${key.toUpperCase()}`, repeat: true, bubbles: true }));
      document.dispatchEvent(new KeyboardEvent('keydown', { key, code: `Key${key.toUpperCase()}`, isComposing: true, bubbles: true }));
    }
  });
  await page.waitForTimeout(100);
  assert.deepEqual((await probe()).commands.slice(beforeIgnoredKeys), []);
  assert.equal((await saved()).session.history.length, ignoredHistory);
  await page.locator('#note').fill('');
  await page.locator('#note').blur();

  await page.locator('#handling').check();
  await page.locator('#handling').focus();
  assert.equal(await page.evaluate(() => document.activeElement.id), 'handling', 'a checked checkbox is not a text-entry shortcut blocker');
  for (const [key, slot] of [['q', 'a'], ['w', 'b']]) {
    const before = (await probe()).commands.length, session = (await saved()).session;
    await page.keyboard.press(key);
    await page.waitForFunction(slot => document.querySelector(`#card-${slot}`).dataset.tested === 'true' &&
      !document.querySelector(`#apply-${slot}`).disabled, slot);
    assert.deepEqual((await probe()).commands.slice(before), [...applyCommands(session.trial[slot], session), ...startCommands(session)]);
    assert.equal((await probe()).model.run_mode, 'live');
    await assertLiveCannotRestart(slot);
  }
  const beforeD = (await probe()).commands.length, oldHistory = (await saved()).session.history.length;
  await page.keyboard.press('d');
  await page.waitForFunction(count => {
    const key = document.querySelector('#saved').value;
    return key && JSON.parse(localStorage.getItem(key)).session.history.length === count + 1;
  }, oldHistory);
  assert.deepEqual((await probe()).commands.slice(beforeD), ['stop']);
  assert.equal((await saved()).session.history.at(-1).choice, 'b');
  for (const key of ['Space', 'Escape']) {
    const before = (await probe()).commands.length;
    await page.keyboard.press(key);
    await page.waitForFunction(count => window.__tuningMock.snapshot().commands.length > count, before);
    assert.deepEqual((await probe()).commands.slice(before), ['stop']);
  }

  await apply('a');
  await page.locator('#handling').check();
  const beforeStartMismatch = (await probe()).commands.length, beforeStartReceipts = (await saved()).receipts;
  await page.evaluate(() => window.__tuningMock.mismatchNextState());
  await page.locator('#start-a:enabled').click();
  await page.waitForFunction(() => document.querySelector('#start-a').disabled && !document.querySelector('#apply-a').disabled);
  assert.deepEqual((await probe()).commands.slice(beforeStartMismatch), ['get state'],
    'changed applied numbers between Apply and Start must not emit output commands');
  assert.deepEqual((await saved()).receipts, beforeStartReceipts);
  assert.equal(beforeStartReceipts.at(-1).started, false);
  assert.equal((await probe()).model.run_mode, 'idle');

  // A Stop cancelled during material selection cannot relabel a retained
  // session. Escape is always available, including while the select has focus.
  const beforeMaterialCancel = (await probe()).commands.length, retainedWater = await saved();
  await page.evaluate(() => window.__tuningMock.holdNextStop());
  await page.locator('#demo').selectOption('marble');
  await page.waitForFunction(() => window.__tuningMock.snapshot().held);
  await page.keyboard.press('Escape');
  await page.evaluate(() => window.__tuningMock.releaseSet());
  await page.waitForFunction(() => document.querySelector('#demo').value === 'water' && !document.querySelector('#new-session').disabled);
  assert.deepEqual((await probe()).commands.slice(beforeMaterialCancel), ['stop', 'stop']);
  assert.deepEqual((await saved()).session, retainedWater.session);

  for (const [material, voteKey] of [['marble', 'a'], ['sand', 'd']]) {
    const previous = await saved(), beforeSwitch = (await probe()).commands.length;
    await page.locator('#demo').selectOption(material);
    await page.waitForFunction(() => !document.querySelector('#new-session').disabled &&
      document.querySelector('#session-caption').textContent.includes('条件を決めて'));
    assert.deepEqual((await probe()).commands.slice(beforeSwitch), ['stop'], 'material selection stops but never applies/starts');
    assert.equal((await probe()).model.run_mode, 'idle');
    assert.equal(await page.locator('#card-a').getAttribute('data-tested'), 'false');
    assert.equal(await page.locator('#card-b').getAttribute('data-tested'), 'false');
    assert.equal(await page.locator('#start-a').isDisabled(), true);
    assert.equal(await page.locator('[data-choice="a"]').isDisabled(), true);
    await page.locator('#new-session').click();
    await page.locator('#apply-a:enabled').waitFor();
    const fresh = await saved();
    assert.equal(fresh.session.version, 3); assert.equal(fresh.session.demo, material);
    assert.equal(fresh.session.history.length, 0); assert.equal(fresh.session.observations.length, 0);
    assert.equal(fresh.receipts.length, 0); assert.notEqual(fresh.session.id, previous.session.id);
    assert.equal(await page.evaluate(id => JSON.parse(localStorage.getItem(`fresnel-preference-v1:${id}`)).session.history.length,
      previous.session.id), previous.session.history.length, 'previous material history remains separate and intact');
    await page.locator('#handling').check(); await page.locator('#handling').focus();
    for (const [key, slot] of [['q', 'a'], ['w', 'b']]) {
      const before = (await probe()).commands.length, session = (await saved()).session;
      await page.keyboard.press(key);
      await page.waitForFunction(slot => document.querySelector(`#card-${slot}`).dataset.tested === 'true' &&
        !document.querySelector(`#apply-${slot}`).disabled, slot);
      assert.deepEqual((await probe()).commands.slice(before), [...applyCommands(session.trial[slot], session), ...startCommands(session)]);
      assert.equal((await probe()).model.preset, presetFor(session));
      assert.equal((await probe()).model.resolved.family, 'Granular');
      assert.equal((await probe()).model.run_mode, 'live');
    }
    const beforeVote = (await probe()).commands.length;
    await page.keyboard.press(voteKey);
    await page.waitForFunction(() => {
      const key = document.querySelector('#saved').value;
      return key && JSON.parse(localStorage.getItem(key)).session.history.length === 1 && !document.querySelector('#apply-a').disabled;
    });
    assert.deepEqual((await probe()).commands.slice(beforeVote), ['stop']);
    assert.equal((await saved()).session.history[0].choice, voteKey === 'a' ? 'a' : 'b');
    assert.equal((await saved()).session.observations.length, 1);
    assert.equal((await saved()).receipts.length, 2);
    assert.ok((await saved()).receipts.every(receipt => receipt.started && receipt.ackFrames.length === 11));
  }

  // Sand applies while Idle even though its runtime pile-active flag is false.
  // A real material/configuration change after Apply must revoke Start, rather
  // than presenting a different material with this session's preference label.
  await apply('a');
  assert.equal((await probe()).model.mass.demo.granular_pile_active, false);
  await page.locator('#handling').check();
  const beforeContext = (await probe()).commands.length;
  await page.evaluate(() => window.__tuningMock.setPresetFixture('liquid_small_box'));
  await page.locator('#start-a:enabled').click();
  await page.waitForFunction(() => document.querySelector('#status').textContent.includes('比較条件が変わりました') &&
    !document.querySelector('#apply-a').disabled);
  assert.deepEqual((await probe()).commands.slice(beforeContext), [], 'wrong material is rejected before any Start command');
  assert.equal((await probe()).model.run_mode, 'idle');
  assert.equal(await page.locator('#start-a').isDisabled(), true);
  await apply('a'); await start('a');
  const sandArchive = await saved(), sandPair = structuredClone(sandArchive.session.trial);
  assert.ok(sandArchive.receipts.every(receipt => Object.keys(receipt.parameters).length === 7 &&
    !Object.hasOwn(receipt.parameters, 'mass.damping_ratio_x') && !Object.hasOwn(receipt.parameters, 'mass.damping_ratio_y')));
  for (const receipt of sandArchive.receipts)
    assert.equal(receipt.parameters['mass.granular_dynamic_friction'], receipt.parameters['mass.granular_static_friction'] * (7 / 11));
  const beforeResume = (await probe()).commands.length;
  await page.locator('#import').setInputFiles({ name: 'sand-tuning.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(sandArchive)) });
  await page.waitForFunction(() => document.querySelector('#status').textContent.includes('保存した比較から再開') &&
    !document.querySelector('#apply-a').disabled);
  assert.deepEqual((await probe()).commands.slice(beforeResume), ['stop']);
  assert.deepEqual(await saved(), sandArchive);
  assert.deepEqual((await saved()).session.trial, sandPair);
  assert.equal(await page.locator('#demo').inputValue(), 'sand');
  assert.equal(await page.locator('#card-a').getAttribute('data-tested'), 'false');
  assert.equal(await page.locator('#card-b').getAttribute('data-tested'), 'false');
  assert.equal(await page.locator('#start-a').isDisabled(), true);
  assert.equal(await page.locator('[data-choice="a"]').isDisabled(), true);
  const malformedSand = structuredClone(sandArchive);
  malformedSand.receipts[0].parameters['mass.granular_dynamic_friction'] += .01;
  const beforeMalformed = (await probe()).commands.length;
  await page.locator('#import').setInputFiles({ name: 'bad-sand-ratio.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(malformedSand)) });
  await page.waitForFunction(() => document.querySelector('#status').textContent.includes('適用記録のパラメータが範囲外') &&
    !document.querySelector('#apply-a').disabled);
  assert.deepEqual(await saved(), sandArchive, 'corrupt receipt import preserves the active sand session/history');
  assert.deepEqual((await probe()).commands.slice(beforeMalformed), [], 'invalid import is rejected before output commands');

  // Archived v2 water sessions remain v2 and retain the original five-axis,
  // seven-value meaning, independent of the current material selector.
  const previousV2 = structuredClone(archive);
  previousV2.format = 'haptic-preference-v2'; previousV2.session.version = 2;
  previousV2.session.id = 'legacy-v2-browser-check'; delete previousV2.session.demo;
  await page.locator('#import').setInputFiles({ name: 'v2-water-tuning.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(previousV2)) });
  await page.waitForFunction(() => document.querySelector('#saved').value.endsWith('legacy-v2-browser-check') &&
    !document.querySelector('#apply-a').disabled);
  assert.equal((await saved()).session.version, 2);
  assert.equal(Object.hasOwn((await saved()).session, 'demo'), false);
  assert.equal(await page.locator('#demo').inputValue(), 'water');
  assert.deepEqual((await saved()).session.trial, previousV2.session.trial);
  assert.equal(await page.locator('#start-a').isDisabled(), true);
  await apply('a'); await start('a');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.__tuningMock.snapshot().model.run_mode === 'idle');

  // Import a genuine v1 archive rather than relabeling a new v2 session. Its
  // historical receipt is not current authority, and old FW remains supported.
  // Deliberately non-default local tilt configuration, independent of random
  // proposal order, makes an accidental preset reset observable for every axis.
  await page.evaluate(() => window.__tuningMock.setIdleTiltFixture([3.2, .43, .21, 2.7]));
  const beforeLegacy = await probe();
  const preservedTilt = Object.fromEntries(parameterPaths.slice(3).map(path => [path, beforeLegacy.parameters[path]]));
  const now = new Date().toISOString(), baseline = [.4, .3];
  const legacy = { format: 'haptic-preference-v1', context: '', session: {
    version: 1, id: 'legacy-browser-check', createdAt: now, mode: 'device', objective: 'Legacy water comparison', reference: '',
    baseline, incumbent: baseline, trial: { id: 1, a: baseline, b: [.7, .6] }, observations: [], history: [], seed: 17
  }, receipts: [] };
  legacy.receipts.push({ trial: 1, slot: 'a', parameters: parametersFor(baseline, legacy.session),
    ackFrames: [1, 2, 3, 4, 5, 6], at: now, started: true });
  await page.locator('#import').setInputFiles({ name: 'legacy-tuning.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(legacy)) });
  await page.waitForFunction(() => document.querySelector('#saved').value.endsWith('legacy-browser-check') &&
    !document.querySelector('#apply-a').disabled);
  assert.equal((await saved()).session.version, 1);
  assert.equal((await saved()).receipts[0].started, true);
  assert.equal(await page.locator('#start-a').isDisabled(), true, 'imported started receipts are historical, not Start authority');
  await page.evaluate(() => window.__tuningMock.setCurrentFirmware(false));
  await apply('a');
  for (const [path, value] of Object.entries(preservedTilt)) assert.equal((await probe()).parameters[path], value, `legacy A preserves ${path}`);
  assert.equal((await probe()).acknowledgements.at(-1).detail, 'mock_execution');
  await start('a');
  await apply('b'); await start('b');
  for (const [path, value] of Object.entries(preservedTilt)) assert.equal((await probe()).parameters[path], value, `legacy B preserves ${path}`);
  await page.locator('[data-choice="tie"]:enabled').click();
  await page.waitForFunction(() => {
    const key = document.querySelector('#saved').value;
    return key && JSON.parse(localStorage.getItem(key)).session.history.length === 1;
  });
  assert.ok((await saved()).receipts.every(receipt => receipt.ackFrames.length === 6 && Object.keys(receipt.parameters).length === 3));
  assert.equal((await probe()).model.run_mode, 'idle');
  assert.deepEqual((await probe()).forbidden, []);
  assert.deepEqual(forbiddenRequests, []);
  assert.deepEqual(errors, []);
  console.log('PASS browser tuning device: water, one marble and sand each run joint 5D Q/W comparisons with exact seven values, 11 ACKs and four-value tilt readback. Sand uses coupled friction, accepts Idle inactive-pile telemetry, roundtrips historical receipts/pairs and rejects a corrupt friction ratio without data loss. Material changes Stop/clear tested state and start fresh histories; Escape during material Stop restores the old selector/session; mismatched material blocks Start. Imported v1 three-value/six-ACK and v2 water seven-value compatibility remain. Old FW, final/pre-Start readback mismatch, A/D votes, typing/repeat/IME guards, explicit handling, no auto-next, Atom reboot, USB-loss unknown output and delayed-set cancellation pass. Real Chromium UI; no physical device, audio, microphone or third-party request.');
} catch (error) {
  console.error('Tuning device diagnostics:', JSON.stringify({ probe: await probe().catch(() => null),
    status: await page.locator('#status').textContent().catch(() => null), archive: await saved().catch(() => null) }));
  throw error;
} finally { await browser.close(); }
