'use strict';

const { calendarRange, validTimezone } = require('./report-time');
const { aggregateChart } = require('./statistics');

const EVENT_TYPES = new Set([
  'DOOR_OPENED', 'DOOR_CLOSED', 'DOOR_UNKNOWN', 'LOCK_COMMAND', 'UNLOCK_COMMAND',
  'LOCK_STATE_CHANGED', 'ALARM_STARTED', 'ALARM_STOPPED', 'LED_TURNED_ON',
  'LED_TURNED_OFF', 'DEVICE_ONLINE', 'DEVICE_OFFLINE', 'UNAUTHORIZED_OPEN',
  'COMMAND_REJECTED', 'COMMAND_TIMEOUT', 'TELEGRAM_NOTIFICATION', 'DAILY_EMAIL_REPORT',
]);

function dataError(code, message, status = 503) {
  return Object.assign(new Error(message), { code, status });
}

function safeDays(value, fallback = 7) {
  const parsed = Number(value);
  return [7, 30].includes(parsed) ? parsed : fallback;
}

function validateSetting(input, defaultTimezone = 'Asia/Ho_Chi_Minh') {
  const timezone = String(input?.timezone || defaultTimezone);
  const reportTime = String(input?.report_time || '21:00');
  const email = String(input?.email_address || '').trim();
  const telegramChatId = input?.telegram_chat_id == null ? null : String(input.telegram_chat_id).trim();
  if (!validTimezone(timezone)) throw dataError('INVALID_TIMEZONE', 'Timezone is invalid', 400);
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(reportTime)) {
    throw dataError('INVALID_REPORT_TIME', 'Report time must use HH:MM', 400);
  }
  if (input?.email_enabled && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254)) {
    throw dataError('INVALID_EMAIL', 'Email address is invalid', 400);
  }
  if (telegramChatId && telegramChatId.length > 128) {
    throw dataError('INVALID_TELEGRAM_CHAT', 'Telegram destination is invalid', 400);
  }
  return {
    telegram_enabled: Boolean(input?.telegram_enabled),
    telegram_chat_id: telegramChatId || null,
    email_enabled: Boolean(input?.email_enabled),
    email_address: email || null,
    report_time: reportTime,
    timezone,
  };
}

function eventRow(event) {
  if (!event || event.schema_version !== 1 || !EVENT_TYPES.has(event.event_type)
      || typeof event.event_id !== 'string' || typeof event.locker_id !== 'string') {
    throw dataError('INVALID_EVENT', 'Normalized event is invalid', 400);
  }
  return {
    event_id: event.event_id,
    schema_version: event.schema_version,
    locker_id: event.locker_id,
    event_type: event.event_type,
    device: event.device,
    action: event.action,
    source: event.source,
    result: event.result,
    authorized: event.authorized,
    command_id: event.command_id,
    device_state: event.device_state,
    error: event.error,
    principal: event.principal,
    notification_status: event.notification_status,
    metadata: event.metadata || {},
    occurred_at: event.occurred_at,
    recorded_at: event.recorded_at,
  };
}

class SupabaseDataAdapter {
  constructor({ url, serviceRoleKey, fetchImpl = globalThis.fetch, timezone = 'Asia/Ho_Chi_Minh',
    now = Date.now, timeoutMs = 8000 } = {}) {
    this.url = String(url || '').replace(/\/$/, '');
    this.serviceRoleKey = serviceRoleKey;
    this.fetch = fetchImpl;
    this.timezone = timezone;
    this.now = now;
    this.timeoutMs = timeoutMs;
  }

  configured() { return Boolean(this.url && this.serviceRoleKey && this.fetch); }

