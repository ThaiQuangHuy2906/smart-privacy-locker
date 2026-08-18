# Phase 3 automated results — revalidated 2026-08-18

Branch: `develop`

| Gate | Result |
|---|---|
| `npm test` | PASS — 180/180; 0 failed, 0 skipped, 0 todo, including the email notification-exclusion/local-time regressions and deterministic generated export |
| `npm run test:simulator` | PASS — 28 assertions, 22 scenarios |
| `npm run test:broker` | PASS — 18 assertions on authenticated loopback broker |
| `npm run audit` | PASS — 0 configuration/secret findings |
| `npm audit --omit=dev` | PASS — 0 vulnerabilities |
| generated FlowFuse artifact + deterministic artifact test | PASS — SHA-256 `99285b3535c64d711673fd4b701201b0232a62a292892b223a8f81b04640af55` (268,371 bytes; 81 nodes; 7 tabs; 15 unique HTTP routes; no credential object) |
| Chrome/CDP responsive DOM + visual QA | PASS — 18 checks at 1280×720 and exact 320×800; action gates, auth privacy, focus, effective targets, reduced motion, chart/table equivalence, 5-second polling and classic-scrollbar reflow verified |
| `python -m platformio test -e native` | PASS — 28/28 |
| clean `.\firmware\build-esp32.ps1` | PASS — 53,580 RAM bytes (16.4%); 1,108,145 flash bytes (84.5%) |
| `.\arduino\sync-sketch.ps1 -Check` | PASS — 32 tracked source files match byte-for-byte |
| isolated Arduino profile | PASS — 53,608 RAM bytes; 1,112,269 program bytes |
| Arduino IDE-equivalent profile | NOT RERUN after auto-lock — earlier 53,600/1,111,201-byte result is historical; current mirror is covered by isolated profile + byte parity |
| clean Wokwi build | PASS — 22,440 RAM bytes (6.8%); 322,729 flash bytes (24.6%) |

The Phase 3 Node tests cover alarm ACK/state/persistence, every canonical event
mapping, duplicate/error handling, owner gates, offline history/chart/settings,
independent history/chart failures, paginated event/settings reads beyond 1000
rows, event-ID deduplication across concurrently shifted offset pages,
timestamp-less retained availability, 7/30-day local-time aggregation,
accessible zero buckets, email configuration preflight/content,
localized report/activity timestamps, exclusion of notification-delivery events
from the latest locker activity, bounded retry, ambiguous SMTP outcomes, restart
recovery, canonical report-date dedupe and state-guarded database delivery
transitions. Persistence health now
retains an actionable pending/dead-letter error instead of exposing
`status:error` with a null diagnostic after a later successful write.

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

The current firmware/simulator regressions additionally prove that one CLOSED
door `UNLOCK` grants exactly one opening, an observed close auto-locks without a
fake ACK, an unused grant auto-locks at the exact wrap-safe 30-second boundary,
boot does not arm servo movement, and a later ungranted OPEN alarms. Re-arm is
denied while OPEN. In-flight command-driven or automatic servo movement cannot
enter a same-state success shortcut; cancellation makes lock state `UNKNOWN`.
Reconnect bootstrap, heartbeat and deferred retained state all wait for the
door-event FIFO so newer snapshots cannot overtake queued physical edges.

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
Vietnamese Windows path and passed 28/28. The Xtensa clean `esp32dev` build
reproduced a path-encoding failure there, then succeeded against the same
unchanged source through a temporary ASCII drive mapping; the mapping was
removed after the run. The build used the pinned
`espressif32@6.10.0` platform and produced 53,580 RAM bytes plus 1,108,145
flash bytes. This is compile/native software evidence only; no
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
