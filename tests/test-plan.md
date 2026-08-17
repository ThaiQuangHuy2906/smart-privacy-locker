# Phase 1–3 regression and test plan

> Current audit snapshot: automated gates were rerun on 2026-08-17 and pass in
> the scopes below. Individual user observations exist for OLED/DHT22,
> MC-38-to-Telegram, ten WS2812 pixels and SG90 close/open travel; they are
> `PARTIAL / USER-REPORTED`, not checked final-gate rows. Use
> [../HUONG_DAN_TEST_END_TO_END.md](../HUONG_DAN_TEST_END_TO_END.md) for the
> release execution/evidence format. Historical `[x]` live-service rows retain
> their recorded date/project and were not rerun in this audit.

## Automated checks

| ID | Command | Scope | Expected result |
|---|---|---|---|
| P1-A01 | `python -m platformio run -e esp32dev -t clean` then `python -m platformio run -e esp32dev` (use the documented temporary ASCII drive mapping only if the Xtensa toolchain mangles the Vietnamese Windows path) | pinned firmware build | exit 0; no ignored compiler error |
| P1-A01B | `.\arduino\verify-sketch.ps1` | Arduino IDE source parity and isolated profile build using Arduino-ESP32 2.0.17 plus pinned libraries | 30 mirrored source files match byte-for-byte; clean compile exits 0 within the default partition |
| P1-A01C | `.\arduino\verify-arduino-ide.ps1` | Arduino IDE global core/library environment and GUI-equivalent build | source parity passes; global core 2.0.17/pinned libraries compile cleanly within the default partition |
| P1-A02 | `python -m platformio test -e native` | valid action/UUID/locker/requester parse plus Phase 2/3 firmware regressions | full current native suite passes 20/20 |
| P1-A03 | same native suite | malformed JSON/no ACK ID; correlatable missing field; invalid action/locker; stale and future-skew checks | error semantics pass |
| P1-A04 | same native suite | duplicate cache/ACK replay and cold-boot state | original state preserved with `duplicate:true`; lock `UNKNOWN` |
| P1-A05 | same native suite + Node simulator/broker suites | wrap-safe 10-second heartbeat scheduling, non-retained heartbeat, retained state refresh and generation-safe liveness beyond 30 seconds | healthy quiet device remains fresh; OFFLINE/old generation cannot be revived |

The historical Phase 1 results are in
`evidence/phase-1/automated-results.md`; the Arduino IDE conversion recheck is
in `evidence/phase-3/arduino-ide-results.md`. The literal fixtures are in
`firmware/test/test_command_contract/test_main.cpp`; no mock asserts an
internal implementation call.

## Hardware final-gate tests

P1-M01–P1-M11 remain unchecked until a real tester completes each exact
procedure on the release firmware/wiring and stores the requested redacted
evidence. The user observations listed after the table reduce uncertainty but
do not satisfy voltage/current, correlation, cycle-count, failure and combined
load conditions. These rows are mandatory before final release/demo; they did
not block the accepted software handoff.

