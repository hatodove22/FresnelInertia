# Fresnel Container Materials

Reusable small-container water, sand and elastic material for Unity 6's **Built-in
render pipeline**. Version 0.3.0 combines a connected water surface with refraction
and absorption, a continuous fine-sand bed, and a smooth elastic skin. Their
deformation follows source-driven simulation and accepted frame data. The package
has no additional package dependencies.
This is original [MIT-licensed source](LICENSE.md), with public research
references in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

The package is designed for a closed handheld container. It is not a general
replacement for the full Obi product suite, a validated CFD model, biological
tissue simulation, or an independently verified match to Obi's rendering quality.
The accompanying Fresnel demo is the reference integration and visual specimen.

## Install and try

Use Package Manager's **Install package from disk** and select this directory's
`package.json`, or extract this folder under your project's `Packages/` directory.
There are no native binaries, external services or paid dependencies.
The package declares Unity 6000.0 as its minimum version; the accompanying
Fresnel Studio project targets Unity 6000.3.23f1. Platform build and runtime
results are owned by the host project, not implied by the package manifest.

Choose **Fresnel Materials → Create standalone sample** and press Play. The
Editor creates `Assets/FresnelMaterialSample/ContainerMaterials.unity` and its
frame material. Select `Vessel (metres)` to change the material, fill, quality
and response in the Inspector. The sample uses a local clock and has no
hardware I/O. `ContainerMaterialSample.Animate` rotates the sample vessel;
hold **H** or enable its Inspector **Shake** field for a bounded 4.6 Hz
translation. Releasing it returns smoothly. `Animate`, actor pause and stale
state also hold the sample controller's phase and pose.
Disable that component as well as `AutoSimulate` before attaching your own source.
Use a Built-in project; the included shaders use a named GrabPass and have not
been ported to URP/HDRP. The component and numerical solver can be reused with a
different renderer.

For a reproducible Windows sample build, invoke your Editor with
`-batchmode -buildTarget Win64 -projectPath "<project>" -executeMethod Fresnel.Materials.Editor.MaterialSampleBuilder.BuildStandaloneSampleBatch -logFile "<build-log>"`.
Use this in an isolated sample project: it regenerates the sample scene and
sets Windows player defaults through Editor APIs. Success writes
`Builds/StandaloneSample/FresnelMaterialsSample.exe` and exits with code zero;
failures exit with code one. Distribute that complete output folder.

To integrate into your own scene, add **Fresnel → Container Material** to a vessel.
The component's origin is the centre of the rectangular internal volume, in
metres, with local Y upward. Keep uniform transform scale (preferably one).
`Size` describes the physical interior; visible enclosure geometry is optional.

## Two ways to provide motion

For an independent offline scene, enable `AutoSimulate`. Accepted transform motion
supplies local gravity, translational acceleration and angular velocity. `Paused` holds the material and actor
source time; it does not pause a separate controller that rotates the vessel.

For a source-owned application, keep `AutoSimulate` off and call `ApplyFrame`:

```csharp
using Fresnel.Materials;
using UnityEngine;

// Invoke on Unity's main thread. localGravityDown is a UNIT vector.
// sourceTime/sourceElapsed are seconds from the source, not the display clock.
actor.AutoSimulate = false;
actor.SetStale(false); // Only after the host has established that this source is fresh.
actor.ApplyFrame(new MaterialFrame {
    Time = sourceTime,
    DeltaTime = sourceElapsed,
    IsFresh = true,
    IsDevice = true,
    Size = new Vector3(.075f, .062f, .045f),
    Fill = .5f,
    Gravity = localGravityDown * 9.81f,
    Acceleration = localContainerAcceleration, // m/s², excludes gravity
    AngularVelocity = localContainerAngularVelocity, // radians/s
    MassPosition = acceptedNormalizedCenter,
    Velocity = acceptedNormalizedVelocity,
    Energy = acceptedEnergy,
    Contraction = acceptedContraction
});
// Call immediately when the source is lost; held geometry remains visible.
actor.SetStale(true);
```

