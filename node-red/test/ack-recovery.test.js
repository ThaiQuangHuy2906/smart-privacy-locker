'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { makeRuntime, prime, headers, LOCKER_A, state, heartbeat } = require('./helpers');

function ack(command, overrides = {}) {
  const target = command.action === 'UNLOCK' ? { lock: 'UNLOCKED' }
    : command.action === 'LOCK' ? { lock: 'LOCKED' }
      : command.action === 'LED_ON' ? { led: 'ON' } : {};
  return { schema_version: 1, command_id: command.command_id, locker_id: LOCKER_A,
    action: command.action, result: 'success', device_state: { door: 'CLOSED', lock: 'LOCKED',
      alarm: 'INACTIVE', led: 'OFF', ...target }, error: null, duplicate: false,
    timestamp: '2026-08-08T08:00:01.000Z', ...overrides };
}

test('P2-A06 matching ACK completes only its pending command and updates confirmed state', async () => {
  const { runtime, clock } = makeRuntime(); await prime(runtime);
  const dispatched = await runtime.protectedCommand({ headers: headers(), body: { locker_id: LOCKER_A, action: 'UNLOCK' } });
  clock.value += 1000;
  const result = await runtime.ingest(`locker/${LOCKER_A}/ack`, ack(dispatched.command), clock.value);
  assert.equal(result.result.ok, true);
  assert.equal(runtime.dispatcher.pending.size, 0);
  assert.equal(runtime.cache.snapshot(LOCKER_A, clock.value).state.lock, 'UNLOCKED');
});

test('P2-A07 wrong ID/locker/action/state cannot cancel pending; duplicate and late ACK cannot resurrect', async () => {
  const { runtime, clock } = makeRuntime(); await prime(runtime);
  const dispatched = await runtime.protectedCommand({ headers: headers(), body: { locker_id: LOCKER_A, action: 'UNLOCK' } });
  const wrongId = ack(dispatched.command, { command_id: '10000000-0000-4000-8000-000000009999' });
  const unknown = await runtime.ingest(`locker/${LOCKER_A}/ack`, wrongId, clock.value);
  assert.equal(unknown.result.code, 'UNKNOWN_ACK');
  assert.equal(unknown.accepted, false);
  assert.equal(runtime.dispatcher.pending.size, 1);
  assert.equal((await runtime.ingest(`locker/${LOCKER_A}/ack`, ack(dispatched.command, { locker_id: 'LOCKER-002' }), clock.value)).accepted, false);
  const wrongAction = await runtime.ingest(`locker/${LOCKER_A}/ack`,
    ack(dispatched.command, { action: 'LOCK' }), clock.value);
  assert.equal(wrongAction.result.code, 'ACK_CORRELATION_MISMATCH');
  assert.equal(wrongAction.accepted, false);
  const wrongState = await runtime.ingest(`locker/${LOCKER_A}/ack`, ack(dispatched.command,
    { device_state: { door: 'CLOSED', lock: 'LOCKED', alarm: 'INACTIVE', led: 'OFF' } }),
  clock.value);
  assert.equal(wrongState.result.code, 'ACK_CORRELATION_MISMATCH');
  assert.equal(wrongState.accepted, false);
  assert.equal((await runtime.ingest(`locker/${LOCKER_A}/ack`, ack(dispatched.command), clock.value)).result.ok, true);
  const duplicate = await runtime.ingest(`locker/${LOCKER_A}/ack`,
    ack(dispatched.command, { duplicate: true }), clock.value);
  assert.equal(duplicate.result.code, 'DUPLICATE_OR_LATE_ACK');
  assert.equal(duplicate.accepted, false);
  assert.deepEqual(runtime.diagnostics.map((item) => item.code), [
    'UNKNOWN_ACK', 'LOCKER_MISMATCH', 'ACK_CORRELATION_MISMATCH', 'ACK_CORRELATION_MISMATCH',
    'DUPLICATE_OR_LATE_ACK',
  ]);
});

test('a correlated device-error ACK is accepted, closes pending, and refreshes reported state', async () => {
  const { runtime, clock } = makeRuntime(); await prime(runtime);
  const dispatched = await runtime.protectedCommand({ headers: headers(),
    body: { locker_id: LOCKER_A, action: 'UNLOCK' } });
  clock.value += 1000;
  const failed = await runtime.ingest(`locker/${LOCKER_A}/ack`, ack(dispatched.command, {
    result: 'error',
    device_state: { door: 'CLOSED', lock: 'LOCKED', alarm: 'INACTIVE', led: 'ON' },
    error: { code: 'ACTUATION_FAILED', message: 'Servo did not complete' },
  }), clock.value);

  assert.equal(failed.accepted, true);
  assert.equal(failed.result.code, 'COMMAND_FAILED');
  assert.equal(runtime.dispatcher.pending.size, 0);
  assert.equal(runtime.cache.snapshot(LOCKER_A, clock.value).state.led, 'ON');
  assert.equal(runtime.diagnostics.length, 0);
});

