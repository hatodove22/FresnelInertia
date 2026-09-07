// Real Chromium/WebAudio + production C++ Lab; browser output is muted by launch.
// Uses the same FRESNEL_* environment variables as browser-demo.mjs. No device IO.
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.FRESNEL_PLAYWRIGHT_MODULE || 'playwright');
const channel = process.env.FRESNEL_BROWSER_CHANNEL || 'chrome';
const sodaOnly = process.env.FRESNEL_SOUND_CASE === 'soda';
const waterOnly = process.env.FRESNEL_SOUND_CASE === 'water';
const url = new URL(process.env.FRESNEL_DEMO_URL || 'https://localhost:8081');
url.searchParams.set('lab', '1');
const browser = await chromium.launch({ ...(channel === 'chromium' ? {} : { channel }), headless: true,
  args: ['--mute-audio', ...(process.env.FRESNEL_SOFTWARE_WEBGL === '1'
    ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : [])] });
const page = await browser.newPage({ ignoreHTTPSErrors: true,
  viewport: waterOnly ? { width: 960, height: 720 } : { width: 1360, height: 900 } });
const errors = [], forbiddenRequests = [], audioRequests = [];
page.on('pageerror', error => errors.push(error.message));
await page.route('**/*', async route => {
  const request = route.request(), target = new URL(request.url());
  const bank = target.origin === url.origin && /\/assets\/foley-bank-[\w-]+\.wav$/.test(target.pathname);
  if (bank) audioRequests.push(request.url());
  if (target.origin !== url.origin || (!bank && (request.resourceType() === 'media' || /\.(?:mp3|wav|ogg|m4a|flac)(?:\?|$)/i.test(target.pathname)))) {
    forbiddenRequests.push(request.url()); await route.abort();
  } else await route.continue();
});

