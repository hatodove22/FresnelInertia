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
- 4x haptic actuators (successor to Alps Alpine haptic reactor)
- Initial software backend target: **stereo I2S x2**
- Later backend option: **TDM x1**

### Future low-frequency force augmentation
- 2x XL330-M077-T
- one axis per finger (thumb / index)
- single shared DYNAMIXEL TTL multidrop bus

## 2. Experimental pin map (software assumption only)

### I2S bus A (Front / Back)
- BCK: GPIO 5
- WS: GPIO 7
- DOUT: GPIO 43

### I2S bus B (Top / Bottom)
- BCK: GPIO 4
- WS: GPIO 44
- DOUT: GPIO 2

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
- compile-time gate: `HAPTICS_ENABLE_AUDIO_BACKEND`
- recommended PlatformIO envs:
  - `m5stack-sticks3`: baseline build with backend compiled out
  - `m5stack-sticks3-audio`: backend compiled in for bench and actuator tests
- second target: TDM x1 because it gives cleaner synchronization and scaling

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
