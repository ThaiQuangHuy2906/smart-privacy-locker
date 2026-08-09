'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { makeRuntime, prime, headers, LOCKER_A } = require('./helpers');

function commandAck(command, lock = 'UNLOCKED') {
  return { schema_version: 1, command_id: command.command_id, locker_id: LOCKER_A,
    action: command.action, result: 'success', device_state: { door: 'CLOSED', lock,
      alarm: 'INACTIVE', led: 'OFF' }, error: null, duplicate: false,
    timestamp: '2026-08-08T08:00:01.000Z' };
}

function door(previous, current, timestamp = '2026-08-08T08:00:02.000Z') {
  return { schema_version: 1, locker_id: LOCKER_A, previous_state: previous,
    state: current, timestamp, time_synced: true };
}

test('P2-A09 valid UNLOCK ACK opens per-locker window and first OPEN consumes it', async () => {
  const { runtime, clock, publications } = makeRuntime(); await prime(runtime);
  const unlock = await runtime.protectedCommand({ headers: headers(), body: { locker_id: LOCKER_A, action: 'UNLOCK' } });
  clock.value += 1000;
  await runtime.ingest(`locker/${LOCKER_A}/ack`, commandAck(unlock.command), clock.value);
  clock.value += 1000;
  const result = await runtime.ingest(`locker/${LOCKER_A}/telemetry/door`, door('CLOSED', 'OPEN'), clock.value);
  assert.equal(result.outputs[0].event_type, 'DOOR_OPENED');
  assert.equal(result.outputs[0].authorized, true);
  assert.equal(runtime.detector.windows.has(LOCKER_A), false);
  assert.equal(publications.some((item) => item.payload.action === 'ALARM_ON'), false);
});

test('P2-A10 OPEN outside window creates one unauthorized episode and ALARM_ON', async () => {
  let telegramCalls = 0;
  const { runtime, clock, publications } = makeRuntime({ telegramTransport: async () => { telegramCalls += 1; } });
  await prime(runtime); clock.value += 1000;
  const first = await runtime.ingest(`locker/${LOCKER_A}/telemetry/door`, door('CLOSED', 'OPEN'), clock.value);
  assert.deepEqual(first.outputs.slice(0, 2).map((event) => event.event_type), ['DOOR_OPENED', 'UNAUTHORIZED_OPEN']);
  assert.equal(first.outputs[0].authorized, false);
  assert.equal(publications.filter((item) => item.payload.action === 'ALARM_ON').length, 1);
  assert.equal(telegramCalls, 1);
  assert.equal(runtime.cache.snapshot(LOCKER_A, clock.value).latest_alert.event_type, 'UNAUTHORIZED_OPEN');
});

test('P2-A11 duplicate OPEN/held-open telemetry does not duplicate alarm or Telegram', async () => {
  let telegramCalls = 0;
  const { runtime, clock, publications } = makeRuntime({ telegramTransport: async () => { telegramCalls += 1; } });
  await prime(runtime); clock.value += 1000;
  await runtime.ingest(`locker/${LOCKER_A}/telemetry/door`, door('CLOSED', 'OPEN'), clock.value);
  const duplicate = await runtime.detector.onDoor({ lockerId: LOCKER_A, previousState: 'CLOSED', state: 'OPEN',
    deviceState: { door: 'OPEN', lock: 'LOCKED', alarm: 'INACTIVE', led: 'OFF' },
    occurredAt: door().timestamp, observedAt: new Date(clock.value).toISOString() });
  assert.equal(duplicate.length, 0);
  assert.equal(publications.filter((item) => item.payload.action === 'ALARM_ON').length, 1);
  assert.equal(telegramCalls, 1);
});

