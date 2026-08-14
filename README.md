# Smart Privacy Locker

ESP32/Node-RED implementation for an IoT privacy locker, delivered in three gated phases. **The Phase 1–3 software paths are implemented on `develop`; hardware-dependent final gates are still pending.** Phase 3 adds CB3, YC4, YC5 and YC7 without changing ownership of the Phase 2 YC6/YC8 logic.

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
- MC-38 non-blocking stable debounce, boot `UNKNOWN`, retained full-state integration, and non-retained transition telemetry.
- Modular Node-RED validation/cache/auth/ownership/dispatcher/ACK/timeout/restart recovery, including MQTT status-key handling and reconnect `GET_STATE` bootstrap.
- Supabase YC9 profiles/lockers/RLS/atomic claim migrations, full-name signup metadata, and a Bearer-only auth transport that distinguishes invalid sessions from provider outages.
- Authorized unlock window, unauthorized episode detection, `ALARM_ON` Phase 3 interface, bounded runtime/Telegram state, and normalized event fixtures.
- Owner-scoped Telegram linking through a 10-minute one-time bot deep link and
  secret-authenticated webhook; end users press **Start** once and never find,
  enter, or receive a Chat ID.
- YC8 routing for all six canonical questions, safe canonical question/intent grounding, structured facts, and a responsive owner Dashboard for auth, claim, live state, controls and chatbot queries.
- CB3 non-blocking active-buzzer controller on GPIO26 with configurable polarity, safe boot INACTIVE, `ALARM_ON/OFF` ACK and full-state integration.
- YC4 versioned Supabase event/settings/delivery schema, owner RLS, idempotent persistence, bounded history and explicit persistence health.
- YC5 timezone-correct 7/30-day aggregation with zero buckets and a responsive Dashboard chart.
- YC7 validated notification settings, previous-local-day email report, delivery log and database-backed duplicate suppression.
- Final Dashboard alarm controls/status, YC12 device setup guidance, friendly recent-history labels, explicit chart empty states and conditional report settings in a warm, low-noise interface; browser code still receives only the anon key and owner-scoped APIs.

Automated software evidence is not physical evidence. The Phase 3 forward migration, owner-isolation/history gate, full 7/30-day and local-midnight chart paths, Mailtrap Sandbox SMTP success/definite-failure paths, and the Phase 2 Telegram/Gemini/auth paths have been exercised on the development project. On 2026-08-11 the current Telegram build also passed the deployed Dashboard/secret/webhook/private-Start/link/test-message smoke and returned only sanitized connection fields to the browser. Preference re-enable, consumed-token replay and disconnect/relink remain explicit non-hardware lifecycle checks before final release. All physical sensor/actuator, WiFiManager, power, wiring and full end-to-end checks remain required before release/demo.

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
5. When the hardware arrives, use only
   [HUONG_DAN_LAP_MACH_THEO_THU_TU.md](HUONG_DAN_LAP_MACH_THEO_THU_TU.md) for
   wiring and only [HUONG_DAN_CHAY_HE_THONG.md](HUONG_DAN_CHAY_HE_THONG.md)
   for post-assembly acceptance. Before powering anything, review the
   candidate [BOM](hardware/bom.md), complete the exact-part
   [power budget](hardware/power-budget.md) and verify the
   [pin map](hardware/pin-map.md). The older duplicate assembly/wiring guides
   were removed after user confirmation; these two canonical guides replace
   them.
6. Run native contract tests and the independent PlatformIO ESP32 build:

   ```powershell
   cd firmware
   pio test -e native
   pio run -e esp32dev -t clean
   pio run -e esp32dev
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
   npm run audit
   ```

8. Flash through Arduino IDE only after the board profile, source mirror,
   power mode and wiring have been verified. Open Serial Monitor at 115200
   baud and run the physical smoke test; a successful compile is not hardware
   evidence.

The labeled standalone simulator is under
[wokwi/smart-privacy-locker-wokwi](wokwi/smart-privacy-locker-wokwi), with a
ready ZIP at
[wokwi/smart-privacy-locker-wokwi.zip](wokwi/smart-privacy-locker-wokwi.zip).
The report-content draft required by the course PDF is
[NOI_DUNG_BAO_CAO_CUOI_KY.md](NOI_DUNG_BAO_CAO_CUOI_KY.md).
The complete audit, verification matrix, honest limitations and files awaiting
deletion approval are recorded in
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
- MQTT v1 remains frozen; Phase 3 consumes it without a schema/topic/semantic change. Phase 3 persistence follows [docs/event-contract.md](docs/event-contract.md) and [docs/database-design.md](docs/database-design.md).

## Evidence and status

The current Node suite passes 145/145, the memory simulator passes 8 assertions across 14 scenarios, the authenticated local broker passes 15 assertions, and the secret/config and dependency audits report zero findings. P3-M04, P3-M05, the deployed P3-M06 Mailtrap SMTP success/failure paths, and the non-destructive Telegram rollout subset are recorded in sanitized evidence. On 2026-08-15 the ESP32 was detected through CH340 on COM4 and an isolated buzzer sketch established a silent inactive HIGH only after the LOW-trigger/TMB12A05 module VCC was moved from 5 V to ESP32 3V3. The tracked firmware baseline is now active-low (`SPL_BUZZER_ACTIVE_HIGH=0`); GPIO26 active output, production ACK/state and full-load hardware remain pending. COM4 is historical evidence, not a permanent port assignment. The current generated FlowFuse artifact is 235,945 bytes with SHA-256 `ee73551fac45c79b8706f0813595c386030e3acd32ed8fb4943f641d9d58afa8`. Use [docs/deployment-guide.md](docs/deployment-guide.md) and [docs/troubleshooting.md](docs/troubleshooting.md); never present simulator output or the isolated inactive test as full ESP32/buzzer proof.
