'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { TelegramAdapter, telegramHttpTransport } = require('../lib/telegram');

const event = { event_id: '10000000-0000-4000-8000-000000000001', locker_id: 'LOCKER-001',
  occurred_at: '2026-08-08T08:00:00.000Z', device_state: { door: 'OPEN', lock: 'LOCKED' } };

test('Telegram message contains required non-secret fields and dedupes event ID', async () => {
  let message;
  const adapter = new TelegramAdapter({ transport: async (value) => { message = value.text; },
    dashboardUrl: 'https://dashboard.example.test', now: () => 1000 });
  assert.equal((await adapter.notify(event, { locker_code: 'LOCKER-001', display_name: 'Tủ demo',
    telegram_chat_id: '123456789' })).status, 'delivered');
  assert.match(message, /Tủ demo/); assert.match(message, /Cửa: OPEN/); assert.match(message, /Khóa: LOCKED/);
  assert.match(message, /https:\/\/dashboard\.example\.test/);
  const duplicate = await adapter.notify(event, { telegram_chat_id: '123456789' });
  assert.equal(duplicate.status, 'duplicate_suppressed');
  assert.equal(duplicate.schema_version, 1); assert.equal(duplicate.channel, 'telegram');
  assert.equal(duplicate.event_id, event.event_id); assert.equal(duplicate.error, null);
});

test('Telegram controlled failure has one attempt and does not throw', async () => {
  const adapter = new TelegramAdapter({ transport: async () => { throw Object.assign(new Error('network'), { code: 'NETWORK' }); },
    dashboardUrl: 'https://dashboard.example.test', now: () => 1000 });
  const result = await adapter.notify(event, { telegram_chat_id: '123456789' });
  assert.equal(result.status, 'failed'); assert.equal(result.attempts, 1);
  assert.deepEqual(result.error, { code: 'NETWORK', message: 'Telegram delivery failed' });
  assert.match(result.attempted_at, /^1970-01-01T00:00:01\.000Z$/);
});

test('Telegram per-locker rate limit suppresses a second event inside boundary', async () => {
  let now = 1000; let calls = 0;
  const adapter = new TelegramAdapter({ transport: async () => { calls += 1; }, dashboardUrl: 'x',
    now: () => now, rateLimitMs: 30000 });
  await adapter.notify(event, { telegram_chat_id: '123456789' });
  now += 100;
  assert.equal((await adapter.notify(
    { ...event, event_id: '10000000-0000-4000-8000-000000000002' },
    { telegram_chat_id: '123456789' })).status, 'rate_limited');
  assert.equal(calls, 1);
});

test('Telegram HTTP transport aborts a stalled provider with a controlled timeout', async () => {
  const transport = telegramHttpTransport({ token: 'unit-token-placeholder', timeoutMs: 5,
    fetchImpl: async (_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'),
        { name: 'AbortError' })));
    }) });
  await assert.rejects(() => transport({ chatId: '123456789', text: 'test' }),
    (error) => error.code === 'TELEGRAM_TIMEOUT');
});

test('Telegram dedupe and per-locker rate-limit state remain bounded', async () => {
  let now = 1000;
  const adapter = new TelegramAdapter({ transport: async () => {}, dashboardUrl: 'x',
    now: () => now, rateLimitMs: 0, dedupeLimit: 2, lockerLimit: 2 });
  for (let index = 1; index <= 3; index += 1) {
    await adapter.notify({ ...event,
      event_id: `10000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
      locker_id: `LOCKER-00${index}` }, { telegram_chat_id: String(123456780 + index) });
    now += 1;
  }
  assert.equal(adapter.delivered.size, 2);
  assert.equal(adapter.lastByLocker.size, 2);
  assert.equal(adapter.delivered.has('10000000-0000-4000-8000-000000000001'), false);
});

test('Telegram alert has no global destination fallback when a locker is not linked', async () => {
  let calls = 0;
  const adapter = new TelegramAdapter({ transport: async () => { calls += 1; }, dashboardUrl: 'x' });
  const result = await adapter.notify(event, {});
  assert.equal(result.status, 'not_configured');
  assert.equal(result.attempts, 0);
  assert.equal(result.error.code, 'TELEGRAM_NOT_LINKED');
  assert.equal(calls, 0);
});

test('Telegram HTTP transport receives the per-locker private chat ID at send time', async () => {
  let request;
  const transport = telegramHttpTransport({ token: 'unit-token-placeholder',
    fetchImpl: async (url, options) => { request = { url, options }; return { ok: true, status: 200 }; } });
  await transport({ chatId: '987654321', text: 'hello' });
  assert.equal(JSON.parse(request.options.body).chat_id, '987654321');
});
