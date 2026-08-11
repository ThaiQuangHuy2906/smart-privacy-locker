# Phase 1 wiring diagram and power topology

**Candidate wiring only — it is not an as-built record.** Do not apply power
until the exact parts have passed the checks in
[../assembly-guide.md](../assembly-guide.md), the
[BOM acceptance list](../bom.md), and the
[power-budget worksheet](../power-budget.md).

## Safe baseline topology

```text
                    regulated SELV 5 V / 3 A supply
                                  |
                 switch + correctly sized branch protection
                                  |
             +--------------------+----------------------+
             |                    |                      |
        ESP32 VIN/5V          SG90 5 V branch       5 V load branch
             |                    |                +-----+-----+
        ESP32 3.3 V               |             WS2812   buzzer driver*
          +--+--+                 |                |
          |     |                 +----------------+---------- common GND
     DHT22 VCC  OLED VCC**                          |
          |     |                              ESP32 GND
          +-----+-----------------------------------+

ESP32 GPIO18 ----------------------------- SG90 signal

ESP32 GPIO25 --- 74AHCT125/74HCT14*** --- 330–470 Ω --- WS2812 DIN
                                                       |
                                            470–1000 µF capacitor
                                            across 5 V/GND at pixel

ESP32 GPIO4  ---------------- DHT22 data
                     |
              4.7–5.1 kΩ pull-up to 3.3 V
              (omit only when the module already has a verified 3.3 V pull-up)

ESP32 GPIO21 ---------------- OLED SDA (pull-up must terminate at 3.3 V)
ESP32 GPIO22 ---------------- OLED SCL (pull-up must terminate at 3.3 V)
ESP32 GPIO27 ---------------- MC-38 dry contact ---------------- GND
                              (Phase 2, firmware INPUT_PULLUP)
```

`*` Phase 3 buzzer wiring is specified separately in
[phase-3-buzzer-wiring.md](phase-3-buzzer-wiring.md). GPIO26 is a logic signal,
not a load supply.

`**` The project baseline is a display breakout explicitly compatible with
3.3 V supply and 3.3 V I2C. Some OLED boards connect SDA/SCL pull-ups to their
VCC pin. Do not power such a board at 5 V while connecting SDA/SCL directly to
the ESP32. If the exact board genuinely requires 5 V, use a suitable I2C level
shifter and verify both bus sides before connection.

`***` Treat a 5 V WS2812-family input as a level-shifted interface unless the
exact purchased part's datasheet explicitly guarantees 3.3 V logic at the
measured 5 V rail. The default build therefore includes a 5 V-powered
74AHCT125/74HCT14-class buffer. For 74AHCT125, tie the used channel's active-low
output-enable correctly; never leave an enable or input floating.

## Required electrical rules

1. ESP32 GPIO is 3.3 V logic. Never allow a DHT pull-up, OLED I2C pull-up, LED
   data return, or buzzer signal to drive an ESP32 pin above the limit in the
   ESP32 datasheet.
2. Servo, LED, and buzzer load current must never come from an ESP32 GPIO or
   the board's 3.3 V regulator. Use separate branches from the rated load rail.
3. All logic and load supplies must share a verified common ground before any
   GPIO signal is connected. Route servo/LED current away from sensor/I2C wires.
4. Put the WS2812 bulk capacitor at the first pixel, observe its polarity and
   voltage rating, and put the data resistor near the pixel input.
5. Do not connect the external 5 V rail and a normal USB power source at the
   same time unless the exact DevKit schematic/manual explicitly permits it.
   During externally powered testing, use an isolated/data-only USB path or the
   board-approved power arrangement to prevent back-feeding a computer port.
6. Verify polarity, continuity, exposed conductors, and branch protection with
   power disconnected. Stop immediately for heat, smell, rail collapse,
   brownout/reboot, servo binding, or unstable sensor values.
7. GPIO27/MC-38 LOW=CLOSED and GPIO26/buzzer active-high are still candidate
   mappings. P2-M01/P2-M02 and P3-M01–P3-M03 must establish the real polarity.

## Why the signal rails are constrained

- The ESP32 datasheet specifies 3.3 V operation and a GPIO input maximum tied
  to the chip supply; a 5 V pull-up is therefore not an acceptable direct GPIO
  interface. See the official
  [ESP32 Series Datasheet](https://documentation.espressif.com/esp32_datasheet_en.pdf).
- The official AM2302/DHT22 manual permits a 3.3 V supply for short wiring and
  describes the required external data pull-up. The project uses a 3.3 V
  pull-up so the data line remains ESP32-safe. See the
  [ASAIR AM2302 manual](https://www.aosong.com/uploadfiles/2025/04/20250417105409216.pdf).
- WS2812-family variants do not all share identical voltage/logic guarantees.
  Record the exact manufacturer and part marking, then retain or revise the
  buffer only from that primary datasheet. The manufacturer family index is
  [Worldsemi WS2812 family](https://world-semi.com/ws2812-family/).

## Hardware-final record

The 5 V / 3 A candidate supply is not proof of margin. Before accepting this
topology, complete `hardware/power-budget.md` with the exact board/module data,
then record P1-M03/P1-M06/P1-M07 measurements under idle, radio activity,
servo travel, LED load, and combined load. Update this file from **candidate**
to **as-built** only after the measurements and photos identify the actual
wiring revision.
