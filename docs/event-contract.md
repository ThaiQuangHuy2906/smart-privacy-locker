# Normalized event and Phase 3 adapter contract v1

**Schema version:** `1`

**Producer:** Phase 2 Node-RED orchestration
**Consumers:** Phase 2 latest-alert/Telegram; Phase 3 YC4 persistence, chart/report/history

This is additive to MQTT v1 and does not change any MQTT topic, enum, retain,
ACK, timeout, or QoS behavior. Fixtures live in `tests/fixtures/phase-2/`.

## Normalized event

Every event contains:

- `schema_version`, UUID `event_id`, `event_type`, and `locker_id`;
- `device`, nullable `action`, `source`, `result`, and nullable `authorized`;
- nullable correlated `command_id`, complete nullable `device_state`, and safe nullable `error`;
- UTC `occurred_at` and server `recorded_at`;
- verified user/service `principal` when applicable;
- nullable `notification_status` and metadata that must not contain secrets.

Door states are `OPEN|CLOSED|UNKNOWN`; lock `LOCKED|UNLOCKED|UNKNOWN`; alarm
`ACTIVE|INACTIVE|UNKNOWN`; LED `ON|OFF|UNKNOWN`. Event source is
`sensor|dashboard|system|automation`; result is
`observed|success|failure|rejected|timeout`. Canonical types remain those listed
in `PLAN.md` Section 4. Unknown new type requires an additive contract update;
changed field type/meaning requires a new schema version.

An unauthorized stable transition produces two distinct events: one
`DOOR_OPENED authorized=false` and one `UNAUTHORIZED_OPEN authorized=false`.
Charts/reports count `DOOR_OPENED` as opens and `UNAUTHORIZED_OPEN` as alerts;
the pair represents one opening and one alert, not two alerts. A stable OPEN
episode is deduped until CLOSED. `event_id` is the Phase 3 idempotency key.

If device time is unsynchronized, `occurred_at` is Node-RED receive time and
metadata records `device_time_unsynced:true`; Node-RED never invents device time.

## Alarm request/ACK interface

YC6 calls only the private internal dispatcher with `ALARM_ON` and
`requested_by=system:unauthorized-detector`. It still checks locker readiness,
freshness, MQTT availability, and pending alarm conflicts. The command and ACK
are unchanged MQTT v1. Phase 2 tests a consumer fixture; actual buzzer actuation
and a successful `alarm=ACTIVE` ACK remain CB3 Phase 3 scope.

Timeout is 5000 ms by default, does not retry the actuator, and may send one
`GET_STATE`. Timeout never becomes success when a late ACK arrives.

## History adapter

Request fields are `schema_version:1`, UUID `request_id`, `locker_id`, natural
language `question`, verified UUID `requested_by`, and UTC `requested_at`.
It is an internal call after the HTTP Bearer/ownership gate; it contains no JWT.

Response echoes `schema_version`, `request_id`, and `locker_id`; includes UTC
half-open `range`, newest-first bounded event summaries, and `source` provenance.
Phase 2 uses a deterministic fixture adapter. Phase 3 must query Supabase with
owner/RLS enforcement and return this exact shape. Node-RED—not Gemini—computes
open/alert counts from the response.

## Notification delivery status

The adapter emits `schema_version`, event ID, channel `telegram`, status
`delivered|failed|duplicate_suppressed|rate_limited`, bounded `attempts`, UTC
`attempted_at`, and a safe nullable error `{code,message}`. Token and chat ID are
never fields. Failure does not discard normalized events or crash/retry forever.
Notification delivery is asynchronous from the alarm path: `ALARM_ON` enters
MQTT egress without waiting for Telegram. The completed delivery status is a
separate Phase 3 hook and may update the in-memory latest event status.
Runtime event/diagnostic/status buffers and Telegram event/locker dedupe maps
are bounded; eviction affects only old in-memory operational evidence, not the
normalized event handed to the Phase 3 persistence interface.

## Compatibility log

- `2026-08-08`: v1 frozen for Phase 2; defines normalized events, YC6
  `ALARM_ON` handoff, correlated history request/response, and notification
  status. MQTT schema remains v1 unchanged.
