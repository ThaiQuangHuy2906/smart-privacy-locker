'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { aggregateChart, aggregateDailyReport } = require('../lib/statistics');
const { calendarRange, previousDayRange } = require('../lib/report-time');
const { EmailAdapter, renderDailyEmail } = require('../lib/email');
const { EVENT_TYPES, validateSetting, eventRow, SupabaseDataAdapter } = require('../lib/data');
const { normalizedEvent } = require('../lib/events');
const { makeRuntime, prime, headers, LOCKER_A } = require('./helpers');

class MemoryPhase3Data {
  constructor(now) {
    this.now = () => now;
    this.rows = [];
    this.settings = new Map();
    this.deliveries = new Map();
  }

  async persist(event) {
    if (this.rows.some((row) => row.event_id === event.event_id)) return { inserted: false, duplicate: true };
    this.rows.push(structuredClone(event));
    return { inserted: true, duplicate: false };
  }

  async events(lockerId, { from, to, limit = 100, eventTypes = [] } = {}) {
    return this.rows.filter((event) => event.locker_id === lockerId)
      .filter((event) => !from || Date.parse(event.occurred_at) >= Date.parse(from))
      .filter((event) => !to || Date.parse(event.occurred_at) < Date.parse(to))
      .filter((event) => !eventTypes.length || eventTypes.includes(event.event_type))
      .sort((a, b) => Date.parse(b.occurred_at) - Date.parse(a.occurred_at)).slice(0, limit);
  }

  async history(lockerId, { days = 7, limit = 100, timezone = 'Asia/Ho_Chi_Minh' } = {}) {
    const range = calendarRange(Number(days), this.now(), timezone);
    return { locker_id: lockerId, days: Number(days), timezone,
      range: { from: range.from, to: range.to }, events: await this.events(lockerId, { ...range, limit }) };
  }

  async chart(lockerId, { days = 7, timezone = 'Asia/Ho_Chi_Minh' } = {}) {
    return aggregateChart(await this.events(lockerId, { limit: 1000 }), {
      days: Number(days), now: this.now(), timezone,
    });
  }

  async query(request) {
    const setting = await this.getSettings(request.locker_id);
    const history = await this.history(request.locker_id, {
      days: 7, limit: 200, timezone: setting.timezone,
    });
    return { schema_version: 1, request_id: request.request_id, locker_id: request.locker_id,
      timezone: history.timezone, range: history.range, events: history.events, source: 'memory-phase3' };
  }

  async getSettings(lockerId) {
    return this.settings.get(lockerId) || { locker_id: lockerId, email_enabled: false,
      email_address: null, telegram_enabled: false, telegram_chat_id: null,
      telegram_user_id: null, telegram_username: null, telegram_linked_at: null,
      report_time: '21:00', timezone: 'Asia/Ho_Chi_Minh' };
  }

  async saveSettings(lockerId, ownerOrInput, maybeInput) {
    const input = maybeInput || ownerOrInput;
    const value = { locker_id: lockerId, ...validateSetting(input) };
    this.settings.set(lockerId, value);
    return value;
  }

  async enabledEmailSettings() {
    return [...this.settings.values()].filter((setting) => setting.email_enabled);
  }

  async reserveDelivery({ lockerId, reportDate, attemptedAt, retryBefore,
    stalePendingBefore, maxAttempts = 3 }) {
    const key = `${lockerId}:email:${reportDate}`;
    const existing = this.deliveries.get(key);
    if (!existing) {
      const row = { id: `delivery-${this.deliveries.size + 1}`, locker_id: lockerId,
        report_key: reportDate, report_date: reportDate, status: 'pending', attempts: 1,
        attempted_at: attemptedAt };
      this.deliveries.set(key, row);
      return { ...row, claimed: true };
    }
    if (existing.status === 'sending' && existing.attempted_at <= stalePendingBefore) {
      existing.status = 'delivery_unknown';
      existing.error = { code: 'DELIVERY_OUTCOME_UNKNOWN' };
      return { ...existing, claimed: false };
    }
    const retryable = existing.attempts < maxAttempts
      && ((existing.status === 'failed' && existing.attempted_at <= retryBefore)
        || (existing.status === 'pending' && existing.attempted_at <= stalePendingBefore));
    if (!retryable) return { ...existing, claimed: false };
    Object.assign(existing, { status: 'pending', attempts: existing.attempts + 1,
      attempted_at: attemptedAt, sent_at: null, error: null });
    return { ...existing, claimed: true };
  }

  async beginDelivery(id, attemptedAt) {
    const row = [...this.deliveries.values()].find((item) => item.id === id);
    if (!row || row.status !== 'pending') return null;
    row.status = 'sending';
    row.attempted_at = attemptedAt;
    return row;
  }

