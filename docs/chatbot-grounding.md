# YC8 chatbot routing and grounding

The protected `/api/v1/chatbot` route verifies the Supabase access token and
locker ownership before classification. Questions containing current-state
intent route to the per-locker live cache. History/count/recent/time-range intent
routes to the version 1 history adapter in `event-contract.md`. Unsupported or
empty questions return a controlled response.

Live answers require MQTT connected, fresh ONLINE availability, and a full
state observed after that availability signal. Missing, stale, offline, or
restart-empty state returns `LIVE_STATE_UNAVAILABLE`; retained state alone is
not passed to Gemini.

For history, Node-RED receives bounded event summaries and computes
`open_count`, `alert_count`, range, recent event summaries, and provenance.
Gemini receives only this whitelist:

```json
{
  "schema_version": 1,
  "route": "live|history",
  "locker_id": "LOCKER-001",
  "instruction": "Only restate supplied facts; never invent events, counts, states, or timestamps.",
  "facts": {}
}
```

It never receives Authorization headers, access/refresh tokens, cookies,
Supabase keys, Telegram data, email, password, or raw user records. Model name
comes from `GEMINI_MODEL`; key from `GEMINI_API_KEY`. Provider timeout, quota,
HTTP, empty response, and missing configuration return a controlled message and
do not alter source facts. Phase 2 fixture history proves the adapter/context
contract; real Supabase history remains YC4 Phase 3. P2-M08 against Gemini stays
`MANUAL — FINAL-GATE Pending` until a test credential is available.
