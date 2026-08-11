# YC8 chatbot routing and grounding

The protected `/api/v1/chatbot` route verifies the Supabase access token and
locker ownership before classification. Questions containing current-state
intent route to the per-locker live cache. History/count/recent/time-range
intent routes to the version 1 history adapter in `event-contract.md`.
Unsupported or empty questions return a controlled response.

Live answers require MQTT connected, fresh `ONLINE` availability, and a full
state observed after that availability signal. Missing, stale, offline, or
restart-empty state returns `LIVE_STATE_UNAVAILABLE`; retained state alone is
not passed to Gemini.

For history, Node-RED receives deterministically paginated event summaries and
computes `open_count`, `alert_count`, range, recent event summaries and provenance. The
classifier recognizes the six canonical questions in the Master Project Plan.
It converts accepted input into a canonical question and structured intent
before calling history or Gemini, so trailing user text cannot carry a pasted
token/secret into provider context. Gemini receives only this whitelist:

```json
{
  "schema_version": 1,
  "route": "live|history",
  "intent": "current_lock_state|current_door_state|latest_alert|open_count_7_days|unauthorized_open_today|latest_activity",
  "question": "safe canonical question",
  "locker_id": "LOCKER-001",
  "instruction": "Only restate supplied facts; never invent events, counts, states, or timestamps.",
  "facts": {}
}
```

It never receives the raw user question, Authorization headers, access/refresh
tokens, cookies, Supabase keys, Telegram data, email, password or raw user
records. History-adapter transport errors and malformed responses return
controlled unavailable results rather than escaping the HTTP flow. Model name
comes from `GEMINI_MODEL`; key from `GEMINI_API_KEY`. Provider timeout, quota,
HTTP, empty response and missing configuration return a controlled message and
do not alter source facts.

Phase 2 automated and deployed live/provider-failure gates prove the
classification, safe context and current-state route. Phase 3 now connects the
same frozen history contract to the Supabase data adapter and its automated
integration tests pass. The forward migration and owner-scoped real-history UI
path have run on the development project. A live Gemini history/no-data/error
recording remains P3-M09; the database result alone is not reported as that
provider gate.