test('ALARM_ON is dispatched without waiting for Telegram delivery', async () => {
  let finishTelegram;
  const telegramTransport = () => new Promise((resolve) => { finishTelegram = resolve; });
  const { runtime, clock, publications } = makeRuntime({ telegramTransport });
  await prime(runtime); clock.value += 1000;
  const ingest = runtime.ingest(`locker/${LOCKER_A}/telemetry/door`, door('CLOSED', 'OPEN'), clock.value);
  const result = await ingest;
  assert.equal(result.accepted, true);
  assert.equal(publications.filter((item) => item.payload.action === 'ALARM_ON').length, 1);
  assert.equal(runtime.notificationStatuses.length, 0);
  finishTelegram();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(runtime.notificationStatuses[0].status, 'delivered');
});

test('authorized window expires at exact boundary and restart does not restore it', async () => {
  const { runtime, clock } = makeRuntime(); await prime(runtime);
  const unlock = await runtime.protectedCommand({ headers: headers(), body: { locker_id: LOCKER_A, action: 'UNLOCK' } });
  await runtime.ingest(`locker/${LOCKER_A}/ack`, commandAck(unlock.command), clock.value);
  clock.value += 30000;
  const exact = await runtime.detector.onDoor({ lockerId: LOCKER_A, previousState: 'CLOSED', state: 'OPEN',
    deviceState: { door: 'OPEN', lock: 'UNLOCKED', alarm: 'INACTIVE', led: 'OFF' },
    occurredAt: new Date(clock.value).toISOString(), observedAt: new Date(clock.value).toISOString() });
  assert.equal(exact[0].authorized, false);

  runtime.restart();
  assert.equal(runtime.detector.windows.size, 0);
});

test('unsynced door events use receive time metadata and non-applicable authorization is null', async () => {
  const { runtime, clock } = makeRuntime(); await prime(runtime);
  clock.value += 1;
  await runtime.ingest(`locker/${LOCKER_A}/telemetry/door`, {
    ...door('CLOSED', 'OPEN', null), time_synced: false,
  }, clock.value);
  await new Promise((resolve) => setImmediate(resolve));
  const opened = runtime.events.find((event) => event.event_type === 'DOOR_OPENED');
  assert.equal(opened.occurred_at, new Date(clock.value).toISOString());
  assert.equal(opened.metadata.device_time_unsynced, true);
  assert.equal(runtime.notificationStatuses[0].schema_version, 1);
  assert.equal(runtime.notificationStatuses[0].event_id,
    runtime.events.find((event) => event.event_type === 'UNAUTHORIZED_OPEN').event_id);

  clock.value += 1;
  const closed = await runtime.ingest(`locker/${LOCKER_A}/telemetry/door`, {
    ...door('OPEN', 'CLOSED', null), time_synced: false,
  }, clock.value);
  assert.equal(closed.outputs[0].authorized, null);
  assert.equal(closed.outputs[0].metadata.device_time_unsynced, true);
});

test('runtime event, diagnostic, notification, and command status collections are bounded and restart-clean', async () => {
  const { runtime } = makeRuntime({ runtimeOptions: {
    eventLimit: 2, diagnosticLimit: 2, notificationLimit: 2, commandStatusLimit: 2,
  } });
  for (let index = 0; index < 3; index += 1) {
    runtime.detector.emit({ event_id: `event-${index}` });
    runtime.detector.notificationStatus({ event_id: `notification-${index}` });
    await runtime.ingest(`locker/${LOCKER_A}/unexpected`, {}, index);
    runtime.recordCommandStatus(`LOCKER-00${index + 1}`, { status: 'PENDING' });
  }
  assert.deepEqual(runtime.events.map((item) => item.event_id), ['event-1', 'event-2']);
  assert.deepEqual(runtime.notificationStatuses.map((item) => item.event_id),
    ['notification-1', 'notification-2']);
  assert.equal(runtime.diagnostics.length, 2);
  assert.equal(runtime.commandStatus.size, 2);
  runtime.restart();
  assert.equal(runtime.events.length, 0);
  assert.equal(runtime.notificationStatuses.length, 0);
  assert.equal(runtime.diagnostics.length, 0);
  assert.equal(runtime.commandStatus.size, 0);
});
