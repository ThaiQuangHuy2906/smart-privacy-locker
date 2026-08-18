# Normalized event and Phase 3 adapter contract v1

**Schema version:** `1`

**Producer:** Phase 2 Node-RED orchestration

**Consumers:** Phase 2 latest-alert/Telegram and Phase 3 persistence,
chart/report/history

This contract is additive to MQTT v1 and does not change any MQTT topic, enum,
retain, ACK, timeout or QoS behavior. Fixtures live in
`tests/fixtures/phase-2/`.

Audit note 2026-08-18: the automated event/adapter suite passes. Current live
provider/database evidence remains tied to its historical test records and was
not rerun during this audit. Physical producers and final E2E remain open.

## Normalized event

Every event contains:

- `schema_version`, UUID `event_id`, `event_type`, and `locker_id`;
- `device`, nullable `action`, `source`, `result`, and nullable `authorized`;
- nullable correlated `command_id`, complete nullable `device_state`, and safe
  nullable `error`;
- UTC `occurred_at` and server `recorded_at`;
- verified user/service `principal` when applicable;
- nullable `notification_status` and metadata that must not contain secrets.

Door states are `OPEN|CLOSED|UNKNOWN`; lock `LOCKED|UNLOCKED|UNKNOWN`; alarm
`ACTIVE|INACTIVE|UNKNOWN`; LED `ON|OFF|UNKNOWN`. Event source is
`sensor|dashboard|system|automation`; result is
`observed|success|failure|rejected|timeout`. Canonical event types remain those
listed in `PLAN.md` and enforced by the Phase 3 migration. An additive new type
requires a documented contract update; changing a field's type or meaning
requires a new schema version.

Each successful `UNLOCK` ACK completed while the door is `CLOSED` grants one
opening for 30 seconds. The first stable `CLOSED→OPEN` consumes that grant. A
stable observed `OPEN→CLOSED` then starts a local latch lock; if the door is
never opened, expiry starts that lock while the door remains closed. These
automatic operations publish retained state after completion but do not create
a command ACK or a command-completion event. A later forced/reopened door is
unauthorized until the user issues `UNLOCK` again while closed. `LOCK`, expiry
and reboot revoke the grant.

Current firmware puts the authoritative boolean `authorized` decision in every
OPEN telemetry edge. `true` produces only `DOOR_OPENED authorized=true`;
`false` produces both `DOOR_OPENED authorized=false` and
`UNAUTHORIZED_OPEN authorized=false`. Charts and reports count the former as
an opening and the latter as an alert. CLOSED events use `authorized=null`.
Node-RED keeps the command window only as correlation and as a compatibility
fallback for legacy telemetry that omits the field; it does not override an
explicit firmware decision after a backend restart. A retained OPEN snapshot
is reconciled as unauthorized only when it also reports local
`alarm=ACTIVE`; otherwise Node-RED waits for authoritative transition telemetry
instead of manufacturing a false alert.

A stable OPEN episode is deduplicated until CLOSED. Firmware assigns a UUIDv4
`event_id` to every debounced door transition and keeps a bounded RAM outbox
while MQTT is unavailable; Node-RED uses it as the Phase 3
persistence/idempotency key. Legacy/synthetic door payloads may omit it, in
which case Node-RED derives a server event identity. Replaying the same
firmware `event_id` is idempotent for alarm, persistence and notification side
effects.

Retained availability payloads with a non-null `sent_at` derive a stable UUID
from `(locker_id, status, sent_at)`. Replaying the same retained ONLINE/OFFLINE
payload after a Node-RED restart therefore reaches Supabase with the same
`event_id` and is ignored as a duplicate. A retained availability payload whose
`sent_at` is null updates only live readiness/cache. It is not persisted as
history because distinct pre-NTP transitions have no stable identity across
restarts; fabricating a receive-time ID would create duplicate history.

If device time is unsynchronized, `occurred_at` is Node-RED receive time and
metadata records `device_time_unsynced:true`; Node-RED never invents device
time.

## Alarm request/ACK interface

