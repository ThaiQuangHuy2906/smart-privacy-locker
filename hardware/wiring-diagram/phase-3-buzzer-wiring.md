# Phase 3 active-buzzer control

**Candidate only — physical verification is still P3-M01.** Disconnect power
before changing wiring. GPIO26 is a 3.3 V logic signal and must not directly
supply a buzzer whose current/voltage exceeds the board/module specification.
Use only the project's low-voltage supply; never connect this circuit to mains.

## Preferred control boundary

```text
ESP32 GPIO26 ── control input / suitable driver ── active-buzzer module
ESP32 GND    ───────────────── common ground ───── module/driver GND
Load rail    ───────────────────────────────────── module supply
```

- A module with a documented 3.3 V-compatible logic input can use GPIO26 as
  its input while the module receives power from its rated rail.
- A bare or higher-current buzzer requires a suitable transistor/MOSFET driver
  selected and checked by the lab supervisor; do not guess the part or omit
  required protection from the module datasheet.
- Set `SPL_BUZZER_ACTIVE_HIGH` in the ignored local `app_config.h` to the
  verified input polarity (`1` for active-high, `0` for active-low). The
  committed candidate is `1`; it is not a measurement. Firmware consumes the
  validated value as `RuntimeConfig::BUZZER_ACTIVE_HIGH`.
- The firmware writes the inactive latch before configuring GPIO26 as output.
  Confirm the real module remains silent through power-on and restart before
  running any longer scenario.

## Hardware-final record

Record the exact module, rated voltage/current, measured inactive/active logic,
driver used, common-ground check, boot result and tested firmware commit. Keep
P3-M01/P3-M11 pending until those measurements and the full-load run exist.
