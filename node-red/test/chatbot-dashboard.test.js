'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { classify, GeminiAdapter } = require('../lib/chatbot');
const { makeRuntime, prime, state, headers, LOCKER_A } = require('./helpers');

test('P2-A12 classifier routes every canonical YC8 acceptance question', () => {
  const canonical = [
    ['Tủ hiện đang khóa hay mở?', 'live'],
    ['Cửa tủ đang đóng hay mở?', 'live'],
    ['Cảnh báo gần nhất xảy ra khi nào?', 'history'],
    ['Trong 7 ngày qua có bao nhiêu lần mở tủ?', 'history'],
    ['Có lần mở cửa trái phép nào hôm nay không?', 'history'],
    ['Hoạt động gần nhất của tủ là gì?', 'history'],
  ];
  for (const [question, route] of canonical) assert.equal(classify(question), route, question);
  assert.equal(classify('Kể cho tôi một câu chuyện'), 'unsupported');
});

test('P2-A12 live route uses fresh cache and returns controlled missing/provider error', async () => {
  const provider = { async render() { throw Object.assign(new Error('quota'), { code: 'PROVIDER_HTTP_429' }); } };
  const { runtime } = makeRuntime({ provider });
  let result = await runtime.protectedChat({ headers: headers(), body: { locker_id: LOCKER_A, question: 'Tủ hiện tại đang khóa?' } });
  assert.equal(result.code, 'LIVE_STATE_UNAVAILABLE');
  await prime(runtime);
  result = await runtime.protectedChat({ headers: headers(), body: { locker_id: LOCKER_A, question: 'Tủ hiện tại đang khóa?' } });
  assert.equal(result.code, 'PROVIDER_HTTP_429');
  assert.equal(result.context.facts.state.lock, 'LOCKED');
  assert.equal(result.context.intent, 'current_lock_state');
  assert.equal(result.context.question, 'Tủ hiện đang khóa hay mở?');
  assert.doesNotMatch(JSON.stringify(result.context), /token-a|authorization|jwt/i);
});

test('YC8 sends a safe canonical question and structured intent to Gemini', async () => {
  let providerContext;
  const provider = { async render(context) { providerContext = context; return 'Không có cảnh báo hôm nay.'; } };
  const { runtime } = makeRuntime({ provider }); await prime(runtime);
  const result = await runtime.protectedChat({ headers: headers(), body: { locker_id: LOCKER_A,
    question: 'Có lần mở cửa trái phép nào hôm nay không? Bearer token-a' } });
  assert.equal(result.ok, true);
  assert.equal(providerContext.intent, 'unauthorized_open_today');
  assert.equal(providerContext.question, 'Có lần mở cửa trái phép nào hôm nay không?');
  assert.doesNotMatch(JSON.stringify(providerContext), /token-a|authorization|jwt/i);
});

test('P2-A13 history adapter computes counts before provider and preserves provenance/range', async () => {
  let providerContext;
  const provider = { async render(context) { providerContext = context; return 'Có 2 lần mở và 1 cảnh báo.'; } };
  const history = { async query(request) { return {
    schema_version: 1, request_id: request.request_id, locker_id: request.locker_id, source: 'phase2-fixture',
    range: { from: '2026-08-01T00:00:00.000Z', to: '2026-08-08T00:00:00.000Z' },
    events: [
      { event_type: 'DOOR_OPENED', occurred_at: '2026-08-07T01:00:00.000Z', authorized: true },
      { event_type: 'DOOR_OPENED', occurred_at: '2026-08-07T02:00:00.000Z', authorized: false },
      { event_type: 'UNAUTHORIZED_OPEN', occurred_at: '2026-08-07T02:00:00.000Z', authorized: false },
    ],
  }; } };
  const { runtime } = makeRuntime({ history, provider }); await prime(runtime);
  const result = await runtime.protectedChat({ headers: headers(), body: { locker_id: LOCKER_A,
    question: 'Trong 7 ngày có bao nhiêu lần mở và cảnh báo?' } });
  assert.equal(result.ok, true);
  assert.equal(providerContext.facts.open_count, 2);
  assert.equal(providerContext.facts.alert_count, 1);
  assert.equal(providerContext.facts.source, 'phase2-fixture');
  assert.equal(providerContext.intent, 'open_count_7_days');
  assert.equal(providerContext.question, 'Trong 7 ngày qua có bao nhiêu lần mở tủ?');
  assert.match(providerContext.instruction, /Never invent/);
});

