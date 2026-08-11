# Smart Privacy Locker Dashboard behavior

The app is served by Node-RED at `/locker` and embedded in the FlowFuse Dashboard
page `/dashboard/locker` by a scoped `ui-template` when
`node-red/settings.example.js` is applied. It uses Supabase Auth REST with the
frontend-safe URL/anon key from `/api/v1/public-config`; the service-role key is
never exposed. The generated FlowFuse export also serves `/phase2` as a legacy
alias for existing direct links. Protected Node-RED routes use exactly
`Authorization: Bearer <access_token>`.

The app supports full-name register metadata, keyboard-submit login, reload/session restore,
immediate Supabase implicit-flow fragment consumption/removal,
provider-outage-safe refresh, local-first logout, operation-specific bounded browser requests,
serialized/coalesced state polling,
one-time locker claim, distinct MQTT/ESP32 state, door/lock/alarm/LED freshness, pending
controls, visible Telegram delivery status, CB3 **Kiểm tra còi/Tắt còi**
(`ALARM_ON/OFF`), YC4 recent
history, YC5 7/30-day chart, YC7 notification settings, and the YC8 chat interface. It never contains MQTT credentials
and never publishes MQTT. A command remains `PENDING` after HTTP acceptance;
only a later matching ACK updates the shared runtime state. Offline/stale state
renders user-facing `Chưa xác định`/`Chưa xác nhận` labels while preserving the
frozen protocol enums internally.
Changing or claiming a locker invalidates the old rendered context and keeps
controls disabled until fresh state for that exact locker is confirmed. A
physical-command request timeout is shown as an ambiguous result and is never
retried automatically. Commands in the same actuator domain are locked
together while one request is pending, and a response from an older
session/locker generation cannot re-enable them.

Telegram setup is owner-driven but does not expose provider identifiers. The
Dashboard requests a short-lived link for the selected owned locker, opens the
configured bot, and polls the sanitized settings response until the private
`/start` webhook has consumed that link. It never asks for, sends, stores, or
renders a Chat ID. Linked users can send a test message, enable/disable alerts,
relink, or disconnect; changing locker/session cancels the old polling and
clears the private connection state.

YC12 displays `wifi_connected` only from a fresh, validated full-state message.
Stale, missing or cross-locker context is rendered as **Chưa xác định**. The
**Cấu hình Wi-Fi cho tủ** panel explains the local `Locker-Setup` captive portal
and `192.168.4.1` fallback. It intentionally contains no SSID/password input:
Wi-Fi credentials are entered only into the ESP32 portal and remain on-device.

History/chart/settings are requested only through Bearer-protected Node-RED
routes and remain usable for an authenticated locker owner while the physical
device is offline. The backend remains the ownership authority. Only actuator
commands require a fresh live-state context. Changing the selected locker
immediately clears old history, chart and destination settings while the new
owner check runs. History and chart requests settle independently, so a chart
failure cannot erase valid history and a history failure cannot erase a valid
chart. Loading, empty and controlled error states are explicit. The
visual chart has true zero-height buckets and an equivalent screen-reader data
table. The visual system uses a warm neutral background, high-contrast deep
forest actions, muted terracotta only for warnings, restrained borders/radii,
plain Vietnamese history labels and explicit empty states instead of raw
protocol/ISO log strings. History range boundaries, chart buckets, timestamps
and grounded YC8 database context all use the selected locker's validated IANA
timezone; `REPORT_TIMEZONE` is only the default before settings exist.
Notification destinations stay disabled and
non-required until their channel is selected. The layout reflows without
horizontal overflow down to 320 px. After any change under
`dashboard/`, regenerate `node-red/flows.flowfuse.json`; FlowFuse does not read
these source files directly after import.
