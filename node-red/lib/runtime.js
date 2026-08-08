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

class Phase2Runtime {
  constructor({ authGate, publish, history, telegram, gemini = null,
    staleAfterMs = 30_000, timeoutMs = 5000, windowMs = 30_000,
    now = Date.now, uuid = randomUUID }) {
    this.authGate = authGate;
    this.publish = publish;
    this.now = now;
    this.events = [];
    this.diagnostics = [];
    this.commandStatus = new Map();
    this.cache = new LiveStateCache({ staleAfterMs });
    this.telegram = telegram;
    this.dispatcher = new CommandDispatcher({ cache: this.cache, publish, timeoutMs, now, uuid,
      onResult: (result) => {
        this.commandStatus.set(result.pending.lockerId, {
          command_id: result.pending.commandId, action: result.pending.action,
          status: result.code, completed_at: new Date(this.now()).toISOString(),
        });
        this.detector?.onCommandResult(result);
      } });
    this.detector = new UnauthorizedDetector({ windowMs, now, uuid,
      dispatchAlarm: (lockerId) => this.dispatcher.dispatchInternal({ lockerId, action: 'ALARM_ON' }),
      emit: (event) => this.events.push(event),
      notify: (event) => this.telegram.notify(event),
      latestAlert: (lockerId, event) => this.cache.setLatestAlert(lockerId, event),
    });
    this.chatbot = new ChatbotRouter({ cache: this.cache, history, provider: gemini, now, uuid });
  }

  restart() {
    this.cache.restart();
    this.dispatcher.restart();
    this.detector.restart();
    this.commandStatus.clear();
  }

  setMqttConnected(connected) { this.cache.setMqttConnected(connected); }

  async ingest(topic, payload, observedAt = this.now()) {
    let validation;
    if (topic.endsWith('/availability')) validation = validateAvailability(topic, payload);
    else if (topic.endsWith('/state')) validation = validateState(topic, payload);
    else if (topic.endsWith('/telemetry/door')) validation = validateDoor(topic, payload);
    else if (topic.endsWith('/ack')) validation = validateAck(topic, payload);
    else validation = { ok: false, code: 'UNEXPECTED_TOPIC' };
    if (!validation.ok) {
      this.diagnostics.push({ code: validation.code, topic, observed_at: new Date(observedAt).toISOString() });
      return { accepted: false, code: validation.code };
    }

    const { lockerId, value } = validation;
    if (topic.endsWith('/availability')) {
      this.cache.ingestAvailability(lockerId, value, observedAt);
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
      state: value.state, deviceState, occurredAt: value.timestamp, observedAt: new Date(observedAt).toISOString() });
    return { accepted: true, type: 'door', outputs };
  }

  async protectedCommand({ headers, body }) {
    const authorization = await this.authGate.authorize(headers, body?.locker_id);
    if (!authorization.ok) return authorization;
    const result = this.dispatcher.dispatchUser({ principal: authorization.principal,
      lockerId: body.locker_id, action: body.action });
    if (result.ok) this.commandStatus.set(body.locker_id, { command_id: result.command.command_id,
      action: body.action, status: 'PENDING', completed_at: null });
    return result;
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
      return { ok: false, status: error.status || 409, code: 'CLAIM_REJECTED' };
    }
  }

  uiState({ authenticated, ownsLocker, lockerId }) {
    const pendingDomains = [...this.dispatcher.pending.values()]
      .filter((item) => item.lockerId === lockerId).map((item) => domain(item.action));
    return { ...dashboardState({ authenticated, ownsLocker, snapshot: this.cache.snapshot(lockerId, this.now()), pendingDomains }),
      command_status: this.commandStatus.get(lockerId) || null };
  }
}

function requiredNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function createFromEnvironment({ env = process.env, publish = () => {}, history,
  fetchImpl = globalThis.fetch, now = Date.now, uuid = randomUUID } = {}) {
  const adapter = new SupabaseAuthAdapter({ url: env.SUPABASE_URL, anonKey: env.SUPABASE_ANON_KEY, fetchImpl });
  const telegram = new TelegramAdapter({
    transport: telegramHttpTransport({ token: env.TELEGRAM_BOT_TOKEN, chatId: env.TELEGRAM_CHAT_ID, fetchImpl }),
    dashboardUrl: env.DASHBOARD_BASE_URL || 'http://localhost:1880/phase2',
    timezone: env.REPORT_TIMEZONE || 'Asia/Ho_Chi_Minh', now,
  });
  const gemini = env.GEMINI_API_KEY && env.GEMINI_MODEL
    ? new GeminiAdapter({ apiKey: env.GEMINI_API_KEY, model: env.GEMINI_MODEL, fetchImpl }) : null;
  const historyAdapter = history || { async query(request) {
    return { schema_version: 1, request_id: request.request_id, locker_id: request.locker_id,
      range: null, events: [], source: 'phase3-not-configured' };
  } };
  return new Phase2Runtime({ authGate: new AuthGate(adapter), publish, history: historyAdapter,
    telegram, gemini, now, uuid,
    staleAfterMs: requiredNumber(env.DEVICE_STALE_AFTER_SECONDS, 30) * 1000,
    timeoutMs: requiredNumber(env.COMMAND_TIMEOUT_MS, 5000),
    windowMs: requiredNumber(env.AUTHORIZED_UNLOCK_WINDOW_SECONDS, 30) * 1000 });
}

module.exports = { Phase2Runtime, createFromEnvironment };
