# 27 Haptic Link Dongle Concept

Status: design note; not implemented or hardware-validated

Decision context recorded: 2026-09-04

## 1. Goal

The haptic device remains a standalone product. It senses physical motion with
its own IMU and runs the four-layer haptic pipeline locally without requiring a
phone, HMD, network, or host application.

An optional external client adds two capabilities:

1. select a preset and apply a small set of property overrides, and
2. show a synchronized visual container/content representation and inject
   transient experience events such as virtual-environment collisions or a
   cracker effect.

The intended demo client is either an Android phone or a Meta Quest headset.
Only one client is expected to be active at a time. Multi-client arbitration,
accounts, cloud coordination, and a PC session hub are out of scope for the
research prototype.

## 2. Preferred demo topology

The preferred transport candidate is a small USB-to-radio adapter provisionally
called **Haptic Link**:

```text
Android Chrome or Meta Quest Browser / Quest application
                         |
               WebUSB or native USB
                         |
                  StickS3 dongle
                         |
                       ESP-NOW
                         |
             standalone AtomS3 haptic device
```

The USB cable powers and connects the dongle to the Android phone or Quest. The
dongle then relays state-oriented commands and telemetry over a short-range
ESP32 radio link. ESP-NOW is the current preferred radio candidate because it
avoids access-point selection and venue Wi-Fi setup, but it is not yet a frozen
implementation choice.

StickS3 is the preferred first prototype because it combines ESP32-S3 native
USB, 2.4 GHz radio, a small status display, buttons, and a battery in a compact
unit. A later dedicated adapter may remove the display or use a smaller board
without changing the host protocol.

The dongle is optional. Disconnecting it must not stop the ordinary standalone
material rendering path.

## 3. Client behavior

The existing `webxr/` application remains the common visual client candidate:

- Android uses the normal browser/AR presentation.
- Quest uses the WebXR MR presentation.
- both use the same `HapticLink` application-facing interface.
- `WebUsbHapticLink` is the preferred first adapter.
- a native Quest USB adapter remains a fallback only if Quest Browser cannot
  reliably complete the WebUSB transfer path.

The expected demo flow is:

1. connect the StickS3 dongle with a data-capable USB-C/OTG connection,
2. open the HTTPS-hosted visual client,
3. press `Connect Haptic Device` and select the dongle,
4. read the current profile from the haptic device,
5. enter phone AR or Quest MR,
6. change presets/properties or trigger virtual events.

WebUSB device selection should occur from the ordinary 2D page before entering
immersive MR. WebUSB requires a secure context and the device chooser must be
opened from a user gesture.

## 4. State ownership and synchronization

The haptic device owns the applied state. The client sends intent; the device
returns the resolved state that the visual client displays.

The external control model is:

```text
profile = preset + overrides
```

Initial preset/override scope:

- material/content family or named preset
- fill or amount
- viscosity
- particle count and hardness where applicable
- container width, height, and depth
- a small number of perceptual gain/damping controls used by the demo

On initial connection and reconnection, the client requests the current state
rather than assuming its browser-local selection is authoritative. After a
property change, the applied state is echoed back to the client so the visual
container and haptic behavior use the same resolved values.

Continuous HMD pose streaming is not required for the baseline experience. The
physical device's IMU continues to drive mass motion. Low-rate mass state and
event telemetry may be used to animate or correct the visual contents.

## 5. First protocol surface

The first prototype needs only a small transport-independent message set:

- `hello`
- `get_state`
- `load_preset`
- `set_param`
- `trigger_event`
- `state_update`

The existing control and telemetry JSON schemas remain the semantic starting
point. USB framing may initially be newline-delimited JSON. A compact binary
encoding can be added later without changing the application-facing commands.

A small sequence number is useful for correlating replies and diagnosing radio
loss. The research prototype does not require user accounts, leases, or
multi-client ownership negotiation.

## 6. VR-originated haptic events

VR events enter the existing event/resonance/spatial pipeline rather than
streaming actuator samples over USB.

Two initial event families are planned:

### Virtual-environment collision

The client sends a one-shot event containing:

- event kind
- intensity or relative impact speed
- contact position or wall direction in container-local coordinates
- optional duration/hardness hint

Container-local coordinates avoid coupling firmware to the Quest tracking
origin. The device maps the event through the normal four-wall spatial renderer.

### Cracker effect

The client sends an effect trigger and intensity. The device generates the
short multi-part effect locally, for example an initial snap followed by sparse
crackle events and a short resonance tail. This avoids transporting a waveform
and keeps the audiovisual trigger small.

Additional external-event families can use the same `trigger_event` route.

## 7. USB interface candidate

The first hardware check may use the StickS3's existing USB CDC exposure, but
the preferred browser-facing interface is a TinyUSB vendor-specific interface:

- interface class `0xff`
- one bulk IN endpoint
- one bulk OUT endpoint
- optional CDC interface in a composite configuration for development logs

ESP32-S3 supports vendor-specific and composite USB devices. A vendor-specific
bulk interface also avoids relying on native Web Serial exposure in Quest
Browser.

The existing `webxr/webusb.html` probe already checks secure context, WebXR,
WebUSB, Web Serial, USB descriptors, interface claim, and bulk IN/OUT transfers.
It should be used before integrating `WebUsbHapticLink` into the main client.

## 8. External evidence as of 2026-09-04

There is a close public precedent rather than only browser compatibility data:

- **RadioField Web** reports a tested Meta Quest 3 / Meta Quest Browser setup
  using an OTG-connected RTL-SDR, HackRF, and tinySA Ultra from the same WebXR
  MR application through WebUSB / Web Serial:
  `https://manahiyo.itch.io/radiofield-web`
- MDN Browser Compatibility Data lists the Quest Browser (`oculus`) WebUSB
  implementation as mirroring Chrome Android. MDN also notes that public Quest
  version information is sparse, so this is supporting evidence rather than a
  substitute for a project-specific hardware test:
  `https://github.com/mdn/browser-compat-data/blob/main/api/USB.json`
- Chrome documents WebUSB device selection and permission behavior on Android:
  `https://developer.chrome.com/docs/capabilities/build-for-webusb`
- Chrome documents the HTTPS and user-gesture requirements:
  `https://developer.chrome.com/docs/capabilities/usb`
- M5Stack documents StickS3 as an ESP32-S3 device with USB OTG and 2.4 GHz
  wireless support:
  `https://docs.m5stack.com/en/core/StickS3`
- Espressif documents ESP32-S3 TinyUSB vendor-specific and composite device
  support:
  `https://docs.espressif.com/projects/esp-idf/en/latest/esp32s3/api-reference/peripherals/usb_device.html`

RadioField Web is a developer-published field report, not an official Meta
compatibility guarantee. It is nevertheless unusually close to this project's
intended simultaneous WebXR-plus-USB use case.

## 9. Minimum proof sequence

This concept becomes an implementation candidate only after the following
short proof:

1. Open `webusb.html` over HTTPS on an Android phone and Quest 3.
2. Record phone/Quest model, OS/browser version, `navigator.usb`, chooser,
   interface claim, and bulk transfer results.
3. Exchange an echo/status packet with StickS3 on both clients.
4. Confirm that the connection remains usable before, during, and after an
   immersive WebXR session.
5. Relay the same packet through StickS3 to AtomS3 over ESP-NOW.
6. Demonstrate `get_state`, `load_preset`, and one `set_param` command.
7. Demonstrate one localized collision and one cracker trigger while the visual
   event is shown.

This work belongs to Gate 11, after the standalone haptic path is stable. The
document records the intended application/transport direction but does not
move it ahead of the current firmware and hardware validation gates.
