# Phase 2 Dashboard behavior

The app is served by Node-RED at `/phase2` and embedded in the FlowFuse Dashboard
page `/dashboard/phase2` by a scoped `ui-template` when
`node-red/settings.example.js` is applied. It uses Supabase Auth REST with the
frontend-safe URL/anon key from `/api/v1/public-config`; the service-role key is
never exposed. Protected Node-RED routes use exactly
`Authorization: Bearer <access_token>`.

The app supports register, login, reload/session restore, refresh, logout,
one-time locker claim, distinct MQTT/ESP32 state, door/lock freshness, pending
controls, and the minimal YC8 chat interface. It never contains MQTT credentials
and never publishes MQTT. A command remains `PENDING` after HTTP acceptance;
only a later matching ACK updates the shared runtime state. Offline/stale state
renders door `UNKNOWN`, and lock `UNKNOWN` is labeled unconfirmed.

This is the Dashboard needed for Phase 2, not the Phase 3 final charts/history/
notification-settings interface.
