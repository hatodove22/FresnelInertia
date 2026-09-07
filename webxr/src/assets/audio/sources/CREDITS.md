# Recorded water and soda sources

Additional water sound: **Joseph SARDIN — BigSoundBank.com**.

- Recording: [Swirl in the water](https://bigsoundbank.com/swirl-in-the-water-s0192.html), sound 0192: actual hand-moved water, recorded with a Rode NT5.
- License: [CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/), confirmed on the [original recording page](https://bigsoundbank.com/swirl-in-the-water-s0192.html) and [publisher's license page](https://bigsoundbank.com/licenses.html) on 2026-09-07. Editing, redistribution and commercial use are permitted; attribution is voluntary and retained here.
- Local `water-swirl-0192.wav` is the complete recording with 70 Hz high-pass / 8.5 kHz low-pass cleanup and resampling from 44.1 kHz to mono 24 kHz PCM16. No pitch shift or synthesized water layer is added.
- `water-recording.json` records the original URL, original/local hashes, processing and excerpt times. `scripts/recorded-water.mjs` applies fades, bounded gain and a loop seam to those excerpts; `audio:generate` packages them into the existing Foley atlas.

Water, the wet portion of hybrid and soda's liquid movement use this recording. Their use does not establish measured device sound or audiovisual/tactile agreement.

## Recorded soda opening and fizz

Additional sounds: **Joseph SARDIN — BigSoundBank.com**.

- [Champagne cork #2](https://bigsoundbank.com/champagne-cork-2-s0648.html), 0648: actual cork release. Used as one opening accent, not repeated as a fizz loop. The four variants trim the same recording; they are not separate takes.
- [Sparkling water](https://bigsoundbank.com/sparkling-water-s0230.html), 0230: actual carbonated water in a glass, used for the short-lived fizz bed during the existing burst state.
- Both original pages and the [publisher's license page](https://bigsoundbank.com/licenses.html) were rechecked on 2026-09-08: **CC0 1.0 Universal**, allowing modification and redistribution, including commercial use. Attribution is voluntary and retained here.
- `soda-recordings.json` records URLs, source/local SHA256, cleanup, 24 kHz mono conversion and excerpt times. `scripts/recorded-soda.mjs` applies edge fades, bounded gain and a 200 ms fizz seam without pitch shifting or generated fizz noise.

The original cork and glass carbonation are Foley materials for the illustrative bottle demo, not a recording of this device or a calibrated pressure sound. Solid materials remain locally authored synthesis. Approved water/hybrid excerpts and solid PCM are unchanged by this soda addition.
