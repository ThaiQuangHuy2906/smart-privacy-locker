'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { validateAck, validateCommand, UUID } = require('../lib/contracts');

const root = path.resolve(__dirname, '..', '..');
const fixture = (name) => JSON.parse(fs.readFileSync(path.join(root, 'tests', 'fixtures', 'phase-2', name), 'utf8'));

function executeFlowFunction(flowNode, { msg = {}, values = {}, env = {} } = {}) {
  const store = new Map(Object.entries(values));
  const errors = [];
  const sends = [];
  const globalContext = { get: (key) => store.get(key), set: (key, value) => store.set(key, value) };
  const node = { error: (value) => errors.push(value), warn: (value) => errors.push(value),
    status: () => {}, send: (value) => sends.push(value) };
  const environment = { get: (key) => env[key] };
  const run = new Function('msg', 'global', 'node', 'env', flowNode.func);
  return { output: run(msg, globalContext, node, environment), store, errors, sends };
}

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
  const migrationsPath = path.join(root, 'supabase', 'migrations');
  const migrations = fs.readdirSync(migrationsPath).sort()
    .map((name) => fs.readFileSync(path.join(migrationsPath, name), 'utf8')).join('\n');
  assert.match(migrations, /alter table public\.profiles enable row level security/i);
  assert.match(migrations, /alter table public\.lockers enable row level security/i);
  assert.match(migrations, /owner_id = auth\.uid\(\)/i);
  assert.match(migrations, /locker\.owner_id is null/i);
  assert.match(migrations, /security definer[\s\S]*set search_path = public, pg_temp/i);
  assert.doesNotMatch(migrations, /create policy lockers_.* for update/i);
  const databaseTest = fs.readFileSync(path.join(root, 'supabase', 'tests', 'phase2_claim_rls.sql'), 'utf8');
  assert.match(databaseTest, /insert into auth\.users/i);
  assert.match(databaseTest, /create extension if not exists pgtap with schema extensions/i);
  assert.match(databaseTest, /select plan\(1\)/i);
  assert.match(databaseTest, /select \* from finish\(\)/i);
  assert.match(databaseTest, /has_table_privilege\('authenticated', 'public\.lockers', 'SELECT'\)/i);
  assert.match(databaseTest, /has_column_privilege\('authenticated', 'public\.profiles', 'full_name', 'UPDATE'\)/i);
  assert.match(databaseTest, /has_function_privilege\('anon', 'public\.claim_locker\(text\)', 'EXECUTE'\)/i);

  const grants = fs.readFileSync(path.join(migrationsPath, '202608090001_phase2_least_privilege_grants.sql'), 'utf8');
  assert.match(grants, /revoke all privileges on table public\.profiles, public\.lockers\s+from public, anon, authenticated/i);
  assert.match(grants, /grant select on table public\.profiles to authenticated/i);
  assert.match(grants, /grant update \(full_name\) on table public\.profiles to authenticated/i);
  assert.match(grants, /grant select on table public\.lockers to authenticated/i);
  assert.match(grants, /revoke all privileges on function public\.claim_locker\(text\)\s+from public, anon, authenticated/i);
  assert.match(grants, /grant execute on function public\.claim_locker\(text\) to authenticated/i);
  assert.match(grants, /revoke all privileges on function public\.create_profile_for_new_user\(\)\s+from public, anon, authenticated/i);
  assert.doesNotMatch(grants, /grant (?:insert|update|delete|all).*public\.lockers/i);

  const phase3Migration = fs.readFileSync(path.join(migrationsPath,
    '202608100001_phase3_events_notifications.sql'), 'utf8');
  for (const table of ['device_events', 'notification_settings', 'notification_deliveries']) {
    assert.match(phase3Migration, new RegExp(`alter table public\\.${table} enable row level security`, 'i'));
  }
  assert.match(phase3Migration, /event_id uuid primary key/i);
  assert.match(phase3Migration, /unique \(locker_id, channel, report_key\)/i);
  assert.match(phase3Migration, /device_events_locker_occurred_idx/i);
  assert.match(phase3Migration, /owner_id = auth\.uid\(\)/i);
  assert.match(phase3Migration, /grant select on table public\.device_events to authenticated/i);
  assert.doesNotMatch(phase3Migration, /grant (?:insert|update|delete|all).*public\.device_events to authenticated/i);

  const phase3DatabaseTest = fs.readFileSync(path.join(root, 'supabase', 'tests',
    'phase3_data_rls.sql'), 'utf8');
  assert.match(phase3DatabaseTest, /has_table_privilege\('authenticated', 'public\.device_events', 'SELECT'\)/i);
  assert.match(phase3DatabaseTest, /User A can see cross-owner Phase 3 rows/i);
  assert.match(phase3DatabaseTest, /duplicate event_id unexpectedly succeeded/i);
});

