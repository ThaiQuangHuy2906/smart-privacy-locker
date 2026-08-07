# Phase 1 test plan

## Automated checks

| ID | Command | Scope | Expected result |
|---|---|---|---|
| P1-A01 | `python -X utf8 -m platformio run -e esp32dev -t clean` then `python -X utf8 -m platformio run -e esp32dev` | pinned firmware build | exit 0; no ignored compiler error |
| P1-A02 | `python -X utf8 -m platformio test -e native` | valid action/UUID/locker/requester parse | seven native tests pass |
| P1-A03 | same native suite | malformed JSON/no ACK ID; correlatable missing field; invalid action/locker; stale check | error semantics pass |
| P1-A04 | same native suite | duplicate cache/ACK replay and cold-boot state | original state preserved with `duplicate:true`; lock `UNKNOWN` |

The exact executed results are in `evidence/phase-1/automated-results.md`. The literal fixtures are in `firmware/test/test_command_contract/test_main.cpp`; no mock asserts an internal implementation call.

## Required manual HARD-GATE tests

All rows remain **pending** until a real tester with hardware/phone/broker completes the procedure and stores the requested redacted evidence. These are not optional for Phase 1 to leave `ACTIVE`.

| ID | Procedure | Expected result | Evidence |
|---|---|---|---|
| P1-M01 | With SG90 unloaded and 5 V rail verified, send alternating valid `UNLOCK`/`LOCK` commands through authenticated broker. | Correct travel, no jitter/reset; ACK/state matches each completed command. | video, angle values, voltage/current note |
| P1-M02 | Mount the latch and repeat lock/unlock under actual mechanical load. | Latch reliably works without stall, excess travel, or heat. | latch photos/video, defect note if any |
| P1-M03 | Observe 5 V rail and serial/broker while SG90 starts/reverses. | No brownout, ESP32 reset, or MQTT loss; measured margin recorded. | meter/scope image plus timestamped serial/broker log |
| P1-M04 | Connect DHT22/OLED; run several 2.5-second cycles. | OLED shows plausible temperature/humidity and continues updating. | OLED image/video plus serial diagnostic |
| P1-M05 | Safely disconnect DHT data/sensor, then restore it. | OLED shows DHT22 error; firmware/MQTT remains responsive; no DHT topic/card exists. | video and broker topic inventory |
| P1-M06 | Send `LED_ON` then `LED_OFF`; check configured brightness and supply. | LED and ACK/state agree; data/power stable. | video, LED count/brightness, voltage/current note |
| P1-M07 | Keep LED ON while operating SG90. | OLED/ESP32/MQTT remain stable; no abnormal flicker/reset. | video plus broker/serial log |
| P1-M08 | Send USB `R`, use phone to join `Locker-Setup`, enter test Wi-Fi, restart. | Captive portal works, credentials stay only in NVS, MQTT reconnects without reflash. | redacted screen recording and broker log |
| P1-M09 | Abruptly stop Wi-Fi or broker, then restore it. Repeat more than once. | retained LWT `OFFLINE`, bounded retry, retained `ONLINE` and full state after recovery. | timestamped broker capture |
| P1-M10 | First set lock known, then restart board; observe SG90 before new command. Send `GET_STATE`, then a new lock action. | No boot motion/replay; cold state lock `UNKNOWN`, alarm inactive, LED off; only new action confirms lock. | servo video, boot log, broker transcript |
| P1-M11 | Subscribe with a fresh client after ESP32 is online/reconnected. | Retained availability/state arrive; old door telemetry is not replayed as an event. | broker subscription capture |

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
