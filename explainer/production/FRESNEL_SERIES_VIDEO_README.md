# Fresnel series English film

This is a separate production from the earlier Inertia mechanism film.
The film uses the WHC2025 three-contact-plane CAD model to explain shape,
stiffness, center-of-gravity position, and inertia through fingertip contact
plane orientation. Earlier videos and their production sources are preserved.

The storyboard was reviewed against the primary-source evidence ledger.
Narration generation refuses an unreviewed draft. The transcript includes full
citations and the distinction between accessed manuscripts and final papers.

The production uses actual articulated CAD beside synchronized explanatory
fingertip and virtual-object graphics. Whole-device motion, where shown, is
labelled as hand input; movement of each contact surface is a separate output.
Animation commands, displayed forces and virtual objects are illustrative.
They are not hardware measurements or new perceptual experiment results.

## Deliverables

The approved English narration is **217.033 seconds** (3 minutes 37 seconds).

- `fresnel-series-explainer-en.mp4`: 1080p/30 fps film with English voice and
  burned-in subtitles.
- `fresnel-series-captions-en.vtt`: optional English subtitle track.
- `fresnel-series-transcript-en.txt`: narration, full citations and limits.
- `fresnel-series-poster.png`: matching English poster.
- `verification.json` and `browser-verification.json`: encoded-media evidence.
- `contact-sheet.jpg`: eight chapter frames from the final MP4.
- `fresnel-series-production-source.zip`: reproducible production inputs.

Distribution copies use these unique names under `explainer/public/media/`.
The production README, transcript, verification and ZIP are under
`explainer/production/`, alongside the preserved preceding films.

## Reproduce

Preserve `explainer/` and `output/fresnel-series-film/` paths when extracting
the production ZIP. Install Node dependencies with `npm.cmd ci` in `explainer/`.
Use Python 3.12, FFmpeg/ffprobe, system Google Chrome, and the pinned Python
dependencies below. Windows Bahnschrift and Segoe UI provide the original
font metrics. Cached Aria English narration avoids a network request when
the script and voice settings have not changed.

```powershell
python -m pip install -r output/fresnel-series-film/requirements.txt
python output/fresnel-series-film/produce.py --audio
node output/fresnel-series-film/render-film.mjs --preview
node output/fresnel-series-film/render-film.mjs
python output/fresnel-series-film/produce.py --verify
node output/fresnel-series-film/verify-browser.mjs
python output/fresnel-series-film/produce.py --publish
```

English narration is AI-generated using Microsoft Edge TTS `en-US-AriaNeural`.
Large English captions are burned into the MP4; a separate WebVTT track and
plain-text transcript are supplied. The film has no synthetic mechanism audio.

Chrome's full-range JFIF frames undergo explicit BT.601-to-BT.709 matrix and
full-to-limited range conversion before H.264 encoding. The output is 1920 ×
1080 at 30 fps, H.264/yuv420p and AAC, with MP4 fast-start metadata. Verification
records the metadata actually present; optional retained ICC metadata does
not block delivery when the encoded images match and playback succeeds.

The source ZIP contains the deterministic film stage, shared viewer/rig
modules, exact CAD and kinematics assets, script, timing, narration cache and
production tools. It does not contain a second simulation of the hardware.
The series landing-page sources and chapter generator are also included;
the whole existing multi-page website still belongs to the main repository.

The deterministic illustration uses a small angle range for readability, not
the paper's hardware limits. CoG scenes add a held orientation-dependent cue to
a baseline shape pattern. Inertia scenes use two complete sin-cubed travel
cycles in each direction and the corresponding normalized second derivative,
so travel, acceleration, arrows, trace and pad motion share one state. Position,
velocity and acceleration settle at the horizontal-to-vertical transition. The stiffness
comparison uses the same normalized grip input for two illustrative contour
responses, keeping the thumb plane fixed.

## Verification

- Complete video/audio decode passed: 6,511 frames, 217.033333 seconds.
- H.264/yuv420p, limited-range BT.709, 1920 × 1080, 30 fps, AAC 48 kHz and
  faststart confirmed. The MP4 is 23,718,388 bytes.
- Audio mean level is −19.6 dB; sample peak is −1.4 dB.
- All 35 subtitle cues fit within the video and their rendered subtitle band;
  shortest cue is 3.65 seconds, with at most two large lines.
- Eight encoded chapters, the same-force stiffness pair, and the settled
  horizontal-to-vertical transition were visually inspected. Independent
  scientific/visual review found no remaining material issue.
- Chrome playback, all eight chapter seeks and all 35 WebVTT cues passed,
  with no page errors or dropped frames in the playback sample.
- Production packaging checks ZIP integrity and required reproduction inputs.

The renderer disables Vite hot reload so unrelated site edits cannot restart
a future capture. The live scene itself remains deterministic and manually
advanced; full video capture does not depend on wall-clock animation.

Primary references and specific claim boundaries are in `storyboard.json`, the
transcript, and `docs/reference/34_FRESNEL_SERIES_EXPLAINER.md`. The film source
endcard identifies the six publications. Shape/coherence results, the softness
trend, and the proposed dynamic cues are kept distinct.
