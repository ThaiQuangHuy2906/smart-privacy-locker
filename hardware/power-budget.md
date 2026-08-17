# Power budget and combined-load acceptance

**Status: unmeasured worksheet — not permission to energize the full build.**
Individual functions were reported working on 2026-08-17, but the jack,
distribution, switch and combined-load rails have not yet produced the required
measurements. The candidate architecture uses a regulated 5 V / 3 A SELV
supply for SG90 and WS2812B, while ESP32 remains on its separate USB supply.
The 5 V / 3 A rating is accepted only after the exact-part values and real
measurements below show adequate margin.

Use Gate H1 and Gate L in
[../HUONG_DAN_TEST_END_TO_END.md](../HUONG_DAN_TEST_END_TO_END.md) to collect the
measurements. The adapter does not require an integrated I/O button; a separate
rated DC switch in the positive lead is recommended, and the 5.5 × 2.5 mm jack
still needs polarity/terminal verification and proper distribution.

## Exact-part calculation

Copy values from the primary datasheet for the part actually received. Do not
use a marketplace title or a “typical” value from another clone.

| Load/branch | Qty. | Rail | Datasheet normal/max current | Datasheet transient/stall current | Simultaneous peak subtotal | Source/revision |
|---|---:|---:|---:|---:|---:|---|
| ESP32 DevKit including radio and 3.3 V peripherals | 1 | separate USB 5 V input | TBD | TBD | TBD | TBD |
| SG90-class servo | 1 | 5 V load | TBD | TBD stall | TBD | TBD |
| WS2812-family pixel(s) at configured brightness 32/255 | 10 | 5 V load | TBD | TBD | TBD | exact strip revision pending |
| TMB12A05 LOW-trigger buzzer module | 1 | ESP32 3.3 V rail (selected prototype wiring) | TBD | TBD | TBD | bench inactive HIGH silent; active current/sound pending |
| SSD1306 OLED | 1 | 3.3 V | TBD | TBD | TBD | TBD |
| DHT22/AM2302 | 1 | 3.3 V | TBD | TBD | TBD | TBD |
| Logic buffer if fitted, and other modules | TBD | 5 V/3.3 V | TBD | TBD | TBD | TBD |
| **Total** |  |  | **TBD** |  | **TBD** |  |

Project acceptance policy:

- continuous supply rating must be at least `1.25 ×` the calculated maximum
  continuous load;
- supply, connector, switch, protection and wire must also tolerate the
  calculated simultaneous peak without leaving any component's rated voltage
  range;
- a capacitor is not a substitute for an undersized supply, connector or wire;
- brightness limiting is a runtime safeguard, not a reason to omit the exact
  pixel-count/current calculation.

If the worksheet does not meet these rules, reduce the verified simultaneous
load or choose a higher-rated regulated low-voltage supply and distribution
path before wiring.

## Measurement sequence

Use the same release-candidate firmware and final wiring revision for all rows.
Measure at the load, not only at the supply connector. Never deliberately stall
the servo; an accidental/mechanical-limit test must be immediately stopped.

| Scenario | 5 V at supply | 5 V at servo/LED | 3.3 V rail | Total current | ESP32 reset/brownout | Heat/noise/behavior | Test ID/result |
|---|---:|---:|---:|---:|---|---|---|
| ESP32 idle, peripherals connected | TBD | TBD | TBD | TBD | TBD | TBD | P1-M03 |
| Wi-Fi + MQTT reconnect | TBD | TBD | TBD | TBD | TBD | TBD | P1-M03/P1-M09 |
| Servo no-load travel | TBD | TBD | TBD | TBD | TBD | TBD | P1-M01/P1-M03 |
| Servo installed door close/open (`170°`/`80°`) | TBD | TBD | TBD | TBD | TBD | TBD | P1-M02/P1-M03 |
| WS2812 configured maximum | TBD | TBD | TBD | TBD | TBD | TBD | P1-M07 |
| Buzzer active | TBD | TBD | TBD | TBD | TBD | TBD | P3-M01–M03 |
| Servo + LED + buzzer + radio combined | TBD | TBD | TBD | TBD | TBD | TBD | full-load final gate |

## Pass conditions

The combined-load gate passes only when all of the following are recorded:

1. every measured rail stays inside the operating range of every attached exact
   part during idle and combined peak activity;
2. no ESP32 brownout/reset, MQTT reconnect loop, OLED corruption, sensor error,
   LED flicker, servo chatter/binding, buzzer instability, connector heating or
   wire heating occurs;
3. common-ground voltage drop and signal behavior remain stable enough for
   repeatable ACK/state transitions;
4. branch protection and wire/connector ratings are documented and exceed the
   measured/calculated current with the chosen safety margin;
5. the final USB/external-power method cannot back-feed the host or regulator;
6. photos and readings are linked to P1-M01–P1-M03/P1-M06/P1-M07, P3-M01–P3-M03 and
   the full-load test without exposing secrets.

On any failure, power down, record the failing row and fix the root cause. Do
not convert the result to PASS by weakening the expected condition.
