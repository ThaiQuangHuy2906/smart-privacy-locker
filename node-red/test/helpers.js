'use strict';

const { AuthGate } = require('../lib/auth');
const { TelegramAdapter } = require('../lib/telegram');
const { Phase2Runtime } = require('../lib/runtime');

const USER_A = '20000000-0000-4000-8000-000000000001';
const USER_B = '20000000-0000-4000-8000-000000000002';
const LOCKER_A = 'LOCKER-001';
const LOCKER_B = 'LOCKER-002';

function uuidSequence() {
  let value = 1;
  return () => `10000000-0000-4000-8000-${String(value++).padStart(12, '0')}`;
}

function state(lockerId = LOCKER_A, overrides = {}) {
  return { schema_version: 1, locker_id: lockerId, door: 'CLOSED', lock: 'LOCKED',
    alarm: 'INACTIVE', led: 'OFF', wifi_connected: true, mqtt_connected: true,
    timestamp: '2026-08-08T08:00:00.000Z', ...overrides };
}

function availability(lockerId = LOCKER_A, status = 'ONLINE') {
  return { schema_version: 1, locker_id: lockerId, status, sent_at: '2026-08-08T08:00:00.000Z' };
}

function makeRuntime({ history, provider, telegramTransport, runtimeOptions = {}, telegramOptions = {} } = {}) {
  const clock = { value: Date.parse('2026-08-08T08:00:00.000Z') };
  const publications = [];
  const authAdapter = {
    async verify(token) {
      if (token === 'expired') throw Object.assign(new Error('expired'), { status: 401 });
      if (token === 'token-a') return { id: USER_A };
      if (token === 'token-b') return { id: USER_B };
      throw Object.assign(new Error('invalid'), { status: 401 });
    },
    async owns(_token, userId, lockerId) {
      return (userId === USER_A && lockerId === LOCKER_A) || (userId === USER_B && lockerId === LOCKER_B);
    },
    async claim(_token, code) { return { locker_code: code, owner_id: USER_A }; },
  };
  const telegram = new TelegramAdapter({ transport: telegramTransport || (async () => {}),
    dashboardUrl: 'https://dashboard.example.test', now: () => clock.value, rateLimitMs: 1000,
    ...telegramOptions });
  const runtime = new Phase2Runtime({ authGate: new AuthGate(authAdapter),
    publish: (topic, payload, options) => publications.push({ topic, payload, options }),
    history: history || { async query(request) { return { schema_version: 1,
      request_id: request.request_id, locker_id: request.locker_id, range: { from: '2026-08-01T00:00:00.000Z', to: '2026-08-08T00:00:00.000Z' },
      source: 'fixture', events: [] }; } },
    telegram, gemini: provider || null, timeoutMs: 5000, windowMs: 30000,
    staleAfterMs: 30000, now: () => clock.value, uuid: uuidSequence(), ...runtimeOptions });
  return { runtime, clock, publications };
}

async function prime(runtime, lockerId = LOCKER_A) {
  runtime.setMqttConnected(true);
  const observed = Date.parse('2026-08-08T08:00:00.000Z');
  await runtime.ingest(`locker/${lockerId}/availability`, availability(lockerId), observed);
  await runtime.ingest(`locker/${lockerId}/state`, state(lockerId), observed);
}

function headers(token = 'token-a') { return { authorization: `Bearer ${token}` }; }

module.exports = { USER_A, USER_B, LOCKER_A, LOCKER_B, uuidSequence, state,
  availability, makeRuntime, prime, headers };
