'use strict';

const assert = require('node:assert/strict');
const fixture = require('./scenario-fixtures.json');
const { MemoryBroker } = require('./memory-broker');
const { DeviceSimulator } = require('./simulator');

const broker = new MemoryBroker();
const simulator = new DeviceSimulator({ lockerId: fixture.locker_id,
  publish: (topic, payload, options) => broker.publish(topic, payload, options) });
const received = [];
broker.subscribe('locker/+/+', (topic, payload, metadata) => received.push({ topic, payload, metadata }));
broker.subscribe('locker/+/telemetry/door', (topic, payload, metadata) => received.push({ topic, payload, metadata }));

simulator.connect();
assert.equal(broker.retained.get('locker/LOCKER-001/availability').status, 'ONLINE');
assert.equal(broker.retained.get('locker/LOCKER-001/state').door, 'CLOSED');
assert.equal(broker.retained.get('locker/LOCKER-001/state').lock, 'UNKNOWN');
assert.equal(simulator.heartbeat(), true);
assert.equal(broker.retained.has('locker/LOCKER-001/heartbeat'), false);
const authorizationCommand = { ...fixture.command, action: 'UNLOCK',
  command_id: '10000000-0000-4000-8000-000000000200' };
simulator.receiveCommand(authorizationCommand, 'success');
assert.equal(simulator.state.lock, 'UNLOCKED');
simulator.door('OPEN');
assert.equal(simulator.state.alarm, 'INACTIVE');
assert.equal(received.findLast((item) => item.topic.endsWith('/telemetry/door')).payload.authorized, true);
const ackCountBeforeAutoLock = received.filter((item) => item.topic.endsWith('/ack')).length;
simulator.door('CLOSED');
assert.equal(simulator.state.lock, 'LOCKED');
assert.equal(received.filter((item) => item.topic.endsWith('/ack')).length, ackCountBeforeAutoLock);
simulator.door('OPEN');
assert.equal(simulator.state.alarm, 'ACTIVE');
assert.equal(received.findLast((item) => item.topic.endsWith('/telemetry/door')).payload.authorized, false);
assert.equal(broker.retained.has('locker/LOCKER-001/telemetry/door'), false);
assert.match(received.find((item) => item.topic.endsWith('/telemetry/door')).payload.event_id,
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
assert.equal(broker.retained.get('locker/LOCKER-001/state').door, 'OPEN');

const deniedRearm = simulator.receiveCommand({ ...authorizationCommand,
  command_id: '10000000-0000-4000-8000-000000000201' }, 'success')[0];
assert.equal(deniedRearm.result, 'error');
assert.equal(deniedRearm.error.code, 'DOOR_NOT_CLOSED_FOR_ACCESS');
for (const lock of ['LOCKED', 'UNKNOWN']) {
  const openSimulator = new DeviceSimulator({ lockerId: fixture.locker_id, publish: () => {} });
  openSimulator.state.door = 'OPEN';
  openSimulator.state.lock = lock;
  const deniedUnlock = openSimulator.receiveCommand({ ...authorizationCommand,
    command_id: `10000000-0000-4000-8000-00000000020${lock === 'LOCKED' ? '3' : '4'}` }, 'success')[0];
  assert.equal(deniedUnlock.result, 'error');
  assert.equal(deniedUnlock.error.code, 'DOOR_NOT_CLOSED_FOR_ACCESS');
}
simulator.door('CLOSED');
const acceptedRearm = simulator.receiveCommand({ ...authorizationCommand,
  command_id: '10000000-0000-4000-8000-000000000202' }, 'success')[0];
assert.equal(acceptedRearm.result, 'success');
simulator.door('OPEN');
assert.equal(received.findLast((item) => item.topic.endsWith('/telemetry/door')).payload.authorized, true);

let expiryNow = 1000;
const expiryMessages = [];
const expirySimulator = new DeviceSimulator({ lockerId: fixture.locker_id,
  now: () => expiryNow,
  publish: (topic, payload, options) => expiryMessages.push({ topic, payload, options }) });
expirySimulator.receiveCommand({ ...authorizationCommand,
  command_id: '10000000-0000-4000-8000-000000000205' }, 'success');
const expiryAckCount = expiryMessages.filter((item) => item.topic.endsWith('/ack')).length;
expiryNow += 29_999;
assert.equal(expirySimulator.tick(), false);
expiryNow += 1;
assert.equal(expirySimulator.tick(), true);
assert.equal(expirySimulator.state.lock, 'LOCKED');
assert.equal(expiryMessages.filter((item) => item.topic.endsWith('/ack')).length, expiryAckCount);

for (const mode of ['success', 'error', 'wrong_id', 'wrong_locker', 'wrong_action', 'wrong_state', 'malformed', 'no_ack']) {
  const command = { ...fixture.command, command_id: `10000000-0000-4000-8000-${String(received.length).padStart(12, '0')}` };
  simulator.receiveCommand(command, mode);
}
const duplicateCommand = { ...fixture.command, command_id: '10000000-0000-4000-8000-000000000099' };
simulator.receiveCommand(duplicateCommand, 'success');
simulator.receiveCommand(duplicateCommand, 'success');
assert.equal(received.filter((item) => item.payload?.command_id === duplicateCommand.command_id && item.payload?.duplicate).length, 1);

let delayed = null;
simulator.delayedCommand({ ...fixture.command, command_id: '10000000-0000-4000-8000-000000000100' }, 250,
  (delay, callback) => { delayed = { delay, callback }; });
assert.equal(delayed.delay, 250); delayed.callback();
simulator.disconnect(); simulator.connect(); simulator.receiveCommand(fixture.command, 'success');
assert.equal(broker.retained.get('locker/LOCKER-001/availability').status, 'ONLINE');

process.stdout.write(JSON.stringify({
  result: 'PASS', assertions: 28, scenarios: fixture.modes.length + 12,
  retained_topics: [...broker.retained.keys()],
  note: 'Simulator/memory-broker software evidence only; not hardware evidence.'
}, null, 2) + '\n');
