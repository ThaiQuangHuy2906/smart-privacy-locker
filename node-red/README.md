# Node-RED Phase 3 deployment

`flows.json` separates MQTT validation/cache, auth/dispatcher/ACK/timeout,
unauthorized/Telegram, history/chatbot, Dashboard APIs, persistence/chart and
daily reports. Core logic is in
small modules under `lib/`; no giant Function node owns the trust boundary.

## Install and configure

### FlowFuse Cloud (J.11)

Generate the import artifact from the tested runtime and Dashboard sources:

```
npm run build:flowfuse
```

Import `flows.flowfuse.json`, not `flows.json`. The FlowFuse export bundles the
modules under `lib/` into the initializer's **On Start** code and embeds the
Dashboard HTML/CSS/JavaScript behind `GET /phase2`; it does not require access
to this repository or a custom `settings.js` at runtime. Do not edit the
generated JSON directly; change `lib/`, `dashboard/`, or `flows.json`, then run
the build command again.

The instance must allow Function nodes to load modules
(`functionExternalModules`). This export requests the Node.js built-ins
`crypto`/`https` plus the pinned `nodemailer` dependency. Add the
following variables to the FlowFuse instance environment, install the pinned
`@flowfuse/node-red-dashboard` palette, then enter the MQTT username and
password in the MQTT broker configuration node's credential fields:

```text
LOCKER_ID, MQTT_HOST, MQTT_PORT,
COMMAND_TIMEOUT_MS, AUTHORIZED_UNLOCK_WINDOW_SECONDS,
DEVICE_STALE_AFTER_SECONDS, DASHBOARD_BASE_URL,
SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY,
TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID,
GEMINI_API_KEY, GEMINI_MODEL, REPORT_TIMEZONE,
GMAIL_SMTP_HOST, GMAIL_SMTP_PORT, GMAIL_SMTP_USER,
GMAIL_SMTP_PASSWORD, GMAIL_FROM
```

Do **not** copy every key from the repository-wide `.env.example` into
FlowFuse. Phase 3 Node-RED needs `SUPABASE_SERVICE_ROLE_KEY` for trusted event
and delivery writes, but the Dashboard never receives it. `MQTT_USERNAME` and
`MQTT_PASSWORD` belong in the broker configuration node's credential store,
not in the JSON export. The included TLS config verifies the broker certificate;
upload a CA only when the broker uses a private CA.

The broker permissions must match the flow's actual subscription filters. Use
separate credentials and permissions for the trusted orchestrator and device:

```text
Node-RED credential: Publish + Subscribe on locker/+/#
ESP32 credential:    Publish + Subscribe on locker/LOCKER-001/#
```

The Node-RED flow subscribes to `locker/+/+` and
`locker/+/telemetry/door`. Giving its credential only the device-scoped
`locker/LOCKER-001/#` permission can authenticate the connection while the
broker still rejects both subscriptions; a green/connected MQTT status alone
does not prove that telemetry is entering the flow. Keep the device credential
scoped to its one locker and never copy the broader Node-RED credential into
firmware.

After deployment, use `/phase2` for the embedded app and
`/dashboard/phase2` for the FlowFuse Dashboard wrapper. A missing bootstrap
returns `503 RUNTIME_STARTING` from protected routes instead of exposing or
bypassing authentication.

### Self-hosted Node-RED

1. Use a FlowFuse/Node-RED runtime `>=4.1.13 <5` on Node.js 20+. The platform supplies Node-RED; this project intentionally does not vendor its palette-manager runtime. Install the pinned Dashboard node with `npm ci`.
2. Apply `settings.example.js` values to the deployment `settings.js`. Set a strong `NODE_RED_CREDENTIAL_SECRET` outside Git.
3. Set only the runtime variables listed in the FlowFuse section above in the deployment secret/environment store. Self-hosted Node-RED additionally needs `NODE_RED_CREDENTIAL_SECRET`. Never import a plaintext credential flow.
4. Import `flows.json`. Configure the MQTT broker node credential fields from the Node-RED credential store/environment; remote brokers require certificate verification.
5. Serve the static app through `httpStatic`; open the FlowFuse Dashboard page `/dashboard/phase2` (or `/phase2` directly for diagnostics).

Node-RED creates one shared runtime from `settings.js` before flow messages and
keeps the flow-level initializer idempotent. MQTT status is distinct from device
LWT: the exported flow recognizes the Node-RED 4.1.13 connected status key,
invalidates pending commands on disconnect, and emits one internal `GET_STATE`
per configured locker on each reconnect. Controls enable only after a fresh
ONLINE availability plus full state from the current connection generation;
restart/old ACK cannot restore a request. Invalid MQTT payload produces a safe
bounded diagnostic containing only code, topic, and observed time—never raw
payload/token.

## Tests

```powershell
npm test
npm run test:simulator
npm run test:broker
npm run audit
```

Tests use Node's built-in runner and deterministic fixtures. The memory matrix
covers retained/non-retained semantics; `test:broker` additionally executes the
exported MQTT status Function with the real Node-RED 4.1.13 status token, then
passes real MQTT traffic through `Phase2Runtime` on an authenticated loopback
Aedes broker. Neither result is an imported FlowFuse deployment or hardware evidence. Live
Supabase, FlowFuse, Telegram, Gemini, MQTT and ESP32 gates require deployment
environment and sanitized manual evidence.

Authorization is fail-closed: each Supabase request is bounded to five seconds
and verify-plus-ownership shares a 9-second aggregate deadline, below the
Dashboard's 15-second request timeout. If the command HTTP request disconnects
during authorization, runtime dispatch and MQTT outbox draining are suppressed.

## Routes and operations

See `docs/auth-ownership.md` for route/status contracts. The timeout scheduler
runs every 250 ms against a 5000 ms default deadline. Actuator timeouts are not
retried; one internal `GET_STATE` is issued only while the device remains ready.
Completed IDs are bounded in memory. A Node-RED restart clears them, pending
commands, cache freshness, and authorized windows by design.

Phase 3 adds owner-protected `GET history`, `GET chart`, and `GET/PUT
notification-settings` routes. A minute scheduler selects only email-enabled
settings whose local `HH:MM` is due, aggregates the previous local calendar
day, reserves a unique `(locker, email, report-date:timezone)` delivery, then
sends through SMTP. Provider/config failures are reported without exposing
credential or response bodies, and duplicate reservations do not send again.
