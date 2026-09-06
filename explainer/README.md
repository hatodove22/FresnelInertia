# Fresnel Inertia — visual explanation

日本語の解説サイト。Fusion由来の実機CADを主役に、接触面の傾きと
4点の振動を操作できる2つの機構ビュー、4層の説明、英語の解説動画を収録。

「同じ向き」「逆の向き」「短い振動」を切り替え、±10°の接触面角度を
試せます。角度を直接変えると両ビューが停止し、再生すると自動の説明へ
戻ります。角度とモードは同期し、「内部を見る」とカメラは各ビューで
独立します。ドラッグ・左右キーで視点変更、Homeで視点を戻します。
動きを減らす設定では静止状態から開始し、直接操作は引き続き使えます。

`/atlas.html`には先行研究14件を足場にした将来デモ12案と、吸着・注出・
生命感の3つの操作できる概念スケッチがあります。必要な追加で絞り込み、
実装方針・最初の比較・原典を読み、設計メモをJSONで保存できます。

`/series.html`は過去のフレネルシリーズの動画ページです。WHC2025demo v30の
3面CADを使い、形状・硬さ・重心位置・慣性を英語音声と英語字幕で説明します。
各章から再生でき、字幕と原稿をダウンロードできます。現在の2面・4振動子の
モデルとは独立したCAD資産です。

## Preview and build

```powershell
cd explainer
npm ci
npm run dev
```

Open `http://127.0.0.1:4175/`. Use `npm run build` to typecheck and generate
`dist/`; the site is static and can be served from that directory. No API keys
or device connection are required. Optional web fonts load from Google Fonts,
with system font fallbacks. Existing firmware and `webxr/` remain independent.

`node scripts/verify.mjs` exercises the two CAD views, synchronized controls,
keyboard camera/angle input, pause, cutaway, English media and responsive
layouts using installed Chrome. It captures desktop/mobile views, uses an
existing preview at port 4175 or the URL in `EXPLAINER_URL`, and saves under
`../output/explainer-qa/`.

The current CAD/English revision passed all 15 model/CAD tests, the TypeScript
build, and this browser flow on both development and built production previews.
The browser checks cover 1440/768/390/320 layouts and report no page errors,
missing assets or horizontal overflow.

`npm test` checks the deterministic sketch model and research catalog integrity.
`node scripts/verify-atlas.mjs` exercises actual WebGL, interactions, links,
download, reduced motion and 1440/768/390/320 layouts against that same preview.
It uses Playwright Chromium (`npx playwright install chromium`), or installed
Chrome with `$env:PLAYWRIGHT_CHANNEL='chrome'`. It saves screenshots and results
under `../output/playwright/atlas/`. CI builds all three HTML entries and runs this
browser flow. Build commands do not start a preview automatically.

`node scripts/verify-series.mjs` checks the historical film's playback, four
chapter seeks, English subtitles, transcript, responsive layouts and links
back to the existing pages. It uses installed Chrome and `EXPLAINER_URL`.
The result and screenshots are saved under `../output/fresnel-series-film/`.
The CAD/model suite now has 19 tests, including four actual three-channel
WHC rig regressions; the original two-channel tests are retained.

## Extending the concept atlas

- `src/atlas/atlas-data.json`: the shared recipe/citation dataset for screen and
  export. Every concept needs state, both outputs, additions, limitations,
  a falsifiable comparison, and source IDs. Feasibility means required additions.
- `scenarioModel.ts`: standalone deterministic design sketches, fixed time
  stepping and state-derived cue projection. No WebGL, transport or real units.
- `ScenarioView.ts`: render-only consumer, owned GPU resources and disposal.
- `main.ts`: user input, animation lifetime, catalog navigation and export.

The material/force sketches do not replace `webxr/`'s device-driven renderer or
the firmware core. Their angles and actuator layout are illustrative. New real
content states must be owned and reported by AtomS3. See
[the interaction design space](../docs/reference/32_INTERACTION_DESIGN_SPACE.md).

## Media

- Primary film: `public/media/fresnel-inertia-explainer-en.mp4`, 107.533 seconds,
  1920 × 1080 / 30 fps, H.264/AAC.
- English companion assets: `poster-en.png`, `captions-en.vtt`, `transcript-en.txt`.
- The original Japanese film and its companion files are retained separately.
- `public/models/device-cad.glb`: read-only Fusion mechanical tessellation.
- `public/models/device-kinematics.json`: CAD-derived axes, moving groups and
  transmission evidence used by the reusable viewer.
- `production/`: transcript, CAD provenance, video verification, reproduction
  source archive and instructions.

The primary video uses English narration and English captions. Synthesized
voice is disclosed, and the optional browser subtitle track defaults off.
Actual CAD geometry is animated with illustrative commands; the film is not
footage or telemetry from a physical run. The runtime metadata supplies the
displayed duration instead of a hard-coded value.

English-film source, rendering instructions and media validation are in
[VIDEO_EN_README.md](production/VIDEO_EN_README.md) and
[video-en-verification.json](production/video-en-verification.json).

`src/device.ts` owns each WebGL viewer, camera and rendering lifetime;
`deviceRig.ts` applies CAD transforms and material emphasis; `mechanismMotion.ts`
supplies bounded explanatory poses. `src/main.ts` composes two instances and
their shared controls. The same viewer supports deterministic film frames.

For the historical series, `seriesDevice.ts` uses the same `DeviceRig` with
an explicit A/B/C channel profile and zero vibration meshes. The previous
two-channel/four-transducer defaults are unchanged. `SeriesFrame` separates
the illustrative whole-device hand motion from relative contact-pad angles,
and the fingertip overlays follow verified CAD contact anchors. See
[WHC2025_CAD.md](production/WHC2025_CAD.md) for axes and attachment evidence,
and [reference 34](../docs/reference/34_FRESNEL_SERIES_EXPLAINER.md) for claims.

The separate historical movie uses the `fresnel-series-` asset prefix. Its
English captions are burned into the picture; the optional subtitle track
defaults off to avoid duplicate text. The production source archive preserves
the narrated timeline and shared renderer. After changing narration timing,
run `node scripts/build-series-chapters.mjs` from `explainer/`, or pass the
path to the approved `timeline.json`, to update the website's chapter links.

For the original Japanese film's regeneration, extract `production/video-production-source.zip` into
`../output/explainer-video/`, recreate `../output/explainer-assets/` with
`device-cad.glb` copied from `public/models/`, and follow
`production/VIDEO_README.md`. That workflow uses the repository's dependency
layout and Windows fonts. The distributed MP4 needs no production tools.

## Scientific and publication boundary

This browser model is for explanation, not firmware emulation or hardware
control. It does not request USB/Serial access. The current firmware models
content dynamics in body x/y; 3D imagery is for comprehension. Current
capabilities and planned Android work are separated in the page.

CAD includes an older controller envelope; the current custom PCB is not
represented by that shape. Orange contact planes rotate within ±10°; teal
transducers pulse in color without artificial large displacement. Displayed
angles and glow are explanatory commands, not measured outputs. The
source design and unresolved hardware licenses are not republished by this
private explanatory site. Full provenance and checks are documented in
`../docs/reference/29_EXPLAINER_SITE_AND_FILM.md`.

The Sites manifest registers a private owner-only site. Publishing uses an
isolated copy of this site's source rather than the firmware repository.
