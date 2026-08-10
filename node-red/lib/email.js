'use strict';

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[character]));
}

function renderDailyEmail({ lockerId, report }) {
  const latest = report.latest_activity
    ? `${report.latest_activity.event_type} lúc ${report.latest_activity.occurred_at}`
    : 'Không có hoạt động trong kỳ báo cáo';
  const subject = `[Smart Locker] Báo cáo ${lockerId} - ${report.report_date}`;
  const text = [
    `Báo cáo tủ ${lockerId}`,
    `Khoảng thống kê: ${report.range.from} đến ${report.range.to} (${report.timezone})`,
    `Số lần mở tủ: ${report.opens}`,
    `Số cảnh báo: ${report.alerts}`,
    `Hoạt động gần nhất: ${latest}`,
  ].join('\n');
  const html = `<h1>Báo cáo tủ ${escapeHtml(lockerId)}</h1>`
    + `<p>Khoảng thống kê: ${escapeHtml(report.range.from)} đến ${escapeHtml(report.range.to)} (${escapeHtml(report.timezone)})</p>`
    + `<ul><li>Số lần mở tủ: <strong>${report.opens}</strong></li>`
    + `<li>Số cảnh báo: <strong>${report.alerts}</strong></li></ul>`
    + `<p>Hoạt động gần nhất: ${escapeHtml(latest)}</p>`;
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

  async send({ to, subject, text, html }) {
    if (!this.configured()) {
      throw Object.assign(new Error('Email provider is not configured'), { code: 'EMAIL_NOT_CONFIGURED' });
    }
    const result = await this.transport.sendMail({ from: this.from, to, subject, text, html });
    return { message_id: result?.messageId || null };
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
