# Hardware BOM and purchase acceptance checklist

**Status: candidate procurement list — no item is accepted until its exact
marking and primary datasheet are recorded.** Quantities assume one locker and
one WS2812 pixel. Update the quantity and power worksheet if the physical model
uses a strip or additional indicators.

| Item | Qty. | Minimum acceptance evidence before purchase/use | Reject when |
|---|---:|---|---|
| ESP32 DevKit | 1 | ESP32 board supported by PlatformIO `esp32dev`; accessible GPIO4/18/21/22/25/26/27, 3.3 V and GND; exact board schematic or vendor pinout | board identity/pin labels are unknown, or the seller substitutes another MCU |
| Regulated SELV 5 V supply | 1 | rated at least 3 A; enclosed/certified low-voltage output; connector polarity documented; enough current after completing `power-budget.md` | bare mains wiring, unknown polarity, no current rating, or unstable output |
| Power switch, terminal/distribution and branch protection | 1 set | voltage/current rating exceeds the calculated load; connector and wire rating documented; fuse/polyfuse chosen for the real wire/load with supervisor approval | loose breadboard jumpers carry servo/LED supply current in the final build |
| SG90-class servo | 1 | exact operating-voltage and stall-current data; mechanical dimensions fit the latch; separate 5 V load branch | stall current is unknown or the linkage forces the horn against an end stop |
| DHT22/AM2302 | 1 | exact part supports 3.3 V operation; bare sensor or module pull-up is known and can terminate at 3.3 V | module data is hard-pulled to 5 V with no level translation |
| SSD1306 I2C OLED | 1 | exact breakout accepts 3.3 V supply/I2C, or a separately specified level shifter is included; address can be scanned | SDA/SCL are pulled to 5 V while connected directly to ESP32 |
| WS2812-family RGB pixel | 1 | exact manufacturer/part and supply/data thresholds recorded; pixel count known | listing says only “WS2812 compatible” and no electrical specification is available |
| 74AHCT125 or 74HCT14 logic buffer | 1 | genuine part rated for 5 V supply and a 3.3 V-high input; unused inputs and enable pins will be tied to defined levels | unknown logic family or a buffer whose input-high threshold is not met by 3.3 V |
| WS2812 data resistor | 1 | 330–470 Ω, suitable through-hole/SMD rating, fitted near first DIN | omitted or placed only at ESP32 end of a long data wire |
| WS2812 bulk capacitor | 1 | 470–1000 µF, polarity marked, voltage rating above the measured 5 V rail | reversed, damaged, or insufficient voltage rating |
| MC-38 dry-contact reed sensor | 1 | isolated dry contact; contact state can be measured with a meter; cable/connector suitable for the enclosure | powered/alarm-loop module is substituted without a compatible interface |
| Active buzzer module or buzzer + driver | 1 | exact voltage, current and active polarity; 3.3 V-compatible logic input or a calculated transistor/MOSFET driver | bare load current would pass through GPIO26, or polarity/current is unknown |
| Decoupling/bulk parts for servo branch | 1 set | values and placement selected from the exact servo/supply behavior and recorded in `power-budget.md`; polarity/rating verified | capacitors are added by guess or used to hide an undersized supply |
| Wiring, connectors, insulation and strain relief | 1 set | current rating and length suit each branch; color/polarity labels; no exposed conductor | Dupont jumpers are used as an unsupported permanent high-current connection |
| Digital multimeter | 1 | can measure continuity, DC voltage and branch current in the expected range; leads/fuse intact | current range or lead connection is unknown |

## Before ordering

1. Put the exact manufacturer/part number and a primary datasheet link beside
   every active component in the team's purchase record.
2. Copy every maximum/peak current into `power-budget.md`; calculate the
   simultaneous load before accepting the supply, protection and wire size.
3. Confirm the ESP32 board's USB/external-power arrangement. Buy an appropriate
   data-only/isolated USB solution if simultaneous serial monitoring is needed.
4. Confirm the enclosure has space for the buffer, branch distribution,
   protection, capacitors, connectors and strain relief—not only the visible
   sensors/servo.
5. Do not substitute parts silently. A substitution reopens pin, voltage,
   current, polarity, logic-threshold and mechanical checks.

## As-built record fields

After receiving parts, record: manufacturer; exact part/board revision; seller
or source; datasheet link; quantity; measured supply polarity; measured idle
and peak current; logic/pull-up voltage; firmware build/commit; wiring revision;
tester; date; and P1/P2/P3 manual test IDs. Keep credentials, tokens, personal
email and Wi-Fi passwords out of photos and logs.
