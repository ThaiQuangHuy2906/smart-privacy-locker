# Phase 1 regression and Phase 2 test plan

## Automated checks

| ID | Command | Scope | Expected result |
|---|---|---|---|
| P1-A01 | `python -X utf8 -m platformio run -e esp32dev -t clean` then `python -X utf8 -m platformio run -e esp32dev` | pinned firmware build | exit 0; no ignored compiler error |
| P1-A02 | `python -X utf8 -m platformio test -e native` | valid action/UUID/locker/requester parse | seven native tests pass |
| P1-A03 | same native suite | malformed JSON/no ACK ID; correlatable missing field; invalid action/locker; stale check | error semantics pass |
| P1-A04 | same native suite | duplicate cache/ACK replay and cold-boot state | original state preserved with `duplicate:true`; lock `UNKNOWN` |

The exact executed results are in `evidence/phase-1/automated-results.md`. The literal fixtures are in `firmware/test/test_command_contract/test_main.cpp`; no mock asserts an internal implementation call.

## Deferred HARDWARE-FINAL-GATE tests

All P1-M01–P1-M11 rows remain `[ ] DEFERRED — HARDWARE-FINAL-GATE` until a real tester with ESP32 hardware, modules, phone, and broker completes the procedure and stores the requested redacted evidence. They are mandatory before final release/demo; under the SOFTWARE-FIRST workflow they did not block the accepted Phase 1 software handoff. They are not PASS or VERIFIED.

| ID | Procedure | Expected result | Evidence |
|---|---|---|---|
| P1-M01 | With SG90 unloaded and 5 V rail verified, send alternating valid `UNLOCK`/`LOCK` commands through authenticated broker. | Correct travel, no jitter/reset; ACK/state matches each completed command. | video, angle values, voltage/current note |
| P1-M02 | Mount the latch and repeat lock/unlock under actual mechanical load. Verify whether the latch mechanically holds after the servo detaches or requires holding torque. | Latch reliably works without stall, excess travel, or heat; holding requirement is recorded before any servo-policy change. | latch photos/video, holding-torque finding, defect note if any |
| P1-M03 | Observe 5 V rail and serial/broker while SG90 starts/reverses. | No brownout, ESP32 reset, or MQTT loss; measured margin recorded. | meter/scope image plus timestamped serial/broker log |
| P1-M04 | Connect DHT22/OLED; run several 2.5-second cycles. | OLED shows plausible temperature/humidity and continues updating. | OLED image/video plus serial diagnostic |
| P1-M05 | Safely disconnect DHT data/sensor, then restore it. | OLED shows DHT22 error; firmware/MQTT remains responsive; no DHT topic/card exists. | video and broker topic inventory |
| P1-M06 | Send `LED_ON` then `LED_OFF`; check configured brightness and supply. | LED and ACK/state agree; data/power stable. | video, LED count/brightness, voltage/current note |
| P1-M07 | Keep LED ON while operating SG90. | OLED/ESP32/MQTT remain stable; no abnormal flicker/reset. | video plus broker/serial log |
| P1-M08 | Send USB `R`, use phone to join `Locker-Setup`, enter test Wi-Fi, restart. | Captive portal works, credentials stay only in NVS, MQTT reconnects without reflash. | redacted screen recording and broker log |
| P1-M09 | Abruptly stop Wi-Fi or broker, then restore it. Repeat more than once. If a controlled real condition can make the local/send-level `PubSubClient::subscribe()` call return false, capture that separately. Broker ACL is a deployment prerequisite, not a required firmware-detection test: PubSubClient 2.8 does not expose broker SUBACK grant/rejection. | Interruption produces retained LWT `OFFLINE`, bounded retry, then retained `ONLINE` and full state after recovery. A local/send-level `subscribe()` failure produces no false `ONLINE`/full state, sets device MQTT state false, disconnects, and retries with the same bounded backoff. | timestamped serial/broker capture; local/send-failure setup if actually available |
| P1-M10 | First set lock known, then restart board; observe SG90 before new command. Send `GET_STATE`, then a new lock action. | No boot motion/replay; cold state lock `UNKNOWN`, alarm inactive, LED off, door `UNKNOWN`; only new action confirms lock. No MC-38 stable-sample verification is required in Phase 1. | servo video, boot log, broker transcript |
| P1-M11 | With the ESP32 online/reconnected, subscribe using a fresh client. | Fresh client receives retained availability and retained full state appropriately. Door telemetry/non-replay belongs to Phase 2 CB1 tests. | broker subscription capture |

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
| P2-A01 | `platformio test -e native` (`test_door_sensor`) | boot UNKNOWN, 50 ms boundary, bounce, wrap-safe time | one stable edge, 3/3 pass |
| P2-S01 | `npm run test:broker` + `node tools/device-simulator/run-matrix.js` | authenticated local TCP broker plus deterministic fault matrix: ONLINE/OFFLINE/LWT, retained state, non-retained door, success/error/duplicate/delay/no ACK/wrong/malformed/reconnect/GET_STATE | broker and matrix pass; simulator label retained |
| P2-A02 | Node `contracts.test.js` | JSON/schema/topic/locker/enum/time/ACK validation | invalid input has no accepted side effect |
| P2-A03 | Node `auth-dispatch.test.js` | Bearer, expired/missing/spoofed user, wrong owner, readiness | 401/403/503 and zero denied publish |
| P2-A04/A05 | Node dispatcher tests | server UUID/time/requester, pending domains | valid publish; conflict rejected |
| P2-A06/A07 | Node ACK/restart tests | match/wrong/duplicate/late ACK, restart | only current exact pending succeeds |
| P2-A08 | Node virtual-clock timeout | 5000 ms, no retry, one GET_STATE | controlled timeout |
| P2-A09/A10 | Node security timeline | window boundary/consume/restart, unauthorized OPEN | deterministic classification + ALARM_ON |
| P2-A11 | Node Telegram/security tests | episode dedupe, rate limit, failure | one attempt/episode, no throw/loop |
| P2-A12/A13 | Node chatbot tests | live/missing/provider error/history counts/context | grounded whitelist, controlled failures |
| YC9 static | Node artifact tests | ordered SQL, RLS clauses, atomic claim/no owner update policy | contract assertions pass |
| Secret/dependency | `npm audit --audit-level=high`, `npm run audit` | installed Dashboard dependency and committed source/config | 0 vulnerabilities; 0 secret/config findings |

