# Phase 3 pin map

**Status: implemented in source; buzzer inactive path partially verified on
2026-08-15, full integrated hardware remains unlocked.** The ESP32 was detected
as a CH340 device on COM4, but every final GPIO, rail and combined-load behavior
must still pass its manual gate before this document is called as-built.

| Function | GPIO | Firmware use in Phase 1 | Physical notes |
|---|---:|---|---|
| Servo SG90 signal (CB2) | 18 | active | GPIO signal only; SG90 5 V power comes from the load rail |
| DHT22 data (YC1) | 4 | active | power the candidate sensor at 3.3 V; use a 4.7–5.1 kΩ pull-up to 3.3 V if the module lacks one; never pull this GPIO to 5 V |
| WS2812B data (YC3) | 25 | active | robust path uses a 5 V-powered 74AHCT125 channel, or two cascaded 74HCT14 inverter gates, then 330–470 Ω near DIN; conditional Direct-D bypasses `SN74HC125N` and connects GPIO25 through the resistor only after exact-part/physical gates |
| OLED SDA (YC1) | 21 | active | proposed I2C default; every pull-up visible to this pin must terminate at 3.3 V |
| OLED SCL (YC1) | 22 | active | proposed I2C default; every pull-up visible to this pin must terminate at 3.3 V |
| MC-38 door sensor (CB1) | 27 | active in Phase 2 (`INPUT_PULLUP`) | candidate LOW=CLOSED mapping; verify reed polarity/placement in P2-M01/M02 |
| Active buzzer control (CB3) | 26 | active in Phase 3 | LOW-trigger module: `IN/S/I/O` through series 4.7 kΩ; module `VCC` from ESP32 `3V3`, `GND` common; public baseline `SPL_BUZZER_ACTIVE_HIGH=0`. Never connect this specimen's VCC to 5 V in the direct wiring |

GPIO 0, 2, 12, and 15 are not allocated by this plan because they can affect ESP32 boot strapping. GPIO 34–39 are input-only and are likewise not used for a driven peripheral. Do not assume a board clone labels every pin identically: verify the actual board label, serial upload, and voltage before connecting a load.

## Firmware calibration values

The public baseline in `firmware/include/app_config.example.h` is:

| Setting | Baseline | Must be verified physically |
|---|---:|---|
| `LOCK_ANGLE` | 15° | yes — no-load first, then actual latch |
| `UNLOCK_ANGLE` | 95° | yes — no-load first, then actual latch |
| `SERVO_SETTLE_MS` | 550 ms | yes — enough travel without stall |
| `WS2812_PIXEL_COUNT` | 1 | yes — count real pixels |
| `WS2812_BRIGHTNESS` | 32/255 | yes — actual rail/current/visibility |
| OLED I2C address | `0x3C` | yes — scan/confirm module address |
| `SPL_BUZZER_ACTIVE_HIGH` | public example and runtime fallback `0` | active-low baseline matches the LOW-trigger specimen; LOW-at-3V3, GPIO26 boot and full-load still require final verification |

`OLED_I2C_ADDRESS` is the firmware setting for the OLED address and defaults to `0x3C` in `firmware/include/app_config.example.h`. `runtime_config.h` selects a complete ignored `app_config.h` instead of the example; it does not merge a partial override. If the I2C scan finds another address, create the full local copy first:

```powershell
Copy-Item firmware\include\app_config.example.h firmware\include\app_config.h
```

Then edit `OLED_I2C_ADDRESS` directly in ignored `firmware/include/app_config.h`; for a `0x3D` module, set the copied constant to `0x3D`. Do not include the example and redeclare a constant. Record final non-secret values, meter readings, and evidence in the Phase 1 manual test record; do not claim values above are measured merely because they build.

For this buzzer specimen, the tracked example and `runtime_config.h` fallback
both set `#define SPL_BUZZER_ACTIVE_HIGH 0`; `runtime_config.h` exposes it as
`RuntimeConfig::BUZZER_ACTIVE_HIGH`. A legacy Phase 1/2 local copy without the
macro therefore receives value `0`. If a local copy explicitly overrides it,
keep that override at `0` for this module. The isolated diagnostic used GPIO18
only temporarily; the project must use GPIO26 because GPIO18 drives the servo.
