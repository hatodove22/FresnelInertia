// Full Web heartbeat integration against a mock StampC5. No physical USB,
// serial port or speaker is used; source pulse values are supplied explicitly.
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.FRESNEL_PLAYWRIGHT_MODULE || 'playwright');
const channel = process.env.FRESNEL_BROWSER_CHANNEL || 'chrome';
const browser = await chromium.launch({ headless: true,
  ...(channel === 'chromium' ? {} : { channel }),
  args: ['--mute-audio', ...(process.env.FRESNEL_SOFTWARE_WEBGL === '1'
    ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : [])] });
const page = await browser.newPage({ viewport: { width: 900, height: 650 }, ignoreHTTPSErrors: true });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
await page.addInitScript(() => {
  window.__heartbeatFrames = 0; window.__heartbeatVoices = []; window.__heartbeatCommands = [];
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = callback => raf(time => { callback(time); window.__heartbeatFrames++; });
  window.AudioContext = new Proxy(window.AudioContext, { construct(target, args) {
    const context = Reflect.construct(target, args), create = context.createBufferSource.bind(context);
    context.createBufferSource = () => {
      const source = create(), info = { started: false, ended: false, stopped: false };
      window.__heartbeatVoices.push(info);
      const start = source.start.bind(source), stop = source.stop.bind(source);
      source.start = (...args) => { info.started = true; return start(...args); };
      source.stop = (...args) => { info.stopped = true; return stop(...args); };
      source.addEventListener('ended', () => { info.ended = true; });
      return source;
    };
    return context;
  } });
  const model = { timestamp_ms: 1000, frame_counter: 1, evt_total: 0,
    preset: 'heartbeat_soft_object', run_mode: 'idle',
    imu: { valid: true, accel_g: [0, Math.SQRT1_2, Math.SQRT1_2], gyro_dps: [0, 0, 0] },
    mass: { pos_norm: [0, 0], vel_norm_s: [0, 0], energy: 0, fill: 0.8,
      heartbeat: { enabled: true, phase: 0, primary: 0, secondary: 0, contraction: 0, bpm: 72, beat_sequence: 0 } },
    audio: { runtime_enabled: false, output_silenced: true }, safety: { tilt_disarmed: true },
    tilt_servo: { state: 2, fault: 0 },
    resolved: { family: 'Custom', container: { span_x_m: 0.065, span_y_m: 0.085, span_z_m: 0.05,
      fill: 0.8, headspace: 0.2, viscosity: 0, particle_count: 0, particle_hardness: 0 },
      model: { coherent_container_demo: false, device_frame_transform: true } } };
  let controller, timer, id = 0;
  const line = value => controller?.enqueue(new TextEncoder().encode(`${value}\n`));
  const telemetry = () => { model.timestamp_ms += 100; model.frame_counter++; line(JSON.stringify(model)); };
  window.__heartbeatSet = (contraction, strength = 0, primary = true) => {
    Object.assign(model.mass.heartbeat, { contraction, phase: primary ? 0.12 : 0.32,
      primary: primary ? strength : 0, secondary: primary ? 0 : strength });
    if (strength) {
      model.evt_total++;
      if (primary) model.mass.heartbeat.beat_sequence++;
      model.last_event = { type: 'HeartbeatPulse', primary_wall: 'None', amplitude: strength };
    }
    telemetry();
  };
  window.__heartbeatPauseWire = () => clearInterval(timer);
  window.__heartbeatResumeWire = () => { telemetry(); timer = setInterval(telemetry, 100); };
  const port = {
    async open() {
      this.readable = new ReadableStream({ start(value) { controller = value; }, cancel() { controller = null; } });
      this.writable = new WritableStream({ write(bytes) {
        for (const command of new TextDecoder().decode(bytes).trim().split('\n')) {
          window.__heartbeatCommands.push(command);
          if (command === 'status') { line('espnow_bridge: paired=1 session=1234ABCD'); telemetry(); continue; }
          const operation = command === 'get state' ? 2 : command === 'stop' ? 3 : command === 'live' ? 4 :
            command.startsWith('audio ') ? 5 : command.startsWith('preset load ') ? 6 : 9;
          line(`haptic_link_tx: request=${++id} operation=${operation}`);
          if (command === 'stop') { model.run_mode = 'idle'; model.audio.runtime_enabled = false;
            model.audio.output_silenced = true; model.safety.tilt_disarmed = true; }
          if (command === 'live') model.run_mode = 'live';
          if (command === 'audio on') { model.audio.runtime_enabled = true; model.audio.output_silenced = false; }
          if (command === 'tilt on') model.safety.tilt_disarmed = false;
          line(`haptic_link_ack: request=${id} result=applied session=1234ABCD frame=${model.frame_counter} detail=ok`);
          telemetry();
        }
      } });
      timer = setInterval(telemetry, 100);
    },
    async close() { clearInterval(timer); }
  };
  Object.defineProperty(navigator, 'serial', { configurable: true, value: { requestPort: async () => port } });
  Object.defineProperty(navigator, 'usb', { configurable: true, value: {
    requestDevice: async () => { throw new Error('Physical USB forbidden in this test'); } } });
});
const frames = async (count = 3) => {
  const before = await page.evaluate(() => window.__heartbeatFrames);
  await page.waitForFunction(({ before, count }) => window.__heartbeatFrames >= before + count, { before, count });
};
try {
  await page.goto(process.env.FRESNEL_DEMO_URL || 'http://127.0.0.1:8082/', { waitUntil: 'networkidle' });
  await page.locator('#device-connect').click();
  await page.locator('#device-start:enabled').waitFor();
  await frames();
  assert.equal(await page.locator('#device-preset').inputValue(), 'heartbeat_soft_object');
  assert.match(await page.locator('#device-detail').innerText(), /65 × 85 × 50 mm/);
  assert.deepEqual(await page.evaluate(() => window.__heartbeatCommands), ['status', 'get state']);
  await page.locator('#sound-toggle').click();
  await page.waitForFunction(() => document.querySelector('#sound-toggle').getAttribute('aria-pressed') === 'true');
  assert.equal(await page.evaluate(() => window.__heartbeatVoices.length), 0, 'Idle heartbeat is silent');
  await page.locator('#device-start').click();
  await page.locator('#device-status').filter({ hasText: 'LIVE · 振動 ON · 傾き ON' }).waitFor();
  await frames();
  const relaxed = await page.locator('#scene').screenshot();
  await page.evaluate(() => window.__heartbeatSet(1, 0.8));
  await page.waitForFunction(() => window.__heartbeatVoices.length === 1);
  await frames();
  const contracted = await page.locator('#scene').screenshot();
  assert.notDeepEqual(contracted, relaxed, 'reported contraction deforms the real WebGL presentation');
  await frames(5);
  assert.equal(await page.evaluate(() => window.__heartbeatVoices.length), 1, 'held last event does not retrigger');
  await page.evaluate(() => window.__heartbeatSet(0.6, 0.45, false));
  await page.waitForFunction(() => window.__heartbeatVoices.length === 2);
  await page.evaluate(() => window.__heartbeatPauseWire());
  await page.locator('#device-status').filter({ hasText: '実機データ待ち' }).waitFor();
  const held = await page.locator('#scene').screenshot();
  await frames(3);
  assert.deepEqual(await page.locator('#scene').screenshot(), held, 'stale radio cannot advance heartbeat geometry');
  assert.equal(await page.evaluate(() => window.__heartbeatVoices.length), 2);
  await page.evaluate(() => window.__heartbeatResumeWire());
  await page.locator('#device-start:enabled').waitFor();
  await frames();
  assert.equal(await page.evaluate(() => window.__heartbeatVoices.length), 2, 'recovery cannot replay stale beat');
  await page.locator('#device-stop').click();
  await page.locator('#device-status').filter({ hasText: 'IDLE · 振動 OFF · 傾き OFF' }).waitFor();
  assert.ok(await page.evaluate(() => window.__heartbeatVoices.every(v => v.ended || v.stopped)));
  const commandCount = await page.evaluate(() => window.__heartbeatCommands.length);
  await page.locator('#device-connect').click();
  await page.locator('#device-start:enabled').waitFor();
  assert.deepEqual(await page.evaluate(n => window.__heartbeatCommands.slice(n), commandCount), ['get state']);
  assert.deepEqual(errors, []);
  console.log('PASS heartbeat WebGL state deformation, doublet events, duplicate/stale/recovery silence, Stop and read-only refresh (mock transport only).');
} finally {
  await browser.close();
}
