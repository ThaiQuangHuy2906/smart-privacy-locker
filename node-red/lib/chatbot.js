'use strict';

const { randomUUID } = require('node:crypto');

const CANONICAL_QUESTIONS = Object.freeze({
  current_lock_state: 'Tủ hiện đang khóa hay mở?',
  current_door_state: 'Cửa tủ đang đóng hay mở?',
  latest_alert: 'Cảnh báo gần nhất xảy ra khi nào?',
  open_count_7_days: 'Trong 7 ngày qua có bao nhiêu lần mở tủ?',
  unauthorized_open_today: 'Có lần mở cửa trái phép nào hôm nay không?',
  latest_activity: 'Hoạt động gần nhất của tủ là gì?',
});

function normalizeQuestion(question) {
  if (typeof question !== 'string') return '';
  return question.trim().normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .replace(/đ/gi, (letter) => letter === 'Đ' ? 'D' : 'd')
    .replace(/\s+/g, ' ').toLowerCase();
}

function analyze(question) {
  const normalized = normalizeQuestion(question);
  if (!normalized) return { route: 'invalid', intent: null, canonicalQuestion: null };
  const has = (pattern) => pattern.test(normalized);
  let intent = null;
  if (has(/(?:trai phep|unauthori[sz]ed)/) && has(/(?:hom nay|today)/)) {
    intent = 'unauthorized_open_today';
  } else if (has(/(?:canh bao|alert)/) && has(/(?:gan nhat|latest|recent)/)) {
    intent = 'latest_alert';
  } else if (has(/(?:hoat dong|activity)/) && has(/(?:gan nhat|latest|recent)/)) {
    intent = 'latest_activity';
  } else if (has(/(?:bao nhieu|count|times?)/) && has(/(?:\bmo\b|open)/)) {
    intent = 'open_count_7_days';
  } else if (has(/(?:cua|door)/) && has(/(?:hien tai|dang|bay gio|current|now|mo|dong|open|closed)/)) {
    intent = 'current_door_state';
  } else if (has(/(?:khoa|lock)/) && has(/(?:hien tai|dang|bay gio|current|now|mo|locked|unlocked)/)) {
    intent = 'current_lock_state';
  }
  if (!intent) return { route: 'unsupported', intent: null, canonicalQuestion: null };
  return {
    route: intent.startsWith('current_') ? 'live' : 'history',
    intent,
    canonicalQuestion: CANONICAL_QUESTIONS[intent],
  };
}

function classify(question) {
  return analyze(question).route;
}

function sanitizedContext(route, lockerId, facts, { intent = null, canonicalQuestion = null } = {}) {
  return {
    schema_version: 1, route, intent, question: canonicalQuestion, locker_id: lockerId,
    instruction: 'Only restate the supplied facts. Never invent events, counts, states, or timestamps. If facts are insufficient, say so.',
    facts,
  };
}

class GeminiAdapter {
  constructor({ apiKey, model, fetchImpl = globalThis.fetch, timeoutMs = 8000 }) {
    this.apiKey = apiKey; this.model = model; this.fetch = fetchImpl; this.timeoutMs = timeoutMs;
  }

  async render(context) {
    if (!this.apiKey || !this.model) throw Object.assign(new Error('Gemini is not configured'), { code: 'PROVIDER_NOT_CONFIGURED' });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.model)}:generateContent`, {
        method: 'POST', signal: controller.signal,
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': this.apiKey },
        body: JSON.stringify({ contents: [{ parts: [{ text: JSON.stringify(context) }] }] }),
      });
      if (!response.ok) throw Object.assign(new Error('Gemini request failed'), { code: `PROVIDER_HTTP_${response.status}` });
      const body = await response.json();
      const text = body?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) throw Object.assign(new Error('Gemini response is empty'), { code: 'PROVIDER_EMPTY' });
      return text;
    } finally { clearTimeout(timer); }
  }
}

class ChatbotRouter {
  constructor({ cache, history, provider = null, now = Date.now, uuid = randomUUID }) {
    this.cache = cache; this.history = history; this.provider = provider; this.now = now; this.uuid = uuid;
  }

  async ask({ lockerId, question, principalId }) {
    const classification = analyze(question);
    const { route } = classification;
    if (route === 'invalid' || route === 'unsupported') return { ok: false, code: 'QUESTION_UNSUPPORTED', route };
    let facts;
    if (route === 'live') {
      const snapshot = this.cache.snapshot(lockerId, this.now());
      if (!snapshot.fresh) return { ok: false, code: 'LIVE_STATE_UNAVAILABLE', route };
      facts = { state: snapshot.state, observed_at: snapshot.observed_at, source: snapshot.source };
    } else {
      const request = { schema_version: 1, request_id: this.uuid(), locker_id: lockerId,
        question: classification.canonicalQuestion, requested_by: principalId,
        requested_at: new Date(this.now()).toISOString() };
      let response;
      try {
        response = await this.history.query(request);
      } catch {
        return { ok: false, code: 'HISTORY_UNAVAILABLE', route };
      }
      if (!response || response.schema_version !== 1 || response.request_id !== request.request_id
        || response.locker_id !== lockerId) {
        return { ok: false, code: 'HISTORY_ADAPTER_ERROR', route };
      }
      if (response.source === 'phase3-not-configured') {
        return { ok: false, code: 'HISTORY_UNAVAILABLE', route };
      }
      const events = Array.isArray(response.events) ? response.events : [];
      facts = {
        range: response.range,
        open_count: events.filter((event) => event.event_type === 'DOOR_OPENED').length,
        alert_count: events.filter((event) => event.event_type === 'UNAUTHORIZED_OPEN').length,
        recent_events: events.slice(0, 10).map(({ event_type, occurred_at, authorized }) => ({ event_type, occurred_at, authorized })),
        source: response.source || 'history-adapter-v1',
      };
    }
    const context = sanitizedContext(route, lockerId, facts, classification);
    if (!this.provider) return { ok: true, route, context, answer: 'Dữ liệu đã được chuẩn bị; dịch vụ diễn đạt chưa được cấu hình.' };
    try {
      return { ok: true, route, context, answer: await this.provider.render(context) };
    } catch (error) {
      return { ok: false, code: error.code || 'PROVIDER_ERROR', route, context,
        answer: 'Không thể tạo câu trả lời lúc này. Dữ liệu nguồn không bị thay đổi.' };
    }
  }
}

module.exports = { CANONICAL_QUESTIONS, normalizeQuestion, analyze, classify,
  sanitizedContext, GeminiAdapter, ChatbotRouter };
