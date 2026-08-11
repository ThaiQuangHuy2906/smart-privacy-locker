# Smart Privacy Locker troubleshooting

| Symptom | Check | Safe action |
|---|---|---|
| Alarm command stays pending | MQTT/ESP32 state, matching ACK, timeout diagnostic | Do not auto-repeat; request/reconcile full state |
| Alarm ACK says success but no sound | Module supply, polarity, driver and GPIO26 wiring | Power off; return to P3-M01 hardware verification |
| `DATA_NOT_CONFIGURED` | Backend `SUPABASE_SERVICE_ROLE_KEY` and URL | Restore the secret in the deployment store; never expose it to the browser |
| `DATA_TIMEOUT` | Supabase did not complete headers and response body inside the bounded adapter deadline | Check service health/network, then retry the read once; do not reinterpret timeout as empty data |
| `DATA_INVALID_RESPONSE` | Supabase returned a non-JSON or malformed response | Inspect the sanitized backend/provider response and proxy configuration; do not expose service-role headers |
| `INVALID_SESSION` after a previously valid request | The access token expired between verification and the ownership query | Sign in again; the backend returns 401 and does not continue to ownership-dependent work |
| History/chart unavailable | Migration order, service-role access, owner/locker mapping | Run the adapter/SQL tests and inspect sanitized backend diagnostics |
| `EVENT_DATASET_TOO_LARGE` | The requested range crossed the backend pagination safety ceiling | Narrow the range or archive/index data after measuring; never treat a partial count as complete |
| `SETTINGS_DATASET_TOO_LARGE` | The daily scheduler crossed the notification-settings pagination safety ceiling | Archive stale locker settings or raise the measured backend ceiling deliberately; never send from a partial settings list |
| Email not sent | Email enabled/address/time/timezone and SMTP variables | Test one controlled report; inspect delivery status without logging password |
| `EMAIL_NOT_CONFIGURED` | SMTP variables are missing or incomplete | Configure the backend SMTP secret store, then wait for the next due run; no delivery attempt is consumed while unconfigured |
| `TELEGRAM_BOT_NOT_CONFIGURED` | Bot token/username is missing or invalid in FlowFuse | Set `TELEGRAM_BOT_TOKEN` and the BotFather username without `@`, then Full Deploy; never put the token in Dashboard/Git |
| `TELEGRAM_WEBHOOK_NOT_CONFIGURED` | `TELEGRAM_WEBHOOK_SECRET` is missing/invalid | Generate a dedicated `[A-Za-z0-9_-]` secret of at least 16 characters, set it in FlowFuse, Full Deploy, then register the same value using Bot API `setWebhook` |
| Link opens Telegram but Dashboard stays unlinked | User did not press **Start**, webhook URL/secret is wrong, or the 10-minute link expired | Check `getWebhookInfo`, create a new link, and press **Start** in the private chat; never ask the user to find a Chat ID |
| `TELEGRAM_NOT_LINKED` | Telegram was enabled/tested before private-account linking completed | Press **Liên kết Telegram** and finish the bot Start flow; there is intentionally no global-recipient fallback |
| `TELEGRAM_LINK_SERVICE_UNAVAILABLE` | Supabase RPC/migration/schema cache is unavailable or returned an unknown rejection | Keep the link page open, verify the latest migration and service-role configuration, then retry; the webhook deliberately returns non-2xx so Telegram can redeliver instead of silently losing the link |
| Telegram link works in a private chat but not a group | Group/supergroup destinations are intentionally refused | Link from the user's private bot chat; alerts contain owner-scoped locker data and must not be routed to an unverified group |
| Bot opens without a link token | The user opened the bot profile directly or an old deep link lost its parameter | Use `/start`, `/help`, or `/settings` for a safe Dashboard instruction, then create a fresh 10-minute link from the owned locker |
| History loads but chart fails (or the reverse) | Inspect the message under the two panels and the failed API response | Keep the valid panel; retry once after correcting only the failing route |
| Duplicate report suppressed | Existing locker/channel/local `report_date` row | Expected behavior; do not delete production delivery history just to resend |
| Delivery is `delivery_unknown` | SMTP may have accepted a message before the result could be recorded | Review the mailbox/provider and delivery row manually; never trigger an automatic resend |
| Dashboard controls disabled | Session, ownership, MQTT ONLINE and fresh full state | Re-authenticate or wait for the current connection generation to synchronize |
| Wi-Fi status is `Chưa xác định` | MQTT/ESP32 availability and whether a fresh full-state message has arrived | Wait for current-generation ONLINE + state; do not infer Wi-Fi health from an old retained message |
| `Locker-Setup` does not appear | The saved Wi-Fi may still work, or the three-minute portal window may have elapsed | Move near the powered locker and restart it; use the USB-local reset procedure only during supervised maintenance; never enter Wi-Fi credentials into the Dashboard |
| Clean `esp32dev` build loses files under a Vietnamese Windows path | Xtensa compiler output shows a mangled repository path while native tests still pass | Use the temporary `subst` ASCII drive workflow in `firmware/README.md`, then remove the mapping; do not copy or commit `.pio` |

For physical work, disconnect the low-voltage supply before touching wiring.
Do not bypass the driver/power checks and do not connect this project to mains.
