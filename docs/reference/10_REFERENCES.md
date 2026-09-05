# 10 References

> Technical reference; read only when the current task needs this detail. Current scope, facts, and demo acceptance are in [08](../08_IMPLEMENTATION_PLAN.md), [16](../16_PROGRESS_STATUS.md), and [07](../07_TEST_AND_VALIDATION.md).

## Core device / platform references

- [AtomS3 product and pin map](https://docs.m5stack.com/en/core/AtomS3)
- [StampC5 product and pin map](https://docs.m5stack.com/en/core/Stamp-C5)
- [StickS3 product and pin map](https://docs.m5stack.com/en/core/StickS3)
  (legacy target, not the assembled demo controller)
- ESP32-S3 I2S peripheral documentation
- ESP32-S3 USB Device Stack and TinyUSB vendor/composite support:
  `https://docs.espressif.com/projects/esp-idf/en/latest/esp32s3/api-reference/peripherals/usb_device.html`
- [MAX98357A product and datasheet](https://www.analog.com/en/products/max98357a.html)
  (the assembled four-channel board uses MAX98357A, not MAX98360A)
- [XL330-M077-T e-manual](https://emanual.robotis.com/docs/en/dxl/x/xl330-m077/)

## Android AR / WebUSB planning references

Android is the planned mobile host; VR/Quest work is on hold. These primary
sources establish platform prerequisites, not a working Android implementation
or simultaneous StampC5 USB/camera/AR operation in this project.

- [Google WebXR requirements](https://developers.google.com/ar/develop/webxr/requirements)
  and [ARCore-supported devices](https://developers.google.com/ar/devices):
  supported Android hardware, Chrome, Google Play Services for AR and HTTPS.
- [Android USB host overview](https://developer.android.com/develop/connectivity/usb/host):
  host capability is hardware-dependent; Android version alone is insufficient.
- [Chrome Android WebUSB notes](https://developer.chrome.com/docs/capabilities/build-for-webusb#android)
  and [WebUSB access](https://developer.chrome.com/docs/capabilities/usb):
  device interfaces, permission and secure-context requirements.
- [Google WebXR AR tutorial](https://codelabs.developers.google.com/ar-with-webxr):
  camera/world tracking and placement on discovered surfaces do not by themselves
  track a separate moving hand-held container.
- [AR.js official documentation](https://ar-js-org.github.io/AR.js-Docs/):
  camera/marker tracking is an available WebAR approach. A device-mounted marker
  is a candidate, not an adopted dependency or implemented feature. Camera-frame
  alignment and heading cannot be replaced by gravity-only IMU tilt.

## Retained Quest transport references

These remain background for the earlier Quest work, not a requirement to resume
VR or proof of the planned Android path.

- RadioField Web, a developer-reported Quest 3 / Meta Quest Browser WebXR MR
  application tested with OTG-connected RTL-SDR, HackRF, and tinySA Ultra over
  WebUSB / Web Serial:
  `https://manahiyo.itch.io/radiofield-web`
- MDN Browser Compatibility Data for WebUSB, including the Quest Browser
  (`oculus`) Chrome-Android mirror entry:
  `https://github.com/mdn/browser-compat-data/blob/main/api/USB.json`

## Focused research reading (2026-09-05)

These are design inputs, not new mandatory experiments. Evidence from another
mechanism does not establish this prototype's perceptual performance.

### Gravity Grabber: directional skin deformation

Minamizawa, Fukamachi, Kajimoto, Kawakami and Tachi, SIGGRAPH 2007,
*Gravity Grabber: Wearable Haptic Display to Present Virtual Mass Sensation*.
[Author manuscript](https://www.tachilab.org/content/files/publication/ic/minamizawa200708SIGGRAPH.pdf),
[project](https://tachilab.org/en/projects/13.html).

Two motors drive a belt on each finger. Same-direction motor rotation produces
shear; opposite rotation tightens the belt for normal pressure (Fig.2, Sec.3.2).
This is NOT the same pair as our one-servo-per-finger common/differential mode.
Fig.4 describes contact-force vectors during movement, not transferable motor
signs. The empty-glass/virtual-water example motivates sustained directional
cues. For this project, transfer that perceptual aim, not the belt mechanism
or its numerical force mapping. Contact-plane tilt remains a different actuator.

### DualVib: complementary force and texture

Tanaka, Horie and Chen, VRST 2020,
*DualVib: Simulating Haptic Sensation of Dynamic Mass by Combining Pseudo-Force
and Texture Feedback*.
[Author manuscript](https://yudai-tanaka.com/wp-content/uploads/2021/04/vrst20-dualvib.pdf).

Two fingertip asymmetric-vibration actuators provide pseudo-force; two grip
actuators provide texture. The components are mechanically separated.
The 12-participant study supports combined mass/material identification over
either cue alone, but the application study found no significant realism
improvement for its liquid cases (Secs.7-9). This supports complementary outputs,
not a claim that our six-actuator layout or four-layer engine is validated.
Demo implication: retain a clear rigid/granular contrast and check whether
vibration masks tilt when both operate. Do not equate stronger vibration with
better liquid rendering or rebuild the hardware merely to copy DualVib.

### Vibr-eau: spatially timed vessel contacts

Liu et al., 2025 arXiv manuscript,
*Vibr-eau: Emulating Fluid Behavior in Vessel Handling through Vibrotactile
Actuators*.
[Full text](https://arxiv.org/html/2501.18755v1).

The system uses 4/6/8 circumferential motors. CoG proximity plus an acceleration
threshold triggers local transient pulses; vertical shaking can activate all
motors. Its selected pulse duration was 80 ms, not a universal liquid constant.
The 16-participant study reported timing inconsistencies and visually dependent
realism; no significant difference from real liquid is not proof of equivalence.
Motor-density results do not establish that eight motors are required.
Demo implication: coordinate event location, onset and visible content motion
before increasing channel count or copying its thresholds. Its spatial/temporal
asymmetry is distinct from DualVib's asymmetric acceleration waveform.

### Apparent motion: onset and envelope belong together

Israr and Poupyrev, 2011:
[Tactile Brush, CHI](https://la.disneyresearch.com/publication/tactile-brush-drawing-on-skin-with-tactile-grid-display/)
and [Control Space of Apparent Haptic Motion, WHC](https://la.disneyresearch.com/publication/control-space-of-apparent-haptic-motion/).

Apparent motion uses onset timing relative to stimulus duration; phantom
sensation uses relative intensities to place a perceived point between actuators.
They are related but distinct tools. The WHC measurements on forearm/back varied
with duration, site and direction. Do not copy their SOA values directly to
our fingertip/casing arrangement or claim continuous motion from a delay alone.

Local implementation note: [SpatialRenderer4](../../src/SpatialRenderer4.cpp)
now preserves a complete delayed FlowRipple neighbor envelope in the coherent
assembled profile; the generic legacy path retains one-frame snapshots. This
change follows the onset/duration principle, but is not a Tactile Brush
implementation or evidence of perceived continuous motion on this device.
Judge the resulting flow during the short demo, not a new spatial-test campaign.

### Pseudo-weight Shifting: motion-linked material response

Hirose and Inami, CHI 2026, Article 743 (21 pages),
*Haptic Representation Method for Material Properties utilizing Pseudo-weight
Shifting*. [Full text](https://dl.acm.org/doi/epdf/10.1145/3772318.3790940).
Full paper obtained through the user's open browser; mechanism, evaluation,
discussion and appendix read, with Figs.2-6 and 18-19 visually checked.

Four actuators form two synchronous pairs for X/Y pseudo-attraction. Direction
comes from asymmetric waveform polarity, NOT actuator location (Sec.3.3).
Low-pass-filtered acceleration differences drive the signal (Sec.3.5, Fig.5).
The delay parameter enlarges the difference window, delta-t (Sec.3.6.4);
do not assume a pure output-delay queue. Frequency denotes waveform repetition,
not a servo update rate. This is neither our four-location spatial renderer
nor a transferable servo-angle law.

In the controlled 15-person adjustment study, yogurt targets used longer delay
and lower fundamental frequency than water (Sec.5.2.1, p<.001 for each).
A 10-person study explored intermediate subjective viscosity settings; it did
not calibrate physical viscosity. The 834 exhibition visitors supplied
exploratory material/granularity observations, not a recognition success rate.
The reported 17.7 g equivalent inertial mass (SD 10.2 g) is a psychophysical
comparison, not static weight or measured actuator force (Sec.4.4).

Demo implication (our inference): shape coherent follow-through and spectral
character with a small set of meaningful material controls. Keep shared-state
tilt plus spatial vibration; no replacement engine is implied. Intentional
material response is distinct from irregular communication/servo stalls.
Transfer the design principle, not numerical frequencies/delays or the
open-loop stability claim: mounting changes perception (Sec.8.2), and our
contact-plane servos are a different physical mechanism.

## Other background leads

STK/PhISEM/shaker synthesis and sloshing/Housner equivalent models remain
background leads for later focused refinement. They were not newly audited
in this reading. No source above specifies this project's exact four-layer
architecture; that architecture is the project's own integration choice.
