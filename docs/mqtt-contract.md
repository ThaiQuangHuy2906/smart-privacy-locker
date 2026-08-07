# MQTT contract v1 — Phase 1 submission

**Schema version:** `1`

**Status:** implemented by Phase 1 firmware; **pending required review/freeze by Nguyễn Văn Minh**. Do not change topics, enum strings, fields, timeout semantics, or error behavior unilaterally.

This document transcribes the Phase 1 shared contract from `PLAN.md` Section 4 and records the actual firmware constraint that PubSubClient publishes at QoS 0.

## Topics and retained behavior

Base topic: `locker/{locker_id}`. The `locker_id` in topic and payload must match exactly.

| Topic | Publisher | Subscriber | Retained | QoS in Phase 1 firmware | Purpose |
|---|---|---|---:|---:|---|
| `locker/{locker_id}/command` | Node-RED | ESP32 | no | broker/client configured maximum; ESP32 receives no retained command | actuator/`GET_STATE` request |
| `locker/{locker_id}/ack` | ESP32 | Node-RED | no | 0 | correlated command result |
| `locker/{locker_id}/state` | ESP32 | Node-RED | yes | 0 | latest complete device state |
| `locker/{locker_id}/telemetry/door` | ESP32 (Phase 2) | Node-RED | no | 0 when added | debounced transition; not a replay log |
| `locker/{locker_id}/availability` | ESP32/LWT | Node-RED | yes | 0 | current online/offline indication |

PubSubClient has no QoS 1 publish API in this implementation. Node-RED must wait for a valid ACK and use timeout plus `GET_STATE` reconciliation; it must not infer success from broker publish alone.

## Command

```json
{
  "schema_version": 1,
  "command_id": "550e8400-e29b-41d4-a716-446655440000",
  "locker_id": "LOCKER-001",
  "action": "UNLOCK",
  "issued_at": "2026-08-07T08:00:00.000Z",
  "requested_by": "550e8400-e29b-41d4-a716-446655440001"
}
```

Required rules:

- `schema_version` is integer `1`; `command_id` is a UUID; `locker_id`, `action`, `issued_at`, and `requested_by` are non-empty strings of bounded size.
- `locker_id` must match both the subscribed topic and device `LOCKER_ID` configuration.
- Actions are exactly `LOCK`, `UNLOCK`, `ALARM_ON`, `ALARM_OFF`, `LED_ON`, `LED_OFF`, and `GET_STATE`.
- `issued_at` must be ISO-8601 UTC (`YYYY-MM-DDTHH:MM:SSZ` or millisecond form). Once NTP is plausibly synchronized, the ESP32 rejects only commands older than `COMMAND_MAX_AGE_SECONDS` (default 120). Without time sync it records a local diagnostic and relies on non-retained command, clean session, and Node-RED timeout.
- `requested_by` is either a user UUID or the internal-only `system:unauthorized-detector` service principal. Browser input must never choose this field; Node-RED fills it after authentication.
- Firmware does not decide user authorization. Node-RED/broker authentication is the upstream trust boundary.

## ACK

```json
{
  "schema_version": 1,
  "command_id": "550e8400-e29b-41d4-a716-446655440000",
  "locker_id": "LOCKER-001",
  "action": "UNLOCK",
  "result": "success",
  "device_state": {
    "door": "UNKNOWN",
    "lock": "UNLOCKED",
    "alarm": "INACTIVE",
    "led": "OFF"
  },
  "error": null,
  "duplicate": false,
  "timestamp": "2026-08-07T08:00:01Z"
}
```

`result` is `success` or `error`. `device_state` is always complete and uses only documented enums. On an unsynchronized ESP32, `timestamp` is `null` rather than a fabricated time; Node-RED must add its own UTC receive time for storage/display.