test('P2-A08 timeout never retries actuator and emits at most one GET_STATE reconciliation', async () => {
  const { runtime, clock, publications } = makeRuntime(); await prime(runtime);
  const dispatched = await runtime.protectedCommand({ headers: headers(), body: { locker_id: LOCKER_A, action: 'LED_ON' } });
  clock.value += 5000;
  const expired = runtime.dispatcher.expire();
  assert.equal(expired.length, 1);
  assert.equal(expired[0].code, 'COMMAND_TIMEOUT');
  assert.equal(publications.filter((item) => item.payload.action === 'LED_ON').length, 1);
  assert.equal(publications.filter((item) => item.payload.action === 'GET_STATE').length, 1);
  clock.value += 5000;
  const reconciliationExpired = runtime.dispatcher.expire();
  assert.equal(reconciliationExpired.length, 1);
  assert.equal(reconciliationExpired[0].pending.action, 'GET_STATE');
  assert.equal(publications.filter((item) => item.payload.action === 'GET_STATE').length, 1);
  assert.equal(runtime.dispatcher.pending.size, 0);
  const late = await runtime.ingest(`locker/${LOCKER_A}/ack`, ack(dispatched.command), clock.value);
  assert.equal(late.result.code, 'DUPLICATE_OR_LATE_ACK');
});

test('P2-A07 restart clears pending/cache/correlation and stale ACK cannot restore success', async () => {
  const { runtime, clock } = makeRuntime(); await prime(runtime);
  const dispatched = await runtime.protectedCommand({ headers: headers(), body: { locker_id: LOCKER_A, action: 'UNLOCK' } });
  runtime.restart();
  assert.equal(runtime.dispatcher.pending.size, 0);
  assert.equal(runtime.uiState({ authenticated: true, ownsLocker: true, lockerId: LOCKER_A }).stale, true);
  const oldAck = await runtime.ingest(`locker/${LOCKER_A}/ack`, ack(dispatched.command), clock.value);
  assert.equal(oldAck.result.code, 'UNKNOWN_ACK');
  assert.equal(runtime.cache.snapshot(LOCKER_A, clock.value).fresh, false);
  runtime.setMqttConnected(true);
  await runtime.ingest(`locker/${LOCKER_A}/availability`, { schema_version: 1, locker_id: LOCKER_A, status: 'ONLINE', sent_at: '2026-08-08T08:00:00.000Z' }, clock.value);
  await runtime.ingest(`locker/${LOCKER_A}/state`, state(), clock.value);
  assert.equal(runtime.cache.snapshot(LOCKER_A, clock.value).fresh, true);
});

test('door telemetry cannot refresh an old full state or re-enable controls', async () => {
  const { runtime, clock } = makeRuntime(); await prime(runtime);
  clock.value += 30_001;
  await runtime.ingest(`locker/${LOCKER_A}/availability`, { schema_version: 1,
    locker_id: LOCKER_A, status: 'ONLINE', sent_at: new Date(clock.value).toISOString() }, clock.value);
  await runtime.ingest(`locker/${LOCKER_A}/telemetry/door`, { schema_version: 1,
    locker_id: LOCKER_A, previous_state: 'CLOSED', state: 'OPEN',
    timestamp: new Date(clock.value).toISOString(), time_synced: true }, clock.value);
  assert.equal(runtime.cache.snapshot(LOCKER_A, clock.value).fresh, false);
  assert.equal(runtime.uiState({ authenticated: true, ownsLocker: true, lockerId: LOCKER_A }).controls.lock.enabled, false);
});

