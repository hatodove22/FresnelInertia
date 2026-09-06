# Fresnel series: historical evidence and film claims

Research checked 2026-09-06. This note supports the historical Fresnel film;
it does not change the current container demo's requirements. The corresponding
structured claim ledger is
[fresnel-series-evidence.json](../../explainer/production/fresnel-series-evidence.json).

## The central distinction

The historical Fresnel systems address **thumb, index finger and middle finger**.
They combine local contact-plane orientation with visible global object shape
and, in later work, deformation and motion. The current repository instead
implements two tilting planes plus four vibration channels, with on-device
content dynamics. These are related research directions, not interchangeable
hardware or evaluation results. Current implementation facts remain in
[00](../00_DESIGN_SPECIFICATION.md) and [16](../16_PROGRESS_STATUS.md).

The useful story is **grasp → shape, squeeze → stiffness, tilt → center-of-gravity
shift, shake → inertia**. This sequence is explicitly listed in the official
[WHC 2025 demonstration description](https://di0zxmb8pwajl.cloudfront.net/khc/conference/whc/abs2/D1-04.pdf),
Section I. It is a sequence of proposed/displayed properties and exploratory
actions; it is not a four-property psychophysical validation.

## Primary publication record

The six-author list used below is Hiroki Ota, Yutaro Hirao, Monica
Perusquía-Hernández, Hideaki Uchiyama, Kiyoshi Kiyokawa, and Maud Marchal, in that
order. The two Japanese VRSJ reports list the first five authors only. Actual
paper front pages take precedence over inconsistent portfolio/CV metadata.

| ID | Formal publication and date | Primary evidence inspected |
| --- | --- | --- |
| F24 | **フレネルシェイプ：各指先接平面の傾きを操作する形状提示装置**. Five authors above. 第29回日本バーチャルリアリティ学会大会, September 2024, 3G-19; also listed as oral presentation 3C2-03. | [Official four-page report](https://conference.vrsj.org/ac2024/program/doc/3G-19.pdf), all sections, Table 1 and figures. It explicitly identifies itself as a technical report without peer review. |
| V25 | **Enhancing Visuo-Haptic Coherency by Manipulating Fingertip Contact Tilt**. Six authors above. IEEE VRW 2025, March 2025, pp. 1308–1309. DOI **10.1109/VRW66409.2025.00300**. | [Author laboratory announcement](https://carelab.info/en/2025/03/12/we-presented-8-research-projects-at-ieee-vr-2025/) confirms title, authors, poster and DOI; [author institute report](https://radar.inria.fr/report/2025/rainbow/index.html), §8.2.1 and reference 54. [Publisher](https://ieeexplore.ieee.org/document/10972462) required a browser challenge; final two-page text was not independently read. |
| D25 | **FresnelDeformable: A Softness Presentation Technique Combining Fingertip Plane Tilt Manipulation and Pseudo-Stiffness**. Six authors above. CHI Extended Abstracts 2025, April 2025. DOI **10.1145/3706599.3719778**. | [Publisher DOI](https://doi.org/10.1145/3706599.3719778), [coauthor bibliography](https://www.monicaperusquia.com/publications.html), [author institute report](https://radar.inria.fr/report/2025/rainbow/index.html), §8.2.1/reference 55. The locally held nine-page author manuscript was read, including §3.7–6 and Figure 4; access to the final ACM/HAL PDF was blocked. Method/statistical details below are explicitly manuscript evidence. |
| W25 | **Bottle of Water: Demonstrating Stiffness, Mass, and Inertia by Controlling Fingertip Contact Plane Tilt**. Six authors above. IEEE World Haptics Conference demonstration D1-04, July 2025. | [Official one-page description](https://di0zxmb8pwajl.cloudfront.net/khc/conference/whc/abs2/D1-04.pdf), linked from the [conference program](https://www.manuscriptlink.com/society/khc/conference/whc/programBook). Full text and Figure 1 read. No DOI was established for this demo; do not substitute the DOI of another WHC paper. |
| T25 | **各指先接平面の動的な傾き操作による剛性・慣性提示**. Five authors above. 第30回日本バーチャルリアリティ学会大会, September 2025, oral 1D2-04 / exhibition 1G-29. | [Official two-page report](https://www.conference.vrsj.org/ac2025/program/doc/1D2-04.pdf), [program](https://conference.vrsj.org/ac2025/program/1D2.html). Full text and both figures read. It is explicitly a technical report without peer review. |
| F26 | **FresnelShape: A Contact-Plane Tilt Haptic Display for Enhancing Visuo-Haptic Coherence**. Six authors above. IEEE Access, published 23 March 2026. DOI **10.1109/ACCESS.2026.3676739**. | [Publisher's featured article and abstract](https://ieeeaccess.ieee.org/featured-article/fresnelshape-a-contact-plane-tilt-haptic-display-for-enhancing-visuo-haptic-coherence/), which links the [IEEE article](https://ieeexplore.ieee.org/document/11454535). Final full text required a browser challenge; only results explicitly given by the publisher are used. |

FresnelShape therefore has an origin in 2024 and a later journal publication in
2026. FresnelDeformable and the water-bottle demonstration appeared in 2025.
These are overlapping research branches; a title's publication year should not
be used to imply a single sequential hardware generation.

## What the contact planes represent

For shape, the local tangent at each intended contact point supplies the plane
orientation. A sphere, a flat side and an indented waist have different local
orientations even if the device does not change its overall width. Vision
supplies the global outline and apparent fingertip placement. F26 explicitly
describes mapping local object surface orientation to three fin angles without
mechanically imposing fingertip positions.

As concrete historical settings, F24 Table 1 reports the ordered
`[thumb, index, middle]` angles: circle `[0, 30, -30]`, rectangle `[0, 0, 0]`,
triangle `[30, -30, -30]`, in degrees. These are that prototype's coordinate
convention. They are not commands for a different CAD rig. Its scope excludes
object size and fine surface detail smaller than a fingertip.

The broader perceptual motivation comes from Wijntjes, Sato, Hayward and Kappers,
**Local Surface Orientation Dominates Haptic Curvature Discrimination** (2009),
IEEE Transactions on Haptics 2(2), 94–102, DOI
[10.1109/TOH.2009.1](https://doi.org/10.1109/TOH.2009.1). The
[author institution's abstract](https://research.tue.nl/en/publications/local-surface-orientation-dominates-haptic-curvature-discriminati/)
describes an apparatus that separated contact position from orientation during
lateral exploration. Its curvature result motivates the approach; it does not
establish arbitrary three-dimensional shape rendering with this device.

## Input, angle and perceptual interpretation

| Property | User action and input | Contact-plane meaning | Supported result and boundary |
| --- | --- | --- | --- |
| Shape | Grasp a visually rendered object at intended contact points. | Match local surface orientation at thumb/index/middle. | F24 demonstrates distinguishable labeled tilt patterns; F26 evaluates perceived agreement with visible 3D shapes. The mechanism does not reproduce the complete surface or finger spacing. |
| Stiffness / softness | Squeeze; pressure-derived grip input changes visible deformation. | D25 makes index/middle planes track the changing local normal of a deformed contour; the study leaves the thumb plane fixed. | The proposed cue supplements visual pseudo-stiffness. It does not mechanically change the bulk stiffness of the held body. |
| Center-of-gravity shift | Tilt a water-filled bottle; orientation and virtual mass offset change a gravity-related torque term. | Add a coordinated tilt increment to the baseline shape cue. | W25 demonstrates this interaction. T25 describes its sensing/rendering system and figure model, without a separate quantitative perceptual evaluation. |
| Inertia | Shake / accelerate / decelerate the virtual bottle. | Add acceleration-dependent horizontal torque-like and vertical force-like increments. | W25/T25 propose augmented inertial cues. They do not establish a measured equivalent mass or unrestricted whole-hand force reproduction. |

### Equations visible inside the 2025 figures

The formulas are embedded in Figure 1 of **both W25 and T25**; plain PDF text
extraction omits them. The printed additions to `Tilt` are:

```text
center-of-gravity / weight shift:  k_t  l m g sin(theta) / F_t
horizontal inertia:               k_ix l m a_x         / F_t
vertical inertia:                 k_iy   m a_y         / F_t
```

The drawing identifies mass/gravity `mg`, offset `l`, inclination `theta`, and
horizontal/vertical axes `x/y`. Reading `F_t` as fingertip/grip force and the
`k` terms as gains is the model interpretation consistent with the accompanying
force-sensing description. The papers do not provide numerical gains, units
for every gain, a per-servo sign convention, or the zero-force handling needed
for executable control. These formulas are evidence of the design model,
not a complete controller specification.

In the enlarged drawing, the green arrows show the three contact planes
rotating in the same **diagram-plane direction** for weight shift/horizontal
inertia; the thumb opposes index/middle for vertical inertia. This is a visual
interpretation of a 2D explanatory figure, not a mapping to positive CAD joint
angles. Preserve both the initial shape angle and the dynamic increment. Do
not use the current two-servo common/differential labels as historical terms.

For D25's particular study, indentation `y` is proportional to applied force:
10 N corresponds to 1 cm on a 6.5 cm baseline, and the fitted angular change is
`d = 23.5 y`, with `R² = .993`. Figure 4 shows the contour normal used for the
index/middle surfaces. This fixed study mapping is not a general stiffness
calibration. The manuscript's no-visual-deformation condition keeps the object
visually unchanged despite the common force-to-indentation parameter; avoid
claiming all three visual conditions visibly deform.

## Evidence strength and claims to keep out of the film

- **F24:** 13-person pilot; circle/rectangle/triangle label accuracies were
  73.7%, 85.9%, and 69.87%. The intended Stroop/plausibility result was not
  supported. Do not present the 2024 result as universal realistic shape display.
- **D25 author manuscript:** 10 participants; the main effect of tilt on
  coherence was significant (`p = .032`). The softness effect was a trend
  (`p = .080`), realism was not significant (`p = .197`), and no visual × tactile
  interaction was found. The authors do not establish that coherence improvement
  directly produces softness improvement. The institutional summary uses
  broader softness wording; the film uses the narrower manuscript result.
- **W25/T25:** a demonstrated VR interaction and a proposed model, with more
  detailed evaluation left for future work. Do not attach success rates,
  discrimination thresholds, measured equivalent mass, or a validated sloshing
  model to them.
- **F26:** the publisher reports coherence means of 71.5 versus 40.9 for a
  controller and 37.9 for hand tracking on a 0–100 scale, over eight shapes.
  The tactile-circle Stroop contrast was 66.6 ms (`p_Holm = .012`); triangle did
  not survive correction (`p_Holm = .081`). These are shape-study results,
  not validation of stiffness, CoG or inertia.
- **All scenes:** a synthetic CAD animation explains the proposal. It is not
  recorded device telemetry, a tactile demonstration for the viewer, or a
  reproduction of a participant's sensation. No four-vibrator effects belong
  in the historical three-plane explanation.

## Hardware versions and the CAD illustration

W25 describes a thumb pressure sensor and wrist-mounted battery/controller.
T25 later documents three XC330-M288-T servos, 1:1 gears, ±45° contact-plane
travel and integrated electronics. Its Figure 2 and text place FSR400 sensors
below the fins and describe a structure designed through static stress analysis
to transfer fingertip force to those sensors. This does not say each sensor
rotates rigidly with its fin. A static sensor mesh is consistent with that
evidence; actual attachment remains a CAD-rig question.

The selected `WHC2025Demo` CAD can illustrate the three-plane principle, with
its own export provenance and verified axes. A CAD filename alone does not
prove an exact match to the July demo apparatus. Label synthetic commands as
illustrative, use the verified rig axes, and keep a chosen visual angle limit
separate from the paper's hardware range.

## Scene recipes for an intuitive English film

These scenes are explanatory design proposals. Their timings, motion waveforms,
material colors and illustrative objects are not reported experimental stimuli
unless explicitly identified above.

| Scene | Concrete visual action | Plane/normal explanation | Short English wording |
| --- | --- | --- | --- |
| One principle | Fade a solid surface to three local tangent patches with normals, then to the actual three-plane CAD. Keep the fingers' global spacing visibly distinct from the local orientation. | Local orientation is sampled at contacts; a full physical shape is not built. | “Three contact planes give the fingertips local surface cues. Vision completes the larger shape.” |
| Grasp / shape | Compare a ball, a box and a bottle's curved shoulder or indented waist. Move the intended grasp height so the sampled slope visibly changes. | Show the tangent and the matching fin together. A waist illustrates broad concavity, not microscopic texture. | “As the contact point changes, the fingertip plane follows the local slope.” |
| Squeeze / stiffness | Squeeze a bottle's flexible middle, then its comparatively rigid shoulder. Use the same grip-input bar; show stronger indentation in the illustrative softer region. | Make changing contour normals and fin angles visible. For the D25 study explanation, leave thumb tilt fixed and change index/middle. | “Grip input drives visible deformation. The planes turn with that deformation, aligning what you see and feel.” |
| Tilt / CoG | Tip a half-filled bottle slowly and hold it. Show a virtual CoG marker and a gravity arrow; extend the offset from the grip to show the larger torque term. | A sustained angle increment remains while the bottle is held tilted. No moving physical weight should appear inside the CAD. | “Tilting changes the gravity-related torque cue, suggesting a shift in the contents' center of gravity.” |
| Shake / inertia | Translate the bottle left, brake, and reverse; optionally repeat vertically. Show acceleration separately from travel direction. | The added cue changes with acceleration, not constant speed. A simple water-lag animation is illustrative rather than a reconstructed fluid solver. | “When motion accelerates or slows, coordinated plane tilt suggests the contents' inertia.” |
| Research boundary | Return to the CAD and the four actions, alongside brief paper dates. | Separate evaluated shape/coherence from proposed dynamic effects. | “The series explores shape, softness, weight shift and inertia through one compact contact-plane principle.” |

Prefer one visible cause and one response per shot. Preserve a readable pause
after each change so acceleration, sustained tilt and force-dependent deformation
remain distinguishable. An English end card can say **“Research concepts shown
with illustrative CAD motion. Perceptual findings differ by study.”**

## Audit and reproducibility notes

- Japanese PDFs were read using PyMuPDF text extraction and rendered pages;
  MiKTeX text extraction omitted Japanese glyphs. Figures with embedded equations
  were separately enlarged and inspected. Temporary images/text remain under
  ignored `tmp/pdfs/fresnel-series/`, not public assets.
- The D25 manuscript inspected was locally held
  `NAIST_個人/2025_2nd/CHI/CHI_2025_Ota_LBW_DL_Jan_23_.pdf`.
  It identifies the published title/DOI but is a nine-page manuscript layout;
  final publisher text was not verified. Local filenames containing IEEE VR
  also included an older anonymous full-paper draft with a different title;
  that draft was excluded from the public publication/result record.
- W25/T25 local paper copies were cross-checked against official conference PDFs.
  `WHC_poster.pdf` and `VRSJ/TiltManipulation.pdf` helped read the identical
  figure content; they are not independent evaluation evidence.
- Source metadata was checked against actual front pages or first-party records.
  Portfolio filler text, search-engine summaries and secondary bibliographies
  were not used to substantiate scientific claims. No hardware was connected,
  commanded or evaluated by this research task.

## Production implementation status

The historical film uses the original `WHC2025demo v30` CAD export through
[seriesDevice.ts](../../explainer/src/seriesDevice.ts) and the shared
[DeviceRig](../../explainer/src/deviceRig.ts). This three-channel profile
addresses `A/B/C` contact angles and has zero vibration channels. Its verified
axes, contact anchors, geometry counts and unresolved sensor attachments are
recorded once in [WHC2025_CAD.md](../../explainer/production/WHC2025_CAD.md).
The existing renderer retains its default two-contact/four-transducer profile;
the new film does not reinterpret that profile as the historical apparatus.

The series viewer accepts deterministic frames for angles, camera, whole-body
motion and illustrative fingertips. The shared rig owns pivot/gear transforms,
contact-normal projection and disposal. The separate
[Japanese film landing page](../../explainer/src/series.ts) provides the English
video, subtitles, transcript, chapter links and a dated primary-source lineage.
Its prose distinguishes the deformation manuscript's coherence result from its
nonsignificant softness result and identifies dynamic effects as proposals.

On 2026-09-06, `npm test` in `explainer/` passed **19/19 tests**, including four
new WHC profile regressions and all 15 existing tests. TypeScript checking also
passed after the prose audit. These checks establish software/geometry behavior.

The final film is **217.033333 seconds**, 1920×1080 at 30 fps, H.264/AAC,
with 6,511 frames and 35 English subtitle cues. Full decoding, audio levels,
fast-start metadata and every caption's timing/layout passed. All eight encoded
chapter frames were inspected. The same-force firm/soft comparison preserves
the fixed thumb; the horizontal/vertical switch uses a continuous `sin³` travel
curve and its proportional second derivative for the acceleration cue.

The production site build and integrated Chrome checks passed at
1440/768/390/320 widths, with no horizontal overflow, missing assets or page
errors. All four property buttons seek and advance decoded video, and all 35
WebVTT cues load. Desktop/mobile screenshots, transcript, current-device CAD
loading and the atlas route were checked. Reproduction and detailed verification
are kept in `explainer/production/` and `output/fresnel-series-film/`.
