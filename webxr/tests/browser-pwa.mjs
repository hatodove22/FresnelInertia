// Production build served from memory at a GitHub-Pages-like subpath.
// No physical USB/audio access. Run after npm run build.
import { readFile, readdir, mkdir } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.FRESNEL_PLAYWRIGHT_MODULE || 'playwright');
const dist = new URL('../dist/', import.meta.url);
const files = new Map();
async function load(dir, prefix = '') {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) await load(new URL(`${entry.name}/`, dir), `${prefix}${entry.name}/`);
    else files.set(prefix + entry.name, await readFile(new URL(entry.name, dir)));
  }
}
await load(dist);
const originalWorker = files.get('sw.js').toString();
const parseRelease = worker => JSON.parse(worker.split('\n')[0].slice('const RELEASE = '.length, -1));
const oldRelease = parseRelease(originalWorker);
const base = '/FresnelInertia/';
const requests = [];
let networkAvailable = true;
const mime = path => path.endsWith('.js') ? 'application/javascript' : path.endsWith('.css') ? 'text/css'
  : path.endsWith('.html') ? 'text/html' : path.endsWith('.webmanifest') ? 'application/manifest+json'
  : path.endsWith('.png') ? 'image/png' : path.endsWith('.wav') ? 'audio/wav' : 'application/octet-stream';
