# Smart Privacy Locker deployment guide

> Release note 2026-08-18: automated build/test gates pass, but this audit did
> not redeploy or rerun external Supabase/FlowFuse/Telegram/Gemini/SMTP state.
> Deploy only to an explicitly identified test project, preserve a rollback,
> keep secrets outside Git, then execute
> [../HUONG_DAN_TEST_END_TO_END.md](../HUONG_DAN_TEST_END_TO_END.md). A deploy
> success alone is not final E2E evidence.

## 1. Database

Apply every file in `supabase/migrations/` in lexical order to the selected
development project. Run both SQL tests under `supabase/tests/`, then verify
with disposable User A/User B accounts that history/settings/deliveries never
cross locker ownership. The current development project has already passed the
forward migration and P3-M04 owner-isolation/history run; repeat the test only
for a new/reset project or a changed migration.

For an existing project, the automatic Telegram-linking runtime requires
`202608110001_telegram_account_linking.sql` followed by
`202608110002_telegram_link_consume_conflict_fix.sql` and
`202608110003_telegram_notification_preference_upsert_fix.sql`. Apply them in
lexical order before importing the matching FlowFuse artifact. A project that
already applied `110001` and `110002` must apply only the forward fix `110003`;
do not rerun either earlier migration.
Together they add only backend routing identifiers and short-lived token
storage; browser roles cannot read Telegram Chat/User IDs or issue/consume link
tokens. The second migration qualifies the notification-settings primary-key
conflict target so the table-returning consume RPC cannot confuse it with its
`locker_id` output variable. The third preserves the already-linked private
Telegram route while PostgreSQL validates a preference upsert.

## 2. Node-RED / FlowFuse

From `node-red/`, run `npm ci`, `npm test`, `npm run build:flowfuse`,
`npm run test:simulator`, `npm run test:broker`, and `npm run audit`. Import the
generated `flows.flowfuse.json`. Install the pinned Dashboard package and allow
the initializer libraries `crypto`, `https` and `nodemailer`.

When updating an existing instance, replace the current project flow instead
of importing a second copy beside it:

1. use Node-RED **Export → all flows → Download** as a local rollback copy; if
   the FlowFuse **Snapshots** tab is available on the team's plan, create a
   named pre-update snapshot as well;
2. securely confirm that the MQTT username/password are available for re-entry;
   the exported JSON intentionally does not contain them;
3. delete only the existing Smart Privacy Locker tabs. Older deployments
   label them `P2 1`–`P2 5` plus `P3`; the current artifact labels them
   `MQTT - Validation and readiness`, `Control - Auth and commands`,
   `Security - Unauthorized alerts`, `Assistant - Grounded chatbot`,
   `Dashboard - API and ownership`, and `Data - History and reports`. Then
   delete `Telegram - Account linking` too if it is already present. Remove
   the now-unused project config nodes before importing: one
   `mqtt-broker`, one `tls-config`, and one each of `ui-base`, `ui-theme`,
   `ui-page`, `ui-group`;
4. import the newly generated `flows.flowfuse.json` as new flows, reopen the
   single MQTT broker config, re-enter its credential fields, and Deploy once;
5. verify exactly seven project tabs, one of each config type above and fifteen HTTP
   routes. Restore the backup/snapshot if this inventory is not exact.

