'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const https = require('node:https');
const nodemailer = require('nodemailer');
const path = require('node:path');
const { serializeFlowFuseFlow } = require('../scripts/build-flowfuse-flow');
const { UUID_V4 } = require('../lib/contracts');

const nodeRedRoot = path.resolve(__dirname, '..');
const flowPath = path.join(nodeRedRoot, 'flows.flowfuse.json');
const readFlow = () => JSON.parse(fs.readFileSync(flowPath, 'utf8'));

test('FlowFuse export is generated deterministically from the tested sources', () => {
  const generated = serializeFlowFuseFlow();
  assert.doesNotMatch(generated, /\r/, 'generated export must use canonical LF line endings');
  assert.equal(fs.readFileSync(flowPath, 'utf8'), generated);
});

test('FlowFuse runtime bootstrap executes without settings.js or local filesystem imports', () => {
  const flows = readFlow();
  const initializer = flows.find((node) => node.id === 'init_fn');
  assert.ok(initializer);
  assert.deepEqual(initializer.libs, [
    { var: 'crypto', module: 'crypto' },
    { var: 'https', module: 'https' },
    { var: 'nodemailer', module: 'nodemailer' },
  ]);
  assert.doesNotMatch(initializer.initialize, /settings\.example|require\(['"]\.\/lib\/runtime/i);
  assert.match(initializer.initialize, /__splLoad\('\.\/runtime'\)/);

  for (const flowNode of flows.filter((node) => node.type === 'function')) {
    assert.doesNotThrow(
      () => new Function('msg', 'global', 'node', 'env', 'flow', 'context', flowNode.func),
      flowNode.id,
    );
  }

  const store = new Map();
  const warnings = [];
  const statuses = [];
  const initialize = new Function(
    'global', 'node', 'env', 'crypto', 'https', 'nodemailer', 'Buffer', 'URL', 'URLSearchParams',
    'setTimeout', 'clearTimeout', initializer.initialize,
  );
  initialize(
    { get: (key) => store.get(key), set: (key, value) => store.set(key, value) },
    { warn: (value) => warnings.push(value), status: (value) => statuses.push(value) },
    { get: (key) => ({
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_ANON_KEY: 'publishable-test-value',
      SUPABASE_SERVICE_ROLE_KEY: 'service-role-test-value',
      GEMINI_API_KEY: '',
      GEMINI_MODEL: '',
    })[key] },
    crypto, https, nodemailer, Buffer, URL, URLSearchParams, setTimeout, clearTimeout,
  );

  const runtime = store.get('splRuntime');
  assert.equal(runtime?.constructor?.name, 'Phase2Runtime');
  assert.equal(typeof store.get('splRuntimeFactory'), 'function');
  assert.ok(Array.isArray(store.get('splOutbox')));
  assert.match(runtime.dispatcher.uuid(), UUID_V4);
  assert.deepEqual(warnings, []);
  assert.deepEqual(statuses.at(-1), { fill: 'green', shape: 'dot', text: 'FlowFuse runtime ready' });
});

test('FlowFuse export self-serves the Dashboard and preserves protected API routes', () => {
  const flows = readFlow();
  const route = flows.find((node) => node.id === 'phase2_static_http');
  const handler = flows.find((node) => node.id === 'phase2_static_fn');
  const response = flows.find((node) => node.id === 'phase2_static_response');
  const template = flows.find((node) => node.id === 'ui_template');
  assert.equal(route.method, 'get');
  assert.equal(route.url, '/phase2');
  assert.deepEqual(route.wires, [['phase2_static_fn']]);
  assert.equal(response.headers['content-type'], 'text/html; charset=utf-8');
  assert.equal(response.headers['cache-control'], 'no-store');
  assert.equal(response.headers['x-frame-options'], 'SAMEORIGIN');
  assert.match(template.format, /src="\/phase2"/);

  const message = new Function('msg', handler.func)({});
  assert.match(message.payload, /<style>[\s\S]*\.status-console/);
  assert.match(message.payload, /class="card status-console state-grid"/);
  assert.match(message.payload, /<script>[\s\S]*function protectedFetch/);
  assert.match(message.payload, /Authorization: `Bearer \$\{requestSession\.access_token\}`/);
  assert.doesNotMatch(message.payload, /href="styles\.css"|src="app\.js"/);

  const httpRoutes = new Map(flows.filter((node) => node.type === 'http in')
    .map((node) => [`${node.method.toUpperCase()} ${node.url}`, node.id]));
  for (const expected of [
    'POST /api/v1/commands',
    'POST /api/v1/chatbot',
    'POST /api/v1/lockers/claim',
    'GET /api/v1/lockers/:lockerId/state',
    'GET /api/v1/lockers/:lockerId/history',
    'GET /api/v1/lockers/:lockerId/chart',
    'GET /api/v1/lockers/:lockerId/notification-settings',
    'PUT /api/v1/lockers/:lockerId/notification-settings',
    'GET /api/v1/public-config',
    'GET /phase2',
  ]) assert.ok(httpRoutes.has(expected), expected);
  for (const id of ['cmd_fn', 'chat_fn', 'claim_fn', 'state_fn', 'history_fn', 'chart_fn',
    'settings_get_fn', 'settings_put_fn']) {
    assert.match(flows.find((node) => node.id === id).func, /RUNTIME_STARTING/);
  }
});

test('FlowFuse MQTT uses verified TLS and keeps credential values outside the export', () => {
  const flows = readFlow();
  const broker = flows.find((node) => node.id === 'broker');
  const tls = flows.find((node) => node.id === 'broker_tls');
  assert.equal(broker.broker, '${MQTT_HOST}');
  assert.equal(broker.port, '${MQTT_PORT}');
  assert.equal(broker.clientid, '');
  assert.equal(broker.usetls, true);
  assert.equal(broker.tls, tls.id);
  assert.equal(tls.verifyservercert, true);
  assert.ok(flows.every((node) => !Object.hasOwn(node, 'credentials')));

  const serialized = JSON.stringify(flows);
  assert.doesNotMatch(serialized, /eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}/);
  assert.doesNotMatch(serialized, /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/);
  assert.doesNotMatch(serialized, /\b\d{6,}:[A-Za-z0-9_-]{20,}\b/);
  assert.doesNotMatch(serialized, /settings\.example\.js/);
});
