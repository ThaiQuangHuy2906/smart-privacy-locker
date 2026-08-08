'use strict';

const { randomUUID } = require('node:crypto');

const LIVE_WORDS = /\b(current|now|live|door|lock|alarm|led)\b|hiện tại|bây giờ|đang (khóa|mở|đóng)/i;
const HISTORY_WORDS = /\b(history|recent|last|count|days?|times?)\b|lịch sử|gần nhất|bao nhiêu|\d+ ngày|trong tuần/i;

function classify(question) {
  if (typeof question !== 'string' || !question.trim()) return 'invalid';
  if (HISTORY_WORDS.test(question)) return 'history';
  if (LIVE_WORDS.test(question)) return 'live';
  return 'unsupported';
}

function sanitizedContext(route, lockerId, facts) {
  return {
    schema_version: 1, route, locker_id: lockerId,
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
      const response = await this.fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.model)}:generateContent?key=${encodeURIComponent(this.apiKey)}`, {
        method: 'POST', signal: controller.signal, headers: { 'Content-Type': 'application/json' },
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
    const route = classify(question);
    if (route === 'invalid' || route === 'unsupported') return { ok: false, code: 'QUESTION_UNSUPPORTED', route };
    let facts;
    if (route === 'live') {
      const snapshot = this.cache.snapshot(lockerId, this.now());
      if (!snapshot.fresh) return { ok: false, code: 'LIVE_STATE_UNAVAILABLE', route };
      facts = { state: snapshot.state, observed_at: snapshot.observed_at, source: snapshot.source };
    } else {
      const request = { schema_version: 1, request_id: this.uuid(), locker_id: lockerId,
        question, requested_by: principalId, requested_at: new Date(this.now()).toISOString() };
      const response = await this.history.query(request);
      if (!response || response.schema_version !== 1 || response.request_id !== request.request_id
        || response.locker_id !== lockerId) {
        return { ok: false, code: 'HISTORY_ADAPTER_ERROR', route };
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
    const context = sanitizedContext(route, lockerId, facts);
    if (!this.provider) return { ok: true, route, context, answer: 'Dữ liệu đã được chuẩn bị; dịch vụ diễn đạt chưa được cấu hình.' };
    try {
      return { ok: true, route, context, answer: await this.provider.render(context) };
    } catch (error) {
      return { ok: false, code: error.code || 'PROVIDER_ERROR', route, context,
        answer: 'Không thể tạo câu trả lời lúc này. Dữ liệu nguồn không bị thay đổi.' };
    }
  }
}

module.exports = { classify, sanitizedContext, GeminiAdapter, ChatbotRouter };
