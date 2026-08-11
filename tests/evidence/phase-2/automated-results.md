# Automated evidence — Phase 2

**Recorded:** 2026-08-09; full current-tree revalidation 2026-08-11 on Windows

**Source:** the current corrective working tree after the Phase 1/Phase 2 review.
The local automated runs below did not use an ESP32, MC-38, production service
role key, or any credential embedded in committed source. Development services
are configured separately, but the manual service gates listed at the end are
not represented as PASS.

## Toolchain

- Node.js `v24.14.1`; npm `11.11.0`.
- PlatformIO Core `6.1.18`.
- `espressif32@6.10.0`, Arduino framework `3.20017.241212`, Xtensa toolchain
  `8.4.0+2021r2-patch5`.
- The firmware commands used a temporary ASCII `Z:` alias because the Xtensa
  Windows toolchain cannot reliably consume the Vietnamese workspace path. The
  alias was removed in the command's `finally` cleanup.

## Firmware regression and P2-A01

Commands actually run:

```text
python -X utf8 -m platformio test -e native
python -X utf8 -m platformio run -e esp32dev -t clean
python -X utf8 -m platformio run -e esp32dev
```

Final result: **PASS**. Native suites: **14/14** (Phase 1 command contract 7/7;
Phase 2 door debounce 3/3; MQTT retry timer 4/4). The retry regression verifies
that reconnect backoff neither fires early nor stalls across the 32-bit
`millis()` wrap. The clean target and clean ESP32 build both exited successfully.

```text
RAM:   16.2% (52,924 / 327,680 bytes)
Flash: 84.2% (1,103,061 / 1,310,720 bytes)
```

The corrective source change is limited to wrap-safe MQTT retry scheduling and
its native tests. These are compile/native test results, not GPIO, polarity,
power, servo, or door-sensor hardware proof.

## P2-A02–P2-A13, Dashboard regressions, and Phase 3 fixtures

Commands actually run from `node-red/`:

```text
npm run build:flowfuse
npm test
```

Final current-tree result: **PASS — 145/145**, 0 failed, 0 skipped, 0 todo. The
generated `flows.flowfuse.json` contains 81 nodes across seven responsibility
tabs and 15 unique HTTP routes, is deterministic from the tested source,
self-serves the Dashboard at `/locker` with `/phase2` as a compatibility alias,
and contains no Node-RED `credentials` object. The suite covers:

- MQTT state/door/availability/ACK/command validation and invalid-side-effect
  rejection;
- canonical Bearer auth, spoof rejection, owner/readiness gates, provider
  transport/5xx/malformed-response handling, bounded 5-second provider and
  9-second aggregate authorization deadlines (including stalled successful
  response bodies), request-abort suppression, and one-row claim RPC
  normalization;
- secure dispatch, domain conflicts, exact ACK matching, wrong/duplicate/late
  ACK, timeout reconciliation, restart/disconnect/reconnect recovery;
- authorized-window consumption/boundaries/restart and one unauthorized event
  per OPEN episode;
- Telegram payload, automatic private-account linking, hash-only one-time
  tokens, byte-safe exact webhook secret, same-account idempotent retry,
  cross-account replay denial, retry for unknown provider 4xx failures,
  private `/start`/`/help`/`/settings` guidance, blocked-popup fallback,
  per-locker destinations, one-attempt behavior, timeout,
  bounded dedupe/rate-limit state, delivery status, and non-blocking `ALARM_ON`
  dispatch;
- all six YC8 questions, structured grounding context, live/history unavailable
  behavior, provider failure, and Gemini credential header transport;
- Supabase profile metadata, RLS/claim/static privilege contract, including the
  forward least-privilege grants migration and a pgTAP-compatible runtime test
  envelope (`plan`/assertion/`finish`);
- Dashboard implicit-flow fragment cleanup, callback errors, Enter/submitter
  behavior, local-first logout, stale-response isolation (including a late 401
  from an old request), generation-bound auth/claim pending states,
  duplicate-claim prevention, serialized/coalesced polling,
  persistent dedicated success/rejection claim feedback across live-state polls,
  latest-chat-response wins, a 15-second browser request timeout,
  locker-context invalidation, private-field cleanup, and ambiguous physical-
  command timeout handling without automatic retry;
- deterministic FlowFuse bundling, runtime bootstrap without local filesystem
  imports, verified MQTT TLS, API routes, and secret-boundary assertions.

## P2-S01 simulator and broker integration

Commands actually run from `node-red/`:

```text
npm run test:simulator
npm run test:broker
```

The memory simulator result is **PASS**, with 14 deterministic scenarios and 8
assertions. Retained inventory contains only `availability` and full `state`;
door telemetry is not retained. Modes include success/error/duplicate/delayed/no
ACK, wrong ID/locker/action/state, malformed payload, reconnect, and GET_STATE.

The real MQTT 3.1.1 loopback result is **PASS**, with 15 assertions. Aedes
listened on an ephemeral `127.0.0.1` TCP port, accepted only the fixed test
username/password, rejected anonymous access, exercised the exported Node-RED
4.1.13 status handler and startup GET_STATE, then passed retained state,
non-retained door telemetry, correlated command/ACK, LWT OFFLINE, and reconnect
ONLINE/state through `Phase2Runtime`.