| ID | Procedure | Expected result | Evidence |
|---|---|---|---|
| P1-M01 | With SG90 unloaded and 5 V rail verified, send alternating valid `UNLOCK`/`LOCK` commands through authenticated broker. | Correct travel, no jitter/reset; ACK/state matches each completed command. | video, angle values, voltage/current note |
| P1-M02 | Mount the SG90 direct arm to the actual door and repeat close `170°`/open `80°` under mechanical load. There is no separate latch. Verify MC-38 outcome and whether the detached servo/arm holds the intended position without claiming tamper resistance. | Door repeatedly reaches OPEN/CLOSED without stall, excess travel or heat; holding/manual-movement behavior and the lack of latch/feedback are recorded. | direct-arm photos/video, MC-38 outcome, holding behavior, defect note if any |
| P1-M03 | Observe 5 V rail and serial/broker while SG90 starts/reverses. | No brownout, ESP32 reset, or MQTT loss; measured margin recorded. | meter/scope image plus timestamped serial/broker log |
| P1-M04 | Connect DHT22/OLED; run several 2.5-second cycles. | OLED shows plausible temperature/humidity and continues updating. | OLED image/video plus serial diagnostic |
| P1-M05 | Safely disconnect DHT data/sensor, then restore it. | OLED shows DHT22 error; firmware/MQTT remains responsive; no DHT topic/card exists. | video and broker topic inventory |
| P1-M06 | Record Direct-D or Shifted-S, exact strip/count, data length and resistor; send `LED_ON` then `LED_OFF`. For Direct-D, first record a primary-datasheet input threshold compatible with 3.3 V at the measured rail, then run at least 20 ON/OFF cycles and 10 cold boots at the documented one-pixel/brightness-32 starting point. | LED and ACK/state agree; no wrong color, flicker, missed update or random boot flash; data/power remain stable. A Direct-D functional pass applies only to the tested specimen/wiring, and it closes the final gate only with the matching datasheet/rail evidence. | video, path, exact strip/datasheet, LED count/brightness, data length/resistor, voltage/current note |
| P1-M07 | Keep LED ON while operating SG90 and exercise Wi-Fi/MQTT reconnect. | OLED/ESP32/MQTT remain stable; no abnormal flicker/reset. Any repeatable Direct-D data failure forces Shifted-S or removal of the physical LED from the release. | video plus broker/serial log |
| P1-M08 | Send USB `R`, use phone to join `Locker-Setup`, enter test Wi-Fi, restart. | Captive portal works, credentials stay only in NVS, MQTT reconnects without reflash. | redacted screen recording and broker log |
| P1-M09 | Abruptly stop Wi-Fi or broker, then restore it. Repeat more than once. If a controlled real condition can make the local/send-level `PubSubClient::subscribe()` call return false, capture that separately. Broker ACL is a deployment prerequisite, not a required firmware-detection test: PubSubClient 2.8 does not expose broker SUBACK grant/rejection. | Interruption produces retained LWT `OFFLINE`, bounded retry, then retained `ONLINE` and full state after recovery. A local/send-level `subscribe()` failure produces no false `ONLINE`/full state, sets device MQTT state false, disconnects, and retries with the same bounded backoff. | timestamped serial/broker capture; local/send-failure setup if actually available |
| P1-M10 | First set lock known, then restart board; observe SG90 before new command. Send `GET_STATE`, then a new lock action. | No boot motion/replay; cold state lock `UNKNOWN`, alarm inactive, LED off, door `UNKNOWN`; only new action confirms lock. No MC-38 stable-sample verification is required in Phase 1. | servo video, boot log, broker transcript |
| P1-M11 | With the ESP32 online/reconnected, subscribe using a fresh client. | Fresh client receives retained availability and retained full state appropriately. Door telemetry/non-replay belongs to Phase 2 CB1 tests. | broker subscription capture |

Current partial observations, not row closure:

- P1-M01/P1-M02: SG90 was observed moving at close `170°` and open `80°`; no
  synchronized ACK/state/MC-38/current/20-cycle record is attached.
- P1-M04: DHT22 values were observed on OLED; the repeated cycle and controlled
  disconnect/recovery evidence is still missing.
- P1-M06: the configured 10 WS2812 pixels were observed lit; ON/OFF correlation,
  exact-part threshold, 20 cycles/10 cold boots and current evidence are open.
- P1-M03/P1-M07–P1-M11: external power, combined load, captive portal,
  reconnect, cold-boot and retained-message physical records remain open.

## Reproducible broker command

Use an authenticated test broker and a new UUID for every distinct request. Never paste real passwords into terminal history or evidence. Example payload shape only:

```json
{"schema_version":1,"command_id":"550e8400-e29b-41d4-a716-446655440000","locker_id":"LOCKER-001","action":"GET_STATE","issued_at":"2026-08-07T08:00:00.000Z","requested_by":"550e8400-e29b-41d4-a716-446655440001"}
```

Publish it without retain to `locker/LOCKER-001/command`; inspect `ack`, `state`, and `availability`. Use a current ISO UTC time in actual test data. Do not use this static example as a real command after the configured age window when device time is synchronized.

## Secret scan before handoff

From repository root:

```powershell
git diff --check
git status --short
rg -n -i --hidden --glob '!*.pdf' --glob '!PLAN.md' '(mqtt_password|mqtt_username|supabase_service_role|telegram_bot_token|gmail_app_password|gemini_api_key|authorization:\s*bearer|-----begin (rsa |ec |)private key-----)' .
git check-ignore -v .env firmware/include/secrets.h firmware/.pio
```