await page.addInitScript(() => {
  const contexts = [], voices = [], edges = new Map(), forbidden = [];
  const now = () => performance.now();
  const block = name => (..._args) => { forbidden.push(name); throw new Error(`Unexpected sound-test IO: ${name}`); };
  Object.defineProperty(navigator, 'serial', { configurable: true, value: {
    requestPort: block('serial.requestPort'), getPorts: block('serial.getPorts') } });
  Object.defineProperty(navigator, 'usb', { configurable: true, value: {
    requestDevice: block('usb.requestDevice'), getDevices: block('usb.getDevices') } });
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: {
    getUserMedia: block('mediaDevices.getUserMedia'), getDisplayMedia: block('mediaDevices.getDisplayMedia'),
    enumerateDevices: block('mediaDevices.enumerateDevices') } });
  HTMLMediaElement.prototype.play = block('HTMLMediaElement.play');

  // Observe connections without inserting nodes or changing the application's graph.
  const connect = AudioNode.prototype.connect, disconnect = AudioNode.prototype.disconnect;
  AudioNode.prototype.connect = function(destination, ...args) {
    const result = connect.call(this, destination, ...args);
    if (destination instanceof AudioNode) {
      if (!edges.has(this)) edges.set(this, new Set());
      edges.get(this).add(destination);
    }
    return result;
  };
  AudioNode.prototype.disconnect = function(...args) {
    const result = disconnect.apply(this, args);
    if (!args.length || typeof args[0] === 'number') edges.delete(this);
    else edges.get(this)?.delete(args[0]);
    return result;
  };
  const reachesOutput = (node, visited = new Set()) => {
    if (visited.has(node)) return false;
    visited.add(node);
    if (node === node.context.destination) return true;
    if (node.gain instanceof AudioParam && Math.abs(node.gain.value) < 1e-6) return false;
    return [...(edges.get(node) ?? [])].some(next => reachesOutput(next, new Set(visited)));
  };
  const pending = voice => voice.startedAt !== null && voice.endedAt === null &&
    voice.stopTime > voice.context.currentTime;
  const audible = voice => pending(voice) && voice.context.state === 'running' && reachesOutput(voice.source);
  const summary = voice => ({ id: voice.id, startedAt: voice.startedAt, endedAt: voice.endedAt,
    duration: voice.duration, peak: voice.peak, stopTime: Number.isFinite(voice.stopTime) ? voice.stopTime : null,
    connected: reachesOutput(voice.source), pending: pending(voice), audible: audible(voice),
    material: voice.material, pressurePhase: voice.pressurePhase });
  const NativeAudioContext = window.AudioContext || window.webkitAudioContext;
  const WrappedAudioContext = new Proxy(NativeAudioContext, { construct(target, args) {
    // A silent processing sink keeps Chromium's real audio clock/graph running
    // even when this Windows host has no available speaker device.
    const context = Reflect.construct(target, [{ ...args[0], sinkId: { type: 'none' } }]);
    contexts.push(context);
    context.createMediaStreamSource = block('AudioContext.createMediaStreamSource');
    context.createMediaElementSource = block('AudioContext.createMediaElementSource');
    const createSource = context.createBufferSource.bind(context);
    context.createBufferSource = () => {
      const source = createSource();
      const voice = { id: voices.length, source, context, startedAt: null, endedAt: null,
        stopTime: Infinity, duration: 0, peak: 0, material: '', pressurePhase: '' };
      voices.push(voice);
      const start = source.start.bind(source), stop = source.stop.bind(source);
      source.start = (...args) => {
        start(...args);
        voice.startedAt = now();
        voice.duration = source.buffer?.duration ?? 0;
        voice.material = document.querySelector('[data-lab-preset][aria-pressed="true"]')?.dataset.labPreset ?? 'preview';
        voice.pressurePhase = document.querySelector('#lab-pressure-label')?.textContent ?? '';
        if (source.buffer) for (let channel = 0; channel < source.buffer.numberOfChannels; channel++) {
          const samples = source.buffer.getChannelData(channel), stride = Math.max(1, Math.floor(samples.length / 4096));
          for (let i = 0; i < samples.length; i += stride) voice.peak = Math.max(voice.peak, Math.abs(samples[i]));
        }
      };
      source.stop = (when = 0) => { stop(when); voice.stopTime = Math.max(context.currentTime, when); };
      source.addEventListener('ended', () => { voice.endedAt = now(); });
      return source;
    };
    return context;
  } });
  window.AudioContext = WrappedAudioContext;
  if (window.webkitAudioContext) window.webkitAudioContext = WrappedAudioContext;

  let armedSelector = null, cutoff = null, syntheticHidden = false;
  const beginCutoff = () => {
    cutoff = { startedAt: now(), ids: voices.filter(pending).map(voice => voice.id), quietAt: null,
      audioTimes: voices.map(voice => voice.context.currentTime) };
  };
  document.addEventListener('click', event => {
    if (armedSelector && event.composedPath().some(node => node.matches?.(armedSelector))) {
      armedSelector = null; beginCutoff();
    }
  }, true);
  // Synthetic page visibility exercises the actual app handler without touching
  // other desktop windows or claiming an OS-backgrounding test.
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => syntheticHidden ? 'hidden' : 'visible' });
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => syntheticHidden });
  const sampleCutoff = () => {
    if (!cutoff) return;
    const quiet = cutoff.ids.every(id => !audible(voices[id]));
    if (quiet && cutoff.quietAt === null) cutoff.quietAt = now();
    else if (!quiet) cutoff.quietAt = null;
  };
  setInterval(sampleCutoff, 8);
  window.__soundProbe = {
    snapshot() { sampleCutoff(); return { contexts: contexts.map(context => ({ state: context.state,
      time: context.currentTime, sampleRate: context.sampleRate })), voices: voices.map(summary), forbidden: [...forbidden],
      cutoff: cutoff && { count: cutoff.ids.length, observedQuietDelayMs: cutoff.quietAt === null ? null : cutoff.quietAt - cutoff.startedAt,
        stillAudible: cutoff.ids.filter(id => audible(voices[id])), lateStops: cutoff.ids.filter(id => {
          const voice = voices[id];
          return voice.context.state === 'running' && !(voice.endedAt !== null && voice.endedAt <= cutoff.startedAt + 150) &&
            voice.stopTime > cutoff.audioTimes[id] + 0.15;
        }) } }; },
    arm(selector) { armedSelector = selector; cutoff = null; },
    setHidden(value) { beginCutoff(); syntheticHidden = value; document.dispatchEvent(new Event('visibilitychange')); },
    gains() { return [...edges.keys()].filter(node => node.gain instanceof AudioParam).map(node => node.gain.value); }
  };
});