Set `Rebase` when the source changes or resets. The component also detects time
rewinds and gaps over 0.5 seconds. It discards momentum rather than replaying
missed simulation. An unchanged configuration at a duplicate timestamp does
not advance motion; changing material, dimensions, fill or quality explicitly
reseeds it. Invalid numerical input and stale frames cannot advance motion.
Render materials contain no independent shader animation clock. Call
`ResetState()` before deliberately switching between local and remote clocks.
After `SetStale(true)`, fresh frames remain held until the host explicitly calls
`SetStale(false)`. `IsFresh` alone does not clear the actor's stale flag.

Each accepted update performs at most two local simulation substeps of at most
1/120 second, consuming at most 1/60 second of visual-detail time. Excess time
is skipped rather than accumulated for a later catch-up. Source timestamps
and accepted aggregate state still advance directly. Consequently, local
particle detail can evolve more slowly than the source on an overloaded frame;
`Simulation.LastConsumedDelta`, `Simulation.LastSkippedDelta` and cumulative
`Simulation.SkippedSeconds` expose this limit. These counters describe the
solver's input interval, after the actor's 0.1-second interval clamp; a clock
rebase discards missing time separately.

`IsDevice` enables aggregate-following constraints. The particles are visual
detail driven by accepted gravity, velocity, events and centre of mass. The
simulated particle centre may retain a residual due to enclosure bounds; inspect
`Simulation.AcceptedCenter` and `Simulation.AggregateError`. Do not interpret
individual particles, contacts or reconstructed surfaces as device measurements. Keep any
authoritative state indicator connected directly to the source. The package
never opens a port, issues actuator commands or generates hardware events.
Aggregate diagnostics become valid after the first positive-delta step; an
initial zero-delta rebase seeds the cloud before computing accepted-target
metadata.

## Material controls

| Control | Meaning |
|---|---|
| `Kind` | Water, Sand or Softbody |
| `Size`, `Fill` | Closed interior dimensions and requested fill; changes reseed material |
| `Quality` | Mobile, Balanced or High particle/reconstruction budgets; changes reseed |
| `PreferGpuWater` | Prefer smooth GPU water on a supported desktop; false forces the CPU surface; changes reseed |
| `Viscosity` | Normalized water velocity smoothing and drag; not a calibrated Pa·s value |
| `Friction` | Normalized granular contact friction and damping |
| `Softness` | Normalized bond compliance and shape-restoring strength |
| `MaterialFrame.Contraction` | Source-owned elastic contraction envelope, from zero to one |
| `AutoSimulate`, `Paused` | Explicit standalone clock and hold control |

`MaterialFrame.Size` and `Fill` are authoritative when calling `ApplyFrame`;
the actor's Inspector values supply them only in `AutoSimulate` mode. The
accepted dimension range is 0.0001–10 metres per axis, intended for small
vessels with sensible aspect ratios. Actor fill is clamped to [0, 1], where
zero produces no particles or surface. Direct users of `ContainerSimulation`
must supply a valid fill in [0, 1] to `Configure`.

| Frame field | Source contract |
|---|---|
| `Time`, `DeltaTime` | Source seconds; for normal progression the actor derives the interval from accepted timestamps |
| `Gravity` | Downward acceleration in local metres/second² |
| `Acceleration` | Container linear acceleration in local metres/second², gravity excluded; zero preserves the previous tilt-only input |
| `AngularVelocity` | Container angular velocity in local radians/second around its origin; accepted time differences supply the Euler term |
| `MassPosition`, `Velocity` | Accepted normalized body X/Y centre and normalized velocity per second, used with `IsDevice` |
| `Energy`, `Flow` | Accepted aggregate activity; these do not denote individual measured particles |
| `Slope` | Reserved aggregate input; currently has no direct solver effect |
| `NewEvents`, `EventAmplitude` | Accepted event cue count and amplitude; visual contacts are not sent back as source events |
| `Contraction` | Accepted zero-to-one elastic envelope; no biological measurement is inferred |
| `IsFresh`, `Rebase`, `IsDevice` | Freshness, clock/configuration reset and aggregate-following mode |

The solver applies gravity minus container acceleration, plus bounded Coriolis,
centrifugal and Euler forces in the rotating vessel. Zero acceleration and angular
velocity retain the earlier gravity-only behavior. All six walls remain closed.
Water uses positional density constraints with neighbour velocity smoothing.
Sand uses radius-aware sphere contacts and friction. Softbody uses compliant
distance bonds and rotational shape matching. Solver particles remain inside
the closed box. Numerical particles are simulation samples, not the visible
surface topology or a count of measured physical grains.

