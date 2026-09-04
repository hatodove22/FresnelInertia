# 19 WebUSB Quest Probe

This document defines the temporary WebUSB probe page added under `webxr/`.

## 1. Purpose

The probe exists to answer one hardware/platform question before designing a
larger live transport:

- can Quest Browser expose an Atom S3 / ESP32-S3 USB device to a WebXR-hosted
  page through WebUSB or native Web Serial?

The page is intentionally separate from the visual WebXR demo. It does not
change firmware schemas, presets, telemetry, or the on-device haptic pipeline.

The later design discussion selected a StickS3-class USB-to-ESP-NOW Haptic
Link as the preferred portable-demo candidate, subject to this probe passing on
Android and Quest hardware. See `27_HAPTIC_LINK_DONGLE_CONCEPT.md` for the
agreed standalone-device behavior, property synchronization, and external VR
event scope.

## 2. Entry point

Local development:

```powershell
cd webxr
npm.cmd run dev
```

Open:

```text
https://<host>:8081/webusb.html
```

Quest tunnel:

```powershell
cd webxr
npm.cmd run quest
```

Open the printed tunnel URL and append:

```text
/webusb.html
```

The page is included in the production Vite build as a second HTML entry.

## 3. What the page checks

The first status strip reports:

- `window.isSecureContext`
- `navigator.xr`
- `navigator.usb`
- `navigator.serial`

The USB panel can:

- request an Espressif USB device using default vendor ID `0x303a`
- optionally request all visible USB devices
- show device/configuration/interface/endpoint descriptors
- claim a selected interface
- auto-fill bulk IN/OUT endpoints when present
- send a CDC-style DTR/RTS line-state request
- read once from an IN endpoint
- loop reads from an IN endpoint
- send text bytes to an OUT endpoint

The native serial panel can:

- request a native `navigator.serial` port when exposed
- open it at a selected baud rate
- send and log text bytes

Native Web Serial is expected to be less reliable on Quest than WebUSB. It is
included only as a feature probe.

## 4. Expected first hardware target

Start with an Atom S3 or other ESP32-S3 board connected by USB-C.

Recommended first firmware behavior:

- expose USB CDC echo at `115200`
- echo any received line
- periodically print a short status line

If CDC cannot be claimed from WebUSB, the stronger fallback is a custom TinyUSB
vendor-specific interface:

- interface class `0xff`
- one bulk IN endpoint
- one bulk OUT endpoint
- small framed binary or newline-delimited JSON payloads

That vendor-specific interface is more WebUSB-native than pretending every
browser exposes a serial port.

## 5. Validation notes

Record the following during Quest validation:

- Quest model and Horizon OS version
- Quest Browser version if visible
- whether `navigator.usb` is present
- whether `navigator.serial` is present
- whether the device appears in the chooser
- selected VID/PID
- interface class and endpoint layout
- whether `claimInterface()` succeeds
- whether CDC DTR/RTS succeeds
- whether IN and OUT transfers succeed
- whether the page still works after entering or leaving MR in the main demo

If WebUSB works, the next live transport should keep the first packet shape
small and state-oriented:

- sequence number
- timestamp
- mass position/velocity/energy
- last event type/wall/amplitude
- actuator summary
- optional control message

Do not send actuator waveforms through this transport.

## 6. Known constraints

- The page requires a secure origin, like the rest of the WebXR app.
- Android/Quest may show an additional OS-level USB permission prompt.
- WebUSB access can fail if the OS or browser has already claimed the target
  interface.
- Standard CDC serial may work through WebUSB on Android-class systems, but the
  safer long-term path is a vendor-specific bulk interface.
- This probe is not a server-side app. The only hosted artifact is static web
  content served by Vite preview, a tunnel, or a static host.