const snapshot = () => page.evaluate(() => window.__soundProbe.snapshot());
const voiceCount = async () => (await snapshot()).voices.filter(voice => voice.startedAt !== null).length;
// MaterialSound's opening cue is the unique 0.48 s buffer (at either sample rate).
const popCount = async () => (await snapshot()).voices.filter(voice => voice.startedAt !== null && Math.abs(voice.duration - 0.48) < 0.0001).length;
// The actual sparkling-water excerpt is the unique 3.6 s vent buffer.
const ventVoices = async () => (await snapshot()).voices.filter(voice => voice.startedAt !== null && Math.abs(voice.duration - 3.6) < 0.0001);
async function changeRange(selector, value) {
  await page.locator(selector).evaluate((control, value) => { control.value = String(value); control.dispatchEvent(new Event('input', { bubbles: true })); }, value);
}
async function material(name) {
  await page.locator(`[data-lab-preset="${name}"]`).click();
  await page.locator(`[data-lab-preset="${name}"][aria-pressed="true"]`).waitFor();
}
async function shake() {
  const before = await voiceCount();
  await page.locator('#lab-shake').click();
  await page.waitForFunction(before => window.__soundProbe.snapshot().voices.filter(voice =>
    voice.startedAt !== null && voice.peak > 0).length > before, before, { timeout: 15000 });
  return before;
}
async function cutoffAction(selector, label) {
  await page.evaluate(selector => window.__soundProbe.arm(selector), selector);
  await page.locator(selector).click();
  await page.waitForTimeout(350);
  const result = (await snapshot()).cutoff;
  assert.ok(result, `${label}: action capture missing`);
  assert.ok(result.count > 0, `${label}: no old voices were present to test cancellation`);
  assert.ok(result.observedQuietDelayMs !== null && result.stillAudible.length === 0,
    `${label}: old voice graph remained audible: ${JSON.stringify(result)}`);
  // Judge the 150 ms bound by the real AudioContext's stop schedule. A software
  // WebGL frame can delay our JS sampler while the audio thread has already stopped.
  assert.deepEqual(result.lateStops, [], `${label}: old/future sources were not canceled, even if momentarily quiet`);
  return result;
}
async function noNewVoices(label) {
  const before = await voiceCount(); await page.waitForTimeout(300);
  assert.equal(await voiceCount(), before, `${label}: new voices were scheduled without a new active source`);
}