const server = createServer((req, res) => {
  const path = new URL(req.url, 'http://local').pathname;
  requests.push(path);
  if (!networkAvailable) { res.writeHead(503); res.end('fixture is offline'); return; }
  if (path === '/launcher.html') { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end('<title>Launch</title>'); return; }
  const name = path.startsWith(base) ? path.slice(base.length) || 'index.html' : '';
  const data = files.get(name);
  if (!data) { res.writeHead(404); res.end('not found'); return; }
  res.writeHead(200, { 'Content-Type': mime(name), 'Cache-Control': 'no-store' }); res.end(data);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const url = origin + base;
const appUrl = path => `${url}${path}${path.includes('?') ? '&' : '?'}pwa=1`;
console.log(`Isolated PWA fixture: ${url}`);
let browser;
try {
  browser = await chromium.launch({ channel: 'chrome', headless: true,
    args: ['--mute-audio', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const context = await browser.newContext({ viewport: { width: 412, height: 915 }, serviceWorkers: 'allow' });
  await context.addInitScript(() => {
    window.__pwaIO = [];
    const block = name => () => { window.__pwaIO.push(name); throw Error(`Unexpected hardware IO: ${name}`); };
    Object.defineProperty(navigator, 'serial', { configurable: true, value: { requestPort: block('serial'), getPorts: async () => [] } });
    Object.defineProperty(navigator, 'usb', { configurable: true, value: { requestDevice: block('usb'), getDevices: async () => [] } });
  });
  const errors = [];
  context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
  let page = await context.newPage();
  await page.goto(appUrl(''));
  await page.waitForFunction(() => document.querySelector('#pwa-indicator')?.textContent === '保存済み', null, { timeout: 60000 });
  await page.locator('#pwa-options').evaluate(element => { element.open = true; element.scrollIntoView(); });
  await mkdir(new URL('../../tmp/browser/', import.meta.url), { recursive: true });
  await page.screenshot({ path: fileURLToPath(new URL('../../tmp/browser/pwa-mobile.png', import.meta.url)) });
  assert.equal(await page.evaluate(() => navigator.serviceWorker.controller), null, 'first save does not force-claim an already running page');
  const cached = await page.evaluate(async () => {
    const names = await caches.keys();
    return (await (await caches.open(names.find(name => name.startsWith('fresnel-pwa:')))).keys()).map(request => request.url);
  });
  for (const entry of oldRelease.entries) assert.ok(cached.includes(url + entry.path), `precache ${entry.path}`);
  assert.ok(cached.some(path => /rapier.*\.js$/.test(path)), 'unvisited coin engine cached');
  assert.ok(cached.some(path => /foley-bank.*\.wav$/.test(path)), 'original PCM cached');
  assert.ok(cached.some(path => /preview-engine.*\.js$/.test(path)), 'production C++/Wasm cached');
  await page.reload();
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  const before = requests.length;
  networkAvailable = false;
  await context.setOffline(true);
  await page.goto(appUrl('?lab=1'));
  await page.waitForFunction(() => / s$/.test(document.querySelector('#lab-model-state')?.textContent ?? ''), null, { timeout: 60000 });
  await page.waitForFunction(() => document.querySelector('#pwa-indicator')?.textContent === '保存済み');
  const lazy = oldRelease.entries.filter(entry => /rapier|preview-engine|foley-bank/.test(entry.path));
  assert.deepEqual(await page.evaluate(async paths => Promise.all(paths.map(async path => (await fetch(path)).ok)), lazy.map(entry => url + entry.path)), lazy.map(() => true));
  for (const route of ['tune.html', 'webusb.html', '']) {
    await page.goto(appUrl(route));
    await page.waitForFunction(() => document.querySelector('#pwa-indicator')?.textContent === '保存済み');
    assert.deepEqual(await page.evaluate(() => window.__pwaIO), []);
  }
  const offlineRequests = requests.slice(before).filter(path => path !== base + 'sw.js' && path !== '/favicon.ico');
  assert.deepEqual(offlineRequests, [], 'offline navigation and lazy assets never reach server (browser worker update probes may try and fail)');
  networkAvailable = true;
  await context.setOffline(false);
  await page.evaluate(() => localStorage.setItem('pwa-test-preserved', 'comparison history'));

  // Also exercise the recovery case: old assets are incomplete, and deployment
  // has changed so old HTML can no longer be downloaded for same-version repair.
  await page.evaluate(async path => {
    const cache = await caches.open((await caches.keys()).find(name => name.startsWith('fresnel-pwa:')));
    await cache.delete(path);
  }, url + oldRelease.entries.find(entry => /foley-bank.*\.wav$/.test(entry.path)).path);

  // Model a new complete deploy while old page remains open. A reload must still
  // show release one; only closing all controlled clients activates release two.
  files.set('index.html', Buffer.from(files.get('index.html').toString().replace('</body>', '<p id="pwa-release-two" hidden>release two</p></body>')));
  const nextRelease = { ...oldRelease, version: 'browser-test-two', entries: oldRelease.entries.map(entry => {
    const bytes = files.get(entry.path); return { ...entry, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
  }) };
  files.set('sw.js', Buffer.from(`const RELEASE = ${JSON.stringify(nextRelease)};\n${originalWorker.slice(originalWorker.indexOf('\n') + 1)}`));
  await page.evaluate(async () => { await (await navigator.serviceWorker.getRegistration()).update(); });
  await page.waitForFunction(async () => (await navigator.serviceWorker.getRegistration())?.waiting, null, { timeout: 60000 });
  await page.waitForFunction(() => document.querySelector('#pwa-indicator')?.textContent === '更新待ち');
  assert.match(await page.locator('#pwa-status').textContent(), /すべてのタブとアプリを閉じて/,
    'complete waiting release offers next-launch recovery even if old cache is incomplete');
  await page.reload();
  assert.equal(await page.locator('#pwa-release-two').count(), 0, 'reload did not replace a live release');
  await page.close();
  // New context-free tab allows the waiting worker's natural activation to finish.
  page = await context.newPage();
  await page.goto(origin + '/launcher.html');
  await page.waitForFunction(async root => {
    const registration = await navigator.serviceWorker.getRegistration(root);
    return registration?.active?.state === 'activated' && !registration.waiting;
  }, url, { timeout: 60000 });
  await page.goto(appUrl(''));
  await page.waitForSelector('#pwa-release-two', { state: 'attached', timeout: 60000 });
  assert.equal(await page.evaluate(() => localStorage.getItem('pwa-test-preserved')), 'comparison history');
  assert.equal((await page.evaluate(() => caches.keys())).filter(name => name.startsWith('fresnel-pwa:')).length, 1);
  // Eviction recovery is explicit and must not reload or restart a live demo.
  const audioPath = url + nextRelease.entries.find(entry => /foley-bank.*\.wav$/.test(entry.path)).path;
  await page.evaluate(async path => {
    window.__pwaSamePage = 'running page preserved';
    const cache = await caches.open((await caches.keys()).find(name => name.startsWith('fresnel-pwa:')));
    await cache.delete(path);
    if ((await fetch(path)).status !== 503) throw Error('missing asset silently fetched a different release');
  }, audioPath);
  await page.locator('#pwa-options').evaluate(element => { element.open = true; });
  await page.locator('#pwa-retry').click();
  await page.waitForFunction(() => document.querySelector('#pwa-indicator')?.textContent === '保存済み', null, { timeout: 60000 });
  assert.equal(await page.evaluate(() => window.__pwaSamePage), 'running page preserved');
  assert.deepEqual(await page.evaluate(() => window.__pwaIO), []);
  networkAvailable = false; await context.setOffline(true);
  assert.equal(await page.evaluate(async path => (await fetch(path)).ok, audioPath), true);
  assert.deepEqual(errors, []);
  console.log('PASS: full-quality assets cached, 3 routes and Lab offline, subpath, no hardware IO, no mid-demo activation, next launch atomic update, localStorage preserved, explicit same-version cache repair without reload.');
} finally {
  if (browser) await browser.close();
  await new Promise(resolve => server.close(resolve));
}
