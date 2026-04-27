# 15 Environment Bring-up Notes

This document records the environment-dependent issues discovered during the
single-amp bring-up on M5StickS3 so they do not get rediscovered later.

It is intentionally pragmatic.
Use it when the firmware builds but the bench behavior does not match expectations.

The current policy is:

- main firmware monitoring uses USB serial + SoftAP browser status
- on-device display work is probe-only
- panel instability should not block haptic tuning on the main path

## 1. Known-good external amp path

The verified single-amp reference path is:

- board: `M5StickS3`
- output API: `M5.Speaker`
- sample rate: `48 kHz`
- mono: `true`
- DMA block length: `240`
- pins:
  - `BCK = GPIO 7`
  - `WS = GPIO 5`
  - `DOUT = GPIO 43`
- `pin_mck = -1`
- `M5.Power.setExtOutput(true)`
- speaker volume: `255`

This exact path was confirmed working on hardware and is the reference for:

- `audio.demo_compat_mode`
- `m5stack-sticks3-audio-smoke`
- `m5stack-sticks3-transducer-probe`

The main `m5stack-sticks3-audio` env now also boots with this single-amp profile
through `HAPTICS_SINGLE_AMP_BENCH_DEFAULTS=1`, so live preset bring-up starts
from the same known-good route unless you explicitly switch back to `4ch`.
That env also raises `audio.output_gain` above the portable default so the live
pipeline is not much quieter than channel-test mode on a single MAX98357A bench.

On the same bench, liquid / granular / hybrid live presets needed a stronger
low-carrier balance in `WetBurst`, `DryRattle`, and `FlowRipple`. The original
mix looked active on telemetry but was much weaker than `Scrape` on the actual
transducer.

Later probe work also showed:

- `m5stack-sticks3-main-audio-probe` can boot stably, keep the display alive,
  and survive `BtnB` audio enable
- on the current single-MAX98357A bench, synthetic `hybrid` is only weakly
  perceptible and synthetic `liquid` / `granular` are much weaker

This means the display bring-up problem and the weak-vibration problem are now
separate issues. Once display stability is confirmed, further work should focus
on:

- stronger synthetic excitation for liquid / granular probe modes
- lower event thresholds or higher low-band emphasis in the liquid / granular
  path
- single-amp bench tuning of output gain and low-carrier balance

The current tuning direction is:

- `DropletCluster` and `ImpactCluster` now spawn a short companion `FlowRipple`
  body voice in the texture layer
- `WetBurst`, `DryRattle`, and `FlowRipple` now bias harder toward the low
  carrier in both texture and resonance shaping
- liquid presets now also use a lower droplet event threshold, longer wet-burst
  durations, and a slightly hotter default resonance gain than before

That keeps the architecture intact while making liquid and granular presets much
less likely to disappear on a single external transducer.

## 11. Strongest remaining display-instability suspect

After the probe ladder stabilized, the biggest remaining difference between the
stable probes and the occasionally blank main firmware was not the panel API.
It was the full main startup path that still runs:

- LittleFS mount attempts
- NVS / `Preferences` carrier restore
- recorder filesystem setup

The probe envs disable this path with `HAPTICS_DEBUG_DISABLE_STORAGE=1` and stay
stable. The main firmware still logs storage faults such as corrupted LittleFS
or missing NVS namespaces. That makes storage-backed startup the strongest
remaining firmware-side suspect when the display goes blank again.

For fast verification, compare:

- `m5stack-sticks3-audio`
- `m5stack-sticks3-audio-storageless`
- `m5stack-sticks3-audio-direct-display`

If only the storage-enabled env blanks, the root cause is no longer the display
renderer itself; it is the storage-backed startup path. If the storageless env
still blanks but the direct-display env is stable, the remaining culprit is the
main `DisplayDebugView` integration rather than board bring-up.

Important: `m5stack-sticks3-audio-direct-display` must bypass
`DisplayDebugView` completely, including the setup-time boot banner. If it still
calls `showBootBanner()` during setup, it is no longer a valid A/B for the main
display renderer.
While it is being used as a display probe, it should also draw unconditionally
instead of depending on the runtime `enable_debug_display` flag. Otherwise a
corrupted or unexpectedly cleared feature flag can look exactly like a panel
failure.

## 2. Correct reference project path

There were multiple local copies of the older demo.
The copy that actually matched the working hardware setup was:

- `C:\Users\tesul\Documents\PlatformIO\Projects\container_haptics_demo`

Do not assume a copy under `Downloads\...` is the active reference.
Verify the exact project path before diffing behavior.

## 3. Display bring-up is board-detection sensitive

The main firmware built and ran while serial worked, but the screen stayed dark
until the `M5.begin()` config was aligned with the known-good smoke test.

The stable display init used here is:

- `cfg.fallback_board = m5::board_t::board_M5StickS3`
- set `cfg.internal_imu = false` during `M5.begin()`
- draw a visible boot banner immediately
- then call `M5.Imu.begin(&M5.In_I2C, M5.getBoard())` after display bring-up
- `cfg.internal_rtc = false`
- `cfg.internal_mic = false`
- `cfg.output_power = false`
- `M5.Display.wakeup()`
- `M5.Display.setBrightness(255)`
- `M5.Display.setRotation(0)`

Important: the audio smoke test can disable IMU entirely because it is only a speaker bring-up tool.
The main haptics firmware must bring IMU back manually after the display is alive, or live motion-driven rendering will stay near zero while test mode still works.