try {
  await page.goto(url.href, { waitUntil: 'networkidle' });
  await page.locator('#offline-lab:not([hidden])').waitFor();
  // The source label now lives in a deliberately collapsed diagnostics panel.
  await page.locator('#lab-model-state').filter({ hasText: '重心' }).waitFor({ state: 'attached' });
  assert.equal(await page.locator('vite-error-overlay').count(), 0);
  assert.equal(await page.locator('#sound-toggle').getAttribute('aria-pressed'), 'false');
  assert.equal(await page.locator('#sound-volume').inputValue(), '35');
  assert.equal((await snapshot()).contexts.length, 0, 'the initial muted state must not construct AudioContext');
  assert.equal(audioRequests.length, 0, 'sound assets are not fetched before the user enables sound');
  await page.locator('.sound-settings > summary').click();
  assert.match(await page.locator('#sound-status').innerText(), /スピーカー/);
  await changeRange('#sound-volume', 15);
  assert.match(await page.locator('#sound-volume-value').innerText(), /15/);
  assert.equal((await snapshot()).contexts.length, 0, 'volume changes while muted must not unlock audio');
  await page.locator('#sound-toggle').click();
  await page.waitForFunction(() => document.querySelector('#sound-toggle').getAttribute('aria-pressed') === 'true' &&
    window.__soundProbe.snapshot().contexts.some(context => context.state === 'running'));
  await page.waitForFunction(() => window.__soundProbe.snapshot().contexts.some(context => context.time > 0), null,
    { timeout: 5000 });
  assert.equal(await page.locator('#sound-toggle').getAttribute('aria-pressed'), 'true');
  assert.equal(audioRequests.length, 1, 'one bundled Foley bank is preloaded and decoded on explicit enable');
  const lowGains = await page.evaluate(() => window.__soundProbe.gains());
  await changeRange('#sound-volume', 35); await page.waitForTimeout(100);
  assert.match(await page.locator('#sound-volume-value').innerText(), /35/);
  const highGains = await page.evaluate(() => window.__soundProbe.gains());
  assert.ok(highGains.some((value, i) => value > (lowGains[i] ?? Infinity)),
    `volume should change a real output gain: ${JSON.stringify({ lowGains, highGains, audio: (await snapshot()).contexts })}`);

  if (waterOnly) {
    await material('liquid_small_box');
    const before = await shake();
    await page.waitForFunction(before => window.__soundProbe.snapshot().voices.slice(before).some(voice =>
      voice.startedAt !== null && voice.duration >= 0.74 && voice.duration <= 1.06 && voice.peak > 0.1), before,
      { timeout: 20000 });
    await cutoffAction('#lab-pause', 'long water splash pause');
    await noNewVoices('paused water');
    // Pause already removed the tails. Reset must stay quiet, not recreate one.
    await page.locator('#lab-reset').click();
    await noNewVoices('reset water');
    await shake(); await cutoffAction('#sound-toggle', 'water mute');
    await noNewVoices('muted water');
    await page.locator('#sound-toggle').click();
    await material('liquid_small_box'); await shake();
    await cutoffAction('[data-lab-preset="granular_coin_box"]', 'water to coin');
    await noNewVoices('quiet coin after water');
    console.log('Browser sound: production water shake starts broad splash PCM; pause/reset/mute/material changes cancel without replay.');
  }

  if (!sodaOnly && !waterOnly) {
  const materials = ['granular_single_marble_box', 'granular_coin_box', 'granular_single_coin_box',
    'granular_sand_box', 'liquid_small_box', 'liquid_soda_bottle'];
  const observations = [];
  for (const name of materials) {
    await material(name);
    const before = await shake();
    observations.push({ preset: name, voices: await voiceCount() - before });
    await cutoffAction('#lab-pause', `pause ${name}`);
    assert.equal(await page.locator('#lab-pause').getAttribute('aria-pressed'), 'true');
    await noNewVoices(`paused ${name}`);
    console.log(`Browser sound: ${name} gesture/pause passed.`);
  }
  console.log('Browser sound: six production-Lab gestures and pause:', JSON.stringify(observations));

  await material('granular_coin_box'); await shake();
  await cutoffAction('#lab-reset', 'reset');
  await shake(); await cutoffAction('[data-lab-preset="liquid_small_box"]', 'material change');
  await shake(); await cutoffAction('#sound-toggle', 'mute');
  assert.equal(await page.locator('#sound-toggle').getAttribute('aria-pressed'), 'false');
  await noNewVoices('muted');
  await page.locator('#sound-toggle').click();
  assert.equal((await snapshot()).contexts.length, 1, 'reenabling sound must reuse its existing context');

  await material('granular_coin_box'); await shake();
  await page.evaluate(() => window.__soundProbe.setHidden(true));
  await page.waitForTimeout(350);
  const hidden = (await snapshot()).cutoff;
  assert.ok(hidden.count > 0 && hidden.observedQuietDelayMs !== null && hidden.stillAudible.length === 0,
    `hidden page did not cut old tails promptly: ${JSON.stringify(hidden)}`);
  assert.deepEqual(hidden.lateStops, []);
  await noNewVoices('hidden page');
  await page.evaluate(() => window.__soundProbe.setHidden(false));
  console.log('Browser sound: reset/material/mute/visibility cancellation passed.');
  }

  // The real model owns burst timing. Keep its normal playback rate: software
  // WebGL can already progress slowly, and the burst lasts 2.8 model seconds.
  // Its 0.48 s opening buffer must not repeat when that same burst resumes.
  if (!waterOnly) {
  await material('liquid_soda_bottle');
  await page.locator('#lab-slow').evaluate(input => {
    const details=input.closest('details'); if (details && !details.open) details.querySelector('summary').click();
  });
  await page.locator('#lab-slow').uncheck();
  await page.locator('#lab-pressure-label').filter({ hasText: '密封' }).waitFor({ state: 'attached' });
  const beforeVent = (await ventVoices()).length;
  await page.waitForTimeout(300);
  assert.equal((await ventVoices()).length, beforeVent, 'sealed soda must not start a fizz bed');
  const beforePop = await popCount(); await shake();
  await page.waitForFunction(before => window.__soundProbe.snapshot().voices.filter(voice =>
    voice.startedAt !== null && Math.abs(voice.duration - 0.48) < 0.0001).length > before ||
    document.querySelector('#lab-pressure-label').textContent === '落ち着いた',
    beforePop, { timeout: 45000 });
  assert.ok(await popCount() > beforePop, 'the model reached spent without scheduling its opening voice');
  assert.ok((await ventVoices()).length > beforeVent, 'the actual burst must start the recorded fizz bed');
  assert.ok((await ventVoices()).slice(beforeVent).every(voice => voice.pressurePhase === '噴出中'),
    'fizz may only start from the model burst phase, never sealed shaking');
  await page.locator('#lab-pause').click(); await page.waitForTimeout(200);
  await noNewVoices('paused bursting soda');
  assert.ok((await ventVoices()).every(voice => !voice.pending), 'pause must cancel the recorded fizz loop');
  const burstPopCount = await popCount();
  assert.equal(burstPopCount, beforePop + 1, 'one soda opening must produce one pop voice');
  await page.locator('#lab-pause').click(); await page.waitForTimeout(350);
  assert.equal(await popCount(), burstPopCount, 'resuming the same burst replayed its opening voice');
  await page.locator('#lab-slow').uncheck();
  await page.locator('#lab-pressure-label').filter({ hasText: '落ち着いた' }).waitFor({ state: 'attached', timeout: 45000 });
  await page.waitForTimeout(100);
  const spentVent = await ventVoices();
  assert.ok(spentVent.every(voice => !voice.pending), 'the spent phase must stop fizz without requiring Pause');
  assert.ok(spentVent.slice(beforeVent).every(voice => voice.pressurePhase === '噴出中'),
    'resumed fizz may only follow an active burst');
  await page.locator('#lab-pause').click(); await page.waitForTimeout(200);
  await noNewVoices('paused spent soda');
  const spentPopCount = await popCount();
  await page.locator('#lab-pause').click(); await page.waitForTimeout(350);
  assert.equal(await popCount(), spentPopCount, 'resuming spent soda replayed its opening voice');
  assert.equal((await ventVoices()).length, spentVent.length, 'resuming spent soda replayed its fizz bed');
  }

  await page.locator('#sound-toggle').click(); await page.waitForTimeout(200);
  const final = await snapshot();
  assert.deepEqual(final.forbidden, []);
  assert.deepEqual(forbiddenRequests, []);
  assert.deepEqual(errors, []);
  assert.equal(audioRequests.length, 1, 'cached samples are reused across materials and mute/resume');
  console.log(`PASS browser sound: bundled Foley bank decoded once, explicit WebAudio unlock, real gain control, ${waterOnly ? 'focused broad-water-splash and cancellation regression' : sodaOnly ? 'focused soda burst-only fizz and replay regression' : 'six Lab materials and pause/reset/material/mute/visibility tail cancellation'}, ${waterOnly ? 'no delayed splash replay' : 'no opening replay after burst/spent resume'}. Chromium output muted; no microphone, media playback, third-party runtime requests, serial or USB calls.`);
} catch (error) {
  console.error('Browser sound diagnostics:', JSON.stringify(await page.evaluate(() => {
    const probe = window.__soundProbe.snapshot();
    return { context: probe.contexts, forbidden: probe.forbidden, cutoff: probe.cutoff,
      model: document.querySelector('#lab-model-state')?.textContent,
      status: document.querySelector('#lab-status')?.textContent,
      phase: document.querySelector('#lab-pressure-label')?.textContent,
      charge: document.querySelector('#lab-charge')?.value,
      popVoices: probe.voices.filter(voice => Math.abs(voice.duration - 0.48) < 0.0001),
      lastVoices: probe.voices.slice(-8) };
  }).catch(() => null)));
  throw error;
} finally { await browser.close(); }
