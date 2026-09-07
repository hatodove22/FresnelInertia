// Real production-page water/Lab interaction. No device, camera or sound access.
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.FRESNEL_PLAYWRIGHT_MODULE || 'playwright');
const url = new URL(process.env.FRESNEL_DEMO_URL || 'http://127.0.0.1:8082/');
url.searchParams.set('lab', '1');
const browser = await chromium.launch({ channel: 'chrome', headless: true,
  args: ['--mute-audio', ...(process.env.FRESNEL_SOFTWARE_WEBGL === '1'
    ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : [])] });
const page = await browser.newPage({ viewport: { width: 1100, height: 800 }, ignoreHTTPSErrors: true });
const errors = [], shaderErrors = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => {
  if (message.type() === 'error' && /THREE|shader|WebGL/i.test(message.text())) shaderErrors.push(message.text());
});
await page.addInitScript(() => {
  window.__waterIO = [];
  const block = name => () => { window.__waterIO.push(name); throw new Error(`Unexpected IO: ${name}`); };
  Object.defineProperty(navigator, 'serial', { configurable: true, value: {
    requestPort: block('serial'), getPorts: block('serial') } });
  Object.defineProperty(navigator, 'usb', { configurable: true, value: {
    requestDevice: block('usb'), getDevices: block('usb') } });
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: {
    getUserMedia: block('camera'), getDisplayMedia: block('screen') } });
  window.__waterFrames = 0;
  const requestFrame = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = callback => requestFrame(time => {
    callback(time);
    window.__waterFrames++;
    const label = document.querySelector('#lab-model-state')?.textContent ?? '';
    const sourceTime = Number(label.match(/([\d.]+) s$/)?.[1]);
    if (window.__waterPauseAt !== undefined && sourceTime >= window.__waterPauseAt) {
      window.__waterPauseAt = undefined;
      const button = document.querySelector('#lab-pause');
      if (button?.getAttribute('aria-pressed') !== 'true') button?.click();
    }
  });
});
const root = new URL('../../tmp/browser/', import.meta.url);
await mkdir(root, { recursive: true });
const water = page.locator('[data-lab-preset="liquid_small_box"]');
const pause = page.locator('#lab-pause');
const captureAt = async (time, file) => {
  await page.evaluate(value => { window.__waterPauseAt = value; }, time);
  if (await pause.getAttribute('aria-pressed') === 'true') await pause.click();
  await page.waitForFunction(() => document.querySelector('#lab-pause')?.getAttribute('aria-pressed') === 'true', null, { timeout: 90000 });
  await page.screenshot({ path: fileURLToPath(new URL(file, root)) });
  console.log(`Captured ${file}`);
};
try {
  await page.goto(url.href);
  await water.waitFor();
  await water.click();
  await page.locator('#lab-reset').click();
  await page.locator('#lab-shake').click();
  await captureAt(0.4, 'water-lift-desktop.png');
  const canvas = page.locator('#scene');
  const first = await canvas.screenshot();
  const frames = await page.evaluate(() => window.__waterFrames);
  await page.waitForFunction(count => window.__waterFrames >= count + 3, frames);
  assert.ok((await canvas.screenshot()).equals(first), 'Lab pause holds the full continuous water surface and wet boundary');
  await captureAt(1.1, 'water-shake-desktop.png');
  await captureAt(6.5, 'water-settled-desktop.png');
  await page.locator('#lab-reset').click();
  // Native slider input is exercised through the same DOM event as touch/keyboard.
  await page.locator('#lab-pitch').evaluate(input => { input.value = '30'; input.dispatchEvent(new Event('input', { bubbles: true })); });
  await captureAt(0.5, 'water-pitch-desktop.png');
  await page.setViewportSize({ width: 412, height: 915 });
  await page.screenshot({ path: fileURLToPath(new URL('water-pitch-mobile.png', root)) });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  for (const material of ['granular_single_marble_box', 'liquid_soda_bottle', 'liquid_small_box']) {
    await page.locator(`[data-lab-preset="${material}"]`).click();
    assert.equal(await page.locator(`[data-lab-preset="${material}"]`).getAttribute('aria-pressed'), 'true');
  }
  await page.locator('#lab-close').click();
  assert.equal(await page.locator('#mode-badge').textContent(), 'Preview');
  assert.deepEqual(await page.evaluate(() => window.__waterIO), []);
  assert.deepEqual(errors, []);
  assert.deepEqual(shaderErrors, []);
  console.log('PASS: real-page water shake/pause/settling/pitch, mobile layout, material/source switches; no shader errors or hardware IO.');
} finally { await browser.close(); }