The `rg` command may find harmless variable names in `.env.example` or documentation; inspect each match. A real value, private key, JWT, Wi-Fi password, or unredacted broker credential is a stop-and-rotate incident, not a suppressible warning.

## Phase 2 automated SOFTWARE-GATE

| ID | Executed command/suite | Coverage | Expected |
|---|---|---|---|
| P2-A01 | `platformio test -e native` (`test_door_sensor`, `test_mqtt_retry_timer`) | boot UNKNOWN, 50 ms boundary, sensor-time wrap; MQTT retry deadline across 32-bit `millis()` wrap | one stable edge plus bounded wrap-safe reconnect; 7/7 Phase 2 firmware tests pass |
| P2-S01 | `npm run test:broker` + `node tools/device-simulator/run-matrix.js` | exported Node-RED 4.1.13 MQTT status Function, reconnect bootstrap, authenticated local TCP traffic through `Phase2Runtime`; deterministic fault matrix adds success/error/duplicate/delay/no ACK/wrong/malformed/reconnect/GET_STATE | exported status path, broker runtime integration and matrix pass; simulator label retained |
| P2-A02 | Node `contracts.test.js` | JSON/schema/topic/locker/enum/time/ACK validation | invalid input has no accepted side effect |
| P2-A03 | Node `auth-dispatch.test.js` | Bearer, expired/missing/spoofed user, wrong owner, readiness, 5 s provider deadline through response-body parsing, 9 s aggregate authorization deadline, request-abort suppression, transport/5xx/malformed response and table-returning claim RPC | invalid session 401; ownership deny 403; timeout/failure 503; one claim row normalized; zero denied/aborted publish |
| P2-A04/A05 | Node dispatcher tests | server UUID/time/requester, pending domains | valid publish; conflict rejected |
| P2-A06/A07 | Node ACK/restart tests | match/wrong/duplicate/late ACK, restart, disconnect cancellation and reconnect GET_STATE | only current exact pending succeeds; disconnect cannot leave stale pending; each connection generation bootstraps once |
| P2-A08 | Node virtual-clock timeout | 5000 ms, no actuator retry, one GET_STATE; expire the reconciliation command too | controlled timeout with no recursive GET_STATE |
| P2-A09/A10 | Node security timeline | window boundary/consume/restart, unauthorized OPEN | deterministic classification + ALARM_ON |
| P2-A11 | Node Telegram/security/linking tests | one-time SHA-256 token, private-chat-only webhook, byte-safe exact secret (including malformed Unicode header), owner isolation, idempotent same-account webhook retry, cross-account replay denial, unknown provider 4xx retry, sanitized settings, per-locker destination, episode dedupe/rate limit/failure/provider stall and bounded state | no browser Chat ID path or global fallback; only known final token errors are acknowledged; one attempt/episode; ALARM_ON does not wait for Telegram; memory state remains bounded |
| P2-A12/A13 | Node chatbot tests | all six canonical questions, safe canonical intent/question, live/missing/provider error/history counts/context/transport failure | grounded whitelist without raw user secret text; controlled failures |
| YC9 static | Node artifact/SQL tests | full-name signup metadata, ordered SQL, RLS clauses, atomic claim/no owner update policy, least-privilege grants and pgTAP runner envelope | contract assertions and P2-M03–P2-M05 live gates pass |
| Secret/dependency | `npm audit --audit-level=high`, `npm run audit` | installed Dashboard dependency and committed source/config | 0 vulnerabilities; 0 secret/config findings |

Exact output is recorded in `evidence/phase-2/automated-results.md`.

## Phase 2 manual gates

- [ ] P2-M01/P2-M02 — `PARTIAL / USER-REPORTED — HARDWARE-FINAL-GATE`: the
  attached MC-38 was observed causing a Telegram notification. This does not
  yet prove contact polarity/placement, 50 ms debounce/bounce suppression,
  retained full state versus non-retained telemetry, one episode/event, or a
  synchronized Dashboard/broker capture; simulator cannot replace those.
