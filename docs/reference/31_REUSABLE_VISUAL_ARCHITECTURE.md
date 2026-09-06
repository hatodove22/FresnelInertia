# Reusable visual state and material rendering

Implemented 2026-09-06. This is the extension reference for the shared Web
renderer. The experience is defined in [00](../00_DESIGN_SPECIFICATION.md),
the active work in [08](../08_IMPLEMENTATION_PLAN.md), and hardware evidence in
[16](../16_PROGRESS_STATUS.md). A subsequent visual pass replaces the old liquid
profile and decorative assets and adds desktop placement/motion cues. The tuning
studio, granular accumulation model and Android tracking remain planned.

## Boundaries with current consumers

| Owner | Responsibility | Current consumers |
|---|---|---|
| [visualState.ts](../../webxr/src/visualState.ts) | Pure snapshot adapters, applied descriptor, body-x/y particle layout and acceleration residual; no DOM, THREE runtime, transport implementation or clock | DeviceDemo, liquid renderer, particle renderer; pure contract tests |
| [DeviceDemo](../../webxr/src/deviceDemo.ts) | Accept snapshots, hold stale/missing state, filter gravity once per accepted sample, display actual applied configuration and coordinate explicit commands | Desktop HUD and the retained spatial panel |
| [VisualSimulator](../../webxr/src/simulator.ts) | Browser-local approximate motion from preview tilt and `PreviewMotionTuning` | Existing touch/phone/scripted preview selected in main.ts |
| [ContainerScene](../../webxr/src/renderer/ContainerScene.ts) | Shell, desktop placement/motion, explicit source selection and composition of material ingredients | Desktop and retained XR use the same scene instance |
| [ContainerGeometry](../../webxr/src/renderer/ContainerGeometry.ts) | One shape/dimension definition and geometric constraints | Shell, liquid volume/surface and particle travel limits |
| [desktopView](../../webxr/src/renderer/desktopView.ts) | Camera framing from rendered size; retain desktop close-up and fit narrow viewports above the HUD | main.ts desktop/narrow presentation; projected-corner tests |
| [LiquidContentRenderer](../../webxr/src/renderer/LiquidContentRenderer.ts) | Contained volume, gravity-referenced free surface and normal-map detail | Liquid and Hybrid |
| [ParticleContentRenderer](../../webxr/src/renderer/ParticleContentRenderer.ts) | Solid instances; local integration only in preview, deterministic projection for connected state | Granular and Hybrid, including the accepted single marble |

`main.ts` still owns animation timing, placement and input selection. It already
chooses the device frame when DeviceDemo is active and otherwise advances
VisualSimulator. The renderer does not need a second application stack or a
general plugin registry. The existing `ContainerScene` entry points and type
re-exports remain compatible; `SpatialPanelState` remains an alias for the
presentation-independent preview tuning fields.

Hybrid composes the same two ingredients used by the standalone families.
Improving one ingredient therefore reaches both consumers. Device projection
receives neither `dt` nor elapsed time. Clock-based texture motion and grain integration exist only in local preview.

## Source authority and the pure adapter

`DeviceVisualSink` is the small presentation contract used by DeviceDemo:
`setPreset`, `setDeviceState`, `setDeviceOrientation`, and optional
`setDeviceAcceleration`. ContainerScene satisfies
it without an extra wrapper. DeviceDemo no longer depends on that concrete
renderer class. A future presentation can implement the same sink; a transport
or protocol change is not needed merely to change a view.

- `resolvedPresetFromSnapshot(snapshot)` returns a copied applied descriptor or
  null. It never fills missing configuration from local preset JSON.
- `contentFromSnapshot(snapshot, appliedFill)` returns a sanitized aggregate
  state or null for missing motion. `sanitizeDeviceContent` also supports direct
  callers of the projection API.
- `orientationFromSnapshot(snapshot, previousGravity)` returns filtered gravity
  and pitch/roll plus body-frame acceleration residual (g), or null for invalid IMU data. The controller owns the previous
  gravity and calls this once per new accepted snapshot.
- `deviceParticleLayout(size, state, family, single)` and
  `deviceParticlePose(layout, index, count)` project the reported body x/y mass
  to a wall-bounded illustrative cloud. Symmetric pairs keep its centroid at
  the reported mass. They do not represent measured individual grains.
- [ContainedVolume](../../webxr/src/renderer/ContainedVolume.ts) clips the inner
  vessel against a plane and solves its height for the requested volume fraction.
  LiquidContentRenderer projects accepted orientation and body-x/y motion into
  this surface; the obsolete floating-block profile and preview foam are removed.

