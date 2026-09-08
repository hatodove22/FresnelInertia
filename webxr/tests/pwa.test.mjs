import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { createHash, webcrypto } from 'node:crypto';
import vm from 'node:vm';
import { staticPwa, appIcon, buildWorker } from '../src/pwa/staticPwaPlugin.ts';

const source = await readFile(new URL('../src/pwa/worker.js', import.meta.url), 'utf8');
const digest = value => createHash('sha256').update(value).digest('hex');
const root = 'https://example.test/FresnelInertia/';

function harness({ corrupt, quota } = {}) {
  const files = { 'index.html': '<h1>release one</h1>', 'tune.html': 'tune one', 'webusb.html': 'usb one',
    'assets/lazy-physics.js': 'physics one', 'assets/foley.wav': 'original audio' };
  const release = { version: 'one', entries: Object.entries(files).map(([path, bytes]) => ({ path, sha256: digest(bytes), bytes: bytes.length })) };
  const stores = new Map();
  const listeners = new Map();
  const messages = [];
  const fetched = [];
  const caches = {
    async open(name) {
      if (!stores.has(name)) stores.set(name, new Map());
      const data = stores.get(name);
      return {
        async put(request, response) { if (quota) throw new DOMException('full', 'QuotaExceededError'); data.set(typeof request === 'string' ? request : request.url, response.clone()); },
        async match(request) { return data.get(typeof request === 'string' ? request : request.url)?.clone(); },
        async keys() { return [...data.keys()].map(url => new Request(url)); }
      };
    },
    async delete(name) { return stores.delete(name); },
    async keys() { return [...stores.keys()]; }
  };
  const context = vm.createContext({
    RELEASE: release, URL, Request, Response, crypto: webcrypto, caches, Uint8Array,
    self: { registration: { scope: root },
      clients: { async matchAll() { return [{ url: root, postMessage(value) { messages.push(value); } }]; } },
      addEventListener(name, callback) { listeners.set(name, callback); }
    },
    async fetch(request) {
      fetched.push(request.url);
      const path = request.url.slice(root.length);
      return new Response(corrupt === path ? 'wrong release' : files[path]);
    }
  });
  vm.runInContext(source, context);
  const lifecycle = name => { let promise; listeners.get(name)({ waitUntil(p) { promise = p; } }); return promise; };
  const fetch = async (path, method = 'GET') => {
    let promise;
    listeners.get('fetch')({ request: new Request(new URL(path, root), { method }), respondWith(p) { promise = p; } });
    return promise;
  };
  const status = async (repair = false) => {
    let promise, result;
    listeners.get('message')({ data: { type: repair ? 'FRESNEL_PWA_REPAIR' : 'FRESNEL_PWA_STATUS' }, ports: [{ postMessage(value) { result = value; } }], waitUntil(p) { promise = p; } });
    await promise; return result;
  };
  return { lifecycle, fetch, status, stores, messages, fetched, files };
}

test('precache includes unvisited lazy physics/audio and all three routes at a subpath', async () => {
  const h = harness();
  await h.lifecycle('install'); await h.lifecycle('activate');
  assert.equal(h.fetched.length, 5);
  assert.equal((await h.status()).ready, true);
  for (const [path, bytes] of Object.entries(h.files)) assert.equal(await (await h.fetch(path)).text(), bytes);
  assert.equal(await (await h.fetch('./?lab=1')).text(), h.files['index.html']);
  assert.equal(await (await h.fetch('tune.html?condition=water')).text(), 'tune one');
  assert.equal(h.fetched.length, 5, 'active release never falls through to new network assets');
  assert.equal(await h.fetch('https://other.test/assets/foley.wav'), undefined);
  assert.equal(await h.fetch('unknown.html'), undefined);
  assert.equal(await h.fetch('index.html', 'POST'), undefined);
});

test('mixed deployment or quota failure leaves prior version untouched and reports failed save', async () => {
  for (const options of [{ corrupt: 'index.html' }, { quota: true }]) {
    const h = harness(options);
    h.stores.set('fresnel-pwa:/FresnelInertia/:old', new Map([['old', new Response('old')]]));
    await assert.rejects(h.lifecycle('install'));
    assert.deepEqual([...h.stores.keys()], ['fresnel-pwa:/FresnelInertia/:old']);
    assert.equal(h.messages.at(-1).type, 'FRESNEL_PWA_ERROR');
  }
});

