// Reproducible Foley bank: authored solids plus licensed recorded water/soda.
// All source assets are bundled locally; generation does not access a network.
import { build } from 'esbuild';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { loadRecordedWater } from './recorded-water.mjs';
import { loadRecordedSoda } from './recorded-soda.mjs';

const root = new URL('../', import.meta.url);
const output = await build({ entryPoints: [fileURLToPath(new URL('src/audio/FoleySamples.ts', root))],
  bundle: true, platform: 'node', format: 'esm', write: false, logLevel: 'silent' });
const { impactSamples, flowSamples } = await import(`data:text/javascript;base64,${Buffer.from(output.outputFiles[0].text).toString('base64')}`);
const sampleRate = 24000;
const recordedWater = await loadRecordedWater();
const recordedSoda = await loadRecordedSoda();
const wet = material => material === 'water' || material === 'hybrid';
const samplesFor = (material, kind, variation = 0) => material === 'soda' && ['pop', 'vent'].includes(kind)
  ? recordedSoda.clip(kind, variation)
  : wet(material) || material === 'soda' ? recordedWater.clip(material === 'soda' ? 'water' : material, kind, variation)
  : kind === 'flow' ? flowSamples(material, sampleRate) : impactSamples(material, kind, sampleRate, variation + 1);
const materials = ['coin', 'marble', 'sand', 'water', 'soda', 'hybrid'];
const clips = {}, parts = [];
let totalFrames = 0;
const add = (key, samples, source = 'locally-authored') => {
  if (!samples.every(value => Number.isFinite(value) && Math.abs(value) < 0.81)) throw new Error(`Invalid PCM: ${key}`);
  clips[key] = { start: totalFrames, frames: samples.length, source };
  totalFrames += samples.length; parts.push(samples);
};
for (const material of materials) {
  const source = wet(material) || material === 'soda' ? recordedWater.provenance.id : 'locally-authored';
  add(`flow:${material}`, samplesFor(material, 'flow'), source);
  for (const kind of ['impact', 'scrape']) for (let variation = 0; variation < 4; variation++) {
    add(`${material}:${kind}:${variation}`, samplesFor(material, kind, variation), source);
  }
}
for (let variation = 0; variation < 4; variation++) add(`pop:${variation}`, samplesFor('soda', 'pop', variation), recordedSoda.provenance[0].id);
add('vent:soda', samplesFor('soda', 'vent'), recordedSoda.provenance[1].id);

function wav(parts, frames) {
  const buffer = Buffer.alloc(44 + frames * 2);
  buffer.write('RIFF'); buffer.writeUInt32LE(buffer.length - 8, 4); buffer.write('WAVEfmt ', 8);
  buffer.writeUInt32LE(16, 16); buffer.writeUInt16LE(1, 20); buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24); buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32); buffer.writeUInt16LE(16, 34); buffer.write('data', 36);
  buffer.writeUInt32LE(frames * 2, 40);
  let offset = 44;
  for (const samples of parts) for (const sample of samples) {
    buffer.writeInt16LE(Math.round(sample * 32767), offset); offset += 2;
  }
  return buffer;
}
const directory = new URL('src/assets/audio/', root);
await mkdir(directory, { recursive: true });
await writeFile(new URL('foley-bank.wav', directory), wav(parts, totalFrames));
await writeFile(new URL('foley-bank.json', directory), JSON.stringify({ version: 1, sampleRate, totalFrames,
  provenance: 'Authored solids plus Joseph SARDIN CC0 recorded water, cork and fizz; see sources/CREDITS.md.',
  recordedSources: [recordedWater.provenance, ...recordedSoda.provenance], clips }, null, 2) + '\n');
// Short listening reel, with silence between materials. It is not shipped.
const audition = [];
for (const material of materials) {
  audition.push(new Float32Array(sampleRate * 0.35));
  for (let seed = 1; seed <= 3; seed++) {
    audition.push(samplesFor(material, material === 'soda' ? 'pop' : 'impact', seed - 1));
    audition.push(new Float32Array(sampleRate * 0.25));
  }
  audition.push(samplesFor(material, 'flow'));
  if (material === 'soda') audition.push(samplesFor(material, 'vent'));
}
const preview = new URL('../tmp/audio/', root);
await mkdir(preview, { recursive: true });
await writeFile(new URL('foley-audition.wav', preview), wav(audition, audition.reduce((sum, clip) => sum + clip.length, 0)));
console.log(`Generated ${Object.keys(clips).length} clips, ${(totalFrames / sampleRate).toFixed(2)} s / ${(44 + totalFrames * 2).toLocaleString()} bytes. Audition: tmp/audio/foley-audition.wav`);