A normal expanded `Dashboard - API and ownership` tab (called
`P2 5 - Dashboard API` in an older export) contains the claim/state,
history/chart/settings and embedded-app routes. Those rows are distinct API
routes, not duplicate flows. See the official
[Node-RED import/export guide](https://nodered.org/docs/user-guide/editor/workspace/import-export)
and, when enabled for the plan, the official
[FlowFuse snapshots guide](https://flowfuse.com/docs/user/snapshots/).

Set deployment variables from `.env.example`. In particular, Supabase service
role and SMTP password belong only to the backend secret store. MQTT username
and password belong to the broker configuration credential fields. Never paste
real values into `flows.json`, Dashboard code, screenshots or Git.

For a remote broker, use TLS/8883 with a verified CA and distinct broker
principals/ACLs for Node-RED and each device. The tracked public firmware
example is secure-by-default (`MQTT_USE_TLS=true`, port `8883`) and suppresses
connection until a non-placeholder CA/credential is supplied. A non-TLS 1883
override is permitted only on an explicitly isolated local lab broker. Put the
real CA and credential only in ignored local firmware configuration and verify
the broker certificate instead of disabling validation.

### Telegram automatic linking

Create these three FlowFuse environment variables before the Full Deploy:

```text
TELEGRAM_BOT_TOKEN=<token do BotFather cấp; secret>
TELEGRAM_BOT_USERNAME=<username của bot, không có @>
TELEGRAM_WEBHOOK_SECRET=<chuỗi ngẫu nhiên riêng, tối thiểu 16 ký tự>
```

Generate the webhook secret locally instead of reusing the bot token:

```powershell
[Convert]::ToHexString(
  [Security.Cryptography.RandomNumberGenerator]::GetBytes(32)
).ToLowerInvariant()
```

After the artifact has been fully deployed, register the webhook once from a
PowerShell terminal. `Read-Host` keeps the actual values out of the command
text and repository:

```powershell
$telegramToken = Read-Host 'Telegram bot token'
$telegramSecret = Read-Host 'TELEGRAM_WEBHOOK_SECRET đã đặt trong FlowFuse'
$flowFuseHost = '<ten-instance-cua-ban>.flowfuse.cloud'
$webhookBody = @{
  url = "https://$flowFuseHost/api/v1/telegram/webhook"
  secret_token = $telegramSecret
  allowed_updates = @('message')
  drop_pending_updates = $true
} | ConvertTo-Json

$setResult = Invoke-RestMethod -Method Post `
  -Uri "https://api.telegram.org/bot$telegramToken/setWebhook" `
  -ContentType 'application/json' `
  -Body $webhookBody
$setResult | Select-Object ok, description

$webhookInfo = Invoke-RestMethod `
  -Uri "https://api.telegram.org/bot$telegramToken/getWebhookInfo"
$webhookInfo.result | Select-Object url, pending_update_count, last_error_message

Remove-Variable telegramToken, telegramSecret, webhookBody
```

`ok` must be `True`, and `result.url` must exactly equal the FlowFuse webhook
URL. Telegram allows one webhook per bot, so another deployment using the same
bot will replace this URL. Re-run `setWebhook` whenever the host or webhook
route changes; do not re-run it for an ordinary flow redeploy on the same URL.

End-user verification is deliberately simple:

1. sign in at `/locker` and select an owned locker;
2. press **Liên kết Telegram**;
3. in the private Telegram chat opened by the Dashboard, press **Start**;
4. return to the Dashboard; within a few seconds it must show **Đã liên kết**;
5. press **Gửi tin nhắn thử** and verify the message arrives;
6. optionally use **Ngắt liên kết** and verify the destination disappears.

After the matching webhook runtime is live, configure the bot command menu with
`start`, `help`, and `settings`. Each command must be tested in a private chat;
group and supergroup commands are intentionally ignored. If the bot is dedicated
to this locker application, disable group joins in BotFather to avoid suggesting
an unsupported destination type.

No user finds or types a Chat ID. The one-time deep-link token expires after
10 minutes, is stored only as SHA-256, is bound to the authenticated owner and
selected locker, and cannot be reused for another Telegram account. An exact
same-account webhook retry is idempotent so a lost HTTP response does not break
the link. Telegram requires the user to start a private bot conversation before
the bot can send messages, so the **Start** tap is the only unavoidable manual
step.

## 3. Dashboard and service checks

Open `/locker` (`/phase2` remains a legacy alias in the generated FlowFuse export), register
or sign in and claim the test locker. History, both chart ranges and setting
reload must work through the owner-protected API even while the device is
offline. Wait for fresh ONLINE/full state before checking physical controls,
then verify alarm pending→ACK, one email delivery and duplicate suppression.
Repeat wrong-owner and provider-failure paths with sanitized evidence.

After replacing the flow, use a hard reload or a private window so an older
embedded HTML/CSS response is not mistaken for the current Dashboard. Confirm
that the history button reads **Cập nhật dữ liệu**, the warm cream/forest UI is
visible, and disabled report destinations only activate with their channel.
Also confirm that **Cấu hình Wi-Fi cho tủ** shows a stale-safe status plus the
`Locker-Setup`/`192.168.4.1` instructions and contains no SSID/password field.

The current development evidence covers wrong-owner denial, P3-M05's 7/30-day,
empty-bucket and controlled local-midnight paths, and P3-M06's deployed
Mailtrap Sandbox success plus controlled definite-failure path. Supabase Auth
custom SMTP remains a separate service and does not configure YC7.

## 4. Firmware and hardware

Build the synchronized sketch with the pinned Arduino IDE/core/library profile,
and keep the PlatformIO native/ESP32 builds as independent automated evidence.
Flash only after the board, low-voltage power, GPIO labels and candidate wiring
have been checked. Validate the buzzer module polarity/current and safe boot
with appropriate lab supervision before running P3-M01/P3-M11. Simulator and
compile results are software evidence, not hardware evidence.

The current as-built SG90 rotates a latch: `LOCK=80°`, `UNLOCK=170°`, while the
user moves the door manually. It has no latch-angle feedback. Before enabling
or changing the external 5 V branch, meter-check the
5.5 × 2.5 mm jack polarity, switch/distribution/protection and common ground;
complete [../hardware/power-budget.md](../hardware/power-budget.md). The adapter
does not need a built-in I/O switch, but a correctly rated DC switch in the
positive lead is the recommended controllable disconnect.