  async completeDelivery(id, patch) {
    const row = [...this.deliveries.values()].find((item) => item.id === id);
    if (!row) return null;
    if (patch.status === 'delivered' && row.status !== 'sending') return null;
    if (patch.status === 'delivery_unknown' && row.status !== 'sending') return null;
    if (patch.status === 'failed' && !['pending', 'sending'].includes(row.status)) return null;
    const normalized = { ...patch };
    if (Object.hasOwn(normalized, 'sentAt')) {
      normalized.sent_at = normalized.sentAt;
      delete normalized.sentAt;
    }
    Object.assign(row, normalized);
    return row;
  }
}

function alarmAck(command, state = 'ACTIVE') {
  return { schema_version: 1, command_id: command.command_id, locker_id: LOCKER_A,
    action: command.action, result: 'success', device_state: { door: 'CLOSED', lock: 'LOCKED',
      alarm: state, led: 'OFF' }, error: null, duplicate: false,
    timestamp: '2026-08-08T08:00:01.000Z' };
}

test('P3-A02 canonical event matrix maps every persisted type and enforces required fields', () => {
  let sequence = 1;
  for (const eventType of EVENT_TYPES) {
    const event = normalizedEvent({
      eventType, lockerId: LOCKER_A, source: 'system', result: 'success',
      authorized: ['DOOR_OPENED', 'UNAUTHORIZED_OPEN'].includes(eventType) ? false : null,
      recordedAt: '2026-08-08T08:00:00.000Z',
      uuid: () => `50000000-0000-4000-8000-${String(sequence++).padStart(12, '0')}`,
    });
    const row = eventRow(event);
    assert.equal(row.event_type, eventType);
    assert.equal(row.locker_id, LOCKER_A);
    assert.equal(typeof row.device, 'string');
    assert.equal(typeof row.occurred_at, 'string');
  }
  assert.throws(() => eventRow({ schema_version: 1, event_type: 'UNKNOWN' }), /invalid/i);
});

test('notification settings never accept a browser-supplied Telegram destination', () => {
  const setting = validateSetting({ telegram_enabled: true, telegram_chat_id: 'attacker-chat' });
  assert.equal(setting.telegram_enabled, true);
  assert.equal(Object.hasOwn(setting, 'telegram_chat_id'), false);
});

test('P3-A03 Supabase persistence is idempotent and surfaces provider failures safely', async () => {
  const responses = [
    { ok: true, status: 201, async text() { return '[]'; } },
    { ok: true, status: 201, async text() { return '[{"event_id":"one"}]'; } },
    { ok: false, status: 503, async text() { return 'provider details must not escape'; } },
  ];
  const requests = [];
  const adapter = new SupabaseDataAdapter({
    url: 'https://example.supabase.co', serviceRoleKey: 'test-service-role',
    fetchImpl: async (url, options) => { requests.push({ url, options }); return responses.shift(); },
  });
  const event = normalizedEvent({
    eventType: 'ALARM_STARTED', lockerId: LOCKER_A, source: 'dashboard', result: 'success',
    recordedAt: '2026-08-08T08:00:00.000Z',
    uuid: () => '50000000-0000-4000-8000-000000000099',
  });

  assert.deepEqual(await adapter.persist(event), { inserted: false, duplicate: true });
  assert.deepEqual(await adapter.persist(event), { inserted: true, duplicate: false });
  await assert.rejects(adapter.persist(event), (error) => error.code === 'DATA_HTTP_503'
    && !error.message.includes('provider details'));
  assert.equal(requests.length, 3);
  assert.equal(requests[0].options.headers.Prefer, 'resolution=ignore-duplicates,return=representation');
  assert.match(requests[0].options.body, /ALARM_STARTED/);
});

test('Supabase data timeout normalizes DOM AbortError and malformed JSON safely', async () => {
  const stalled = new SupabaseDataAdapter({
    url: 'https://example.supabase.co', serviceRoleKey: 'test-service-role', timeoutMs: 5,
    fetchImpl: async (_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => {
        reject(new DOMException('provider details must not escape', 'AbortError'));
      }, { once: true });
    }),
  });
  await assert.rejects(stalled.request('/rest/v1/device_events'),
    (error) => error.code === 'DATA_TIMEOUT' && error.status === 503
      && !error.message.includes('provider details'));

  const malformed = new SupabaseDataAdapter({
    url: 'https://example.supabase.co', serviceRoleKey: 'test-service-role',
    fetchImpl: async () => ({ ok: true, status: 200, async text() { return '{not-json'; } }),
  });
  await assert.rejects(malformed.request('/rest/v1/device_events'),
    (error) => error.code === 'DATA_INVALID_RESPONSE' && error.status === 503
      && !error.message.includes('not-json'));
});

