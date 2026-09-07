import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

const bundle = await build({ entryPoints: [fileURLToPath(new URL('../src/audio/FoleySamples.ts', import.meta.url))],
  bundle: true, format: 'esm', platform: 'node', write: false, logLevel: 'silent' });
const { impactSamples, flowSamples } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const materials = ['coin', 'marble', 'sand', 'water', 'soda', 'hybrid'];
const kinds = ['impact', 'scrape', 'pop'];
const rms = values => Math.sqrt(values.reduce((sum, value) => sum + value * value, 0) / values.length);
const peak = values => values.reduce((maximum, value) => Math.max(maximum, Math.abs(value)), 0);
const duration = (material, kind) => kind === 'pop' ? 0.48 : material === 'coin' ? 0.36 :
  ['water', 'soda', 'hybrid'].includes(material) ? kind === 'scrape' ? 0.30 : material === 'hybrid' ? 0.60 : material === 'soda' ? 0.54 : 0.58 : 0.16;

test('all authored materials retain duration, bounded PCM, silence at edges and negligible DC across device rates', () => {
  for (const rate of [8000, 24000, 44100, 48000, 96000]) {
    for (const material of materials) {
      for (const kind of kinds) {
        const pcm = impactSamples(material, kind, rate);
        assert.equal(pcm.length, Math.ceil(duration(material, kind) * rate));
        assert.ok(pcm.every(Number.isFinite), `${material}/${kind}/${rate}: finite`);
        assert.ok(peak(pcm) < 0.8);
        assert.ok(rms(pcm) > 0.01, `${material}/${kind}/${rate}: useful level`);
        assert.equal(Math.abs(pcm[0]), 0); assert.equal(Math.abs(pcm.at(-1)), 0);
        assert.ok(Math.abs(pcm.reduce((sum, value) => sum + value, 0) / pcm.length) < 1e-7);
      }
      const flow = flowSamples(material, rate);
      assert.equal(flow.length, rate * 2);
      assert.ok(flow.every(Number.isFinite)); assert.ok(peak(flow) < 0.8);
      assert.ok(rms(flow) > 0.08 && rms(flow) < 0.15);
      assert.equal(Math.abs(flow[0]), 0); assert.equal(Math.abs(flow.at(-1)), 0);
      assert.ok(Math.abs(flow.reduce((sum, value) => sum + value, 0) / flow.length) < 1e-7);
    }
  }
});

test('four contact variations are repeatable and distinct without large gain or duration changes', () => {
  for (const material of materials) {
    for (const kind of kinds) {
      const variants = [1, 2, 3, 4].map(seed => impactSamples(material, kind, 48000, seed));
      for (let i = 0; i < variants.length; i++) {
        assert.deepEqual(variants[i], impactSamples(material, kind, 48000, i + 1));
        if (i) assert.notDeepEqual(variants[i].slice(0, 1000), variants[0].slice(0, 1000));
      }
      const levels = variants.map(rms);
      assert.ok(Math.max(...levels) / Math.min(...levels) < 1.55, `${material}/${kind}: variation loudness`);
      assert.ok(Math.max(...variants.map(peak)) / Math.min(...variants.map(peak)) < 1.01);
    }
    assert.deepEqual(flowSamples(material, 24000), flowSamples(material, 24000));
  }
});

test('solid contacts and pressure opening retain short decaying bodies with no second hit', () => {
  const rate = 48000;
  for (const material of materials) for (const kind of kinds) {
    if (['water', 'soda', 'hybrid'].includes(material) && kind !== 'pop') continue;
    const pcm = impactSamples(material, kind, rate, 3);
    const first = rms(pcm.slice(0, Math.round(rate * 0.035)));
    const late = rms(pcm.slice(Math.round(rate * 0.105)));
    assert.ok(late < first * 0.06, `${material}/${kind}: late energy ${late / first}`);
    assert.ok(rms(pcm.slice(Math.floor(pcm.length * 0.75))) < first * 0.015, `${material}/${kind}: short tail`);
    const windows = [];
    for (let start = Math.round(rate * 0.045); start + rate * 0.015 < pcm.length; start += rate * 0.015) {
      windows.push(rms(pcm.slice(start, start + rate * 0.015)));
    }
    assert.ok(Math.max(...windows) < first * 0.35, `${material}/${kind}: no late reattack`);
  }
});

/** Energy captured by a moving sinusoid. This detects the formerly audible
 * exponential water/pop chirps, including a reversed upward pitch trajectory,
 * without treating ordinary broadband spectral changes as musical notes. */
