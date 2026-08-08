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
that full state/availability are retained while door transitions and commands
are not. `DeviceSimulator` supports success/error/duplicate/delayed/no ACK,
wrong ID/locker/action/state, malformed payload, reconnect, `GET_STATE`, and
restart-recovery inputs. `scenario-fixtures.json` is deterministic and contains
no account, credential, or production data.

For a live broker deployment, connect the same `DeviceSimulator.receiveCommand`
and publication callbacks to the deployment's authenticated MQTT client. MQTT
credentials must remain in the local environment; this repository deliberately
does not ship a broker password or pretend a memory harness is a network capture.

`run-live-broker.js` starts an authenticated Aedes broker on an ephemeral
loopback TCP port and uses real MQTT 3.1.1 clients to verify retained replay,
non-retained door telemetry, command/ACK, LWT and reconnect. Its credentials are
fixed test-only strings and the port is not exposed beyond localhost. This is
network-broker software evidence, still not physical ESP32/MC-38 evidence.
