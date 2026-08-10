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

  async history(lockerId, { days = 7, limit = 100 } = {}) {
    const range = calendarRange(Number(days), this.now(), 'Asia/Ho_Chi_Minh');
    return { locker_id: lockerId, days: Number(days), timezone: 'Asia/Ho_Chi_Minh',
      range: { from: range.from, to: range.to }, events: await this.events(lockerId, { ...range, limit }) };
  }

  async chart(lockerId, { days = 7 } = {}) {
    return aggregateChart(await this.events(lockerId, { limit: 1000 }), {
      days: Number(days), now: this.now(), timezone: 'Asia/Ho_Chi_Minh',
    });
  }

  async query(request) {
    const history = await this.history(request.locker_id, { days: 7, limit: 200 });
    return { schema_version: 1, request_id: request.request_id, locker_id: request.locker_id,
      range: history.range, events: history.events, source: 'memory-phase3' };
  }

  async getSettings(lockerId) {
    return this.settings.get(lockerId) || { locker_id: lockerId, email_enabled: false,
      email_address: null, telegram_enabled: false, telegram_chat_id: null,
      report_time: '21:00', timezone: 'Asia/Ho_Chi_Minh' };
  }

  async saveSettings(lockerId, input) {
    const value = { locker_id: lockerId, ...validateSetting(input) };
    this.settings.set(lockerId, value);
    return value;
  }

  async enabledEmailSettings() {
    return [...this.settings.values()].filter((setting) => setting.email_enabled);
  }

  async reserveDelivery({ lockerId, reportKey, attemptedAt }) {
    const key = `${lockerId}:email:${reportKey}`;
    if (this.deliveries.has(key)) return null;
    const row = { id: `delivery-${this.deliveries.size + 1}`, locker_id: lockerId,
      report_key: reportKey, status: 'pending', attempted_at: attemptedAt };
    this.deliveries.set(key, row);
    return row;
  }

  async completeDelivery(id, patch) {
    const row = [...this.deliveries.values()].find((item) => item.id === id);
    Object.assign(row, patch);
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
  const now = Date.parse('2026-08-10T14:00:00.000Z'); // 21:00 in Ho Chi Minh City
  const data = new MemoryPhase3Data(now);
  await data.saveSettings(LOCKER_A, { email_enabled: true, email_address: 'owner@example.test',
    report_time: '21:00', timezone: 'Asia/Ho_Chi_Minh' });
  data.rows.push({ event_id: '40000000-0000-4000-8000-000000000001', locker_id: LOCKER_A,
    event_type: 'DOOR_OPENED', occurred_at: '2026-08-10T01:00:00.000Z', result: 'observed' });
  const sent = [];
  const email = new EmailAdapter({ from: 'locker@example.test',
    transport: { async sendMail(message) { sent.push(message); return { messageId: 'mail-1' }; } } });
  const { runtime } = makeRuntime({ runtimeOptions: { data, email, now: () => now } });

  const first = await runtime.runDailyReports();
  const { runtime: restarted } = makeRuntime({ runtimeOptions: { data, email, now: () => now } });
  const second = await restarted.runDailyReports();
  await runtime.flushPersistence();

  assert.equal(first[0].status, 'delivered');
  assert.equal(second[0].status, 'duplicate_suppressed');
  assert.equal(sent.length, 1);
  assert.equal([...data.deliveries.values()][0].status, 'delivered');
  assert.equal(data.rows.filter((event) => event.event_type === 'DAILY_EMAIL_REPORT').length, 1);
});

test('Phase 3 protected history, chart, and settings preserve ownership gate', async () => {
  const now = Date.parse('2026-08-10T03:00:00.000Z');
  const data = new MemoryPhase3Data(now);
  const { runtime } = makeRuntime({ runtimeOptions: { data, now: () => now } });
  const denied = await runtime.protectedHistory({ headers: headers('token-b'), lockerId: LOCKER_A });
  assert.equal(denied.status, 403);

  const saved = await runtime.protectedSettings({ headers: headers(), lockerId: LOCKER_A,
    body: { email_enabled: true, email_address: 'owner@example.test', report_time: '21:00',
      timezone: 'Asia/Ho_Chi_Minh' } });
  assert.equal(saved.ok, true);
  const history = await runtime.protectedHistory({ headers: headers(), lockerId: LOCKER_A, days: 7 });
  const chart = await runtime.protectedChart({ headers: headers(), lockerId: LOCKER_A, days: 30 });
  assert.equal(history.ok, true, JSON.stringify(history));
  assert.equal(chart.ok, true, JSON.stringify(chart));
  assert.equal(chart.buckets.length, 30);
});
