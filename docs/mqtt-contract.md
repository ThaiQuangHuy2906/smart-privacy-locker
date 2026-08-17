# MQTT contract v1 — frozen Phase 2 baseline

**Schema version:** `1`

**Status:** the Phase 1 command/state contract was reviewed/frozen by Nguyễn Văn
Minh for Phase 2 on 2026-08-08. The 2026-08-17 reliability correction preserves
all existing schema fields, enums, QoS and retained semantics and adds one
backward-compatible operational `heartbeat` topic.

**Audit note 2026-08-17:** native/build/Node contract gates pass. Firmware now
applies a symmetric 120-second past/30-second future bound once time is synced
and refreshes liveness/state every 10 seconds. A servo success ACK remains an
open-loop timed-controller result rather than physical position feedback.

This document transcribes the Phase 1 shared contract from `PLAN.md` Section 4 and records the actual firmware constraint that PubSubClient publishes at QoS 0.

## Topics and retained behavior

Base topic: `locker/{locker_id}`. The `locker_id` in topic and payload must match exactly.

| Topic | Publisher | Subscriber | Retained | QoS in Phase 1 firmware | Purpose |
|---|---|---|---:|---:|---|
| `locker/{locker_id}/command` | Node-RED | ESP32 | no | broker/client configured maximum; ESP32 receives no retained command | actuator/`GET_STATE` request |
| `locker/{locker_id}/ack` | ESP32 | Node-RED | no | 0 | correlated command result |
| `locker/{locker_id}/state` | ESP32 | Node-RED | yes | 0 | latest complete device state |
| `locker/{locker_id}/heartbeat` | ESP32 | Node-RED | no | 0 | current application liveness; never a history event |
| `locker/{locker_id}/telemetry/door` | ESP32 | Node-RED | no | 0 | Phase 2 debounced transition; not a replay log |
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
- `issued_at` must be ISO-8601 UTC (`YYYY-MM-DDTHH:MM:SSZ` or millisecond form). Once NTP is plausibly synchronized, ESP32 rejects commands older than `COMMAND_MAX_AGE_SECONDS` (default 120) as `STALE_COMMAND`, and timestamps more than `COMMAND_MAX_FUTURE_SKEW_SECONDS` ahead (default 30) as `INVALID_ISSUED_AT`. Without trustworthy time it records a local diagnostic and relies on non-retained command, clean session, and Node-RED timeout; it does not pretend it can enforce wall-clock age.
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

For `LOCK`/`UNLOCK`, success means the SG90 state machine accepted the action,
wrote the configured angle and reached its 550 ms settle deadline. The selected
SG90 has no position/current feedback, and the as-built product has no latch;
the arm directly closes/opens the door. A jam, detached horn or insufficient
force is therefore not proven absent by ACK. Use MC-38 plus physical evidence
for actual door outcome.

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

Enums: door `OPEN|CLOSED|UNKNOWN`; lock `LOCKED|UNLOCKED|UNKNOWN`; alarm `ACTIVE|INACTIVE|UNKNOWN`; LED `ON|OFF|UNKNOWN`; availability `ONLINE|OFFLINE`. State is retained and published after MQTT connect/reconnect, after a successful state transition, after any command response, and every 10 seconds immediately after heartbeat. Retained state is last-known data, not proof of device liveness by itself.

Cold boot is fixed: `door=UNKNOWN`, `lock=UNKNOWN`, `alarm=INACTIVE`, `led=OFF`. The servo is neither attached nor moved at boot, no old command is replayed, and lock cannot become confirmed until a new `LOCK`/`UNLOCK` operation finishes. `GET_STATE` returns an ACK plus the current retained full state; it does not infer mechanics.

The compatibility enum names remain `LOCKED`/`UNLOCKED`, but consumers should
present them as commanded close/open status unless a separate physical signal
confirms the door. Retained values remain last-known even when the mechanism is
manually moved after power loss.

## Availability, LWT, and recovery