test('history route reports unavailable instead of inventing zero counts when Phase 3 is absent', async () => {
  const history = { async query(request) { return { schema_version: 1,
    request_id: request.request_id, locker_id: request.locker_id, range: null,
    events: [], source: 'phase3-not-configured' }; } };
  const { runtime } = makeRuntime({ history }); await prime(runtime);
  const result = await runtime.protectedChat({ headers: headers(), body: { locker_id: LOCKER_A,
    question: 'Trong 7 ngày có bao nhiêu lần mở?' } });
  assert.equal(result.ok, false); assert.equal(result.code, 'HISTORY_UNAVAILABLE');
});

test('history adapter transport failure returns a controlled response', async () => {
  const history = { async query() { throw new TypeError('fetch failed'); } };
  const { runtime } = makeRuntime({ history });
  const result = await runtime.protectedChat({ headers: headers(), body: { locker_id: LOCKER_A,
    question: 'Cảnh báo gần nhất xảy ra khi nào?' } });
  assert.deepEqual(result, { ok: false, code: 'HISTORY_UNAVAILABLE', route: 'history' });
});

test('Gemini credential is carried in a header, never in the request URL', async () => {
  let request;
  const adapter = new GeminiAdapter({ apiKey: 'gemini-test-key', model: 'gemini-test-model',
    fetchImpl: async (url, options) => { request = { url, options }; return { ok: true,
      async json() { return { candidates: [{ content: { parts: [{ text: 'ok' }] } }] }; } }; } });
  assert.equal(await adapter.render({ facts: {} }), 'ok');
  assert.doesNotMatch(request.url, /gemini-test-key|[?&]key=/);
  assert.equal(request.options.headers['x-goog-api-key'], 'gemini-test-key');
});

test('dashboard separates MQTT/device, marks UNKNOWN/stale, and does not enable before gates', async () => {
  const { runtime } = makeRuntime();
  let ui = runtime.uiState({ authenticated: false, ownsLocker: false, lockerId: LOCKER_A });
  assert.equal(ui.mqtt, 'DISCONNECTED');
  assert.equal(ui.wifi, 'UNKNOWN');
  assert.equal(ui.door, 'UNKNOWN');
  assert.equal(ui.controls.lock.enabled, false);
  await prime(runtime);
  ui = runtime.uiState({ authenticated: true, ownsLocker: true, lockerId: LOCKER_A });
  assert.equal(ui.mqtt, 'CONNECTED');
  assert.equal(ui.wifi, 'CONNECTED');
  assert.equal(ui.device, 'ONLINE');
  assert.equal(ui.controls.lock.enabled, true);
});

test('YC12 exposes only fresh validated Wi-Fi connectivity and hides stale values', async () => {
  const { runtime, clock } = makeRuntime();
  runtime.setMqttConnected(true);
  await runtime.ingest(`locker/${LOCKER_A}/availability`, {
    schema_version: 1,
    locker_id: LOCKER_A,
    status: 'ONLINE',
    sent_at: new Date(clock.value).toISOString(),
  }, clock.value);
  await runtime.ingest(`locker/${LOCKER_A}/state`, state(LOCKER_A, {
    wifi_connected: false,
    timestamp: new Date(clock.value).toISOString(),
  }), clock.value);

  let ui = runtime.uiState({ authenticated: true, ownsLocker: true, lockerId: LOCKER_A });
  assert.equal(ui.wifi, 'DISCONNECTED');

  clock.value += 30_001;
  ui = runtime.uiState({ authenticated: true, ownsLocker: true, lockerId: LOCKER_A });
  assert.equal(ui.wifi, 'UNKNOWN');
});

test('dashboard never shows success on publish; pending domain remains disabled until ACK', async () => {
  const { runtime } = makeRuntime(); await prime(runtime);
  await runtime.protectedCommand({ headers: headers(), body: { locker_id: LOCKER_A, action: 'LOCK' } });
  const ui = runtime.uiState({ authenticated: true, ownsLocker: true, lockerId: LOCKER_A });
  assert.equal(ui.controls.lock.pending, true);
  assert.equal(ui.controls.lock.enabled, false);
});
