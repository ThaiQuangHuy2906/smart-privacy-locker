# Requirement traceability — Phase 1 and active Phase 2

| Requirement | Owner | Phase | Module(s) | Verification route | Current evidence status |
|---|---|---|---|---|---|
| CB2 — SG90 Lock/Unlock | Thái Quang Huy — 24127177 | 1 | `lock_controller`, `main`, ACK/state | native cold-boot/state test; P1-M01–M03/P1-M10 manual | source/build complete; manual pending |
| YC1 — DHT22 to local OLED | Thái Quang Huy — 24127177 | 1 | `environment_monitor`, `display_controller` | clean build; P1-M04–M05 manual | source/build complete; manual pending |
| YC3 — WS2812B ON/OFF | Thái Quang Huy — 24127177 | 1 | `led_controller`, `command_handler`, ACK/state | parser/ACK tests; P1-M06–M07 manual | source/build complete; manual pending |
| YC12 — WiFiManager captive portal | Thái Quang Huy — 24127177 | 1 | `wifi_provisioning`, firmware guide | clean build; P1-M08–M11 manual | source/build complete; manual pending |

Shared Phase 1 foundation is `mqtt_client`, `state_manager`, `command_handler`, and `ack_publisher`. It supports the frozen v1 action allowlist, including alarm actions needed later, but it does not actuate the Phase 3 buzzer.

Phase 2 does not implement actual CB3, YC4 persistence/history backend, YC5, or YC7. Their ownership and phase assignment remain exactly as recorded in `PLAN.md`.

| Requirement | Owner | Phase 2 module(s) | Verification | Current evidence |
|---|---|---|---|---|
| CB1 | Nguyễn Văn Minh — 24127205 | `door_sensor`, MQTT telemetry, cache/Dashboard | P2-A01/P2-S01; P2-M01/M02 | automated/simulator PASS; hardware deferred |
| YC6 | Nguyễn Văn Minh — 24127205 | `security`, dispatcher internal entry, events, Telegram | P2-A09–A11 | automated PASS; live Telegram final-gate pending |
| YC8 | Nguyễn Văn Minh — 24127205 | `chatbot`, history adapter/context | P2-A12/A13 | automated PASS; Gemini final-gate pending |
| YC9 | Nguyễn Văn Minh — 24127205 | auth gate, Dashboard session, migrations/RLS/claim | P2-A03 + P2-M03–M05 | automated contract PASS; manual hard-gate pending |

CB3 and YC4 remain owned by Mai Phương Thùy in Phase 3. Phase 2 provides only
the `ALARM_ON` and normalized event/history consumer contracts.
