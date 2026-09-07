// Offline excerpts from CC0 recordings. Runtime receives only the existing atlas.
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

export async function loadRecordedSoda() {
  const directory = new URL('../src/assets/audio/sources/', import.meta.url);
  const manifest = JSON.parse(await readFile(new URL('soda-recordings.json', directory), 'utf8'));
  const sources = await Promise.all(manifest.recordings.map(async provenance => {
    const wav = await readFile(new URL(provenance.localFile, directory));
    if (createHash('sha256').update(wav).digest('hex') !== provenance.localSha256) throw new Error('Soda source changed without matching provenance');
    if (wav.toString('ascii', 0, 4) !== 'RIFF' || wav.toString('ascii', 8, 12) !== 'WAVE') throw new Error('Invalid soda WAV');
    let format, pcm;
    for (let offset = 12; offset + 8 <= wav.length;) {
      const name = wav.toString('ascii', offset, offset + 4), size = wav.readUInt32LE(offset + 4), start = offset + 8;
      if (start + size > wav.length) throw new Error('Truncated soda WAV');
      if (name === 'fmt ') format = wav.subarray(start, start + size);
      if (name === 'data') pcm = wav.subarray(start, start + size);
      offset = start + size + size % 2;
    }
    if (!format || format.length < 16 || !pcm || pcm.length % 2 || format.readUInt16LE(0) !== 1 ||
        format.readUInt16LE(2) !== 1 || format.readUInt32LE(4) !== 24000 || format.readUInt16LE(14) !== 16) throw new Error('Soda source must be mono 24 kHz PCM16');
    return Float32Array.from({ length: pcm.length / 2 }, (_, i) => pcm.readInt16LE(i * 2) / 32768);
  }));
  const sampleRate = 24000;
  const clip = (kind, variation = 0) => {
    if (!['pop', 'vent'].includes(kind) || !Number.isInteger(variation) || variation < 0 || variation > 3) throw new Error('Unknown soda recording clip');
    const [startS, durationS] = kind === 'pop' ? manifest.excerpts.pop[variation] : manifest.excerpts.vent;
    const source = sources[kind === 'pop' ? 0 : 1], start = Math.round(startS * sampleRate), frames = Math.round(durationS * sampleRate);
    if (start < 0 || start + frames > source.length) throw new Error('Soda excerpt is out of range');
    let samples = source.slice(start, start + frames);
    if (kind === 'vent') {
      const overlap = Math.round(0.2 * sampleRate), length = frames - overlap, loop = samples.slice(0, length);
      for (let i = 0; i < overlap; i++) {
        const mix = 0.5 - 0.5 * Math.cos(Math.PI * i / overlap);
        loop[i] = samples[length + i] * (1 - mix) + samples[i] * mix;
      }
      samples = loop;
    } else {
      const attack = Math.round(0.002 * sampleRate), release = Math.round(0.08 * sampleRate);
      for (let i = 0; i < frames; i++) {
        const envelope = Math.min(1, i / attack, (frames - 1 - i) / release);
        samples[i] *= 0.5 - 0.5 * Math.cos(Math.PI * envelope);
      }
    }
    let peak = 0;
    for (const value of samples) peak = Math.max(peak, Math.abs(value));
    const gain = Math.min(3, 0.72 / Math.max(peak, 0.001));
    return samples.map(value => value * gain);
  };
  return { clip, sampleRate, provenance: manifest.recordings, excerpts: manifest.excerpts };
}
