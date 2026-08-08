'use strict';

class TelegramAdapter {
  constructor({ transport, dashboardUrl, timezone = 'Asia/Ho_Chi_Minh',
    rateLimitMs = 30_000, now = Date.now }) {
    this.transport = transport;
    this.dashboardUrl = dashboardUrl;
    this.timezone = timezone;
    this.rateLimitMs = rateLimitMs;
    this.now = now;
    this.delivered = new Set();
    this.lastByLocker = new Map();
  }

  async notify(event, locker = {}) {
    if (this.delivered.has(event.event_id)) return { status: 'duplicate_suppressed', attempts: 0 };
    const last = this.lastByLocker.get(event.locker_id) || 0;
    if (last && this.now() - last < this.rateLimitMs) return { status: 'rate_limited', attempts: 0 };
    this.delivered.add(event.event_id);
    this.lastByLocker.set(event.locker_id, this.now());
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
      return { status: 'delivered', attempts: 1 };
    } catch (error) {
      return { status: 'failed', attempts: 1, error_code: error.code || 'TELEGRAM_DELIVERY_FAILED' };
    }
  }
}

function telegramHttpTransport({ token, chatId, fetchImpl = globalThis.fetch }) {
  return async ({ text }) => {
    if (!token || !chatId) throw Object.assign(new Error('Telegram is not configured'), { code: 'NOT_CONFIGURED' });
    const response = await fetchImpl(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
    });
    if (!response.ok) throw Object.assign(new Error('Telegram request failed'), { code: `HTTP_${response.status}` });
  };
}

module.exports = { TelegramAdapter, telegramHttpTransport };