- [x] P2-M03 — `MANUAL — HARD-GATE PASS`: with custom SMTP and a controlled nonce-bearing test-mailbox template, the final deployed UI passed public signup HTTP 200, exact user/profile creation, confirmed-account login, Bearer transport, fragment cleanup, reload persistence, local/server logout, PII cleanup, logged-out reload, and disposable-resource cleanup (12/12).
- [x] P2-M04 — `MANUAL — HARD-GATE PASS`: two disposable users/lockers passed cross-owner UI denial, direct state/command 403, zero-row Supabase RLS read, and a broker spy observed zero command messages.
- [x] P2-M05 — `MANUAL — HARD-GATE PASS`: final deployed claim feedback produced 200/409/409, kept owner/timestamp immutable, and rejected authenticated `owner_id` update with 403.
- [x] P2-M06/P2-M07 delivery semantics — `MANUAL — FINAL-GATE PASS` on the recorded pre-auto-link deployment: a real Telegram delivery reached `delivered`; a controlled invalid destination reached `failed` while detector/`ALARM_ON`/ACK stayed operational; valid configuration was restored and reverified. This evidence does not replace the automatic-link rollout smoke below.
- [ ] Automatic Telegram-link rollout smoke — `MANUAL — DEPLOYMENT-GATE`, **PARTIAL PASS on 2026-08-11**: the current Dashboard response, `[hidden]` fallback rule, correct/wrong webhook-secret boundary, registered webhook health, bot identity/commands, protected `201` deep link, real private **Start**, sanitized connected/enabled status, `200 TELEGRAM_TEST_DELIVERED`, and absence of Chat/User ID fields in browser responses all passed. Before ticking this row, run preference save/re-enable, exact consumed-token replay, disconnect and relink against a controlled disposable locker/account or an explicitly approved temporary disconnect. Apply `202608110001_telegram_account_linking.sql`, `202608110002_telegram_link_consume_conflict_fix.sql`, and `202608110003_telegram_notification_preference_upsert_fix.sql` in lexical order only on a project where they are unapplied; a project with `110001` and `110002` already applied runs only `110003`.
- [x] P2-M08 — `MANUAL — FINAL-GATE PASS`: deployed API/UI grounded a real Gemini answer in trusted `LOCKED` MQTT state; a controlled invalid model produced a safe 503 UI path without corrupting state; valid configuration was restored and reverified.

The recorded Phase 2 manual service gates pass. The automatic-link boundary has
deterministic software coverage and the non-destructive current-deployment
subset above has live evidence. The remaining stateful lifecycle checks keep
the rollout row unticked; this does not transfer ownership of Phase 2.
Deferred ESP32/MC-38 rows remain hardware final gates and are not relabeled.

## Phase 3 automated SOFTWARE-GATE

| ID | Command/suite | Coverage | Current result |
|---|---|---|---|
| P3-A01 | `pio test -e native` + clean `pio run -e esp32dev` | active-high/low, safe boot, idempotent ON/OFF, missing output writer and full firmware compatibility | PASS — native 20/20; clean ESP32 build succeeds (16.2% RAM, 84.3% flash) |
| P3-A02/P3-A03 | `npm test` Phase 3 data tests | every canonical event mapping, idempotent insert, safe 503, persistence health | PASS |
| P3-A04 | `npm test` statistics/time tests | 7/30 local boundaries, zero buckets, open/alert counts | PASS |
| P3-A05/P3-A06 | `npm test` report tests | previous local day, rendered facts, settings ownership, atomic reservation, bounded retry, ambiguous outcome and duplicate suppression | PASS |
| YC12 software | `npm test` live-state/Dashboard/export tests | validated `wifi_connected`, stale/cross-locker reset, local captive-portal guidance and absence of Dashboard credential inputs | PASS; physical P1-M08/P1-M09 remain deferred |
| Integration | `npm run test:simulator` | deterministic command/ACK/state/heartbeat matrix including alarm contract | PASS — 10 assertions / 15 scenarios |
| Broker | `npm run test:broker` | authenticated loopback MQTT, retained state/recovery, non-retained heartbeat and unauthorized alarm path | PASS — 17 assertions |
| Security | `npm run audit`, `npm audit --audit-level=high` | committed config/secret patterns and dependency advisories | PASS — 0 findings / 0 vulnerabilities |

Exact reproducible software results are recorded in
`evidence/phase-3/automated-results.md`. They do not assert a real ESP32,
buzzer, Supabase project, Gmail mailbox or deployed FlowFuse instance.

