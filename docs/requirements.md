# Requirement traceability — Phase 1 implementation

| Requirement | Owner | Phase | Module(s) | Verification route | Current evidence status |
|---|---|---|---|---|---|
| CB2 — SG90 Lock/Unlock | Thái Quang Huy — 24127177 | 1 | `lock_controller`, `main`, ACK/state | native cold-boot/state test; P1-M01–M03/P1-M10 manual | source/build complete; manual pending |
| YC1 — DHT22 to local OLED | Thái Quang Huy — 24127177 | 1 | `environment_monitor`, `display_controller` | clean build; P1-M04–M05 manual | source/build complete; manual pending |
| YC3 — WS2812B ON/OFF | Thái Quang Huy — 24127177 | 1 | `led_controller`, `command_handler`, ACK/state | parser/ACK tests; P1-M06–M07 manual | source/build complete; manual pending |
| YC12 — WiFiManager captive portal | Thái Quang Huy — 24127177 | 1 | `wifi_provisioning`, firmware guide | clean build; P1-M08–M11 manual | source/build complete; manual pending |

Shared Phase 1 foundation is `mqtt_client`, `state_manager`, `command_handler`, and `ack_publisher`. It supports the frozen v1 action allowlist, including alarm actions needed later, but it does not actuate the Phase 3 buzzer.

The following are intentionally not implemented in this branch: CB1, CB3, YC4, YC5, YC6, YC7, YC8, YC9. Their ownership and phase assignment remain exactly as recorded in `PLAN.md`.
