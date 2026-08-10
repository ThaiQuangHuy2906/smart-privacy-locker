# Phase 3 Dashboard behavior

The app is served by Node-RED at `/phase2` and embedded in the FlowFuse Dashboard
page `/dashboard/phase2` by a scoped `ui-template` when
`node-red/settings.example.js` is applied. It uses Supabase Auth REST with the
frontend-safe URL/anon key from `/api/v1/public-config`; the service-role key is
never exposed. Protected Node-RED routes use exactly
`Authorization: Bearer <access_token>`.

The app supports full-name register metadata, keyboard-submit login, reload/session restore,
immediate Supabase implicit-flow fragment consumption/removal,
provider-outage-safe refresh, local-first logout, bounded browser requests,
serialized/coalesced state polling,
one-time locker claim, distinct MQTT/ESP32 state, door/lock/alarm/LED freshness, pending
controls, visible Telegram delivery status, CB3 Test/Stop Alarm, YC4 recent
history, YC5 7/30-day chart, YC7 notification settings, and the YC8 chat interface. It never contains MQTT credentials
and never publishes MQTT. A command remains `PENDING` after HTTP acceptance;
only a later matching ACK updates the shared runtime state. Offline/stale state
renders door `UNKNOWN`, and lock `UNKNOWN` is labeled unconfirmed.
Changing or claiming a locker invalidates the old rendered context and keeps
controls disabled until fresh state for that exact locker is confirmed. A
physical-command request timeout is shown as an ambiguous result and is never
retried automatically.

History/chart/settings are requested only through Bearer-protected Node-RED
routes after fresh owner-scoped locker state is established. Loading, empty and
controlled error states are explicit. After any change under
`dashboard/`, regenerate `node-red/flows.flowfuse.json`; FlowFuse does not read
these source files directly after import.
