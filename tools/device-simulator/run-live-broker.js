'use strict';

const assert = require('node:assert/strict');
const net = require('node:net');
const path = require('node:path');
const { createRequire } = require('node:module');
const requireFromNodeRed = createRequire(path.resolve(__dirname, '..', '..', 'node-red', 'package.json'));
const aedesFactory = requireFromNodeRed('aedes');
const mqtt = requireFromNodeRed('mqtt');
const { DeviceSimulator } = require('./simulator');

const username = 'phase2_test_user';
const password = 'phase2_test_password';
const lockerId = 'LOCKER-001';
const messages = [];

function waitFor(predicate, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const timer = setInterval(() => {
      const value = predicate();
      if (value) { clearInterval(timer); resolve(value); }
      else if (Date.now() - started >= timeoutMs) { clearInterval(timer); reject(new Error('Timed out waiting for broker message')); }
    }, 10);
  });
}

function connect(url, options) {
  return new Promise((resolve, reject) => {
    const client = mqtt.connect(url, { username, password, clean: true, reconnectPeriod: 0, ...options });
    client.once('connect', () => resolve(client)); client.once('error', reject);
  });
}

function subscribe(client, filter) {
  return new Promise((resolve, reject) => client.subscribe(filter, { qos: 0 }, (error) => error ? reject(error) : resolve()));
}

async function main() {
  const broker = await aedesFactory.Aedes.createBroker();
  broker.authenticate = (client, user, pass, callback) => callback(null,
    user === username && pass?.toString() === password);
  const server = net.createServer(broker.handle);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const url = `mqtt://127.0.0.1:${server.address().port}`;
  let anonymousRejected = false;
  await new Promise((resolve, reject) => {
    const anonymous = mqtt.connect(url, { clientId: 'phase2-anonymous', clean: true, reconnectPeriod: 0 });
    const timer = setTimeout(() => reject(new Error('Anonymous connection was not rejected')), 2000);
    anonymous.once('connect', () => { clearTimeout(timer); reject(new Error('Anonymous broker connection unexpectedly succeeded')); });
    anonymous.once('error', () => { clearTimeout(timer); anonymousRejected = true; resolve(); });
  });
  assert.equal(anonymousRejected, true);
  const observer = await connect(url, { clientId: 'phase2-observer' });
  observer.on('message', (topic, payload, packet) => {
    let parsed; try { parsed = JSON.parse(payload.toString()); } catch { parsed = payload.toString(); }
    messages.push({ topic, payload: parsed, retain: packet.retain });
  });
  await subscribe(observer, `locker/${lockerId}/#`);

  let device = await connect(url, { clientId: 'phase2-device', will: {
    topic: `locker/${lockerId}/availability`, retain: true, qos: 0,
    payload: JSON.stringify({ schema_version: 1, locker_id: lockerId, status: 'OFFLINE', sent_at: '2026-08-08T08:00:00.000Z' }),
  } });
  const simulator = new DeviceSimulator({ lockerId,
    publish: (topic, payload, options) => device.publish(topic,
      typeof payload === 'string' ? payload : JSON.stringify(payload), { qos: 0, retain: Boolean(options?.retain) }) });
  device.on('message', (_topic, payload) => simulator.receiveCommand(JSON.parse(payload.toString()), 'success'));
  await subscribe(device, `locker/${lockerId}/command`);
  simulator.connect();
  await waitFor(() => messages.some((item) => item.topic.endsWith('/state'))
    && messages.some((item) => item.payload?.status === 'ONLINE'));

  simulator.door('OPEN');
  await waitFor(() => messages.some((item) => item.topic.endsWith('/telemetry/door')));
  assert.equal(messages.find((item) => item.topic.endsWith('/telemetry/door')).retain, false);

  const fresh = await connect(url, { clientId: 'phase2-fresh-observer' });
  const freshMessages = [];
  fresh.on('message', (topic, payload, packet) => freshMessages.push({ topic, payload: JSON.parse(payload.toString()), retain: packet.retain }));
  await subscribe(fresh, `locker/${lockerId}/#`);
  await waitFor(() => freshMessages.filter((item) => item.retain).length >= 2);
  assert.equal(freshMessages.some((item) => item.topic.endsWith('/telemetry/door')), false);
  assert.equal(freshMessages.find((item) => item.topic.endsWith('/state')).payload.door, 'OPEN');

  observer.publish(`locker/${lockerId}/command`, JSON.stringify({ schema_version: 1,
    command_id: '10000000-0000-4000-8000-000000000501', locker_id: lockerId,
    action: 'GET_STATE', issued_at: '2026-08-08T08:00:00.000Z',
    requested_by: '20000000-0000-4000-8000-000000000001' }), { qos: 0, retain: false });
  await waitFor(() => messages.some((item) => item.payload?.command_id === '10000000-0000-4000-8000-000000000501'));

  device.stream.destroy();
  await waitFor(() => messages.some((item) => item.payload?.status === 'OFFLINE'));
  device = await connect(url, { clientId: 'phase2-device-reconnected', will: {
    topic: `locker/${lockerId}/availability`, retain: true, qos: 0,
    payload: JSON.stringify({ schema_version: 1, locker_id: lockerId, status: 'OFFLINE', sent_at: '2026-08-08T08:00:01.000Z' }),
  } });
  device.on('message', (_topic, payload) => simulator.receiveCommand(JSON.parse(payload.toString()), 'success'));
  await subscribe(device, `locker/${lockerId}/command`); simulator.connect();
  await waitFor(() => messages.filter((item) => item.payload?.status === 'ONLINE').length >= 2);

  const summary = { result: 'PASS', assertions: 8, transport: url.replace(/:\d+$/, ':ephemeral'),
    authentication: 'test username/password accepted; anonymous connection rejected',
    scenarios: ['retained availability/state', 'non-retained door', 'fresh subscriber', 'GET_STATE ACK/state', 'LWT OFFLINE', 'reconnect ONLINE/state'],
    note: 'Local TCP broker/simulator evidence only; not ESP32/MC-38 hardware evidence.' };
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);

  await Promise.all([observer.endAsync(), fresh.endAsync(), device.endAsync()]);
  await new Promise((resolve) => server.close(resolve));
  await broker.close();
}

main().catch((error) => { process.stderr.write(`${error.stack}\n`); process.exitCode = 1; });
