'use strict';

const { randomUUID } = require('node:crypto');
const { validateAck, validateAvailability, validateDoor, validateState } = require('./contracts');
const { LiveStateCache } = require('./live-state');
const { CommandDispatcher, domain } = require('./dispatcher');
const { UnauthorizedDetector } = require('./security');
const { SupabaseAuthAdapter, AuthGate } = require('./auth');
const { TelegramAdapter, telegramHttpTransport } = require('./telegram');
const { GeminiAdapter, ChatbotRouter } = require('./chatbot');
const { dashboardState } = require('./dashboard-state');
const { normalizedEvent } = require('./events');
const { SupabaseDataAdapter } = require('./data');
const { aggregateDailyReport } = require('./statistics');
const { localTime, previousDayRange } = require('./report-time');
const { EmailAdapter, createSmtpTransport, renderDailyEmail } = require('./email');

function positiveInteger(value, fallback) {
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function pushBounded(items, value, limit) {
  items.push(value);
  if (items.length > limit) items.splice(0, items.length - limit);
}

class Phase2Runtime {
  constructor({ authGate, publish, history, telegram, gemini = null, data = null,
    email = new EmailAdapter(), timezone = 'Asia/Ho_Chi_Minh',
    staleAfterMs = 30_000, timeoutMs = 5000, windowMs = 30_000,
    eventLimit = 256, notificationLimit = 128, diagnosticLimit = 128,
    commandStatusLimit = 64, now = Date.now, uuid = randomUUID }) {
    this.authGate = authGate;
    this.publish = publish;
    this.now = now;
    this.uuid = uuid;
    this.data = data;
    this.email = email;
    this.timezone = timezone;
    this.persistenceTasks = new Set();
    this.persistenceHealth = { status: data ? 'ready' : 'not_configured', last_error: null };
    this.events = [];
    this.notificationStatuses = [];
    this.diagnostics = [];
    this.commandStatus = new Map();
    this.eventLimit = positiveInteger(eventLimit, 256);
    this.notificationLimit = positiveInteger(notificationLimit, 128);
    this.diagnosticLimit = positiveInteger(diagnosticLimit, 128);
    this.commandStatusLimit = positiveInteger(commandStatusLimit, 64);
    this.cache = new LiveStateCache({ staleAfterMs });
    this.telegram = telegram;
    this.dispatcher = new CommandDispatcher({ cache: this.cache, publish, timeoutMs, now, uuid,
      onResult: (result) => {
        this.recordCommandStatus(result.pending.lockerId, {
          command_id: result.pending.commandId, action: result.pending.action,
          status: result.code, completed_at: new Date(this.now()).toISOString(),
        });
        this.detector?.onCommandResult(result);
        this.recordCommandEvent(result);
      } });
    this.detector = new UnauthorizedDetector({ windowMs, now, uuid,
      dispatchAlarm: (lockerId) => this.dispatcher.dispatchInternal({ lockerId, action: 'ALARM_ON' }),
      emit: (event) => this.emitEvent(event),
      notify: (event) => this.telegram.notify(event),
      notificationStatus: (status, sourceEvent) => {
        pushBounded(this.notificationStatuses, status, this.notificationLimit);
        this.recordNotificationEvent(status, sourceEvent);
      },
      latestAlert: (lockerId, event) => this.cache.setLatestAlert(lockerId, event),
    });
    this.chatbot = new ChatbotRouter({ cache: this.cache, history, provider: gemini, now, uuid });
  }

  trackPersistence(operation) {
    const task = Promise.resolve(operation).then((value) => {
      this.persistenceHealth = { status: 'ready', last_error: null };
      return value;
    }).catch((error) => {
      this.persistenceHealth = { status: 'error', last_error: error?.code || 'PERSISTENCE_FAILED' };
      pushBounded(this.diagnostics, {
        code: error?.code || 'PERSISTENCE_FAILED',
        observed_at: new Date(this.now()).toISOString(),
      }, this.diagnosticLimit);
      return null;
    }).finally(() => this.persistenceTasks.delete(task));
    this.persistenceTasks.add(task);
    return task;
  }

  async flushPersistence() {
    await Promise.all([...this.persistenceTasks]);
  }

  emitEvent(event) {
    pushBounded(this.events, event, this.eventLimit);
    if (this.data) this.trackPersistence(this.data.persist(event));
    return event;
  }

  recordCommandEvent(result) {
    const pending = result.pending;
    if (!pending) return;
    const successTypes = {
      LOCK: 'LOCK_COMMAND', UNLOCK: 'UNLOCK_COMMAND',
      ALARM_ON: 'ALARM_STARTED', ALARM_OFF: 'ALARM_STOPPED',
      LED_ON: 'LED_TURNED_ON', LED_OFF: 'LED_TURNED_OFF',
    };
    if (pending.action === 'GET_STATE') return;
    const eventType = result.code === 'COMMAND_TIMEOUT' ? 'COMMAND_TIMEOUT'
      : result.ok ? successTypes[pending.action] : 'COMMAND_REJECTED';
    const resultValue = result.code === 'COMMAND_TIMEOUT' ? 'timeout'
      : result.ok ? 'success' : result.ack?.result === 'error' ? 'failure' : 'rejected';
    const timestamp = new Date(this.now()).toISOString();
    const state = result.ack?.device_state || this.cache.snapshot(pending.lockerId, this.now()).state;
    this.emitEvent(normalizedEvent({
      eventType,
      lockerId: pending.lockerId,
      state,
      source: pending.caller === 'authenticated_user' ? 'dashboard' : 'automation',
      result: resultValue,
      commandId: pending.commandId,
      principal: pending.requestedBy,
      action: pending.action,
      occurredAt: result.ack?.timestamp || timestamp,
      recordedAt: timestamp,
      error: result.ok ? null : result.ack?.error || { code: result.code, message: 'Command did not complete successfully' },
      uuid: this.uuid,
    }));
  }

  recordNotificationEvent(status, sourceEvent) {
    if (!sourceEvent?.locker_id) return;
    const timestamp = status.attempted_at || new Date(this.now()).toISOString();
    this.emitEvent(normalizedEvent({
      eventType: 'TELEGRAM_NOTIFICATION', lockerId: sourceEvent.locker_id,
      state: sourceEvent.device_state, source: 'automation',
      result: status.status === 'delivered' ? 'success' : 'failure',
      occurredAt: timestamp, recordedAt: timestamp, uuid: this.uuid,
      metadata: { source_event_id: sourceEvent.event_id, attempts: status.attempts },
      notification: status.status,
      error: status.error || null,
    }));
  }

  restart() {
    this.cache.restart();
    this.dispatcher.restart();
    this.detector.restart();
    this.commandStatus.clear();
    this.events.length = 0;
    this.notificationStatuses.length = 0;
    this.diagnostics.length = 0;
    this.persistenceTasks.clear();
  }

  setMqttConnected(connected, lockerIds = []) {
    const next = Boolean(connected);
    const wasConnected = this.cache.mqttConnected;
    this.cache.setMqttConnected(next);
    const cancelled = !next && wasConnected ? this.dispatcher.cancelPending() : [];
    const bootstrap = next && !wasConnected
      ? [...new Set(lockerIds)].filter((lockerId) => typeof lockerId === 'string' && lockerId.length > 0)
        .map((lockerId) => this.dispatcher.dispatchInternal({ lockerId, action: 'GET_STATE' }))
      : [];
    return { connected: next, changed: next !== wasConnected, cancelled, bootstrap };
  }

  recordCommandStatus(lockerId, value) {
    if (this.commandStatus.has(lockerId)) this.commandStatus.delete(lockerId);
    this.commandStatus.set(lockerId, value);
    while (this.commandStatus.size > this.commandStatusLimit) {
      this.commandStatus.delete(this.commandStatus.keys().next().value);
    }
  }

  async ingest(topic, payload, observedAt = this.now()) {
    let validation;
    if (topic.endsWith('/availability')) validation = validateAvailability(topic, payload);
    else if (topic.endsWith('/state')) validation = validateState(topic, payload);
    else if (topic.endsWith('/telemetry/door')) validation = validateDoor(topic, payload);
    else if (topic.endsWith('/ack')) validation = validateAck(topic, payload);
    else validation = { ok: false, code: 'UNEXPECTED_TOPIC' };
    if (!validation.ok) {
      pushBounded(this.diagnostics,
        { code: validation.code, topic, observed_at: new Date(observedAt).toISOString() },
        this.diagnosticLimit);
      return { accepted: false, code: validation.code };
    }

    const { lockerId, value } = validation;
    if (topic.endsWith('/availability')) {
      this.cache.ingestAvailability(lockerId, value, observedAt);
      const timestamp = new Date(observedAt).toISOString();
      this.emitEvent(normalizedEvent({
        eventType: value.status === 'ONLINE' ? 'DEVICE_ONLINE' : 'DEVICE_OFFLINE',
        lockerId, state: this.cache.snapshot(lockerId, observedAt).state,
        source: 'system', result: 'observed', occurredAt: value.sent_at || timestamp,
        recordedAt: timestamp, uuid: this.uuid,
      }));
      return { accepted: true, type: 'availability' };
    }
    if (topic.endsWith('/state')) {
      const updated = this.cache.ingestState(lockerId, value, observedAt);
      return { accepted: updated, type: 'state', code: updated ? undefined : 'LATE_STATE' };
    }
    if (topic.endsWith('/ack')) {
      const result = this.dispatcher.processAck(value);
      if (result.ok) {
        this.cache.ingestState(lockerId, { ...value.device_state, timestamp: value.timestamp }, observedAt, 'mqtt:ack');
      }
      return { accepted: true, type: 'ack', result };
    }

    const before = this.cache.snapshot(lockerId, observedAt).state;
    const updated = this.cache.ingestDoor(lockerId, value, observedAt);
    if (!updated) return { accepted: false, code: 'LATE_DOOR' };
    const snapshot = this.cache.snapshot(lockerId, observedAt);
    const deviceState = { ...snapshot.state, door: value.state, lock: before.lock };
    const outputs = await this.detector.onDoor({ lockerId, previousState: value.previous_state,
      state: value.state, deviceState, occurredAt: value.timestamp,
      observedAt: new Date(observedAt).toISOString(), timeSynced: value.time_synced });
    return { accepted: true, type: 'door', outputs };
  }

  async protectedCommand({ headers, body, isAborted = () => false }) {
    if (isAborted()) return { ok: false, status: 499, code: 'REQUEST_ABORTED' };
    const authorization = await this.authGate.authorize(headers, body?.locker_id);
    if (!authorization.ok) return authorization;
    if (isAborted()) return { ok: false, status: 499, code: 'REQUEST_ABORTED' };
    const result = this.dispatcher.dispatchUser({ principal: authorization.principal,
      lockerId: body.locker_id, action: body.action });
    if (result.ok) this.recordCommandStatus(body.locker_id, { command_id: result.command.command_id,
      action: body.action, status: 'PENDING', completed_at: null });
    return result;
  }

  async protectedHistory({ headers, lockerId, days = 7, limit = 100 }) {
    const authorization = await this.authGate.authorize(headers, lockerId);
    if (!authorization.ok) return authorization;
    if (!this.data) return { ok: false, status: 503, code: 'DATA_NOT_CONFIGURED' };
    try {
      return { ok: true, status: 200, ...(await this.data.history(lockerId, { days, limit })) };
    } catch (error) {
      return { ok: false, status: error.status || 503, code: error.code || 'HISTORY_UNAVAILABLE' };
    }
  }

  async protectedChart({ headers, lockerId, days = 7 }) {
    const authorization = await this.authGate.authorize(headers, lockerId);
    if (!authorization.ok) return authorization;
    if (!this.data) return { ok: false, status: 503, code: 'DATA_NOT_CONFIGURED' };
    try {
      return { ok: true, status: 200, locker_id: lockerId,
        ...(await this.data.chart(lockerId, { days })) };
    } catch (error) {
      return { ok: false, status: error.status || 503, code: error.code || 'CHART_UNAVAILABLE' };
    }
  }

  async protectedSettings({ headers, lockerId, body = null }) {
    const authorization = await this.authGate.authorize(headers, lockerId);
    if (!authorization.ok) return authorization;
    if (!this.data) return { ok: false, status: 503, code: 'DATA_NOT_CONFIGURED' };
    try {
      const setting = body == null
        ? await this.data.getSettings(lockerId) : await this.data.saveSettings(lockerId, body);
      return { ok: true, status: 200, setting };
    } catch (error) {
      return { ok: false, status: error.status || 503, code: error.code || 'SETTINGS_UNAVAILABLE' };
    }
  }

  async runDailyReports() {
    if (!this.data) return [{ ok: false, code: 'DATA_NOT_CONFIGURED' }];
    let settings;
    try {
      settings = await this.data.enabledEmailSettings();
    } catch (error) {
      return [{ ok: false, code: error.code || 'SETTINGS_UNAVAILABLE' }];
    }
    const results = [];
    for (const setting of settings) {
      const timezone = setting.timezone || this.timezone;
      if (localTime(this.now(), timezone) !== String(setting.report_time).slice(0, 5)) continue;
      const range = previousDayRange(this.now(), timezone);
      const reportKey = `${range.reportDate}:${timezone}`;
      const attemptedAt = new Date(this.now()).toISOString();
      let reservation;
      try {
        reservation = await this.data.reserveDelivery({ lockerId: setting.locker_id, reportKey, attemptedAt });
      } catch (error) {
        results.push({ ok: false, locker_id: setting.locker_id, code: error.code || 'DELIVERY_RESERVE_FAILED' });
        continue;
      }
      if (!reservation) {
        results.push({ ok: true, locker_id: setting.locker_id, status: 'duplicate_suppressed' });
        continue;
      }
      try {
        const events = await this.data.events(setting.locker_id, { ...range, limit: 1000 });
        const report = aggregateDailyReport(events, { now: this.now(), timezone });
        const rendered = renderDailyEmail({ lockerId: setting.locker_id, report });
        await this.email.send({ to: setting.email_address, ...rendered });
        await this.data.completeDelivery(reservation.id, { status: 'delivered', sentAt: attemptedAt });
        this.emitEvent(normalizedEvent({
          eventType: 'DAILY_EMAIL_REPORT', lockerId: setting.locker_id,
          source: 'automation', result: 'success', occurredAt: attemptedAt,
          recordedAt: attemptedAt, uuid: this.uuid,
          metadata: { report_date: report.report_date, range: report.range,
            opens: report.opens, alerts: report.alerts },
          notification: 'delivered',
        }));
        results.push({ ok: true, locker_id: setting.locker_id, status: 'delivered', report });
      } catch (error) {
        let code = error.code || 'EMAIL_FAILED';
        try {
          await this.data.completeDelivery(reservation.id, { status: 'failed',
            error: { code, message: 'Email delivery failed' } });
        } catch (completionError) {
          code = completionError.code || 'DELIVERY_UPDATE_FAILED';
        }
        results.push({ ok: false, locker_id: setting.locker_id, code });
      }
    }
    return results;
  }

  async protectedChat({ headers, body }) {
    const authorization = await this.authGate.authorize(headers, body?.locker_id);
    if (!authorization.ok) return authorization;
    return this.chatbot.ask({ lockerId: body.locker_id, question: body.question,
      principalId: authorization.principal.id });
  }

  async protectedClaim({ headers, body }) {
    const authentication = await this.authGate.authenticate(headers);
    if (!authentication.ok) return authentication;
    try {
      return { ok: true, status: 200, locker: await this.authGate.adapter.claim(authentication.accessToken, body?.locker_code) };
    } catch (error) {
      const status = error.status === 401 ? 401 : error.status === 503 ? 503 : 409;
      const code = status === 401 ? 'INVALID_SESSION'
        : status === 503 ? 'CLAIM_UNAVAILABLE' : 'CLAIM_REJECTED';
      return { ok: false, status, code };
    }
  }

  uiState({ authenticated, ownsLocker, lockerId }) {
    const pendingDomains = [...this.dispatcher.pending.values()]
      .filter((item) => item.lockerId === lockerId).map((item) => domain(item.action));
    return { ...dashboardState({ authenticated, ownsLocker, snapshot: this.cache.snapshot(lockerId, this.now()), pendingDomains }),
      command_status: this.commandStatus.get(lockerId) || null,
      persistence: { ...this.persistenceHealth } };
  }
}

function requiredNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function createFromEnvironment({ env = process.env, publish = () => {}, history, data,
  fetchImpl = globalThis.fetch, nodemailerImpl = null, now = Date.now, uuid = randomUUID } = {}) {
  const adapter = new SupabaseAuthAdapter({ url: env.SUPABASE_URL, anonKey: env.SUPABASE_ANON_KEY, fetchImpl });
  const telegram = new TelegramAdapter({
    transport: telegramHttpTransport({ token: env.TELEGRAM_BOT_TOKEN, chatId: env.TELEGRAM_CHAT_ID, fetchImpl }),
    dashboardUrl: env.DASHBOARD_BASE_URL || 'http://localhost:1880/phase2',
    timezone: env.REPORT_TIMEZONE || 'Asia/Ho_Chi_Minh', now,
  });
  const gemini = env.GEMINI_API_KEY && env.GEMINI_MODEL
    ? new GeminiAdapter({ apiKey: env.GEMINI_API_KEY, model: env.GEMINI_MODEL, fetchImpl }) : null;
  const timezone = env.REPORT_TIMEZONE || 'Asia/Ho_Chi_Minh';
  const dataAdapter = data || (env.SUPABASE_SERVICE_ROLE_KEY ? new SupabaseDataAdapter({
    url: env.SUPABASE_URL, serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
    fetchImpl, timezone, now,
  }) : null);
  const smtpTransport = createSmtpTransport({ nodemailer: nodemailerImpl,
    host: env.GMAIL_SMTP_HOST, port: env.GMAIL_SMTP_PORT,
    user: env.GMAIL_SMTP_USER, password: env.GMAIL_APP_PASSWORD });
  const email = new EmailAdapter({ transport: smtpTransport, from: env.EMAIL_FROM || env.GMAIL_SMTP_USER });
  const historyAdapter = history || dataAdapter || { async query(request) {
    return { schema_version: 1, request_id: request.request_id, locker_id: request.locker_id,
      range: null, events: [], source: 'phase3-not-configured' };
  } };
  return new Phase2Runtime({ authGate: new AuthGate(adapter), publish, history: historyAdapter,
    telegram, gemini, data: dataAdapter, email, timezone, now, uuid,
    staleAfterMs: requiredNumber(env.DEVICE_STALE_AFTER_SECONDS, 30) * 1000,
    timeoutMs: requiredNumber(env.COMMAND_TIMEOUT_MS, 5000),
    windowMs: requiredNumber(env.AUTHORIZED_UNLOCK_WINDOW_SECONDS, 30) * 1000 });
}

module.exports = { Phase2Runtime, createFromEnvironment };