YC6 calls only the private internal dispatcher with `ALARM_ON` and
`requested_by=system:unauthorized-detector`. It still checks locker readiness,
freshness, MQTT availability and pending alarm conflicts. The command and ACK
remain MQTT v1.

Phase 3 implements the CB3 alarm controller and integrates `ALARM_ON/OFF` with
full state and correlated ACK handling. Native tests and a clean firmware build
exercise the software path. Real buzzer polarity/current, GPIO behavior and a
physical `alarm=ACTIVE` ACK remain P3-M01/P3-M02 hardware final gates.

Likewise, a successful SG90 command event records completion of the firmware's
timed latch-control cycle, not measured latch position. The as-built uses a
rotating servo latch but has no angle/limit feedback; MC-38 separately reports
whether the door is open or closed.

Timeout is 5000 ms by default, does not retry the actuator, and may send one
`GET_STATE`. A timeout never becomes success merely because a late ACK arrives.

## History adapter

Request fields are `schema_version:1`, UUID `request_id`, `locker_id`, natural
language `question`, verified UUID `requested_by`, and UTC `requested_at`. It is
an internal call after the HTTP Bearer/ownership gate; it contains no JWT.

Response echoes `schema_version`, `request_id`, and `locker_id`; includes a UTC
half-open `range`, newest-first event summaries, and `source` provenance. The
backend paginates Supabase results in deterministic `(occurred_at,event_id)`
order and deduplicates overlapping offset pages by `event_id`, so a concurrent
insert cannot inflate aggregation/chatbot/report counts and results are not
silently truncated at the Data API's 1000-row page. A controlled
`EVENT_DATASET_TOO_LARGE` error is returned if the configured safety ceiling is
exceeded. Node-RED—not Gemini—computes open/alert counts. Adapter/contract tests
and the deployed owner-scoped history path pass.

## Notification delivery status

Telegram event delivery uses channel `telegram` and status
`delivered|failed|duplicate_suppressed|rate_limited`, with bounded attempts,
UTC attempt time and a safe nullable error `{code,message}`. Token and chat ID
are never event fields. Telegram delivery remains asynchronous from the alarm
path: `ALARM_ON` enters MQTT egress without waiting for Telegram.

Daily email delivery is durable in `notification_deliveries`. Its database
state is `pending|sending|delivered|failed|delivery_unknown|duplicate_suppressed`:

- a canonical `(locker_id, channel, report_date)` reservation prevents aliases
  of the same local day from sending twice;
- definite non-delivery may transition to `failed` and retry, capped at three
  attempts;
- a stale pre-SMTP `pending` reservation may be reclaimed;
- a stale or otherwise ambiguous `sending` attempt becomes
  `delivery_unknown` and is not automatically resent;
- `delivered` is recorded only after SMTP acceptance and a successful guarded
  database transition.

Failure does not discard normalized events or crash/retry forever. Runtime
event/diagnostic/status buffers and Telegram event/locker dedupe maps are
bounded; eviction affects only old in-memory operational evidence, not the
normalized event handed to the persistence interface.

If persistence fails, Node-RED keeps a bounded in-memory retry outbox and moves
exhausted/full-outbox records to an explicit dead-letter collection exposed by
health state. A periodic FlowFuse runtime tick invokes due retries. This outbox
is intentionally RAM-only: a Node-RED process restart can still lose events
that had not reached durable Supabase storage.

## Compatibility log

- `2026-08-08`: v1 frozen for Phase 2; defined normalized events, YC6
  `ALARM_ON` handoff, correlated history request/response and Telegram status.
- `2026-08-10`: Phase 3 implemented the frozen persistence/history interface,
  CB3 software controller and durable daily-email delivery state machine. MQTT
  schema remains v1 unchanged.
- `2026-08-18`: door telemetry gained optional UUIDv4 `event_id`; firmware
  gained a bounded RAM replay outbox/local alarm, retained-state reconciliation
  and Node-RED persistence retry/dead-letter health. Existing v1 payloads remain
  accepted.
- `2026-08-18`: OPEN telemetry gained additive optional `authorized` for legacy
  compatibility. Current firmware emits it and enforces one opening per
  successful closed-door `UNLOCK`; legacy producers remain accepted through
  the bounded backend window fallback.
