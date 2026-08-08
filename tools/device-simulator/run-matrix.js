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
simulator.door('OPEN');
assert.equal(broker.retained.has('locker/LOCKER-001/telemetry/door'), false);
assert.equal(broker.retained.get('locker/LOCKER-001/state').door, 'OPEN');

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
  result: 'PASS', assertions: 8, scenarios: fixture.modes.length + 4,
  retained_topics: [...broker.retained.keys()],
  note: 'Simulator/memory-broker software evidence only; not hardware evidence.'
}, null, 2) + '\n');