Exact output is recorded in `evidence/phase-2/automated-results.md`.

## Phase 2 manual gates

- [ ] P2-M01/P2-M02 — `DEFERRED — HARDWARE-FINAL-GATE`: no ESP32/MC-38 is attached; simulator cannot replace polarity, GPIO, physical debounce, retained/non-retained broker capture, or Dashboard hardware evidence.
- [ ] P2-M03 — `MANUAL — HARD-GATE Pending`: no `SUPABASE_URL`/anon project and no FlowFuse deployment/session are configured on this workstation.
- [ ] P2-M04 — `MANUAL — HARD-GATE Pending`: User A/User B and Locker A/Locker B must be created in a disposable Supabase project and tested through UI/direct API plus broker spy.
- [ ] P2-M05 — `MANUAL — HARD-GATE Pending`: first/double claim must be executed against that real project; static SQL assertions are not database runtime evidence.
- [ ] P2-M06/P2-M07 — `MANUAL — FINAL-GATE Pending`: Telegram token/chat ID are absent. Automated adapter success/failure/dedupe is PASS only at contract level.
- [ ] P2-M08 — `MANUAL — FINAL-GATE Pending`: Gemini key/model are absent. Automated provider error/grounding is PASS only at contract level.

Phase 2 stays `ACTIVE` while P2-M03–P2-M05 are pending. It must not be merged to
`develop`, marked `COMPLETED`, or used to activate Phase 3 until those hard gates
have real sanitized evidence.
