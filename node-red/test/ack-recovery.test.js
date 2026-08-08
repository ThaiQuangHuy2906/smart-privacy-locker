'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { makeRuntime, prime, headers, LOCKER_A, state } = require('./helpers');

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
  const dispatched = await runtime.protectedCommand({ headers: headers(), body: { locker_id: LOCKER_A, action: 'LOCK' } });
  const wrongId = ack(dispatched.command, { command_id: '10000000-0000-4000-8000-000000009999' });
  assert.equal((await runtime.ingest(`locker/${LOCKER_A}/ack`, wrongId, clock.value)).result.code, 'UNKNOWN_ACK');
  assert.equal(runtime.dispatcher.pending.size, 1);
  assert.equal((await runtime.ingest(`locker/${LOCKER_A}/ack`, ack(dispatched.command, { locker_id: 'LOCKER-002' }), clock.value)).accepted, false);
  assert.equal((await runtime.ingest(`locker/${LOCKER_A}/ack`, ack(dispatched.command, { action: 'UNLOCK' }), clock.value)).result.code, 'ACK_CORRELATION_MISMATCH');
  assert.equal((await runtime.ingest(`locker/${LOCKER_A}/ack`, ack(dispatched.command, { device_state: { door: 'CLOSED', lock: 'UNLOCKED', alarm: 'INACTIVE', led: 'OFF' } }), clock.value)).result.code, 'ACK_CORRELATION_MISMATCH');
  assert.equal((await runtime.ingest(`locker/${LOCKER_A}/ack`, ack(dispatched.command), clock.value)).result.ok, true);
  assert.equal((await runtime.ingest(`locker/${LOCKER_A}/ack`, ack(dispatched.command, { duplicate: true }), clock.value)).result.code, 'DUPLICATE_OR_LATE_ACK');
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
  const late = await runtime.ingest(`locker/${LOCKER_A}/ack`, ack(dispatched.command), clock.value);
  assert.equal(late.result.code, 'DUPLICATE_OR_LATE_ACK');
});

test('P2-A07 restart clears pending/cache/window and stale ACK cannot restore success', async () => {
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
