# 04 Hardware and Pin Specification

This document separates the **primary as-built AtomS3 board** from retained
StickS3 development wiring. It records the software/hardware contract, but it
does not replace the EasyEDA Pro design or mechanical drawings.

## 1. Primary as-built platform

- M5AtomS3 / ESP32-S3
- custom `M5AtomS3_MAX98357A_4CH_TDM_DXL2` PCB
- MAX98357A x4 on one TDM data stream
- four wall-aligned haptic transducers
- XL330-M077-T x2 on one DYNAMIXEL Protocol 2.0 bus
- PlatformIO + Arduino framework

On `2026-08-22`, the dedicated TDM, DXL2, and combined probes passed with
unloaded actuators. The production `m5stack-atoms3-pipeline` image also built
successfully, but it has not yet been uploaded or validated as a live
four-layer pipeline. These are distinct levels of evidence.

## 2. As-built signal and power contract

### 2.1 Four-channel TDM audio

- BCLK: GPIO 5
- LRCLK / frame sync: GPIO 6
- DIN: GPIO 7
- frame rate: `48 kHz`
- sample width: `16-bit`
- framing: `PCM short`
- slots per frame: `8`
- BCLK: `6.144 MHz` (`48,000 x 16 x 8`)
- LRCLK pulse: one BCLK wide

The eight-slot frame is required even though only four amplifiers are fitted:

| TDM slot | Logical wall | PCB channel | Payload |
|---|---|---|---|
| 0 | Front | CH1 | active |
| 1 | Back | CH2 | active |
| 2 | Top | CH3 | active |
| 3 | Bottom | CH4 | active |
| 4..7 | none | none | digital zero |

The wall names are the canonical software order. The actual enclosure must be
labelled and mounted to preserve that mapping; mounting-orientation and
crosstalk calibration have not yet been completed.

### 2.2 DYNAMIXEL bus

- AtomS3 TX: GPIO 1
- AtomS3 RX: GPIO 2
- nominal as-built baud: `57,600 bps`
- expected units: XL330-M077-T, model 1190, IDs 1 and 2
- the PCB performs automatic half-duplex direction switching
- there is no firmware DIR/EN GPIO on this board

The dedicated probes have confirmed communication, ID provisioning, and small
unloaded position-mode moves. The retained StickS3 servo backend instead
expects a single DATA pin plus a DIR pin and is electrically incompatible with
this AtomS3 path. Consequently, the production AtomS3 environment currently
sets `HAPTICS_ENABLE_TILT_SERVO=0` until an RX/TX automatic-half-duplex adapter
with read-back safety is implemented.

### 2.3 Amplifier power and manual mute

- the final routed board does not populate a TCA9534 amplifier controller
- maintained switch S1 controls `AMP_OE_N` manually
  - S1 ON pulls `AMP_OE_N` low and enables the 74AHCT125 path (`RUN`)
  - S1 OFF lets R8 pull `AMP_OE_N` high (`hardware mute`)
- firmware cannot read or control S1
- `+5V_AUDIO`, the 74AHCT125, and the MAX98357A path require the board's
  12 V input; AtomS3 USB power alone does not power this path
- a digital-zero state is not proof that S1 is OFF, and S1 OFF is not a
  software-observable state

All wiring changes require S1 OFF and 12 V removed. A software mute is useful
for normal stopping but is not the emergency hardware isolation mechanism.

### 2.4 Power-integrity assumptions

- logic, haptic, and servo grounds must share a controlled common reference
- haptic and servo current return paths should remain low impedance
- budget for four simultaneous haptic bursts and both servo startup peaks
- final mounted tests must check 5 V rails, 12 V input, reset behavior, and
  conducted/mechanical coupling under the production workload

## 3. Production firmware profile

`m5stack-atoms3-pipeline` selects the as-built profile:

- audio backend and eight-slot TDM transport compiled in
- `48 kHz`, DMA length `240`, DMA count `12`
- `quad_wall_4ch`
- TDM driver retained while muted and filled with zeros
- haptic runtime output disarmed at boot; explicit `audio on` is required
- 300 ms without a valid finite IMU sample resets the pipeline to neutral and
  forces TDM zero; generic profiles leave this behavior disabled
- initial effective peak limit `0.08` (8% normalized PCM full scale)
- compile-time hard peak ceiling `0.15` (15% normalized PCM full scale)
- remote backend compiled out
- servo backend compiled out

The 8% value is the initial production-integration limit. The 15% cap follows
the unloaded short-burst evidence, not a continuous-wave or mounted-system
rating. Requests above 15% are clamped by the compiled backend.

See `23_ATOMS3_PRODUCTION_INTEGRATION.md` for the upload and acceptance gate.

## 4. Retained StickS3 development paths

These remain supported fallbacks; they are not the as-built PCB contract.

### Dual-I2S four-channel path

- compute: M5StickS3
- amplifiers: legacy MAX98360A / MAX98357A bench wiring
- I2S bus A: BCK GPIO 7, WS GPIO 5, DOUT GPIO 43
- I2S bus B: BCK GPIO 4, WS GPIO 44, DOUT GPIO 2
- bus A left/right = Front/Back
- bus B left/right = Top/Bottom
- wire format: Philips I2S through the legacy `driver/i2s.h` API

### Diagnostic and two-channel fallbacks

- `front_back_2ch` uses bus A only and collapses Top/Bottom energy into the
  Front/Back pair without changing the internal four-wall renderer
- `audio.demo_compat_mode` forces the known bus-A mono `48 kHz` profile with
  `dma_buf_len=240`
- `EXT_5V` software control applies only to wiring that actually routes that
  rail from the StickS3; it is disabled in the AtomS3 profile

## 5. Mechanical placement contract

The software assumes a wall-aligned layout in the order Front, Back, Top,
Bottom. This is intentional: the latent state and event layer describe wall
contacts rather than a tetrahedral field. The audio backend synthesizes
per-wall low/high carriers and noise and can replace the live frame with one
wall-only test stimulus.

For the tilt branch, one XL330 is reserved for the thumb plane and one for the
index plane. The final linkage must define home, sign, raw direction, allowed
travel, and an accessible mechanical stop before the production servo backend
can be enabled.

## 6. Evidence boundary

Implemented in source:

- dual-I2S and eight-slot TDM audio transports
- canonical four-wall mapping and two-channel fallback
- AtomS3 profile with silent boot, 8% initial limit, and 15% hard ceiling
- legacy StickS3 tilt model/backend behind compile/runtime gates

Passed on hardware on `2026-08-22`:

- raw AtomS3 TDM framing, channel isolation/order, and short unloaded bursts
- DXL IDs 1/2, model 1190, 57,600 bps, torque-off read-back, and bounded
  unloaded motion
- bounded simultaneous IMU + two-servo + equal 4CH burst probes at 8% and 15%

Not yet demonstrated:

- uploaded live `m5stack-atoms3-pipeline` output
- mounted four-layer spatial localization and material separation
- continuous-wave or long-duration mounted use at 15%
- production AtomS3 servo actuation, feedback telemetry, and fault handling
- quantitative amplitude matching, crosstalk, and resonance calibration

## 7. Hardware details still to publish or calibrate

- authoritative exported schematic/PCB/BOM/fabrication assets in `hardware/`
- connector and transducer part/footprint documentation
- final enclosure stack-up and wall labels
- measured power/current envelope under mounted four-channel + servo load
- per-wall response, polarity, gain, resonance, and crosstalk calibration
