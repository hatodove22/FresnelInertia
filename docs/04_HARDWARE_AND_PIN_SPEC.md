# 04 Hardware and Pin Specification

This document defines the **development hardware assumptions** for the software repository.
It is not a substitute for your final PCB design.

## 1. Development platform

### Compute
- M5StickS3 development board
- ESP32-S3 based
- PlatformIO + Arduino framework initially

### Audio / haptics experiment stack
- 4x MAX98360A digital-input Class-D amplifier
- alternate TDM bench target: 4x MAX98357A breakout amplifiers with per-board slot straps
- 4x haptic actuators (successor to Alps Alpine haptic reactor)
- Initial software backend target: **stereo I2S x2**
- Planned additive migration target: **TDM x1**

### Future low-frequency force augmentation
- 2x XL330-M077-T
- one axis per finger (thumb / index)
- single shared DYNAMIXEL TTL multidrop bus

## 2. Experimental pin map (software assumption only)

### I2S bus A (Front / Back)
- BCK: GPIO 7
- WS: GPIO 5
- DOUT: GPIO 43

### I2S bus B (Top / Bottom)
- BCK: GPIO 4
- WS: GPIO 44
- DOUT: GPIO 2

### Planned single-port TDM bring-up
- first TDM firmware bring-up should reuse bus A pins `BCK=7 / WS=5 / DOUT=43`
- only one ESP32-S3 I2S TX port should be active in this mode
- amplifier board slot selection remains a per-board hardware strap concern

### DYNAMIXEL bus (future)
- DATA: GPIO 1 (suggested)
- DIR/EN: GPIO 8 (suggested if a direction-controlled half-duplex buffer is used)

### Power control
- `EXT_5V` may be enabled from software when the external amplifier rail is powered from the StickS3 side.

## 3. Electrical design assumptions

### Grounding
- common digital ground between StickS3, amplifier boards, and servo bus interface
- keep haptic power return paths low impedance
- prefer star-like distribution over daisy-chained noisy grounds

### Power
- actuator rail and servo rail should be considered independently during hardware design
- reserve current headroom for 4 simultaneous haptic bursts
- reserve a separate budget for XL330 startup and dynamic load peaks

### Audio backend policy
- first target: stereo I2S x2 because it is easier to debug
- current implementation: legacy `driver/i2s.h` backend on `I2S_NUM_0` + `I2S_NUM_1`
- current wire format: `I2S_COMM_FORMAT_STAND_I2S` (Philips I2S timing)
- planned migration path: add a single-port TDM backend using the newer `esp_driver_i2s` / `driver/i2s_tdm.h` API without removing the current dual-I2S backend first
- planned first TDM profile: `48 kHz`, `16-bit`, `4 slots`, `PCM short`
- planned migration constraint: preserve the current compile gate, runtime enable behavior, `front_back_2ch`, and `audio.demo_compat_mode`
- diagnostic fallback: `audio.demo_compat_mode` forces a `bus A / mono / 48 kHz` profile for comparison against the known single-amp demo path
- current known-good single-amp bring-up path: `M5.Speaker`, mono `48 kHz`, `dma_buf_len = 240`, bus A pins `BCK=7 / WS=5 / DOUT=43`
- compile-time gate: `HAPTICS_ENABLE_AUDIO_BACKEND`
- recommended PlatformIO envs:
  - `m5stack-sticks3`: baseline build with backend compiled out
  - `m5stack-sticks3-audio`: backend compiled in for bench and actuator tests
- second target: TDM x1 because it gives cleaner synchronization, simpler wiring, and better scaling once the fallback paths remain intact

## 4. Mechanical placement assumptions

The software assumes a **wall-aligned 4-transducer layout**:
- Front
- Back
- Top
- Bottom

This is intentionally chosen instead of tetrahedral mapping because the latent model and event layer are wall-based.

## 4.1 Current backend channel pairing

- `I2S_NUM_0` left = Front
- `I2S_NUM_0` right = Back
- `I2S_NUM_1` left = Top
- `I2S_NUM_1` right = Bottom

The current backend synthesizes per-wall low/high resonance carriers plus noise and can override the live frame with a single-wall low-carrier test mode.

### 4.2 Planned TDM slot mapping

The planned single-port TDM backend keeps the same wall ordering:
- slot 0 = Front
- slot 1 = Back
- slot 2 = Top
- slot 3 = Bottom

For MAX98357A-based benches, the first TDM firmware target should assume:
- `PCM short` frame sync
- `48 kHz`
- `16-bit`
- four active slots only

This keeps the 4-wall renderer unchanged while moving only the physical transport layer.

### 4.3 Two-transducer fallback

The current firmware can also run in `front_back_2ch` mode:

- physical transducers only on Front / Back
- only I2S bus A is used
- Top / Bottom energy is collapsed into a common-mode contribution on the Front / Back pair

This is intended as a bring-up or simplified hardware option.
The internal renderer still remains 4-wall so the architecture does not fork.

## 5. Servo integration assumptions

The software assumes:
- one XL330 for thumb tilt plane
- one XL330 for index tilt plane
- safe home angle defined in parameters
- current-limited position control preferred

## 6. What is intentionally not fixed here

The following are left to the hardware design repository content you will add later:
- exact PCB topology
- connector choice
- exact transducer footprint
- exact amplifier power rail
- final pin escape strategy
- mechanical stack-up
