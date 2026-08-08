# Supabase Auth and ownership contract v1

**Owner:** Nguyễn Văn Minh — 24127205

**Canonical transport:** `Authorization: Bearer <Supabase access_token>`
**Status:** implementation frozen at schema version 1; P2-M03 live FlowFuse/Supabase evidence remains `MANUAL — HARD-GATE Pending` because this workstation has no Supabase project configuration.

## Trust boundary

The browser signs up/signs in with Supabase Auth using only `SUPABASE_URL` and
the anon/publishable key returned by `/api/v1/public-config`. A protected request
to Node-RED carries the current Supabase access token in the HTTP Authorization
header. There is no custom session, cookie fallback, query-string token, client
`user_id`, or MQTT route.

Node-RED calls `GET {SUPABASE_URL}/auth/v1/user` with the anon key and received
Bearer token. The returned `user.id` is the only trusted identity. It then
queries `lockers` with the same user token and requires exactly one row matching
both locker ID and owner ID. A client-supplied `user_id` is ignored. A denial
occurs before MQTT publication, history access, chatbot provider calls, claim
side effects, or settings work.

## Routes

| Route | Auth/ownership | Result |
|---|---|---|
| `POST /api/v1/commands` | Bearer + owner + live device gates | `202` pending; never device success |
| `POST /api/v1/chatbot` | Bearer + owner | grounded live/history response |
| `POST /api/v1/lockers/claim` | Bearer; atomic RPC determines claim | first claim only |
| `GET /api/v1/lockers/:lockerId/state` | Bearer + owner | trusted/stale-aware UI state |
| `GET /api/v1/public-config` | public | Supabase URL and anon key only |

Missing/malformed/expired/revoked token returns `401`. A verified user who does
not own the selected locker returns `403`. Auth/ownership provider failure
returns `503`; it is fail-closed. Claim conflict returns `409`. CORS should allow
only the deployed Dashboard origin when the static Dashboard and API are on
different origins. The default deployment serves both from Node-RED, so no
cross-origin API exception is required; Supabase project allowed origins must
include the Dashboard URL.

## Session lifecycle

The Dashboard obtains `access_token`, `refresh_token`, and `expires_at` from
Supabase `/auth/v1/signup` or `/auth/v1/token?grant_type=password`. It stores the
session in browser `sessionStorage`, restores it on reload, refreshes about 60
seconds before expiry through `grant_type=refresh_token`, and clears local state
on refresh failure or any protected `401`. Logout calls `/auth/v1/logout`, clears
the session, disables controls, and removes sensitive UI state. The refresh
token never travels to Node-RED; only the current access token does.

## Claim and RLS

Migrations create `profiles`, `lockers`, constraints, owner-only SELECT RLS, and
`claim_locker(text)`. No client policy permits `lockers.owner_id` INSERT/UPDATE.
The authenticated RPC performs one atomic conditional update where
`owner_id IS NULL`; a second user or repeat claim is rejected. The function has
a fixed search path, is executable only by `authenticated`, and rejects missing
`auth.uid()`.

## Configuration boundary

Frontend-safe: `SUPABASE_URL`, `SUPABASE_ANON_KEY`. Backend/deployment-only:
`SUPABASE_SERVICE_ROLE_KEY`, MQTT credentials, Telegram token/chat ID, Gemini
key, and `NODE_RED_CREDENTIAL_SECRET`. Phase 2 token verification/ownership uses
the user token and anon key; it does not need service-role escalation. Logs and
normalized events contain codes and verified user UUID where needed, never
Authorization headers, access/refresh tokens, cookies, keys, email, or password.

Automated P2-A03 covers canonical Bearer parsing, expired/missing tokens,
spoofed identity, wrong ownership, deny-before-publish, and valid owner. It is
contract evidence, not a substitute for P2-M03–P2-M05 against a real Supabase
project and browser network capture.
