'use strict';

const { calendarRange, validTimezone } = require('./report-time');
const { aggregateChart } = require('./statistics');

const EVENT_PAGE_SIZE = 1000;
const MAX_EVENT_PAGES = 100;

const PROVIDER_CONTRACT_ERRORS = new Map([
  ['INVALID_TELEGRAM_LINK_REQUEST', { status: 400, message: 'Telegram link request is invalid' }],
  ['INVALID_TELEGRAM_LINK_UPDATE', { status: 400, message: 'Telegram link update is invalid' }],
  ['TELEGRAM_LINK_INVALID_OR_EXPIRED', { status: 400, message: 'Telegram link is invalid or expired' }],
  ['LOCKER_FORBIDDEN', { status: 403, message: 'Locker access is forbidden' }],
  ['LOCKER_OWNERSHIP_CHANGED', { status: 403, message: 'Locker ownership changed' }],
  ['TELEGRAM_NOT_LINKED', { status: 409, message: 'Telegram is not linked for this locker' }],
]);

const EVENT_TYPES = new Set([
  'DOOR_OPENED', 'DOOR_CLOSED', 'DOOR_UNKNOWN', 'LOCK_COMMAND', 'UNLOCK_COMMAND',
  'LOCK_STATE_CHANGED', 'ALARM_STARTED', 'ALARM_STOPPED', 'LED_TURNED_ON',
  'LED_TURNED_OFF', 'DEVICE_ONLINE', 'DEVICE_OFFLINE', 'UNAUTHORIZED_OPEN',
  'COMMAND_REJECTED', 'COMMAND_TIMEOUT', 'TELEGRAM_NOTIFICATION', 'DAILY_EMAIL_REPORT',
]);

function dataError(code, message, status = 503) {
  return Object.assign(new Error(message), { code, status });
}

function providerContractError(text) {
  try {
    const payload = JSON.parse(text);
    const code = typeof payload?.message === 'string' ? payload.message : '';
    const contract = PROVIDER_CONTRACT_ERRORS.get(code);
    return contract ? dataError(code, contract.message, contract.status) : null;
  } catch {
    return null;
  }
}

function safeDays(value, fallback = 7) {
  const parsed = Number(value);
  return [7, 30].includes(parsed) ? parsed : fallback;
}

function validateSetting(input, defaultTimezone = 'Asia/Ho_Chi_Minh') {
  const timezone = String(input?.timezone || defaultTimezone);
  const reportTime = String(input?.report_time || '21:00');
  const email = String(input?.email_address || '').trim();
  if (!validTimezone(timezone)) throw dataError('INVALID_TIMEZONE', 'Timezone is invalid', 400);
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(reportTime)) {
    throw dataError('INVALID_REPORT_TIME', 'Report time must use HH:MM', 400);
  }
  if (input?.email_enabled && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254)) {
    throw dataError('INVALID_EMAIL', 'Email address is invalid', 400);
  }
  return {
    telegram_enabled: Boolean(input?.telegram_enabled),
    email_enabled: Boolean(input?.email_enabled),
    email_address: email || null,
    report_time: reportTime,
    timezone,
  };
}

