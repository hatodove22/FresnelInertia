/* RELEASE is generated from the complete production build, including lazy
 * physics/Wasm/audio. Do not add skipWaiting or clients.claim here: old clients
 * must finish with their old, complete release, even during a live exhibition. */
const ROOT = self.registration.scope;
const PREFIX = `fresnel-pwa:${new URL(ROOT).pathname}:`;
const CACHE = PREFIX + RELEASE.version;
const COMPLETE = new URL('.pwa-complete', ROOT).href;
const ASSETS = new Map(RELEASE.entries.map(entry => [new URL(entry.path, ROOT).href, entry]));
const htmlRoutes = new Set(['index.html', 'tune.html', 'webusb.html'].map(path => new URL(path, ROOT).href));

async function notify(message) {
  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  for (const client of clients) if (client.url.startsWith(ROOT)) client.postMessage(message);
}

async function complete(cache) {
  if (!await cache.match(COMPLETE)) return false;
  // Storage may be removed by the browser/user after installation. Never claim
  // offline readiness from registration alone or a partially retained cache.
  const present = new Set((await cache.keys()).map(request => request.url));
  return [...ASSETS.keys()].every(url => present.has(url));
}

async function saveRelease(cache) {
  // Validate everything before modifying even one cached response. Repair uses
  // this same exact-release download and never overwrites with a newer version.
  const responses = await Promise.all([...ASSETS].map(async ([url, entry]) => {
    const response = await fetch(new Request(url, { cache: 'reload', credentials: 'same-origin' }));
    if (!response.ok || response.type === 'opaque' || response.redirected) throw new Error(`download: ${entry.path}`);
    const digest = await crypto.subtle.digest('SHA-256', await response.clone().arrayBuffer());
    const hash = [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('');
    if (hash !== entry.sha256) throw new Error(`version: ${entry.path}`);
    return [url, response];
  }));
  for (const [url, response] of responses) await cache.put(url, response);
  await cache.put(COMPLETE, new Response(RELEASE.version));
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    try {
      // Validate bytes against the build, including unhashed entry HTML. A deploy
      // changing midway through download must fail, not install a mixed release.
      await saveRelease(cache);
    } catch (error) {
      await caches.delete(CACHE);
      await notify({ type: 'FRESNEL_PWA_ERROR', message: error instanceof Error ? error.message : 'storage' });
      throw error;
    }
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    // Natural activation only: no old controlled tabs remain at this point.
    for (const name of await caches.keys()) if (name.startsWith(PREFIX) && name !== CACHE) await caches.delete(name);
  })());
});

self.addEventListener('message', event => {
  if (!['FRESNEL_PWA_STATUS', 'FRESNEL_PWA_REPAIR'].includes(event.data?.type) || !event.ports[0]) return;
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    if (event.data.type === 'FRESNEL_PWA_REPAIR' && !await complete(cache)) {
      try { await saveRelease(cache); }
      catch { await notify({ type: 'FRESNEL_PWA_ERROR', message: 'repair-failed' }); }
    }
    const ready = await complete(cache);
    event.ports[0].postMessage({ type: 'FRESNEL_PWA_STATUS', version: RELEASE.version,
      ready, files: ASSETS.size, bytes: RELEASE.entries.reduce((sum, entry) => sum + entry.bytes, 0) });
  })());
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== new URL(ROOT).origin) return;
  url.hash = ''; url.search = '';
  if (url.href === ROOT) url.pathname += 'index.html';
  if (!ASSETS.has(url.href)) return;
  event.respondWith((async () => {
    const response = await (await caches.open(CACHE)).match(url.href);
    if (response) return response;
    await notify({ type: 'FRESNEL_PWA_ERROR', message: 'cache-missing' });
    // Do not silently mix network HTML/new lazy chunks with a running release.
    return new Response(htmlRoutes.has(url.href)
      ? `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>保存データを再取得してください</title><p>オフライン保存データが削除されました。インターネットに接続して再取得してください。設定・比較記録は削除しません。</p><button id="repair">保存データを再取得</button><p id="status" role="status"></p><script>
      document.querySelector('#repair').onclick = async () => {
        const button = document.querySelector('#repair'), label = document.querySelector('#status');
        button.disabled = true; label.textContent = '再取得中…';
        const registration = await navigator.serviceWorker.getRegistration();
        const channel = new MessageChannel();
        const timer = setTimeout(() => { button.disabled = false; label.textContent = '通信を確認して再試行してください。'; }, 60000);
        channel.port1.onmessage = async event => {
          clearTimeout(timer); button.disabled = false;
          if (event.data.ready) { location.reload(); return; }
          try { await registration.update(); } catch {}
          label.textContent = '再取得できませんでした。通信を確認してください。新しい版がある場合はこのサイトの全画面・タブを閉じ、もう一度開いてください。';
        };
        registration.active.postMessage({type:'FRESNEL_PWA_REPAIR'}, [channel.port2]);
      };</script>`
      : 'Offline release asset missing; reconnect and reinstall the offline copy.',
    { status: 503, headers: { 'Content-Type': htmlRoutes.has(url.href) ? 'text/html; charset=utf-8' : 'text/plain' } });
  })());
});
