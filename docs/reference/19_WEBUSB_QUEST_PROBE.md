# Target-host USB Probe

Optional diagnostic reference, not a required bring-up sequence. The active
plan is [08](../08_IMPLEMENTATION_PLAN.md): Android is planned and VR/Quest
checks are deferred. [16](../16_PROGRESS_STATUS.md) records the desktop and
initial Quest connection evidence already available; do not repeat it just
because the probe exists.

First try the main app's Phone / Quest WebUSB connection. If it fails, use the
existing separate [webusb.html](../../webxr/webusb.html) page to answer
one question: can the intended phone or Quest exchange commands and state with
the actual StampC5 dongle? This is a short compatibility check, not a new
transport architecture project.

StampC5 USB-CDC already works with the desktop serial monitor and relays
bidirectional ESP-NOW. That does not establish phone/Quest interface access.
The current topology and ownership are in [05](../05_INTERFACE_SPEC.md).

## Open the probe

From the repository root:

```powershell
cd webxr
npm.cmd run dev
```

Open the printed HTTPS network URL with `/webusb.html`. For the existing
temporary Quest tunnel, use `npm.cmd run quest` instead and append the same
path to its printed URL. The main app already has a connected-device mode;
this separate page is for descriptor/claim/transfer diagnostics only.

USB selection must follow a user gesture in a secure context. Start from the
ordinary page before entering immersive MR. Close other serial clients that
may own the dongle interface.

## Existing probe capabilities

- Detect secure context, WebXR, WebUSB and native Web Serial.
- Request an Espressif USB device (default vendor 0x303a), or all devices.
- Show device/configuration/interface/endpoint descriptors.
- Select an interface and bulk IN/OUT endpoints; attempt interface claim.
- Send a CDC-style DTR/RTS request.
- Read once or continuously and send text bytes.
- Open a native serial port when that browser exposes the API.

These are capabilities of the probe UI, not evidence that a particular host
permits each operation.

## Short check on the actual target

1. Connect StampC5 with a data-capable cable/adapter. Record the host/browser
   and the dongle's observed VID/PID, interface and endpoints.
2. Select/claim the interface and establish bidirectional USB traffic. Start
   with `status\n`, which only inspects the bridge.
3. With AtomS3's link already locally enabled, send `get state\n`. Observe
   execution ACK and advancing telemetry. Do not arm output for a USB test.
4. Disconnect/reconnect once and retrieve current state again.
5. For a Quest MR claim, also check transfers around entering/leaving MR.
   The final connected application rehearsal remains in
   [07](../07_TEST_AND_VALIDATION.md).

Record a concise pass or the exact failed step in [16](../16_PROGRESS_STATUS.md).
Testing one host establishes that host only; neither the chooser nor a
successful interface claim alone proves reads/writes.

## If the interface cannot be used

Capture the descriptor/claim/transfer failure, then resolve that specific
constraint in the existing client path. Do not assume that the
StampC5's USB implementation supports arbitrary TinyUSB vendor interfaces.
A different dongle/interface or native-host path may be necessary, but choose
it only after the observed failure justifies it.

Keep the existing text-command/NDJSON and ESP-NOW contracts when possible.
No echo firmware, new radio format, waveforms, cloud service or external-event
engine is required simply to check the current dongle.

Historical platform links and related demonstrations are catalogued in
[references](10_REFERENCES.md). They are leads, not project-specific proof.
