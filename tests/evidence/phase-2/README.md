# Phase 2 evidence index

| Evidence | Status | Location |
|---|---|---|
| P1 regression + P2-A01 firmware native/clean build | Automated PASS | `automated-results.md` |
| P2-A02–P2-A13 Node contract suites | Automated PASS | `automated-results.md` |
| P2-S01 authenticated local TCP broker + simulator matrix | Simulator/Broker SOFTWARE-GATE PASS | `automated-results.md`; not hardware evidence |
| Dependency/secret/config audits | Automated PASS | `automated-results.md` |
| P2-M01/P2-M02 | `[ ] DEFERRED — HARDWARE-FINAL-GATE` | blocked by absent ESP32/MC-38 |
| P2-M03–P2-M05 | `[ ] MANUAL — HARD-GATE Pending` | blocked by absent Supabase/FlowFuse environment and test accounts |
| P2-M06/P2-M07 | `[ ] MANUAL — FINAL-GATE Pending` | absent Telegram test token/chat |
| P2-M08 | `[ ] MANUAL — FINAL-GATE Pending` | absent Gemini key/model/quota |

Raw captures that may contain identifiers/tokens belong in ignored `private/`.
Only sanitized evidence may be committed. No simulator row is an ESP32, MC-38,
LWT, GPIO, physical broker, or hardware PASS.