| Material | Current surface reconstruction |
|---|---|
| Water | A connected volume-corrected surface combines the hydrostatic/COM fit with four damped spatial modes driven by accepted acceleration, velocity changes and wall impacts. A bounded detail pool adds contained droplets and foam at energetic crests/contacts. GPU and CPU use the same wave state. |
| Sand | A continuous bed from supported particle mass. Unsupported particles contribute to a bounded batch of airborne grains at actual solver positions; their mass is removed from the bed until they regain support. Gravity selects eligible support walls; occupied mass and hysteresis resolve near-equal directions. |
| Softbody | A fixed closed skin bound to particle positions with smoothly tapered weights. A cloud-wide affine fit transports the skin offset through rotation and contraction; spatial filtering smooths local deformation while preserving that overall pose. |

Water resolves its displayed volume numerically against the box and requested
fill. Strong activity reduces the rigid COM-plane contribution to expose curved
crests, with source-driven white crest accents; calm behavior retains the full
fit. Steep sand columns are limited with fixed grid sweeps and a volume correction,
without changing numerical particle support. These choices make motion readable
and do not preserve an exact reconstructed-surface centre of mass.

The fitted volume and geometric centre are not independent measurements.
The surface has no breaking-wave sheets, overhangs or separate
pools. Contained droplets and foam are visual detail; they are not a second
mass-conserving fluid solver. Airborne sand is a representative sample of actual
unsupported particles; its visible grain volume is not an exact particle-volume
measurement. Switching between vessel-aligned support walls is an approximate deposit
representation. Softbody fill sets its seed shape rather than fluid occupancy,
and its fixed topology does not tear or split.

The box has six closed collision boundaries. Pouring, open-top escape, fluid
transfer between actors, arbitrary colliders, coupled PhysX rigid bodies,
cloth/rope systems and arbitrary input-mesh tetrahedralization are outside the
implemented interface.

## Performance and diagnostics

`PreferGpuWater` defaults to true. Water uses the GPU surface for Balanced/High
quality on a supported desktop when the smallest-to-largest dimension ratio
is at least 0.08. The support gate requires compute shaders, shader level 4.5,
3D textures and writable RGFloat textures on Direct3D 11/12, Metal or Vulkan.
It also checks the actual shader resources and texture allocation. These
capability checks do not establish runtime validation on every listed API;
the host project's results identify the platforms actually tested.

GPU water evaluates the connected free-surface fit over 48 × 48 columns in
Balanced and 64 × 64 in High, resolves its level against requested fill, and
writes an implicit field into a 3D texture. That texture has 64 samples along
the longest axis in Balanced and 80 in High; the other axes preserve approximately
uniform metric spacing. A box raymarch finds the surface intersection, refines
it, computes shared analytic surface normals and writes the hit depth. The second field channel
contains coherent mean activity, not a measured per-voxel velocity. The numerical
particle solver still runs on the CPU.

The field updates only when the actor accepts an explicit source update. Stale,
paused and duplicate frames do not dispatch reconstruction; the previous field
remains visible. Water modes and detail ages consume only
`Simulation.LastConsumedDelta`; sand reconstruction and soft skinning follow
accepted state. None has an independent animation clock. Direct users of `MaterialRenderer`
or `GpuWaterSurface` must apply their own freshness/hold checks: those lower-level
render methods intentionally reconstruct whenever called. The GPU compute and
raymarch resources exclude GLES, and the GPU path is disabled on mobile platforms. Mobile quality,
`PreferGpuWater = false`, unsupported graphics and very thin vessels select the
CPU fallback. Sand and softbody retain their CPU mesh renderers.

The CPU water fallback evaluates the same connected fit and extracts a dynamic
mesh with shared normals using marching tetrahedra. Its longest-axis extraction
grid budget is 22/28/40 for Mobile/Balanced/High. It requires no compute-shader
support. Sand and softbody use fixed mesh topology:

| Quality | Sand bed vertices | Elastic skin vertices |
|---|---:|---:|
| Mobile | 429 | 266 |
| Balanced | 829 | 614 |
| High | 1,357 | 1,106 |

