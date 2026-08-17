'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { validateState, validateDoor, validateAvailability, validateHeartbeat,
  validateAck, validateCommand } = require('../lib/contracts');
const { state, availability, heartbeat, LOCKER_A } = require('./helpers');

test('P2-A02 rejects malformed/schema/enum/topic mismatch without accepting input', () => {
  assert.equal(validateState(`locker/${LOCKER_A}/state`, '{').ok, false);
  assert.equal(validateState(`locker/${LOCKER_A}/state`, state(LOCKER_A, { schema_version: 2 })).code, 'INVALID_SCHEMA');
  assert.equal(validateState(`locker/${LOCKER_A}/state`, state(LOCKER_A, { door: 'BROKEN' })).code, 'INVALID_STATE');
  assert.equal(validateState(`locker/${LOCKER_A}/state`, state('LOCKER-002')).code, 'LOCKER_MISMATCH');
  assert.equal(validateAvailability(`locker/${LOCKER_A}/availability`, availability()).ok, true);
});

test('heartbeat contract is non-state liveness with a bounded canonical shape', () => {
  assert.equal(validateHeartbeat(`locker/${LOCKER_A}/heartbeat`, heartbeat()).ok, true);
  assert.equal(validateHeartbeat(`locker/${LOCKER_A}/heartbeat`, heartbeat('LOCKER-002')).code,
    'LOCKER_MISMATCH');
  assert.equal(validateHeartbeat(`locker/${LOCKER_A}/heartbeat`, heartbeat(LOCKER_A,
    { sent_at: 'not-a-time' })).code, 'INVALID_HEARTBEAT');
  assert.equal(validateHeartbeat(`locker/${LOCKER_A}/state`, heartbeat()).ok, false);
});

test('door transition enforces non-UNKNOWN edge and unsynced timestamp policy', () => {
  const base = { schema_version: 1, locker_id: LOCKER_A, previous_state: 'CLOSED', state: 'OPEN',
    timestamp: '2026-08-08T08:00:00.000Z', time_synced: true };
  assert.equal(validateDoor(`locker/${LOCKER_A}/telemetry/door`, base).ok, true);
  assert.equal(validateDoor(`locker/${LOCKER_A}/telemetry/door`, { ...base, state: 'CLOSED' }).ok, false);
  assert.equal(validateDoor(`locker/${LOCKER_A}/telemetry/door`, { ...base, timestamp: null, time_synced: false }).ok, true);
});

test('command and ACK fixtures enforce correlation shapes', () => {
  const command = { schema_version: 1, command_id: '10000000-0000-4000-8000-000000000001', locker_id: LOCKER_A,
    action: 'LOCK', issued_at: '2026-08-08T08:00:00.000Z', requested_by: 'system:unauthorized-detector' };
  assert.equal(validateCommand(`locker/${LOCKER_A}/command`, command).ok, true);
  const ack = { schema_version: 1, command_id: command.command_id, locker_id: LOCKER_A,
    action: 'LOCK', result: 'success', device_state: state().lock ? state() : {}, error: null,
    duplicate: false, timestamp: '2026-08-08T08:00:01.000Z' };
  assert.equal(validateAck(`locker/${LOCKER_A}/ack`, ack).ok, true);
  assert.equal(validateAck(`locker/${LOCKER_A}/ack`, { ...ack, error: { code: 'X', message: 'x' } }).ok, false);
});
