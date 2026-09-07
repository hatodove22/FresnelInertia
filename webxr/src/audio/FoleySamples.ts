import type { SoundEvent, SoundMaterial } from "./SoundState";

/** Authored procedural Foley PCM, not recordings or AI-generated audio.
 * These cached textures voice an existing source event; they create no new
 * contacts. Oscillating impact modes have fixed frequencies, never pitch sweeps. */
const TAU = 2 * Math.PI;
const materials: SoundMaterial[] = ["coin", "marble", "sand", "water", "soda", "hybrid"];

function random(seed: number) {
  let state = (Math.imul(seed | 0, 0x45d9f3b) ^ 0x9e3779b9) >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let n = Math.imul(state ^ (state >>> 15), state | 1);
    n ^= n + Math.imul(n ^ (n >>> 7), n | 61);
    return (((n ^ (n >>> 14)) >>> 0) / 2147483648) - 1;
  };
}

function checkRate(rate: number) {
  if (!Number.isFinite(rate) || rate < 8000 || rate > 192000) {
    throw new RangeError("Foley sample rate must be between 8000 and 192000 Hz");
  }
}

/** Difference of two one-pole low passes. Hz, rather than a per-sample
 * constant, owns the colour; variance compensation keeps its noise level
 * comparable at different sample rates. Both poles stay below Nyquist. */
function noiseBand(rate: number, lowHz: number, highHz: number) {
  const a = 1 - Math.exp(-TAU * Math.min(highHz, rate * 0.42) / rate);
  const b = 1 - Math.exp(-TAU * Math.min(lowHz, rate * 0.30) / rate);
  const variance = a / (2 - a) + b / (2 - b) - 2 * a * b / (a + b - a * b);
  const gain = 1 / Math.sqrt(Math.max(variance, 1e-8));
  let upper = 0, lower = 0;
  return (sample: number) => {
    upper += a * (sample - upper);
    lower += b * (sample - lower);
    return (upper - lower) * gain;
  };
}

/** Irregular, gently joined roughness; its clock and random stream do not
 * depend on the number of audio samples or introduce a rhythmic hit train. */
function roughness(seed: number, minS: number, spanS: number) {
  const noise = random(seed);
  let start = 0, end = 0, from = noise(), to = from;
  return (timeS: number) => {
    while (timeS >= end) {
      start = end; from = to; to = noise();
      end += minS + (noise() + 1) * 0.5 * spanS;
    }
    const x = (timeS - start) / (end - start);
    return from + (to - from) * x * x * (3 - 2 * x);
  };
}

interface Mode { frequency: number; amplitude: number; decayS: number; phase: number }
function modes(rate: number, seed: number, definitions: readonly (readonly [number, number, number])[]): Mode[] {
  const noise = random(seed + 197);
  // Small fixed changes describe another contact on the same object. They do
  // not modulate frequency during a sample or turn one coin into another note.
  const detune = 1 + noise() * 0.012;
  return definitions.filter(([hz]) => hz * detune < rate * 0.42).map(([hz, amplitude, decayS]) => ({
    frequency: hz * detune,
    amplitude: amplitude * (1 + noise() * 0.10),
    decayS: decayS * (1 + noise() * 0.07),
    phase: noise() * 0.22,
  }));
}
function resonances(bank: Mode[], timeS: number) {
  let value = 0;
  for (const mode of bank) {
    value += mode.amplitude * Math.sin(TAU * mode.frequency * timeS + mode.phase) * Math.exp(-timeS / mode.decayS);
  }
  return value;
}

/** Remove DC, taper both edges and apply one constant gain. A transient keeps
 * its crest and strength relationship; no waveshaping creates extra tones. */
function finish(samples: Float32Array, rate: number, peak: number, attackS: number, tailS: number, targetRms?: number) {
  const pole = Math.exp(-TAU * 25 / rate);
  let previous = 0, high = 0, sum = 0, weightSum = 0;
  const edge = (index: number) => Math.min(1, index / (rate * attackS)) *
    Math.min(1, (samples.length - 1 - index) / (rate * tailS));
  for (let i = 0; i < samples.length; i++) {
    const value = samples[i];
    high = pole * (high + value - previous); previous = value;
    const weight = edge(i);
    samples[i] = high * weight;
    sum += samples[i]; weightSum += weight;
  }
  const mean = sum / Math.max(1, weightSum);
  let maximum = 0, energy = 0;
  for (let i = 0; i < samples.length; i++) {
    samples[i] -= mean * edge(i);
    maximum = Math.max(maximum, Math.abs(samples[i]));
    energy += samples[i] * samples[i];
  }
  const gain = Math.min(peak / Math.max(maximum, 1e-9),
    targetRms === undefined ? Infinity : targetRms / Math.sqrt(Math.max(energy / samples.length, 1e-12)));
  for (let i = 0; i < samples.length; i++) samples[i] *= gain;
  return samples;
}

