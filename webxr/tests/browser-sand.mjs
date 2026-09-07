// Production-page sand verification: observe real C++ snapshots and WebGL
// uploads, never replace the model/renderer or request hardware/audio access.
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

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
const output = new URL('../../tmp/browser/', import.meta.url);
await mkdir(output, { recursive: true });

await page.addInitScript(() => {
  const forbidden = [];
  const block = name => () => { forbidden.push(name); throw Error(`Unexpected sand-test IO: ${name}`); };
  Object.defineProperty(navigator, 'serial', { configurable: true, value: {
    requestPort: block('serial'), getPorts: block('serial') } });
  Object.defineProperty(navigator, 'usb', { configurable: true, value: {
    requestDevice: block('usb'), getDevices: block('usb') } });
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: {
    getUserMedia: block('camera'), getDisplayMedia: block('screen') } });
  window.AudioContext = block('audio');
  if (window.webkitAudioContext) window.webkitAudioContext = block('audio');
  let source = null, matrices = null, frames = 0, pauseAt = null;
  let flowPeak = 0, uploads = 0;
  const parse = JSON.parse;
  JSON.parse = function (...args) {
    const value = parse.apply(this, args);
    if (value?.source === 'production-cpp-preview') {
      source = { preset: value.preset, timeS: value.timeS, pileSlope: value.mass.pileSlope,
        flow: value.mass.granularFlow, active: value.mass.granularPileActive,
        massX: value.mass.posNorm[0], velocityX: value.mass.velNormS[0] };
      if (value.preset === 'granular_sand_box') flowPeak = Math.max(flowPeak, source.flow);
    }
    return value;
  };
  const inspect = data => {
    if (!(data instanceof Float32Array) || data.length !== 1225 * 16 || data[15] !== 1) return;
    if (document.querySelector('[data-lab-preset][aria-pressed="true"]')?.dataset.labPreset !== 'granular_sand_box') return;
    matrices = Array.from(data); uploads++;
  };
  for (const proto of [WebGLRenderingContext.prototype, WebGL2RenderingContext.prototype]) {
    for (const method of ['bufferData', 'bufferSubData']) {
      const original = proto[method];
      proto[method] = function (...args) {
        const result = original.apply(this, args);
        inspect(args[method === 'bufferData' ? 1 : 2]);
        return result;
      };
    }
  }
  const requestFrame = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = callback => requestFrame(time => {
    callback(time); frames++;
    if (pauseAt !== null && source?.timeS >= pauseAt) {
      pauseAt = null;
      const button = document.querySelector('#lab-pause');
      if (button?.getAttribute('aria-pressed') !== 'true') button?.click();
    }
  });
  window.__sandProbe = {
    read() { return { source, matrices, frames, uploads, flowPeak, forbidden }; },
    arm(timeS) { pauseAt = timeS; },
    clearFlowPeak() { flowPeak = 0; }
  };
});

const read = () => page.evaluate(() => window.__sandProbe.read());
const pause = page.locator('#lab-pause');
async function captureAt(timeS, file) {
  await page.evaluate(time => window.__sandProbe.arm(time), timeS);
  if (await pause.getAttribute('aria-pressed') === 'true') await pause.click();
  await page.waitForFunction(() => document.querySelector('#lab-pause')?.getAttribute('aria-pressed') === 'true',
    null, { timeout: 90000 });
  await page.screenshot({ path: fileURLToPath(new URL(file, output)) });
  const result = await read();
  console.log(`Captured ${file}: ${JSON.stringify(result.source)}`);
  return result;
}
async function setRoll(degrees) {
  await page.locator('#lab-roll').evaluate((input, value) => {
    input.value = String(value); input.dispatchEvent(new Event('input', { bubbles: true }));
  }, degrees);
}
// At the actual uploaded grain centers, the corrected triangle surface should
// retain the model's slope; the tiny erosion/deposition field is not another CG.
function fittedSlope(matrices) {
  assert.equal(matrices?.length, 1225 * 16, 'actual production sand instances were uploaded');
  const points = [];
  for (let i = 0; i < 1225; i++) {
    const offset = i * 16;
    if (Math.hypot(...matrices.slice(offset, offset + 3)) > 1e-8)
      points.push([matrices[offset + 12], matrices[offset + 13]]);
  }
  assert.ok(points.length > 350, `the visible pile must have a populated fine surface, got ${points.length}`);
  const x = points.reduce((sum, point) => sum + point[0], 0) / points.length;
  const y = points.reduce((sum, point) => sum + point[1], 0) / points.length;
  return points.reduce((sum, point) => sum + (point[0] - x) * (point[1] - y), 0) /
    points.reduce((sum, point) => sum + (point[0] - x) ** 2, 0);
}
function coherentSlope(result) {
  assert.equal(result.source.preset, 'granular_sand_box');
  assert.equal(result.source.active, true, 'the production retained-pile model is active');
  assert.ok(Math.abs(fittedSlope(result.matrices) - result.source.pileSlope) < 0.025,
    'fine surface grains follow the reported retained pile, not a separate tilted block');
}

