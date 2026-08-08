# Automated evidence — Phase 2

**Recorded:** 2026-08-08, Windows, branch `phase/2-minh-security-orchestration`

**Source:** Phase 2 corrective working tree after independent requirement review
**Credentials/services/hardware used:** none

## Toolchain

- Node.js `v24.19.0`; npm `11.17.0`.
- PlatformIO Core `6.1.18`, installed under ignored `.tools/`; Core/package cache redirected into workspace because sandbox cannot write the user profile.
- `espressif32@6.10.0`, Arduino framework `3.20017.241212`, Xtensa toolchain `8.4.0+2021r2-patch5`.
- MinGW g++ `13.1.0` for the independent initial door smoke test.

## Firmware regression and P2-A01

Commands actually run:

```text
python -X utf8 -m platformio test -e native
python -X utf8 -m platformio run -e esp32dev -t clean
python -X utf8 -m platformio run -e esp32dev
```

Final result: **PASS**. Native suites: **10/10** (Phase 1 command contract 7/7;
Phase 2 door debounce 3/3) in 2.145 seconds. Clean target exit 0 in 0.620
seconds. Clean ESP32 build exit 0 in 25.188 seconds.

```text
RAM:   16.1% (52,916 / 327,680 bytes)
Flash: 83.9% (1,099,117 / 1,310,720 bytes)
```

Compared with Phase 1: +16 RAM bytes and +1,744 flash bytes. The first Phase 2
build correctly failed because `main.cpp` lacked the new `pin_map.h` include;
that defect was fixed, then the complete native/clean/build sequence above was
rerun successfully. No failed result was relabeled as PASS.

## P2-A02–P2-A13 and Phase 3 fixtures

Command actually run from `node-red/`:

```text
npm test
```

Final result: **PASS — 38/38**, 0 failed, 0 skipped, 0 todo. The runner covers:

- MQTT state/door/availability/ACK/command validation, invalid-side-effect rejection, and proof that door telemetry cannot refresh an old full state;
- canonical Bearer auth, spoof rejection, owner/readiness gates, `locker_code` ownership query, and internal allowlist;
- valid dispatcher, domain conflict, exact ACK state matching, wrong/duplicate/late ACK;
- 5000 ms timeout, exactly one GET_STATE even after the reconciliation command expires, restart empty/stale recovery, and fresh availability/full-state requirements for each MQTT connection generation;
- authorized window consume/exact boundary/restart, unauthorized episode and ALARM_ON;
- non-blocking ALARM_ON versus Telegram delivery, bounded HTTP timeout, full notification status schema, message/dedupe/rate-limit/one-attempt controlled failure;
- chatbot classifier, live missing/provider error, explicit unconfigured-history result, correlated history counts/provenance, and Gemini credential header transport;
- Dashboard stale/pending control model and sensitive-state clearing, versioned event/alarm/history fixtures, unsynced-device-time metadata, and nullable non-applicable authorization;
- migration RLS/claim contract plus disposable `auth.users` prerequisites, populated security flow responsibility/export, and frontend secret-boundary assertions.

## P2-S01 simulator matrix

```text
node tools/device-simulator/run-matrix.js
```

Result: **PASS**, 14 deterministic scenarios and 8 matrix assertions. Retained
inventory contains only `availability` and full `state`; door telemetry is not
retained. Modes include success/error/duplicate/delayed/no ACK, wrong ID/locker/
action/state, malformed payload, reconnect and GET_STATE. This is an in-process
memory-broker/simulator SOFTWARE-GATE, not an authenticated network broker or
hardware capture.

An additional real MQTT 3.1.1 loopback integration was run:

```text
npm run test:broker
```

Result: **PASS**, 13 assertions. Aedes listened on an ephemeral `127.0.0.1` TCP
port, accepted only the fixed test username/password, rejected anonymous
connection, and real MQTT clients passed retained availability/state and
non-retained door telemetry through `Phase2Runtime`. The runtime verified cache
freshness, unauthorized detection/latest alert, dispatched a correlated
GET_STATE and consumed its ACK/state, then handled LWT OFFLINE and reconnect
ONLINE/state. It remains simulator/broker/runtime software evidence, not an
imported FlowFuse deployment or ESP32/MC-38 hardware evidence.

## Dependency and secret/config audits

The first install of vendored Node-RED 4.0.9 exposed 4 critical/9 high
advisories. It was upgraded to 4.1.13; the remaining advisories belonged to the
runtime's bundled palette-manager npm. Because FlowFuse supplies Node-RED, the
project now declares Node-RED `>=4.1.13 <5` as an optional peer and installs only
the pinned `@flowfuse/node-red-dashboard@1.29.0`. Final commands:

```text
npm audit --audit-level=high
node scripts/audit-config.js
```

Final result: **PASS** — npm found **0 vulnerabilities** across 242 installed
packages; source/config scan found **0 forbidden secret/config patterns**.
Working tree/diff/history-aware scans are repeated in the final audit record.

## Not executed

P2-M01–P2-M08 were not executed: no ESP32/MC-38, Supabase/FlowFuse project,
Telegram credential, or Gemini credential is present. Their exact gate status is
kept in `README.md` and `tests/test-plan.md`; none is represented as PASS.
