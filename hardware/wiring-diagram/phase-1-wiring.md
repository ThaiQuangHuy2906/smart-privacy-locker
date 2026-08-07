# Phase 1 wiring diagram and power topology

**Do not power the build until the checks in [../assembly-guide.md](../assembly-guide.md) are complete.** The diagram is a candidate design pending as-built verification.

```text
                         +-----------------------------+
                         |  regulated 5 V / 3 A supply  |
                         +---+--------------+----------+
                             |              |
                    load +5V rail      ESP32 VIN/5V input
                             |              |
            +----------------+---------+    |
            |                |         |    |
         SG90 red       WS2812B +5V  OLED/DHT VCC*
         SG90 brown     WS2812B GND  OLED/DHT GND*
            |                |         |
            +----------------+---------+------------- common GND
                             |
                    ESP32 GND + all peripheral grounds

ESP32 GPIO18 --- SG90 orange signal
ESP32 GPIO25 --- 330–470 ohm --- WS2812B DIN
                                  |
                              470–1000 uF capacitor
                              across +5V/GND near strip
ESP32 GPIO4  --- DHT22 data (10 kΩ pull-up to module VCC if absent)
ESP32 GPIO21 --- OLED SDA
ESP32 GPIO22 --- OLED SCL
```

`*` Consult the exact OLED and DHT22 module marking before choosing 3.3 V or 5 V VCC. ESP32 GPIO signal levels remain 3.3 V. A level shifter for WS2812B is conditional: add a proper 3.3 V→5 V buffer only if a real test proves the first pixel data is unreliable. Do not add arbitrary components without documenting the result.

## Required electrical rules

1. Servo, LED strip, and future buzzer must **never** draw load current from an ESP32 GPIO or the 3.3 V regulator.
2. All supplies must share a common ground before a GPIO signal is connected.
3. Keep servo/LED load leads short and adequately sized. Route their high-current path separately from sensitive signal wiring where possible.
4. Place the WS2812B bulk capacitor at the strip input and series resistor in the data lead close to that input.
5. Check polarity, continuity, and exposed conductors before applying power. Disconnect power immediately for heat, smell, brownout/reboot, or unstable rail.
6. GPIO 26/buzzer and GPIO 27/MC-38 are shown only as reserved in `pin-map.md`; do not wire/enable them as proof of Phase 1 functionality.

## Preliminary budget—not measurement evidence

The 5 V/3 A supply is a project requirement, not a proof that any assembled unit is safe. A small SG90 can draw a high transient/stall current; a WS2812B can consume up to roughly 60 mA per pixel at full white before brightness limiting; board/module current varies. The committed brightness baseline is intentionally low, but only the measured real pixel count, voltage rail, and current determine safe operating margin. Record P1-M03/P1-M06/P1-M07 values before accepting this topology.
