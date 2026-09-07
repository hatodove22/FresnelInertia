// Browser smoke + mocked USB-serial flow. Never accesses a physical device.
// Supply FRESNEL_PLAYWRIGHT_MODULE if Playwright is provided by a host runtime.
import { createRequire } from 'node:module';
import { mkdir, readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.FRESNEL_PLAYWRIGHT_MODULE || 'playwright');
const channel = process.env.FRESNEL_BROWSER_CHANNEL || 'chrome';
const browser = await chromium.launch({
  ...(channel === 'chromium' ? {} : { channel }), headless: true,
  args: ['--mute-audio', ...(process.env.FRESNEL_SOFTWARE_WEBGL === '1' ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : [])]
});
const page = await browser.newPage({ ignoreHTTPSErrors: true,
  viewport: process.env.FRESNEL_SOFTWARE_WEBGL === '1' ? { width: 900, height: 650 } : { width: 1360, height: 900 } });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
await page.addInitScript(() => {
  // Observe completed browser frames, not an assumed 150 ms GPU warm-up.
  // Under software WebGL the first material compilation can take much longer.
  window.__completedFrames = 0;
  const requestFrame = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = callback => requestFrame(time => {
    callback(time);
    window.__completedFrames++;
  });
  // Observe real node scheduling, without accessing speakers or a device.
  window.__soundVoices = [];
  window.AudioContext = new Proxy(window.AudioContext, { construct(target,args) {
    const context = Reflect.construct(target,args), create = context.createBufferSource.bind(context);
    context.createBufferSource = () => {
      const source = create(), entry = { started:false, stopped:false, ended:false };
      window.__soundVoices.push(entry);
      const start = source.start.bind(source), stop = source.stop.bind(source);
      source.start = (...args) => { entry.started=true; return start(...args); };
      source.stop = (...args) => { entry.stopped=true; return stop(...args); };
      source.addEventListener('ended',()=>{entry.ended=true;}); return source;
    }; return context;
  } });
  const model = {
    timestamp_ms: 1, frame_counter: 1, preset: 'granular_single_marble_box', run_mode: 'safe_idle', evt_total:0,
    imu: { valid: true, accel_g: [Math.SQRT1_2, 0, Math.SQRT1_2], gyro_dps: [0, 0, 0] },
    mass: { pos_norm: [0, -1], vel_norm_s: [0, 0], energy: 0, fill: 0.04 },
    audio: { runtime_enabled: false, output_silenced: true },
    safety: { tilt_disarmed: true }, tilt_servo: { state: 2, fault: 0 },
    resolved: { family: 'Granular', container: {
      span_x_m: 0.06, span_y_m: 0.05, span_z_m: 0.04, fill: 0.04, headspace: 0.96,
      viscosity: 0.01, particle_count: 0.03, particle_hardness: 1
    }, model: { coherent_container_demo: true, device_frame_transform: true } }
  };
  let readableController;
  let timer;
  let id = 0;
  const profileParameters = { 'resonance.master_gain': .48, 'mass.damping_ratio_x': .35, 'mass.damping_ratio_y': .35,
    'tilt.max_tilt_deg': 10, 'tilt.k_cm': .35, 'tilt.k_tau': .25, 'tilt.k_phi': 4 };
  window.__profileParameters = () => ({ ...profileParameters });
  const decoder = new TextDecoder();
  window.__mockCommands = [];
  const line = value => readableController?.enqueue(new TextEncoder().encode(value + '\n'));
  const telemetry = () => {
    model.frame_counter++; model.timestamp_ms += 100;
    line(JSON.stringify(model));
  };
  window.__pauseMock = () => clearInterval(timer);
  window.__mockHit = () => {
    model.evt_total++; model.last_event = { type:'WallHit', primary_wall:'Front', amplitude:0.8 };
    telemetry();
  };
  window.__servoRetry = active => {
    model.tilt_servo = active ? { state: 1, fault: 2 } : { state: 4, fault: 0 };
    telemetry();
  };
  const port = {
    readable: null, writable: null,
    async open() {
      this.readable = new ReadableStream({ start(controller) { readableController = controller; }, cancel() { readableController = null; } });
      this.writable = new WritableStream({ write(data) {
        for (const command of decoder.decode(data).trim().split('\n')) {
          window.__mockCommands.push(command);
          if (command === 'status') { line('espnow_bridge: paired=1 session=1234ABCD'); telemetry(); continue; }
          const op = command === 'get state' ? 2 : command === 'stop' ? 3 : command === 'live' ? 4 :
            command.startsWith('audio ') ? 5 : command.startsWith('preset load ') ? 6 :
            command.startsWith('set ') ? 7 : command.startsWith('tilt clear') ? 10 : 9;
          line(`haptic_link_tx: request=${++id} operation=${op}`);
          if (command === 'stop') {
            model.run_mode = 'safe_idle'; model.audio.runtime_enabled = false; model.safety.tilt_disarmed = true;
            if (model.tilt_servo.state === 1 && model.tilt_servo.fault === 2) model.tilt_servo.fault = 0;
            if (window.__faultOnNextStop) {
              model.tilt_servo = { state: 5, fault: 2 };
              window.__faultOnNextStop = false;
            }
            if (!model.tilt_servo.fault) model.tilt_servo.state = 2;
          }
          if (command === 'tilt clear') {
            if (window.__failNextClear) {
              window.__failNextClear = false;
              line(`haptic_link_ack: request=${id} result=rejected session=1234ABCD frame=${model.frame_counter} detail=tilt_preflight_failed`);
              telemetry(); continue;
            }
            model.tilt_servo = { state: 2, fault: 0 };
          }
          if (command === 'live') model.run_mode = 'live';
          if (command.startsWith('audio ')) model.audio.runtime_enabled = command === 'audio on';
          if (command.startsWith('tilt ') && command !== 'tilt clear') {
            model.safety.tilt_disarmed = command !== 'tilt on';
            if (!model.tilt_servo.fault) model.tilt_servo.state = command === 'tilt on' ? 4 : 2;
          }
          if (command.startsWith('preset load ')) {
            // Simulate an accepted preset followed by a reboot to the boot
            // preset before its first telemetry snapshot reaches the client.
            model.preset = window.__resetBeforePresetSnapshot ? 'liquid_small_box' : command.slice(12);
            window.__resetBeforePresetSnapshot = false;
            model.resolved.family = model.preset.startsWith('liquid') ? 'Liquid' : 'Granular';
            model.resolved.container.fill = model.mass.fill = 0.55;
            model.resolved.container.span_x_m = 0.09;
            Object.assign(profileParameters, { 'resonance.master_gain': .48, 'mass.damping_ratio_x': .35, 'mass.damping_ratio_y': .35 });
          }
          if (command.startsWith('set ')) {
            const [, path, raw] = command.split(' ');
            if (Object.hasOwn(profileParameters, path)) profileParameters[path] = Number(raw);
          }
          if (command.startsWith('set container.fill ')) model.resolved.container.fill = model.mass.fill = Number(command.split(' ')[2]);
          if (command.startsWith('set container.headspace ')) model.resolved.container.headspace = Number(command.split(' ')[2]);
          const request = id;
          const finish = () => {
            const detail = command === 'get state' ? `tilt_v1=${['tilt.max_tilt_deg', 'tilt.k_cm', 'tilt.k_tau', 'tilt.k_phi'].map(path => profileParameters[path].toPrecision(6)).join(',')}` : 'ok';
            line(`haptic_link_ack: request=${request} result=applied session=1234ABCD frame=${model.frame_counter} detail=${detail}`);
            telemetry();
          };
          if (window.__holdProfileSet && command.startsWith('set mass.damping_ratio_x ')) {
            window.__holdProfileSet = false; window.__releaseProfileSet = finish;
          } else finish();
        }
      } });
      timer = setInterval(telemetry, 100);
    },
    async close() { clearInterval(timer); }
  };
  Object.defineProperty(navigator, 'serial', { configurable: true, value: { requestPort: async () => port } });
});
try {
  await page.goto(process.env.FRESNEL_DEMO_URL || 'https://localhost:8081', { waitUntil: 'networkidle' });
  await page.locator('#device-status').filter({ hasText: 'プレビュー' }).waitFor();
  console.log('Browser: preview loaded; checking mock connected flow.');
  assert.equal(await page.locator('vite-error-overlay').count(), 0);
  assert.equal(await page.locator('#device-start').isDisabled(), true);
  assert.equal(await page.locator('#preset-select').isVisible(), true, 'Disconnected mode exposes its preview picker');
  assert.equal(await page.locator('#device-preset').isVisible(), false, 'Disconnected mode hides the inactive device picker');
  assert.equal(await page.locator('[data-lab-preset]').first().isVisible(), false);
  await page.locator('#device-connect').click();
  await page.locator('#device-start:enabled').waitFor();
  assert.equal(await page.locator('#device-preset').isVisible(), true, 'Connected mode exposes its device picker');
  assert.equal(await page.locator('#preset-select').isVisible(), false, 'Connected mode hides the preview picker');
  assert.equal(await page.locator('[data-lab-preset]').first().isVisible(), false);
  assert.match(await page.locator('#device-detail').innerText(), /60 × 50 × 40 mm/);
  assert.deepEqual(await page.evaluate(() => window.__mockCommands), ['status', 'get state']);
  await page.locator('#sound-toggle').click();
  await page.waitForFunction(() => document.querySelector('#sound-toggle').getAttribute('aria-pressed') === 'true');
  assert.equal(await page.locator('#sound-toggle').getAttribute('aria-pressed'),'true');
  assert.equal(await page.evaluate(() => window.__soundVoices.length),0,'Idle does not sound or auto-arm');
  assert.deepEqual(await page.evaluate(() => window.__mockCommands), ['status', 'get state']);
  // A focused native button activates once; Space cannot arm physical output.
  await page.locator('#device-start').focus();
  await page.keyboard.press('Space');
  assert.deepEqual(await page.evaluate(() => window.__mockCommands), ['status', 'get state']);
  await page.keyboard.press('Enter');
  await page.locator('#device-status').filter({ hasText: 'LIVE · 振動 ON · 傾き ON' }).waitFor();
  assert.deepEqual(await page.evaluate(() => window.__mockCommands.slice(2)), ['live', 'audio on', 'tilt on']);
  const liveFrames = await page.evaluate(() => window.__completedFrames);
  await page.waitForFunction(count => window.__completedFrames >= count + 2, liveFrames);
  await page.evaluate(() => window.__mockHit());
  await page.waitForFunction(() => window.__soundVoices.some(v=>v.started));
  const soundCount = await page.evaluate(() => window.__soundVoices.length);
  await page.waitForTimeout(300);
  assert.equal(await page.evaluate(() => window.__soundVoices.length),soundCount,'held last_event must not replay');
  const beforeRetry = await page.evaluate(() => window.__mockCommands.length);
  await page.evaluate(() => window.__servoRetry(true));
  await page.locator('#device-status').filter({ hasText: 'サーボ通信を再試行中' }).waitFor();
  assert.equal(await page.locator('#device-start').isDisabled(), true);
  assert.equal(await page.locator('#device-stop').isEnabled(), true);
  await page.evaluate(() => window.__servoRetry(false));
  await page.locator('#device-status').filter({ hasText: 'LIVE · 振動 ON · 傾き ON' }).waitFor();
  assert.equal(await page.locator('#device-start').isEnabled(), true);
  assert.deepEqual(await page.evaluate(n => window.__mockCommands.slice(n), beforeRetry), []);
  // Explicit Stop supersedes the transient retry; the browser never auto-arms.
  await page.evaluate(() => window.__servoRetry(true));
  // Escape has priority even while the material selector has focus.
  await page.locator('#device-preset').focus();
  await page.keyboard.press('Escape');
  await page.locator('#device-status').filter({ hasText: 'IDLE · 振動 OFF · 傾き OFF' }).waitFor();
  assert.deepEqual(await page.evaluate(n => window.__mockCommands.slice(n), beforeRetry), ['stop']);
  await page.waitForTimeout(50);
  assert.equal(await page.evaluate(() => window.__soundVoices.every(v=>v.stopped||v.ended)),true,'Stop cancels sound tails');
  await page.locator('#sound-toggle').click();
  await page.locator('#scene').click();
  await page.keyboard.press('Enter');
  await page.locator('#device-status').filter({ hasText: 'LIVE · 振動 ON · 傾き ON' }).waitFor();
  await page.locator('#device-preset:enabled').selectOption('liquid_small_box');
  await page.locator('#device-status').filter({ hasText: 'IDLE · 振動 OFF · 傾き OFF' }).waitFor();
  await page.waitForFunction(() => document.querySelector('#device-detail').textContent.includes('Liquid · 90 × 50 × 40 mm'));
  await page.locator('.device-settings > summary').click();
  await page.locator('#device-fill').fill('37');
  await page.locator('#device-apply-fill:enabled').click();
  await page.waitForFunction(() => document.querySelector('#device-detail').textContent.includes('37%'));
  await page.locator('#device-start:enabled').click();
  await page.locator('#device-status').filter({ hasText: 'LIVE · 振動 ON · 傾き ON' }).waitFor();
  await page.locator('#device-stop').click();
  await page.locator('#device-status').filter({ hasText: 'IDLE · 振動 OFF · 傾き OFF' }).waitFor();
  // Portable selected result: importing/selecting is local-only. Normal demo
  // application requires this exact material and leaves outputs stopped.
  const profile = { format: 'haptic-tuning-profile-v1', sourceSession: { id: 'browser-profile-example', version: 3, mode: 'rehearsal' },
    demo: 'water', preset: 'liquid_small_box', objective: '実物らしさ', reference: 'ブラウザーのみ', createdAt: '2026-09-08T00:00:00.000Z',
    comparisonCount: 0, reviewStatus: 'rehearsal-only', parameters: {
      'resonance.master_gain': .36, 'mass.damping_ratio_x': .47, 'mass.damping_ratio_y': .47,
      'tilt.max_tilt_deg': 6, 'tilt.k_cm': .3, 'tilt.k_tau': .2, 'tilt.k_phi': 3
    } };
  const beforeImport = await page.evaluate(() => window.__mockCommands.length);
  await page.locator('.device-profile-settings > summary').click();
  await page.locator('#device-profile-import').setInputFiles({ name: 'selection.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(profile)) });
  await page.locator('#device-profile-detail').filter({ hasText: 'まだ適用していません' }).waitFor();
  assert.match(await page.locator('#device-profile-detail').innerText(), /練習のみ.*触覚評価なし.*比較0件/);
  assert.deepEqual(await page.evaluate(n => window.__mockCommands.slice(n), beforeImport), []);
  if (await page.locator('#device-preset').inputValue() !== profile.preset) {
    assert.equal(await page.locator('#device-profile-apply').isDisabled(), true);
    await page.locator('#device-preset:enabled').selectOption(profile.preset);
  }
  await page.locator('#device-profile-apply:enabled').waitFor();
  const beforeProfileApply = await page.evaluate(() => window.__mockCommands.length);
  await page.locator('#device-profile-apply').click();
  await page.locator('#device-profile-detail').filter({ hasText: '7値の実行ACK' }).waitFor();
  const profileCommands = ['stop', 'get state', `preset load ${profile.preset}`,
    ...Object.entries(profile.parameters).map(([path, value]) => `set ${path} ${value}`), 'get state'];
  assert.deepEqual(await page.evaluate(n => window.__mockCommands.slice(n), beforeProfileApply), profileCommands);
  assert.deepEqual(await page.evaluate(() => window.__profileParameters()), profile.parameters);
  assert.match(await page.locator('#device-status').innerText(), /IDLE.*振動 OFF.*傾き OFF/);
  assert.equal(await page.locator('#device-start').isEnabled(), true, 'Start remains an explicit separate action');
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#device-profile-export').click();
  const downloaded = await downloadPromise;
  assert.deepEqual(JSON.parse(await readFile(await downloaded.path(), 'utf8')), profile);

  const beforeProfileCancel = await page.evaluate(() => window.__mockCommands.length);
  await page.evaluate(() => { window.__holdProfileSet = true; window.__releaseProfileSet = null; });
  await page.locator('#device-profile-apply:enabled').click();
  await page.waitForFunction(() => typeof window.__releaseProfileSet === 'function');
  await page.locator('#device-stop').click();
  await page.evaluate(() => window.__releaseProfileSet());
  await page.locator('#device-profile-apply:enabled').waitFor();
  assert.deepEqual(await page.evaluate(n => window.__mockCommands.slice(n), beforeProfileCancel), [...profileCommands.slice(0, 5), 'stop']);
  assert.equal(await page.locator('#device-start').isDisabled(), true, 'a canceled partial profile is not a completed selection');
  await page.locator('#device-profile-apply').click();
  await page.locator('#device-profile-detail').filter({ hasText: '7値の実行ACK' }).waitFor();
  assert.equal(await page.locator('#device-start').isEnabled(), true);
  await page.locator('.device-profile-settings > summary').click();
  await page.evaluate(() => { window.__resetBeforePresetSnapshot = true; });
  await page.locator('#device-preset:enabled').selectOption('granular_sand_box');
  await page.locator('#device-status').filter({ hasText: '材質を適用中' }).waitFor();
  await page.locator('#device-connect:enabled').waitFor();
  assert.equal(await page.locator('#device-start').isDisabled(), true);
  const beforeRefresh = await page.evaluate(() => window.__mockCommands.length);
  await page.locator('#device-connect').click();
  await page.locator('#device-status').filter({ hasText: 'IDLE · 振動 OFF · 傾き OFF' }).waitFor();
  assert.equal(await page.locator('#device-preset').inputValue(), 'liquid_small_box');
  assert.equal(await page.locator('#device-start').isEnabled(), true);
  assert.deepEqual(await page.evaluate(n => window.__mockCommands.slice(n), beforeRefresh), ['get state']);
  await page.locator('.device-settings > summary').click();
  // A material-switch fault must expose recovery with settings collapsed.
  await page.locator('#device-start:enabled').click();
  await page.locator('#device-status').filter({ hasText: 'LIVE · 振動 ON · 傾き ON' }).waitFor();
  await page.evaluate(() => { window.__faultOnNextStop = true; });
  await page.locator('#device-preset:enabled').selectOption('granular_sand_box');
  await page.locator('#device-status').filter({ hasText: 'サーボ fault 2' }).waitFor();
  assert.equal(await page.locator('.device-settings').getAttribute('open'), null);
  assert.equal(await page.locator('#device-clear').isVisible(), true);
  assert.match(await page.locator('#device-status').innerText(), /停止してサーボ復帰/);
  const beforeRecovery = await page.evaluate(() => window.__mockCommands.length);
  await page.evaluate(() => { window.__failNextClear = true; });
  await page.locator('#device-clear:enabled').click();
  await page.locator('#device-status').filter({ hasText: 'tilt_preflight_failed' }).waitFor();
  assert.match(await page.locator('#device-status').innerText(), /サーボ fault 2/);
  await page.locator('#device-clear:enabled').click();
  await page.locator('#device-status').filter({ hasText: 'IDLE · 振動 OFF · 傾き OFF' }).waitFor();
  await page.locator('#device-start:enabled').waitFor();
  assert.deepEqual(await page.evaluate(n => window.__mockCommands.slice(n), beforeRecovery),
    ['stop', 'tilt clear', 'stop', 'tilt clear', 'get state']);
  console.log('Browser: rejected recovery/retry passed; checking deliberate restart and captures.');
  await page.locator('#device-start').click();
  await page.locator('#device-status').filter({ hasText: 'LIVE · 振動 ON · 傾き ON' }).waitFor();
  await page.locator('#device-stop').click();
  await page.locator('#device-status').filter({ hasText: 'IDLE · 振動 OFF · 傾き OFF' }).waitFor();
  await mkdir('../tmp/browser', { recursive: true });
  await page.screenshot({ path: '../tmp/browser/connected-demo-desktop.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  if (await page.locator('.device-settings').evaluate(details => !details.open)) {
    await page.locator('.device-settings > summary').click();
  }
  await page.locator('.hud-scroll').evaluate(scroll => { scroll.scrollTop = scroll.scrollHeight; });
  const mobileStop = await page.locator('#device-stop').evaluate(stop => {
    const rect = stop.getBoundingClientRect(), hud = stop.closest('.hud').getBoundingClientRect();
    const scroll = document.querySelector('.hud-scroll');
    const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    return { width: rect.width, height: rect.height,
      insideHud: rect.top >= hud.top && rect.bottom <= hud.bottom + 1 && rect.left >= hud.left && rect.right <= hud.right + 1,
      insideViewport: rect.top >= 0 && rect.bottom <= innerHeight && rect.left >= 0 && rect.right <= innerWidth,
      unobscured: hit === stop || stop.contains(hit),
      scrolled: scroll.scrollHeight > scroll.clientHeight && scroll.scrollTop > 0 };
  });
  assert.ok(mobileStop.scrolled, 'Mobile settings exercise the scrolling HUD content');
  assert.ok(mobileStop.width > 0 && mobileStop.height > 0, 'Mobile Stop has a visible touch target');
  assert.equal(mobileStop.insideHud, true, 'Mobile Stop stays inside the HUD after settings scroll');
  assert.equal(mobileStop.insideViewport, true, 'Mobile Stop stays inside the viewport after settings scroll');
  assert.equal(mobileStop.unobscured, true, 'Mobile Stop remains the hit target after settings scroll');
  await page.screenshot({ path: '../tmp/browser/connected-demo-mobile.png' });
  await page.evaluate(() => window.__pauseMock());
  await page.locator('#device-status').filter({ hasText: '実機データ待ち' }).waitFor();
  assert.equal(await page.locator('#device-start').isDisabled(), true);
  assert.equal(await page.locator('#device-stop').isEnabled(), true);
  assert.deepEqual(errors, []);
  console.log('PASS browser demo: portable profile import/export and exact seven-value stopped apply, no auto-start and partial Stop cancellation; exclusive source pickers, preview, applied state, independent speaker enable/one reported hit/no repeat/Stop, keyboard Enter/Escape and focused Start Space suppression, firmware-owned servo retry/Stop, material/fill, preset-reset refresh, visible servo recovery with rejection/retry, explicit restart, pinned mobile Stop through settings scroll, stale state; no page errors. Mock transport only.');
} finally { await browser.close(); }
