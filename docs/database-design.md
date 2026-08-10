# Phase 3 database design

Phase 3 uses three owner-scoped tables created by
`supabase/migrations/202608100001_phase3_events_notifications.sql`.

| Table | Purpose | Idempotency / access |
|---|---|---|
| `device_events` | Canonical door, lock, alarm, LED, availability, timeout and notification events | `event_id` primary key; owners read; service role writes |
| `notification_settings` | Per-locker Telegram/email switches, destinations, local report time and timezone | one row per locker; owner read/insert/update |
| `notification_deliveries` | Email/Telegram delivery outcome and bounded error metadata | unique locker + channel + report key; owners read; service role writes |

`device_events` is queried newest-first by `(locker_id, occurred_at)` and can
also filter `(locker_id, event_type, occurred_at)`. The event adapter sends only
the frozen normalized contract fields; raw MQTT payloads, JWTs and provider
credentials are never stored.

The backend service role is required because browser users cannot insert device
events or delivery outcomes. It stays in the Node-RED environment. Every
browser-facing history/chart/settings route first verifies the Bearer session
and locker ownership; direct table reads are additionally restricted by RLS.

Daily aggregation uses local calendar boundaries in the setting's timezone.
The report key is `YYYY-MM-DD:timezone`, so repeated scheduler ticks reserve one
delivery intent for that locker/day/channel. A live two-user Supabase test is
still required before release; static SQL and adapter tests do not replace it.
