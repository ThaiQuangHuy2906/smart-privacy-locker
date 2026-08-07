# Phase 1 architecture

## Boundary

Phase 1 is an ESP32 firmware foundation. The eventual command path is:

```text
Authenticated Dashboard -> Node-RED policy/dispatcher -> authenticated MQTT broker -> ESP32
ESP32 -> ACK/state/availability -> MQTT broker -> Node-RED
```

Dashboard code must not contain MQTT credentials or publish directly to the ESP32. Node-RED authentication, ownership, dispatcher, dashboard, Supabase, CB1, YC6, YC8, YC9, CB3, YC4, YC5, and YC7 are explicitly outside this branch.

The YC1 path is deliberately local:

```text
DHT22 -> EnvironmentMonitor -> DisplayController (OLED SSD1306)
```

There is no temperature/humidity MQTT publisher in the source.

## Firmware modules

| Module | Responsibility | Phase 1 behavior |
|---|---|---|
| `state_manager` | One in-memory full-state source | cold boot defaults; only a completed lock action confirms lock state |
| `command_handler` | Parse and validate MQTT v1 command JSON | validates schema, UUID, topic/device locker, action, timestamp, requester |
| `ack_publisher` | Serialize ACK and cache bounded results | cached ACK replay uses `duplicate:true` and original state/result/error |
| `mqtt_client` | Broker lifecycle | unique client ID, LWT, retained availability/state, bounded retry, subscription |
| `wifi_provisioning` | WiFiManager lifecycle | captive portal/non-blocking processing; USB-local configuration reset |
| `lock_controller` | CB2 SG90 | attach/write only after valid lock action, settle, detach, then confirm state |
| `led_controller` | YC3 WS2812B | configured brightness and pixel count; changes only on LED actions |
| `environment_monitor` | YC1 DHT22 | 2.5-second polling with a valid/error reading |
| `display_controller` | YC1 OLED | local value/error render plus Wi-Fi/MQTT status |
| `time_utils` | NTP plausibility guard | stale check only after time sync; no invented timestamp if unsynced |

## Cooperative loop

`loop()` runs five short activities in order: serial reset command, Wi-Fi portal/process, MQTT tick/reconnect, servo completion, and environment/display refresh. Servo motion is a finite state: `start()` attaches and writes once; `tick()` completes after configured settle time, detaches, and lets `main` publish ACK/state. No incoming callback executes a servo motion twice for the same cached command ID.

## Recovery and safe boot

At cold boot, the source of truth is:

```json
{"door":"UNKNOWN","lock":"UNKNOWN","alarm":"INACTIVE","led":"OFF"}
```

The SG90 is not attached in `setup()`; no NVS lock position is restored and no command is replayed. After a broker reconnect the client first confirms the command subscription. It only then marks MQTT connected and publishes retained `ONLINE` followed by full state; callbacks are processed later from `mqtt_.loop()`. A subscription failure instead leaves MQTT state false, publishes retained `OFFLINE` when possible, disconnects, and follows the bounded retry schedule. A Node-RED consumer must still use availability and staleness, not retained state alone, to decide whether the device is live.

See [mqtt-contract.md](mqtt-contract.md) for exact data semantics and [../hardware/assembly-guide.md](../hardware/assembly-guide.md) for physical safety gates.