test('P2-M03 live signup uses a unique real-mailbox template and rejects blocked test domains', () => {
  const { buildSignupTestEmail, GateError } = require('../../tools/run-phase2-live-gates');
  assert.equal(
    buildSignupTestEmail('phase2+{nonce}@mailbox.dev', 'ABC123', 'a'),
    'phase2+abc123-a@mailbox.dev',
  );
  for (const template of [
    'phase2+{nonce}@example.com',
    'phase2+{nonce}@mail.example.com',
    'phase2+{nonce}@mail.test',
    'phase2+{nonce}@mail.invalid',
  ]) {
    assert.throws(
      () => buildSignupTestEmail(template, 'ABC123', 'a'),
      (error) => error instanceof GateError
        && error.code === 'UNSUPPORTED_PHASE2_SIGNUP_TEST_EMAIL_DOMAIN',
    );
  }
  assert.throws(
    () => buildSignupTestEmail('phase2@mailbox.dev', 'ABC123', 'a'),
    (error) => error instanceof GateError
      && error.code === 'INVALID_PHASE2_SIGNUP_TEST_EMAIL_TEMPLATE',
  );
});

test('Node-RED export has separate responsibility tabs and no embedded credential values', () => {
  const flows = JSON.parse(fs.readFileSync(path.join(root, 'node-red', 'flows.json'), 'utf8'));
  const tabs = flows.filter((node) => node.type === 'tab').map((node) => node.label).join(' ');
  for (const responsibility of ['MQTT', 'Auth', 'Unauthorized', 'History', 'Dashboard']) assert.match(tabs, new RegExp(responsibility, 'i'));
  const serialized = JSON.stringify(flows);
  assert.doesNotMatch(serialized, /service_role|telegram_bot_token|gemini_api_key|eyJ[a-zA-Z0-9_-]{10}/i);
  assert.ok(flows.some((node) => node.type === 'mqtt out' && /Secure command egress/.test(node.name)));
  assert.ok(flows.some((node) => node.z === 'tab_security' && node.type === 'link in'));
  assert.ok(flows.some((node) => node.z === 'tab_security' && /notification status/i.test(node.name)));
});

test('all exported Function code compiles and settings pre-create the shared runtime', () => {
  const flows = JSON.parse(fs.readFileSync(path.join(root, 'node-red', 'flows.json'), 'utf8'));
  for (const flowNode of flows.filter((node) => node.type === 'function')) {
    assert.doesNotThrow(() => new Function('msg', 'global', 'node', 'env', 'flow', 'context', flowNode.func),
      flowNode.id);
  }
  const settings = require('../settings.example');
  assert.equal(typeof settings.functionGlobalContext.splRuntimeFactory, 'function');
  assert.ok(settings.functionGlobalContext.splRuntime);
  assert.ok(Array.isArray(settings.functionGlobalContext.splOutbox));
});

