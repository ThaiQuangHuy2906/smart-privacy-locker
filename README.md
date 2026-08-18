# Smart Privacy Locker

ESP32/Node-RED implementation for an IoT privacy locker, delivered in three gated phases. **The Phase 1–3 software paths are implemented; OLED, DHT22, MC-38, WS2812B and SG90 have individual user-observed results, while active-buzzer production evidence and the final physical E2E sequence remain open.** Unmeasured power/full-load item P1-05 is an explicitly accepted demo-only risk, not a claim of electrical validation. Phase 3 adds CB3, YC4, YC5 and YC7 without changing ownership of the Phase 2 YC6/YC8 logic.

The source PDFs are read-only project records. Do not edit, move, or replace them.

## Current scope

The branch contains the accepted Phase 1/2 baseline plus Phase 3 implementation:

- Arduino IDE-compatible `SmartPrivacyLocker` sketch plus the synchronized
  PlatformIO test/build project for the ESP32 Dev Module using Arduino.
- WiFiManager captive portal and local configuration reset over USB serial.
- YC12 fresh-state Wi-Fi visibility plus local `Locker-Setup`/`192.168.4.1` guidance; SSID and Wi-Fi password never enter the Dashboard or cloud path.
- Authenticated MQTT client foundation with bounded reconnects, retained availability/state, LWT, and `GET_STATE` recovery.
- MQTT v1 validation, correlated ACKs, and bounded duplicate-command replay.
- SG90 lock controller, local DHT22/OLED monitor, and WS2812B on/off controller.
- MC-38 non-blocking stable debounce, boot `UNKNOWN`, retained full-state integration, UUIDv4 transition telemetry with firmware-authoritative `authorized`, bounded RAM replay and immediate local unauthorized-open alarm.
- Modular Node-RED validation/cache/auth/ownership/dispatcher/ACK/timeout/restart recovery, including MQTT status-key handling and reconnect `GET_STATE` bootstrap.
- Supabase YC9 profiles/lockers/RLS/atomic claim migrations, full-name signup metadata, and a Bearer-only auth transport that distinguishes invalid sessions from provider outages.
- One-time unlock grant and local auto-lock: each successful closed-door `UNLOCK` authorizes only the next OPEN within 30 seconds. Firmware locks the latch after the observed door closes again, or when an unused grant expires while the door remains closed. A later forced/reopened door without a new grant alarms locally, with unauthorized episode detection, `ALARM_ON`, Telegram and normalized event fixtures.
- Owner-scoped Telegram linking through a 10-minute one-time bot deep link and
  secret-authenticated webhook; end users press **Start** once and never find,
  enter, or receive a Chat ID.
- YC8 routing for all six canonical questions, safe canonical question/intent grounding, structured facts, and a responsive owner Dashboard for auth, claim, live state, controls and chatbot queries.
- CB3 non-blocking active-buzzer controller on GPIO26 with configurable polarity, safe boot INACTIVE, `ALARM_ON/OFF` ACK and full-state integration.
- YC4 versioned Supabase event/settings/delivery schema, owner RLS, idempotent persistence, bounded retry/dead-letter health and deterministic history pagination.
- YC5 timezone-correct 7/30-day aggregation with zero buckets and a responsive Dashboard chart.
- YC7 validated notification settings, previous-local-day email report, delivery log and database-backed duplicate suppression.
- Final Dashboard alarm controls/status, YC12 device setup guidance, friendly recent-history labels, explicit chart empty states and conditional report settings in a warm, low-noise interface; browser code still receives only the anon key and owner-scoped APIs.

