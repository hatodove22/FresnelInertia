# 21 MAX98357A 4-Channel TDM Bring-Up

> Historical snapshot; not a current task list or instruction to repeat tests. Current scope, facts, and demo acceptance are in ../../08_IMPLEMENTATION_PLAN.md, ../../16_PROGRESS_STATUS.md, and ../../07_TEST_AND_VALIDATION.md.

> Status: COMPLETED PROBE EVIDENCE from `2026-08-22`. This is not the active
> roadmap. Continue current work from documents 08 and 24.

This procedure is for the as-built `M5AtomS3_MAX98357A_4CH_TDM_DXL2` PCB.
It validates the four amplifier channels independently before the full haptic
pipeline is connected to this transport.

## 1. As-built control and signal map

The EasyEDA Pro schematic and routed-board backup define:

- `GPIO5` = TDM BCLK
- `GPIO6` = TDM LRCLK / frame sync
- `GPIO7` = TDM DIN
- the final routed board has no TCA9534 amplifier controller
- maintained slide switch S1 controls `AMP_OE_N`:
  - S1 ON pulls `AMP_OE_N` low: the amplifier buffer is enabled (`RUN`)
  - S1 OFF lets R8 pull `AMP_OE_N` high: hardware mute
- S1 is not connected to the AtomS3 and cannot be read or controlled by firmware
- `+5V_AUDIO`, the 74AHCT125 buffer, and the MAX98357A amplifier path are
  powered from the 12 V input; USB power to the AtomS3 alone does not operate them
- amplifier slot map:
  - CH1 = slot 0
  - CH2 = slot 1
  - CH3 = slot 2
  - CH4 = slot 3

The firmware does not access the DYNAMIXEL bus. Existing XL330 units should
remain torque-off while this audio-only test is running.

## 2. TDM wire format

The probe uses:

- PCM-short frame sync
- `48 kHz` frame/sample rate
- `16-bit` samples
- `8 slots` per frame
- slots 0 through 3 for CH1 through CH4
- zero data in slots 4 through 7
- `6.144 MHz` BCLK (`48,000 x 16 x 8`)
- a one-BCLK-wide LRCLK pulse

The eight-slot frame is intentional even though the PCB has four amplifiers.
MAX98357A 16-bit TDM requires 128 BCLK periods per frame, which is eight
16-bit slots. Sending only four slots would produce 64 BCLK periods and is not
the device's specified TDM frame.

## 3. Probe firmware

Build environment:

```text
m5stack-atoms3-max98357a-tdm-probe
```

The implementation is compile-gated by
`HAPTICS_ATOMS3_TDM_PROBE_ENABLE`; its default is `0`, so the new source is
empty in existing firmware environments.

Safety behavior:

- boot starts TDM clocks and zero-filled DMA
- no nonzero sample is generated until an explicit `start`, `go`, or AtomS3
  button click
- one active channel receives a `180 Hz`, 2.5%-full-scale, ramped burst
- a single-channel test ends after `1.2 s`
- the four-channel sequence inserts a `500 ms` digitally silent gap
- `sweep` excites only the selected channel at `120`, `160`, `200`, `240`,
  `280`, and `320 Hz`, dwelling `1.5 s` at each frequency
- the sweep uses the same short ramped-burst envelope at 4.0% full scale and
  has its own `12 s` watchdog; the ordinary `start` and `go` tests remain 2.5%
- an `8 s` watchdog, `stop`, `mute`, or button hold returns to digital silence
- an I2S failure clears the DMA buffer and enters a digitally silent fault state
- only S1 OFF provides hardware mute; firmware cannot guarantee or verify it
- `level PCT` can change the `start`/`go` level only while idle; values outside
  `0.5..20.0%` are rejected and every reboot restores the conservative 2.5%
- MAX98357A gain is fixed at 12 dB in TDM mode. The 20% software ceiling keeps
  margin below the approximate 25%-digital full-output point, but it is not a
  transducer power-rating guarantee

Commands:

```text
status
ch 1
ch 2
ch 3
ch 4
start
go
sweep
level 0.5..20.0
stop
mute
help
```

`start` tests only the selected channel. `go` runs CH1 through CH4 in order.
`sweep` scans the selected channel and prints/displays every frequency step.
`level PCT` changes the ordinary `start`/`go` level without changing the fixed
4.0% sweep profile. Change the level only between runs and test upward one step
at a time.
A button click is equivalent to `start` for the selected channel; a button hold
requests an immediate digital stop. After any fault, turn S1 OFF and remove 12 V
before touching the output wiring.

## 4. First-power test order

1. Keep 12 V off and set the maintained amplifier switch S1 to OFF before
   connecting or moving a transducer.
2. Confirm the transducer is connected only between that channel's `SPK+` and
   `SPK-`. MAX98357A outputs are bridge-tied; neither speaker lead is ground.
3. For the first test, connect one unloaded transducer to CH1 only.
4. Upload the dedicated probe only after confirming the AtomS3 COM port.
5. With 12 V still off, require the display to show `4CH TDM`, `IDLE/SILENT`,
   and `amp SW: MANUAL`.
