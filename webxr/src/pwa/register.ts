/// <reference types="vite/client" />
import './style.css';

interface InstallPrompt extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

interface ReleaseStatus { version: string; ready: boolean; bytes: number; files: number }

function statusOf(worker: ServiceWorker, repair = false): Promise<ReleaseStatus> {
  return new Promise((resolve, reject) => {
    const channel = new MessageChannel();
    const timer = window.setTimeout(() => { channel.port1.close(); reject(new Error('status-timeout')); }, repair ? 60000 : 5000);
    channel.port1.onmessage = event => {
      window.clearTimeout(timer); channel.port1.close(); resolve(event.data as ReleaseStatus);
    };
    worker.postMessage({ type: repair ? 'FRESNEL_PWA_REPAIR' : 'FRESNEL_PWA_STATUS' }, [channel.port2]);
  });
}

/** Independent of Haptic Link: never opens USB, starts audio, reloads a page or
 * updates active output. Production only, so local development stays cache-free. */
export function initPwa(host: HTMLElement): void {
  if (!import.meta.env?.PROD || document.querySelector('#pwa-options')) return;
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
  if (loopback && new URLSearchParams(location.search).get('pwa') !== '1') return;
  const manifest = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
  if (!manifest) return;
  const root = new URL('./', manifest.href);
  const panel = document.createElement('details'); panel.id = 'pwa-options'; panel.className = 'pwa-options';
  panel.innerHTML = `<summary>アプリ保存・オフライン <span id="pwa-indicator">準備中</span></summary>
    <p id="pwa-status" role="status">同じ画質・音素材を一式保存しています…</p>
    <div class="pwa-actions"><button type="button" id="pwa-install" hidden>ホーム画面に追加</button><button type="button" id="pwa-retry" hidden>保存を再試行</button></div>
    <p class="pwa-note">Chromeのメニューからも「ホーム画面に追加」できます。通常画面・素材ラボ・ゲイン探索を保存します（MRは対象外）。実機接続と音の開始は自分で操作してください。更新はこのアプリの全画面・タブを閉じた次回起動で反映します。</p>
    <p class="pwa-note">設定・比較記録はこのURLの端末内に保存されます。別のURLへ移す前にJSONを書き出してください。オフライン用データはブラウザが削除する場合があります。</p>`;
  host.append(panel);
  const status = panel.querySelector<HTMLElement>('#pwa-status')!;
  const indicator = panel.querySelector<HTMLElement>('#pwa-indicator')!;
  const install = panel.querySelector<HTMLButtonElement>('#pwa-install')!;
  const retry = panel.querySelector<HTMLButtonElement>('#pwa-retry')!;
  let prompt: InstallPrompt | undefined;
  let registration: ServiceWorkerRegistration | undefined;
  let failed = false;
  const fail = () => {
    failed = true; indicator.textContent = registration?.active ? '保存・更新を確認' : '未保存'; retry.hidden = false;
    status.textContent = '一式の保存に失敗しました。通信・空き容量を確認して再試行してください。既存の保存版は置き換えません。';
  };
  const refresh = async () => {
    if (!registration?.active) return;
    try {
      if (registration.waiting) {
        if (!(await statusOf(registration.waiting)).ready) { fail(); return; }
        indicator.textContent = '更新待ち'; retry.hidden = true;
        status.textContent = '新しい版を一式保存しました。現在の画面は切り替えません。このサイトのすべてのタブとアプリを閉じて、もう一度開くと更新・復旧できます。';
        return;
      }
      const result = await statusOf(registration.active);
      if (!result.ready) { fail(); return; }
      indicator.textContent = '保存済み';
      const next = !navigator.serviceWorker.controller ? ' 次回からオフラインで起動できます。' : ' オフラインで起動できます。';
      status.textContent = `画質・音素材を変更せず保存済み（${(result.bytes / 1024 / 1024).toFixed(1)} MB · ${result.version.slice(0, 8)}）。${next}`;
      if (!failed) retry.hidden = true;
    } catch { fail(); }
  };
  const watch = (worker: ServiceWorker) => {
    worker.addEventListener('statechange', () => {
      if (worker.state === 'activated' || worker.state === 'installed') void refresh();
      if (worker.state === 'redundant') fail();
    });
  };
  const register = async (repair = false) => {
    failed = false; retry.hidden = true; indicator.textContent = '準備中';
    status.textContent = '同じ画質・音素材を一式保存しています…';
    try {
      const existing = await navigator.serviceWorker.getRegistration(root.href);
      registration = existing?.scope === root.href ? existing
        : await navigator.serviceWorker.register(new URL('sw.js', root), { scope: root.href, updateViaCache: 'none' });
      registration.addEventListener('updatefound', () => { if (registration?.installing) watch(registration.installing); });
      if (registration.installing) watch(registration.installing);
      if (repair && registration.active) await statusOf(registration.active, true);
      if (registration.active) await refresh();
      if (!registration.installing && navigator.onLine) {
        // An unavailable update must not turn a valid offline copy into "未保存".
        try { await registration.update(); } catch { if (!registration.active) fail(); }
      }
    } catch { fail(); }
  };
  if (!isSecureContext || !('serviceWorker' in navigator)) {
    indicator.textContent = '非対応'; status.textContent = 'アプリ保存にはHTTPSと対応ブラウザが必要です。通常のオンライン画面はそのまま使えます。'; return;
  }
  navigator.serviceWorker.addEventListener('message', event => {
    if (event.data?.type === 'FRESNEL_PWA_ERROR') fail();
  });
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault(); prompt = event as InstallPrompt; install.hidden = false;
  });
  window.addEventListener('appinstalled', () => { install.hidden = true; prompt = undefined; });
  install.addEventListener('click', async () => {
    if (!prompt) return;
    const activePrompt = prompt; prompt = undefined; install.hidden = true;
    try { await activePrompt.prompt(); await activePrompt.userChoice; } catch { /* Browser menu remains available. */ }
  });
  retry.addEventListener('click', () => void register(true));
  window.addEventListener('online', () => void refresh());
  void register();
}
