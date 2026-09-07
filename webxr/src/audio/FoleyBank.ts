import manifest from '../assets/audio/foley-bank.json';

export type FoleyBank = ReadonlyMap<string, AudioBuffer>;
export type FoleyBankLoader = (context: AudioContext) => Promise<FoleyBank>;

/** Decode once after explicit sound enable; all later contacts are cache reads.
 * Times, not raw source-frame indices, preserve clips if WebAudio resamples. */
export async function decodeFoleyBank(context: AudioContext, bytes: ArrayBuffer): Promise<FoleyBank> {
  const decoded = await context.decodeAudioData(bytes);
  if (decoded.numberOfChannels !== 1 ||
      decoded.duration + 1 / decoded.sampleRate < manifest.totalFrames / manifest.sampleRate) {
    throw new Error('音素材の長さまたは形式が不正です。');
  }
  const bank = new Map<string, AudioBuffer>();
  for (const [key, clip] of Object.entries(manifest.clips)) {
    const start = Math.round(clip.start / manifest.sampleRate * decoded.sampleRate);
    const frames = Math.round(clip.frames / manifest.sampleRate * decoded.sampleRate);
    if (start < 0 || frames <= 0 || start + frames > decoded.length) throw new Error(`音素材の範囲が不正です: ${key}`);
    const buffer = context.createBuffer(1, frames, decoded.sampleRate);
    buffer.copyToChannel(decoded.getChannelData(0).subarray(start, start + frames), 0);
    bank.set(key, buffer);
  }
  return bank;
}

/** Vite fingerprints this bundled asset; no third-party service or media library. */
export const loadFoleyBank: FoleyBankLoader = async context => {
  const response = await fetch(new URL('../assets/audio/foley-bank.wav', import.meta.url));
  if (!response.ok) throw new Error(`音素材を読み込めませんでした (${response.status})。`);
  return decodeFoleyBank(context, await response.arrayBuffer());
};