The sand count includes the top, side walls and bottom. A change in its support
axis rebuilds its buffers. Where a partial bed exposes the floor, zero-thickness
cells are omitted and a matching bottom grid adds 289/625/1,089 vertices; the
ordinary closed bed retains the counts above. Both paths reuse allocated buffers.
Soft skin buffers and
adjacency are created during configuration and binding. A named background grab
is shared by water actors per camera. Mobile quality reduces numerical and
surface budgets; it does not promise a particular phone frame rate or identical
optical quality to the desktop raymarched surface.

Airborne sand adds at most 128/256/384 six-vertex samples for
Mobile/Balanced/High. Water detail uses a single combined mesh with at most
20/44/64 active droplets or foam parcels. Neither creates a GameObject per parcel.

`Renderer.DynamicEnergy`, `DetailParticleCount` and `DynamicStateHash` expose
water modes and detail state. The energy is a visual diagnostic, not joules.
`SandAirborneCount`, `SandVisibleAirborneCount`, `SandBedVolume`,
`SandAirborneVolume` and `SandGeometryFingerprint` distinguish unsupported
numerical particles, visible representatives and their allocated volume.
`Simulation.GetWallImpact(0..5)` reports the latest accepted step's contacts in
−X, +X, −Y, +Y, −Z, +Z order: impulse per unit content mass in m/s, a weighted
metric contact position and an inward normal. These diagnostics cannot generate
authoritative device events.

`SimulationMs`, `SurfaceMs`, `AppliedFrames`, `SourceTime` and
`Simulation.Metrics` expose measured work and source state. `SurfaceMs` measures
CPU reconstruction for the CPU backend, or CPU upload/dispatch overhead for the
GPU backend. It does **not** measure completed GPU compute or draw time.
`Renderer.ReconstructionFieldMs`, `MeshExtractionMs` and `MeshUploadMs` are
CPU-surface stage diagnostics, not GPU timers. Those counters cannot establish
actual GPU cost; use GPU profiling on the target platform. Report solver time,
surface CPU time, completed GPU time and frame-time distributions separately.

Check `Renderer.IsGpuWater` before interpreting `Renderer.SurfaceMesh`. On the
CPU backend it is the water surface, continuous sand bed or fixed elastic skin. On the
GPU backend it is only a box used to bound raymarching, explicitly named as a
proxy; its vertices do not describe the liquid shape. Empty input clears this
proxy and disables the draw. `Renderer.GpuWater.DensityTexture` is the actual
GPU implicit field (the property retains its original name), and `Revision`
increments on each explicit reconstruction dispatch.

For an explicit QA run, `Renderer.GpuWater.ValidateFieldForTesting()` performs
a blocking GPU readback. It reports finite implicit-field/activity validation,
minimum/maximum density, voxel count, occupied cells, revision and a hash of
both field channels. Non-empty inputs must produce occupied voxels; empty
inputs must produce none. Comparing the revision and actual field hash across
a hold verifies that the GPU field remained frozen. This hook is never called
by the renderer and should not run in a normal frame loop. A proxy-mesh bounds
check alone cannot validate the GPU fluid surface.

Numerical regressions are available through `SimulationRegression.Run()`, which returns
the assertion count or throws on failure. The integrated demo additionally
checks actual CPU meshes or GPU field readbacks, shaders, controls and source
hold/recovery, and reports frame distributions. Results are recorded by the
host project.

Destroying the actor releases its meshes, materials, compute buffers and render
textures. `SetVisible(false)` controls rendering and does not stop explicit
`ApplyFrame` calls; use `Paused`
or `SetStale(true)` when the simulation should hold. Keep calls on Unity's main
thread and provide one source per actor.

Water shading samples the scene's reflection probe/environment and uses named
GrabPass refraction. The generated sample and Fresnel Studio host supply a static
HDR studio cubemap; the shaders do not supply their own reflection environment.
Provide suitable reflection lighting when adding the actor to another scene.
The CPU shader estimates absorption distance through the vessel;
the GPU shader estimates it through the rendered connected volume. That field
chord is rendering information, not a physical thickness measurement.
The GPU shader supports ordinary orthographic/perspective camera rays with the
camera outside the vessel and uniform transform scale. Neither shader provides
arbitrary transparent-layer composition, caustics, a URP/HDRP port, or a validated
stereo/XR path. Assess the actual target camera and phone before selecting a
quality budget.
