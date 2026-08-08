'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { TelegramAdapter } = require('../lib/telegram');

const event = { event_id: '10000000-0000-4000-8000-000000000001', locker_id: 'LOCKER-001',
  occurred_at: '2026-08-08T08:00:00.000Z', device_state: { door: 'OPEN', lock: 'LOCKED' } };

test('Telegram message contains required non-secret fields and dedupes event ID', async () => {
  let message;
  const adapter = new TelegramAdapter({ transport: async (value) => { message = value.text; },
    dashboardUrl: 'https://dashboard.example.test', now: () => 1000 });
  assert.equal((await adapter.notify(event, { locker_code: 'LOCKER-001', display_name: 'Tủ demo' })).status, 'delivered');
  assert.match(message, /Tủ demo/); assert.match(message, /Cửa: OPEN/); assert.match(message, /Khóa: LOCKED/);
  assert.match(message, /https:\/\/dashboard\.example\.test/);
  assert.equal((await adapter.notify(event)).status, 'duplicate_suppressed');
});

test('Telegram controlled failure has one attempt and does not throw', async () => {
  const adapter = new TelegramAdapter({ transport: async () => { throw Object.assign(new Error('network'), { code: 'NETWORK' }); },
    dashboardUrl: 'https://dashboard.example.test', now: () => 1000 });
  const result = await adapter.notify(event);
  assert.deepEqual(result, { status: 'failed', attempts: 1, error_code: 'NETWORK' });
});

test('Telegram per-locker rate limit suppresses a second event inside boundary', async () => {
  let now = 1000; let calls = 0;
  const adapter = new TelegramAdapter({ transport: async () => { calls += 1; }, dashboardUrl: 'x',
    now: () => now, rateLimitMs: 30000 });
  await adapter.notify(event);
  now += 100;
  assert.equal((await adapter.notify({ ...event, event_id: '10000000-0000-4000-8000-000000000002' })).status, 'rate_limited');
  assert.equal(calls, 1);
});
