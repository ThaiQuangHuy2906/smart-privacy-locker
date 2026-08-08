'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { classify } = require('../lib/chatbot');
const { makeRuntime, prime, headers, LOCKER_A } = require('./helpers');

test('P2-A12 classifier routes live/history and rejects unsupported input', () => {
  assert.equal(classify('Cửa tủ hiện tại đang mở hay đóng?'), 'live');
  assert.equal(classify('Trong 7 ngày qua có bao nhiêu lần mở tủ?'), 'history');
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
  assert.doesNotMatch(JSON.stringify(result.context), /token-a|authorization|jwt/i);
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
  assert.match(providerContext.instruction, /Never invent/);
});

test('dashboard separates MQTT/device, marks UNKNOWN/stale, and does not enable before gates', async () => {
  const { runtime } = makeRuntime();
  let ui = runtime.uiState({ authenticated: false, ownsLocker: false, lockerId: LOCKER_A });
  assert.equal(ui.mqtt, 'DISCONNECTED');
  assert.equal(ui.door, 'UNKNOWN');
  assert.equal(ui.controls.lock.enabled, false);
  await prime(runtime);
  ui = runtime.uiState({ authenticated: true, ownsLocker: true, lockerId: LOCKER_A });
  assert.equal(ui.mqtt, 'CONNECTED');
  assert.equal(ui.device, 'ONLINE');
  assert.equal(ui.controls.lock.enabled, true);
});

test('dashboard never shows success on publish; pending domain remains disabled until ACK', async () => {
  const { runtime } = makeRuntime(); await prime(runtime);
  await runtime.protectedCommand({ headers: headers(), body: { locker_id: LOCKER_A, action: 'LOCK' } });
  const ui = runtime.uiState({ authenticated: true, ownsLocker: true, lockerId: LOCKER_A });
  assert.equal(ui.controls.lock.pending, true);
  assert.equal(ui.controls.lock.enabled, false);
});
