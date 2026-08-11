# Smart Privacy Locker database design

The application uses the owner-scoped Phase 3 tables created by
`supabase/migrations/202608100001_phase3_events_notifications.sql` plus the
backend-only Telegram link table added by
`202608110001_telegram_account_linking.sql`, with the deployed-RPC conflict
target forward-fix in `202608110002_telegram_link_consume_conflict_fix.sql` and
the constraint-safe preference upsert fix in
`202608110003_telegram_notification_preference_upsert_fix.sql`.

| Table | Purpose | Idempotency / access |
|---|---|---|
| `device_events` | Canonical door, lock, alarm, LED, availability, timeout and notification events | `event_id` primary key; owners read; service role writes |
| `notification_settings` | Per-locker Telegram/email switches, backend destinations, local report time and timezone | one row per locker; owners read only non-sensitive preference/link-status columns; Bearer/ownership-gated backend writes |
| `notification_deliveries` | Email/Telegram delivery state and bounded error metadata | unique locker + channel + local report date; owners read; service role writes |
| `telegram_link_tokens` | SHA-256 digest for a 10-minute one-time private-chat link | at most one active token per locker; service role only; no browser policy/grant |

`device_events` is queried newest-first by `(locker_id, occurred_at)` and can
also filter `(locker_id, event_type, occurred_at)`. The event adapter sends only
the frozen normalized contract fields; raw MQTT payloads, JWTs and provider
credentials are never stored.

The backend service role is required because browser users cannot insert device
events or delivery outcomes. It stays in the Node-RED environment. Every
browser-facing history/chart/settings route first verifies the Bearer session
and locker ownership; direct table reads are additionally restricted by RLS.

Telegram destinations are never accepted from a browser. The backend issues a
random URL-safe token, stores only its SHA-256 digest with the verified owner
and locker, and consumes it atomically when Telegram posts a private `/start`
update carrying the matching token. The webhook also requires Telegram's
secret header, and the private chat ID must equal the Telegram sender ID. An
exact retry by that same private account is idempotent after a lost HTTP
response; the consumed token can never be retargeted to another account.
Expired, cross-account, cross-owner and group-chat attempts cannot create a link.
Settings responses expose only `telegram_connected`, optional username and
link time; `telegram_chat_id` and `telegram_user_id` remain service-role-only.
Disconnecting clears both identifiers and invalidates outstanding links.

Daily aggregation uses local calendar boundaries in the setting's validated
IANA timezone. The canonical generated `report_date` is derived from the first
ten characters of the backward-compatible `report_key`, so old and new writers
deduplicate on the same locker/day/channel even when equivalent timezone aliases
are selected. The backend-only reservation RPC locks each transition. `failed`
and stale pre-send `pending` rows can retry up to three attempts; stale
`sending` rows become `delivery_unknown` and require manual review rather than
risk a duplicate provider side effect. The forward migration and disposable
two-user pgTAP/RLS contract have run on the development project. Static SQL and
adapter tests remain part of the local regression suite but are not presented
as a substitute for that live gate.

The same per-locker timezone controls history range boundaries, chart buckets,
Dashboard history timestamps and YC8 database context. `REPORT_TIMEZONE` is
only the default for a locker without saved settings. This prevents events near
UTC/local midnight from appearing under different dates in the history, chart,
chatbot and daily report views.

History consumers page deterministically by `(occurred_at DESC, event_id DESC)`
instead of relying on the Data API's first 1000 rows. The backend fails with
`EVENT_DATASET_TOO_LARGE` at its explicit safety ceiling rather than returning a
plausible but incomplete chart/report/chatbot count.
