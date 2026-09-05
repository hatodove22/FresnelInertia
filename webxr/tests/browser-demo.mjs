// Browser smoke + mocked USB-serial flow. Never accesses a physical device.
// Supply FRESNEL_PLAYWRIGHT_MODULE if Playwright is provided by a host runtime.
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.FRESNEL_PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ ignoreHTTPSErrors: true, viewport: { width: 1360, height: 900 } });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
await page.addInitScript(() => {
  const model = {
    timestamp_ms: 1, frame_counter: 1, preset: 'granular_single_marble_box', run_mode: 'safe_idle',
    imu: { valid: true, accel_g: [Math.SQRT1_2, 0, Math.SQRT1_2], gyro_dps: [0, 0, 0] },
    mass: { pos_norm: [0, -1], vel_norm_s: [0, 0], energy: 0, fill: 0.04 },
    audio: { runtime_enabled: false, output_silenced: true },
    safety: { tilt_disarmed: true }, tilt_servo: { state: 1, fault: 0 },
    resolved: { family: 'Granular', container: {
      span_x_m: 0.06, span_y_m: 0.05, span_z_m: 0.04, fill: 0.04, headspace: 0.96,
      viscosity: 0.01, particle_count: 0.03, particle_hardness: 1
    }, model: { coherent_container_demo: true, device_frame_transform: true } }
  };
  let readableController;
  let timer;
  let id = 0;
  const decoder = new TextDecoder();
  window.__mockCommands = [];
  const line = value => readableController?.enqueue(new TextEncoder().encode(value + '\n'));
  const telemetry = () => {
    model.frame_counter++; model.timestamp_ms += 100;
    line(JSON.stringify(model));
  };
  window.__pauseMock = () => clearInterval(timer);
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
          if (command === 'stop') { model.run_mode = 'safe_idle'; model.audio.runtime_enabled = false; model.safety.tilt_disarmed = true; }
          if (command === 'live') model.run_mode = 'live';
          if (command.startsWith('audio ')) model.audio.runtime_enabled = command === 'audio on';
          if (command.startsWith('tilt ') && command !== 'tilt clear') model.safety.tilt_disarmed = command !== 'tilt on';
          if (command.startsWith('preset load ')) {
            // Simulate an accepted preset followed by a reboot to the boot
            // preset before its first telemetry snapshot reaches the client.
            model.preset = window.__resetBeforePresetSnapshot ? 'liquid_small_box' : command.slice(12);
            window.__resetBeforePresetSnapshot = false;
            model.resolved.family = model.preset.startsWith('liquid') ? 'Liquid' : 'Granular';
            model.resolved.container.fill = model.mass.fill = 0.55;
            model.resolved.container.span_x_m = 0.09;
          }
          if (command.startsWith('set container.fill ')) model.resolved.container.fill = model.mass.fill = Number(command.split(' ')[2]);
          if (command.startsWith('set container.headspace ')) model.resolved.container.headspace = Number(command.split(' ')[2]);
          line(`haptic_link_ack: request=${id} result=applied session=1234ABCD frame=${model.frame_counter} detail=ok`);
          telemetry();
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
  assert.equal(await page.locator('vite-error-overlay').count(), 0);
  assert.equal(await page.locator('#device-start').isDisabled(), true);
  await page.locator('#device-connect').click();
  await page.locator('#device-start:enabled').waitFor();
  assert.match(await page.locator('#device-detail').innerText(), /60 × 50 × 40 mm/);
  assert.deepEqual(await page.evaluate(() => window.__mockCommands), ['status', 'get state']);
  await page.locator('#device-start').click();
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
  await mkdir('../tmp/browser', { recursive: true });
  await page.screenshot({ path: '../tmp/browser/connected-demo-desktop.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: '../tmp/browser/connected-demo-mobile.png' });
  await page.evaluate(() => window.__pauseMock());
  await page.locator('#device-status').filter({ hasText: '実機データ待ち' }).waitFor();
  assert.equal(await page.locator('#device-start').isDisabled(), true);
  assert.equal(await page.locator('#device-stop').isEnabled(), true);
  assert.deepEqual(errors, []);
  console.log('PASS browser demo: preview, resolved applied state, explicit Start/Stop, material/fill, read-only recovery after preset reset, stale state; no page errors. Mock transport only.');
} finally { await browser.close(); }
