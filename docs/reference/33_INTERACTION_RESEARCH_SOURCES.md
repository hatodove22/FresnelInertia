# Primary sources for the handheld interaction atlas

Research date: 2026-09-06. These are design inputs, not evidence that the proposed demos work on this prototype. Fourteen original research works are included. Claims below are deliberately narrower than the papers' promotional abstracts. The source IDs connect to [demo opportunities](32_INTERACTION_DESIGN_SPACE.md).

The hardware baseline comes from [00](../00_DESIGN_SPECIFICATION.md), [04](../04_HARDWARE_AND_PIN_SPEC.md), [16](../16_PROGRESS_STATUS.md), and [08](../08_IMPLEMENTATION_PLAN.md): two single-axis fingertip contact planes, four spatial vibration channels, body x/y content dynamics, IMU input, and device-owned state. It has no measured grip force or drift-free tracked position. The assembled demo has prior operator evidence of simultaneous output and visual/felt directional agreement; the concepts here are unimplemented and untested.

## S01 — Exploratory procedures

**Susan J. Lederman and Roberta L. Klatzky (1987). _Hand movements: A window into haptic object recognition._ Cognitive Psychology 19(3), 342–368.**

- Primary record: [publisher/DOI](https://doi.org/10.1016/0010-0285(87)90008-9). [Original paper, academic teaching copy](https://wayne2wang.github.io/teaching/EECS598Action%26Perception2023Fall/papers/1987klatzkyHandMovements.pdf).
- Inspected: original paper pp. 345–347, Table 1/Figure 1; results and discussion pp. 353, 361–365; publisher abstract.
- Supported claim: deliberate exploration depends on the information sought. The paper distinguishes rubbing for texture, pressing for hardness, static contact for temperature, unsupported holding for weight, enclosure for global shape, and contour following for precise shape. It also describes part-motion and function tests, so the original space is broader than the commonly reproduced six-procedure diagram.
- Limit: real object exploration under the paper's tasks is not a validation of a controller that substitutes tilt and vibration. In particular, this device does not currently measure pressing, finger scanning, or enclosure.
- Transfer: design around something a user can discover by holding, rocking, and functionally testing the object. Treat a new gesture-to-property mapping as a hypothesis.

## S02 — Contact-plane orientation

**Domenico Prattichizzo, Francesco Chinello, Claudio Pacchierotti, and Monica Malvezzi (2013). _Towards wearability in fingertip haptics: a 3-DoF wearable device for cutaneous force feedback._ IEEE Transactions on Haptics 6(4), 506–516.**

- [DOI](https://doi.org/10.1109/ToH.2013.53); [author manuscript](https://sirslab.dii.unisi.it/papers/2013/Prattichizzo.ToH.2013.Haptics.Fin.pdf); [university record](https://usiena-air.unisi.it/handle/11365/46452).
- Inspected: author-paper abstract and Section 4.1 methods through indexed original-paper text; university bibliographic record. Direct full-PDF retrieval was unreliable.
- Supported claim: a moving platform applies cutaneous cues through its orientation and displacement. The curvature experiment compared a grounded Omega 6 with and without the additional fingertip device; adding cutaneous cues improved discrimination in that setup.
- Limit: this is a three-DoF platform plus a grounded force device in the experiment. Its curvature result is not a demonstration that our one-axis planes reproduce arbitrary surface normals or stiffness. Normal indentation and tilt are separate capabilities.
- Transfer: a projected local slope is a plausible cue to investigate; arbitrary 3D surface shape needs more sensing/actuation or an explicit reduced representation.

## S03 — Gravity Grabber

**Kouta Minamizawa, Souichiro Fukamachi, Hiroyuki Kajimoto, Naoki Kawakami, and Susumu Tachi (2007). _Gravity Grabber: Wearable Haptic Display to Present Virtual Mass Sensation._ ACM SIGGRAPH 2007 Emerging Technologies, Article 8.**

- [DOI](https://doi.org/10.1145/1278280.1278289); [four-page author manuscript](https://www.tachilab.org/content/files/publication/ic/minamizawa200708SIGGRAPH.pdf); [project](https://tachilab.org/en/projects/13.html).
- Inspected: Sections 3.1–3.2 and Figures 1–4, 8–9 via manuscript text/captions; bibliographic metadata from the authors' university record.
- Supported claim: fingertip deformation can convey a virtual-weight cue without reproducing the corresponding wrist/arm load. A belt driven by two motors per finger provides shear and constrictive pressure. The paper includes an empty glass/virtual-water scenario.
- Limit: same/opposite motor rotations refer to two motors driving one belt. They are not the common/differential commands of our one-servo-per-finger assembly. Neither its force law nor its quantitative weight mapping transfers directly.
- Transfer: sustained directional fingertip cues can accompany moving contents; describe them as represented load, not actual added mass.

## S04 — Virtual rolling stone

**Hsin-Yun Yao and Vincent Hayward (2006). _An Experiment on Length Perception with a Virtual Rolling Stone._ EuroHaptics 2006, 325–330.**

- [Author paper](https://www.cim.mcgill.ca/~haptic/pub/HY-VH-EH-06.pdf); [author publication list](https://cim.mcgill.ca/~haptic/publications.html).
- Inspected: original-paper abstract, Sections 5.2 and 6, through indexed paper text. Direct full-PDF retrieval was unreliable.
- Supported claim: motion-linked rolling or impact cues can carry information about hidden container length. Eight participants tilted a tube with a simulated moving object; the longest tested length was generally distinguished from the two shorter ones.
- Limit: the two shorter lengths were often confused, and individual performance varied. The authors explicitly caution that their sample was too small for statistically meaningful claims about estimation bias. This is not evidence of accurate arbitrary length reconstruction.
- Transfer: a hidden interior that can be inferred from travel and contact timing is a compact, concrete experiment for our geometry-dependent pipeline.

## S05 — DualVib

**Yudai Tanaka, Arata Horie, and Xiang 'Anthony' Chen (2020). _DualVib: Simulating Haptic Sensation of Dynamic Mass by Combining Pseudo-Force and Texture Feedback._ VRST 2020, 10 pages.**

- [DOI](https://doi.org/10.1145/3385956.3418964); [author manuscript](https://yudai-tanaka.com/wp-content/uploads/2021/04/vrst20-dualvib.pdf).
- Inspected: mechanism description, Sections 7.1–7.4 and 9.1–9.4.
- Supported claim: the device separates asymmetric-vibration pseudo-force from texture vibration. Its twelve-participant study compares combined and individual cues for dynamic mass/material identification and supports the combined condition.
- Limit: application ratings did not establish a realism benefit for the liquid cases. The paper reports discomfort/interference issues and a limited texture recording set. Asymmetric waveform polarity is different from the spatial placement of our four transducers.
- Transfer: preserve distinct directional and material information in the combined output. A louder texture is not inherently a heavier or more convincing object.

## S06 — Vibr-eau

**Frank Wencheng Liu, Ryan Wirjadi, Yanjun Lyu, Shiling Dai, Byron Lahey, Assegid Kidane, and Robert LiKamWa (2025). _Vibr-eau: Emulating Fluid Behavior in Vessel Handling through Vibrotactile Actuators._ arXiv:2501.18755v1.**

- [Versioned full text](https://arxiv.org/html/2501.18755v1); [record](https://arxiv.org/abs/2501.18755).
- Inspected: Sections 3–7. This entry cites the January 30, 2025 manuscript; no peer-reviewed venue is asserted.
- Supported claim: a container-local fluid centroid and acceleration condition trigger spatially distributed pulses in vessel handling. The authors explore four, six, and eight motors and compare vessel shapes, with participant reports of fluid-like responses.
- Limit: reported intensity/timing inconsistencies and visual dependence temper the abstract's realism claims. A nonsignificant comparison with real liquid is not proof of equivalence. Its chosen pulse length is an implementation choice, not a material constant.
- Transfer: coordinate the visible wall interaction with the event location and onset. Our reduced x/y model and four-channel geometry remain different.

## S07 — Shifty

**André Zenner and Antonio Krüger (2017). _Shifty: A Weight-Shifting Dynamic Passive Haptic Proxy to Enhance Object Perception in Virtual Reality._ IEEE Transactions on Visualization and Computer Graphics 23(4), 1285–1294.**

- [DOI](https://doi.org/10.1109/TVCG.2017.2656978); [author institution page](https://www.dfki.de/web/forschung/projekte-publikationen/publikation/8925); [author manuscript](https://www.dfki.de/fileadmin/user_upload/import/8925_Shifty-TVCG2656978-Author-Version.pdf); [full-title institutional record](https://publications.cispa.saarland/2055/).
- Inspected: author institution abstract and original-paper metadata. Full-paper retrieval was inconsistent; detailed apparatus values are not used here. The shorter title on DFKI omits the final subtitle.
- Supported claim: an actuator redistributes a physical internal weight to change passive feedback. Studies explore changes in perceived shape and virtual object weight, including visual/auditory cues during redistribution.
- Limit: this changes real mass distribution and rotational inertia. Our planes do not move ballast, so reproducing a visual length/weight transition would use different sensory evidence.
- Transfer: make a transition meaningful through a coherent cue sequence; classify actual moving ballast as a mechanical extension.

## S08 — Drag:on

**André Zenner and Antonio Krüger (2019). _Drag:on – A Virtual Reality Controller Providing Haptic Feedback Based on Drag and Weight Shift._ CHI 2019, Article 211, 12 pages.**

- [DOI](https://doi.org/10.1145/3290605.3300441); [author institution page](https://www.dfki.de/en/web/research/projects-and-publications/publication/10362); [author manuscript](https://umtl.cs.uni-saarland.de/paper_preprints/zenner-krueger-dragon-chi-19-pre-print.pdf).
- Inspected: author institution abstract and author-paper opening; no uninspected numerical performance values are used.
- Supported claim: changing exposed surface area changes real air resistance and weight distribution. The work studies distinguishable feedback and perceived resistance during swinging/rotation.
- Limit: the effect depends on physical airflow and an expanding mechanism. A tilt-plane cue can represent an internal force but cannot promise the same resistance to whole-hand motion.
- Transfer: separate the semantic idea of a gust or drag from the mechanism producing physical resistance. A pocket-weather metaphor fits current output only as representation.

## S09 — Haptic Revolver

**Eric Whitmire, Hrvoje Benko, Christian Holz, Eyal Ofek, and Mike Sinclair (2018). _Haptic Revolver: Touch, Shear, Texture, and Shape Rendering on a Reconfigurable Virtual Reality Controller._ CHI 2018, Article 86, 12 pages.**

- [DOI](https://doi.org/10.1145/3173574.3173660); [author project page](https://ubicomplab.cs.washington.edu/publications/hapticrevolver/); [author manuscript](https://hbenko.com/publications/2018/Whitmire_HapticRevolver_2018.pdf).
- Inspected: abstract/mechanism and discussion, limitations, and qualitative observations on paper p. 10.
- Supported claim: a raised/lowered rotating wheel separates contact onset from surface motion. Interchangeable textures, ridges, and widgets are spatially registered using tracked controller motion.
- Limit: our planes lack its continuous wheel translation, interchangeable surface features, force sensing, and tracked surface position. Its discussion also reports individual contact-height differences and that greater realism was not universally preferred.
- Transfer: design contact onset, ongoing travel, and material detail as distinct parts of one interaction. A scanning demo requires a known scan coordinate.

## S10 — Touch&Fold

**Shan-Yuan Teng, Pengyu Li, Romain Nith, Joshua Fonseca, and Pedro Lopes (2021). _Touch&Fold: A Foldable Haptic Actuator for Rendering Touch in Mixed Reality._ CHI 2021, 14 pages.**

- [DOI](https://doi.org/10.1145/3411764.3445099); [author manuscript](https://lab.plopes.org/published/2021-CHI-TouchFold.pdf).
- Inspected: abstract, Section 8 apparatus/real-object study, Section 9.1 limitations.
- Supported claim: a nail-mounted actuator folds onto the fingerpad for virtual contact and retracts to permit real-object manipulation. The paper includes virtual contacts, buttons, and texture examples, and a mixed physical repair/virtual instruction task.
- Limit: fingertip availability is a mechanical feature, not something our continuously held contact planes acquire through software. The paper itself did not achieve realistic soft-surface rendering with its tested approach.
- Transfer: transitions between free contact and engaged contact are a valuable design dimension, but free-finger MR and actual squeeze compliance require changed mechanics.

## S11 — Haptic Links

**Evan Strasnick, Christian Holz, Eyal Ofek, Mike Sinclair, and Hrvoje Benko (2018). _Haptic Links: Bimanual Haptics for Virtual Reality Using Variable Stiffness Actuation._ CHI 2018, 12 pages.**

- [DOI](https://doi.org/10.1145/3173574.3174218); [author project](https://siplab.org/projects/Haptic_Links); [author manuscript](https://www.microsoft.com/en-us/research/wp-content/uploads/2018/02/HapticLinks_Strasnick_et_al_CHI2018-5a9063428e701.pdf).
- Inspected: abstract, applications/extensions and limitations on paper pp. 8–9.
- Supported claim: electromechanical connections between two controllers constrain relative motion with adjustable stiffness. Applications include two-handed tools and direction-dependent resistance.
- Limit: the links provide resistance; they do not actively move the controllers into place. The mechanism creates a physical connection absent from our single handheld assembly. It also has weight, bulk, and range limits.
- Transfer: persistent constraint is a distinct interaction category. A virtual catch or lock can be cued on our device; a physically impassable boundary or two-handed spring requires additional mechanics.
- Naming: this research system is unrelated to this repository's **Haptic Link** communications layer.

## S12 — Tactile Brush

**Ali Israr and Ivan Poupyrev (2011). _Tactile Brush: Drawing on Skin with a Tactile Grid Display._ CHI 2011, 2019–2028.**

- [DOI](https://doi.org/10.1145/1978942.1979235); [author institution page](https://la.disneyresearch.com/publication/tactile-brush-drawing-on-skin-with-tactile-grid-display/); [paper](https://la.disneyresearch.com/wp-content/uploads/Tactile-Brush-Drawing-on-Skin-with-a-Tactile-Grid-Display-Paper.pdf).
- Inspected: abstract and the apparent-motion/phantom-sensation explanation on paper pp. 2–3.
- Supported claim: the algorithm combines onset/duration relationships for moving sensations with intensity relationships for a perceived point between physical tactors. These are related but distinct effects.
- Limit: four actuators in a rigid casing are not the paper's skin-contact grid. A sequential pattern can remain perceptually discrete; changing onset delay alone does not establish a continuous tactile stroke.
- Transfer: use controlled overlapping envelopes for travel cues and compare them with a discrete alternative. Label the result as a proposed motion cue until handling supports it.

## S13 — Apparent-motion control space

**Ali Israr and Ivan Poupyrev (2011). _Control Space of Apparent Haptic Motion._ IEEE World Haptics Conference, 457–462.**

- [DOI](https://doi.org/10.1109/WHC.2011.5945529); [author paper](https://la.disneyresearch.com/wp-content/uploads/whc2011-israr-poupyrev.pdf).
- Inspected: abstract, Experiment 3, usability evaluation, and concluding discussion.
- Supported claim: the onset-asynchrony range for apparent movement depends on stimulus duration and body site; spacing/direction effects also depend on site. The work includes forearm/back measurements and a vest evaluation.
- Limit: its timing values are not fingertip/casing calibration values. More points and a more complex path do not automatically expand the space of convincing movement.
- Transfer: spatial order, overlap, path complexity, and coupling deserve distinct controls; avoid treating actuator count as a perceptual resolution guarantee.

## S14 — Ubi-Pen II

**Ki-Uk Kyung, Jun-Young Lee, and Junseok Park (2008). _Haptic Stylus and Empirical Studies on Braille, Button, and Texture Display._ Journal of Biomedicine and Biotechnology, Article 369651, 11 pages.**

- [DOI](https://doi.org/10.1155/2008/369651); [open primary article](https://pmc.ncbi.nlm.nih.gov/articles/PMC2246069/); [publisher](https://onlinelibrary.wiley.com/doi/10.1155/2008/369651).
- Inspected: original-article Sections 2–3 and 5 through indexed full text; the direct PMC open later encountered a browser check.
- Supported claim: this Ubi-Pen version combines a 3×3 pin display and an inertial impact module. Its experiments distinguish button contact from ongoing texture exploration; its force-plus-texture setup also uses a grounded haptic interface.
- Limit: pin-array Braille, continuous surface texture under a scanning fingertip, and grounded resistance are absent from our hardware. A four-channel enclosure does not provide a 3×3 fingertip pattern display.
- Transfer: an interaction can have a sustained structural cue plus brief state-change confirmation. Do not equate a rumble with a readable raised pattern or a physically compliant button.

## Synthesis boundaries

The atlas axes and demo concepts are this project's design synthesis, not a published taxonomy or a list of replications. The useful distinctions are exploratory goal, gesture observability, state history, contact topology, temporal character, and whether the output represents a force or creates the corresponding mechanical constraint.

The existing [reference audit](../reference/10_REFERENCES.md) additionally covers Hirose and Inami's 2026 _Haptic Representation Method for Material Properties utilizing Pseudo-weight Shifting_. ACM access was blocked in this research lane, so no fresh reading or independent confirmation of that paper is claimed here.

No paper above establishes perceptual success for two one-axis tilting planes plus this four-transducer enclosure. The proposals deliberately preserve the current hardware's limits and identify what would change.
