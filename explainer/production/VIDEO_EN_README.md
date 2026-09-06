# Fresnel Inertia — Inside the Mechanism

English CAD mechanism film, approximately 108 seconds. Delivery is 1920 × 1080,
30 fps, H.264/yuv420p video and AAC audio in an MP4 with fast-start metadata.
Large English subtitles are burned into the film; optional WebVTT captions and
a plain-text transcript are also supplied.

Full-range JFIF browser frames are converted to limited-range BT.709 samples
before H.264 encoding, with matching color metadata for browser delivery.

The actual exported CAD is the main visual in every chapter. The two contact
surfaces and their transmission gears articulate around the axes described in
the shared CAD kinematics metadata. The website and film use the same
`explainer/src/device.ts`, `deviceRig.ts`, and `mechanismMotion.ts` renderer.
The film provides explicit deterministic poses and uses no live hardware data.

## Deliverables

- `fresnel-inertia-explainer-en.mp4`: narrated, subtitled final film.
- `poster-en.png`: matching English poster.
- `captions-en.vtt`: optional English captions. Burned-in subtitles remain visible
  when the player caption track is disabled.
- `transcript-en.txt` / `transcript-en.md`: narration and factual boundaries.
- `storyboard.json` / `timeline.json`: exact script, chapters and caption times.
- `narration-en.wav`: cached narration aligned to the video timeline.
- `verification.json`: complete decode, codec, timing and audio-level results.
- `browser-verification.json`: playback and seeking in Chrome.
- `contact-sheet.jpg`: eight chapter frames extracted from the final MP4.
- `cad-motion-film-source.zip`: production scripts, narration cache, stage,
  shared renderer/rig modules and CAD assets needed to reproduce this film.

Published copies live under `explainer/public/media/`; the production source
archive, English README/transcript and verification live under
`explainer/production/`. The preceding Japanese film is preserved separately.

## What is shown

1. The complete CAD mechanism and its moving contact surfaces.
2. Each contact surface moving around its own pivot.
3. Equal contact-surface commands, showing common motion.
4. Opposite commands, showing differential motion.
5. A close view through the structure to the transmission gears.
6. The four vibration locations, highlighted one at a time.
7. A small illustrative content overlay and its slow/fast output cues, with
   the real CAD remaining the main visual.
8. Material possibilities and the currently planned tuning/Android AR work.

All movement commands are illustrative. The film is not a recording or
measurement of the physical device and does not establish physical travel,
force, perceptual performance or a validated mapping between CAD node order
and firmware channels. Glowing vibration markers encode drive strength; they
do not depict exaggerated mechanical displacement. The shared-state chapter
pulses the four markers together to explain timing without inventing that
channel mapping. The current content model uses a body x/y cross-section.

The CAD is derived from Fusion `VRSJ2026 v30`. It includes an older controller
outline and simplified actuator envelopes; it is not a full current AtomS3
and custom-PCB electronics assembly. CAD surfaces and explanatory recoloring
are preserved as geometry in the shared renderer. The authoritative evidence
and actual joint coordinates are in the included `device-kinematics.json`.

English narration is AI-generated using Microsoft Edge TTS
`en-US-AriaNeural`, rate `+4%`, pitch `-1Hz`. It is not an impersonation.
No synthetic motor sound or apparent haptic waveform is presented as measured
audio. The voice track has no background music.

## Reproduction

Extract the source archive at a working-directory root, preserving its
`explainer/` and `output/cad-motion-film/` paths. Use Node.js, Python 3.12,
FFmpeg/ffprobe, and a local Google Chrome installation. Install the pinned
JavaScript dependencies with `npm.cmd ci` inside `explainer/`. The Python
dependencies are pinned in `requirements.txt`. Fonts use Windows Bahnschrift
and Segoe UI, with Arial as fallback; matching these fonts reproduces the
original title/subtitle metrics.

From the repository or extracted archive root:

```powershell
python -m pip install -r output/cad-motion-film/requirements.txt
python output/cad-motion-film/produce.py --audio
node output/cad-motion-film/render-film.mjs --preview
node output/cad-motion-film/render-film.mjs
python output/cad-motion-film/produce.py --verify
node output/cad-motion-film/verify-browser.mjs
python output/cad-motion-film/produce.py --publish
```

Cached MP3 narration is reused when its script and voice settings match. A
changed line uses the Edge TTS service; no OpenAI API key is required for this
explicitly selected voice provider. The render wrapper opens a local Vite
server on port 4177 (or the next available port) and a hidden, isolated Chrome
instance, then closes them. It fails if actual CAD/kinematics cannot load;
there is no schematic fallback. No physical device is opened or actuated.

The source archive carries production inputs, not a second model engine.
Software dependencies remain reproducible through the package lockfile.
The `docs/` factual references listed in the transcript belong to the source
repository and are not copied into this film archive.

## Verification boundaries

The production check decodes the entire MP4, confirms codecs/resolution/frame
rate, aligned audio/video duration, fast-start placement, finite non-clipping
audio and ordered in-range subtitles. Chapter frames are extracted from the
encoded MP4 for visual inspection. Browser checks play and seek the actual
MP4. These establish media delivery, not a new hardware experiment.

Factual sources: `docs/00_DESIGN_SPECIFICATION.md`,
`docs/04_HARDWARE_AND_PIN_SPEC.md`, `docs/16_PROGRESS_STATUS.md`, and the
CAD export/kinematics metadata included with the film renderer.
