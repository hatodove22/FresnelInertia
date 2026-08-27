This directory is the explicitly selected PlatformIO suite. It contains the
production-layer test fixture and the hand-reviewed legacy fingerprint; normal
test execution never rewrites either file.

Run it from the repository root with:

```text
pio test -e native-layers
```

The first reviewed capture was produced with PlatformIO Core 6.1.19,
`platformio/native` 1.2.1, MinGW-w64 GCC 13.2.0, and Unity 2.6.1. The platform
and Unity versions are pinned in `platformio.ini`; floating-point fingerprint
fields use an explicit tolerance for cross-host compiler variation. Verbose
test output also prints the compiler version used for the run.

The fingerprint stores exact discrete totals and a per-frame discrete timeline
hash, plus tolerance-bounded checkpoints, sums, peaks, time-weighted sums, and
squared sums. This catches shifted event timing and broad output-shape changes
without requiring bit-exact floating-point results.

Updating the fingerprint is deliberately a manual review operation. Confirm
the production algorithm change first, inspect every discrete count and float
field, then edit `legacy_fingerprint.hpp` in the same focused change. Do not
derive expected values inside `test_main.cpp` or add a write/update mode to the
normal test executable.