function publicSetting(input = {}, lockerId = input.locker_id) {
  const linked = Boolean(input.telegram_chat_id && input.telegram_user_id && input.telegram_linked_at);
  return {
    locker_id: lockerId,
    telegram_enabled: linked && Boolean(input.telegram_enabled),
    telegram_connected: linked,
    telegram_username: linked ? input.telegram_username || null : null,
    telegram_linked_at: linked ? input.telegram_linked_at : null,
    email_enabled: Boolean(input.email_enabled),
    email_address: input.email_address || null,
    report_time: String(input.report_time || '21:00').slice(0, 5),
    timezone: input.timezone || 'Asia/Ho_Chi_Minh',
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
    this.timeoutMs = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 8000;
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
      const text = response?.status === 204 ? '' : await response.text();
      if (!response?.ok) {
        const contractError = providerContractError(text);
        if (contractError) throw contractError;
        throw dataError(`DATA_HTTP_${response?.status || 0}`, 'Supabase data request failed',
          response?.status >= 400 && response.status < 500 ? response.status : 503);
      }
      if (response.status === 204) return null;
      if (!text) return null;
      try {
        return JSON.parse(text);
      } catch {
        throw dataError('DATA_INVALID_RESPONSE', 'Supabase data service returned invalid JSON');
      }
    } catch (error) {
      if (typeof error?.code === 'string' && Number.isInteger(error?.status)) throw error;
      if (controller.signal.aborted) {
        throw dataError('DATA_TIMEOUT', 'Supabase data request timed out');
      }
      throw dataError('DATA_UNAVAILABLE', 'Supabase data service is unavailable');
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

  async events(lockerId, { from, to, limit = 100, offset = 0, eventTypes = [] } = {}) {
    const query = new URLSearchParams({
      select: 'event_id,event_type,device,action,source,result,authorized,command_id,device_state,error,notification_status,metadata,occurred_at,recorded_at',
      locker_id: `eq.${lockerId}`,
      order: 'occurred_at.desc,event_id.desc',
      limit: String(Math.min(Math.max(Number(limit) || 100, 1), 1000)),
      offset: String(Math.max(Number(offset) || 0, 0)),
    });
    if (from) query.set('occurred_at', `gte.${from}`);
    if (to) query.append('occurred_at', `lt.${to}`);
    if (eventTypes.length) query.set('event_type', `in.(${eventTypes.join(',')})`);
    const rows = await this.request(`/rest/v1/device_events?${query}`);
    if (!Array.isArray(rows)) throw dataError('DATA_INVALID_RESPONSE', 'Event query returned invalid data');
    return rows;
  }

  async allEvents(lockerId, options = {}) {
    const rows = [];
    const seenEventIds = new Set();
    for (let page = 0; page < MAX_EVENT_PAGES; page += 1) {
      const batch = await this.events(lockerId, {
        ...options,
        limit: EVENT_PAGE_SIZE,
        offset: page * EVENT_PAGE_SIZE,
      });
      for (const event of batch) {
        if (typeof event?.event_id !== 'string' || event.event_id.length === 0) {
          throw dataError('DATA_INVALID_RESPONSE', 'Event query returned an invalid event ID');
        }
        if (seenEventIds.has(event.event_id)) continue;
        seenEventIds.add(event.event_id);
        rows.push(event);
      }
      if (batch.length < EVENT_PAGE_SIZE) return rows;
    }
    throw dataError('EVENT_DATASET_TOO_LARGE',
      `Event query exceeded the ${EVENT_PAGE_SIZE * MAX_EVENT_PAGES} row safety limit`);
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
    const events = await this.allEvents(lockerId, {
      ...range, eventTypes: ['DOOR_OPENED', 'UNAUTHORIZED_OPEN'],
    });
    return aggregateChart(events, { days: selectedDays, now: this.now(), timezone });
  }

  async query(request) {
    const question = String(request.question || '').toLowerCase();
    const days = /hôm nay|today/.test(question) ? 1 : /7 ngày|7 days/.test(question) ? 7 : 30;
    const setting = await this.getSettings(request.locker_id);
    const timezone = String(setting?.timezone || this.timezone);
    if (!validTimezone(timezone)) {
      throw dataError('INVALID_TIMEZONE', 'Stored locker timezone is invalid');
    }
    const range = calendarRange(days, this.now(), timezone);
    const events = await this.allEvents(request.locker_id, range);
    return {
      schema_version: 1,
      request_id: request.request_id,
      locker_id: request.locker_id,
      timezone,
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
      telegram_user_id: null, telegram_username: null, telegram_linked_at: null,
      email_enabled: false, email_address: null, report_time: '21:00', timezone: this.timezone,
    };
  }

  async saveSettings(lockerId, ownerId, input) {
    const setting = validateSetting(input, this.timezone);
    const rows = await this.request('/rest/v1/rpc/update_notification_preferences', {
      method: 'POST',
      body: JSON.stringify({
        p_locker_id: lockerId,
        p_owner_id: ownerId,
        p_telegram_enabled: setting.telegram_enabled,
        p_email_enabled: setting.email_enabled,
        p_email_address: setting.email_address,
        p_report_time: setting.report_time,
        p_timezone: setting.timezone,
      }),
    });
    if (!Array.isArray(rows) || rows.length !== 1) throw dataError('DATA_INVALID_RESPONSE', 'Settings save failed');
    return rows[0];
  }

  async issueTelegramLink(lockerId, ownerId, tokenHash) {
    const rows = await this.request('/rest/v1/rpc/issue_telegram_link', {
      method: 'POST',
      body: JSON.stringify({ p_locker_id: lockerId, p_owner_id: ownerId, p_token_hash: tokenHash }),
    });
    if (!Array.isArray(rows) || rows.length !== 1 || !rows[0]?.expires_at) {
      throw dataError('DATA_INVALID_RESPONSE', 'Telegram link issue failed');
    }
    return rows[0];
  }

  async consumeTelegramLink({ tokenHash, chatId, userId, username }) {
    const rows = await this.request('/rest/v1/rpc/consume_telegram_link', {
      method: 'POST',
      body: JSON.stringify({
        p_token_hash: tokenHash,
        p_chat_id: chatId,
        p_telegram_user_id: userId,
        p_username: username,
      }),
    });
    if (!Array.isArray(rows) || rows.length !== 1 || !rows[0]?.locker_id) {
      throw dataError('DATA_INVALID_RESPONSE', 'Telegram link consume failed');
    }
    return rows[0];
  }

  async disconnectTelegram(lockerId, ownerId) {
    const rows = await this.request('/rest/v1/rpc/disconnect_telegram', {
      method: 'POST', body: JSON.stringify({ p_locker_id: lockerId, p_owner_id: ownerId }),
    });
    return Array.isArray(rows) && rows.length === 1 ? rows[0] : this.getSettings(lockerId);
  }

  async enabledEmailSettings() {
    const rows = [];
    for (let page = 0; page < MAX_EVENT_PAGES; page += 1) {
      const query = new URLSearchParams({
        select: '*',
        email_enabled: 'eq.true',
        order: 'locker_id.asc',
        limit: String(EVENT_PAGE_SIZE),
        offset: String(page * EVENT_PAGE_SIZE),
      });
      const batch = await this.request(`/rest/v1/notification_settings?${query}`);
      if (!Array.isArray(batch)) throw dataError('DATA_INVALID_RESPONSE', 'Settings query failed');
      rows.push(...batch);
      if (batch.length < EVENT_PAGE_SIZE) return rows;
    }
    throw dataError('SETTINGS_DATASET_TOO_LARGE',
      `Settings query exceeded the ${EVENT_PAGE_SIZE * MAX_EVENT_PAGES} row safety limit`);
  }

  async reserveDelivery({ lockerId, reportDate, attemptedAt, retryBefore,
    stalePendingBefore, maxAttempts = 3 }) {
    const rows = await this.request('/rest/v1/rpc/reserve_notification_delivery', {
      method: 'POST',
      body: JSON.stringify({
        p_locker_id: lockerId,
        p_channel: 'email',
        p_report_date: reportDate,
        p_attempted_at: attemptedAt,
        p_retry_before: retryBefore,
        p_stale_pending_before: stalePendingBefore,
        p_max_attempts: maxAttempts,
      }),
    });
    if (Array.isArray(rows) && rows.length === 1) return { ...rows[0], claimed: true };
    const query = new URLSearchParams({
      select: 'id,status,attempts,attempted_at,report_date',
      locker_id: `eq.${lockerId}`,
      channel: 'eq.email',
      report_date: `eq.${reportDate}`,
      limit: '1',
    });
    const existing = await this.request(`/rest/v1/notification_deliveries?${query}`);
    return Array.isArray(existing) && existing.length === 1
      ? { ...existing[0], claimed: false } : null;
  }

  async beginDelivery(id, attemptedAt) {
    const query = new URLSearchParams({ id: `eq.${id}`, status: 'eq.pending' });
    const rows = await this.request(`/rest/v1/notification_deliveries?${query}`, {
      method: 'PATCH', headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ status: 'sending', attempted_at: attemptedAt }),
    });
    return Array.isArray(rows) && rows.length === 1 ? rows[0] : null;
  }

  async completeDelivery(id, { status, sentAt = null, error = null }) {
    const allowed = new Set(['delivered', 'failed', 'delivery_unknown']);
    if (!allowed.has(status)) throw dataError('INVALID_DELIVERY_STATUS', 'Delivery status is invalid', 400);
    const expectedStatuses = status === 'failed' ? 'in.(pending,sending)' : 'eq.sending';
    const query = new URLSearchParams({ id: `eq.${id}`, status: expectedStatuses });
    const rows = await this.request(`/rest/v1/notification_deliveries?${query}`, {
      method: 'PATCH', headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ status, sent_at: sentAt, error }),
    });
    return Array.isArray(rows) && rows.length === 1 ? rows[0] : null;
  }
}

module.exports = {
  EVENT_TYPES, EVENT_PAGE_SIZE, MAX_EVENT_PAGES,
  safeDays, validateSetting, publicSetting, eventRow, SupabaseDataAdapter,
};
