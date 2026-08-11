# Phase 3 automated results — 2026-08-11

Branch: `phase/3-thuy-data-integration`

| Gate | Result |
|---|---|
| `npm test` | PASS — 145/145; 0 failed, 0 skipped, 0 todo |
| `npm run test:simulator` | PASS — 8 assertions, 14 scenarios |
| `npm run test:broker` | PASS — 15 assertions on authenticated loopback broker |
| `npm run audit` | PASS — 0 configuration/secret findings |
| `npm audit --audit-level=high` | PASS — 0 vulnerabilities |
| generated FlowFuse artifact + deterministic artifact test | PASS — SHA-256 `27ab25fc70abf62b06cf5f5fca7f359339496a041fa920e672839e4aeb63fd15` (235,573 bytes; 81 nodes; 7 tabs; 15 unique HTTP routes; no credential object) |
| Chrome/CDP responsive DOM + visual QA | PASS — 1440 px desktop plus exact 390/320 px mobile; no card overlap or horizontal overflow; no button below 44 px; skip-link/focus, reduced-motion, conditional settings and the local-only YC12 setup panel verified |
| `pio test -e native` | PASS — 17/17 |
| clean `pio run -e esp32dev` | PASS — RAM 16.2%, flash 84.2% |
| CB3 host `g++ -Wall -Wextra -Werror` smoke | PASS |

The Phase 3 Node tests cover alarm ACK/state/persistence, every canonical event
mapping, duplicate/error handling, owner gates, offline history/chart/settings,
independent history/chart failures, paginated event/settings reads beyond 1000
rows, timestamp-less retained availability, 7/30-day local-time aggregation,
accessible zero buckets, email configuration preflight/content,
bounded retry, ambiguous SMTP outcomes, restart recovery, canonical report-date
dedupe and state-guarded database delivery transitions.

YC12 regressions prove that the validated `wifi_connected` state reaches the
owner UI only while fresh, becomes `UNKNOWN` after staleness or locker-context
changes, and that the embedded setup panel contains the local
`Locker-Setup`/`192.168.4.1` procedure without any credential input.

Corrective regressions also cover ESP32Servo channel-zero initialization,
bounded Supabase response-body/invalid-JSON failures, a token expiring between
verify and ownership, same-domain command locking, stale request generations,
conditional notification fields, friendly history rendering and explicit
chart empty state. The latest regressions also prove that history, chart,
Dashboard timestamps and YC8 database context use the selected locker's saved
timezone, and that database-backed views/chat use longer but still bounded
browser deadlines without leaking client-only options to `fetch`.

The 2026-08-11 revalidation additionally covers owner-scoped automatic Telegram
linking: private-chat-only deep links, hash-only short-lived tokens, byte-safe
webhook-secret verification, idempotent same-account webhook retry,
cross-account replay denial, retry-safe handling of unknown provider 4xx
failures, hidden provider identifiers, disconnect/test routes, per-locker alert
routing, plain private `/start`/`/help`/`/settings` guidance, blocked-popup
fallback behavior, and UI polling races. These local tests do not by themselves
prove a deployed webhook. The separately recorded live subset now proves the
current Dashboard response, webhook secret boundary, private **Start** link,
sanitized connection response and test-message path; the remaining stateful
lifecycle checks stay unticked in `tests/test-plan.md`.

The product-facing deployment now uses `/locker` and the FlowFuse Dashboard
wrapper `/dashboard/locker`. The generated export keeps one `GET /phase2`
compatibility alias for existing direct links; the public HTML and FlowFuse tab
labels no longer present Phase 1/2/3 as product branding.

PlatformIO Core 6.1.18 ran the native suite directly from the repository's
Vietnamese Windows path and passed 17/17. The Xtensa clean `esp32dev` build
reproduced a path-encoding failure there, then succeeded against the same
unchanged source through a temporary ASCII drive mapping; the mapping was
removed after the run. The build used the pinned
`espressif32@6.10.0` platform. This is compile/native software evidence only; no
GPIO, active-buzzer polarity, current draw, ESP32 transport or other physical
behavior is implied.

The forward migrations
`202608100002_phase3_scheduler_delivery_hardening.sql`,
`202608110001_telegram_account_linking.sql` and
`202608110002_telegram_link_consume_conflict_fix.sql`, and
`202608110003_telegram_notification_preference_upsert_fix.sql`, plus their pgTAP contract, were
not rerun by the local automated command set because Supabase CLI, `psql` and
Docker were unavailable. The scheduler hardening migration was
applied/executed separately on the development project with sanitized P3-M04
results recorded in `live-service-results.md`. The automatic Telegram schema
and webhook now pass the non-destructive deployed subset recorded there; a
clean local database rebuild/pgTAP run and the remaining Telegram lifecycle
rows are still required before final release. P3-M05 has sanitized
30-day/local-midnight development evidence, and P3-M06 has separate live SMTP
evidence there. Hardware gates remain manual requirements.
