# Development Setup

Use this reference when installing dependencies or building a changed target.
Current priorities and acceptance remain in [08](../08_IMPLEMENTATION_PLAN.md)
and [07](../07_TEST_AND_VALIDATION.md).

## Prerequisites

Git, PlatformIO Core (or the VS Code extension), its Python runtime, and
Node.js 22 for `webxr/`. Native C++ tests additionally need GCC/G++; lack of
that compiler is not a passing test. Firmware dependencies are pinned in
[platformio.ini](../../platformio.ini); browser dependencies use the lockfile.
The 2026-09-05 local client regression/build checkpoint used Node 24.15.0;
CI retains Node 22. No Unity Editor installation is required for ordinary
firmware/client development; the optional Wasm fallback below reuses one if present.

The current hardware is AtomS3 with the custom TDM4/DXL2 board, two XL330
servos and StampC5. StickS3 environments remain legacy/reference targets.

## Current firmware builds

Run from the repository root, sequentially:

```powershell
pio run -e m5stack-atoms3-pipeline
pio run -e m5stack-atoms3-pipeline-tilt-espnow-monitor
```

The first is the audio baseline; the second is the current integrated device.
Build only affected targets, adding the baseline for shared-code changes.

StampC5 uses pioarduino. It must use a separate package store because official
Espressif32 and pioarduino publish incompatible packages under shared names.
Use a short path, then restore the caller's environment:

```powershell
$fresnelPreviousCore = $env:PLATFORMIO_CORE_DIR
try {
  $env:PLATFORMIO_CORE_DIR = Join-Path ([Environment]::GetFolderPath("UserProfile")) ".pioarduino-pch"
  pio run -e m5stack-stampc5-espnow-bridge
  if ($LASTEXITCODE -ne 0) { throw "StampC5 build failed" }
} finally {
  if ($null -eq $fresnelPreviousCore) {
    Remove-Item Env:PLATFORMIO_CORE_DIR -ErrorAction SilentlyContinue
  } else {
    $env:PLATFORMIO_CORE_DIR = $fresnelPreviousCore
  }
}
```

The same isolated store is needed for later StampC5 upload commands.
Inspect current port identities; COM numbers in old logs are not permanent.
A successful build is not permission to upload or actuate unrelated hardware.

For a broad dependency/platform change, the existing
[build matrix](../../tools/build_firmware_matrix.ps1) runs retained targets
sequentially and isolates pioarduino:

```powershell
powershell -ExecutionPolicy Bypass -File .\tools\build_firmware_matrix.ps1
```

Do not run this entire matrix for routine demo edits. Do not repair a cache
conflict by deleting broad user package directories.

## Browser

```powershell
cd webxr
npm.cmd ci
npm.cmd run typecheck
npm.cmd run build
npm.cmd test
```

Use `npm.cmd run dev` for HTTPS development or `npm.cmd run quest` for the
existing temporary Quest tunnel. These start services; no service is needed
for documentation cleanup. Details are in [webxr README](../../webxr/README.md).

The visual application and its separate `/webusb.html` probe have different
roles. The preview build does not establish actual phone/Quest USB support.

## Focused checks

Choose checks according to the changed behavior:

```powershell
pio test -e native-layers
pio test -e native-synthesis-core
node test/schema/validate_schemas.mjs
node test/schema/validate_resolved_telemetry.mjs
node tools/lab/lab.mjs self-test
node --test test/lab/self_test.mjs
```

The lab tool is passive and optional unless its contract changed.

When a Unity Editor WebGL SDK is installed, the optional fallback can execute
the production C++ tests as WebAssembly under Node when GCC is unavailable.
The 2026-09-06 session used installed Strawberry GCC through PlatformIO native;
the Wasm SDK was absent on that host. Choose the available route:

```powershell
& .\tools\test_cpp_wasm.ps1
& .\tools\test_cpp_wasm.ps1 -Name coherent-container -TestSource test/coherent_container/test_main.cpp -Source @('src/MassMotionLayer.cpp','src/EventLayer.cpp','src/TextureLayer.cpp')
& .\tools\test_cpp_wasm.ps1 -Name coherent-tilt -TestSource test/coherent_tilt/test_main.cpp -Source @('src/TiltPseudoForceModel.cpp')
& .\tools\test_cpp_wasm.ps1 -Name coherent-spatial -TestSource test/coherent_spatial/test_main.cpp -Source @('src/TextureLayer.cpp','src/ResonanceLayer.cpp','src/SpatialRenderer4.cpp')
& .\tools\test_cpp_wasm.ps1 -Name espnow-resolved -TestSource test/espnow_resolved/test_main.cpp -Source @('src/EspNowTelemetryProtocol.cpp') -WithoutUnity
& .\tools\test_cpp_wasm.ps1 -Name tilt-runtime -TestSource test/tilt_runtime/test_main.cpp -Source @('src/TiltPlaneServoInterface.cpp') -IncludeDirectory @('test/tilt_runtime/stubs') -Define @('HAPTICS_ENABLE_TILT_SERVO=1','HAPTICS_ENABLE_ATOMS3_DXL2_BACKEND=1','HAPTICS_ATOMS3_CUSTOM_BOARD_PROFILE=1') -WithoutUnity
```

This reuses the SDK without installation/global configuration changes. Results
are C++/Wasm evidence, not native Windows execution or physical actuator tests.
The fake-UART suite in `test/tilt_runtime` tests the production backend with its
Arduino stub. `tools/bench_console.py` is an optional attended pyserial helper:
commands are explicit, log creation is exclusive, and `--final-command stop`
can request Stop when an observation exits. It cannot confirm physical Stop if
the device disconnects. It does not arm anything implicitly.

For documentation, inspect consistency/links and run `git diff --check`;
do not rebuild firmware to validate prose.

[CI](../../.github/workflows/ci.yml) covers a representative legacy/AtomS3
baseline subset, native/schema/lab tests and the visual build. It is not yet
the full integrated AtomS3+StampC5 hardware check. Use the affected target
builds above and the short attended rehearsal in 07 when relevant.

## Work and handoff

Follow [AGENTS.md](../../AGENTS.md) and
[CONTRIBUTING.md](../../CONTRIBUTING.md). Preserve unrelated local changes,
record a new fact once in [16](../16_PROGRESS_STATUS.md), and update the owning
contract. Historical bring-up documents are evidence, not current prerequisites.
