# WHC2025demo CAD source and motion

The new model comes from the user-opened **WHC2025demo v30** Fusion document. It contains three independently tilting contact fins, three XL/XC-330 servo assemblies and three FSR400 bodies. No vibration-transducer bodies are present. This is a separate asset from VRSJ2026; none of the previous CAD/GLB files was overwritten.

The document name identifies the opened CAD revision. It does not establish that every component matches the July WHC demonstration, the September VRSJ prototype, or every earlier Fresnel device.

## Deliverables

- [whc2025-demo.glb](../public/models/whc2025-demo.glb): visible BRep tessellation, **217 mesh nodes, 144,938 triangles, 5,840,656 bytes**.
- [whc2025-kinematics.json](../public/models/whc2025-kinematics.json): three contact-pad channels A/B/C, six rotation groups, exact pivots, original GLB node indices, contact anchors and evidence W01–W08.
- [whc2025-cad-metadata.json](whc2025-cad-metadata.json): original node names, component bounds, source camera, centering translation and limits.
- [fusion-active-view.png](../../output/fresnel-series-assets/fusion-active-view.png): source Fusion viewport at export.
- Local read-only evidence: [fusion-visible-meshes.json](../../output/fresnel-series-assets/fusion-visible-meshes.json) and [fusion-kinematics-raw.json](../../output/fresnel-series-assets/fusion-kinematics-raw.json).

Visible extents along original CAD XYZ are **74.500 × 56.179 × 46.086 mm**. These are exported geometry bounds, not measurements of a manufactured device. The outerwall, battery, step-up regulator, XIAO ESP32S3 PLUS v4 assembly and `3D_PCB1_2025-07-17` electronics are retained. Hidden bodies are excluded. PBR colors approximate the Fusion appearance and may be restyled for explanation.

## Coordinate and input convention

All GLB vertices are already in centered CAD world coordinates, in metres. The original CAD XYZ orientation is retained. Conversion applies only each occurrence's `transform2`, centering and cm→m scaling.

```text
originalCenterCm = [1.7250001430511475, -0.19106527047646837, -1.4043080810738178]
pMeters = (pWorldCm - originalCenterCm) * 0.01
pAnimated = pivot + R(axis, ratio * padAngle) * (pRest - pivot)
```

Channel input is the **contact pad's angle about original CAD +Z**, using the right-hand rule. Each fin group has ratio **+1**; its driver group has ratio **−1**. Zero reproduces the exported CAD pose. All three source joint axes use −Z; the common +Z convention deliberately reverses that representation. This does not calibrate firmware or servo-command signs.

The existing generalized `DeviceRig` can load this profile with `{channelIds: ['A', 'B', 'C'], vibrationCount: 0}` and `setAngles({A, B, C})`. The container model retains its own default two-channel/four-transducer profile. Do not use the container's `left/right` pose API to address the third WHC channel.

`nodeIndices` means the GLB `nodes` array index, not a Three.js object ID or mesh index. Use the GLTFLoader parser association to match these values; original names may be sanitized by the loader.

## Mechanism and actual part pairing

All three fins have unsuppressed, unlocked revolute joints to `outerwall:1`. They are three independent **single-axis** contact-plane rotations. Each fin pivot is about 20 mm away from its corresponding servo/pinion axis. The servo cases remain stationary; only the output horn, retaining screw and pinion follow the driver rotation.

| Channel | CAD position | Fin / node | Pinion / node | Servo occurrence | Horn and retaining-screw nodes |
|---|---|---|---|---|---|
| A | Negative X | `fin:1` / 55 | `pinion:1` / 52 | `XL,XC-330 v1:1` | 4, 8, 9 |
| B | Positive X, positive Y | `fin:2` / 56 | `pinion:2` / 53 | **`XL,XC-330 v1:3`** | 38, 42, 43 |
| C | Positive X, negative Y | `fin:3` / 57 | `pinion:3` / 54 | **`XL,XC-330 v1:2`** | 21, 25, 26 |