At MQTT connect, the ESP32 registers a retained LWT `OFFLINE` payload and sends the command `SUBSCRIBE` packet. In PubSubClient 2.8, `subscribe(...) == true` means that the local transport wrote the complete packet; it does **not** wait for or expose broker `SUBACK` grant/rejection. Firmware treats that local/send success as its readiness boundary, marks MQTT connected, publishes retained `ONLINE`, then immediately publishes retained full state. The backend requires state observed after `ONLINE` in the same ingress generation before it enables controls, so the short two-packet bootstrap cannot expose trusted stale state. PubSubClient invokes received-message callbacks only from a later `mqtt_.loop()` call, so normal command processing begins after both publications. If subscribe or either retained bootstrap publish fails, firmware sets MQTT false, publishes retained `OFFLINE` best-effort, disconnects, and schedules bounded reconnect; it never leaves the incomplete bootstrap as ready. Broker ACL is a deployment/configuration prerequisite; a broker rejection conveyed by `SUBACK` is not observable to this library. Availability payload shape:

```json
{"schema_version":1,"locker_id":"LOCKER-001","status":"ONLINE","sent_at":"2026-08-07T08:00:01Z"}
```

`sent_at` may be `null` before NTP sync. LWT `sent_at` reflects registration time, not broker-disconnect time; Node-RED must record `observed_at` when it receives LWT. Graceful firmware shutdown calls retained `OFFLINE` before disconnect when possible.

Reconnect starts at 1 second and doubles to a maximum of 30 seconds without a busy loop. A configuration placeholder suppresses attempts rather than logging secret material. MQTT session is clean; commands are non-retained and never queued/replayed across downtime.

While connected, firmware publishes this heartbeat every
`MQTT_HEARTBEAT_INTERVAL_MS` (default 10,000 ms), non-retained:

```json
{"schema_version":1,"locker_id":"LOCKER-001","sent_at":"2026-08-07T08:00:11Z"}
```

`sent_at` may be `null` before NTP sync. A valid heartbeat only advances the
receive-time observation for an already `ONLINE` current connection generation;
it cannot revive retained-only data, an explicit `OFFLINE`, or a previous
generation. It creates no `DEVICE_ONLINE` history row. A retained full-state
refresh follows each heartbeat so current controls depend on both liveness and
validated state. Failure to publish either packet triggers the normal
OFFLINE/disconnect/retry path.

## Node-RED obligations (Phase 2)

Generate UUID v4 server-side; maintain pending request/domain/deadline; disable conflicting controls; accept ACK only when schema, pending ID, locker, and expected action/state are valid. Default timeout is 5000 ms: show controlled timeout, do not retry an actuator, issue one `GET_STATE` if connected. Restart clears pending commands and unlock windows; only fresh availability plus state enables controls. The Phase 2 implementation is in `node-red/lib/` and the modular export is `node-red/flows.json`.

The dispatcher protects pending/state from unknown, late or mismatched ACKs.
Those schema-valid anomalies return `accepted:false` and enter a bounded,
sanitized diagnostic path with the code/topic/locker/command identity; raw
payloads and credentials are excluded. A valid correlated error ACK is accepted
as the device's completed failure response, closes only its matching pending
command, and refreshes reported state without being shown as success.

The deployment uses distinct broker principals. Node-RED is the trusted
multi-locker policy boundary and needs Publish + Subscribe on `locker/+/#` so
its concrete subscriptions `locker/+/+` and `locker/+/telemetry/door` are
authorized. Each ESP32 remains limited to `locker/<LOCKER_ID>/#`. Reusing the
device-scoped permission for Node-RED is invalid: authentication can succeed
while the broker rejects the wildcard subscriptions, leaving the cache offline
and preventing ACK/security processing. The broader Node-RED secret remains in
the FlowFuse credential store and is never shipped to firmware or the browser.

## Compatibility/test fixtures

Breaking changes require a new schema version and same-change updates to producers, consumers, fixtures, and migration notes. The implementation fixtures are in `firmware/test/test_command_contract/test_main.cpp`; current evidence is in `tests/evidence/phase-1/`.

## Phase 2 review/change log

- `2026-08-08` — Nguyễn Văn Minh reviewed producer/consumer fields, frozen v1 unchanged, implemented MC-38 telemetry producer and Node-RED validators. Additive non-MQTT normalized event/history/notification contracts are versioned separately in `event-contract.md`.
- `2026-08-17` — Added non-retained heartbeat and periodic retained-state refresh, generation-safe backend liveness, future-skew validation and explicit ACK-anomaly diagnostics. Existing command/ACK/state/availability/door payloads and v1 enums remain compatible.
