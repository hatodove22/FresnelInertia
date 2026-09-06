# Explanatory website and film

Created 2026-09-06 against the fetched and fast-forwarded `origin/main`
checkpoint `e007885`. This reference owns the explanatory media, not the active
firmware roadmap. Current physical evidence remains in [16](../16_PROGRESS_STATUS.md).

## Initial deliverables

Published owner-only site: [Fresnel Inertia](https://fresnel-inertia-explained.hatodove.chatgpt.site).
First access requires ChatGPT sign-in. Sites reported successful publication;
the in-app handoff displayed its sign-in gate. Functional/visual checks below
used the identical locally built source, not a claim of authenticated hosted QA.

- [Independent Vite/Three.js site](../../explainer/README.md) in `explainer/`.
- [Japanese MP4](../../explainer/public/media/fresnel-inertia-explainer.mp4):
  109.37 seconds, 1920 × 1080, 30 fps, H.264/AAC, approximately 9.42 MB.
- [Transcript](../../explainer/production/transcript-ja.md),
  [optional VTT](../../explainer/public/media/captions-ja.vtt), and
  [video production source archive](../../explainer/production/video-production-source.zip).
- [Mechanical GLB](../../explainer/public/models/device-cad.glb), with
  [metadata](../../explainer/production/device-cad-metadata.json).

The initial site used material selection, a drag/keyboard tilt control, a shake action,
pause/resume, keyboard-selectable layer explanations, a rotatable CAD model,
video playback, and readable transcript/source disclosures. Mobile layouts and
reduced-motion preferences are supported. Browser animations are pedagogical;
there are no USB, Serial, radio, or physical actuator calls. Firmware sources,
headers, parameters, protocols, and defaults are unchanged, so new firmware
feature flags or telemetry fields are unnecessary.

## Content boundaries

The narrative follows [00](../00_DESIGN_SPECIFICATION.md),
[04](../04_HARDWARE_AND_PIN_SPEC.md), [pipeline](03_PIPELINE_SPEC.md), and
[tilt](14_TILT_PSEUDOFORCE_SPEC_REV2.md). Mass → Event → Texture → Resonance
is the four-layer path; Spatial4 distributes the resulting vibration. Two
independent one-axis XL330 contact planes form the parallel low-frequency path.
Both outputs derive from the shared on-device content state.

The firmware uses a body x/y reduced model; a 3D view is not a claim of full 3D
fluid dynamics. Browser physics, waves, and channel pulses are illustrative,
not telemetry, calibrated signals, or perceptual measurements. Persistent
static contact is not illustrated as repeated impact generation. Resonance
copy describes low/high spectral balance rather than attributing all envelope
decay to that layer. The site marks Android AR and the tuning studio as planned.

## CAD and voice provenance

Fusion `VRSJ2026 v30` visible BRep bodies were exported read-only and tessellated
to GLB: 57 bodies, 51,610 triangles, units metres. The centered CAD bounds are
63.000 × 74.033 × 74.030 mm, not a manufacturing tolerance claim. Original CAD
coordinates are not the calibrated firmware body frame. Source geometry was
not edited or saved. Orange contact planes and cyan transducers are explanatory
recoloring, not literal material colors.

The CAD includes an older M5 ATOM Matrix controller envelope. The current
custom EasyEDA PCB is not in this mesh; text follows the implemented
AtomS3/StampC5 system. Hidden CAD objects, including FSR components, were
excluded. The source CAD/project and full board database are not copied into
the website. Derived CAD media were prepared for the requested private
explanation; this does not change the project's unresolved hardware licenses
or authorize a general public hardware release.

The opening film uses this CAD render; later scenes are motion diagrams.
Japanese narration is AI synthesized using Microsoft Edge TTS
`ja-JP-NanamiNeural`. The film and site disclose synthesized voice. Captions
are burned into the MP4; the separate VTT track is optional to avoid duplicate
text. Production sources and regeneration notes are in `explainer/production/`.

## Initial validation

Appropriate scope follows [07](../07_TEST_AND_VALIDATION.md): explanatory
browser and media checks, without new claims about physical demo acceptance.

- Existing `webxr`: production build/typecheck and 73/73 tests pass.
- `explainer`: TypeScript and production build pass; audited dependencies have
  zero reported vulnerabilities. Three.js produces one expected >500 kB
  development build-size advisory; its compressed shared chunk is about 145 kB.
- Chrome/Playwright: three distinct material renders, keyboard tilt, pause
  freezing the canvas, shake/resume, layer keyboard navigation, CAD loading and
  view reset, film playback/seeking, optional captions, transcript/source links,
  and reduced-motion initial pause checked.
- Responsive layout checked at 1440, 768, 390, and 320 CSS pixels. The initial
  320-pixel canvas overflow was corrected.
- Rendered desktop/mobile screenshots, mechanism view, pipeline panel, film
  frames, and all eight film scenes inspected visually. MP4 decoded end to end
  without FFmpeg errors, with synchronized 109.37-second video/audio streams.
- CAD GLB validated and rendered using Three.js/Chrome. Media-only source and
  documentation checks do not require firmware uploads or bench operation.

Local QA files are retained under ignored `output/explainer-qa/`; the film's
portable [verification record](../../explainer/production/video-verification.json)
travels with the source. No new firmware build, upload, tactile evaluation,
Android/Quest validation, or physical state readback was performed for this task.
## Interaction atlas extension, 2026-09-06

The existing explanatory site now also includes `/atlas.html`, linked from
the main navigation and an editorial closing section. It adds 14 primary
sources, 12 future-demo recipes, a capability filter, research/implementation
details and JSON export. Three independent, deterministic concept sketches
illustrate attachment/release, depletion and arousal from shared state.
The original film and CAD assets are unchanged.

This is a design artifact, with no hardware connection or actuator output.
Its displayed cue angles, transducer arrangement and particle motion are
illustrative. See [the interaction-space reference](32_INTERACTION_DESIGN_SPACE.md)
for model boundaries, recipes and the authoritative evidence dataset.
`npm test` and `scripts/verify-atlas.mjs` in `explainer/` reproduce model and
browser checks. Desktop and narrow WebGL screenshots were rendered and
visually inspected; existing CAD/video browser verification was repeated.

The extension was published to the same owner-only site. The canonical
[atlas route](https://fresnel-inertia-explained.hatodove.chatgpt.site/atlas)
returns HTTP 200 with the validated atlas entry script; `/atlas.html` redirects
to it. This authenticated HTTP check is distinct from the full interactive
QA, which used the identical local build. The in-app open request was queued.

## Dynamic CAD and English-film revision, 2026-09-06

The home page now leads with the actual mechanical CAD in motion. A second
view looks into the mechanism; both use the same reusable renderer and bounded
pose model. Common, differential and short-vibration examples share controls,
with direct contact-plane angle input from −10° to +10°. Direct angle input
pauses both views, and play resumes the explanatory sequence. During playback,
the slider follows the current contact-plane A angle and is labeled automatic.
Cutaway and camera controls are independent; selecting short vibration enables
the internal view and a side camera preset so the transducers can be seen.
Dragging or left/right keys rotates the camera, and Home restores its initial
view. Reduced motion starts
paused and retains direct manipulation.

The geometry comes from the actual CAD. Orange contact planes move around
CAD-derived axes; the four teal transducers are emphasized by light pulses,
without invented large physical displacement. The angle readouts and glow
represent explanatory commands, not device telemetry, calibrated vibration
amplitudes or a recording of a hardware run. Contact planes are identified as
A/B, without asserting an unverified CAD-to-thumb or body-frame mapping. The
existing older controller-envelope caveat remains visible.

`explainer/src/main.ts` composes the two viewer instances and their shared
controls; `device.ts` owns camera and rendering lifetime, `deviceRig.ts` applies
CAD transforms/materials, and `mechanismMotion.ts` provides presentation-only
poses. The film can use the same renderer through deterministic frame input.
The established pipeline and future-demo atlas remain available.

The Japanese page now points to the
[English primary film](../../explainer/public/media/fresnel-inertia-explainer-en.mp4),
with `poster-en.png`, [English captions](../../explainer/public/media/captions-en.vtt)
and [transcript](../../explainer/public/media/transcript-en.txt). The movie
duration comes from its loaded metadata. The original Japanese assets are
retained separately; the original production
and validation facts above describe that earlier version. Publication of this
revision is a separate step from local source/browser validation.

`explainer/scripts/verify.mjs` exercises actual CAD rendering, synchronized
mode/angle/play state, paused redraw, independent cutaway, keyboard camera
reset, bounded pulse/angle values, English media playback/seeking and transcript,
the existing layer controls, and responsive/reduced-motion behavior. The full
flow passed against both local Vite development and built production previews
(ports 4175 and 4186) with no page errors or missing assets,
including 1440/768/390/320 layouts with no horizontal overflow. English video
playback, seeking and VTT cue loading passed; the subtitle track starts disabled.
Chrome reported 107.533333 seconds and 1920 × 1080. Desktop, detail, narrow
controls and the integrated English film were visually inspected.

The 15 CAD/sketch tests and TypeScript/production build passed. The separate
[English media verification](../../explainer/production/video-en-verification.json)
records full decode, stream properties and chapter checks. The original
Japanese record above applies only to that earlier film. These are browser
and media checks, with no additional hardware operation or tactile validation.

The articulated-CAD revision is published to the same owner-only site above.
Authenticated hosted checks returned HTTP 200 for the main page and atlas,
with the validated production entry scripts. The kinematics JSON, complete
8,590,906-byte English MP4, captions and transcript matched the locally built
assets. Full interactive QA used the production build in Chrome; hosted QA
was an authenticated HTTP/content check. The existing in-app Site tab update
was queued. Local verification is retained in
`output/cad-motion-film/hosted-verification.json`.