test('periodic heartbeat followed by full state keeps the device fresh beyond 30 seconds', async () => {
  const { runtime, clock } = makeRuntime(); await prime(runtime);

  for (let elapsed = 10_000; elapsed <= 40_000; elapsed += 10_000) {
    clock.value = Date.parse('2026-08-08T08:00:00.000Z') + elapsed;
    const beat = await runtime.ingest(`locker/${LOCKER_A}/heartbeat`, heartbeat(LOCKER_A,
      { sent_at: new Date(clock.value).toISOString() }), clock.value);
    assert.equal(beat.accepted, true);
    await runtime.ingest(`locker/${LOCKER_A}/state`, state(LOCKER_A,
      { timestamp: new Date(clock.value).toISOString() }), clock.value);
  }

  clock.value += 30_000;
  assert.equal(runtime.cache.snapshot(LOCKER_A, clock.value).fresh, true);
  clock.value += 1;
  assert.equal(runtime.cache.snapshot(LOCKER_A, clock.value).fresh, false);
});

test('heartbeat cannot make a retained or explicitly OFFLINE generation trustworthy', async () => {
  const { runtime, clock } = makeRuntime(); await prime(runtime);
  await runtime.ingest(`locker/${LOCKER_A}/availability`, {
    schema_version: 1, locker_id: LOCKER_A, status: 'OFFLINE',
    sent_at: new Date(clock.value).toISOString(),
  }, clock.value);
  clock.value += 10_000;

  const beat = await runtime.ingest(`locker/${LOCKER_A}/heartbeat`, heartbeat(LOCKER_A,
    { sent_at: new Date(clock.value).toISOString() }), clock.value);
  assert.equal(beat.accepted, false);
  assert.equal(beat.code, 'HEARTBEAT_WITHOUT_CURRENT_ONLINE');
  assert.equal(runtime.cache.snapshot(LOCKER_A, clock.value).fresh, false);
});

test('MQTT reconnect requires availability and full state from the new connection generation', async () => {
  const { runtime, clock } = makeRuntime(); await prime(runtime);
  runtime.setMqttConnected(false);
  runtime.setMqttConnected(true);
  assert.equal(runtime.cache.snapshot(LOCKER_A, clock.value).fresh, false);
  await runtime.ingest(`locker/${LOCKER_A}/availability`, { schema_version: 1,
    locker_id: LOCKER_A, status: 'ONLINE', sent_at: new Date(clock.value).toISOString() }, clock.value);
  assert.equal(runtime.cache.snapshot(LOCKER_A, clock.value).fresh, false);
  await runtime.ingest(`locker/${LOCKER_A}/state`, state(), clock.value);
  assert.equal(runtime.cache.snapshot(LOCKER_A, clock.value).fresh, true);
});

test('retained availability/state arriving just before connected status belong to the next generation', async () => {
  const { runtime, clock } = makeRuntime();
  await runtime.ingest(`locker/${LOCKER_A}/availability`, { schema_version: 1,
    locker_id: LOCKER_A, status: 'ONLINE', sent_at: new Date(clock.value).toISOString() }, clock.value);
  await runtime.ingest(`locker/${LOCKER_A}/state`, state(), clock.value);
  assert.equal(runtime.cache.snapshot(LOCKER_A, clock.value).fresh, false);
  runtime.setMqttConnected(true);
  assert.equal(runtime.cache.snapshot(LOCKER_A, clock.value).fresh, true);

  runtime.setMqttConnected(false);
  runtime.setMqttConnected(true);
  assert.equal(runtime.cache.snapshot(LOCKER_A, clock.value).fresh, false);
});

test('MQTT connect bootstraps GET_STATE once without requiring an already-fresh cache', () => {
  const { runtime, publications } = makeRuntime();
  const first = runtime.setMqttConnected(true, [LOCKER_A]);
  assert.equal(first.bootstrap.length, 1);
  assert.equal(first.bootstrap[0].ok, true);
  assert.equal(publications.length, 1);
  assert.equal(publications[0].payload.action, 'GET_STATE');
  assert.equal(runtime.setMqttConnected(true, [LOCKER_A]).bootstrap.length, 0);
});

test('MQTT disconnect fails pending commands and reconnect emits a fresh bootstrap', async () => {
  const { runtime, publications } = makeRuntime(); await prime(runtime);
  const dispatched = runtime.dispatcher.dispatchInternal({ lockerId: LOCKER_A, action: 'GET_STATE' });
  assert.equal(dispatched.ok, true);
  const disconnected = runtime.setMqttConnected(false);
  assert.equal(disconnected.cancelled.length, 1);
  assert.equal(disconnected.cancelled[0].code, 'MQTT_DISCONNECTED');
  assert.equal(runtime.dispatcher.pending.size, 0);
  const reconnected = runtime.setMqttConnected(true, [LOCKER_A]);
  assert.equal(reconnected.bootstrap[0].ok, true);
  assert.equal(publications.filter((item) => item.payload.action === 'GET_STATE').length, 2);
});
