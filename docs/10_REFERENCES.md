# 10 References

## Core device / platform references

- M5StickS3 product and pin-map documentation:
  `https://docs.m5stack.com/en/core/StickS3`
- ESP32-S3 I2S peripheral documentation
- ESP32-S3 USB Device Stack and TinyUSB vendor/composite support:
  `https://docs.espressif.com/projects/esp-idf/en/latest/esp32s3/api-reference/peripherals/usb_device.html`
- MAX98360A datasheet
- XL330-M077-T e-manual

## WebUSB / Quest transport references

- RadioField Web, a developer-reported Quest 3 / Meta Quest Browser WebXR MR
  application tested with OTG-connected RTL-SDR, HackRF, and tinySA Ultra over
  WebUSB / Web Serial:
  `https://manahiyo.itch.io/radiofield-web`
- MDN Browser Compatibility Data for WebUSB, including the Quest Browser
  (`oculus`) Chrome-Android mirror entry:
  `https://github.com/mdn/browser-compat-data/blob/main/api/USB.json`
- Chrome WebUSB platform-specific notes for Android:
  `https://developer.chrome.com/docs/capabilities/build-for-webusb`
- Chrome WebUSB secure-context and user-gesture requirements:
  `https://developer.chrome.com/docs/capabilities/usb`

## Research references informing the architecture

- DualVib: pseudo-force + texture decomposition for dynamic mass rendering
- Vibr-eau: liquid rendering with multi-point vibrotactile actuation
- STK / PhISEM / Shakers family references
- Apparent tactile motion references for SOA-driven wall-flow rendering
- Sloshing / Housner-style equivalent model references

## How these references are used in this repository

- platform and electrical constraints -> device references
- shared 4-layer architecture -> DualVib + event-synthesis literature
- wall-based multi-point liquid cues -> Vibr-eau
- clustered impacts and shaker families -> STK / PhISEM lineage
- adjacent-channel timing design -> apparent tactile motion literature
