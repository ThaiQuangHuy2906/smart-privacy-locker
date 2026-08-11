'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildTelegramLink,
  generateLinkToken,
  hashLinkToken,
  parseTelegramPrivateCommand,
  parseTelegramStart,
  webhookSecretMatches,
} = require('../lib/telegram-link');
const { makeRuntime, headers, LOCKER_A } = require('./helpers');

const LINK_TOKEN = 'A'.repeat(43);
const WEBHOOK_SECRET = 'telegram_webhook_test_secret_2026';

class TelegramLinkData {
  constructor() {
    this.links = new Map();
    this.settings = new Map();
  }

  async issueTelegramLink(lockerId, ownerId, tokenHash) {
    this.links.clear();
    this.links.set(tokenHash, { lockerId, ownerId });
    return { expires_at: '2026-08-11T12:10:00.000Z' };
  }

  async consumeTelegramLink({ tokenHash, chatId, userId, username }) {
    const link = this.links.get(tokenHash);
    if (!link) throw Object.assign(new Error('expired'), {
      code: 'TELEGRAM_LINK_INVALID_OR_EXPIRED', status: 400,
    });
    if (link.consumed) {
      if (link.consumed.chatId === chatId && link.consumed.userId === userId) {
        return { locker_id: link.lockerId, telegram_username: username };
      }
      throw Object.assign(new Error('expired'), {
        code: 'TELEGRAM_LINK_INVALID_OR_EXPIRED', status: 400,
      });
    }
    link.consumed = { chatId, userId };
    this.settings.set(link.lockerId, {
      locker_id: link.lockerId,
      telegram_enabled: true,
      telegram_chat_id: chatId,
      telegram_user_id: userId,
      telegram_username: username,
      telegram_linked_at: '2026-08-11T12:01:00.000Z',
      email_enabled: false,
      email_address: null,
      report_time: '21:00',
      timezone: 'Asia/Ho_Chi_Minh',
    });
    return { locker_id: link.lockerId, telegram_username: username };
  }

  async getSettings(lockerId) {
    return this.settings.get(lockerId) || {
      locker_id: lockerId,
      telegram_enabled: false,
      telegram_chat_id: null,
      telegram_user_id: null,
      telegram_username: null,
      telegram_linked_at: null,
      email_enabled: false,
      email_address: null,
      report_time: '21:00',
      timezone: 'Asia/Ho_Chi_Minh',
    };
  }

  async disconnectTelegram(lockerId) {
    this.settings.delete(lockerId);
    return this.getSettings(lockerId);
  }
}

test('Telegram deep-link token is URL-safe, fixed-entropy, and stored only as SHA-256', () => {
  const token = generateLinkToken(() => Buffer.alloc(32, 0xff));
  assert.match(token, /^[A-Za-z0-9_-]{43}$/);
  assert.match(hashLinkToken(token), /^[0-9a-f]{64}$/);
  assert.doesNotMatch(hashLinkToken(token), new RegExp(token));
  assert.equal(buildTelegramLink('@SmartLockerBot', token),
    `https://t.me/SmartLockerBot?start=${token}`);
});

test('Telegram webhook secret uses exact case-insensitive-header lookup and rejects invalid secrets', () => {
  assert.equal(webhookSecretMatches(
    { 'X-Telegram-Bot-Api-Secret-Token': WEBHOOK_SECRET }, WEBHOOK_SECRET), true);
  assert.equal(webhookSecretMatches(
    { 'x-telegram-bot-api-secret-token': `${WEBHOOK_SECRET}x` }, WEBHOOK_SECRET), false);
  assert.equal(webhookSecretMatches(
    { 'x-telegram-bot-api-secret-token': 'é'.repeat(WEBHOOK_SECRET.length) }, WEBHOOK_SECRET), false);
  assert.equal(webhookSecretMatches({}, 'short'), false);
});

test('Telegram linking accepts only private /start payloads whose chat equals the sender', () => {
  const valid = parseTelegramStart({ message: {
    text: `/start ${LINK_TOKEN}`,
    chat: { id: 123456789, type: 'private' },
    from: { id: 123456789, username: 'owner_demo' },
  } });
  assert.deepEqual(valid, {
    token: LINK_TOKEN, chatId: '123456789', userId: '123456789', username: 'owner_demo',
  });
  assert.throws(() => parseTelegramStart({ message: {
    text: `/start ${LINK_TOKEN}`,
    chat: { id: -100123, type: 'supergroup' }, from: { id: 123456789 },
  } }), (error) => error.code === 'TELEGRAM_LINK_UPDATE_IGNORED');
  assert.throws(() => parseTelegramStart({ message: {
    text: `/start ${LINK_TOKEN}`,
    chat: { id: 987654321, type: 'private' }, from: { id: 123456789 },
  } }), (error) => error.code === 'TELEGRAM_LINK_UPDATE_IGNORED');
});