6. Run `status`. Require:
   - `i2s=1`
   - `digital_silence=1`
   - the write count continues increasing
   - `errors=0`
7. Before applying 12 V, measure the AtomS3-side silent bus when possible:
   - BCLK near `6.144 MHz`
   - LRCLK near `48 kHz`
   - LRCLK pulse one BCLK wide
8. With S1 OFF, apply 12 V. Confirm `+5V_AUDIO`, normal current draw, and no
   unexpected heating or sound while the firmware continues sending zeros.
9. Set S1 ON. Do not send `start` yet; verify there is still no output while the
   TDM data remains zero.
10. Run `ch 1`, then `start`. Expect only a short, low-level burst pattern for
   about `1.2 s`, followed automatically by `IDLE/SILENT`.
11. On unexpected sound, heating, reset, or current draw, first set S1 OFF,
   then remove 12 V. The `stop` command provides digital silence but is not a
   substitute for the hardware switch.
12. Move the same unloaded transducer to CH2, CH3, and CH4 only with S1 OFF and
    12 V removed, repeating `ch N` and `start` for each channel.
13. Connect all four transducers only after each independent path passes. Then
    use `go` to verify CH1 -> CH2 -> CH3 -> CH4 ordering.
14. For a qualitative resonance scan, select one representative channel with
    `ch N`, run `sweep`, and note the frequency region that feels strongest.
    Keep S1 accessible throughout the run and use S1 OFF for an immediate
    hardware stop. Do not interpret this qualitative scan as a calibrated
    resonance measurement.
15. For a representative-channel intensity test, keep `180 Hz`, begin at the
    known-good 2.5%, and increase with `level PCT` one step at a time. Run
    `start` after each change, inspect current/heat/noise, and obtain operator
    confirmation before proceeding. Never jump directly to the 20.0% hard limit.

## 5. Acceptance record

Record the following for each channel:

- expected slot responds and the other outputs remain quiet
- automatic return to digital silence occurs
- no boot pop or inter-channel pop is observed
- no amplifier or transducer heating is observed
- BCLK/LRCLK remain stable during silent and active periods
- S1 OFF produces hardware mute before power or wiring changes
- `sweep` reports each `120..320 Hz` comparison point, completes without I2S errors, and
  returns automatically to digital silence
- out-of-range `level` commands and level changes during active output are
  rejected; reset restores 2.5%

This probe validates transport and channel routing only. It does not establish
the final transducer drive level, resonance limits, enclosure loading, or
perceptual calibration.

## 6. Bench record: 2026-08-22

Test configuration:

- assembled custom PCB with AtomS3
- 12 V amplifier supply and manual S1 enable
- unloaded transducers
- probe waveform: `180 Hz`, 2.5% full scale, `50 ms / 300 ms` burst pattern

Results:

- CH1 / slot 0: vibration confirmed
- CH2 / slot 1: vibration confirmed
- CH3 / slot 2: vibration confirmed
- CH4 / slot 3: vibration confirmed
- two complete `CH1 -> CH2 -> CH3 -> CH4` sequence runs followed the expected
  physical order
- no obvious channel-to-channel strength difference was observed qualitatively
- no unexpected output was observed while S1 was enabled with zero TDM data
- no abnormal current, heating, reset, or other fault was observed
- firmware returned to `IDLE/SILENT` after every run and reported zero I2S errors
- the first CH1 qualitative sweep at 2.5%, `120..320 Hz` in `20 Hz` steps with
  `900 ms` dwell completed without errors, but no clear response difference was
  perceptible; the follow-up comparison profile was therefore slowed to six
  `40 Hz`-spaced points at 4.0%
- the follow-up CH1 comparison at 4.0% also completed without errors; no clear
  tactile strength difference was perceived among `120`, `160`, `200`, `240`,
  `280`, and `320 Hz` in the unloaded setup
- no resonance carrier is selected from this unloaded qualitative result;
  repeat the sweep after final mechanical mounting or use an accelerometer fixed
  to the transducer/container for quantitative identification
- CH1 intensity testing at `180 Hz` completed at 5%, 8%, 10%, 12%, 15%, 18%,
  and 20%, using the same `50 ms / 300 ms` burst pattern and `1.2 s` runs
- no abnormal heating, noise, output breakup, reset, or I2S error was observed
  through the 20% short-duration test
- approximately 15% was judged sufficient as a practical unloaded bench level;
  20% remains a short-duration validation ceiling, not a continuous-drive or
  mounted-system rating
- after the test, the runtime level was explicitly restored to the 2.5% default

This is an initial functional pass. Quantitative amplitude matching, crosstalk,
frequency response, and safe maximum drive remain separate validation tasks.

## 7. Primary references

- Analog Devices, [MAX98357A/MAX98357B data sheet](https://www.analog.com/media/en/technical-documentation/data-sheets/MAX98357A-MAX98357B.pdf)
- Espressif, [ESP32-S3 I2S peripheral documentation](https://docs.espressif.com/projects/esp-idf/en/stable/esp32s3/api-reference/peripherals/i2s.html)
