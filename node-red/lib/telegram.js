'use strict';

class TelegramAdapter {
  constructor({ transport, dashboardUrl, timezone = 'Asia/Ho_Chi_Minh',
    rateLimitMs = 30_000, dedupeLimit = 1024, lockerLimit = 256, now = Date.now }) {
    this.transport = transport;
    this.dashboardUrl = dashboardUrl;
    this.timezone = timezone;
    this.rateLimitMs = rateLimitMs;
    this.dedupeLimit = Number.isInteger(dedupeLimit) && dedupeLimit > 0 ? dedupeLimit : 1024;
    this.lockerLimit = Number.isInteger(lockerLimit) && lockerLimit > 0 ? lockerLimit : 256;
    this.now = now;
    this.delivered = new Map();
    this.lastByLocker = new Map();
  }

  remember(map, key, value, limit) {
    if (map.has(key)) map.delete(key);
    map.set(key, value);
    while (map.size > limit) map.delete(map.keys().next().value);
  }

  async notify(event, locker = {}) {
    const result = (status, attempts, error = null) => ({
      schema_version: 1, event_id: event.event_id, channel: 'telegram', status, attempts,
      attempted_at: new Date(this.now()).toISOString(), error,
    });
    if (this.delivered.has(event.event_id)) return result('duplicate_suppressed', 0);
    const last = this.lastByLocker.get(event.locker_id) || 0;
    if (last && this.now() - last < this.rateLimitMs) return result('rate_limited', 0);
    this.remember(this.delivered, event.event_id, this.now(), this.dedupeLimit);
    this.remember(this.lastByLocker, event.locker_id, this.now(), this.lockerLimit);
    const displayTime = new Intl.DateTimeFormat('vi-VN', {
      timeZone: this.timezone, dateStyle: 'short', timeStyle: 'medium',
    }).format(new Date(event.occurred_at));
    const state = event.device_state || {};
    const text = [
      `CẢNH BÁO MỞ TỦ TRÁI PHÉP`,
      `Tủ: ${locker.display_name || locker.locker_code || event.locker_id}`,
      `Thời gian: ${displayTime}`,
      `Cửa: ${state.door || 'UNKNOWN'}`,
      `Khóa: ${state.lock || 'UNKNOWN'}`,
      `Dashboard: ${this.dashboardUrl}`,
    ].join('\n');
    try {
      await this.transport({ text, lockerId: event.locker_id });
      return result('delivered', 1);
    } catch (error) {
      return result('failed', 1, {
        code: error.code || 'TELEGRAM_DELIVERY_FAILED', message: 'Telegram delivery failed',
      });
    }
  }
}

function telegramHttpTransport({ token, chatId, fetchImpl = globalThis.fetch, timeoutMs = 5000 }) {
  return async ({ text }) => {
    if (!token || !chatId) throw Object.assign(new Error('Telegram is not configured'), { code: 'NOT_CONFIGURED' });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST', signal: controller.signal, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
      });
      if (!response.ok) throw Object.assign(new Error('Telegram request failed'), { code: `HTTP_${response.status}` });
    } catch (error) {
      if (controller.signal.aborted) throw Object.assign(new Error('Telegram request timed out'), { code: 'TELEGRAM_TIMEOUT' });
      throw error;
    } finally {
      clearTimeout(timer);
    }
  };
}

module.exports = { TelegramAdapter, telegramHttpTransport };
