# Supabase Auth and ownership contract v1

**Owner:** Nguyễn Văn Minh — 24127205

**Canonical transport:** `Authorization: Bearer <Supabase access_token>`
**Status:** implementation frozen at schema version 1; development FlowFuse and Supabase configuration exists and provisional auth/claim checks are expected, but the final generated bundle and sanitized P2-M03–P2-M05 two-user evidence remain `MANUAL — HARD-GATE Pending`.

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
or malformed provider success returns `503`; each Node-RED provider request,
including successful response-body parsing, has a bounded five-second timeout,
the complete authorization gate has a 9-second
aggregate deadline (shorter than the browser's 15-second deadline), and failures
are fail-closed and never
reclassified as an invalid session. Claim conflict returns `409`; a successful
table-returning claim RPC is normalized to its single locker row. CORS should allow
only the deployed Dashboard origin when the static Dashboard and API are on
different origins. The default deployment serves both from Node-RED, so no
cross-origin API exception is required; Supabase project allowed origins must
include the Dashboard URL.

## Session lifecycle

The Dashboard obtains `access_token`, `refresh_token`, and `expires_at` from
Supabase `/auth/v1/signup`, `/auth/v1/token?grant_type=password`, or the
configured implicit-flow callback fragment. A callback fragment is parsed and
removed with `history.replaceState` before the first asynchronous startup
request, so tokens do not remain visible in the address bar. The app stores the
session in browser `sessionStorage`, restores it on reload, refreshes about 60
seconds before expiry through `grant_type=refresh_token`, and clears local state
on a rejected refresh or a protected `401` that still belongs to the current
session. Late authentication/claim completions cannot unlock a newer session's
pending form, and a late `401` from an older token cannot clear a newer login. A network/provider refresh failure
keeps the local session, leaves protected APIs fail-closed, and schedules one
later retry. Logout calls `/auth/v1/logout`, clears
the session immediately, disables controls, and removes sensitive UI state even
if the remote logout request stalls or fails. Browser HTTP requests have a
bounded 15-second timeout and periodic state polls are serialized. A physical
command timeout is treated as an ambiguous result that must be reconciled with
fresh state; the browser does not retry it automatically. The refresh token
never travels to Node-RED; only the current access token does.

## Claim and RLS

Registration sends the required full name as Supabase user metadata; the Auth
trigger copies it into `profiles.full_name`. Migrations create `profiles`, `lockers`, constraints, owner-only SELECT RLS, and
`claim_locker(text)`. Explicit grants let `authenticated` select RLS-visible
rows, update only its own `profiles.full_name`, and execute the claim RPC;
`anon` has no protected-table/RPC access. No client policy or table privilege
permits `lockers.owner_id` INSERT/UPDATE.
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
