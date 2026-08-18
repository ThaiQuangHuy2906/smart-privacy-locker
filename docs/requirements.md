# Requirement traceability — Phases 1–3

This file records the current implementation and evidence state. Historical
phase baselines remain in `PLAN.md`; they do not override this current registry.

Evidence snapshot 2026-08-18: automated software gates pass; OLED/DHT22,
MC-38-to-Telegram, ten WS2812 pixels and SG90 travel have individual
user-observed results. They remain `PARTIAL / USER-REPORTED` until the common
release firmware, synchronized MQTT/UI evidence and full E2E sequence pass.
Unmeasured power/full-load finding P1-05 is a user-accepted demo-only risk, not
measured evidence. See
[../HUONG_DAN_TEST_END_TO_END.md](../HUONG_DAN_TEST_END_TO_END.md).

## Phase 1 — firmware foundation

| Requirement | Owner | Module(s) | Verification route | Current evidence status |
|---|---|---|---|---|
| CB2 — SG90 rotating latch (`LOCK/UNLOCK` protocol compatibility) | Thái Quang Huy — 24127177 | `lock_controller`, `door_security`, `main`, ACK/state | native cold-boot/interlock/state tests; P1-M01–P1-M03/P1-M10 manual | source/build PASS; user observed lock `80°`/unlock `170°` and photos confirm the latch; no angle feedback, synchronized mechanical evidence pending |
| YC1 — DHT22 to local OLED | Thái Quang Huy — 24127177 | `environment_monitor`, `display_controller` | clean build; P1-M04–P1-M05 manual | source/build PASS; user observed plausible values on OLED; repeated error/recovery evidence pending |
| YC3 — WS2812B ON/OFF | Thái Quang Huy — 24127177 | `led_controller`, `command_handler`, ACK/state | parser/ACK tests; P1-M06–P1-M07 manual | source/build PASS; user observed configured 10 pixels lit; ACK/state, 20-cycle and combined-load evidence pending |
| YC12 — WiFiManager captive portal | Thái Quang Huy — 24127177 | `wifi_provisioning`, validated MQTT live state, fresh-cache API mapping, Dashboard device guidance | clean build; Node/Dashboard/artifact contract tests; P1-M08–P1-M11 manual | software path PASS, including stale-safe Wi-Fi status and local-only setup guidance; physical portal/reconnect pending |

The shared Phase 1 foundation is `mqtt_client`, `state_manager`,
`command_handler`, and `ack_publisher`. It implements the frozen MQTT v1 action
allowlist and supplies the command/ACK/state contract consumed by later phases.

## Phase 2 — security orchestration

| Requirement | Owner | Module(s) | Verification | Current evidence |
|---|---|---|---|---|
| CB1 | Nguyễn Văn Minh — 24127205 | `door_sensor`, `door_security`, UUIDv4 MQTT telemetry with `authorized`, RAM replay, local auto-lock, cache/Dashboard | P2-A01/P2-S01; P2-M01/P2-M02 | automated/simulator PASS, including one-time grant, lock-on-close, exact expiry, later unauthorized-open alarm and outbox/reconciliation; user observed MC-38 triggering Telegram, but synchronized auto-lock/alarm physical evidence remains pending |
| YC6 | Nguyễn Văn Minh — 24127205 | firmware-first one-time authorization, `security`, dispatcher internal entry, normalized events, owner-scoped Telegram linking/delivery | P2-A09–P2-A11; P2-M06/P2-M07 | valid/later unauthorized OPEN, legacy same-state re-arm, expiry/restart and delivery success/failure software tests PASS; deployed Dashboard/secret/webhook/private-Start/link/test-message/sanitized-response subset PASS; preference re-enable, token replay, disconnect/relink and physical forced-open buzzer remain pending |
| YC8 | Nguyễn Văn Minh — 24127205 | `chatbot`, live/history routing and grounded Gemini context | P2-A12/P2-A13; P2-M08 | automated and live Gemini success/failure PASS; owner-scoped Phase 3 real-history route PASS; final hardware/deployed regression pending |
| YC9 | Nguyễn Văn Minh — 24127205 | Bearer auth, Dashboard session, ownership/RLS/claim | P2-A03; P2-M03–P2-M05 | automated and live registration/session/isolation/claim gates PASS |

Phase 2 remains the owner of YC6/YC8 logic. Phase 3 consumes its frozen alarm,
event, history and authentication interfaces without transferring ownership.

## Phase 3 — data integration and final Dashboard

| Requirement | Owner | Module(s) | Verification | Current evidence |
|---|---|---|---|---|
| CB3 | Mai Phương Thùy — 24127249 | `alarm_controller`, `door_security`, `main`, ACK/state, Dashboard **Bật còi/Tắt còi** (`ALARM_ON/OFF`) | P3-A01; P3-M01/P3-M02 | native/build software PASS; local CLOSED→OPEN activation path covered; COM4 upload and isolated inactive HIGH with module VCC 3V3 observed PASS; LOW sound on GPIO26/repeated production boot/ACK pending |
| YC4 | Mai Phương Thùy — 24127249 | Supabase migrations/RLS, `data`, bounded persistence retry/dead-letter, deterministic history, Dashboard history | P3-A02/P3-A03; P3-M03/P3-M04 | automated tests PASS; dev migration, pgTAP owner isolation, wrong-owner deny and correct-owner history PASS; RAM outbox restart limitation documented; physical producers pending |
| YC5 | Mai Phương Thùy — 24127249 | timezone aggregation, 7/30-day chart and accessible data table | P3-A04; P3-M05 | automated boundary/zero-bucket/UI tests PASS; deployed owner, 7/30-day, empty-bucket and local-midnight boundary paths PASS |
| YC7 | Mai Phương Thùy — 24127249 | notification settings, scheduler, localized email renderer/delivery state machine | P3-A05/P3-A06; P3-M06 | automated previous-local-day/content/notification-exclusion/timezone/retry/dedupe/ambiguous-outcome tests PASS; deployed Mailtrap SMTP success and controlled definite failure PASS |

The current Phase 3 source also connects YC6 normalized events to persistence
and connects YC8 history queries to Supabase. Those adapters are covered by
software tests. The development deployment has exercised owner-scoped history,
the chart boundary, daily SMTP success/failure, and the non-destructive
automatic Telegram link subset. Hardware-dependent and remaining full
end-to-end/lifecycle gates are still pending. Consequently the branch is
suitable for software handoff, not yet `FINAL_RELEASE_READY`. The live service
passes above are historical sanitized evidence and were not rerun in the
2026-08-18 audit; do not relabel them as a current deployment pass without a
new test record.