For an error, `error` is `{ "code": "STABLE_CODE", "message": "safe text" }`. Phase 1 emits `MISSING_FIELD`, `INVALID_SCHEMA`, `INVALID_ACTION`, `INVALID_REQUESTED_BY`, `INVALID_ISSUED_AT`, `LOCKER_MISMATCH`, `STALE_COMMAND`, and `ACTUATION_FAILED`. The last covers a busy servo and `ALARM_ON/OFF` before Phase 3; it never toggles buzzer hardware. An invalid/missing action is represented as `action:"UNKNOWN"` only in an error ACK because no valid action exists to echo.

Malformed JSON that cannot yield a valid UUID produces **no normal ACK** and no invented `command_id:null`. When valid JSON has a valid `command_id` but fails another rule, it produces a correlated error ACK. Node-RED must let the no-ID request time out/reconcile rather than marking it successful.

The recent-command cache has 16 bounded in-memory entries by default. A repeated completed ID does not actuate again: it replays the cached original result/state/error with `duplicate:true`. A duplicate arriving while a servo action is still settling is ignored until the original completion ACK is published; it does not start another movement.

## Full state

```json
{
  "schema_version": 1,
  "locker_id": "LOCKER-001",
  "door": "UNKNOWN",
  "lock": "UNKNOWN",
  "alarm": "INACTIVE",
  "led": "OFF",
  "wifi_connected": true,
  "mqtt_connected": true,
  "timestamp": null
}
```

Enums: door `OPEN|CLOSED|UNKNOWN`; lock `LOCKED|UNLOCKED|UNKNOWN`; alarm `ACTIVE|INACTIVE|UNKNOWN`; LED `ON|OFF|UNKNOWN`; availability `ONLINE|OFFLINE`. State is retained and published after MQTT connect/reconnect, after a successful state transition, and after any command response. Retained state is last-known data, not proof of device liveness.

Cold boot is fixed: `door=UNKNOWN`, `lock=UNKNOWN`, `alarm=INACTIVE`, `led=OFF`. The servo is neither attached nor moved at boot, no old command is replayed, and lock cannot become confirmed until a new `LOCK`/`UNLOCK` operation finishes. `GET_STATE` returns an ACK plus the current retained full state; it does not infer mechanics.

## Availability, LWT, and recovery

At MQTT connect, the ESP32 registers a retained LWT `OFFLINE` payload and confirms subscription to command. A transport connection is not operational until that subscription succeeds. Only then does it mark MQTT connected and publish retained `ONLINE` followed by full state. PubSubClient invokes received-message callbacks only from a later `mqtt_.loop()` call, so normal command processing still begins after those recovery publications. If subscription is rejected, firmware keeps MQTT state false, publishes retained `OFFLINE` when possible, disconnects, and schedules the same bounded reconnect; it never publishes `ONLINE` or full state for that rejected connection. Payload shape:

```json
{"schema_version":1,"locker_id":"LOCKER-001","status":"ONLINE","sent_at":"2026-08-07T08:00:01Z"}
```

`sent_at` may be `null` before NTP sync. LWT `sent_at` reflects registration time, not broker-disconnect time; Node-RED must record `observed_at` when it receives LWT. Graceful firmware shutdown calls retained `OFFLINE` before disconnect when possible.

Reconnect starts at 1 second and doubles to a maximum of 30 seconds without a busy loop. A configuration placeholder suppresses attempts rather than logging secret material. MQTT session is clean; commands are non-retained and never queued/replayed across downtime.

## Node-RED obligations (Phase 2)

Generate UUID v4 server-side; maintain pending request/domain/deadline; disable conflicting controls; accept ACK only when schema, pending ID, locker, and expected action/state are valid. Default timeout is 5000 ms: show controlled timeout, do not retry an actuator, issue one `GET_STATE` if connected. Restart clears pending commands and unlock windows; only fresh availability plus state enables controls. These obligations are not implemented in Phase 1 firmware.

## Compatibility/test fixtures

Breaking changes require a new schema version and same-change updates to producers, consumers, fixtures, and migration notes. The implementation fixtures are in `firmware/test/test_command_contract/test_main.cpp`; current evidence is in `tests/evidence/phase-1/`.
