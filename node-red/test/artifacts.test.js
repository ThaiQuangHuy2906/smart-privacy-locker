'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { validateAck, validateCommand, UUID } = require('../lib/contracts');

const root = path.resolve(__dirname, '..', '..');
const fixture = (name) => JSON.parse(fs.readFileSync(path.join(root, 'tests', 'fixtures', 'phase-2', name), 'utf8'));

test('Phase 3 event fixtures are v1, correlated, complete, and secret-free', () => {
  const events = fixture('normalized-events.json');
  assert.deepEqual(events.map((value) => value.event_type), ['DOOR_OPENED', 'UNAUTHORIZED_OPEN']);
  for (const event of events) {
    assert.equal(event.schema_version, 1); assert.match(event.event_id, UUID);
    for (const key of ['locker_id', 'source', 'result', 'authorized', 'occurred_at', 'recorded_at', 'device_state']) assert.ok(key in event);
  }
  assert.doesNotMatch(JSON.stringify(events), /authorization|bearer|jwt|password|secret/i);
});

test('ALARM_ON command/ACK fixture uses frozen MQTT v1 correlation', () => {
  const value = fixture('alarm-command-ack.json');
  assert.equal(validateCommand('locker/LOCKER-001/command', value.command).ok, true);
  assert.equal(validateAck('locker/LOCKER-001/ack', value.ack).ok, true);
  assert.equal(value.command.command_id, value.ack.command_id);
});

test('history request/response contract correlates identity without transporting JWT', () => {
  const value = fixture('history-request-response.json');
  assert.equal(value.request.request_id, value.response.request_id);
  assert.equal(value.request.locker_id, value.response.locker_id);
  assert.doesNotMatch(JSON.stringify(value), /authorization|bearer|jwt|token/i);
});

test('Supabase migrations enforce RLS, no locker update policy, and atomic unclaimed claim', () => {
  const migrations = fs.readdirSync(path.join(root, 'supabase', 'migrations')).sort()
    .map((name) => fs.readFileSync(path.join(root, 'supabase', 'migrations', name), 'utf8')).join('\n');
  assert.match(migrations, /alter table public\.profiles enable row level security/i);
  assert.match(migrations, /alter table public\.lockers enable row level security/i);
  assert.match(migrations, /owner_id = auth\.uid\(\)/i);
  assert.match(migrations, /locker\.owner_id is null/i);
  assert.match(migrations, /security definer[\s\S]*set search_path = public, pg_temp/i);
  assert.doesNotMatch(migrations, /create policy lockers_.* for update/i);
});

test('Node-RED export has separate responsibility tabs and no embedded credential values', () => {
  const flows = JSON.parse(fs.readFileSync(path.join(root, 'node-red', 'flows.json'), 'utf8'));
  const tabs = flows.filter((node) => node.type === 'tab').map((node) => node.label).join(' ');
  for (const responsibility of ['MQTT', 'Auth', 'Unauthorized', 'History', 'Dashboard']) assert.match(tabs, new RegExp(responsibility, 'i'));
  const serialized = JSON.stringify(flows);
  assert.doesNotMatch(serialized, /service_role|telegram_bot_token|gemini_api_key|eyJ[a-zA-Z0-9_-]{10}/i);
  assert.ok(flows.some((node) => node.type === 'mqtt out' && /Secure command egress/.test(node.name)));
});

test('Dashboard has no MQTT/service-role path and uses canonical Bearer header', () => {
  const app = fs.readFileSync(path.join(root, 'dashboard', 'app.js'), 'utf8');
  assert.match(app, /Authorization: `Bearer \$\{session\.access_token\}`/);
  assert.doesNotMatch(app, /mqtt_(?:username|password)|mqtt\.publish|service.?role|new WebSocket/i);
});
