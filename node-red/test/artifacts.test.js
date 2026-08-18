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

  const phase3Hardening = fs.readFileSync(path.join(migrationsPath,
    '202608100002_phase3_scheduler_delivery_hardening.sql'), 'utf8');
  assert.match(phase3Hardening, /revoke insert, update on table public\.notification_settings from authenticated/i);
  assert.match(phase3Hardening, /drop policy if exists notification_settings_insert_owned/i);
  assert.match(phase3Hardening, /pg_timezone_names/i);
  assert.match(phase3Hardening, /report_date date generated always as/i);
  assert.match(phase3Hardening, /unique \(locker_id, channel, report_date\)/i);
  assert.match(phase3Hardening, /create or replace function public\.reserve_notification_delivery/i);
  assert.match(phase3Hardening, /grant execute on function public\.reserve_notification_delivery/i);

  const telegramLinking = fs.readFileSync(path.join(migrationsPath,
    '202608110001_telegram_account_linking.sql'), 'utf8');
  assert.match(telegramLinking, /create table public\.telegram_link_tokens/i);
  assert.match(telegramLinking, /alter table public\.telegram_link_tokens enable row level security/i);
  assert.match(telegramLinking, /token_hash text not null unique/i);
  assert.match(telegramLinking, /create unique index telegram_link_tokens_one_active_idx/i);
  assert.match(telegramLinking, /pg_catalog\.pg_advisory_xact_lock/i);
  assert.match(telegramLinking, /create or replace function public\.issue_telegram_link/i);
  assert.match(telegramLinking, /create or replace function public\.consume_telegram_link/i);
  assert.match(telegramLinking,
    /select token_row\.locker_id into candidate_locker_id\s+from public\.telegram_link_tokens as token_row/i,
    'consume RPC must qualify locker_id because it is also a TABLE output name');
  assert.match(telegramLinking,
    /select setting\.telegram_username, setting\.telegram_linked_at,[\s\S]*from public\.notification_settings as setting/i,
    'consume replay lookup must qualify Telegram output column names');
  assert.match(telegramLinking,
    /on conflict on constraint notification_settings_pkey do update/i,
    'consume RPC must name its conflict constraint because locker_id is also a TABLE output name');
  assert.match(telegramLinking, /create or replace function public\.disconnect_telegram/i);
  assert.match(telegramLinking, /create or replace function public\.update_notification_preferences/i);
  assert.match(telegramLinking,
    /insert into public\.notification_settings\s*\(\s*locker_id, telegram_enabled,\s*telegram_chat_id, telegram_user_id, telegram_username, telegram_linked_at,/i,
    'preference upsert must carry the linked Telegram route through INSERT constraint validation');
  assert.match(telegramLinking,
    /case when setting_exists then existing\.telegram_chat_id else null end,[\s\S]*case when setting_exists then existing\.telegram_linked_at else null end/i);
  assert.match(telegramLinking,
    /on conflict on constraint notification_settings_pkey do update/i);
  assert.match(telegramLinking,
    /revoke all privileges on table public\.telegram_link_tokens\s+from public, anon, authenticated/i);
  assert.match(telegramLinking,
    /grant select \(\s*locker_id, telegram_enabled, telegram_username, telegram_linked_at,[\s\S]*?\) on table public\.notification_settings to authenticated/i);
  assert.doesNotMatch(telegramLinking,
    /grant select \([^)]*telegram_(?:chat|user)_id[^)]*\) on table public\.notification_settings to authenticated/i);
  for (const signature of [
    'issue_telegram_link\\(text, uuid, text\\)',
    'consume_telegram_link\\(text, text, text, text\\)',
    'disconnect_telegram\\(text, uuid\\)',
  ]) {
    assert.match(telegramLinking,
      new RegExp(`grant execute on function public\\.${signature} to service_role`, 'i'));
    assert.doesNotMatch(telegramLinking,
      new RegExp(`grant execute on function public\\.${signature} to (?:anon|authenticated|public)`, 'i'));
  }

  const telegramConsumeFix = fs.readFileSync(path.join(migrationsPath,
    '202608110002_telegram_link_consume_conflict_fix.sql'), 'utf8');
  assert.match(telegramConsumeFix,
    /create or replace function public\.consume_telegram_link/i);
  assert.match(telegramConsumeFix,
    /on conflict on constraint notification_settings_pkey do update/i);
  assert.doesNotMatch(telegramConsumeFix,
    /on conflict\s*\(\s*locker_id\s*\)\s*do update/i);

  const telegramPreferenceFix = fs.readFileSync(path.join(migrationsPath,
    '202608110003_telegram_notification_preference_upsert_fix.sql'), 'utf8');
  assert.match(telegramPreferenceFix,
    /create or replace function public\.update_notification_preferences/i);
  assert.match(telegramPreferenceFix,
    /existing\.telegram_chat_id is null[\s\S]*existing\.telegram_user_id is null[\s\S]*existing\.telegram_linked_at is null/i);
  assert.match(telegramPreferenceFix,
    /insert into public\.notification_settings\s*\(\s*locker_id, telegram_enabled,\s*telegram_chat_id, telegram_user_id, telegram_username, telegram_linked_at,/i);
  assert.match(telegramPreferenceFix,
    /case when setting_exists then existing\.telegram_chat_id else null end,[\s\S]*case when setting_exists then existing\.telegram_linked_at else null end/i);
  assert.match(telegramPreferenceFix,
    /on conflict on constraint notification_settings_pkey do update/i);
  assert.match(telegramPreferenceFix,
    /revoke all privileges on function public\.update_notification_preferences\([\s\S]*?from public, anon, authenticated/i);
  assert.match(telegramPreferenceFix,
    /grant execute on function public\.update_notification_preferences\([\s\S]*?to service_role/i);

  const phase3DatabaseTest = fs.readFileSync(path.join(root, 'supabase', 'tests',
    'phase3_data_rls.sql'), 'utf8');
  assert.match(phase3DatabaseTest, /has_table_privilege\('authenticated', 'public\.device_events', 'SELECT'\)/i);
  assert.match(phase3DatabaseTest, /P3-RLS-A/i);
  assert.match(phase3DatabaseTest, /P3-RLS-B/i);
  assert.doesNotMatch(phase3DatabaseTest, /'LOCKER-00[12]'/i,
    'live RLS test must not mutate or count rows belonging to real development lockers');
  assert.match(phase3DatabaseTest, /User A can see cross-owner Phase 3 rows/i);
  assert.match(phase3DatabaseTest, /duplicate event_id unexpectedly succeeded/i);
  assert.match(phase3DatabaseTest,
    /preference update lost the linked Telegram destination/i);
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

test('.env.example documents every live E2E input without real credentials', () => {
  const envExample = fs.readFileSync(path.join(root, '.env.example'), 'utf8');
  for (const key of [
    'E2E_BASE_URL',
    'E2E_TEST_EMAIL',
    'E2E_TEST_PASSWORD',
    'E2E_LOCKER_ID',
    'E2E_FORBIDDEN_LOCKER_ID',
  ]) {
    assert.match(envExample, new RegExp(`^${key}=`, 'm'));
  }
  assert.match(envExample, /^E2E_BASE_URL=https:\/\/<ten-instance-cua-ban>\.flowfuse\.cloud\/locker$/m);
  assert.match(envExample, /^E2E_TEST_EMAIL=$/m);
  assert.match(envExample, /^E2E_TEST_PASSWORD=$/m);
  for (const key of ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_BOT_USERNAME', 'TELEGRAM_WEBHOOK_SECRET']) {
    assert.match(envExample, new RegExp(`^${key}=$`, 'm'));
  }
  assert.doesNotMatch(envExample, /^TELEGRAM_CHAT_ID=/m);
});

test('Node-RED export has separate responsibility tabs and no embedded credential values', () => {
  const flows = JSON.parse(fs.readFileSync(path.join(root, 'node-red', 'flows.json'), 'utf8'));
  const tabs = flows.filter((node) => node.type === 'tab').map((node) => node.label).join(' ');
  for (const responsibility of ['MQTT', 'Auth', 'Unauthorized', 'History', 'Dashboard', 'Telegram']) {
    assert.match(tabs, new RegExp(responsibility, 'i'));
  }
  const serialized = JSON.stringify(flows);
  assert.doesNotMatch(serialized, /service_role|telegram_bot_token|gemini_api_key|eyJ[a-zA-Z0-9_-]{10}/i);
  assert.ok(flows.some((node) => node.type === 'mqtt out' && /Secure command egress/.test(node.name)));
  assert.ok(flows.some((node) => node.z === 'tab_security' && node.type === 'link in'));
  assert.ok(flows.some((node) => node.z === 'tab_security' && /notification status/i.test(node.name)));
  assert.ok(flows.some((node) => node.type === 'http in'
    && node.url === '/api/v1/telegram/webhook' && node.method === 'post'));
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

test('exported scheduler retries persistence and chatbot maps unsupported questions to 422', async () => {
  const flows = JSON.parse(fs.readFileSync(path.join(root, 'node-red', 'flows.json'), 'utf8'));
  const timeoutFunction = flows.find((node) => node.id === 'timeout_fn');
  let retries = 0;
  executeFlowFunction(timeoutFunction, { values: {
    splRuntime: {
      retryPersistence: async () => { retries += 1; },
      dispatcher: { expire: () => [] },
    },
    splOutbox: [],
  } });
  await Promise.resolve();
  assert.equal(retries, 1);

  const chatFunction = flows.find((node) => node.id === 'chat_fn');
  const request = executeFlowFunction(chatFunction, {
    msg: { req: { headers: {} }, payload: { question: 'unsupported' } },
    values: { splRuntime: { protectedChat: async () => ({ ok: false, code: 'QUESTION_UNSUPPORTED' }) } },
  });
  const response = await request.output;
  assert.equal(response.statusCode, 422);
  assert.equal(response.payload.code, 'QUESTION_UNSUPPORTED');
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
  const css = fs.readFileSync(path.join(root, 'dashboard', 'styles.css'), 'utf8');
  assert.match(app, /Authorization: `Bearer \$\{requestSession\.access_token\}`/);
  assert.match(html, /id="full-name"/);
  assert.match(html, /id="full-name-field"[^>]*hidden/);
  assert.match(html, /id="auth-submit"[^>]*disabled/);
  assert.match(html, /id="auth-mode-toggle"[^>]*disabled/);
  assert.doesNotMatch(html, /id="auth-mode-toggle"[^>]*aria-pressed/);
  assert.match(html, /id="claim-message"[^>]*role="status"/);
  assert.match(app, /data:\s*\{\s*full_name:\s*fullName\s*\}/);
  assert.match(app, /notification_status/);
  assert.match(html, /id="telegram-link"/);
  assert.match(html, /id="telegram-open-link"/);
  assert.doesNotMatch(html, /id="telegram-chat-id"/);
  assert.doesNotMatch(app, /telegram_chat_id\s*:/);
  assert.match(app, /function clearSensitiveState/);
  assert.match(app,
    /if \(!value\)\s*\{[\s\S]*?setAuthMode\('login'\);[\s\S]*?clearSensitiveState\(undefined, shouldClearPrivate\)/);
  const browserTimeout = Number(app.match(/requestTimeoutMs\s*=\s*([\d_]+)/)?.[1].replaceAll('_', ''));
  const dataBrowserTimeout = Number(app.match(/dataRequestTimeoutMs\s*=\s*([\d_]+)/)?.[1].replaceAll('_', ''));
  const chatbotBrowserTimeout = Number(app.match(/chatbotRequestTimeoutMs\s*=\s*([\d_]+)/)?.[1].replaceAll('_', ''));
  const providerTimeout = Number(auth.match(/timeoutMs\s*=\s*([\d_]+)/)?.[1].replaceAll('_', ''));
  const authorizationTimeout = Number(auth.match(/DEFAULT_AUTHORIZATION_TIMEOUT_MS\s*=\s*([\d_]+)/)?.[1].replaceAll('_', ''));
  assert.ok(browserTimeout > providerTimeout * 2,
    'browser timeout must exceed the two sequential auth-provider deadlines');
  assert.ok(browserTimeout > authorizationTimeout,
    'browser timeout must exceed the server aggregate authorization deadline');
  assert.ok(dataBrowserTimeout > browserTimeout,
    'database-backed views need a longer bounded deadline than simple auth and command requests');
  assert.ok(chatbotBrowserTimeout > dataBrowserTimeout,
    'chatbot deadline must also cover its grounded history and provider request');
  assert.doesNotMatch(app, /mqtt_(?:username|password)|mqtt\.publish|service.?role|new WebSocket/i);
  assert.match(css,
    /\.control-button\[data-pending="true"\]::after\s*\{[^}]*color:\s*var\(--primary\)/s,
    'pending control spinner must retain a visible color after its label becomes transparent');
  assert.match(css,
    /\.control-button\[data-pending="true"\]::after,\s*form\[data-pending="true"\] \.button\[type="submit"\]::after\s*\{[^}]*inset:\s*0;[^}]*margin:\s*auto;/s,
    'control and form spinners must be centered independently of their hidden labels');
  assert.match(css,
    /\.button\[data-pending="true"\]::after\s*\{[^}]*inset:\s*0;[^}]*margin:\s*auto;/s,
    'generic button spinners must be centered independently of their hidden labels');

  const firmwareMain = fs.readFileSync(path.join(root, 'firmware', 'src', 'main.cpp'), 'utf8');
  assert.match(firmwareMain,
    /desiredState == LockState::UNLOCKED[\s\S]*?stateManager\.current\(\)\.door != DoorState::CLOSED \|\| !rawDoorIsClosed\(\)[\s\S]*?doorAccessController\.revoke\(\)[\s\S]*?DOOR_NOT_CLOSED_FOR_ACCESS[\s\S]*?stateManager\.current\(\)\.lock == desiredState/,
    'firmware must reject every UNLOCK unless both stable and raw door state are closed before same-state handling');
});

test('owner live gate observes stable state attributes instead of localized labels', () => {
  const runner = fs.readFileSync(path.join(root, 'tools', 'run-phase2-owner-gates.js'), 'utf8');
  for (const [id, state] of [['mqtt', 'connected'], ['device', 'online'], ['lock', 'locked']]) {
    assert.match(runner, new RegExp(`getElementById\\('${id}'\\)\\?\\.dataset\\.state === '${state}'`));
  }
  assert.doesNotMatch(runner,
    /getElementById\('(mqtt|device|lock)'\)\?\.textContent === '(CONNECTED|ONLINE|LOCKED)'/);
});

test('Phase 3 deployment docs and firmware compatibility use the executable runtime contracts', () => {
  const nodeRedReadme = fs.readFileSync(path.join(root, 'node-red', 'README.md'), 'utf8');
  const builder = fs.readFileSync(path.join(root, 'node-red', 'scripts', 'build-flowfuse-flow.js'), 'utf8');
  const requirements = fs.readFileSync(path.join(root, 'docs', 'requirements.md'), 'utf8');
  const architecture = fs.readFileSync(path.join(root, 'docs', 'architecture.md'), 'utf8');
  const chatbotGrounding = fs.readFileSync(path.join(root, 'docs', 'chatbot-grounding.md'), 'utf8');
  const authOwnership = fs.readFileSync(path.join(root, 'docs', 'auth-ownership.md'), 'utf8');
  const appConfigExample = fs.readFileSync(path.join(root, 'firmware', 'include',
    'app_config.example.h'), 'utf8');
  const runtimeConfig = fs.readFileSync(path.join(root, 'firmware', 'include', 'runtime_config.h'), 'utf8');
  const firmwareMain = fs.readFileSync(path.join(root, 'firmware', 'src', 'main.cpp'), 'utf8');
  const wokwiSketch = fs.readFileSync(path.join(root, 'wokwi',
    'smart-privacy-locker-wokwi', 'sketch.ino'), 'utf8');
  const mqttClient = fs.readFileSync(path.join(root, 'firmware', 'src', 'mqtt_client.cpp'), 'utf8');
  const pinMap = fs.readFileSync(path.join(root, 'hardware', 'pin-map.md'), 'utf8');
  const runGuide = fs.readFileSync(path.join(root, 'HUONG_DAN_CHAY_HE_THONG.md'), 'utf8');
  for (const key of ['GMAIL_APP_PASSWORD', 'EMAIL_FROM']) {
    assert.match(nodeRedReadme, new RegExp(`\\b${key}\\b`));
    assert.match(builder, new RegExp(`['\"]${key}['\"]`));
  }
  assert.doesNotMatch(nodeRedReadme, /\bGMAIL_SMTP_PASSWORD\b|\bGMAIL_FROM\b/);
  assert.match(appConfigExample, /#define\s+SPL_BUZZER_ACTIVE_HIGH\s+0\b/);
  assert.match(runtimeConfig,
    /#ifndef\s+SPL_BUZZER_ACTIVE_HIGH[\s\S]*?#define\s+SPL_BUZZER_ACTIVE_HIGH\s+0\b/);
  assert.match(runtimeConfig, /SPL_BUZZER_ACTIVE_HIGH/);
  assert.match(firmwareMain, /RuntimeConfig::BUZZER_ACTIVE_HIGH/);
  assert.doesNotMatch(firmwareMain, /AppConfig::BUZZER_ACTIVE_HIGH/);
  assert.match(mqttClient,
    /const bool onlinePublished = publishAvailability\("ONLINE"[\s\S]*?bootstrapStatePending_ = true/);
  assert.match(mqttClient,
    /if \(bootstrapStatePending_\)[\s\S]*?if \(!doorOutboxEmpty\)[\s\S]*?publishState\(state\.current\(\), true\)/);
  assert.match(mqttClient,
    /if \(!publishState\(state\.current\(\), true\)\)[\s\S]*?disconnectWithOfflineFallback\(\)[\s\S]*?scheduleRetry\(now\)/);
  assert.match(mqttClient,
    /publishHeartbeat\(\)[\s\S]*?heartbeatPublished && publishState\(state\.current\(\), true\)/);
  assert.match(firmwareMain,
    /if \(lockCommandInFlight \|\| lockController\.isBusy\(\)\)[\s\S]*?CommandError::ACTUATION_FAILED[\s\S]*?if \(stateManager\.current\(\)\.lock == desiredState\)/);
  assert.match(firmwareMain,
    /void cancelInFlightLatch\(\)[\s\S]*?lockController\.cancel\(\);[\s\S]*?stateManager\.setLock\(LockState::UNKNOWN\);[\s\S]*?CommandAction::UNLOCK[\s\S]*?CommandError::DOOR_NOT_CLOSED_FOR_ACCESS[\s\S]*?rememberAndPublish\(inFlightLockAck\)/);
  assert.match(firmwareMain,
    /shouldCancelLatchActuation\(doorTransition\.current, isLatchActuationInFlight\(\)\)[\s\S]*?cancelInFlightLatch\(\)/,
    'a stable open edge must cancel either LOCK or UNLOCK actuation');
  assert.match(firmwareMain,
    /isLatchActuationInFlight\(\) && !rawDoorClosed[\s\S]*?cancelInFlightLatch\(\)/,
    'the raw fail-safe edge must cancel either LOCK or UNLOCK actuation');
  assert.match(firmwareMain,
    /void startAutoLock\(unsigned long now\)[\s\S]*?DoorState::CLOSED[\s\S]*?autoLockPending = true[\s\S]*?tryStartPendingAutoLock\(now\)/,
    'auto-lock must only be requested locally while the stable door is closed');
  assert.match(firmwareMain,
    /void tryStartPendingAutoLock\(unsigned long now\)[\s\S]*?!rawDoorIsClosed\(\)[\s\S]*?lockController\.start\(LockState::LOCKED, now\)[\s\S]*?autoLockInFlight = true/,
    'auto-lock must wait through a raw bounce and start only while the raw door is closed');
  assert.match(firmwareMain,
    /autoLockPolicy\.observeTransition\(\s*doorTransition\.previous, doorTransition\.current\)[\s\S]*?startAutoLock\(now\)/,
    'an observed OPEN to CLOSED cycle must start local auto-lock');
  assert.match(firmwareMain,
    /doorAccessController\.expireIfDue\(actuatorNow\)[\s\S]*?startAutoLock\(actuatorNow\)/,
    'an unused grant expiring while closed must start local auto-lock');
  assert.match(firmwareMain,
    /startAutoLock\(actuatorNow\)[\s\S]*?tryStartPendingAutoLock\(actuatorNow\)/,
    'a pending auto-lock must retry after a sub-debounce raw sensor glitch');
  assert.match(firmwareMain,
    /if \(lockCommandInFlight\)[\s\S]*?rememberAndPublish\(inFlightLockAck\)[\s\S]*?else if \(autoLockInFlight\)[\s\S]*?requestStatePublish\(\)/,
    'auto-lock completion must publish state without fabricating a command ACK');
  assert.match(wokwiSketch,
    /if \(!doorClosed \|\| digitalRead\(DOOR_PIN\) != LOW\)[\s\S]*?door_not_closed_for_access[\s\S]*?return;/,
    'the standalone Wokwi sketch must reject UNLOCK while the door is open');
  assert.match(wokwiSketch,
    /!wasClosed && doorClosed && autoLockOnClose[\s\S]*?moveLock\(LockState::LOCKED, true\)/,
    'the standalone Wokwi sketch must mirror lock-on-close behavior');
  assert.match(wokwiSketch,
    /now - openGrantStartedAt >= AUTHORIZED_OPEN_WINDOW_MS[\s\S]*?moveLock\(LockState::LOCKED, true\)/,
    'the standalone Wokwi sketch must mirror unused-grant expiry auto-lock');
  assert.match(firmwareMain,
    /void flushPendingStatePublish\(\)[\s\S]*?!doorTransitionOutbox\.empty\(\)[\s\S]*?publishState\(stateManager\.current\(\), true\)/);
  assert.match(mqttClient,
    /heartbeatTimer_\.due[\s\S]*?if \(!doorOutboxEmpty\)[\s\S]*?return;[\s\S]*?publishHeartbeat\(\)/);
  const doorSensorBlock = firmwareMain.slice(
    firmwareMain.indexOf('void processDoorSensor'),
    firmwareMain.indexOf('void processUsbMaintenanceCommand'),
  );
  assert.match(doorSensorBlock, /requestStatePublish\(\)/);
  assert.doesNotMatch(doorSensorBlock, /mqttClient\.publishState/);
  assert.match(pinMap, /SPL_BUZZER_ACTIVE_HIGH/);
  assert.match(pinMap, /RuntimeConfig::BUZZER_ACTIVE_HIGH/);
  assert.match(runGuide, /SPL_BUZZER_ACTIVE_HIGH=0/);
  assert.doesNotMatch(`${pinMap}\n${runGuide}`, /AppConfig::BUZZER_ACTIVE_HIGH/);
  assert.match(requirements, /Requirement traceability — Phases 1–3/);
  assert.match(architecture, /Phase 1–3 architecture/);
  assert.match(chatbotGrounding, /Phase 3 now connects the\s+same frozen history contract/);
  assert.match(authOwnership, /P2-M03–P2-M05 registration\/session, cross-owner and one-time-claim\s+gates pass/);
  assert.doesNotMatch(`${requirements}\n${architecture}\n${chatbotGrounding}\n${authOwnership}`,
    /Phase 2 does not implement actual CB3|real Supabase history remains YC4 Phase 3|final generated bundle.*Pending/i);
});

test('ESP32Servo channel zero is accepted through the attached-state API', () => {
  const source = fs.readFileSync(path.join(root, 'firmware', 'src', 'lock_controller.cpp'), 'utf8');
  assert.match(source, /servo_\.attach\([\s\S]*?\);\s*if \(!servo_\.attached\(\)\)/);
  assert.doesNotMatch(source, /if\s*\(\s*!servo_\.attach\s*\(/);
});