export type LiquidSoundMaterial = "water" | "soda" | "hybrid";

/** A water body arriving and folding back, with scattered wet edges and a
 * subdued aerated tail. These are overlapping parts of one Foley gesture, not
 * a clock of new container contacts. Packet times/frequencies are authored in
 * seconds/Hz and seeded independently of the audio sample rate. */
function liquidFoley(material: LiquidSoundMaterial, rate: number, seed: number, scrape: boolean) {
  checkRate(rate);
  const duration = scrape ? 0.30 : material === "hybrid" ? 0.60 : material === "soda" ? 0.54 : 0.58;
  const samples = new Float32Array(Math.ceil(rate * duration));
  const noise = random(seed + 2531), variation = random(seed + 719);
  const unit = () => (variation() + 1) * 0.5;
  const timeScale = scrape ? 0.52 : 1;
  const body = noiseBand(rate, 60, 680), wet = noiseBand(rate, 240, 3200), spray = noiseBand(rate, 1600, 7200);
  const bodyMotion = roughness(seed + 3253, 0.014 * timeScale, 0.040 * timeScale);
  const wetEdges = roughness(seed + 2131, 0.004 * timeScale, 0.016 * timeScale);
  const folds = Array.from({ length: scrape ? 4 : 7 }, (_, i) => ({
    start: (0.016 + (i + unit() * 0.65) / 7 * 0.24) * timeScale,
    length: (0.028 + unit() * 0.052) * timeScale,
    level: (0.10 + unit() * 0.17) * (1 - i * 0.075),
  }));
  const bubbles = Array.from({ length: scrape ? 4 : 9 }, () => ({
    start: (0.035 + unit() * 0.27) * timeScale,
    frequency: 180 + unit() * 640,
    decay: (0.008 + unit() * 0.013) * timeScale,
    level: 0.022 + unit() * 0.027,
    phase: unit() * TAU,
  }));
  const ice = material === "hybrid" ? modes(rate, seed, [[883, 0.055, 0.008], [1799, 0.05, 0.006], [2963, 0.03, 0.005]]) : [];
  for (let i = 0; i < samples.length; i++) {
    const t = i / rate, n = noise(), low = body(n), mid = wet(n), high = spray(n);
    const surge = (1 - Math.exp(-t / (0.006 * timeScale))) * Math.exp(-t / (0.12 * timeScale));
    const wash = (1 - Math.exp(-t / (0.003 * timeScale))) * Math.exp(-t / (0.078 * timeScale));
    let fold = 0;
    for (const packet of folds) {
      const local = (t - packet.start) / packet.length;
      if (local > 0 && local < 1) fold += packet.level * Math.sin(Math.PI * local) ** 2;
    }
    // Low/mid, non-tonal mass carries the gesture. Bright spray is a brief
    // edge, never the sustained hiss that previously dominated the water.
    let value = low * 0.82 * surge * (0.82 + bodyMotion(t) * 0.18) +
      mid * (0.44 * wash * (0.74 + wetEdges(t) * 0.26) + fold) +
      high * (material === "soda" ? 0.13 : 0.075) * (wash + fold * 0.8);
    for (const bubble of bubbles) {
      const local = t - bubble.start;
      if (local <= 0 || local > bubble.decay * 7) continue;
      const envelope = (1 - Math.exp(-local / 0.002)) * Math.exp(-local / bubble.decay);
      // Low, short inharmonic air-pocket modes; their frequencies do not sweep.
      const phase = TAU * bubble.frequency * local + bubble.phase;
      value += bubble.level * envelope * (Math.sin(phase) + 0.37 * Math.sin(phase * 1.53) + 0.19 * Math.sin(phase * 2.17));
    }
    if (material === "hybrid" && !scrape) value += resonances(ice, t) * 0.72;
    samples[i] = value;
  }
  return finish(samples, rate, scrape ? 0.58 : 0.70, scrape ? 0.003 : 0.0008, 0.025);
}

/** Reusable single slosh accent. No autonomous timing, loop or physical event. */
export function sloshSamples(material: LiquidSoundMaterial, rate: number, seed = 1): Float32Array {
  return liquidFoley(material, rate, seed, false);
}

