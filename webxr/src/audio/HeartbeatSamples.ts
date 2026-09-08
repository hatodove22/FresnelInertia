/** Authored soft body thud, not a cardiac recording. Fixed damped modes and
 * low-passed contact noise avoid a pitched chirp. One source event plays one
 * sample; the waveform never schedules the second beat or a repeating rhythm. */
export function heartbeatSamples(sampleRate: number): Float32Array<ArrayBuffer> {
  if (!Number.isFinite(sampleRate) || sampleRate < 8000 || sampleRate > 192000) throw new RangeError("Invalid heartbeat sample rate");
  const samples = new Float32Array(Math.round(sampleRate * 0.17));
  let random = 0x75ac19d3, low = 0, mid = 0;
  const a = 1 - Math.exp(-2 * Math.PI * 260 / sampleRate);
  const b = 1 - Math.exp(-2 * Math.PI * 48 / sampleRate);
  for (let i = 0; i < samples.length; ++i) {
    random = (Math.imul(random, 1664525) + 1013904223) >>> 0;
    const noise = random / 2147483648 - 1;
    low += a * (noise - low); mid += b * (noise - mid);
    const t = i / sampleRate;
    const body = 0.50 * Math.sin(2 * Math.PI * 62 * t) * Math.exp(-t / 0.025)
      + 0.26 * Math.sin(2 * Math.PI * 103 * t) * Math.exp(-t / 0.016)
      + 0.12 * Math.sin(2 * Math.PI * 167 * t) * Math.exp(-t / 0.010);
    const attack = 1 - Math.exp(-t / 0.0035);
    const tail = Math.min(1, (samples.length - 1 - i) / (sampleRate * 0.015));
    samples[i] = (body + 0.50 * (low - mid) * Math.exp(-t / 0.033)) * attack * tail;
  }
  return samples;
}
