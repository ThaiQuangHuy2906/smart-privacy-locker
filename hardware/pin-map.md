# Phase 3 candidate pin map

**Status: candidate configuration implemented in source; not hardware-locked.** The specific ESP32 DevKit V1 Type-C board, its printed labels, electrical logic, and boot behavior must be verified in P1-M01–M11 before this document can be called as-built.

| Function | GPIO | Firmware use in Phase 1 | Physical notes |
|---|---:|---|---|
| Servo SG90 signal (CB2) | 18 | active | GPIO signal only; SG90 5 V power comes from the load rail |
| DHT22 data (YC1) | 4 | active | use a 10 kΩ pull-up only if the module does not include one |
| WS2812B data (YC3) | 25 | active | install 330–470 Ω series resistor near the first pixel data input |
| OLED SDA (YC1) | 21 | active | proposed I2C default |
| OLED SCL (YC1) | 22 | active | proposed I2C default |
| MC-38 door sensor (CB1) | 27 | active in Phase 2 (`INPUT_PULLUP`) | candidate LOW=CLOSED mapping; verify reed polarity/placement in P2-M01/M02 |
| Active buzzer control (CB3) | 26 | active in Phase 3 | GPIO signal only; polarity is `BUZZER_ACTIVE_HIGH`; use a suitable driver when the real module exceeds GPIO limits |

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
| `BUZZER_ACTIVE_HIGH` | `true` | yes — verify the real module input polarity before enabling alarm tests |

`OLED_I2C_ADDRESS` is the firmware setting for the OLED address and defaults to `0x3C` in `firmware/include/app_config.example.h`. `runtime_config.h` selects a complete ignored `app_config.h` instead of the example; it does not merge a partial override. If the I2C scan finds another address, create the full local copy first:

```powershell
Copy-Item firmware\include\app_config.example.h firmware\include\app_config.h
```

Then edit `OLED_I2C_ADDRESS` directly in ignored `firmware/include/app_config.h`; for a `0x3D` module, set the copied constant to `0x3D`. Do not include the example and redeclare a constant. Record final non-secret values, meter readings, and evidence in the Phase 1 manual test record; do not claim values above are measured merely because they build.
