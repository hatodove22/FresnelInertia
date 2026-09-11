# Unity v0.2 visual verification snapshot

Historical software evidence, superseded by the rapid-shake implementation.
Current facts belong in [16](../16_PROGRESS_STATUS.md). Local v0.2 distributions
are preserved in `output/unity/quality-v020/`; they are not the current builds.

## Optional Unity study — 2026-09-10

[**Fresnel Studio**](../../unity/README.md) targets Unity **6.3 LTS / 6000.3.23f1**.
The original MIT-licensed
[Fresnel Container Materials](../../unity/FresnelContainerDemo/Packages/com.fresnel.container-materials/README.md)
v0.2.0 is an embedded, reusable Built-in pipeline package. The visual revision
on 2026-09-11 replaces particle-shaped water with a smooth connected free
surface, large faceted grains with a fine continuous sand bed, and repeated
softbody remeshing with a bound elastic skin. A static HDR studio environment,
refraction, absorption, bevelled enclosure and antialiasing improve presentation.
It contains no Obi code or paid dependency. A direct rendering-quality comparison
with Obi has not been made. On 2026-09-11 the user judged the v0.2 visual revision
substantially improved, then requested convincing rapid shaking and settling.
That visual feedback does not establish physical or tactile acceptance.
The closed-vessel water fit has no detached spray or overturning waves; the sand
bed does not show airborne grains, and the elastic skin cannot tear or split.
Windows COM and native Android CDC USB share mixed-line decoding,
execution-ACK command sequencing, stale detection, Stop supersession, profile
transactions and reconnect behavior. Device mode presents applied metric
body-X/Y state, four reported output channels and valid servo shaft readbacks;
missing feedback remains unknown. Connection never starts outputs. The retained
PhysX marble/beads scene and new particle studies remain explicitly offline and
independent of the production C++ model.

Connected material detail consumes fresh source frames; the gold mass marker
uses accepted telemetry directly. Bounded particle COM residual is exposed and
is not a device measurement. Lost/duplicate source frames cannot keep simulating.
Two substeps cap local detail work; omitted time is reported and never replayed.
Source-driven speaker audio is optional and initially muted.
Web-compatible selected-profile JSON supports local A/B slots and stopped
seven-value application with four numeric tilt readbacks. No human preference
ratings or improved tactile result were produced by this Unity work.

| Check | Verified result and boundary |
|---|---|
| Windows player | Unity 6000.3.23f1 / Windows x64 build PASS; PhysX **38/38**, Studio **30/30**, material integration **100/100**, zero captured runtime errors |
| Editor regressions | **157** retained protocol/presentation/profile assertions plus **110** material solver/component assertions PASS. The retained clipped-volume tests are not a volume-conservation claim for the particle solver |
| Independent asset | Separate Unity 6.3 project generates/builds/runs the package sample with persistent HDR studio lighting; no Assets C# or Assembly-CSharp dependency. UPM **0.2.0**, **52,823 B**, all **50** files match source. Complete Windows ZIP **35,188,568 B**, all **158** files match the built player and pass CRC |
| Protocol fixture independence | **36/36** emitted mock snapshots pass the repository's canonical JSON schema; actual USB is not mocked into a physical claim |
| Web profile roundtrip | 47-case corpus matches Web acceptance; all **13** valid Unity exports re-import into the actual Web codec |
| Real Windows UI | Material clicks, water drag, Space pause, profile dialog/baseline JSON, text entry and malformed-save rejection, and disconnected Start gating checked |
| Desktop rendering | Inspected actual 1600 × 900 rest/motion captures for all three materials at Balanced/Mobile quality, plus empty, 1%/near-full, extreme tilt and stale recovery. GPU readback validates the actual finite occupied field and frozen hashes, rather than the ray-box proxy. Smooth normals, body skin, fine sand and corrected overlapping base geometry replace the rejected earlier appearance |
| Android build | Unity 6000.3.23f1 APK build PASS using JDK 17 / NDK r27c / SDK 36, ARM64 IL2CPP and OpenGLES3. Fresh Gradle packaging reduces **47,821,961 → 33,029,838 bytes** with identical uncompressed content in all **56** ZIP entries. CRC, v2 development signature and 16 KB ZIP alignment checks pass; min API **25** / target **36**, ARM64-only, optional USB host. Shipped DEX retains permission, detach and open/close handling. Actual phone installation, rendering and performance remain unverified |

Final Windows measurements used an RTX 3060 Ti, 1600 × 900, four seconds of
settling and four seconds of motion per material. The normal VSync run held
**16.67 ms median / 16.68 ms p95** for all six Balanced/Mobile cases. With VSync
off and a fixed 1/60-second source interval per rendered frame:

| Balanced material | Solver CPU median | Surface CPU median | Whole-scene GPU median | Wall frame median / p95 |
|---|---:|---:|---:|---:|
| Water, 437 particles | 3.41 ms | 0.15 ms dispatch | 0.90 ms | 3.91 / 4.64 ms |
| Sand, 778 particles | 3.81 ms | 0.35 ms | 1.01 ms | 4.46 / 4.98 ms |
| Softbody, 168 particles | 0.75 ms | 0.36 ms | 0.55 ms | 1.43 / 4.68 ms |

GPU values are Unity FrameTimingManager whole-scene measurements, including
UI, not individual water-stage timings. Short-run GPU p95 varied from 2.42 to
4.39 ms in these Balanced cases. The player allocation counter was unavailable;
GC collections occurred, so no zero-allocation player claim is made. Mobile
quality was exercised on Windows, not on a phone.

The unchanged-budget solver A/B on a sequential standalone Mono harness measured
Balanced water **4.44–4.79 → 2.19–2.32 ms** and sand **8.19–9.43 → 2.64–2.85 ms**
per update. Shared neighbour/contact work was removed; particle counts and
integration iterations were preserved. This is solver-only timing, separate
from the Unity player measurements. The sand surface uses **829** vertices and
the elastic skin **614** at Balanced quality. A 525-case sand boundary audit
checked fill, aspect and support walls; the stationary 45-degree support switch
no longer jumps. Spatial reconstruction remains an approximation of the cloud.

The APK includes explicit USB permission, detach/close and pause/reconnect
lifecycle code; unused Standard shader variants are removed for Android.
No Android phone was attached (`adb devices` empty); no StampC5/AtomS3 USB port
was present. Therefore actual Windows USB, Android runtime/USB, simultaneous
physical outputs, listening and handled visual/felt agreement remain **unverified**.
The existing servo communication issue is not closed. No firmware, Web client
or device storage was changed. Builds and evidence under `output/unity/` remain
local/ignored; reproduction and controls are in the Unity README, and remaining
attended acceptance is in [08](../08_IMPLEMENTATION_PLAN.md#unity-implementation-track).
