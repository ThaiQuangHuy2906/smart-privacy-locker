# Phase 3 development-service results — 2026-08-11

These are sanitized manual results from the development Supabase/FlowFuse
deployment. No access token, email address, user UUID, service-role key, MQTT
credential or provider secret is recorded here. They are service evidence, not
ESP32, sensor, actuator, power or buzzer hardware evidence.

| Gate | Result | Sanitized observation |
|---|---|---|
| Forward database migration | PASS | `202608100002_phase3_scheduler_delivery_hardening.sql` was applied through the Supabase SQL Editor before the matching FlowFuse runtime was deployed. |
| P3-M04 pgTAP/RLS contract | PASS | The corrected transactional `phase3_data_rls.sql` completed; authenticated User A saw only owned Phase 3 rows and anonymous/browser grants remained least-privileged. |
| P3-M04 wrong-owner API/UI | PASS | Selecting a locker owned by another user returned `LOCKER_FORBIDDEN`; protected data was not rendered. |
| P3-M04 correct-owner history | PASS | The owner loaded recent `DEVICE_OFFLINE` history through the Bearer-protected Node-RED route while the physical device was offline. |
| P3-M05 7-day/empty-bucket subset | PASS | The deployed 7-day view returned the owned history and rendered seven zero open/alert buckets for data that contained no opening/alert event. |
| P3-M05 30-day/local-midnight boundary | PASS | A disposable owned locker received two controlled events on opposite sides of the `Asia/Ho_Chi_Minh` local-midnight boundary. The protected API returned exactly two history rows and 30 chart buckets; the deployed UI issued Bearer-protected history/chart requests, rendered all 30 accessible table rows, split the two events into the correct local dates and zero-filled the other buckets. The disposable locker and its cascaded rows were removed afterward. |
| P3-M06 daily SMTP delivery | PASS | With the five YC7 SMTP variables present in FlowFuse, the deployed scheduler accepted one disposable owner's report through Mailtrap Sandbox on attempt 1, recorded `delivered` with `sent_at`, and persisted one `DAILY_EMAIL_REPORT` event. A separate disposable setting with an intentionally invalid recipient produced a definite `EENVELOPE` failure on attempt 1 with no `sent_at`. Both disposable lockers and all cascaded rows were removed afterward. |
| Telegram current Dashboard deployment | PASS | After Full Deploy, `GET /locker` returned the same inline Dashboard bytes as the current local generator. The response includes the semantic `[hidden]` rule that prevents an unissued fallback link from appearing as a clickable button. |
| Telegram webhook boundary | PASS | The configured secret produced `200 TELEGRAM_UPDATE_IGNORED` for an empty update; an independently generated wrong secret produced `401 TELEGRAM_WEBHOOK_UNAUTHORIZED`. Telegram `getWebhookInfo` reported the expected webhook path, zero pending updates and no last error. |
| Telegram bot identity and commands | PASS | Bot API identity matched the configured username; `/start`, `/help` and `/settings`, plus the long and short descriptions, were present. A controlled nonexistent private-chat command reached the new handler and failed only at delivery, proving the deployed command branch without targeting a real account. |
| Telegram automatic owner link subset | PASS | The protected link API returned `201` with the expected `t.me/<bot>?start=<opaque-token>` shape. The owner pressed **Start** in the private bot chat; protected settings then reported `telegram_connected=true` and `telegram_enabled=true`. A protected test send returned `200 TELEGRAM_TEST_DELIVERED`. The browser response contained `telegram_connected` but no `telegram_chat_id` or `telegram_user_id`. |
| Telegram full lifecycle remainder | PENDING | Preference save/re-enable, exact consumed-token replay, disconnect and relink were deliberately not run against the owner's active link during this read-only audit. Their deterministic tests pass locally; this row remains a deployment gate until exercised with a controlled disposable locker/account or an explicitly approved temporary disconnect. |

One duplicate `DEVICE_OFFLINE` row created by the earlier pre-fix retained
availability behavior was removed with explicit operator authorization after
the retained semantic event was preserved. The cleanup is recoverable only
through the database provider's backup/PITR facilities; it must not be repeated
as a general deduplication command. The runtime regression now treats
timestamp-less retained availability as live state only and uses a stable ID
for timestamped availability.

The Telegram checks above expose no token, Chat/User ID, username, JWT or
provider secret. They are deployment evidence only; they do not prove a real
ESP32, MC-38, buzzer, power rail or physical unauthorized-open producer.
