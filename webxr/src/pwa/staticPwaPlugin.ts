import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { deflateSync } from 'node:zlib';
import type { Plugin } from 'vite';

const sha256 = (bytes: string | Uint8Array) => createHash('sha256').update(bytes).digest('hex');

export function buildWorker(files: Map<string, string | Uint8Array>): string {
  const entries = [...files].sort(([a], [b]) => a.localeCompare(b)).map(([path, source]) => ({
    path, sha256: sha256(source), bytes: typeof source === 'string' ? Buffer.byteLength(source) : source.byteLength
  }));
  const worker = readFileSync(new URL('./worker.js', import.meta.url), 'utf8');
  const version = sha256(worker + JSON.stringify(entries)).slice(0, 16);
  return `const RELEASE = ${JSON.stringify({ version, entries })};\n${worker}`;
}

// Small original, maskable container icon. Generated lossless at the requested
// resolution; this does not touch any scene textures or sound assets.
export function appIcon(size: number): Uint8Array {
  const crc = (data: Uint8Array) => {
    let result = 0xffffffff;
    for (const value of data) {
      result ^= value;
      for (let i = 0; i < 8; i++) result = (result >>> 1) ^ ((result & 1) ? 0xedb88320 : 0);
    }
    return (result ^ 0xffffffff) >>> 0;
  };
  const chunk = (name: string, data: Uint8Array) => {
    const body = Buffer.concat([Buffer.from(name), data]);
    const header = Buffer.alloc(4); header.writeUInt32BE(data.length);
    const tail = Buffer.alloc(4); tail.writeUInt32BE(crc(body));
    return Buffer.concat([header, body, tail]);
  };
  const pixels = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / size, v = y / size;
    const inside = u > .27 && u < .73 && v > .23 && v < .77;
    const border = inside && (u < .30 || u > .70 || v < .26 || v > .74);
    const water = inside && v > .51 + .045 * Math.sin(u * 16) && !border;
    const color = border ? [219, 240, 239] : water ? [61, 201, 190] : [11, 16, 20];
    const offset = y * (size * 4 + 1) + 1 + x * 4;
    pixels.set([...color, 255], offset);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size); header.writeUInt32BE(size, 4); header[8] = 8; header[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header), chunk('IDAT', deflateSync(pixels)), chunk('IEND', Buffer.alloc(0))]);
}

/** Build-local, dependency-free precache. Every emitted lazy chunk/audio file is
 * included, not merely the resources visited during the first online session. */
export function staticPwa(): Plugin {
  return {
    name: 'fresnel-static-pwa',
    apply: 'build',
    enforce: 'post',
    transformIndexHtml() {
      return [{ tag: 'link', attrs: { rel: 'manifest', href: './manifest.webmanifest' }, injectTo: 'head' }];
    },
    generateBundle() {
      const manifest = JSON.stringify({
        id: './', name: 'Container Haptics', short_name: 'Haptics', lang: 'ja',
        description: '指先の傾きと4ch振動で、手の中の物質を感じるデモ',
        start_url: './', scope: './', display: 'standalone',
        background_color: '#0b1014', theme_color: '#0b1014',
        icons: [192, 512].map(size => ({ src: `icons/icon-${size}.png`, sizes: `${size}x${size}`, type: 'image/png', purpose: 'any maskable' })),
        shortcuts: [{ name: '素材ラボ（実機なし）', url: './?lab=1' }, { name: 'ゲイン探索', url: './tune.html' }]
      }, null, 2);
      const extras = new Map<string, string | Uint8Array>([
        ['manifest.webmanifest', manifest], ['icons/icon-192.png', appIcon(192)], ['icons/icon-512.png', appIcon(512)]
      ]);
      for (const [fileName, source] of extras) {
        this.emitFile({ type: 'asset', fileName, source });
      }
    },
    async writeBundle(options) {
      // Vite finalizes dynamic-import preload paths after generateBundle hooks.
      // Hash actual emitted bytes, not an intermediate Rollup representation.
      const output = resolve(options.dir || 'dist');
      const files = new Map<string, Uint8Array>();
      const visit = async (directory: string, prefix = ''): Promise<void> => {
        for (const entry of await readdir(directory, { withFileTypes: true })) {
          if (entry.isDirectory()) await visit(resolve(directory, entry.name), `${prefix}${entry.name}/`);
          else if (entry.name !== 'sw.js' && !entry.name.endsWith('.map')) {
            files.set(prefix + entry.name, await readFile(resolve(directory, entry.name)));
          }
        }
      };
      await visit(output);
      await writeFile(resolve(output, 'sw.js'), buildWorker(files));
    }
  };
}
