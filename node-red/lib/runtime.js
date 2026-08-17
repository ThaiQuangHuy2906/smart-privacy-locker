'use strict';

const { createHash, randomUUID } = require('node:crypto');
const { validateAck, validateAvailability, validateDoor, validateHeartbeat,
  validateState } = require('./contracts');
const { LiveStateCache } = require('./live-state');
const { CommandDispatcher, domain } = require('./dispatcher');
const { UnauthorizedDetector } = require('./security');
const { SupabaseAuthAdapter, AuthGate } = require('./auth');
const { TelegramAdapter, telegramHttpTransport } = require('./telegram');
const { buildTelegramLink, generateLinkToken, hashLinkToken,
  parseTelegramPrivateCommand, parseTelegramStart, webhookSecretMatches } = require('./telegram-link');
const { GeminiAdapter, ChatbotRouter } = require('./chatbot');
const { dashboardState } = require('./dashboard-state');
const { normalizedEvent } = require('./events');
const { SupabaseDataAdapter, publicSetting } = require('./data');
const { aggregateDailyReport } = require('./statistics');
const { localTime, previousDayRange, validTimezone } = require('./report-time');
const { EmailAdapter, createSmtpTransport, renderDailyEmail } = require('./email');

const FINAL_TELEGRAM_LINK_ERRORS = new Set([
  'TELEGRAM_LINK_INVALID_OR_EXPIRED',
  'LOCKER_OWNERSHIP_CHANGED',
]);