test('Telegram help commands are accepted only from the matching private account', () => {
  for (const command of ['start', 'help', 'settings']) {
    assert.deepEqual(parseTelegramPrivateCommand({ message: {
      text: `/${command}`,
      chat: { id: 123456789, type: 'private' },
      from: { id: 123456789 },
    } }), { command, chatId: '123456789', userId: '123456789' });
  }
  assert.throws(() => parseTelegramPrivateCommand({ message: {
    text: '/help', chat: { id: -100123, type: 'supergroup' }, from: { id: 123456789 },
  } }), (error) => error.code === 'TELEGRAM_COMMAND_UPDATE_IGNORED');
  assert.throws(() => parseTelegramPrivateCommand({ message: {
    text: '/start unexpected-argument',
    chat: { id: 123456789, type: 'private' }, from: { id: 123456789 },
  } }), (error) => error.code === 'TELEGRAM_COMMAND_UPDATE_IGNORED');
});

test('Telegram private help commands explain the Dashboard linking flow', async () => {
  const sends = [];
  const { runtime } = makeRuntime({
    telegramTransport: async (payload) => { sends.push(payload); },
    runtimeOptions: { telegramWebhookSecret: WEBHOOK_SECRET },
  });
  const result = await runtime.telegramWebhook({
    headers: { 'x-telegram-bot-api-secret-token': WEBHOOK_SECRET },
    body: { message: {
      text: '/help', chat: { id: 123456789, type: 'private' }, from: { id: 123456789 },
    } },
  });
  assert.equal(result.status, 200);
  assert.equal(result.code, 'TELEGRAM_COMMAND_HANDLED');
  assert.equal(sends.length, 1);
  assert.equal(sends[0].chatId, '123456789');
  assert.match(sends[0].text, /Liên kết Telegram/);
  assert.match(sends[0].text, /https:\/\/dashboard\.example\.test/);
});

test('invalid bot routing is rejected before a one-time token is persisted', async () => {
  const data = new TelegramLinkData();
  const { runtime } = makeRuntime({
    telegramTransport: async () => {},
    runtimeOptions: {
      data,
      telegramBotUsername: '',
      telegramWebhookSecret: WEBHOOK_SECRET,
      linkTokenFactory: () => LINK_TOKEN,
    },
  });
  const result = await runtime.protectedTelegramLink({ headers: headers(), lockerId: LOCKER_A });
  assert.equal(result.status, 503);
  assert.equal(result.code, 'TELEGRAM_BOT_NOT_CONFIGURED');
  assert.equal(data.links.size, 0);
});

test('owner-issued token links one private chat once and alert delivery uses that locker destination', async () => {
  const data = new TelegramLinkData();
  const sends = [];
  const { runtime } = makeRuntime({
    telegramTransport: async (payload) => { sends.push(payload); },
    runtimeOptions: {
      data,
      telegramBotUsername: 'SmartLockerBot',
      telegramWebhookSecret: WEBHOOK_SECRET,
      linkTokenFactory: () => LINK_TOKEN,
    },
  });

  const denied = await runtime.protectedTelegramLink({ headers: headers('token-b'), lockerId: LOCKER_A });
  assert.equal(denied.status, 403);
  assert.equal(data.links.size, 0);

  const issued = await runtime.protectedTelegramLink({ headers: headers(), lockerId: LOCKER_A });
  assert.equal(issued.status, 201);
  assert.equal(issued.link_url, `https://t.me/SmartLockerBot?start=${LINK_TOKEN}`);
  assert.equal(data.links.has(hashLinkToken(LINK_TOKEN)), true);
  assert.equal(data.links.has(LINK_TOKEN), false);

  const unauthorized = await runtime.telegramWebhook({
    headers: { 'x-telegram-bot-api-secret-token': 'wrong_secret_value_2026' }, body: {},
  });
  assert.equal(unauthorized.status, 401);

  const linked = await runtime.telegramWebhook({
    headers: { 'x-telegram-bot-api-secret-token': WEBHOOK_SECRET },
    body: { message: {
      text: `/start ${LINK_TOKEN}`,
      chat: { id: 123456789, type: 'private' },
      from: { id: 123456789, username: 'owner_demo' },
    } },
  });
  assert.equal(linked.accepted, true);
  assert.equal(sends[0].chatId, '123456789');

  const settingResult = await runtime.protectedSettings({ headers: headers(), lockerId: LOCKER_A });
  assert.deepEqual(settingResult.setting, {
    locker_id: LOCKER_A,
    telegram_enabled: true,
    telegram_connected: true,
    telegram_username: 'owner_demo',
    telegram_linked_at: '2026-08-11T12:01:00.000Z',
    email_enabled: false,
    email_address: null,
    report_time: '21:00',
    timezone: 'Asia/Ho_Chi_Minh',
  });
  assert.equal(Object.hasOwn(settingResult.setting, 'telegram_chat_id'), false);
  assert.equal(Object.hasOwn(settingResult.setting, 'telegram_user_id'), false);

  const alert = await runtime.notifyTelegram({
    event_id: '10000000-0000-4000-8000-000000000111',
    locker_id: LOCKER_A,
    occurred_at: '2026-08-11T12:02:00.000Z',
    device_state: { door: 'OPEN', lock: 'LOCKED' },
  });
  assert.equal(alert.status, 'delivered');
  assert.equal(sends[1].chatId, '123456789');

  const retry = await runtime.telegramWebhook({
    headers: { 'x-telegram-bot-api-secret-token': WEBHOOK_SECRET },
    body: { message: {
      text: `/start ${LINK_TOKEN}`,
      chat: { id: 123456789, type: 'private' }, from: { id: 123456789 },
    } },
  });
  assert.equal(retry.accepted, true,
    'an exact Telegram retry must be idempotent after a lost webhook response');

  const retarget = await runtime.telegramWebhook({
    headers: { 'x-telegram-bot-api-secret-token': WEBHOOK_SECRET },
    body: { message: {
      text: `/start ${LINK_TOKEN}`,
      chat: { id: 987654321, type: 'private' }, from: { id: 987654321 },
    } },
  });
  assert.equal(retarget.accepted, false);
  assert.equal(retarget.code, 'TELEGRAM_LINK_INVALID_OR_EXPIRED');
});

