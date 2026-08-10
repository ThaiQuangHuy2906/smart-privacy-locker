# Phase 3 deployment guide

## 1. Database

Apply every file in `supabase/migrations/` in lexical order to the selected
development project. Run both SQL tests under `supabase/tests/`, then verify
with disposable User A/User B accounts that history/settings/deliveries never
cross locker ownership.

## 2. Node-RED / FlowFuse

From `node-red/`, run `npm ci`, `npm test`, `npm run build:flowfuse`,
`npm run test:simulator`, `npm run test:broker`, and `npm run audit`. Import the
generated `flows.flowfuse.json`. Install the pinned Dashboard package and allow
the initializer libraries `crypto`, `https` and `nodemailer`.

Set deployment variables from `.env.example`. In particular, Supabase service
role and SMTP password belong only to the backend secret store. MQTT username
and password belong to the broker configuration credential fields. Never paste
real values into `flows.json`, Dashboard code, screenshots or Git.

## 3. Dashboard and service checks

Open `/phase2` (the route is retained for deployment compatibility), register
or sign in, claim the test locker, and wait for fresh ONLINE/full state. Check
alarm pending→ACK, recent history, both chart ranges, setting reload, one email
delivery and duplicate suppression. Repeat wrong-owner and provider-failure
paths with sanitized evidence.

## 4. Firmware and hardware

Build/test with PlatformIO, then flash only after the board, low-voltage power,
GPIO labels and candidate wiring have been checked. Validate the buzzer module
polarity/current and safe boot with appropriate lab supervision before running
P3-M01/P3-M11. Simulator results are software evidence, not hardware evidence.