test('Node-RED exported MQTT lifecycle recognizes the real 4.1.13 status and bootstraps state', () => {
  const flows = JSON.parse(fs.readFileSync(path.join(root, 'node-red', 'flows.json'), 'utf8'));
  const statusNode = flows.find((node) => node.id === 'mqtt_status');
  const statusFunction = flows.find((node) => node.id === 'mqtt_status_fn');
  const calls = [];
  const runtime = { setMqttConnected(connected, lockerIds) {
    calls.push({ connected, lockerIds }); return { bootstrap: [], cancelled: [] };
  } };
  executeFlowFunction(statusFunction, {
    msg: { status: { fill: 'green', shape: 'dot', text: 'node-red:common.status.connected' } },
    values: { splRuntime: runtime, splOutbox: [] }, env: { LOCKER_ID: 'LOCKER-001' },
  });
  assert.deepEqual(calls, [{ connected: true, lockerIds: ['LOCKER-001'] }]);
  assert.deepEqual(statusNode.scope, ['mqtt_out']);
  assert.equal(statusFunction.outputs, 1);
  assert.deepEqual(statusFunction.wires, [['mqtt_out']]);
});

test('Node-RED MQTT functions create a missing runtime without replacing an existing one', async () => {
  const flows = JSON.parse(fs.readFileSync(path.join(root, 'node-red', 'flows.json'), 'utf8'));
  const initFunction = flows.find((node) => node.id === 'init_fn');
  const ingressFunction = flows.find((node) => node.id === 'mqtt_ingress');
  const existing = { ingest: async () => ({ accepted: true }) };
  let factoryCalls = 0;
  const initialized = executeFlowFunction(initFunction, { values: {
    splRuntime: existing, splOutbox: [], splRuntimeFactory: () => { factoryCalls += 1; return {}; },
  } });
  assert.equal(initialized.store.get('splRuntime'), existing);
  assert.equal(factoryCalls, 0);

  const created = { ingest: async () => ({ accepted: true }) };
  const ingress = executeFlowFunction(ingressFunction, { msg: { topic: 'locker/LOCKER-001/state', payload: {} },
    values: { splRuntimeFactory: () => created } });
  assert.ok(ingress.output instanceof Promise);
  await ingress.output;
  assert.equal(ingress.store.get('splRuntime'), created);
  assert.equal(ingress.errors.length, 0);
});

test('aborted command HTTP requests neither invoke dispatch nor drain the MQTT outbox', async () => {
  const flows = JSON.parse(fs.readFileSync(path.join(root, 'node-red', 'flows.json'), 'utf8'));
  const commandFunction = flows.find((node) => node.id === 'cmd_fn');
  const queued = { topic: 'locker/LOCKER-001/command', payload: { action: 'UNLOCK' }, options: { retain: false } };
  let calls = 0;
  const alreadyAborted = executeFlowFunction(commandFunction, {
    msg: { req: { headers: {}, aborted: true, destroyed: false }, payload: {} },
    values: { splRuntime: { protectedCommand: async () => { calls += 1; } }, splOutbox: [queued] },
  });
  assert.equal(alreadyAborted.output, null);
  assert.equal(calls, 0);
  assert.deepEqual(alreadyAborted.store.get('splOutbox'), [queued]);
  assert.deepEqual(alreadyAborted.sends, []);

  const request = { headers: {}, aborted: false, destroyed: false };
  let observedAbort;
  const abortedDuringAuthorization = executeFlowFunction(commandFunction, {
    msg: { req: request, payload: { locker_id: 'LOCKER-001', action: 'UNLOCK' } },
    values: { splRuntime: { async protectedCommand(value) {
      calls += 1;
      observedAbort = value.isAborted;
      request.aborted = true;
      return { ok: false, status: 499, code: 'REQUEST_ABORTED' };
    } }, splOutbox: [queued] },
  });
  await abortedDuringAuthorization.output;
  assert.equal(calls, 1);
  assert.equal(observedAbort(), true);
  assert.deepEqual(abortedDuringAuthorization.store.get('splOutbox'), [queued]);
  assert.deepEqual(abortedDuringAuthorization.sends, []);

  let closeResponse;
  const rawResponse = {
    writableEnded: false,
    once(event, handler) { if (event === 'close') closeResponse = handler; },
  };
  const disconnectedDuringAuthorization = executeFlowFunction(commandFunction, {
    msg: {
      req: { headers: {}, aborted: false, destroyed: true, complete: true },
      res: { _res: rawResponse },
      payload: { locker_id: 'LOCKER-001', action: 'LOCK' },
    },
    values: { splRuntime: { async protectedCommand(value) {
      calls += 1;
      closeResponse();
      assert.equal(value.isAborted(), true);
      return { ok: false, status: 499, code: 'REQUEST_ABORTED' };
    } }, splOutbox: [queued] },
  });
  await disconnectedDuringAuthorization.output;
  assert.deepEqual(disconnectedDuringAuthorization.store.get('splOutbox'), [queued]);
  assert.deepEqual(disconnectedDuringAuthorization.sends, []);
});