test('Telegram asks for a webhook retry on transient database failure', async () => {
  const sends = [];
  const { runtime } = makeRuntime({
    telegramTransport: async (payload) => { sends.push(payload); },
    runtimeOptions: {
      data: {
        consumeTelegramLink: async () => {
          throw Object.assign(new Error('temporary outage'), { code: 'DATA_TIMEOUT', status: 503 });
        },
      },
      telegramWebhookSecret: WEBHOOK_SECRET,
    },
  });
  const result = await runtime.telegramWebhook({
    headers: { 'x-telegram-bot-api-secret-token': WEBHOOK_SECRET },
    body: { message: {
      text: `/start ${LINK_TOKEN}`,
      chat: { id: 123456789, type: 'private' }, from: { id: 123456789 },
    } },
  });
  assert.equal(result.status, 503);
  assert.equal(result.code, 'TELEGRAM_LINK_SERVICE_UNAVAILABLE');
  assert.equal(sends.length, 0);
});

test('Telegram retries an unknown provider 400 instead of acknowledging a valid link attempt', async () => {
  const sends = [];
  const { runtime } = makeRuntime({
    telegramTransport: async (payload) => { sends.push(payload); },
    runtimeOptions: {
      data: {
        consumeTelegramLink: async () => {
          throw Object.assign(new Error('unexpected provider rejection'), {
            code: 'DATA_HTTP_400', status: 400,
          });
        },
      },
      telegramWebhookSecret: WEBHOOK_SECRET,
    },
  });
  const result = await runtime.telegramWebhook({
    headers: { 'x-telegram-bot-api-secret-token': WEBHOOK_SECRET },
    body: { message: {
      text: `/start ${LINK_TOKEN}`,
      chat: { id: 123456789, type: 'private' }, from: { id: 123456789 },
    } },
  });
  assert.equal(result.status, 503);
  assert.equal(result.code, 'TELEGRAM_LINK_SERVICE_UNAVAILABLE');
  assert.equal(sends.length, 0);
});

test('a committed link stays successful when only its confirmation message fails', async () => {
  const data = new TelegramLinkData();
  await data.issueTelegramLink(LOCKER_A, 'user-a', hashLinkToken(LINK_TOKEN));
  const { runtime } = makeRuntime({
    telegramTransport: async () => { throw Object.assign(new Error('send failed'), { code: 'HTTP_503' }); },
    runtimeOptions: { data, telegramWebhookSecret: WEBHOOK_SECRET },
  });
  const result = await runtime.telegramWebhook({
    headers: { 'x-telegram-bot-api-secret-token': WEBHOOK_SECRET },
    body: { message: {
      text: `/start ${LINK_TOKEN}`,
      chat: { id: 123456789, type: 'private' }, from: { id: 123456789 },
    } },
  });
  assert.equal(result.status, 200);
  assert.equal(result.accepted, true);
  assert.equal(result.code, 'TELEGRAM_LINKED_CONFIRMATION_FAILED');
  assert.equal((await data.getSettings(LOCKER_A)).telegram_chat_id, '123456789');
});