The B/C servo occurrence numbers are swapped relative to the fin numbers. Their actual shaft positions establish this mapping. Finger assignment and firmware channel assignment remain `null` in the CAD profile; A/B/C are placement identifiers.

Pivots below are in centred metres; the JSON retains the full floating-point values. Every group axis is `[0,0,1]`.

| Channel / group | Pivot X | Pivot Y | Pivot Z | Ratio |
|---|---:|---:|---:|---:|
| A / fin | −0.03725000143051148 | 0.0019106527047646838 | 0.014043080810738177 | +1 |
| A / driver | −0.017250001430511475 | 0.0019106527047646838 | 0.014043080810738177 | −1 |
| B / fin | 0.03724999938160181 | 0.01039537270793115 | 0.014043080810738177 | +1 |
| B / driver | 0.01724999856948853 | 0.010410652704764685 | 0.014043080810738177 | −1 |
| C / fin | 0.03724999938160181 | −0.012445146641127459 | 0.014043080810738177 | +1 |
| C / driver | 0.01724999856948853 | −0.012589347295235316 | 0.014043080810738177 | −1 |

The original small Y offsets between the B/C fin pivots and driver axes are retained. No alignment or gear phase was repaired. Neither a bounding-box center nor a visual guess was used as a hinge.

## Evidence for axes and transmission

**W01/W02:** the live API returned three revolute joints: `回転 2` connects `fin:1` to `outerwall:1`; `回転 4` connects `fin:2`; `回転 3` connects `fin:3`. Their world origins agree with the occurrence-transformed native fin pivot `[-2,0,0]` cm. The native fin's cylindrical surfaces share this Z axis. Unlike the later VRSJ2026 model's copied-joint ambiguity, all three WHC joints have valid occurrence associations and matching origins.

**W03/W04:** pinion cylinders share their native origin's Z axis. The servo horn's native Y axis transforms to CAD +Z at the corresponding pinion. The retaining-screw cylinders are coaxial with the horn. Both gear profiles have 0.875 cm root radius, 1.1 cm tooth-top radius and an 18° tooth pitch, supporting nominal **equal-and-opposite** external-gear rotation. For example, pinion face samples at 19.15°, 37.15°, 55.15° and fin samples at 7.85°, 25.85°, 43.85° establish equal pitch. Twenty teeth is a full-wheel equivalent; the retained fin geometry is a sector, not a complete 20-tooth wheel.