Both results are simulator/broker/runtime SOFTWARE-GATE evidence. Neither is an
imported FlowFuse deployment nor ESP32/MC-38 hardware evidence.

## Handoff artifact identities

The final locally verified artifacts can be distinguished from an older live
deployment by these SHA-256 values:

```text
27ab25fc70abf62b06cf5f5fca7f359339496a041fa920e672839e4aeb63fd15  node-red/flows.flowfuse.json
8b047fa6dee8c5c14d5ecf3a786cdab65ca0db06f36ae04fb349f0a359e78aca  supabase/migrations/202608090001_phase2_least_privilege_grants.sql
5201ad4db326641c67fcd16a560eff134d4dea8c5b623b93e23ff3abcad0dc0f  supabase/migrations/202608110001_telegram_account_linking.sql
27367ac2d06117f2343cb5914ab804cfaba3c6ccc46896a3255bf74a86b46b11  supabase/migrations/202608110002_telegram_link_consume_conflict_fix.sql
586517087f07606b2a6c770eb40aa2ba33b8f35ce1065796c02b16e53f06dcde  supabase/migrations/202608110003_telegram_notification_preference_upsert_fix.sql
```

The FlowFuse file is generated from the tested source; it must not be hand-
edited. Re-run `npm run build:flowfuse` after any Dashboard, runtime, or base
flow change, then repeat the full Node suite and update this evidence.

## Dashboard UI verification

The redesigned local source preserved all 19 DOM IDs read by `app.js`, all four
command hooks, explicit button types, label associations, initial disabled
controls, and form pending/`aria-busy` states. Local Chrome/Chromium DevTools
checks covered:

- desktop 1440px and mobile 390px rendering;
- 320px reflow with document/body width equal to the viewport and no horizontal
  overflow;
- keyboard-only order through authentication, claim, locker, chat, and answer;
- minimum 44px control height, visible focus, pending state, and reduced motion;
- measured body/muted/placeholder/status/button contrast at or above 4.61:1.

Both the Playwright wrapper and direct `@playwright/cli 0.1.18` command abort on
Node `v24.14.1` with the same libuv `UV_HANDLE_CLOSING` assertion. Node was not
silently replaced or pinned; local Chrome/Chromium DevTools was used as the
documented fallback. The corrected UI was subsequently redeployed and P2-M03
passed through that live browser path.

## Live deployment status

The final user-run redeploy showed the redesigned UI and corrected auth/logout
behavior. Sanitized runners then passed P2-M04 cross-owner UI/API/RLS/broker
denial and P2-M05 first/repeat/cross-user 200/409/409 claim behavior. P2-M03
then passed custom-SMTP public signup HTTP 200, exact user/profile creation,
login, callback-fragment cleanup, reload persistence, logout, PII cleanup,
Bearer transport, and cleanup (12/12). The earlier example/test-domain defect
is now a fail-fast regression. The deployed behavior matches the generated
artifact, although the SHA-256 above cannot be read back from FlowFuse. The
anonymous boundary exposes only `supabase_url` and `supabase_anon_key`, and
protected routes return 401 without a session. No credential value is stored in
this record.

## Dependency and secret/config audits

The project declares Node-RED `>=4.1.13 <5` as an optional peer because FlowFuse
supplies the runtime, and pins `@flowfuse/node-red-dashboard@1.30.2`.

Commands actually run:

```text
npm run audit
npm audit --audit-level=high
```

Final result: **PASS** — configuration/source assertions found **0 findings**;
npm found **0 vulnerabilities** in the installed dependency tree. Final
working-tree, ignore-rule, generated-export, and secret-value scans are recorded
in the handoff audit; no secret value is printed into this evidence.

## Manual gate status

- P2-M01/P2-M02: `[ ] DEFERRED — HARDWARE-FINAL-GATE`; no ESP32/MC-38 is
  attached, so physical GPIO/polarity/debounce/retained-message behavior remains
  unverified.
- P2-M03: **MANUAL HARD-GATE PASS**; custom-SMTP public signup and all
  session/transport/cleanup checks passed 12/12.
- P2-M04/P2-M05: **MANUAL HARD-GATE PASS**; sanitized two-user
  UI/API/RLS/broker and claim/immutability evidence is in
  `live-service-results.md`.
- P2-M06/P2-M07: **MANUAL FINAL-GATE PASS**; real delivery, controlled failure,
  `ALARM_ON`/ACK continuity, restore, and cleanup are in
  `live-service-results.md`.
- P2-M08: **MANUAL FINAL-GATE PASS**; grounded live success, controlled provider
  failure, restore, Bearer/URL checks, and cleanup are in
  `live-service-results.md`.
- Automatic private-account rollout: **PARTIAL DEPLOYMENT PASS**; the current
  Dashboard/webhook/private-Start/link/test/sanitized-response subset is in
  `live-service-results.md`. Preference save/re-enable, consumed-token replay,
  disconnect and relink remain unticked in `tests/test-plan.md`.

Their exact gate status is also maintained in `tests/test-plan.md`; none is
silently relabeled as PASS.
