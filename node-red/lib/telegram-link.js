'use strict';

const { createHash, randomBytes, timingSafeEqual } = require('node:crypto');

const LINK_TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,64}$/;
const BOT_USERNAME_PATTERN = /^[A-Za-z0-9_]{5,32}$/;

function telegramLinkError(code, message, status = 400) {
  return Object.assign(new Error(message), { code, status });
}

function generateLinkToken(randomBytesImpl = randomBytes) {
  const token = randomBytesImpl(32).toString('base64url');
  if (!LINK_TOKEN_PATTERN.test(token)) {
    throw telegramLinkError('TELEGRAM_LINK_TOKEN_FAILED', 'Could not create a Telegram link token', 503);
  }
  return token;
}

function hashLinkToken(token) {
  if (!LINK_TOKEN_PATTERN.test(String(token || ''))) {
    throw telegramLinkError('TELEGRAM_LINK_INVALID', 'Telegram link token is invalid');
  }
  return createHash('sha256').update(token).digest('hex');
}

function normalizeBotUsername(value) {
  const username = String(value || '').trim().replace(/^@/, '');
  if (!BOT_USERNAME_PATTERN.test(username)) {
    throw telegramLinkError('TELEGRAM_BOT_NOT_CONFIGURED', 'Telegram bot username is not configured', 503);
  }
  return username;
}

function buildTelegramLink(botUsername, token) {
  return `https://t.me/${normalizeBotUsername(botUsername)}?start=${encodeURIComponent(token)}`;
}

function headerValue(headers, name) {
  if (!headers || typeof headers !== 'object') return '';
  const expected = name.toLowerCase();
  const key = Object.keys(headers).find((candidate) => candidate.toLowerCase() === expected);
  const value = key ? headers[key] : '';
  return Array.isArray(value) ? String(value[0] || '') : String(value || '');
}

function webhookSecretMatches(headers, expectedSecret) {
  const expected = String(expectedSecret || '');
  const supplied = headerValue(headers, 'x-telegram-bot-api-secret-token');
  const secretPattern = /^[A-Za-z0-9_-]{16,256}$/;
  if (!secretPattern.test(expected) || !secretPattern.test(supplied)) return false;
  const expectedBytes = Buffer.from(expected, 'utf8');
  const suppliedBytes = Buffer.from(supplied, 'utf8');
  return suppliedBytes.length === expectedBytes.length
    && timingSafeEqual(suppliedBytes, expectedBytes);
}

function parseTelegramStart(update) {
  const message = update?.message;
  const text = typeof message?.text === 'string' ? message.text.trim() : '';
  const match = text.match(/^\/start(?:@[A-Za-z0-9_]{5,32})?\s+([A-Za-z0-9_-]{32,64})$/);
  const chatId = String(message?.chat?.id || '');
  const userId = String(message?.from?.id || '');
  if (!match || message?.chat?.type !== 'private'
      || !/^[1-9][0-9]{0,19}$/.test(chatId)
      || chatId !== userId) {
    throw telegramLinkError('TELEGRAM_LINK_UPDATE_IGNORED', 'Telegram update is not a private link command');
  }
  const username = typeof message.from?.username === 'string'
    && BOT_USERNAME_PATTERN.test(message.from.username) ? message.from.username : null;
  return { token: match[1], chatId, userId, username };
}

function parseTelegramPrivateCommand(update) {
  const message = update?.message;
  const text = typeof message?.text === 'string' ? message.text.trim() : '';
  const match = text.match(/^\/(start|help|settings)(?:@[A-Za-z0-9_]{5,32})?$/);
  const chatId = String(message?.chat?.id || '');
  const userId = String(message?.from?.id || '');
  if (!match || message?.chat?.type !== 'private'
      || !/^[1-9][0-9]{0,19}$/.test(chatId)
      || chatId !== userId) {
    throw telegramLinkError('TELEGRAM_COMMAND_UPDATE_IGNORED',
      'Telegram update is not a supported private command');
  }
  return { command: match[1], chatId, userId };
}

module.exports = {
  buildTelegramLink,
  generateLinkToken,
  hashLinkToken,
  normalizeBotUsername,
  parseTelegramPrivateCommand,
  parseTelegramStart,
  webhookSecretMatches,
};