function sweepCoherence(pcm, rate, endHz, rangeHz, speed, reverse = false) {
  const count = Math.min(pcm.length, Math.round(rate * 0.09));
  let real = 0, imaginary = 0, energy = 0;
  for (let i = 0; i < count; i++) {
    const t = i / rate;
    const time = reverse ? 0.09 - t : t;
    const phase = 2 * Math.PI * (endHz * time - rangeHz / speed * Math.exp(-speed * time));
    real += pcm[i] * Math.cos(phase); imaginary += pcm[i] * Math.sin(phase);
    energy += pcm[i] * pcm[i];
  }
  return 2 * (real * real + imaginary * imaginary) / (count * energy);
}

test('water, hybrid and pressure release do not contain the old laser-like tonal sweeps', () => {
  for (const rate of [24000, 48000]) for (const seed of [1, 2, 3, 4]) {
    const conditions = [['water', 'impact'], ['soda', 'impact'], ['hybrid', 'impact'], ['soda', 'pop']];
    for (const [material, kind] of conditions) {
      const pcm = impactSamples(material, kind, rate, seed);
      let largest = 0;
      for (const [end, range, speed] of [[420, 1200, 35], [95, 280, 42], [180, 850, 26], [650, 1800, 42]]) {
        for (const reverse of [false, true]) largest = Math.max(largest, sweepCoherence(pcm, rate, end, range, speed, reverse));
      }
      assert.ok(largest < 0.055, `${material}/${kind}/${seed}/${rate}: tonal sweep energy ${largest}`);
    }
  }
});

function bandEnergy(pcm, rate, lowHz, highHz) {
  let low = 0, high = 0, energy = 0;
  const a = 1 - Math.exp(-2 * Math.PI * lowHz / rate), b = 1 - Math.exp(-2 * Math.PI * highHz / rate);
  for (const value of pcm) {
    low += a * (value - low); high += b * (value - high);
    energy += (high - low) ** 2;
  }
  return energy / pcm.length;
}

test('rolling remains darker than metal scrape and filters retain their physical bands at different sample rates', () => {
  const colours = new Map();
  for (const rate of [24000, 48000, 96000]) {
    for (const material of materials) {
      const pcm = flowSamples(material, rate);
      const colour = bandEnergy(pcm, rate, 2200, 8500) / bandEnergy(pcm, rate, 80, 1300);
      colours.set(`${material}:${rate}`, colour);
      if (rate !== 24000) {
        const reference = colours.get(`${material}:24000`);
        assert.ok(colour / reference > 0.65 && colour / reference < 1.6,
          `${material}: sample-rate colour drift ${colour / reference}`);
      }
    }
    assert.ok(colours.get(`coin:${rate}`) > colours.get(`marble:${rate}`) * 4);
    assert.ok(colours.get(`sand:${rate}`) > colours.get(`water:${rate}`) * 2);
    assert.ok(colours.get(`soda:${rate}`) > colours.get(`water:${rate}`) * 1.5);
  }
});

test('flow has irregular texture rather than the former periodic breathing modulation', () => {
  const rate = 24000, block = 240;
  for (const material of materials) {
    const pcm = flowSamples(material, rate), envelope = [];
    for (let i = block * 5; i + block < pcm.length - block * 5; i += block) envelope.push(rms(pcm.slice(i, i + block)));
    const mean = envelope.reduce((sum, value) => sum + value, 0) / envelope.length;
    const centered = envelope.map(value => value - mean), energy = centered.reduce((sum, value) => sum + value * value, 0);
    let largest = 0;
    for (let frequency = 2; frequency <= 12; frequency += 0.5) {
      let real = 0, imaginary = 0;
      centered.forEach((value, index) => {
        const phase = 2 * Math.PI * frequency * index * block / rate;
        real += value * Math.cos(phase); imaginary += value * Math.sin(phase);
      });
      largest = Math.max(largest, 2 * (real * real + imaginary * imaginary) / (centered.length * energy));
    }
    assert.ok(largest < 0.36, `${material}: periodic envelope fraction ${largest}`);
    assert.ok(rms(centered) / mean > 0.025, `${material}: retained irregular texture`);
  }
});

test('unsupported sample rates fail without generating invalid or enormous PCM', () => {
  for (const rate of [0, -1, NaN, Infinity, 7999, 192001]) {
    assert.throws(() => impactSamples('coin', 'impact', rate), RangeError);
    assert.throws(() => flowSamples('water', rate), RangeError);
  }
});