Automated software evidence is not physical evidence. The Phase 3 forward migration, owner-isolation/history gate, full 7/30-day and local-midnight chart paths, Mailtrap Sandbox SMTP success/definite-failure paths, and the Phase 2 Telegram/Gemini/auth paths have historical sanitized evidence from the development project. On 2026-08-11 the Telegram build also passed the deployed Dashboard/secret/webhook/private-Start/link/test-message smoke and returned only sanitized connection fields to the browser. Those live gates were **not rerun** during the 2026-08-18 audit. The current user has separately observed OLED/DHT22 display, MC-38 Telegram notification, ten configured WS2812 pixels and SG90 travel at latch-lock `80°`/latch-unlock `170°`; the photos under `AnhVatLi/` confirm the latch geometry. These are useful partial hardware evidence, not a synchronized final E2E pass. GPIO26 active production behavior, WiFiManager recovery and the complete end-to-end sequence still require manual evidence. P1-05 power/full-load measurement was explicitly waived for this demo and must not be presented as measured PASS.

The as-built SG90 arm is the rotating latch. The user opens/closes the door
manually; MC-38 senses only the door contact. Existing MQTT enums remain
`LOCKED`/`UNLOCKED` for compatibility, but they represent a timed open-loop
latch command and do not prove that the servo reached its angle.

After a valid opening, push the door closed by hand. Once MC-38 confirms a
stable `OPEN → CLOSED` transition, firmware rotates the latch to `LOCK=80°`
locally, without waiting for the network and without fabricating a command ACK.
An unused opening grant also auto-locks at its exact 30-second deadline while
the door stays closed. To open again, wait for `LOCKED`, then press **Mở chốt**.
Forcing or reopening the door without a new valid grant activates the buzzer.

## Quick start

1. Follow [HUONG_DAN_CHAY_HE_THONG.md](HUONG_DAN_CHAY_HE_THONG.md) to install
   Arduino IDE with `esp32 by Espressif Systems 2.0.17` and the exact pinned
   library versions. Do not use the globally installed `latest` core for the
   release build.
2. Create `firmware/include/secrets.h` from `firmware/include/secrets.example.h`.
   It is ignored by Git. Do not use working credentials in any committed file.
3. Synchronize the modular firmware and ignored local configuration into the
   Arduino sketch, then verify the mirror:

   ```powershell
   .\arduino\sync-sketch.ps1 -IncludeLocalConfig
   .\arduino\sync-sketch.ps1 -Check
   ```

4. Open
   [SmartPrivacyLocker.ino](arduino/SmartPrivacyLocker/SmartPrivacyLocker.ino)
   in Arduino IDE. Use the board/options documented in
   [HUONG_DAN_CHAY_HE_THONG.md](HUONG_DAN_CHAY_HE_THONG.md); the clean pinned
   Arduino build is verified at 84% flash and 16% dynamic memory.
5. For the assembled prototype, use the [pin map](hardware/pin-map.md) as the
   current GPIO/calibration source of truth and keep the exact-part
   [power budget](hardware/power-budget.md) current. Use
   [HUONG_DAN_CHAY_HE_THONG.md](HUONG_DAN_CHAY_HE_THONG.md) together with
   [HUONG_DAN_TEST_END_TO_END.md](HUONG_DAN_TEST_END_TO_END.md) for
   post-assembly acceptance. The obsolete assembly guides were removed after
   user confirmation.
6. Run native contract tests and the independent PlatformIO ESP32 build:

   ```powershell
   cd firmware
   pio test -e native
   pio run -e esp32dev -t clean
   .\build-esp32.ps1
   ```

   If the Xtensa build cannot handle this repository's Vietnamese Windows
   path, use the temporary ASCII drive mapping documented in
   [firmware/README.md](firmware/README.md); do not copy the source tree or
   commit `.pio` output.

7. Run the Phase 3 software gates:

   ```powershell
   cd node-red
   npm test
   npm run test:simulator
   npm run test:broker
   npm run test:dashboard-browser
   npm run audit
   npm run docs:links
   ```

8. Flash through Arduino IDE only after the board profile, source mirror,
   power mode and wiring have been verified. Open Serial Monitor at 115200
   baud and run the physical smoke test; a successful compile is not hardware
   evidence.

