# Smart Privacy Locker

ESP32/Node-RED foundation for an IoT privacy locker, delivered in three gated phases. **Phase 1 is completed and Phase 2 is active** on `phase/2-minh-security-orchestration`. Phase 2 adds CB1, YC6 logic/Telegram interfaces, YC8 routing/grounding, YC9, secure orchestration, and the required Dashboard surface.

The source PDFs are read-only project records. Do not edit, move, or replace them.

## Current scope

The branch contains the accepted Phase 1 baseline plus Phase 2 implementation:

- PlatformIO project for the ESP32 Dev Module (`esp32dev`) using Arduino.
- WiFiManager captive portal and local configuration reset over USB serial.
- Authenticated MQTT client foundation with bounded reconnects, retained availability/state, LWT, and `GET_STATE` recovery.
- MQTT v1 validation, correlated ACKs, and bounded duplicate-command replay.
- SG90 lock controller, local DHT22/OLED monitor, and WS2812B on/off controller.
- MC-38 non-blocking stable debounce, boot `UNKNOWN`, retained full-state integration, and non-retained transition telemetry.
- Modular Node-RED validation/cache/auth/ownership/dispatcher/ACK/timeout/restart recovery.
- Supabase YC9 profiles/lockers/RLS/atomic claim migrations and a Bearer-only auth transport.
- Authorized unlock window, unauthorized episode detection, `ALARM_ON` Phase 3 interface, bounded Telegram adapter, and normalized event fixtures.
- YC8 live/history routing with structured facts and a minimal auth/claim/state/chatbot Dashboard.

Actual CB3 buzzer, YC4 production persistence/history, YC5 charts, and YC7 email remain Phase 3. No Phase 2 simulator output is hardware evidence.

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

5. Run the Phase 2 software gates:

   ```powershell
   cd node-red
   npm test
   npm run test:simulator
   npm run test:broker
   npm run audit
   ```

6. Flash only after the board profile and wiring have been verified:

   ```powershell
   pio run -e esp32dev -t upload
   pio device monitor -b 115200
   ```

## Contracts and safety

- MQTT topics, JSON payloads, retained semantics, ACK/error behavior, and safe-boot rules are specified in [docs/mqtt-contract.md](docs/mqtt-contract.md).
- `lock=UNKNOWN` after a cold boot is intentional. The firmware never attaches or moves the servo merely because it booted.
- DHT22 values stay local to the OLED; the firmware publishes no DHT temperature/humidity MQTT topic.
- The Dashboard contains no MQTT credentials and never publishes directly to ESP32; Node-RED implements the Phase 2 policy/egress boundary.
- MQTT v1 is frozen by Nguyễn Văn Minh for Phase 2 without a schema/topic/semantic change. Phase 3 adapters are frozen in [docs/event-contract.md](docs/event-contract.md).

## Evidence and status

Automated results and manual gates are indexed under `tests/evidence/`. P1-M01–P1-M11 and P2-M01–P2-M02 remain `[ ] DEFERRED — HARDWARE-FINAL-GATE`. P2-M03–P2-M05 are `MANUAL — HARD-GATE Pending` because this workstation has no Supabase/FlowFuse project configuration; therefore Phase 2 remains `ACTIVE` and is not integrated into `develop` yet. Telegram/Gemini live checks remain final-gate pending without credentials.
