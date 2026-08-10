# Phase 3 automated results — 2026-08-10

Branch: `phase/3-thuy-data-integration`

| Gate | Result |
|---|---|
| `npm test` | PASS — 92/92 |
| `npm run test:simulator` | PASS — 8 assertions, 14 scenarios |
| `npm run test:broker` | PASS — 15 assertions on authenticated loopback broker |
| `npm run audit` | PASS — 0 configuration/secret findings |
| `npm audit --audit-level=high` | PASS — 0 vulnerabilities |
| generated FlowFuse determinism | PASS inside Node suite |
| CB3 host `g++ -Wall -Wextra -Werror` smoke | PASS |

The Phase 3 Node tests cover alarm ACK/state/persistence, every canonical event
mapping, duplicate/error handling, owner gates, 7/30-day local-time aggregation,
email content and database-backed duplicate suppression.

PlatformIO Core was installed in an isolated temporary path, but the runner
could not download its native platform packages in this execution environment.
Therefore no full `pio test -e native` or `pio run -e esp32dev` result is claimed
here. The committed Unity test must be rerun in the project workstation before
Git lifecycle completion. No hardware or live-service result is implied.
