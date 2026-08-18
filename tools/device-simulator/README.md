# Device simulator (test support only)

This deterministic harness implements MQTT v1 producer/consumer semantics for
software tests. It is not production firmware and its output is not ESP32,
MC-38, LWT, GPIO, or hardware evidence.

Run the complete matrix from the repository root:

```powershell
node tools/device-simulator/run-matrix.js
node tools/device-simulator/run-live-broker.js
```

`MemoryBroker` models topic subscription and retained replay so tests can prove
that full state/availability are retained while heartbeat, door transitions and
commands are not. `DeviceSimulator` supports success/error/duplicate/delayed/no ACK,
wrong ID/locker/action/state, malformed payload, reconnect, `GET_STATE`, local
lock-on-close and exact 30-second unused-grant expiry. `scenario-fixtures.json` is deterministic and contains
no account, credential, or production data.

For a live broker deployment, connect the same `DeviceSimulator.receiveCommand`
and publication callbacks to the deployment's authenticated MQTT client. MQTT
credentials must remain in the local environment; this repository deliberately
does not ship a broker password or pretend a memory harness is a network capture.

`run-live-broker.js` starts an authenticated Aedes broker on an ephemeral
loopback TCP port and uses real MQTT 3.1.1 clients to verify retained replay,
non-retained heartbeat/door telemetry, command/ACK, LWT and reconnect. Its credentials are
fixed test-only strings and the port is not exposed beyond localhost. This is
network-broker software evidence, still not physical ESP32/MC-38 evidence.

Audit rerun 2026-08-18: `npm run test:simulator` passed 28 assertions across 22
scenarios and `npm run test:broker` passed 18 assertions, including the
UUIDv4 door-event identity. These results do not
close power, GPIO, motion, sound or full E2E gates. Follow
[../../HUONG_DAN_TEST_END_TO_END.md](../../HUONG_DAN_TEST_END_TO_END.md) for the
hardware/deployment sequence.
