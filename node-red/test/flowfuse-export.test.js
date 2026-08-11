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
  const legacyRoute = flows.find((node) => node.id === 'phase2_legacy_http');
  const handler = flows.find((node) => node.id === 'phase2_static_fn');
  const response = flows.find((node) => node.id === 'phase2_static_response');
  const template = flows.find((node) => node.id === 'ui_template');
  const theme = flows.find((node) => node.id === 'ui_theme');
  const page = flows.find((node) => node.id === 'ui_page');
  const group = flows.find((node) => node.id === 'ui_group');
  assert.equal(route.method, 'get');
  assert.equal(route.url, '/locker');
  assert.deepEqual(route.wires, [['phase2_static_fn']]);
  assert.equal(legacyRoute.method, 'get');
  assert.equal(legacyRoute.url, '/phase2');
  assert.deepEqual(legacyRoute.wires, [['phase2_static_fn']]);
  assert.equal(response.headers['content-type'], 'text/html; charset=utf-8');
  assert.equal(response.headers['cache-control'], 'no-store');
  assert.equal(response.headers['x-frame-options'], 'SAMEORIGIN');
  assert.match(template.format, /src="\/locker"/);
  assert.equal(theme.name, 'Smart Locker warm');
  assert.deepEqual(theme.colors, {
    surface: '#fffdf9', primary: '#176b5b', bgPage: '#f6f4ef',
    groupBg: '#fffdf9', groupOutline: '#dcded8',
  });
  assert.equal(page.name, 'Smart Privacy Locker');
  assert.equal(page.path, '/locker');
  assert.equal(group.showTitle, false);
  assert.match(template.format, /min-height:720px[^>]*background:#f6f4ef/);

  const message = new Function('msg', handler.func)({});
  assert.match(message.payload, /<style>[\s\S]*\.status-console/);
  assert.match(message.payload, /class="card status-console state-grid"/);
  assert.match(message.payload, /id="wifi"/);
  assert.match(message.payload, /Cấu hình Wi-Fi cho tủ/);
  assert.match(message.payload, /Locker-Setup/);
  assert.match(message.payload, /192\.168\.4\.1/);
  const wifiSection = message.payload.match(/<section class="card device-setup-card"[\s\S]*?<\/section>/)?.[0];
  assert.ok(wifiSection, 'YC12 device setup section is missing');
  assert.doesNotMatch(wifiSection, /<(?:input|textarea|select)\b/i);
  assert.match(message.payload, /<script>[\s\S]*function protectedFetch/);
  assert.match(message.payload, /Authorization: `Bearer \$\{requestSession\.access_token\}`/);
  assert.doesNotMatch(message.payload, /href="styles\.css"|src="app\.js"/);
  assert.doesNotMatch(message.payload, /\bPhase\s+[123]\b/i);

  for (const tab of flows.filter((node) => node.type === 'tab')) {
    assert.doesNotMatch(tab.label, /^(?:P[123]\b|Phase\s+[123]\b)/i);
  }

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
    'POST /api/v1/lockers/:lockerId/telegram-link',
    'DELETE /api/v1/lockers/:lockerId/telegram-link',
    'POST /api/v1/lockers/:lockerId/telegram-test',
    'POST /api/v1/telegram/webhook',
    'GET /api/v1/public-config',
    'GET /locker',
    'GET /phase2',
  ]) assert.ok(httpRoutes.has(expected), expected);
  for (const id of ['cmd_fn', 'chat_fn', 'claim_fn', 'state_fn', 'history_fn', 'chart_fn',
    'settings_get_fn', 'settings_put_fn', 'telegram_link_fn', 'telegram_disconnect_fn',
    'telegram_test_fn', 'telegram_webhook_fn']) {
    assert.match(flows.find((node) => node.id === id).func, /RUNTIME_STARTING/);
  }
  assert.match(initializerSource(flows), /TELEGRAM_BOT_USERNAME/);
  assert.match(initializerSource(flows), /TELEGRAM_WEBHOOK_SECRET/);
  assert.doesNotMatch(initializerSource(flows), /TELEGRAM_CHAT_ID/);
});

function initializerSource(flows) {
  return flows.find((node) => node.id === 'init_fn')?.initialize || '';
}

