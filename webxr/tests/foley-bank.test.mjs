import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { loadRecordedWater } from '../scripts/recorded-water.mjs';
import { loadRecordedSoda } from '../scripts/recorded-soda.mjs';

const asset = new URL('../src/assets/audio/', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('foley-bank.json', asset), 'utf8'));
const wav = await readFile(new URL('foley-bank.wav', asset));
async function load(path) {
  const built = await build({entryPoints:[fileURLToPath(new URL(path,import.meta.url))],bundle:true,platform:'node',format:'esm',write:false,logLevel:'silent'});
  return import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`);
}
const {decodeFoleyBank} = await load('../src/audio/FoleyBank.ts');
const {impactSamples,flowSamples} = await load('../src/audio/FoleySamples.ts');
const recordedWater = await loadRecordedWater();
const recordedSoda = await loadRecordedSoda();

test('shipped WAV bank exactly matches licensed recorded water/soda and unchanged authored solids', () => {
  assert.equal(wav.toString('ascii',0,4),'RIFF'); assert.equal(wav.toString('ascii',8,16),'WAVEfmt ');
  assert.equal(wav.readUInt16LE(20),1); assert.equal(wav.readUInt16LE(22),1);
  assert.equal(wav.readUInt32LE(24),manifest.sampleRate); assert.equal(wav.readUInt16LE(34),16);
  assert.equal(wav.length,44+manifest.totalFrames*2);
  let expectedStart=0;
  for(const [key,clip] of Object.entries(manifest.clips)) {
    assert.equal(clip.start,expectedStart); expectedStart+=clip.frames;
    const [material,kind,variation] = key.split(':');
    const wetMaterial = material === 'flow' ? kind : material;
    const wet = ['water', 'hybrid', 'soda'].includes(wetMaterial);
    const samples = material === 'pop' ? recordedSoda.clip('pop', Number(kind))
      : material === 'vent' ? recordedSoda.clip('vent')
      : wet ? recordedWater.clip(wetMaterial === 'soda' ? 'water' : wetMaterial, material === 'flow' ? 'flow' : kind, Number(variation) || 0)
      : material==='flow' ? flowSamples(kind,manifest.sampleRate)
      : impactSamples(material,kind,manifest.sampleRate,Number(variation)+1);
    assert.equal(clip.source, material === 'pop' ? recordedSoda.provenance[0].id
      : material === 'vent' ? recordedSoda.provenance[1].id : wet ? recordedWater.provenance.id : 'locally-authored');
    assert.equal(clip.frames,samples.length);
    for(let i=0;i<samples.length;i++) assert.equal(wav.readInt16LE(44+(clip.start+i)*2), Math.round(samples[i]*32767) || 0,
      'Regenerate audio:generate after editing sources/excerpts; do not ship stale samples');
  }
  assert.equal(expectedStart,manifest.totalFrames);
  assert.equal(Object.keys(manifest.clips).length,59);
  assert.ok(manifest.clips['vent:soda']);
  for(const material of ['coin','marble','sand','water','soda','hybrid']) {
    assert.ok(manifest.clips[`flow:${material}`]);
    for(const kind of ['impact','scrape']) for(let v=0;v<4;v++) assert.ok(manifest.clips[`${material}:${kind}:${v}`]);
  }
});

test('soda uses an actual early cork onset and separate loopable fizz, with source licenses retained', () => {
  for (const source of recordedSoda.provenance) {
    assert.equal(source.license, 'CC0-1.0'); assert.equal(source.author, 'Joseph SARDIN');
    assert.ok(manifest.recordedSources.some(value => value.localSha256 === source.localSha256));
  }
  for (let n = 0; n < 4; n++) {
    const pop = recordedSoda.clip('pop', n);
    assert.equal(pop.length / manifest.sampleRate, 0.48);
    assert.equal(Math.abs(pop[0]), 0); assert.equal(Math.abs(pop.at(-1)), 0);
    let peak = 0, peakIndex = 0;
    pop.forEach((v, i) => { if (Math.abs(v) > peak) { peak = Math.abs(v); peakIndex = i; } });
    assert.ok(peak > 0.5 && peak < 0.721);
    assert.ok(peakIndex / manifest.sampleRate < 0.035, 'trim source silence so the opening follows its event promptly');
  }
  const vent = recordedSoda.clip('vent');
  assert.equal(vent.length / manifest.sampleRate, 3.6);
  assert.ok(vent.every(v => Number.isFinite(v) && Math.abs(v) < 0.721));
  assert.ok(Math.abs(vent[0] - vent.at(-1)) < 0.03);
});

test('real-water clips preserve provenance, natural excerpts, faded tails and long loop continuity', () => {
  assert.equal(recordedWater.provenance.license, 'CC0-1.0');
  assert.equal(recordedWater.provenance.author, 'Joseph SARDIN');
  assert.equal(manifest.recordedSources[0].localSha256, recordedWater.provenance.localSha256);
  for (const material of ['water', 'hybrid']) {
    const flow = recordedWater.clip(material, 'flow');
    assert.equal(flow.length / manifest.sampleRate, 5.8);
    assert.ok(Math.abs(flow[0] - flow.at(-1)) < 0.015, 'crossfade joins adjacent original PCM, not a hard repeated burst');
    const signatures = new Set();
    for (const kind of ['impact', 'scrape']) for (let n = 0; n < 4; n++) {
      const samples = recordedWater.clip(material, kind, n);
      assert.ok(samples.length / manifest.sampleRate >= 0.75);
      assert.equal(Math.abs(samples[0]), 0); assert.equal(Math.abs(samples.at(-1)), 0);
      assert.ok(samples.every(value => Number.isFinite(value) && Math.abs(value) <= 0.721));
      assert.ok(samples.some(value => Math.abs(value) > 0.1));
      signatures.add(samples.slice(1000, 1200).join(','));
    }
    assert.equal(signatures.size, 8);
  }
});

test('decoded clip boundaries and durations survive native WebAudio resampling', async () => {
  for(const rate of [24000,44100,48000]) {
    const length=Math.round(manifest.totalFrames/manifest.sampleRate*rate);
    const pcm=Float32Array.from({length},(_,i)=>Math.sin(i*.011)*.1);
    const ctx={ decodeAudioData:async()=>({numberOfChannels:1,sampleRate:rate,length,duration:length/rate,getChannelData:()=>pcm}),
      createBuffer:(_channels,frames,sampleRate)=>({length:frames,sampleRate,copyToChannel(data){this.pcm=Float32Array.from(data);}}) };
    const bank=await decodeFoleyBank(ctx,new ArrayBuffer(0));
    for(const [key,clip] of Object.entries(manifest.clips)) {
      const buffer=bank.get(key),start=Math.round(clip.start/manifest.sampleRate*rate);
      assert.equal(buffer.length,Math.round(clip.frames/manifest.sampleRate*rate));
      assert.equal(buffer.pcm[0],pcm[start]); assert.equal(buffer.pcm.at(-1),pcm[start+buffer.length-1]);
    }
  }
});

test('invalid or truncated audio bank fails instead of enabling a partially populated player', async () => {
  for(const bad of [{numberOfChannels:2,sampleRate:24000,duration:40},{numberOfChannels:1,sampleRate:24000,duration:.1}]) {
    await assert.rejects(decodeFoleyBank({decodeAudioData:async()=>bad},new ArrayBuffer(0)),/形式/);
  }
});
