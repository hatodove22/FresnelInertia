import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

const bundle = await build({ entryPoints: [fileURLToPath(new URL('../src/audio/FoleySamples.ts', import.meta.url))],
  bundle: true, format: 'esm', platform: 'node', write: false, logLevel: 'silent' });
const { impactSamples, sloshSamples, flowSamples } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const liquids = ['water', 'soda', 'hybrid'];
const rms = pcm => Math.sqrt(pcm.reduce((sum, value) => sum + value * value, 0) / pcm.length);
const energy = pcm => pcm.reduce((sum, value) => sum + value * value, 0);
const hash = pcm => createHash('sha256').update(new Uint8Array(pcm.buffer)).digest('hex');
function bandEnergy(pcm, rate, lowHz, highHz) {
  let low = 0, high = 0, sum = 0;
  const a = 1 - Math.exp(-2 * Math.PI * lowHz / rate), b = 1 - Math.exp(-2 * Math.PI * highHz / rate);
  for (const value of pcm) {
    low += a * (value - low); high += b * (value - high);
    sum += (high - low) ** 2;
  }
  return sum / pcm.length;
}

test('liquid accents expose the same seeded PCM as impacts, with broad body and a quiet taper', () => {
  for (const material of liquids) for (const rate of [8000, 24000, 48000, 96000]) for (const seed of [1, 3]) {
    const pcm = sloshSamples(material, rate, seed);
    assert.deepEqual(pcm, impactSamples(material, 'impact', rate, seed));
    assert.ok(pcm.length / rate >= 0.50 && pcm.length / rate <= 0.65);
    const initial = rms(pcm.slice(0, Math.round(rate * 0.045)));
    const body = rms(pcm.slice(Math.round(rate * 0.08), Math.round(rate * 0.26)));
    assert.ok(body > initial * 0.30 && body < initial * 0.80,
      `${material}/${rate}: retained broad water body, not a tiny click plus empty buffer`);
    assert.ok(rms(pcm.slice(Math.round(rate * 0.43))) < initial * 0.035, 'aerated tail subsides instead of becoming a steady hiss');
    assert.equal(Math.abs(pcm[0]), 0); assert.equal(Math.abs(pcm.at(-1)), 0);
    assert.ok(pcm.every(Number.isFinite));
    assert.ok(Math.abs(pcm.reduce((sum, value) => sum + value, 0) / pcm.length) < 1e-7);
    assert.ok(pcm.reduce((peak, value) => Math.max(peak, Math.abs(value)), 0) <= 0.700001);
  }
});

test('liquid scrapes are shorter and have less integrated energy than the broad impact', () => {
  for (const material of liquids) for (const rate of [24000, 48000]) for (const seed of [1, 2, 3, 4]) {
    const scrape = impactSamples(material, 'scrape', rate, seed), impact = impactSamples(material, 'impact', rate, seed);
    assert.equal(scrape.length, Math.ceil(rate * 0.30));
    assert.ok(energy(scrape) < energy(impact) * 0.7, `${material}: moving wet contact does not outweigh the surge`);
    assert.ok(rms(scrape.slice(Math.floor(scrape.length * 0.75))) < rms(scrape.slice(0, rate * 0.05)) * 0.05);
  }
});

test('water carries more low/mid body than high spray without sample-rate-dependent colour shifts', () => {
  for (const material of ['water', 'hybrid']) for (const seed of [1, 2, 3, 4]) {
    let reference;
    for (const rate of [24000, 48000, 96000]) {
      const pcm = sloshSamples(material, rate, seed);
      const colour = bandEnergy(pcm, rate, 90, 1800) / bandEnergy(pcm, rate, 3000, 10000);
      assert.ok(colour > 2, `${material}/${rate}: water mass should outweigh fine spray`);
      if (reference) assert.ok(colour / reference > 0.7 && colour / reference < 1.4);
      else reference = colour;
    }
  }
});

test('solid contacts, every pressure pop and all two-second beds remain byte-for-byte unchanged', () => {
  const previous = {
    'coin/impact': '9e471cc4369f6cdbb2a3948ef27898f0549c84852213b14aadd284a2f4a9cbd6',
    'coin/scrape': 'd01b68caf50739d00f58fb7523b0f9c3d15d79f6e8ad8b7bfc2dedfb7bda6066',
    'marble/impact': 'a8b0110685b02001ebc78efadcc139f37dce5a5f9c69145cc27e532f75c4b0d3',
    'marble/scrape': '54541dea8f1a08d62332cf403d150fabeafc919896348a3ef8f6c363d8ccfece',
    'sand/impact': '368bf626cab6a4a3950b795413b8b09b6e2d95ca60261b0168f96e2ee0908d01',
    'sand/scrape': 'f85d47b81de324dee596e248a1d96c8024294441feb27dc81bdb6dd9f2f5f1e4',
  };
  for (const [key, expected] of Object.entries(previous)) {
    const [material, kind] = key.split('/');
    assert.equal(hash(impactSamples(material, kind, 24000, 7)), expected, key);
  }
  const all = ['coin', 'marble', 'sand', ...liquids];
  for (const material of all) assert.equal(hash(impactSamples(material, 'pop', 24000, 7)), '3008860eee305b1e39c1671adecbba86d1c34517d9ec18bbceced269e3b2ddcb');
  assert.equal(createHash('sha256').update(Buffer.concat(all.map(material => Buffer.from(flowSamples(material, 24000).buffer)))).digest('hex'),
    '056d81ccedb02bc805b39541e7c1288666e3e334a89e71a1fbfba38db40d477f');
});

test('slosh export validates its audio rate before allocating samples', () => {
  for (const rate of [0, -1, NaN, Infinity, 7999, 192001]) assert.throws(() => sloshSamples('water', rate), RangeError);
});