**W08:** the VRSJ2025 technical report [各指先接平面の動的な傾き操作による剛性・慣性提示](https://www.conference.vrsj.org/ac2025/program/doc/1D2-04.pdf), Hiroki Ota, Yutaro Hirao, Monica Perusquía-Hernández, Hideaki Uchiyama and Kiyoshi Kiyokawa, explicitly describes a 1:1 servo-to-fin gear ratio. Its local PDF copy was read and Figure 2 was inspected. This supports the nominal magnitude inferred from CAD; the opposite sign follows the external-gear layout. The report's ±45° range is a **publication specification**, not a clearance test or measured range for this export. The animation uses a smaller illustrative angle range.

There are **zero Fusion motionLinks**. The export does not independently verify backlash, tooth contact, torque, load, finger mechanics or physical travel limits.

## Real contact-face anchors

Each channel's `contact` object contains `anchorRestMeters`, `normalRest` and `attachedNodeIndex`. These come from the actual outer planar face, **tempId 18**, rather than a fin bounding-box center. Fusion's `pointOnFace` returns a guaranteed point within that face:

```text
native pointOnFaceCm = [-2.0000000000000058, -1.6653345369377348e-16, -1.7750000079348638]
native outward normal = [-1,0,0]
```

The analytic plane's parameterization reports the other normal direction. Fifty exported mesh normals on the outer plane confirm that outward is −X in native coordinates. The occurrence transforms produce −X for A and approximately +X for B/C.

The anchors lie on the pads' longitudinal hinge lines. Their positions therefore stay essentially fixed while the **surface normals rotate**. This is expected and is useful for placing an explanatory fingertip at the real contact face. The point is a representative on-face location, not a measured finger-contact point. A ghost fingertip's size and shape remain illustration choices.

The independent GLB check found the anchors within 1.7e−9 m of the actual triangulated faces; the test tolerance is 1e−8 m to accommodate float32 mesh storage. This numerical agreement does not claim nanometre manufacturing precision.

## FSR treatment

Nodes **215, 216, 217** are `FSR400:1`, `FSR400:2`, `FSR400:3`, with role `pressureSensor`. They sit beneath/inside the corresponding fins, not on the outward contact plane. No FSR occurrence participates in any exported joint or rigidGroup, so the CAD alone does not prove a rigid attachment to the rotating fin.

The VRSJ2025 Figure 2B disassembly shows the FSR on the electronics-side subassembly; Figure 2C and the text place a pressure sensor beneath each fin and describe transferring finger force to it. This supports **retaining the sensor rest poses** while animating the contact faces. It does not establish a CAD rigid constraint or supply a dynamic measurement of sensor motion.

The rig therefore moves 15 nodes and retains 202 nodes at rest, including the three FSRs. `unresolvedAttachmentNodeIndices` and each channel's `pressureSensor` retain the CAD attachment uncertainty explicitly. They should not be described as rigidly rotating with the fins. The model identifies sensor geometry, not calibrated force readings, wiring or a verified sensor-input implementation.

## Read-only export and verification

The source was inspected through the existing manually registered Fusion script entry. The temporary wrapper only ran [WHCVisibleMeshExport.py](../../output/fresnel-series-assets/WHCVisibleMeshExport.py) and [WHCKinematicsReadOnly.py](../../output/fresnel-series-assets/WHCKinematicsReadOnly.py), both guarded to require a document name beginning `WHC2025demo`. All output went to the separate `output/fresnel-series-assets/` directory. The original registered exporter was restored byte-for-byte afterward. No auto-run setting was changed.

The document had no unsaved-change marker; API `isModified` was **false before and after**. The work did not modify geometry, placements, visibility, materials or saved CAD state and did not drive a Fusion joint or physical servo.

Reproduction commands:

```text
python output/fresnel-series-assets/convert_whc_glb.py
python output/fresnel-series-assets/build_whc_kinematics.py
node output/fresnel-series-assets/verify_whc_assets.mjs
```

The first conversion writes to the local evidence directory; the checked GLB and metadata were copied to their WHC public/production filenames. The motion builder validates original node names against the actual public GLB and checks joint/surface and horn/pinion axis agreement.

The [verification report](../../output/fresnel-series-assets/whc-asset-verification.json) passes using the real GLTFLoader and production generalized `DeviceRig` with three channels and zero vibration nodes. It checks zero-pose reparenting, no drift on return, 131,220 moving-vertex axis-distance comparisons, stationary transforms for the 202 retained-rest nodes, actual contact-face positions, and contact-normal rotation. These are geometry/software checks; browser composition and physical/perceptual validation are separate.

The persistent [WHC regression suite](../tests/whc-rig.test.mjs) uses representative actual vertices rather than repeating the full export audit. It verifies the 217-mesh profile, independent fin/pinion/horn motion including the B/C servo mapping, all retained-rest transforms, neutral reset, contact anchors and normals under assembly transforms, and rejection of a missing channel. `npm test` passes **19 tests, 0 failures**, including the 15 existing tests and four WHC tests. These tests produce no runtime-package artifacts and do not change the frozen CAD metadata.

Raw Fusion evidence remains local under `output/`. Reproducing the film uses the exported GLB, kinematics JSON and renderer and does not require reopening or exporting Fusion.
