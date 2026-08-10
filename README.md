# Smart Privacy Locker

ESP32/Node-RED implementation for an IoT privacy locker, delivered in three gated phases. **Phase 1 and Phase 2 are completed; Phase 3 software is implemented and under final handoff** on `phase/3-thuy-data-integration`. Phase 3 adds CB3, YC4, YC5 and YC7 without changing ownership of the Phase 2 YC6/YC8 logic.

The source PDFs are read-only project records. Do not edit, move, or replace them.

## Current scope

The branch contains the accepted Phase 1/2 baseline plus Phase 3 implementation:

- PlatformIO project for the ESP32 Dev Module (`esp32dev`) using Arduino.
- WiFiManager captive portal and local configuration reset over USB serial.
- Authenticated MQTT client foundation with bounded reconnects, retained availability/state, LWT, and `GET_STATE` recovery.
- MQTT v1 validation, correlated ACKs, and bounded duplicate-command replay.
- SG90 lock controller, local DHT22/OLED monitor, and WS2812B on/off controller.
- MC-38 non-blocking stable debounce, boot `UNKNOWN`, retained full-state integration, and non-retained transition telemetry.
- Modular Node-RED validation/cache/auth/ownership/dispatcher/ACK/timeout/restart recovery, including MQTT status-key handling and reconnect `GET_STATE` bootstrap.
- Supabase YC9 profiles/lockers/RLS/atomic claim migrations, full-name signup metadata, and a Bearer-only auth transport that distinguishes invalid sessions from provider outages.
- Authorized unlock window, unauthorized episode detection, `ALARM_ON` Phase 3 interface, bounded runtime/Telegram state, and normalized event fixtures.
- YC8 routing for all six canonical questions, safe canonical question/intent grounding, structured facts, and a responsive auth/claim/state/control/chatbot security console.
- CB3 non-blocking active-buzzer controller on GPIO26 with configurable polarity, safe boot INACTIVE, `ALARM_ON/OFF` ACK and full-state integration.
- YC4 versioned Supabase event/settings/delivery schema, owner RLS, idempotent persistence, bounded history and explicit persistence health.
- YC5 timezone-correct 7/30-day aggregation with zero buckets and a responsive Dashboard chart.
- YC7 validated notification settings, previous-local-day email report, delivery log and database-backed duplicate suppression.
- Final Dashboard alarm controls/status, recent history, chart and report settings; browser code still receives only the anon key and owner-scoped APIs.

Automated software evidence is not physical evidence. Real buzzer polarity/current/wiring, a live Supabase migration/RLS session, real SMTP delivery and final hardware E2E remain manual gates before release/demo.

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

5. Run the Phase 3 software gates:

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
- MQTT v1 remains frozen; Phase 3 consumes it without a schema/topic/semantic change. Phase 3 persistence follows [docs/event-contract.md](docs/event-contract.md) and [docs/database-design.md](docs/database-design.md).

## Evidence and status

The Node suite, memory simulator, authenticated local broker and secret/config audit are the Phase 3 software gates. P1/P2 physical rows and P3-M01–P3-M12 remain deferred/pending until their real hardware or service environment exists. Use [docs/deployment-guide.md](docs/deployment-guide.md) and [docs/troubleshooting.md](docs/troubleshooting.md); never present simulator output as ESP32/buzzer proof.