function positiveInteger(value, fallback) {
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function pushBounded(items, value, limit) {
  items.push(value);
  if (items.length > limit) items.splice(0, items.length - limit);
}

function dailyMessageId(lockerId, reportDate) {
  const digest = createHash('sha256').update(`${lockerId}:${reportDate}`).digest('hex').slice(0, 32);
  return `<daily-${digest}@smart-privacy-locker.local>`;
}

function availabilityEventId(lockerId, status, sentAt) {
  const canonicalSentAt = new Date(sentAt).toISOString();
  const bytes = createHash('sha256')
    .update(`availability-v1\0${lockerId}\0${status}\0${canonicalSentAt}`)
    .digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x80;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

class Phase2Runtime {
  constructor({ authGate, publish, history, telegram, gemini = null, data = null,
    email = new EmailAdapter(), timezone = 'Asia/Ho_Chi_Minh',
    telegramBotUsername = '', telegramWebhookSecret = '', linkTokenFactory = generateLinkToken,
    staleAfterMs = 30_000, timeoutMs = 5000, windowMs = 30_000,
    eventLimit = 256, notificationLimit = 128, diagnosticLimit = 128,
    commandStatusLimit = 64, deliveryRetryDelayMs = 60_000,
    deliveryPendingLeaseMs = 5 * 60_000, deliveryMaxAttempts = 3,
    now = Date.now, uuid = randomUUID }) {
    this.authGate = authGate;
    this.publish = publish;
    this.now = now;
    this.uuid = uuid;
    this.data = data;
    this.email = email;
    this.timezone = timezone;
    this.deliveryRetryDelayMs = positiveInteger(deliveryRetryDelayMs, 60_000);
    this.deliveryPendingLeaseMs = positiveInteger(deliveryPendingLeaseMs, 5 * 60_000);
    this.deliveryMaxAttempts = Math.min(positiveInteger(deliveryMaxAttempts, 3), 3);
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
    this.telegramBotUsername = telegramBotUsername;
    this.telegramWebhookSecret = telegramWebhookSecret;
    this.linkTokenFactory = linkTokenFactory;
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
      notify: (event) => this.notifyTelegram(event),
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
    else if (topic.endsWith('/heartbeat')) validation = validateHeartbeat(topic, payload);
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
      const updated = this.cache.ingestAvailability(lockerId, value, observedAt);
      if (!updated) {
        pushBounded(this.diagnostics,
          { code: 'LATE_AVAILABILITY', topic, observed_at: new Date(observedAt).toISOString() },
          this.diagnosticLimit);
        return { accepted: false, type: 'availability', code: 'LATE_AVAILABILITY' };
      }
      if (!value.sent_at) {
        return { accepted: true, type: 'availability', persisted: false };
      }
      const timestamp = new Date(observedAt).toISOString();
      const stableId = availabilityEventId(lockerId, value.status, value.sent_at);
      this.emitEvent(normalizedEvent({
        eventType: value.status === 'ONLINE' ? 'DEVICE_ONLINE' : 'DEVICE_OFFLINE',
        lockerId, state: this.cache.snapshot(lockerId, observedAt).state,
        source: 'system', result: 'observed', occurredAt: value.sent_at,
        recordedAt: timestamp, uuid: () => stableId,
      }));
      return { accepted: true, type: 'availability', persisted: true };
    }
    if (topic.endsWith('/heartbeat')) {
      const updated = this.cache.ingestHeartbeat(lockerId, observedAt);
      if (!updated) {
        const code = 'HEARTBEAT_WITHOUT_CURRENT_ONLINE';
        pushBounded(this.diagnostics,
          { code, topic, observed_at: new Date(observedAt).toISOString() },
          this.diagnosticLimit);
        return { accepted: false, type: 'heartbeat', code };
      }
      return { accepted: true, type: 'heartbeat', persisted: false };
    }
    if (topic.endsWith('/state')) {
      const updated = this.cache.ingestState(lockerId, value, observedAt);
      return { accepted: updated, type: 'state', code: updated ? undefined : 'LATE_STATE' };
    }
    if (topic.endsWith('/ack')) {
      const result = this.dispatcher.processAck(value);
      const correlated = Boolean(result.pending);
      if (correlated) {
        this.cache.ingestState(lockerId, { ...value.device_state, timestamp: value.timestamp }, observedAt, 'mqtt:ack');
      } else {
        pushBounded(this.diagnostics, {
          code: result.code,
          topic,
          locker_id: lockerId,
          command_id: value.command_id,
          observed_at: new Date(observedAt).toISOString(),
        }, this.diagnosticLimit);
      }
      return { accepted: correlated, type: 'ack',
        code: correlated ? undefined : result.code, result };
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
      const setting = await this.data.getSettings(lockerId);
      const timezone = String(setting?.timezone || this.timezone);
      if (!validTimezone(timezone)) {
        return { ok: false, status: 503, code: 'INVALID_TIMEZONE' };
      }
      return { ok: true, status: 200,
        ...(await this.data.history(lockerId, { days, limit, timezone })) };
    } catch (error) {
      return { ok: false, status: error.status || 503, code: error.code || 'HISTORY_UNAVAILABLE' };
    }
  }

  async protectedChart({ headers, lockerId, days = 7 }) {
    const authorization = await this.authGate.authorize(headers, lockerId);
    if (!authorization.ok) return authorization;
    if (!this.data) return { ok: false, status: 503, code: 'DATA_NOT_CONFIGURED' };
    try {
      const setting = await this.data.getSettings(lockerId);
      const timezone = String(setting?.timezone || this.timezone);
      if (!validTimezone(timezone)) {
        return { ok: false, status: 503, code: 'INVALID_TIMEZONE' };
      }
      return { ok: true, status: 200, locker_id: lockerId,
        ...(await this.data.chart(lockerId, { days, timezone })) };
    } catch (error) {
      return { ok: false, status: error.status || 503, code: error.code || 'CHART_UNAVAILABLE' };
    }
  }

  async notifyTelegram(event) {
    if (!this.data) {
      return this.telegram.notify(event, {});
    }
    try {
      const setting = await this.data.getSettings(event.locker_id);
      if (!setting?.telegram_enabled) return this.telegram.notify(event, {});
      return this.telegram.notify(event, setting);
    } catch (error) {
      return {
        schema_version: 1,
        event_id: event.event_id,
        channel: 'telegram',
        status: 'failed',
        attempts: 0,
        attempted_at: new Date(this.now()).toISOString(),
        error: { code: error.code || 'SETTINGS_UNAVAILABLE', message: 'Telegram destination lookup failed' },
      };
    }
  }

  async protectedSettings({ headers, lockerId, body = null }) {
    const authorization = await this.authGate.authorize(headers, lockerId);
    if (!authorization.ok) return authorization;
    if (!this.data) return { ok: false, status: 503, code: 'DATA_NOT_CONFIGURED' };
    try {
      const setting = body == null
        ? await this.data.getSettings(lockerId)
        : await this.data.saveSettings(lockerId, authorization.principal.id, body);
      return { ok: true, status: 200, setting: publicSetting(setting, lockerId) };
    } catch (error) {
      return { ok: false, status: error.status || 503, code: error.code || 'SETTINGS_UNAVAILABLE' };
    }
  }

  async protectedTelegramLink({ headers, lockerId }) {
    const authorization = await this.authGate.authorize(headers, lockerId);
    if (!authorization.ok) return authorization;
    if (!this.data) return { ok: false, status: 503, code: 'DATA_NOT_CONFIGURED' };
    if (!this.telegram.configured()) {
      return { ok: false, status: 503, code: 'TELEGRAM_BOT_NOT_CONFIGURED' };
    }
    if (!/^[A-Za-z0-9_-]{16,256}$/.test(this.telegramWebhookSecret)) {
      return { ok: false, status: 503, code: 'TELEGRAM_WEBHOOK_NOT_CONFIGURED' };
    }
    try {
      const token = this.linkTokenFactory();
      const linkUrl = buildTelegramLink(this.telegramBotUsername, token);
      const issued = await this.data.issueTelegramLink(
        lockerId, authorization.principal.id, hashLinkToken(token));
      return {
        ok: true,
        status: 201,
        locker_id: lockerId,
        link_url: linkUrl,
        expires_at: issued.expires_at,
      };
    } catch (error) {
      return { ok: false, status: error.status || 503, code: error.code || 'TELEGRAM_LINK_UNAVAILABLE' };
    }
  }

  async protectedTelegramDisconnect({ headers, lockerId }) {
    const authorization = await this.authGate.authorize(headers, lockerId);
    if (!authorization.ok) return authorization;
    if (!this.data) return { ok: false, status: 503, code: 'DATA_NOT_CONFIGURED' };
    try {
      const setting = await this.data.disconnectTelegram(lockerId, authorization.principal.id);
      return { ok: true, status: 200, setting: publicSetting(setting, lockerId) };
    } catch (error) {
      return { ok: false, status: error.status || 503, code: error.code || 'TELEGRAM_DISCONNECT_UNAVAILABLE' };
    }
  }

  async protectedTelegramTest({ headers, lockerId }) {
    const authorization = await this.authGate.authorize(headers, lockerId);
    if (!authorization.ok) return authorization;
    if (!this.data) return { ok: false, status: 503, code: 'DATA_NOT_CONFIGURED' };
    try {
      const setting = await this.data.getSettings(lockerId);
      if (!setting?.telegram_chat_id || !setting?.telegram_linked_at) {
        return { ok: false, status: 409, code: 'TELEGRAM_NOT_LINKED' };
      }
      await this.telegram.sendText({
        chatId: setting.telegram_chat_id,
        lockerId,
        text: `Smart Privacy Locker: Telegram đã được liên kết thành công với tủ ${lockerId}.`,
      });
      return { ok: true, status: 200, code: 'TELEGRAM_TEST_DELIVERED' };
    } catch (error) {
      return { ok: false, status: 503, code: error.code || 'TELEGRAM_TEST_FAILED' };
    }
  }

  async telegramWebhook({ headers, body }) {
    if (!webhookSecretMatches(headers, this.telegramWebhookSecret)) {
      return { ok: false, status: 401, code: 'TELEGRAM_WEBHOOK_UNAUTHORIZED' };
    }
    let command;
    try {
      command = parseTelegramStart(body);
    } catch (_error) {
      let privateCommand;
      try {
        privateCommand = parseTelegramPrivateCommand(body);
      } catch (_commandError) {
        return { ok: true, status: 200, accepted: false, code: 'TELEGRAM_UPDATE_IGNORED' };
      }
      const dashboardUrl = this.telegram.dashboardUrl || 'Smart Privacy Locker Dashboard';
      const text = privateCommand.command === 'settings'
        ? `Cài đặt Telegram được quản lý an toàn trên Smart Privacy Locker: ${dashboardUrl}`
        : `Để liên kết tài khoản, hãy mở ${dashboardUrl}, đăng nhập, chọn tủ và bấm “Liên kết Telegram”.`;
      try {
        await this.telegram.sendText({ chatId: privateCommand.chatId, text });
        return { ok: true, status: 200, accepted: false, code: 'TELEGRAM_COMMAND_HANDLED' };
      } catch (_deliveryError) {
        return { ok: false, status: 503, accepted: false,
          code: 'TELEGRAM_COMMAND_DELIVERY_FAILED' };
      }
    }
    if (!this.data) return { ok: false, status: 503, code: 'DATA_NOT_CONFIGURED' };
    let link;
    try {
      link = await this.data.consumeTelegramLink({
        tokenHash: hashLinkToken(command.token),
        chatId: command.chatId,
        userId: command.userId,
        username: command.username,
      });
    } catch (error) {
      // Invalid/expired/ownership-changed tokens are final. Infrastructure and
      // deployment failures must remain non-2xx so Telegram retries instead of
      // silently losing a valid link attempt.
      if (!FINAL_TELEGRAM_LINK_ERRORS.has(error.code)) {
        return { ok: false, status: 503, code: 'TELEGRAM_LINK_SERVICE_UNAVAILABLE' };
      }
      try {
        await this.telegram.sendText({
          chatId: command.chatId,
          text: 'Liên kết không hợp lệ hoặc đã hết hạn. Hãy tạo liên kết mới trên Smart Privacy Locker.',
        });
      } catch (_deliveryError) {
        // The invalid token is still final, so acknowledge it even when the
        // explanatory message cannot be delivered.
      }
      return { ok: true, status: 200, accepted: false, code: 'TELEGRAM_LINK_INVALID_OR_EXPIRED' };
    }

    try {
      await this.telegram.sendText({
        chatId: command.chatId,
        lockerId: link.locker_id,
        text: `Đã liên kết Telegram với tủ ${link.locker_id}. Bạn sẽ nhận cảnh báo an toàn tại đây.`,
      });
      return { ok: true, status: 200, accepted: true };
    } catch (_error) {
      // The database link is already committed. Retrying the webhook cannot
      // improve that state and could create a misleading replay error, so
      // acknowledge the update and let the Dashboard show the linked account.
      return { ok: true, status: 200, accepted: true,
        code: 'TELEGRAM_LINKED_CONFIRMATION_FAILED' };
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
      const lockerId = setting.locker_id;
      const now = this.now();
      let timezone;
      let range;
      try {
        timezone = setting.timezone || this.timezone;
        const reportTime = String(setting.report_time || '').slice(0, 5);
        if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(reportTime)) {
          throw Object.assign(new Error('INVALID_REPORT_TIME'), { code: 'INVALID_REPORT_TIME' });
        }
        // Running after the configured minute still processes the due report;
        // the database reservation keeps every later scheduler tick idempotent.
        if (localTime(now, timezone) < reportTime) continue;
        range = previousDayRange(now, timezone);
      } catch (error) {
        results.push({ ok: false, locker_id: lockerId,
          code: error.code || (error.message === 'INVALID_TIMEZONE' ? 'INVALID_TIMEZONE' : 'INVALID_SCHEDULE') });
        continue;
      }
      if (!this.email.configured()) {
        results.push({ ok: false, locker_id: lockerId, code: 'EMAIL_NOT_CONFIGURED' });
        continue;
      }
      const attemptedAt = new Date(now).toISOString();
      let reservation;
      try {
        reservation = await this.data.reserveDelivery({
          lockerId,
          reportDate: range.reportDate,
          attemptedAt,
          retryBefore: new Date(now - this.deliveryRetryDelayMs).toISOString(),
          stalePendingBefore: new Date(now - this.deliveryPendingLeaseMs).toISOString(),
          maxAttempts: this.deliveryMaxAttempts,
        });
      } catch (error) {
        results.push({ ok: false, locker_id: lockerId, code: error.code || 'DELIVERY_RESERVE_FAILED' });
        continue;
      }
      if (!reservation || reservation.claimed === false) {
        const reservationStatus = reservation?.status === 'delivery_unknown' || reservation?.status === 'sending'
          ? 'delivery_unknown'
          : reservation?.status === 'failed' && Number(reservation.attempts) >= this.deliveryMaxAttempts
            ? 'retry_exhausted'
            : reservation?.status === 'pending' ? 'delivery_in_progress' : 'duplicate_suppressed';
        results.push({ ok: true, locker_id: lockerId, status: reservationStatus });
        continue;
      }

      let report;
      let rendered;
      try {
        const events = typeof this.data.allEvents === 'function'
          ? await this.data.allEvents(lockerId, range)
          : await this.data.events(lockerId, { ...range, limit: 1000 });
        report = aggregateDailyReport(events, { now, timezone });
        rendered = renderDailyEmail({ lockerId, report });
      } catch (error) {
        let code = error.code || 'REPORT_BUILD_FAILED';
        try {
          await this.data.completeDelivery(reservation.id, { status: 'failed',
            error: { code, message: 'Report preparation failed' } });
        } catch (completionError) {
          code = completionError.code || 'DELIVERY_UPDATE_FAILED';
        }
        results.push({ ok: false, locker_id: lockerId, code });
        continue;
      }

      let sending;
      try {
        sending = await this.data.beginDelivery(reservation.id, new Date(this.now()).toISOString());
      } catch (error) {
        results.push({ ok: false, locker_id: lockerId, code: error.code || 'DELIVERY_BEGIN_FAILED' });
        continue;
      }
      if (!sending) {
        results.push({ ok: false, locker_id: lockerId, code: 'DELIVERY_CLAIM_LOST' });
        continue;
      }

      let sentAt;
      try {
        await this.email.send({
          to: setting.email_address,
          messageId: dailyMessageId(lockerId, range.reportDate),
          ...rendered,
        });
        sentAt = new Date(this.now()).toISOString();
      } catch (error) {
        const status = error.deliveryOutcome === 'not_sent' ? 'failed' : 'delivery_unknown';
        let code = error.code || 'EMAIL_FAILED';
        try {
          const completed = await this.data.completeDelivery(reservation.id, { status,
            error: { code, message: status === 'failed'
              ? 'Email was not accepted; retry is allowed'
              : 'Email provider outcome is unknown; automatic retry is blocked' } });
          if (!completed) code = 'DELIVERY_UPDATE_CONFLICT';
        } catch (completionError) {
          code = completionError.code || 'DELIVERY_UPDATE_FAILED';
        }
        results.push({ ok: false, locker_id: lockerId, code, delivery_status: status });
        continue;
      }

      try {
        const completed = await this.data.completeDelivery(reservation.id, {
          status: 'delivered', sentAt,
        });
        if (!completed) throw Object.assign(new Error('Delivery state changed'), { code: 'DELIVERY_UPDATE_CONFLICT' });
      } catch (error) {
        // SMTP already accepted the message. Leave the row in `sending`; the
        // next scheduler pass will classify it as unknown and never double-send.
        results.push({ ok: false, locker_id: lockerId, code: error.code || 'DELIVERY_UPDATE_FAILED',
          delivery_status: 'delivery_unknown' });
        continue;
      }
      this.emitEvent(normalizedEvent({
        eventType: 'DAILY_EMAIL_REPORT', lockerId,
        source: 'automation', result: 'success', occurredAt: sentAt,
        recordedAt: sentAt, uuid: this.uuid,
        metadata: { report_date: report.report_date, range: report.range,
          opens: report.opens, alerts: report.alerts },
        notification: 'delivered',
      }));
      results.push({ ok: true, locker_id: lockerId, status: 'delivered', report });
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
    transport: telegramHttpTransport({ token: env.TELEGRAM_BOT_TOKEN, fetchImpl }),
    dashboardUrl: env.DASHBOARD_BASE_URL || 'http://localhost:1880/locker',
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
    telegramBotUsername: env.TELEGRAM_BOT_USERNAME,
    telegramWebhookSecret: env.TELEGRAM_WEBHOOK_SECRET,
    staleAfterMs: requiredNumber(env.DEVICE_STALE_AFTER_SECONDS, 30) * 1000,
    timeoutMs: requiredNumber(env.COMMAND_TIMEOUT_MS, 5000),
    windowMs: requiredNumber(env.AUTHORIZED_UNLOCK_WINDOW_SECONDS, 30) * 1000 });
}

module.exports = { Phase2Runtime, createFromEnvironment };