test('Dashboard source keeps its HTML element nesting balanced', () => {
  const html = fs.readFileSync(path.resolve(nodeRedRoot, '..', 'dashboard', 'index.html'), 'utf8');
  const voidElements = new Set([
    'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link',
    'meta', 'param', 'source', 'track', 'wbr',
  ]);
  const stack = [];
  for (const match of html.matchAll(/<\s*(\/?)\s*([a-z][\w-]*)\b[^>]*>/gi)) {
    const closing = match[1] === '/';
    const tag = match[2].toLowerCase();
    if (voidElements.has(tag)) continue;
    if (!closing) stack.push({ tag, index: match.index });
    else {
      const opening = stack.pop();
      assert.ok(opening, `unexpected closing </${tag}> near index ${match.index}`);
      assert.equal(tag, opening.tag,
        `expected </${opening.tag}> for element near index ${opening.index}, got </${tag}>`);
    }
  }
  assert.deepEqual(stack, [], 'Dashboard has unclosed HTML elements');
});

test('Dashboard hidden controls remain hidden despite component display styles', () => {
  const dashboardRoot = path.resolve(nodeRedRoot, '..', 'dashboard');
  const html = fs.readFileSync(path.join(dashboardRoot, 'index.html'), 'utf8');
  const css = fs.readFileSync(path.join(dashboardRoot, 'styles.css'), 'utf8');

  for (const id of ['logout', 'telegram-open-link', 'telegram-test', 'telegram-disconnect']) {
    assert.match(html, new RegExp(`<[^>]+id="${id}"[^>]+hidden(?:\\s|>)`, 'i'),
      `${id} must be hidden in the unauthenticated/unlinked initial DOM`);
  }
  assert.match(css, /\[hidden\]\s*\{[^}]*display\s*:\s*none\s*!important\s*;?[^}]*\}/i,
    'author-level button display rules must never override the hidden attribute');
});

test('FlowFuse Dashboard API chains use distinct, readable canvas rows', () => {
  const flows = readFlow();
  const rowChains = [
    ['claim_http', 'claim_fn', 'claim_response'],
    ['state_http', 'state_fn', 'state_response'],
    ['config_http', 'config_fn', 'config_response'],
    ['history_http', 'history_fn', 'history_response'],
    ['chart_http', 'chart_fn', 'chart_response'],
    ['settings_get_http', 'settings_get_fn', 'settings_get_response'],
    ['settings_put_http', 'settings_put_fn', 'settings_put_response'],
    ['phase2_static_http', 'phase2_static_fn', 'phase2_static_response'],
    ['phase2_legacy_http'],
    ['ui_template'],
  ];

  const rowPositions = rowChains.map((ids) => {
    const nodes = ids.map((id) => flows.find((node) => node.id === id));
    assert.ok(nodes.every(Boolean), `missing Dashboard row: ${ids.join(', ')}`);
    assert.equal(new Set(nodes.map((node) => node.y)).size, 1,
      `nodes in one Dashboard chain must share a row: ${ids.join(', ')}`);
    return nodes[0].y;
  });

  assert.equal(new Set(rowPositions).size, rowPositions.length,
    'independent Dashboard chains must not share the same canvas row');
  for (let index = 1; index < rowPositions.length; index += 1) {
    assert.ok(rowPositions[index] - rowPositions[index - 1] >= 60,
      `Dashboard rows ${index} and ${index + 1} are too close to remain readable`);
  }
});

test('FlowFuse Telegram linking chains use distinct, readable canvas rows', () => {
  const flows = readFlow();
  const rowChains = [
    ['telegram_link_http', 'telegram_link_fn', 'telegram_link_response'],
    ['telegram_disconnect_http', 'telegram_disconnect_fn', 'telegram_disconnect_response'],
    ['telegram_test_http', 'telegram_test_fn', 'telegram_test_response'],
    ['telegram_webhook_http', 'telegram_webhook_fn', 'telegram_webhook_response'],
  ];
  const rowPositions = rowChains.map((ids) => {
    const nodes = ids.map((id) => flows.find((node) => node.id === id));
    assert.ok(nodes.every(Boolean), `missing Telegram row: ${ids.join(', ')}`);
    assert.equal(new Set(nodes.map((node) => node.y)).size, 1,
      `nodes in one Telegram chain must share a row: ${ids.join(', ')}`);
    assert.ok(nodes.every((node) => node.z === 'tab_telegram'));
    return nodes[0].y;
  });
  assert.equal(new Set(rowPositions).size, rowPositions.length);
  for (let index = 1; index < rowPositions.length; index += 1) {
    assert.ok(rowPositions[index] - rowPositions[index - 1] >= 60);
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