export function impactSamples(material: SoundMaterial, kind: SoundEvent["kind"], rate: number, seed = 1): Float32Array {
  checkRate(rate);
  const liquid = material === "water" || material === "soda" || material === "hybrid";
  if (liquid && kind !== "pop") return liquidFoley(material, rate, seed, kind === "scrape");
  const duration = kind === "pop" ? 0.48 : material === "coin" ? 0.36 : liquid ? 0.24 : 0.16;
  const samples = new Float32Array(Math.ceil(rate * duration));
  const noise = random(seed), variation = random(seed + 353);
  const body = noiseBand(rate, 65, 950), middle = noiseBand(rate, 550, 5400), air = noiseBand(rate, 2200, 11800);
  const grain = roughness(seed + 739, 0.0025, 0.008);
  const decay = 1 + variation() * 0.075;
  const bank = modes(rate, seed, material === "coin" ? [
    [1741, 0.15, 0.026], [2519, 0.14, 0.021], [3343, 0.12, 0.025],
    [4463, 0.10, 0.019], [5657, 0.085, 0.017], [6971, 0.07, 0.014], [8297, 0.05, 0.012],
  ] : material === "hybrid" ? [
    [883, 0.055, 0.008], [1799, 0.05, 0.006], [2963, 0.03, 0.005],
  ] : material === "marble" ? [
    [637, 0.09, 0.007], [1523, 0.055, 0.0045], [2833, 0.03, 0.003],
  ] : []);
  for (let i = 0; i < samples.length; i++) {
    const t = i / rate, n = noise();
    const low = body(n), mid = middle(n), high = air(n);
    const envelope = (seconds: number) => Math.exp(-t / (seconds * decay));
    const detail = 0.86 + grain(t) * 0.14;
    let value: number;
    if (kind === "pop") {
      // One pressure release: broad thump, tearing onset, then escaping air.
      // There is no sinusoidal pressure chirp or delayed imitation wall hit.
      value = low * 0.84 * envelope(0.008) + mid * 0.56 * envelope(0.017) +
        high * 0.26 * (1 - Math.exp(-t / 0.002)) * envelope(0.062) * detail;
    } else if (kind === "scrape") {
      const texture = material === "coin" ? mid * 0.34 + high * 0.60 :
        material === "marble" ? low * 0.65 + mid * 0.26 :
        material === "sand" ? mid * 0.27 + high * 0.66 :
        material === "soda" ? low * 0.22 + mid * 0.38 + high * 0.32 :
        material === "hybrid" ? low * 0.52 + mid * 0.35 : low * 0.55 + mid * 0.48;
      value = texture * envelope(material === "marble" ? 0.018 : 0.027) * detail;
    } else if (material === "coin") {
      value = resonances(bank, t) + mid * 0.44 * envelope(0.006) +
        high * 0.32 * envelope(0.0035) + low * 0.20 * envelope(0.007);
    } else if (material === "marble") {
      value = low * 0.64 * envelope(0.007) + mid * 0.60 * envelope(0.004) +
        high * 0.24 * envelope(0.002) + resonances(bank, t);
    } else if (material === "sand") {
      value = (mid * 0.31 + high * 0.72) * envelope(0.018) * detail + low * 0.10 * envelope(0.011);
    } else {
      const fizz = material === "soda" ? 0.24 : 0.075;
      value = low * (material === "soda" ? 0.43 : 0.65) * envelope(0.027) +
        mid * 0.50 * envelope(0.030) * detail + high * fizz * envelope(material === "soda" ? 0.040 : 0.012) +
        (material === "hybrid" ? resonances(bank, t) + mid * 0.14 * envelope(0.004) : 0);
    }
    samples[i] = value;
  }
  return finish(samples, rate, kind === "pop" ? 0.75 : kind === "scrape" ? 0.58 : 0.70,
    kind === "scrape" ? 0.002 : kind === "pop" ? 0.0004 : 0.00055, 0.012);
}

export function flowSamples(material: SoundMaterial, rate: number): Float32Array {
  checkRate(rate);
  const samples = new Float32Array(Math.round(rate * 2));
  const identity = materials.indexOf(material);
  const noise = random(7391 + identity * 79), grain = roughness(5011 + identity * 151, 0.021, 0.087);
  const body = noiseBand(rate, 45, material === "marble" ? 620 : 1050);
  const middle = noiseBand(rate, material === "coin" ? 850 : 320, material === "marble" ? 1900 : 5200);
  const air = noiseBand(rate, 2100, 11500);
  for (let i = 0; i < samples.length; i++) {
    const n = noise(), low = body(n), mid = middle(n), high = air(n);
    const rough = 0.82 + grain(i / rate) * (material === "sand" ? 0.17 : 0.12);
    // Smooth low rolling contact, dry bright metal sliding, fine grit and wet
    // broadband motion remain distinct even without autonomous contact pulses.
    const value = material === "marble" ? low * 0.72 + mid * 0.24 :
      material === "coin" ? mid * 0.46 + high * 0.48 :
      material === "sand" ? mid * 0.25 + high * 0.66 :
      material === "soda" ? low * 0.28 + mid * 0.27 + high * 0.45 :
      material === "hybrid" ? low * 0.59 + mid * 0.40 + high * 0.08 :
      low * 0.61 + mid * 0.43 + high * 0.025;
    samples[i] = value * rough;
  }
  return finish(samples, rate, 0.58, 0.010, 0.010, 0.14);
}