test('Supabase data adapter exposes only allowlisted RPC contract errors', async () => {
  const responses = [
    { ok: false, status: 400, async text() {
      return JSON.stringify({ code: 'P0001', message: 'TELEGRAM_LINK_INVALID_OR_EXPIRED' });
    } },
    { ok: false, status: 400, async text() {
      return JSON.stringify({ code: 'PGRST202', message: 'provider schema details' });
    } },
  ];
  const adapter = new SupabaseDataAdapter({
    url: 'https://example.supabase.co', serviceRoleKey: 'test-service-role',
    fetchImpl: async () => responses.shift(),
  });

  await assert.rejects(adapter.request('/rest/v1/rpc/consume_telegram_link'),
    (error) => error.code === 'TELEGRAM_LINK_INVALID_OR_EXPIRED'
      && error.status === 400 && !error.message.includes('P0001'));
  await assert.rejects(adapter.request('/rest/v1/rpc/consume_telegram_link'),
    (error) => error.code === 'DATA_HTTP_400'
      && error.status === 400 && !error.message.includes('provider schema details'));
});

test('Supabase chatbot history derives calendar boundaries from the locker timezone', async () => {
  const now = Date.parse('2026-08-10T03:00:00.000Z');
  const adapter = new SupabaseDataAdapter({
    url: 'https://example.supabase.co', serviceRoleKey: 'test-service-role', now: () => now,
    fetchImpl: async () => { throw new Error('network must be stubbed'); },
  });
  let capturedRange;
  adapter.getSettings = async () => ({ locker_id: LOCKER_A, timezone: 'America/New_York' });
  adapter.allEvents = async (_lockerId, range) => { capturedRange = range; return []; };

  const result = await adapter.query({
    request_id: '51000000-0000-4000-8000-000000000001',
    locker_id: LOCKER_A,
    question: 'Hôm nay có sự kiện gì?',
  });

  assert.equal(result.timezone, 'America/New_York');
  assert.deepEqual(capturedRange, calendarRange(1, now, 'America/New_York'));
});

