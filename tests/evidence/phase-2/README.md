# Phase 2 evidence index

> This directory preserves the dated Phase 2 baseline. Current correction-pass
> software totals and generated-artifact identity are recorded in
> [../phase-3/automated-results.md](../phase-3/automated-results.md).

| Evidence | Status | Location |
|---|---|---|
| P1 regression + P2-A01 firmware native/clean build | Automated PASS | `automated-results.md` |
| P2-A02–P2-A13 Node contract suites | Automated PASS | `automated-results.md` |
| P2-S01 authenticated local TCP broker + simulator matrix | Simulator/Broker SOFTWARE-GATE PASS | `automated-results.md`; not hardware evidence |
| Dependency/secret/config audits | Automated PASS | `automated-results.md` |
| P2-M01/P2-M02 | `[ ] DEFERRED — HARDWARE-FINAL-GATE` | blocked by absent ESP32/MC-38 |
| P2-M03 | Manual HARD-GATE PASS | `live-service-results.md`; public signup, profile, login/session/callback/reload/logout/PII/Bearer checks and cleanup all pass |
| P2-M04/P2-M05 | Manual HARD-GATE PASS | `live-service-results.md`; complete two-user UI/API/RLS/broker and 200/409/409 claim evidence |
| P2-M06/P2-M07 | Manual FINAL-GATE PASS | `live-service-results.md`; delivered, controlled failure, ACK, cleanup, and restore evidence |
| P2-M08 | Manual FINAL-GATE PASS | `live-service-results.md`; grounded success, controlled provider failure, cleanup, and restore evidence |
| Automatic Telegram private-account rollout | Partial deployment PASS | `live-service-results.md`; current Dashboard/webhook/private-Start/link/test/sanitized-response subset passes, while preference replay/disconnect/relink remains unticked in `tests/test-plan.md` |

Raw captures that may contain identifiers/tokens belong in ignored `private/`.
Only sanitized evidence may be committed. No simulator row is an ESP32, MC-38,
LWT, GPIO, physical broker, or hardware PASS.
