# Phase 1 assembly and safety guide

## Before wiring

1. Confirm the actual board is compatible with PlatformIO `esp32dev`, identify its USB serial port, and verify its printed GPIO labels.
2. With power disconnected, mark the 5 V and ground buses. Verify the supply polarity with a meter.
3. Wire **all grounds first**. Do not connect the SG90 5 V lead to ESP32 3.3 V or a GPIO.
4. Add strain relief and insulation so no wire can touch the enclosure, latch, or stored object. Keep an accessible power-off path.
5. Keep the servo mechanically unloaded for initial angle calibration. Set the candidate angles only after confirming the latch has physical stops and the servo will not stall at either end.

## Safe incremental bring-up

1. Power the ESP32 alone and confirm serial upload/boot.
2. Add OLED; confirm the I2C address and boot message. The committed default is `AppConfig::OLED_I2C_ADDRESS = 0x3C`. If the scan finds `0x3D`, copy the full example with `Copy-Item firmware\include\app_config.example.h firmware\include\app_config.h`, then change `OLED_I2C_ADDRESS` to `0x3D` directly in that ignored full copy. Do not include the example and redeclare the constant, and do not treat the default as hardware verification.
3. Add DHT22 and wait at least several 2.5-second read cycles. Confirm values locally on OLED.
4. Add WS2812B with the prescribed resistor/capacitor. Test `LED_ON`/`LED_OFF` through a broker only after MQTT is configured.
5. Add SG90 power/signal with no mechanical load. Test one `UNLOCK`, then one `LOCK`; observe voltage and ESP32 stability.
6. Install latch linkage. Repeat a limited number of cycles, then inspect for collision, binding, heat, and rail sag before longer runs.
7. When real hardware is available, execute every P1-M01–P1-M11 `DEFERRED — HARDWARE-FINAL-GATE` in `tests/test-plan.md`, capturing redacted evidence by test ID before final release/demo. These checks do not replace or invalidate the Phase 1 software handoff.
8. For Phase 2, wire MC-38 between GPIO27 and ground only after power is removed. Verify the actual contact state with a meter, confirm the candidate LOW=CLOSED mapping, place the reed on the fixed frame and magnet on the moving door, then execute P2-M01/P2-M02. Do not describe an open circuit as reliable broken-wire detection.
9. For Phase 3, keep power disconnected while adding the buzzer control described in `wiring-diagram/phase-3-buzzer-wiring.md`. Verify the module voltage/current and logic polarity first. GPIO26 is a signal, not a load supply. Use only the low-voltage project supply, with supervision appropriate for the lab; never connect this project to mains wiring.

## Wi-Fi reset and captive portal

The firmware's USB-local `R`/`r` command erases WiFiManager settings and restarts. It is the reset method for P1-M08. After reboot:

1. Connect the phone to the `Locker-Setup` AP.
2. Enter a disposable/test Wi-Fi network, not a credential that will appear in an unredacted recording.
3. Confirm the ESP32 leaves the portal and reconnects MQTT without reflash.
4. Restart it once and confirm the local NVS setting reconnects.

Never record, commit, publish, or serial-log the password. If the phone portal expires at 180 seconds, restart the ESP32 and retry; do not edit firmware just to avoid the test.

## What must be recorded

For every manual test: date/time, firmware commit/build identification, board variant, non-secret configuration values (angles, LED count/brightness), wiring revision, tester, procedure, result, and a redacted photo/video/log. A failure must remain a failure with a defect note; it cannot be converted into a pass by changing the expected result.