test('Phase 3 aggregation paginates without truncating or double-counting overlapping pages', async () => {
  const requests = [];
  const event = (index) => ({
    event_id: `50000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    event_type: 'DOOR_OPENED', occurred_at: '2026-08-10T01:00:00.000Z',
  });
  const pages = [
    Array.from({ length: 1000 }, (_value, index) => event(index + 1)),
    // A concurrent insert before the offset boundary can make PostgREST
    // repeat the last row from the previous page. The idempotency key must
    // prevent that overlap from inflating chart/report/chatbot counts.
    [event(1000), event(1001)],
  ];
  const adapter = new SupabaseDataAdapter({
    url: 'https://example.supabase.co', serviceRoleKey: 'test-service-role',
    now: () => Date.parse('2026-08-10T03:00:00.000Z'),
    fetchImpl: async (url) => {
      requests.push(url);
      return { ok: true, status: 200, async text() { return JSON.stringify(pages.shift()); } };
    },
  });

  const chart = await adapter.chart(LOCKER_A, { days: 7 });

  assert.equal(chart.totals.opens, 1001);
  assert.equal(requests.length, 2);
  assert.match(decodeURIComponent(requests[0]), /offset=0/);
  assert.match(decodeURIComponent(requests[1]), /offset=1000/);
  assert.match(decodeURIComponent(requests[0]), /order=occurred_at.desc,event_id.desc/);
});

test('daily scheduler settings pagination does not omit lockers after the first 1000 rows', async () => {
  const requests = [];
  const setting = (index) => ({ locker_id: `LOCKER-${String(index).padStart(4, '0')}`, email_enabled: true });
  const pages = [
    Array.from({ length: 1000 }, (_value, index) => setting(index + 1)),
    [setting(1001)],
  ];
  const adapter = new SupabaseDataAdapter({
    url: 'https://example.supabase.co', serviceRoleKey: 'test-service-role',
    fetchImpl: async (url) => {
      requests.push(url);
      return { ok: true, status: 200, async text() { return JSON.stringify(pages.shift()); } };
    },
  });

  const settings = await adapter.enabledEmailSettings();

  assert.equal(settings.length, 1001);
  assert.equal(requests.length, 2);
  assert.match(decodeURIComponent(requests[0]), /offset=0/);
  assert.match(decodeURIComponent(requests[1]), /offset=1000/);
  assert.match(decodeURIComponent(requests[0]), /order=locker_id.asc/);
});

test('P3-A03 retained availability replay keeps one persisted event across runtime restarts', async () => {
  const now = Date.parse('2026-08-10T08:00:00.000Z');
  const data = new MemoryPhase3Data(now);
  const payload = { schema_version: 1, locker_id: LOCKER_A, status: 'OFFLINE',
    sent_at: '2026-08-09T05:34:01.852Z' };

  const first = makeRuntime({ runtimeOptions: { data,
    uuid: () => '10000000-0000-4000-8000-000000000001' } });
  await first.runtime.ingest(`locker/${LOCKER_A}/availability`, payload, now);
  await first.runtime.flushPersistence();

  const restarted = makeRuntime({ runtimeOptions: { data,
    uuid: () => '20000000-0000-4000-8000-000000000002' } });
  await restarted.runtime.ingest(`locker/${LOCKER_A}/availability`, payload, now + 60_000);
  await restarted.runtime.flushPersistence();

  assert.equal(data.rows.length, 1);
  assert.equal(data.rows[0].event_type, 'DEVICE_OFFLINE');
  assert.equal(data.rows[0].occurred_at, payload.sent_at);
  assert.match(data.rows[0].event_id,
    /^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

test('timestamp-less retained availability updates live state without fabricating history identity', async () => {
  const now = Date.parse('2026-08-10T08:00:00.000Z');
  const data = new MemoryPhase3Data(now);
  const payload = { schema_version: 1, locker_id: LOCKER_A, status: 'ONLINE', sent_at: null };

  const first = makeRuntime({ runtimeOptions: { data } });
  first.runtime.setMqttConnected(true);
  const firstResult = await first.runtime.ingest(`locker/${LOCKER_A}/availability`, payload, now);
  await first.runtime.flushPersistence();
  const restarted = makeRuntime({ runtimeOptions: { data } });
  restarted.runtime.setMqttConnected(true);
  const replayResult = await restarted.runtime.ingest(`locker/${LOCKER_A}/availability`, payload, now + 60_000);
  await restarted.runtime.flushPersistence();

  assert.deepEqual(firstResult, { accepted: true, type: 'availability', persisted: false });
  assert.deepEqual(replayResult, { accepted: true, type: 'availability', persisted: false });
  assert.equal(first.runtime.cache.snapshot(LOCKER_A, now).availability, 'ONLINE');
  assert.equal(data.rows.length, 0);
});

test('P3-A01 ALARM_ON/OFF ACK updates state and persists canonical CB3 events', async () => {
  const now = Date.parse('2026-08-08T08:00:00.000Z');
  const data = new MemoryPhase3Data(now);
  const { runtime, clock } = makeRuntime({ runtimeOptions: { data } });
  await prime(runtime);
  data.rows.length = 0;

  const start = await runtime.protectedCommand({ headers: headers(),
    body: { locker_id: LOCKER_A, action: 'ALARM_ON' } });
  assert.equal(start.ok, true);
  clock.value += 1000;
  const started = await runtime.ingest(`locker/${LOCKER_A}/ack`, alarmAck(start.command), clock.value);
  assert.equal(started.result.ok, true);
  assert.equal(runtime.cache.snapshot(LOCKER_A, clock.value).state.alarm, 'ACTIVE');

  const stop = await runtime.protectedCommand({ headers: headers(),
    body: { locker_id: LOCKER_A, action: 'ALARM_OFF' } });
  clock.value += 1000;
  await runtime.ingest(`locker/${LOCKER_A}/ack`, alarmAck(stop.command, 'INACTIVE'), clock.value);
  await runtime.flushPersistence();

  assert.deepEqual(data.rows.map((event) => event.event_type), ['ALARM_STARTED', 'ALARM_STOPPED']);
  assert.deepEqual(data.rows.map((event) => event.command_id),
    [start.command.command_id, stop.command.command_id]);
});

test('P3-A04 chart uses local calendar boundaries and emits zero buckets', () => {
  const now = Date.parse('2026-08-10T03:00:00.000Z');
  const events = [
    { event_type: 'DOOR_OPENED', occurred_at: '2026-08-09T17:00:00.000Z' },
    { event_type: 'UNAUTHORIZED_OPEN', occurred_at: '2026-08-09T17:30:00.000Z' },
    { event_type: 'DOOR_OPENED', occurred_at: '2026-08-03T16:59:59.999Z' },
  ];
  const result = aggregateChart(events, { days: 7, now, timezone: 'Asia/Ho_Chi_Minh' });

  assert.equal(result.buckets.length, 7);
  assert.deepEqual(result.range, {
    from: '2026-08-03T17:00:00.000Z', to: '2026-08-10T17:00:00.000Z',
  });
  assert.deepEqual(result.totals, { opens: 1, alerts: 1 });
  assert.deepEqual(result.buckets.at(-1), { date: '2026-08-10', opens: 1, alerts: 1 });
  assert.equal(result.buckets.filter((bucket) => bucket.opens === 0 && bucket.alerts === 0).length, 6);
});

test('P3-A05 daily email contains previous local day counts, range, and latest activity', () => {
  const now = Date.parse('2026-08-10T14:00:00.000Z');
  const events = [
    { event_type: 'DOOR_OPENED', occurred_at: '2026-08-08T18:00:00.000Z', result: 'observed' },
    { event_type: 'UNAUTHORIZED_OPEN', occurred_at: '2026-08-09T01:00:00.000Z', result: 'observed' },
  ];
  const report = aggregateDailyReport(events, { now, timezone: 'Asia/Ho_Chi_Minh' });
  const email = renderDailyEmail({ lockerId: LOCKER_A, report });

  assert.deepEqual(previousDayRange(now, 'Asia/Ho_Chi_Minh'), {
    from: '2026-08-08T17:00:00.000Z', to: '2026-08-09T17:00:00.000Z', reportDate: '2026-08-09',
  });
  assert.equal(report.opens, 1);
  assert.equal(report.alerts, 1);
  assert.match(email.subject, /LOCKER-001/);
  assert.match(email.text, /Số lần mở tủ: 1/);
  assert.match(email.text, /Số cảnh báo: 1/);
  assert.match(email.text, /Asia\/Ho_Chi_Minh/);
});

test('P3-A06 scheduler sends once per locker/report date and records delivery', async () => {
  let now = Date.parse('2026-08-10T14:00:00.000Z'); // 21:00 in Ho Chi Minh City
  const attemptedAt = new Date(now).toISOString();
  const data = new MemoryPhase3Data(now);
  await data.saveSettings(LOCKER_A, { email_enabled: true, email_address: 'owner@example.test',
    report_time: '21:00', timezone: 'Asia/Ho_Chi_Minh' });
  data.rows.push({ event_id: '40000000-0000-4000-8000-000000000001', locker_id: LOCKER_A,
    event_type: 'DOOR_OPENED', occurred_at: '2026-08-10T01:00:00.000Z', result: 'observed' });
  const sent = [];
  const email = new EmailAdapter({ from: 'locker@example.test',
    transport: { async sendMail(message) {
      sent.push(message);
      now += 2500;
      return { messageId: 'mail-1' };
    } } });
  const { runtime } = makeRuntime({ runtimeOptions: { data, email, now: () => now } });

  const first = await runtime.runDailyReports();
  const { runtime: restarted } = makeRuntime({ runtimeOptions: { data, email, now: () => now } });
  const second = await restarted.runDailyReports();
  await runtime.flushPersistence();

  assert.equal(first[0].status, 'delivered');
  assert.equal(second[0].status, 'duplicate_suppressed');
  assert.equal(sent.length, 1);
  const delivery = [...data.deliveries.values()][0];
  assert.equal(delivery.status, 'delivered');
  assert.equal(delivery.attempted_at, attemptedAt);
  assert.equal(delivery.sent_at, new Date(now).toISOString());
  assert.equal(data.rows.filter((event) => event.event_type === 'DAILY_EMAIL_REPORT').length, 1);
});

test('scheduler does not consume a delivery reservation before SMTP is configured', async () => {
  const now = Date.parse('2026-08-10T14:00:00.000Z');
  const data = new MemoryPhase3Data(now);
  await data.saveSettings(LOCKER_A, {
    email_enabled: true, email_address: 'owner@example.test',
    report_time: '21:00', timezone: 'Asia/Ho_Chi_Minh',
  });
  const { runtime } = makeRuntime({ runtimeOptions: { data, now: () => now } });

  const result = await runtime.runDailyReports();

  assert.deepEqual(result, [{ ok: false, locker_id: LOCKER_A, code: 'EMAIL_NOT_CONFIGURED' }]);
  assert.equal(data.deliveries.size, 0);
});

test('scheduler isolates an invalid stored timezone and continues with later lockers', async () => {
  const now = Date.parse('2026-08-10T14:00:00.000Z');
  const data = new MemoryPhase3Data(now);
  data.settings.set('LOCKER-BAD', {
    locker_id: 'LOCKER-BAD', email_enabled: true, email_address: 'bad@example.test',
    report_time: '21:00', timezone: 'Not/A_Real_Timezone',
  });
  await data.saveSettings(LOCKER_A, {
    email_enabled: true, email_address: 'owner@example.test',
    report_time: '21:00', timezone: 'Asia/Ho_Chi_Minh',
  });
  const sent = [];
  const email = new EmailAdapter({ from: 'locker@example.test',
    transport: { async sendMail(message) { sent.push(message); return { messageId: 'mail-1' }; } } });
  const { runtime } = makeRuntime({ runtimeOptions: { data, email, now: () => now } });

  const results = await runtime.runDailyReports();

  assert.deepEqual(results.map((result) => [result.locker_id, result.code || result.status]), [
    ['LOCKER-BAD', 'INVALID_TIMEZONE'],
    [LOCKER_A, 'delivered'],
  ]);
  assert.equal(sent.length, 1);
});

test('scheduler retries a definite email failure without losing the daily report', async () => {
  let now = Date.parse('2026-08-10T14:00:00.000Z');
  const data = new MemoryPhase3Data(now);
  data.now = () => now;
  await data.saveSettings(LOCKER_A, {
    email_enabled: true, email_address: 'owner@example.test',
    report_time: '21:00', timezone: 'Asia/Ho_Chi_Minh',
  });
  let attempts = 0;
  const email = new EmailAdapter({ from: 'locker@example.test', transport: {
    async sendMail() {
      attempts += 1;
      if (attempts === 1) throw Object.assign(new Error('temporary provider failure'), {
        code: 'EMAIL_TEMPORARY', responseCode: 451,
      });
      return { messageId: 'mail-retry' };
    },
  } });
  const { runtime } = makeRuntime({ runtimeOptions: { data, email, now: () => now } });

  const first = await runtime.runDailyReports();
  now += 60_000;
  const second = await runtime.runDailyReports();

  assert.equal(first[0].code, 'EMAIL_TEMPORARY');
  assert.equal(second[0].status, 'delivered');
  assert.equal(attempts, 2);
  assert.equal([...data.deliveries.values()][0].attempts, 2);
});

test('equivalent timezone aliases cannot send the same local report date twice', async () => {
  const now = Date.parse('2026-08-10T14:00:00.000Z');
  const data = new MemoryPhase3Data(now);
  await data.saveSettings(LOCKER_A, {
    email_enabled: true, email_address: 'owner@example.test',
    report_time: '21:00', timezone: 'Asia/Ho_Chi_Minh',
  });
  const sent = [];
  const email = new EmailAdapter({ from: 'locker@example.test', transport: {
    async sendMail(message) { sent.push(message); return { messageId: `mail-${sent.length}` }; },
  } });
  const { runtime } = makeRuntime({ runtimeOptions: { data, email, now: () => now } });

  const first = await runtime.runDailyReports();
  await data.saveSettings(LOCKER_A, {
    email_enabled: true, email_address: 'owner@example.test',
    report_time: '21:00', timezone: 'Asia/Saigon',
  });
  const second = await runtime.runDailyReports();

  assert.equal(first[0].status, 'delivered');
  assert.equal(second[0].status, 'duplicate_suppressed');
  assert.equal(sent.length, 1);
});

test('scheduler catches up after the configured minute instead of losing a report on restart', async () => {
  const now = Date.parse('2026-08-10T14:07:00.000Z'); // 21:07, report was due at 21:00
  const data = new MemoryPhase3Data(now);
  await data.saveSettings(LOCKER_A, {
    email_enabled: true, email_address: 'owner@example.test',
    report_time: '21:00', timezone: 'Asia/Ho_Chi_Minh',
  });
  const sent = [];
  const email = new EmailAdapter({ from: 'locker@example.test', transport: {
    async sendMail(message) { sent.push(message); return { messageId: 'mail-catch-up' }; },
  } });
  const { runtime } = makeRuntime({ runtimeOptions: { data, email, now: () => now } });

  const result = await runtime.runDailyReports();

  assert.equal(result[0].status, 'delivered');
  assert.equal(sent.length, 1);
});

test('stale pre-send reservation is safely reclaimed, but stale sending is never resent', async () => {
  const now = Date.parse('2026-08-10T14:10:00.000Z');
  const staleAt = new Date(now - 10 * 60_000).toISOString();
  const makeData = async (status) => {
    const data = new MemoryPhase3Data(now);
    await data.saveSettings(LOCKER_A, {
      email_enabled: true, email_address: 'owner@example.test',
      report_time: '21:00', timezone: 'Asia/Ho_Chi_Minh',
    });
    data.deliveries.set(`${LOCKER_A}:email:2026-08-09`, {
      id: 'delivery-stale', locker_id: LOCKER_A, report_key: '2026-08-09',
      report_date: '2026-08-09', status, attempts: 1, attempted_at: staleAt,
    });
    return data;
  };
  const sent = [];
  const email = new EmailAdapter({ from: 'locker@example.test', transport: {
    async sendMail(message) { sent.push(message); return { messageId: `mail-${sent.length}` }; },
  } });

  const pendingData = await makeData('pending');
  const { runtime: pendingRuntime } = makeRuntime({ runtimeOptions: { data: pendingData, email, now: () => now } });
  const reclaimed = await pendingRuntime.runDailyReports();
  assert.equal(reclaimed[0].status, 'delivered');
  assert.equal([...pendingData.deliveries.values()][0].attempts, 2);

  const sendingData = await makeData('sending');
  const { runtime: sendingRuntime } = makeRuntime({ runtimeOptions: { data: sendingData, email, now: () => now } });
  const ambiguous = await sendingRuntime.runDailyReports();
  assert.equal(ambiguous[0].status, 'delivery_unknown');
  assert.equal([...sendingData.deliveries.values()][0].status, 'delivery_unknown');
  assert.equal(sent.length, 1, 'only the safely reclaimed pending delivery may send');
});

test('ambiguous SMTP failure is recorded once and never retried automatically', async () => {
  let now = Date.parse('2026-08-10T14:00:00.000Z');
  const data = new MemoryPhase3Data(now);
  data.now = () => now;
  await data.saveSettings(LOCKER_A, {
    email_enabled: true, email_address: 'owner@example.test',
    report_time: '21:00', timezone: 'Asia/Ho_Chi_Minh',
  });
  let sendAttempts = 0;
  const email = new EmailAdapter({ from: 'locker@example.test', transport: {
    async sendMail() {
      sendAttempts += 1;
      throw Object.assign(new Error('socket closed after DATA'), { code: 'ETIMEDOUT' });
    },
  } });
  const { runtime } = makeRuntime({ runtimeOptions: { data, email, now: () => now } });

  const first = await runtime.runDailyReports();
  now += 10 * 60_000;
  const second = await runtime.runDailyReports();

  assert.equal(first[0].delivery_status, 'delivery_unknown');
  assert.equal(second[0].status, 'delivery_unknown');
  assert.equal(sendAttempts, 1);
  assert.equal([...data.deliveries.values()][0].status, 'delivery_unknown');
});

test('SMTP acceptance followed by a database completion failure is never double-sent', async () => {
  let now = Date.parse('2026-08-10T14:00:00.000Z');
  const data = new MemoryPhase3Data(now);
  data.now = () => now;
  await data.saveSettings(LOCKER_A, {
    email_enabled: true, email_address: 'owner@example.test',
    report_time: '21:00', timezone: 'Asia/Ho_Chi_Minh',
  });
  const originalComplete = data.completeDelivery.bind(data);
  let rejectDeliveredUpdate = true;
  data.completeDelivery = async (id, patch) => {
    if (patch.status === 'delivered' && rejectDeliveredUpdate) {
      rejectDeliveredUpdate = false;
      throw Object.assign(new Error('database unavailable'), { code: 'DATA_UNAVAILABLE' });
    }
    return originalComplete(id, patch);
  };
  let sendAttempts = 0;
  const email = new EmailAdapter({ from: 'locker@example.test', transport: {
    async sendMail() {
      sendAttempts += 1;
      return { messageId: 'mail-accepted' };
    },
  } });
  const { runtime } = makeRuntime({ runtimeOptions: { data, email, now: () => now } });

  const first = await runtime.runDailyReports();
  now += 10 * 60_000;
  const second = await runtime.runDailyReports();

  assert.equal(first[0].code, 'DATA_UNAVAILABLE');
  assert.equal(first[0].delivery_status, 'delivery_unknown');
  assert.equal(second[0].status, 'delivery_unknown');
  assert.equal(sendAttempts, 1);
  assert.equal([...data.deliveries.values()][0].status, 'delivery_unknown');
});

test('definite failures stop after the bounded delivery attempt limit', async () => {
  let now = Date.parse('2026-08-10T14:00:00.000Z');
  const data = new MemoryPhase3Data(now);
  data.now = () => now;
  await data.saveSettings(LOCKER_A, {
    email_enabled: true, email_address: 'owner@example.test',
    report_time: '21:00', timezone: 'Asia/Ho_Chi_Minh',
  });
  let sendAttempts = 0;
  const email = new EmailAdapter({ from: 'locker@example.test', transport: {
    async sendMail() {
      sendAttempts += 1;
      throw Object.assign(new Error('mailbox unavailable'), { code: 'EENVELOPE', responseCode: 451 });
    },
  } });
  const { runtime } = makeRuntime({ runtimeOptions: { data, email, now: () => now,
    deliveryRetryDelayMs: 60_000, deliveryMaxAttempts: 3 } });

  const outcomes = [];
  for (let attempt = 0; attempt < 4; attempt += 1) {
    outcomes.push((await runtime.runDailyReports())[0]);
    now += 60_000;
  }

  assert.deepEqual(outcomes.slice(0, 3).map((result) => result.delivery_status),
    ['failed', 'failed', 'failed']);
  assert.equal(outcomes[3].status, 'retry_exhausted');
  assert.equal(sendAttempts, 3);
  assert.equal([...data.deliveries.values()][0].attempts, 3);
});

test('EmailAdapter classifies provider ambiguity without exposing provider messages', async () => {
  const email = new EmailAdapter({ from: 'locker@example.test', transport: {
    async sendMail() {
      throw Object.assign(new Error('private provider diagnostic'), { code: 'ETIMEDOUT' });
    },
  } });

  await assert.rejects(email.send({ to: 'owner@example.test', subject: 'test', text: 'test' }),
    (error) => error.code === 'ETIMEDOUT'
      && error.deliveryOutcome === 'unknown'
      && error.message === 'Email delivery failed'
      && !error.message.includes('private provider diagnostic'));

  const invalidCodeEmail = new EmailAdapter({ from: 'locker@example.test', transport: {
    async sendMail() {
      throw Object.assign(new Error('private provider diagnostic'), { code: `SECRET-${'X'.repeat(128)}` });
    },
  } });
  await assert.rejects(invalidCodeEmail.send({ to: 'owner@example.test', subject: 'test', text: 'test' }),
    (error) => error.code === 'EMAIL_PROVIDER_FAILED'
      && error.deliveryOutcome === 'unknown'
      && error.message === 'Email delivery failed');
});

test('Supabase delivery adapter uses the backend RPC and state-guarded transitions', async () => {
  const requests = [];
  const responses = [
    [{ id: 'delivery-1', status: 'pending', attempts: 1, report_date: '2026-08-09' }],
    [{ id: 'delivery-1', status: 'sending' }],
    [{ id: 'delivery-1', status: 'delivered' }],
  ];
  const adapter = new SupabaseDataAdapter({
    url: 'https://example.supabase.co', serviceRoleKey: 'test-service-role',
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return { ok: true, status: 200, async text() { return JSON.stringify(responses.shift()); } };
    },
  });
  const attemptedAt = '2026-08-10T14:00:00.000Z';
  const reservation = await adapter.reserveDelivery({
    lockerId: LOCKER_A, reportDate: '2026-08-09', attemptedAt,
    retryBefore: '2026-08-10T13:59:00.000Z',
    stalePendingBefore: '2026-08-10T13:55:00.000Z', maxAttempts: 3,
  });
  await adapter.beginDelivery(reservation.id, attemptedAt);
  await adapter.completeDelivery(reservation.id, { status: 'delivered', sentAt: attemptedAt });

  assert.equal(reservation.claimed, true);
  assert.match(requests[0].url, /\/rest\/v1\/rpc\/reserve_notification_delivery$/);
  assert.deepEqual(JSON.parse(requests[0].options.body), {
    p_locker_id: LOCKER_A, p_channel: 'email', p_report_date: '2026-08-09',
    p_attempted_at: attemptedAt, p_retry_before: '2026-08-10T13:59:00.000Z',
    p_stale_pending_before: '2026-08-10T13:55:00.000Z', p_max_attempts: 3,
  });
  assert.match(decodeURIComponent(requests[1].url), /status=eq.pending/);
  assert.deepEqual(JSON.parse(requests[1].options.body), {
    status: 'sending', attempted_at: attemptedAt,
  });
  assert.match(decodeURIComponent(requests[2].url), /status=eq.sending/);
});

test('Phase 3 protected history, chart, and settings preserve ownership gate', async () => {
  const now = Date.parse('2026-08-10T03:00:00.000Z');
  const data = new MemoryPhase3Data(now);
  const { runtime } = makeRuntime({ runtimeOptions: { data, now: () => now } });
  const denied = await runtime.protectedHistory({ headers: headers('token-b'), lockerId: LOCKER_A });
  assert.equal(denied.status, 403);

  const saved = await runtime.protectedSettings({ headers: headers(), lockerId: LOCKER_A,
    body: { email_enabled: true, email_address: 'owner@example.test', report_time: '21:00',
      timezone: 'America/New_York' } });
  assert.equal(saved.ok, true);
  const history = await runtime.protectedHistory({ headers: headers(), lockerId: LOCKER_A, days: 7 });
  const chart = await runtime.protectedChart({ headers: headers(), lockerId: LOCKER_A, days: 30 });
  assert.equal(history.ok, true, JSON.stringify(history));
  assert.equal(chart.ok, true, JSON.stringify(chart));
  assert.equal(history.timezone, 'America/New_York');
  assert.equal(chart.timezone, 'America/New_York');
  assert.equal(chart.buckets.length, 30);
});
