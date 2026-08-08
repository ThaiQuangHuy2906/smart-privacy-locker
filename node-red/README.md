# Node-RED Phase 2 deployment

`flows.json` separates MQTT validation/cache, auth/dispatcher/ACK/timeout,
unauthorized/Telegram, history/chatbot, and Dashboard APIs. Core logic is in
small modules under `lib/`; no giant Function node owns the trust boundary.

## Install and configure

1. Use a FlowFuse/Node-RED runtime `>=4.1.13 <5` on Node.js 20+. The platform supplies Node-RED; this project intentionally does not vendor its palette-manager runtime. Install the pinned Dashboard node with `npm ci`.
2. Apply `settings.example.js` values to the deployment `settings.js`. Set a strong `NODE_RED_CREDENTIAL_SECRET` outside Git.
3. Set the variables listed in the repository `.env.example` in the deployment secret/environment store. Never import a plaintext credential flow.
4. Import `flows.json`. Configure the MQTT broker node credential fields from the Node-RED credential store/environment; remote brokers require certificate verification.
5. Serve the static app through `httpStatic`; open the FlowFuse Dashboard page `/dashboard/phase2` (or `/phase2` directly for diagnostics).

Node-RED starts with empty/stale cache, no pending command, and no authorized
window. MQTT status is distinct from device LWT. Controls enable only after a
fresh ONLINE availability plus full state; restart/old ACK cannot restore a
request. Invalid MQTT payload produces a safe diagnostic containing only code,
topic, and observed time—never raw payload/token.

## Tests

```powershell
npm test
npm run test:simulator
npm run audit
```

Tests use Node's built-in runner and deterministic fixtures. The simulator uses
a memory broker for retained/non-retained software semantics; it is explicitly
not an authenticated network-broker capture or hardware evidence. Live
Supabase, FlowFuse, Telegram, Gemini, MQTT and ESP32 gates require deployment
environment and sanitized manual evidence.

## Routes and operations

See `docs/auth-ownership.md` for route/status contracts. The timeout scheduler
runs every 250 ms against a 5000 ms default deadline. Actuator timeouts are not
retried; one internal `GET_STATE` is issued only while the device remains ready.
Completed IDs are bounded in memory. A Node-RED restart clears them, pending
commands, cache freshness, and authorized windows by design.