test('install waits naturally; activation only removes this app scope, never another project', async () => {
  const h = harness();
  h.stores.set('fresnel-pwa:/FresnelInertia/:old', new Map());
  h.stores.set('fresnel-pwa:/other-project/:old', new Map());
  h.stores.set('unrelated-cache', new Map());
  await h.lifecycle('install');
  assert.equal(h.stores.has('fresnel-pwa:/FresnelInertia/:old'), true);
  await h.lifecycle('activate');
  assert.equal(h.stores.has('fresnel-pwa:/FresnelInertia/:old'), false);
  assert.equal(h.stores.has('fresnel-pwa:/other-project/:old'), true);
  assert.equal(h.stores.has('unrelated-cache'), true);
  assert.doesNotMatch(source, /\b(?:self\.)?skipWaiting\s*\(|\bclients\.claim\s*\(/);
});

test('evicted assets revoke readiness and do not silently mix in a new release', async () => {
  const h = harness(); await h.lifecycle('install');
  const cache = h.stores.get('fresnel-pwa:/FresnelInertia/:one');
  cache.delete(new URL('assets/foley.wav', root).href);
  assert.equal((await h.status()).ready, false);
  assert.equal((await h.fetch('assets/foley.wav')).status, 503);
  assert.equal(h.fetched.length, 5);
  assert.equal(h.messages.at(-1).message, 'cache-missing');
  assert.equal((await h.status(true)).ready, true, 'explicit repair restores exact known bytes without replacing the release');
  assert.equal(await (await h.fetch('assets/foley.wav')).text(), 'original audio');
});

test('failed repair keeps remaining active-release assets and never accepts changed server bytes', async () => {
  const h = harness(); await h.lifecycle('install');
  const cache = h.stores.get('fresnel-pwa:/FresnelInertia/:one');
  cache.delete(new URL('assets/foley.wav', root).href);
  h.files['index.html'] = 'new deployment';
  assert.equal((await h.status(true)).ready, false);
  assert.equal(await (await h.fetch('index.html')).text(), '<h1>release one</h1>');
  assert.equal(cache.has(new URL('assets/foley.wav', root).href), false);
  assert.equal(h.messages.at(-1).message, 'repair-failed');
});

test('build plugin pins bytes of every output and generates root-independent install metadata', () => {
  const plugin = staticPwa();
  const emitted = [];
  const bundle = { 'index.html': { type: 'asset', source: 'entry' }, 'assets/lazy.js': { type: 'chunk', code: 'lazy' },
    'assets/sound.wav': { type: 'asset', source: new Uint8Array([1, 4, 9]) } };
  plugin.generateBundle.call({ emitFile(value) { emitted.push(value); } }, {}, bundle);
  const manifest = JSON.parse(emitted.find(value => value.fileName === 'manifest.webmanifest').source);
  assert.equal(manifest.start_url, './'); assert.equal(manifest.scope, './');
  assert.deepEqual(manifest.shortcuts.map(shortcut => shortcut.url), ['./?lab=1', './tune.html']);
  const files = new Map(Object.entries(bundle).map(([name, entry]) => [name, entry.type === 'chunk' ? entry.code : entry.source]));
  for (const entry of emitted) files.set(entry.fileName, entry.source);
  const worker = buildWorker(files);
  const release = JSON.parse(worker.split('\n')[0].slice('const RELEASE = '.length, -1));
  assert.equal(release.entries.find(entry => entry.path === 'assets/lazy.js').sha256, digest('lazy'));
  assert.equal(release.entries.find(entry => entry.path === 'assets/sound.wav').sha256, digest(new Uint8Array([1, 4, 9])));
  assert.equal(release.entries.length, 6);
  for (const size of [192, 512]) {
    const icon = Buffer.from(appIcon(size));
    assert.equal(icon.subarray(1, 4).toString(), 'PNG');
    assert.equal(icon.readUInt32BE(16), size); assert.equal(icon.readUInt32BE(20), size);
  }
});