For example, a non-THREE explanatory or analytical view can consume the same
particle projection without loading browser rendering or the Haptic Link
implementation:

```ts
import {
  sanitizeDeviceContent, deviceParticleLayout, deviceParticlePose
} from "./visualState";

const state = sanitizeDeviceContent(input);
const layout = deviceParticleLayout({ x: 0.05, y: 0.05, z: 0.05 }, state, "Granular", true);
const marble = deviceParticlePose(layout, 0, 1);
// Draw marble.x/y/z in metres with layout.radius.
```

An explanatory source must remain visibly identified as illustrative. Importing
these formulas does not establish device measurement, full 3D dynamics or a
felt effect. The current on-device dynamics remain body x/y; visible pitch does
not add independent fore/aft collisions.

Stale telemetry retains the last device state and pose. An explicit return to
preview clears the state only after the existing Stop/disconnect path. Preset
requests and ACKs do not become visible applied configuration before reported
state; Start, pending work and reconnect policy remain in DeviceDemo/HapticLink.

One behavior fix accompanies the extraction: on a first connection, resolved
configuration can arrive before `mass`. Previously that sequence could leave
ContainerScene in local preview mode until motion arrived. DeviceDemo now
installs a zero-fill device state and holds it, then displays reported content
when it arrives. This placeholder is a source-selection safeguard, not an
observed empty-container reading or confirmation of physical output state.

Actual-browser review also found a pre-existing narrow-view framing problem:
at 390 x 844, tilted 60 mm liquid/sand boxes could clip the screen edges even
though the DOM had no horizontal overflow. `frameDesktopContainer` now fits an
orientation-independent container bound to the narrow field of view above the
HUD, using `ContainerScene.getSize()` for actual rendered dimensions. It changes
camera distance only when a narrow view needs more room; the established
desktop distance/offset and physical geometry stay unchanged. XR continues to
use its tracked camera.

## Resource ownership

Each material ingredient owns its group, geometry, instance buffers, materials
and textures. In particular, every liquid ingredient owns its normal texture;
preview animation in one scene cannot change the texture phase of a held
connected scene. ContainerScene owns its shell and its ingredients.

On preset/source rebuild, ContainerScene disposes the replaced ingredients and
shell resources. Grip pads survive these rebuilds. `dispose()` tears down
the entire container, disposes the grip once and detaches the group. Repeated
disposal is harmless; a disposed ContainerScene cannot receive another preset.

[disposeObjectTree](../../webxr/src/renderer/disposeObjectTree.ts) deduplicates
geometry/material/texture disposal within an exclusively owned subtree and
releases InstancedMesh resources. The grip's two pads share their resources
within their owner. Resources are not shared across independent container
instances. Do not attach borrowed materials/textures under this disposal owner.
If future work introduces shared GPU resources, introduce explicit ownership at
that point rather than silently disposing another scene's resources.

## Extension recipe

1. For another presentation mode, reuse ContainerScene and change its outer
   placement/camera. Feed it accepted state through the existing sink. Future
   Android tracking supplies placement; it must not become a second content
   simulator or command sender.
2. For a material improvement, edit the owning ingredient. Keep the connected
   method dependent only on accepted state and geometry. Put any purely visual
   preview integration in the preview method. Hybrid automatically receives
   the ingredient change. Preserve the single-marble reference.
3. For a new combined material, first compose the existing liquid/solid
   ingredients. Add a new ingredient only when it has different rendering or
   resource responsibilities. Keep construction, updates and disposal together.
4. For a new observed state field or actual haptic behavior, change the owning
   firmware/protocol and applied-state path separately. A renderer-only visual
   cannot claim a new device event, 3D axis or material model.
5. Extend the affected state/projection and scene tests, then typecheck/build.
   For appearance changes, inspect the actual rendered view; for changed felt
   behavior, use the relevant handling acceptance in [07](../07_TEST_AND_VALIDATION.md).

## Verification of this change

Run from `webxr/`:

```powershell
node --test test/*.test.mjs tests/*.test.mjs
npm.cmd run typecheck
npm.cmd run build
```

The 73 existing tests remain, with 14 added tests for the pure model contract,
material switching, accepted preview trajectories/marble assets, independent
scene textures, rebuild/teardown ownership and the real-ContainerScene
metadata-before-motion regression, plus desktop/narrow projected-camera bounds.
All 87 pass; typecheck and production build
pass. Vite still reports its existing large-bundle warning.