  async request(path, options = {}) {
    if (!this.configured()) throw dataError('DATA_NOT_CONFIGURED', 'Supabase data adapter is not configured');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetch(`${this.url}${path}`, {
        ...options,
        signal: controller.signal,
        headers: {
          apikey: this.serviceRoleKey,
          Authorization: `Bearer ${this.serviceRoleKey}`,
          'Content-Type': 'application/json',
          ...(options.headers || {}),
        },
      });
      if (!response?.ok) {
        throw dataError(`DATA_HTTP_${response?.status || 0}`, 'Supabase data request failed',
          response?.status >= 400 && response.status < 500 ? response.status : 503);
      }
      if (response.status === 204) return null;
      const text = await response.text();
      return text ? JSON.parse(text) : null;
    } catch (error) {
      if (error?.code) throw error;
      throw dataError(controller.signal.aborted ? 'DATA_TIMEOUT' : 'DATA_UNAVAILABLE',
        'Supabase data service is unavailable');
    } finally {
      clearTimeout(timer);
    }
  }

  async persist(event) {
    const rows = await this.request('/rest/v1/device_events', {
      method: 'POST',
      headers: { Prefer: 'resolution=ignore-duplicates,return=representation' },
      body: JSON.stringify(eventRow(event)),
    });
    return { inserted: Array.isArray(rows) && rows.length === 1, duplicate: Array.isArray(rows) && rows.length === 0 };
  }

  async events(lockerId, { from, to, limit = 100, eventTypes = [] } = {}) {
    const query = new URLSearchParams({
      select: 'event_id,event_type,device,action,source,result,authorized,command_id,device_state,error,notification_status,metadata,occurred_at,recorded_at',
      locker_id: `eq.${lockerId}`,
      order: 'occurred_at.desc',
      limit: String(Math.min(Math.max(Number(limit) || 100, 1), 1000)),
    });
    if (from) query.set('occurred_at', `gte.${from}`);
    if (to) query.append('occurred_at', `lt.${to}`);
    if (eventTypes.length) query.set('event_type', `in.(${eventTypes.join(',')})`);
    const rows = await this.request(`/rest/v1/device_events?${query}`);
    if (!Array.isArray(rows)) throw dataError('DATA_INVALID_RESPONSE', 'Event query returned invalid data');
    return rows;
  }

  async history(lockerId, { days = 7, limit = 100, timezone = this.timezone } = {}) {
    const selectedDays = safeDays(days);
    const range = calendarRange(selectedDays, this.now(), timezone);
    const events = await this.events(lockerId, { ...range, limit });
    return { locker_id: lockerId, days: selectedDays, timezone,
      range: { from: range.from, to: range.to }, events };
  }

  async chart(lockerId, { days = 7, timezone = this.timezone } = {}) {
    const selectedDays = safeDays(days);
    const range = calendarRange(selectedDays, this.now(), timezone);
    const events = await this.events(lockerId, {
      ...range, limit: 1000, eventTypes: ['DOOR_OPENED', 'UNAUTHORIZED_OPEN'],
    });
    return aggregateChart(events, { days: selectedDays, now: this.now(), timezone });
  }

  async query(request) {
    const question = String(request.question || '').toLowerCase();
    const days = /hôm nay|today/.test(question) ? 1 : /7 ngày|7 days/.test(question) ? 7 : 30;
    const range = calendarRange(days, this.now(), this.timezone);
    const events = await this.events(request.locker_id, { ...range, limit: 1000 });
    return {
      schema_version: 1,
      request_id: request.request_id,
      locker_id: request.locker_id,
      range: { from: range.from, to: range.to },
      events,
      source: 'supabase-device-events-v1',
    };
  }

  async getSettings(lockerId) {
    const query = new URLSearchParams({ select: '*', locker_id: `eq.${lockerId}`, limit: '1' });
    const rows = await this.request(`/rest/v1/notification_settings?${query}`);
    return Array.isArray(rows) && rows[0] ? rows[0] : {
      locker_id: lockerId, telegram_enabled: false, telegram_chat_id: null,
      email_enabled: false, email_address: null, report_time: '21:00', timezone: this.timezone,
    };
  }

  async saveSettings(lockerId, input) {
    const setting = { locker_id: lockerId, ...validateSetting(input, this.timezone),
      updated_at: new Date(this.now()).toISOString() };
    const rows = await this.request('/rest/v1/notification_settings?on_conflict=locker_id', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify(setting),
    });
    if (!Array.isArray(rows) || rows.length !== 1) throw dataError('DATA_INVALID_RESPONSE', 'Settings save failed');
    return rows[0];
  }

  async enabledEmailSettings() {
    const rows = await this.request('/rest/v1/notification_settings?select=*&email_enabled=eq.true');
    if (!Array.isArray(rows)) throw dataError('DATA_INVALID_RESPONSE', 'Settings query failed');
    return rows;
  }

  async reserveDelivery({ lockerId, reportKey, attemptedAt }) {
    const rows = await this.request('/rest/v1/notification_deliveries', {
      method: 'POST',
      headers: { Prefer: 'resolution=ignore-duplicates,return=representation' },
      body: JSON.stringify({ locker_id: lockerId, channel: 'email', report_key: reportKey,
        status: 'pending', attempts: 1, attempted_at: attemptedAt }),
    });
    return Array.isArray(rows) && rows.length === 1 ? rows[0] : null;
  }

  async completeDelivery(id, { status, sentAt = null, error = null }) {
    const query = new URLSearchParams({ id: `eq.${id}` });
    const rows = await this.request(`/rest/v1/notification_deliveries?${query}`, {
      method: 'PATCH', headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ status, sent_at: sentAt, error }),
    });
    return Array.isArray(rows) ? rows[0] : null;
  }
}

module.exports = {
  EVENT_TYPES, safeDays, validateSetting, eventRow, SupabaseDataAdapter,
};
