# Smart Privacy Locker Dashboard behavior

> Audit 2026-08-17: responsive/keyboard/focus/target/live-region/reduced-motion
> checks passed in Chrome at 1280×720 and 320×800. Regression coverage also
> confirms startup retry, localized status labels, stale/no-data truthfulness,
> visible pending feedback and the login/register mode contract. This is
> software evidence only; it does not replace the final physical E2E run.

The app is served by Node-RED at `/locker` and embedded in the FlowFuse Dashboard
page `/dashboard/locker` by a scoped `ui-template` when
`node-red/settings.example.js` is applied. It uses Supabase Auth REST with the
frontend-safe URL/anon key from `/api/v1/public-config`; the service-role key is
never exposed. The generated FlowFuse export also serves `/phase2` as a legacy
alias for existing direct links. Protected Node-RED routes use exactly
`Authorization: Bearer <access_token>`.

The app supports full-name register metadata, keyboard-submit login, reload/session restore,
immediate Supabase implicit-flow fragment consumption/removal,
single-flight provider-outage-safe refresh, no protected polling with a known-expired
access token, local-first logout, operation-specific bounded browser requests,
serialized/coalesced state polling,
one-time locker claim, distinct MQTT/ESP32 state, live-state freshness, pending
controls, Telegram delivery status, CB3 **Kiểm tra còi/Tắt còi**
(`ALARM_ON/OFF`), YC4 recent
history, YC5 7/30-day chart, YC7 notification settings, and the YC8 chat interface. It never contains MQTT credentials
and never publishes MQTT. A command remains `PENDING` after HTTP acceptance;
only a later matching ACK updates the shared runtime state. Door/Wi-Fi offline
or stale state renders user-facing `Chưa xác định` labels while preserving the
frozen protocol enums internally. Stale state also disables every actuator
control defensively, even if an inconsistent API response marks one enabled.
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

## Audit corrections and remaining physical limitation

The 2026-08-17 correction pass closed the confirmed Dashboard findings:

1. every known command and Telegram-delivery status has a Vietnamese label,
   with a safe unknown fallback instead of a raw enum;
2. pending controls retain a visible, independently colored spinner;
3. `/api/v1/public-config` retries every five seconds while authentication
   remains disabled, then recovers without a manual reload;
4. missing or stale lock/alarm/LED values render as unknown and controls stay
   disabled;
5. the auth form has one unambiguous submit action; registration alone exposes
   the full-name field and uses `autocomplete="new-password"`;
6. user-facing actuator language says the SG90 arm closes/opens the door while
   the frozen MQTT v1 enums remain `LOCK`/`UNLOCK` and `LOCKED`/`UNLOCKED` for
   compatibility.

The as-built SG90 arm is still open-loop and has no latch/position feedback.
A success ACK confirms that firmware completed the requested servo sequence; it
does not prove that a jammed or disconnected mechanism physically reached its
position. Keep that limitation explicit in the final report and physical test.

See [../BAO_CAO_RA_SOAT_CODEBASE.md](../BAO_CAO_RA_SOAT_CODEBASE.md) for
severity/evidence and
[../HUONG_DAN_TEST_END_TO_END.md](../HUONG_DAN_TEST_END_TO_END.md) for the
required browser and physical rerun matrix.