The current full Node result is recorded in
`evidence/phase-3/automated-results.md`. The forward scheduler migration and
P3-M04 pgTAP/owner-history gate have run on the development project. Local
source/artifact checks and the P3-M04/P3-M05 passes are not substitutes for
the separately recorded P3-M06 SMTP evidence or remaining hardware evidence.

## Phase 3 manual gates still pending

- P3-M01/P3-M02/P3-M03/P3-M11/P3-M12: hardware/full E2E evidence remains
  pending. The 2026-08-15 COM4 upload and isolated buzzer inactive HIGH at
  module VCC 3V3 are partial evidence only; LOW sound on GPIO26, repeated boot,
  ACK/state, measurements and combined load have not closed these rows.
- [x] P3-M04 — `MANUAL — HARD-GATE PASS`: forward migration, disposable-user
  pgTAP owner isolation, wrong-owner `LOCKER_FORBIDDEN` and correct-owner
  protected history completed on the development project.
- [x] P3-M05 — `MANUAL — HARD-GATE PASS`: deployed 7/30-day owner views,
  empty buckets and controlled local-midnight boundary passed with disposable
  data and exact cleanup.
- [x] P3-M06 — `MANUAL — FINAL-GATE PASS`: the deployed scheduler sent one
  disposable owner's daily report through Mailtrap Sandbox on attempt 1 and
  recorded `delivered`, `sent_at` and `DAILY_EMAIL_REPORT`; an intentionally
  invalid disposable recipient produced a definite `EENVELOPE` failure with
  no `sent_at`. Both disposable lockers and cascaded rows were removed.
- P3-M07–P3-M10: the deployed Telegram automatic-link subset is now recorded,
  while its remaining lifecycle checks and the other YC6/YC8/Dashboard
  success/failure recordings stay pending. These continue to block
  `FINAL_RELEASE_READY`.

## 2026-08-17 browser/audit addendum

Chrome/CDP checks with safe mocked routes were rerun at desktop 1280×720 and
mobile 320×800, including startup failure/recovery, fresh/stale state, focus and
reduced motion. The matching DOM behavior, plus expired-token fail-closed
polling and single-flight refresh, is covered by the 156-test Node suite.
`playwright-cli 0.1.18` on Node `v24.14.1` is separately `UNAVAILABLE`
because wrapper and direct command both hit upstream `UV_HANDLE_CLOSING`.

| ID | Result | Evidence/remaining work |
|---|---|---|
| UI-A01 structure/reflow | PASS | `lang=vi`, one H1, clear H2 hierarchy and no document horizontal overflow. |
| UI-A02 focus | PASS | Focus outline is 3 px; auth mode has one explicit submit path. |
| UI-A03 target/status/motion | PASS | 27 visible interaction targets; none below effective 24×24 CSS px; 10 live regions; reduced motion applied. |
| UI-F01 command label | PASS — fixed | `COMMAND_SUCCEEDED` renders a Vietnamese success label; unknown enum uses a safe fallback. |
| UI-F02 Telegram failure | PASS — fixed | `failed` renders “gửi thất bại”. |
| UI-F03 pending spinner | PASS — fixed | 17 px spinner has independent visible color; both same-domain buttons are pending/disabled. |
| UI-F04 startup recovery | PASS — fixed | First public-config 503 disables auth; automatic five-second retry recovers without reload. |
| UI-F05 no-data truth | PASS — fixed | Initial lock/alarm/LED are unknown. |
| UI-F06 stale truth | PASS — fixed | Stale lock/alarm/LED are unknown and every actuator control is disabled. |
| UI-F07 auth semantics | PASS — fixed | Full name is registration-only; password autocomplete and the single submit action follow selected mode. |

The same correction pass added the bounded future-time skew, ACK anomaly
diagnostics, publish-failure logs, 10-second heartbeat/state refresh, secure
MQTT example, Wokwi safe-boot/help and close/open terminology. QoS0 ambiguity
and open-loop servo feedback remain explicit design/physical limitations, not
reasons to retry an actuator automatically.

Severity and current closure status are in
[../BAO_CAO_RA_SOAT_CODEBASE.md](../BAO_CAO_RA_SOAT_CODEBASE.md). The software
UI gate is PASS, but final release remains blocked until physical/live release
gates complete.