9. Run the complete release sequence in
   [HUONG_DAN_TEST_END_TO_END.md](HUONG_DAN_TEST_END_TO_END.md). Use
   [ON_TAP_VAN_DAP_CHI_TIET.md](ON_TAP_VAN_DAP_CHI_TIET.md) to rehearse the
   architecture, physics, ownership, known limitations and oral-defense
   questions. Do not mark a manual row PASS without the requested measurement,
   log and physical evidence.

The labeled standalone simulator is under
[wokwi/smart-privacy-locker-wokwi](wokwi/smart-privacy-locker-wokwi), with a
ready ZIP at
[wokwi/smart-privacy-locker-wokwi.zip](wokwi/smart-privacy-locker-wokwi.zip).
The report-content draft required by the course PDF is
[NOI_DUNG_BAO_CAO_CUOI_KY.md](NOI_DUNG_BAO_CAO_CUOI_KY.md).
The current audit, P0–P3 findings, verification matrix and honest limitations
are recorded in
[BAO_CAO_RA_SOAT_CODEBASE.md](BAO_CAO_RA_SOAT_CODEBASE.md).
The mechanical/VIVA package is preserved under [THUYETMINH](THUYETMINH). Its
primary editable Fusion archive is
[Smart_Privacy_Locker_v2.1_Final.f3d](THUYETMINH/03_SMART_PRIVACY_LOCKER_VIVA_FINAL/01_MO_HINH_FUSION_CHINH/Smart_Privacy_Locker_v2.1_Final.f3d),
with a STEP fallback, presentation board, annotated images, automation source
and verification manifests stored alongside it.

## Contracts and safety

- MQTT topics, JSON payloads, retained semantics, ACK/error behavior, and safe-boot rules are specified in [docs/mqtt-contract.md](docs/mqtt-contract.md).
- `lock=UNKNOWN` after a cold boot is intentional. The firmware never attaches or moves the servo merely because it booted.
- DHT22 values stay local to the OLED; the firmware publishes no DHT temperature/humidity MQTT topic.
- The Dashboard contains no MQTT credentials and never publishes directly to ESP32; Node-RED implements the Phase 2 policy/egress boundary.
- MQTT v1 command/ACK/state/availability/door payloads and enums remain compatible. The reliability correction adds one non-retained operational `heartbeat` topic without changing persisted event schemas. Phase 3 persistence follows [docs/event-contract.md](docs/event-contract.md) and [docs/database-design.md](docs/database-design.md).

## Evidence and status

The final 2026-08-18 auto-lock rerun passed native firmware 28/28, a clean ESP32 build at 53,580 bytes RAM (16.4%) and 1,108,145 bytes flash (84.5%), and the 32-file Arduino mirror plus pinned profile build at 53,608 bytes RAM/1,112,269 bytes flash. Node passed 177/177, the memory simulator passed 28 assertions across 22 scenarios, and local Chrome/CDP passed 18 UX checks at 1280×720 and an exact 320×800 window. The authenticated local broker's latest relevant result remains 18 assertions; config/secret and production dependency audits remain zero-findings results from the same audit day because those paths were not changed by auto-lock. The prior GUI-equivalent Arduino build is historical and was not rerun after this change; the current mirrored source is instead verified by byte parity plus the isolated pinned compile above. `playwright-cli` itself remains unavailable on Node `v24.14.1` because wrapper and direct invocation hit the same upstream `UV_HANDLE_CLOSING` assertion; it is not reported as PASS. On 2026-08-15 the ESP32 was detected through CH340 on COM4 and an isolated buzzer sketch established a silent inactive HIGH only after the LOW-trigger/TMB12A05 module VCC was moved from 5 V to ESP32 3V3. The tracked firmware baseline is active-low (`SPL_BUZZER_ACTIVE_HIGH=0`); GPIO26 active output and production ACK/state remain pending. COM4 is historical evidence, not a permanent port assignment. Use [docs/deployment-guide.md](docs/deployment-guide.md), [docs/troubleshooting.md](docs/troubleshooting.md) and the dedicated E2E guide; never present simulator output, a user observation without trace evidence, or the isolated inactive test as full ESP32/buzzer proof.
