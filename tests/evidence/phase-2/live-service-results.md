# Live service evidence — Phase 2

**Recorded:** 2026-08-09 against the deployed FlowFuse/Supabase/HiveMQ/
Telegram/Gemini development environment.

The live runners use disposable users and lockers where possible. Owner, email,
JWT, refresh token, service-role key, MQTT credentials, bot token, chat ID, and
command identifiers are never written to this record. Screenshots and detailed
machine output stay under ignored `tests/evidence/private/`; only the sanitized
results below are versioned.

## Current live gate results

| Gate | Result | Sanitized evidence |
|---|---|---|
| P2-M03 public registration | **PASS (3 checks)** | After custom SMTP and a controlled unique-address template were configured, deployed Dashboard signup returned HTTP 200, removed the password from the DOM, and created the exact disposable user. The runner rejects Supabase-blocked example/test domains before network access. |
| P2-M03 remaining session path | **PASS (9 checks)** | Confirmed disposable account login returned 200; profile metadata matched; session storage/reload worked; implicit callback removed its token fragment; logout cleared local session/PII, survived reload, and protected browser requests used Bearer transport. |
| P2-M04 cross-owner isolation | **PASS (7 checks)** | Cross-owner UI read stayed disabled with `LOCKER_FORBIDDEN`; direct state and command APIs returned 403; Supabase RLS returned zero rows; broker spy observed zero command messages. |
| P2-M05 one-time claim | **PASS (5 checks)** | First claim returned 200 with visible success; repeat and second-user claims returned 409 with visible `CLAIM_REJECTED`; owner/timestamp stayed unchanged; authenticated `owner_id` update returned 403. |
| P2-M06 Telegram success | **PASS (5 checks)** | Updated TLS MQTT credential received a subscription grant; controlled unauthorized OPEN produced one `ALARM_ON`; simulator returned the correlated success ACK; owner state exposed `UNAUTHORIZED_OPEN` with `notification_status=delivered`. |
| P2-M07 Telegram controlled failure | **PASS (4 checks)** | With a controlled invalid destination, telemetry, detector, `ALARM_ON`, and correlated ACK stayed operational; owner state exposed `notification_status=failed`; the bounded runner exited without a crash or retry loop. |
| P2-M08 grounded Gemini success | **PASS (11 checks)** | Owner saw fresh `CONNECTED/ONLINE/CLOSED/LOCKED` state; API returned 200 on route `live`; context contained `lock=LOCKED` from `mqtt:state`; Gemini and deployed UI returned non-empty LOCKED-grounded answers; Bearer transport and empty URL fragment were observed. |
| P2-M08 controlled provider failure | **PASS (4 checks)** | A controlled nonexistent model returned HTTP 503 with a provider code and safe fallback; the deployed UI showed a controlled error, retained trusted `LOCKED` state, and exposed no token. |
| Provider configuration restore | **PASS (18 checks)** | After both real values were restored and FlowFuse redeployed, Telegram returned to `delivered` and Gemini returned HTTP 200 on route `live`; cleanup passed again. |

The successful owner run ended with Dashboard logout HTTP 204, Supabase rejected
the old token with HTTP 403, the temporary browser profile was removed, and the
retained MQTT baseline was restored to `OFFLINE/CLOSED/LOCKED/INACTIVE`.

## Commands and runner outcomes

```text
node tools/run-phase2-live-gates.js
  pre-SMTP diagnostic run: 22 PASS / 2 FAIL / cleanup complete
  (the two failures are both the same public-signup HTTP 429 boundary)

node tools/run-phase2-live-gates.js --m03-only
  final post-SMTP run: 12 PASS / 0 FAIL / cleanup complete

node tools/run-phase2-owner-gates.js
  P2-M06 success path: ALARM_ON + ACK + Telegram delivered PASS

node tools/run-phase2-owner-gates.js --m08-only
  14 PASS / 0 FAIL

node tools/run-phase2-owner-gates.js --expect-telegram-failure --expect-gemini-failure
  17 PASS / 0 FAIL

node tools/run-phase2-owner-gates.js
  post-restore success smoke: 18 PASS / 0 FAIL
```

The first `node tools/run-phase2-owner-gates.js` report also found two runner
assertion mismatches after all service operations had completed: live provenance
is an object (`source.state`/`source.door`), and logout restores the safe default
question instead of leaving it empty. Those assertions were corrected and the
14/14 owner run above proved the corrected expectations. No production code was
changed to turn those runner failures green.

Before the final P2-M03 pass, a post-window retry exposed that the test runner
used a Supabase-blocked example domain, followed by the built-in SMTP quota.
The runner was corrected to require a nonce-bearing real-domain test-mailbox
template, its regression passed, custom SMTP was configured, and only then was
the final 12/12 run recorded above.

## Reproducible controlled-failure procedure

The runner supports a single bounded deployed failure exercise after the valid
FlowFuse values have been copied to a secure temporary location:

```text
node tools/run-phase2-owner-gates.js --expect-telegram-failure --expect-gemini-failure
```

Run it only while FlowFuse uses a deliberately invalid Telegram destination and
a deliberately nonexistent Gemini model, then restore both valid values and
redeploy. The executed runner observed `notification_status=failed`, a controlled Gemini
503/provider code, an intact trusted `LOCKED` state, no crash/retry loop, a
revoked test session, and the safe retained MQTT baseline.

This is development service evidence, not ESP32/MC-38 hardware evidence.