During extraction, 18 deterministic scene combinations (three families, three
preview shapes, both source modes) matched the original positions, rotations,
content vertices and particle matrices exactly. That extraction parity is historical; the subsequent visual pass intentionally
replaces old liquid trajectories and decorative material details. This parity check applies to the renderer formulas;
the metadata-before-motion fix intentionally changes that controller edge.

The automated unit checks use actual THREE geometry/matrices with a canvas
stub. A subsequent local Chrome/Playwright review rendered and inspected 16
WebGL screenshots at 1440 x 1000 and 390 x 844: bead/liquid/sand/hybrid local
previews and marble/liquid/sand/hybrid synthetic device states. The existing
single-marble appearance is connected/resolved-only; bead preview was not
treated as that reference.

After the narrow-framing fix, the projected container stays inside the viewport
above the HUD. There were no JavaScript errors, failed assets, context loss or
horizontal DOM overflow. A freshly rendered marble canvas remained identical
when the synthetic telemetry became stale and changed when new synthetic mass
position arrived. Actual renderer geometry/texture counts stayed stable over
12 material switches (three passes through four materials). Chrome reported
the existing `PCFSoftShadowMap` deprecation/fallback warning.

The temporary harness, screenshots, before-framing captures and JSON report
are local ignored files under `output/playwright/`. The harness intercepts the
HapticLink module in the browser and rejects every hardware operation; no
public test route was added. These are WebGL and synthetic-state checks, not
new hardware, USB, tactile or Android AR evidence. The visual pass below supersedes the floating-liquid limitation; granular
accumulation still needs a richer model.

## Desktop visual pass, 2026-09-06

- **Placement:** cache the vessel vertices, including cap/rims, and place its
  lowest rotated point 0.8 mm above the stage. The camera looks at a stable
  nominal anchor so it does not cancel container translation. Narrow framing
  reserves an extra 20% size margin. XR keeps tracked translation; this desktop
  placement is disabled while XR is presenting.
- **Acceleration cue:** take body acceleration minus the existing filtered
  gravity estimate once per accepted snapshot, rotate into world coordinates
  and use only the desktop x/z plane. A 0.025 g deadband, 18 mm/g display gain,
  and radial limit of min(10 mm, 18% of the shortest span) bound the cue.
  No velocity or position integration is performed. Follow moving input with
  a 0.12 s exponential time constant; quiet input recenters the positional
  offset with a weaker 0.8 s constant (~95% return after 2.4 s of quiet input).
  Use accepted device timestamps, including uint32 wrap, for elapsed time.
  Repeated timestamps do not advance recovery; the first sample, a device
  restart or a gap over 0.5 s takes one 0.1 s step without catching up offline
  time. Stale samples hold the view, including a partly returned offset.
  Pitch/roll continue following gravity, never the initial orientation: a
  deliberately held tilt must not be slowly cancelled. The estimate
  can mix rapid tilt with acceleration and depends on telemetry cadence: it is
  a tunable display cue, not measured translation or a new firmware parameter.
  Local preview instead derives a smaller bounded cue from preview velocity.
- **Liquid:** the inner cavity reserves 2% per side for walls/base. Box, 40-sided
  bottle body and tapered cup are clipped against the same surface plane;
  18 bisection steps retain fill fraction through sideways/inverted poses.
  Fixed GPU buffers are reused, unchanged plane/fill skips mesh uploads, and
  a held desktop device state skips pose/particle updates.
  The plane follows gravity plus bounded body-x/y mass/velocity bias; it is an
  illustrative response to aggregate state, not an exact reconstruction of FW
  center of mass or additional fore/aft content dynamics. Normal-map activity
  and phase also come from device state. Preview alone advances texture phase.
- **Appearance:** the old wood/grid/cables and large front label are removed.
  Vessel edges are beveled; bottle shoulder/neck/cap now fit their nominal
  height, cups have narrow rims, and a sparse stage provides spatial references.
  Environment reflections and finer shadow framing improve depth. Sand uses
  smaller faceted preview grains, coins use discs, beads have a smooth finish,
  and ice uses rounded blocks. Preview solids respect round inner walls and
  the local liquid plane; connected solids remain symmetric representative
  instances around the reported mass. No connected grain/ice integration was
  added. Marble position, radius, sphere tessellation, color and roughness stay
  unchanged; scene lighting around it is improved.

Bottle preview fill still refers to the body below the neck. Full cups retain
volume, with no spilling; particle packing, granular avalanches, independent
ice buoyancy and exact mixture reconstruction remain unimplemented. These are
explicit model limits, not physical validation results. No protocol or actuator
parameter changed. Validation and local browser evidence belong to [16](../16_PROGRESS_STATUS.md).
