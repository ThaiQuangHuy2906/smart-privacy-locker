'use strict';

const EVENT_LABELS = Object.freeze({
  DOOR_OPENED: 'Mở cửa',
  DOOR_CLOSED: 'Đóng cửa',
  DOOR_UNKNOWN: 'Không xác định được trạng thái cửa',
  UNAUTHORIZED_OPEN: 'Phát hiện mở cửa trái phép',
  LOCK_COMMAND: 'Khóa chốt',
  UNLOCK_COMMAND: 'Mở chốt',
  LOCK_STATE_CHANGED: 'Thay đổi trạng thái chốt',
  ALARM_STARTED: 'Bật còi cảnh báo',
  ALARM_STOPPED: 'Tắt còi cảnh báo',
  LED_TURNED_ON: 'Bật đèn',
  LED_TURNED_OFF: 'Tắt đèn',
  DEVICE_ONLINE: 'Thiết bị trực tuyến',
  DEVICE_OFFLINE: 'Thiết bị ngoại tuyến',
  COMMAND_REJECTED: 'Lệnh điều khiển bị từ chối',
  COMMAND_TIMEOUT: 'Lệnh điều khiển không phản hồi',
});

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[character]));
}

function reportDateLabel(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : 'không xác định';
}

function localDateTimeLabel(value, timezone) {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return 'thời gian không xác định';
  try {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    }).formatToParts(new Date(timestamp)).map((part) => [part.type, part.value]));
    return `${parts.hour}:${parts.minute}:${parts.second}, ngày ${parts.day}/${parts.month}/${parts.year}`;
  } catch {
    return 'thời gian không xác định';
  }
}

function eventLabel(eventType) {
  return EVENT_LABELS[eventType] || 'Hoạt động hệ thống';
}

function renderDailyEmail({ lockerId, report }) {
  const latest = report.latest_activity
    ? `${eventLabel(report.latest_activity.event_type)} lúc ${localDateTimeLabel(
      report.latest_activity.occurred_at, report.timezone)}`
    : 'Không có hoạt động của tủ trong ngày.';
  const reportDate = reportDateLabel(report.report_date);
  const range = `${localDateTimeLabel(report.range.from, report.timezone)} đến trước `
    + localDateTimeLabel(report.range.to, report.timezone);
  const subject = `[Smart Locker] Báo cáo ${lockerId} - ${report.report_date}`;
  const text = [
    `Báo cáo hoạt động tủ ${lockerId}`,
    `Ngày thống kê: ${reportDate}`,
    `Khoảng thống kê: ${range}`,
    `Múi giờ: ${report.timezone}`,
    `Số lần mở tủ: ${report.opens}`,
    `Số cảnh báo: ${report.alerts}`,
    `Hoạt động gần nhất: ${latest}`,
  ].join('\n');
  const html = `<h1>Báo cáo hoạt động tủ ${escapeHtml(lockerId)}</h1>`
    + `<p><strong>Ngày thống kê:</strong> ${escapeHtml(reportDate)}</p>`
    + `<p><strong>Khoảng thống kê:</strong> ${escapeHtml(range)}<br>`
    + `<strong>Múi giờ:</strong> ${escapeHtml(report.timezone)}</p>`
    + `<ul><li>Số lần mở tủ: <strong>${report.opens}</strong></li>`
    + `<li>Số cảnh báo: <strong>${report.alerts}</strong></li></ul>`
    + `<p><strong>Hoạt động gần nhất:</strong> ${escapeHtml(latest)}</p>`;
  return { subject, text, html };
}

class EmailAdapter {
  constructor({ transport = null, from = '' } = {}) {
    this.transport = transport;
    this.from = from;
  }

  configured() {
    return Boolean(this.transport && typeof this.transport.sendMail === 'function' && this.from);
  }

  async send({ to, subject, text, html, messageId = undefined }) {
    if (!this.configured()) {
      throw Object.assign(new Error('Email provider is not configured'), {
        code: 'EMAIL_NOT_CONFIGURED', deliveryOutcome: 'not_sent',
      });
    }
    try {
      const result = await this.transport.sendMail({ from: this.from, to, subject, text, html, messageId });
      return { message_id: result?.messageId || null };
    } catch (error) {
      const code = typeof error?.code === 'string' && /^[A-Z0-9_]{1,64}$/.test(error.code)
        ? error.code : 'EMAIL_PROVIDER_FAILED';
      const responseCode = Number(error?.responseCode);
      const providerRejected = Number.isInteger(responseCode) && responseCode >= 400 && responseCode < 600;
      const definitelyNotSent = providerRejected || ['EAUTH', 'EENVELOPE', 'EMESSAGE'].includes(code)
        || error?.deliveryOutcome === 'not_sent';
      throw Object.assign(new Error('Email delivery failed'), {
        code,
        deliveryOutcome: definitelyNotSent ? 'not_sent' : 'unknown',
      });
    }
  }
}

function createSmtpTransport({ nodemailer, host, port, user, password }) {
  if (!nodemailer || !host || !port || !user || !password) return null;
  return nodemailer.createTransport({
    host,
    port: Number(port),
    secure: Number(port) === 465,
    auth: { user, pass: password },
    connectionTimeout: 8000,
    greetingTimeout: 8000,
    socketTimeout: 12000,
  });
}

module.exports = { escapeHtml, renderDailyEmail, EmailAdapter, createSmtpTransport };