try {
  await page.goto(url.href, { waitUntil: 'networkidle' });
  await page.locator('#offline-lab:not([hidden])').waitFor();
  assert.equal(await page.locator('vite-error-overlay').count(), 0);
  await page.locator('[data-lab-preset="granular_sand_box"]').click();
  await page.locator('#lab-reset').click();
  const rest = await captureAt(0.10, 'sand-rest-desktop.png');
  coherentSlope(rest);
  assert.ok(Math.abs(rest.source.pileSlope) < 0.001);
  const restImage = await page.locator('#scene').screenshot();

  await page.evaluate(() => window.__sandProbe.clearFlowPeak());
  await setRoll(45);
  const right = await captureAt(0.65, 'sand-tilt-right-desktop.png');
  coherentSlope(right);
  assert.ok(right.flowPeak > 0.01, 'the real C++ tilt produces active granular flow');
  assert.ok(Math.abs(right.source.pileSlope) > 0.03, 'tilt changes the source pile slope');
  assert.ok(!(await page.locator('#scene').screenshot()).equals(restImage), 'flowing tilted sand differs visibly from rest');

  const beforePause = await read();
  const frozenImage = await page.locator('#scene').screenshot();
  await page.waitForFunction(count => window.__sandProbe.read().frames >= count + 3, beforePause.frames,
    { timeout: 30000 });
  const afterPause = await read();
  assert.deepEqual(afterPause.source, beforePause.source, 'Pause freezes the real source clock and pile state');
  assert.deepEqual(afterPause.matrices, beforePause.matrices, 'Pause freezes all 1225 grain transforms exactly');
  assert.ok((await page.locator('#scene').screenshot()).equals(frozenImage), 'Pause freezes the complete shaded pile');

  await setRoll(0);
  const rightRetained = await captureAt(1.30, 'sand-retained-right-desktop.png');
  coherentSlope(rightRetained);
  assert.ok(rightRetained.source.pileSlope * right.source.pileSlope > 0.001,
    'return to level retains the preceding pile direction');
  assert.ok(rightRetained.source.flow < 0.005, 'returned retained pile settles without idle surface flow');
  await page.evaluate(() => window.__sandProbe.clearFlowPeak());
  await setRoll(-45);
  const left = await captureAt(1.95, 'sand-tilt-left-desktop.png');
  coherentSlope(left);
  assert.ok(left.flowPeak > 0.01 && left.source.pileSlope * right.source.pileSlope < 0,
    'opposite source tilt moves the pile in the opposite direction');
  await setRoll(0);
  const leftRetained = await captureAt(2.60, 'sand-retained-left-desktop.png');
  coherentSlope(leftRetained);
  assert.ok(leftRetained.source.pileSlope * left.source.pileSlope > 0.001,
    'both return directions retain their source-defined pile');

  await page.setViewportSize({ width: 412, height: 915 });
  await page.screenshot({ path: fileURLToPath(new URL('sand-retained-mobile.png', output)) });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true,
    'mobile-width Lab controls fit without horizontal overflow');
  for (const material of ['liquid_small_box', 'granular_sand_box']) {
    await page.locator(`[data-lab-preset="${material}"]`).click();
    await page.waitForFunction(name => window.__sandProbe.read().source?.preset === name, material);
    assert.equal(await page.locator(`[data-lab-preset="${material}"]`).getAttribute('aria-pressed'), 'true');
  }
  await page.locator('#lab-reset').click();
  const reset = await captureAt(0.10, 'sand-reset-mobile.png');
  coherentSlope(reset);
  assert.ok(Math.abs(reset.source.pileSlope) < 0.001 && Math.abs(reset.source.massX) < 0.001,
    'reset clears retained source slope/CG after material switches');
  assert.deepEqual(reset.matrices, rest.matrices, 'reset restores the initial deterministic grain surface');
  await page.locator('#lab-close').click();
  assert.equal(await page.locator('#mode-badge').textContent(), 'Preview');
  assert.deepEqual(await page.evaluate(() => window.__sandProbe.read().forbidden), []);
  assert.deepEqual(errors, []);
  assert.deepEqual(shaderErrors, []);
  console.log('PASS: real-page sand flow/left-right retention, source/1225-grain/image pause, mobile, switches and reset; no shader errors or hardware/audio IO.');
} finally { await browser.close(); }
