# Smart Privacy Locker

Firmware foundation for an ESP32-based privacy locker. This repository is being delivered in three gated phases. **Only Phase 1 is currently active** and it implements the shared ESP32/MQTT base, CB2 (SG90 lock), YC1 (DHT22 to local OLED), YC3 (WS2812B), and YC12 (WiFiManager).

The source PDFs are read-only project records. Do not edit, move, or replace them.

## Current scope

Implemented source in this branch is limited to Phase 1:

- PlatformIO project for the ESP32 Dev Module (`esp32dev`) using Arduino.
- WiFiManager captive portal and local configuration reset over USB serial.
- Authenticated MQTT client foundation with bounded reconnects, retained availability/state, LWT, and `GET_STATE` recovery.
- MQTT v1 validation, correlated ACKs, and bounded duplicate-command replay.
- SG90 lock controller, local DHT22/OLED monitor, and WS2812B on/off controller.

CB1, YC6, YC8, YC9, CB3, YC4, YC5, and YC7 are deliberately not implemented here.

## Quick start

1. Install PlatformIO Core according to [firmware/README.md](firmware/README.md).
2. Create `firmware/include/secrets.h` from `firmware/include/secrets.example.h`. It is ignored by Git. Do not use working credentials in any committed file.
3. Review [hardware/pin-map.md](hardware/pin-map.md) and complete the required physical safety checks in [hardware/assembly-guide.md](hardware/assembly-guide.md) before powering the hardware.
4. Run native contract tests and the ESP32 build:

   ```powershell
   cd firmware
   pio test -e native
   pio run -e esp32dev
   ```

5. Flash only after the board profile and wiring have been verified:

   ```powershell
   pio run -e esp32dev -t upload
   pio device monitor -b 115200
   ```

## Contracts and safety

- MQTT topics, JSON payloads, retained semantics, ACK/error behavior, and safe-boot rules are specified in [docs/mqtt-contract.md](docs/mqtt-contract.md).
- `lock=UNKNOWN` after a cold boot is intentional. The firmware never attaches or moves the servo merely because it booted.
- DHT22 values stay local to the OLED; the firmware publishes no DHT temperature/humidity MQTT topic.
- The dashboard must not publish directly to the ESP32 or contain MQTT credentials. That Phase 2 boundary is documented, not implemented in this branch.
- `docs/mqtt-contract.md` is submitted as contract v1 and must receive the required review by Nguyễn Văn Minh before it can be marked frozen in `PLAN.md`.

## Evidence and status

Automated results and the manual-test procedure are in [tests/evidence/phase-1/README.md](tests/evidence/phase-1/README.md) and [tests/test-plan.md](tests/test-plan.md). Hardware, phone, and physical-broker checks P1-M01–P1-M11 are not fabricated: they remain `[ ] DEFERRED — HARDWARE-FINAL-GATE` until real equipment is available. They block final release/demo, but do not block the Phase 1 software handoff; Phase 1 is `READY_FOR_REVIEW` pending Nguyễn Văn Minh's human review.