test('a fully consumed HTTP request still receives a command denial response', async () => {
  const flows = JSON.parse(fs.readFileSync(path.join(root, 'node-red', 'flows.json'), 'utf8'));
  const commandFunction = flows.find((node) => node.id === 'cmd_fn');
  let calls = 0;
  const request = executeFlowFunction(commandFunction, {
    msg: {
      req: { headers: {}, aborted: false, destroyed: true, complete: true },
      res: {},
      payload: { locker_id: 'LOCKER-001', action: 'LOCK' },
    },
    values: {
      splRuntime: { protectedCommand: async () => {
        calls += 1;
        return { ok: false, status: 401, code: 'INVALID_SESSION' };
      } },
      splOutbox: [],
    },
  });

  assert.ok(request.output instanceof Promise);
  await request.output;
  assert.equal(calls, 1);
  assert.equal(request.sends.length, 1);
  assert.equal(request.sends[0][0].statusCode, 401);
  assert.equal(request.sends[0][0].payload.code, 'INVALID_SESSION');
  assert.equal(request.sends[0][1], null);
});

test('Dashboard has no MQTT/service-role path and uses canonical Bearer header', () => {
  const app = fs.readFileSync(path.join(root, 'dashboard', 'app.js'), 'utf8');
  const auth = fs.readFileSync(path.join(root, 'node-red', 'lib', 'auth.js'), 'utf8');
  const html = fs.readFileSync(path.join(root, 'dashboard', 'index.html'), 'utf8');
  assert.match(app, /Authorization: `Bearer \$\{requestSession\.access_token\}`/);
  assert.match(html, /id="full-name"/);
  assert.match(html, /id="claim-message"[^>]*role="status"/);
  assert.match(app, /data:\s*\{\s*full_name:\s*fullName\s*\}/);
  assert.match(app, /notification_status/);
  assert.match(app, /function clearSensitiveState/);
  assert.match(app, /if \(!value\) clearSensitiveState\(undefined, shouldClearPrivate\)/);
  const browserTimeout = Number(app.match(/requestTimeoutMs\s*=\s*([\d_]+)/)?.[1].replaceAll('_', ''));
  const providerTimeout = Number(auth.match(/timeoutMs\s*=\s*([\d_]+)/)?.[1].replaceAll('_', ''));
  const authorizationTimeout = Number(auth.match(/DEFAULT_AUTHORIZATION_TIMEOUT_MS\s*=\s*([\d_]+)/)?.[1].replaceAll('_', ''));
  assert.ok(browserTimeout > providerTimeout * 2,
    'browser timeout must exceed the two sequential auth-provider deadlines');
  assert.ok(browserTimeout > authorizationTimeout,
    'browser timeout must exceed the server aggregate authorization deadline');
  assert.doesNotMatch(app, /mqtt_(?:username|password)|mqtt\.publish|service.?role|new WebSocket/i);
});