If serial says `display: enabled` but the screen is still blank, check this path first.
For diagnostics, it also helped to hold the boot banner on screen for a few
seconds before starting periodic pipeline updates, so one-frame flashes could
be distinguished from total display failure.

The `m5stack-sticks3-display-probe` env is the next diagnostic step when the
main firmware still blanks the panel. If the probe shows all stages and runtime
status, the fault is no longer in display bring-up; it is in the main firmware's
debug rendering path. In that case, first fall back to a simple probe-style
text overlay before debugging richer layouts.

For the current main firmware, early boot also shows `MAIN BOOT` stage labels
(`M5.begin ok`, `IMU begin`, `EXT_5V on`, `pipeline begin`) before the regular
overlay. If the screen goes dark again, note the last stage that was visible.

When the full main firmware becomes ambiguous, do not keep patching it in place.
Use the dedicated probe ladder instead:

1. `m5stack-sticks3-main-boot-probe`
2. `m5stack-sticks3-main-pipeline-probe`
3. `m5stack-sticks3-main-loop-probe`
4. `m5stack-sticks3-main-audio-probe`

These probe envs intentionally disable storage-backed features and prefer direct
text display so that bring-up can be reasoned about one subsystem at a time.
`m5stack-sticks3-main-loop-probe` now also walks through `static -> redraw ->
update -> tick` automatically so display loss can be pinned to redraw cadence,
`M5.update()`, or `g_pipeline.tick()` instead of guessing.
`m5stack-sticks3-main-delta-probe` takes the next step and phases in the
main-only loop conditions on top of a stable ticking probe:

- `tick-only`
- `main-buttons`
- `poll-console`
- `verbose-serial`

If this probe blanks at a particular phase, treat the newly added main-loop
condition for that phase as the primary suspect rather than the panel API.
`m5stack-sticks3-main-audio-probe` now starts in a fully visible `idle` state
with audio still off. It only arms the synthetic audio path when `BtnB` is
pressed. If the screen is stable in `idle` and blanks only after `BtnB`,
the fault is in audio enable / backend startup rather than basic bring-up.

## 4. Serial monitor behavior is inconsistent across launch methods

PlatformIO task-based serial monitor sometimes opened correctly but did not
accept keyboard input reliably.

The more reliable fallback was:

- open a normal terminal
- run `platformio device monitor -p COM12 -b 115200`

If commands like `audio status` or `status` appear to do nothing, confirm
the problem is not just the monitor UI swallowing input.

On Windows, the PlatformIO CLI may also be available inside VS Code but missing
from a normal terminal `PATH`. If `platformio` is not recognized, try the
PlatformIO terminal first or call the user-local executable directly:

- `%USERPROFILE%\.platformio\penv\Scripts\platformio.exe run -e m5stack-sticks3`

For repeat validation outside VS Code, add
`%USERPROFILE%\.platformio\penv\Scripts` to the user `PATH` so the same
`platformio run -e <env>` commands used in the docs work everywhere.

## 5. USB CDC timing after upload is flaky

After flashing, serial sometimes produced:

- no immediate command response
- delayed boot log
- command responses only after reconnect or a short wait

Practical workaround:

- wait about `1 s`
- reopen the port if necessary
- resend the command once

This affected both `audio ...` and `display ...` bring-up commands.
On this StickS3 setup, opening the USB serial port with the wrong DTR/RTS state
can also reset the ESP32-S3 into ROM download mode (`waiting for download`),
which makes the screen look "dead" even though the flashed app is fine. The
base PlatformIO env now sets:

- `monitor_dtr = 0`
- `monitor_rts = 0`

to reduce accidental resets when attaching a serial monitor.

## 6. LittleFS / Preferences may start in a bad state

Observed boot logs included:

- `Mounting LittleFS failed`
- `Corrupted dir pair`
- `Preferences begin(): nvs_open failed: NOT_FOUND`

These did not block basic audio or display bring-up, but they do affect:

- recorder / replay
- preset filesystem overrides
- calibration persistence

Treat these as a separate storage issue, not as evidence that the audio path is broken.

## 7. PlatformIO on Windows may emit noisy cleanup errors

Builds succeeded while PlatformIO still printed cleanup failures such as:

- `Can not remove temporary directory .pio\\build`
- repeated `Please manually remove the file ...`

These were Windows filesystem cleanup problems, not compile failures.
Judge success by the environment result line, not by the cleanup noise alone.

## 8. Avoid blocked mirror dependencies during upload/debug

The environment included a blocked host:

- `sin1.contabostorage.com`

For repeat uploads during bench work, prefer:

- `platformio run -e <env> -t nobuild -t upload --upload-port COM12`
- direct `esptool` write from an already-built `.bin`

This avoids unnecessary package fetches and reduces the chance of unrelated network failures during bring-up.

## 9. Probe utilities are intentionally isolated

`audio_smoke_main.cpp`, `transducer_probe_main.cpp`, and `raw_i2s_probe_main.cpp`
must stay excluded from the baseline firmware build.

If `setup()` / `loop()` multiple-definition linker errors reappear, check
`platformio.ini -> build_src_filter` first.

## 10. Recommended bring-up order when hardware seems silent

1. Flash `m5stack-sticks3-audio-smoke`
2. Confirm the StickS3 screen is alive
3. Confirm the external amp path with mono `48 kHz` on `GPIO 7/5/43`
4. Move to `m5stack-sticks3-audio`
5. Send `audio diag on`
6. Send `audio on`
7. Use `audio test front|back`
8. Use the browser status page and serial snapshots as the normal main-firmware observability path

This order was the fastest reliable path during the current bring-up session.
