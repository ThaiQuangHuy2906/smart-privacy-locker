'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..', '..');
const source = fs.readFileSync(path.join(root, 'dashboard', 'app.js'), 'utf8');

function jsonResponse(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function settle(turns = 6) {
  for (let index = 0; index < turns; index += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

class FakeElement {
  constructor(id, values = {}) {
    this.id = id;
    this.textContent = '';
    this.value = '';
    this.hidden = false;
    this.disabled = false;
    this.dataset = {};
    this.attributes = new Map();
    this.listeners = new Map();
    Object.assign(this, values);
  }

  addEventListener(type, handler) {
    const handlers = this.listeners.get(type) || [];
    handlers.push(handler);
    this.listeners.set(type, handlers);
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  removeAttribute(name) {
    this.attributes.delete(name);
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }

  focus() {
    this.focused = true;
  }

  async dispatch(type, values = {}) {
    const event = {
      target: this,
      currentTarget: this,
      defaultPrevented: false,
      preventDefault() { this.defaultPrevented = true; },
      ...values,
    };
    const results = (this.listeners.get(type) || []).map((handler) => handler(event));
    await Promise.all(results);
    return event;
  }
}

function liveState(overrides = {}) {
  return {
    mqtt: 'CONNECTED',
    device: 'ONLINE',
    wifi: 'CONNECTED',
    door: 'CLOSED',
    lock: 'LOCKED',
    alarm: 'INACTIVE',
    led: 'OFF',
    lock_unconfirmed: false,
    last_updated: '2026-08-09T00:00:00.000Z',
    latest_alert: null,
    stale: false,
    controls: {
      lock: { enabled: true, pending: false },
      alarm: { enabled: true, pending: false },
      led: { enabled: true, pending: false },
    },
    ...overrides,
  };
}

function createHarness({ hash = '', storedSession = null, fetchImpl, popupBlocked = false } = {}) {
  const ids = [
    'auth-form', 'full-name-field', 'full-name', 'email', 'password', 'auth-submit',
    'auth-mode-toggle', 'logout', 'session-label', 'auth-message',
    'claim-form', 'claim-button', 'locker-code', 'claim-message', 'locker-id', 'mqtt', 'device', 'wifi', 'door', 'lock', 'alarm', 'led', 'updated',
    'alert', 'state-message', 'control-hint', 'command-message', 'chat-form', 'question', 'chat-hint', 'chat-submit', 'answer',
    'range-days', 'refresh-phase3', 'history-list', 'history-message', 'chart-summary', 'chart-bars', 'chart-empty',
    'chart-table-body', 'data-access-hint',
    'settings-form', 'telegram-enabled', 'telegram-connection', 'telegram-status',
    'telegram-link', 'telegram-open-link', 'telegram-test', 'telegram-disconnect', 'email-enabled',
    'report-email', 'report-email-field', 'report-time', 'report-time-field',
    'report-timezone', 'report-timezone-field',
    'load-settings', 'save-settings', 'settings-message', 'settings-access-hint',
  ];
  const elements = Object.fromEntries(ids.map((id) => [id, new FakeElement(id)]));
  elements['locker-code'].value = 'LOCKER-001';
  elements['locker-id'].value = 'LOCKER-001';
  elements.email.value = 'user@example.test';
  elements.password.value = 'password-123';
  elements.question.value = 'Cửa tủ đang đóng hay mở?';
  elements['range-days'].value = '7';
  elements['report-time'].value = '21:00';
  elements['report-timezone'].value = 'Asia/Ho_Chi_Minh';
  elements['chart-empty'].hidden = true;
  elements['telegram-open-link'].hidden = true;
  elements['telegram-test'].hidden = true;
  elements['telegram-disconnect'].hidden = true;

  const actionButtons = [
    new FakeElement('lock', { dataset: { action: 'LOCK', domain: 'lock' } }),
    new FakeElement('unlock', { dataset: { action: 'UNLOCK', domain: 'lock' } }),
    new FakeElement('alarm-on', { dataset: { action: 'ALARM_ON', domain: 'alarm' } }),
    new FakeElement('alarm-off', { dataset: { action: 'ALARM_OFF', domain: 'alarm' } }),
    new FakeElement('led-on', { dataset: { action: 'LED_ON', domain: 'led' } }),
    new FakeElement('led-off', { dataset: { action: 'LED_OFF', domain: 'led' } }),
  ];
  const documentListeners = new Map();
  const document = {
    title: 'Smart Privacy Locker',
    visibilityState: 'visible',
    getElementById: (id) => elements[id],
    querySelectorAll: (selector) => (selector === '[data-action]' ? actionButtons : []),
    addEventListener(type, handler) { documentListeners.set(type, handler); },
  };

  const stored = new Map();
  if (storedSession) stored.set('smart-locker-phase2-session', JSON.stringify(storedSession));
  const sessionStorage = {
    getItem: (key) => stored.get(key) ?? null,
    setItem: (key, value) => stored.set(key, value),
    removeItem: (key) => stored.delete(key),
  };

  const location = { hash, pathname: '/locker', search: '?view=live' };
  const replacedUrls = [];
  const openedWindows = [];
  const history = {
    replaceState(_state, _title, url) {
      replacedUrls.push(url);
      location.hash = '';
    },
  };

  let nextTimerId = 0;
  const timeouts = new Map();
  const intervals = new Map();
  const setTimeoutFake = (callback, delay) => {
    const id = ++nextTimerId;
    timeouts.set(id, { callback, delay });
    return id;
  };
  const clearTimeoutFake = (id) => timeouts.delete(id);
  const setIntervalFake = (callback, delay) => {
    const id = ++nextTimerId;
    intervals.set(id, { callback, delay });
    return id;
  };

  const fetchCalls = [];
  const fetch = (url, options = {}) => {
    fetchCalls.push({ url, options });
    return fetchImpl(url, options, fetchCalls.length);
  };

  const open = (url, target) => {
    if (popupBlocked) return null;
    const popup = { opener: {}, location: { href: url }, closed: false,
      close() { this.closed = true; } };
    openedWindows.push({ url, target, popup });
    return popup;
  };

  const context = vm.createContext({
    document,
    window: { location, history, open, confirm: () => true },
    sessionStorage,
    fetch,
    setTimeout: setTimeoutFake,
    clearTimeout: clearTimeoutFake,
    setInterval: setIntervalFake,
    clearInterval: () => {},
    AbortController,
    URLSearchParams,
    Date,
    JSON,
    Object,
    Error,
    Promise,
    encodeURIComponent,
  });
  vm.runInContext(source, context, { filename: 'dashboard/app.js' });

  return {
    elements,
    actionButtons,
    stored,
    location,
    replacedUrls,
    fetchCalls,
    openedWindows,
    timeouts,
    intervals,
    document,
    documentListeners,
  };
}

test('implicit-flow callback is persisted and removed from the address bar before async startup', async () => {
  const harness = createHarness({
    hash: '#access_token=callback-token&refresh_token=refresh-token&expires_in=3600&token_type=bearer&type=signup',
    fetchImpl: async (url) => url === '/api/v1/public-config'
      ? jsonResponse(200, { supabase_url: 'https://supabase.example.test', supabase_anon_key: 'anon-key' })
      : jsonResponse(200, liveState()),
  });

  assert.equal(harness.location.hash, '');
  assert.deepEqual(harness.replacedUrls, ['/locker?view=live']);
  const saved = JSON.parse(harness.stored.get('smart-locker-phase2-session'));
  assert.equal(saved.access_token, 'callback-token');
  assert.equal(saved.refresh_token, 'refresh-token');
  assert.ok(saved.expires_at > Math.floor(Date.now() / 1000));
  await settle();
  assert.match(harness.elements['auth-message'].textContent, /thành công/i);
});

test('implicit-flow errors clear an old session, strip the fragment, and remain actionable', async () => {
  const harness = createHarness({
    hash: '#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid',
    storedSession: { access_token: 'old-token', expires_at: Math.floor(Date.now() / 1000) + 3600 },
    fetchImpl: async () => jsonResponse(200, { supabase_url: 'https://supabase.example.test', supabase_anon_key: 'anon-key' }),
  });

  assert.equal(harness.location.hash, '');
  assert.equal(harness.stored.has('smart-locker-phase2-session'), false);
  await settle();
  assert.match(harness.elements['auth-message'].textContent, /otp_expired/i);
  assert.match(harness.elements['auth-message'].textContent, /Email link is invalid/i);
});

test('auth uses one unambiguous form submit and Enter follows the selected mode', async () => {
  const harness = createHarness({
    fetchImpl: async (url) => {
      if (url === '/api/v1/public-config') return jsonResponse(200, { supabase_url: 'https://supabase.example.test', supabase_anon_key: 'anon-key' });
      if (url.endsWith('/auth/v1/signup')) return jsonResponse(200, {});
      if (url.includes('grant_type=password')) return jsonResponse(200, {
        access_token: 'login-token', refresh_token: 'refresh-token', expires_at: Math.floor(Date.now() / 1000) + 3600,
      });
      return jsonResponse(200, liveState());
    },
  });
  await settle();
  assert.equal(harness.elements['auth-form'].listeners.has('click'), false);
  assert.equal(harness.elements['auth-form'].listeners.has('submit'), true);

  await harness.elements['auth-mode-toggle'].dispatch('click');
  harness.elements['full-name'].value = 'Nguyễn Văn A';
  const registerEvent = await harness.elements['auth-form'].dispatch('submit');
  assert.equal(registerEvent.defaultPrevented, true);
  const signup = harness.fetchCalls.find((call) => call.url.endsWith('/auth/v1/signup'));
  assert.deepEqual(JSON.parse(signup.options.body), {
    email: 'user@example.test', password: 'password-123', data: { full_name: 'Nguyễn Văn A' },
  });

  await harness.elements['auth-mode-toggle'].dispatch('click');
  harness.elements.password.value = 'password-123';
  const loginEvent = await harness.elements['auth-form'].dispatch('submit');
  assert.equal(loginEvent.defaultPrevented, true);
  assert.ok(harness.fetchCalls.some((call) => call.url.includes('grant_type=password')));
});

test('auth mode exposes registration-only identity fields and correct password autocomplete', async () => {
  const harness = createHarness({
    fetchImpl: async (url) => url === '/api/v1/public-config'
      ? jsonResponse(200, { supabase_url: 'https://supabase.example.test', supabase_anon_key: 'anon-key' })
      : jsonResponse(200, liveState()),
  });
  await settle();

  assert.equal(harness.elements['full-name-field'].hidden, true);
  assert.equal(harness.elements['full-name'].required, false);
  assert.equal(harness.elements.password.autocomplete, 'current-password');

  await harness.elements['auth-mode-toggle'].dispatch('click');
  assert.equal(harness.elements['full-name-field'].hidden, false);
  assert.equal(harness.elements['full-name'].required, true);
  assert.equal(harness.elements.password.autocomplete, 'new-password');
  assert.equal(harness.elements['full-name'].focused, true);
  assert.equal(harness.elements['auth-mode-toggle'].attributes.has('aria-pressed'), false);

  await harness.elements['auth-mode-toggle'].dispatch('click');
  assert.equal(harness.elements['full-name-field'].hidden, true);
  assert.equal(harness.elements['full-name'].required, false);
  assert.equal(harness.elements.password.autocomplete, 'current-password');
  assert.equal(harness.elements.email.focused, true);
});

test('authenticated session hides credential fields and never exposes transport jargon', async () => {
  const restored = { access_token: 'session-token', refresh_token: 'refresh-token',
    expires_at: Math.floor(Date.now() / 1000) + 3600, user: { email: 'owner@example.test' } };
  const harness = createHarness({
    storedSession: restored,
    fetchImpl: async (url) => url === '/api/v1/public-config'
      ? jsonResponse(200, { supabase_url: 'https://supabase.example.test', supabase_anon_key: 'anon-key' })
      : jsonResponse(200, liveState()),
  });
  await settle();

  assert.equal(harness.elements['auth-form'].hidden, true);
  assert.equal(harness.elements['session-label'].textContent, 'Đã đăng nhập · owner@example.test');
  assert.doesNotMatch(harness.elements['session-label'].textContent, /Bearer|token/i);
});

test('startup retries public configuration and enables authentication after recovery', async () => {
  let configRequests = 0;
  const harness = createHarness({
    fetchImpl: async (url) => {
      if (url === '/api/v1/public-config') {
        configRequests += 1;
        return configRequests === 1
          ? jsonResponse(503, { code: 'CONFIG_TEMPORARILY_UNAVAILABLE' })
          : jsonResponse(200, { supabase_url: 'https://supabase.example.test', supabase_anon_key: 'anon-key' });
      }
      return jsonResponse(200, liveState());
    },
  });
  await settle();

  assert.match(harness.elements['auth-message'].textContent, /tự thử lại/i);
  assert.equal(harness.elements['auth-submit'].disabled, true);
  assert.equal(harness.elements['auth-mode-toggle'].disabled, true);
  const retry = [...harness.timeouts.values()].find((value) => value.delay === 5000);
  assert.ok(retry);

  await retry.callback();
  await settle();
  assert.equal(configRequests, 2);
  assert.equal(harness.elements['auth-submit'].disabled, false);
  assert.equal(harness.elements['auth-mode-toggle'].disabled, false);
  assert.ok([...harness.timeouts.values()].some((value) => value.delay === 5000));
  assert.equal(harness.intervals.size, 0);
});

test('startup preserves an expired restorable session during a transient refresh outage', async () => {
  const expired = { access_token: 'expired-access', refresh_token: 'kept-refresh',
    expires_at: Math.floor(Date.now() / 1000) - 1 };
  let refreshRequests = 0;
  let stateRequests = 0;
  const harness = createHarness({
    storedSession: expired,
    fetchImpl: async (url) => {
      if (url === '/api/v1/public-config') {
        return jsonResponse(200, { supabase_url: 'https://supabase.example.test', supabase_anon_key: 'anon-key' });
      }
      if (url.includes('grant_type=refresh_token')) {
        refreshRequests += 1;
        return jsonResponse(503, { code: 'AUTH_PROVIDER_UNAVAILABLE' });
      }
      if (url.startsWith('/api/v1/lockers/') && url.endsWith('/state')) {
        stateRequests += 1;
        return jsonResponse(401, { code: 'INVALID_SESSION' });
      }
      return jsonResponse(200, {});
    },
  });
  await settle();

  assert.equal(refreshRequests, 1);
  assert.equal(stateRequests, 0, 'an expired access token must not be sent to protected polling');
  assert.equal(JSON.parse(harness.stored.get('smart-locker-phase2-session')).refresh_token,
    'kept-refresh');
  assert.match(harness.elements['auth-message'].textContent, /tạm thời không khả dụng/i);
  assert.ok([...harness.timeouts.values()].some((value) => value.delay === 30_000),
    'one provider-outage retry must remain scheduled');
  assert.ok(harness.actionButtons.every((button) => button.disabled));
});

test('startup session refresh is single-flight when its expiry timer fires in parallel', async () => {
  const expired = { access_token: 'expired-access', refresh_token: 'rotating-refresh',
    expires_at: Math.floor(Date.now() / 1000) - 1 };
  const refreshResponse = deferred();
  let refreshRequests = 0;
  const harness = createHarness({
    storedSession: expired,
    fetchImpl: async (url) => {
      if (url === '/api/v1/public-config') {
        return jsonResponse(200, { supabase_url: 'https://supabase.example.test', supabase_anon_key: 'anon-key' });
      }
      if (url.includes('grant_type=refresh_token')) {
        refreshRequests += 1;
        return refreshResponse.promise;
      }
      return jsonResponse(200, liveState());
    },
  });
  await settle();

  assert.equal(refreshRequests, 1);
  const expiryTimer = [...harness.timeouts.values()].find((value) => value.delay === 1000);
  assert.ok(expiryTimer);
  const parallelRefresh = expiryTimer.callback();
  await settle();
  assert.equal(refreshRequests, 1, 'one session generation must have at most one refresh request');

  refreshResponse.resolve(jsonResponse(200, {
    access_token: 'new-access', refresh_token: 'new-refresh',
    expires_at: Math.floor(Date.now() / 1000) + 3600,
  }));
  await parallelRefresh;
  await settle();
  assert.equal(JSON.parse(harness.stored.get('smart-locker-phase2-session')).access_token,
    'new-access');
});

test('auth submit before public config is ready fails closed without issuing credentials', async () => {
  const publicConfig = deferred();
  const harness = createHarness({
    fetchImpl: async (url) => {
      if (url === '/api/v1/public-config') return publicConfig.promise;
      if (url.includes('grant_type=password')) return jsonResponse(200, {
        access_token: 'login-token', refresh_token: 'refresh-token', expires_at: Math.floor(Date.now() / 1000) + 3600,
      });
      return jsonResponse(200, liveState());
    },
  });

  const event = await harness.elements['auth-form'].dispatch('submit', { submitter: null });
  assert.equal(event.defaultPrevented, true);
  assert.equal(harness.elements.password.value, '');
  assert.match(harness.elements['auth-message'].textContent, /đang khởi tạo/i);
  assert.equal(harness.fetchCalls.some((call) => call.url.includes('grant_type=password')), false);

  publicConfig.resolve(jsonResponse(200, {
    supabase_url: 'https://supabase.example.test', supabase_anon_key: 'anon-key',
  }));
  await settle();
  harness.elements.password.value = 'password-123';
  await harness.elements['auth-form'].dispatch('submit', { submitter: null });
  assert.ok(harness.fetchCalls.some((call) => call.url.includes('grant_type=password')));
});

test('authentication removes the submitted password from the DOM immediately', async () => {
  const login = deferred();
  const harness = createHarness({
    fetchImpl: async (url) => {
      if (url === '/api/v1/public-config') return jsonResponse(200, { supabase_url: 'https://supabase.example.test', supabase_anon_key: 'anon-key' });
      if (url.includes('grant_type=password')) return login.promise;
      return jsonResponse(200, liveState());
    },
  });
  await settle();
  harness.elements.password.value = 'do-not-leave-in-dom';

  const loginRequest = harness.elements['auth-form'].dispatch('submit', { submitter: null });
  await settle();
  assert.equal(harness.elements.password.value, '');

  login.resolve(jsonResponse(200, {
    access_token: 'session-token', refresh_token: 'refresh-token', expires_at: Math.floor(Date.now() / 1000) + 3600,
  }));
  await loginRequest;
});

test('logout cannot be undone by an older authentication request completing late', async () => {
  const restored = { access_token: 'old-session', refresh_token: 'old-refresh', expires_at: Math.floor(Date.now() / 1000) + 3600 };
  const login = deferred();
  const harness = createHarness({
    storedSession: restored,
    fetchImpl: async (url) => {
      if (url === '/api/v1/public-config') return jsonResponse(200, { supabase_url: 'https://supabase.example.test', supabase_anon_key: 'anon-key' });
      if (url.includes('grant_type=password')) return login.promise;
      if (url.endsWith('/auth/v1/logout')) return jsonResponse(204, {});
      return jsonResponse(200, liveState());
    },
  });
  await settle();

  const loginPromise = harness.elements['auth-form'].dispatch('submit', { submitter: null });
  await settle();
  await harness.elements.logout.dispatch('click');
  login.resolve(jsonResponse(200, {
    access_token: 'late-session', refresh_token: 'late-refresh', expires_at: Math.floor(Date.now() / 1000) + 3600,
  }));
  await loginPromise;

  assert.equal(harness.stored.has('smart-locker-phase2-session'), false);
  assert.equal(harness.elements['session-label'].textContent, 'Chưa đăng nhập');
});

test('an old authentication finally cannot unlock a newer pending login form', async () => {
  const restored = { access_token: 'old-session', refresh_token: 'old-refresh', expires_at: Math.floor(Date.now() / 1000) + 3600 };
  const firstLogin = deferred();
  const secondLogin = deferred();
  let loginRequests = 0;
  const harness = createHarness({
    storedSession: restored,
    fetchImpl: async (url) => {
      if (url === '/api/v1/public-config') return jsonResponse(200, { supabase_url: 'https://supabase.example.test', supabase_anon_key: 'anon-key' });
      if (url.endsWith('/auth/v1/logout')) return jsonResponse(204, {});
      if (url.includes('grant_type=password')) {
        loginRequests += 1;
        return loginRequests === 1 ? firstLogin.promise : secondLogin.promise;
      }
      return jsonResponse(200, liveState());
    },
  });
  await settle();

  const oldRequest = harness.elements['auth-form'].dispatch('submit', { submitter: null });
  await settle();
  await harness.elements.logout.dispatch('click');
  harness.elements.email.value = 'new@example.test';
  harness.elements.password.value = 'new-password';
  const newRequest = harness.elements['auth-form'].dispatch('submit', { submitter: null });
  await settle();
  assert.equal(harness.elements['auth-form'].dataset.pending, 'true');

  firstLogin.resolve(jsonResponse(200, {
    access_token: 'stale-session', refresh_token: 'stale-refresh', expires_at: Math.floor(Date.now() / 1000) + 3600,
  }));
  await oldRequest;
  assert.equal(harness.elements['auth-form'].dataset.pending, 'true');
  await harness.elements['auth-form'].dispatch('submit', { submitter: null });
  assert.equal(loginRequests, 2);

  secondLogin.resolve(jsonResponse(200, {
    access_token: 'new-session', refresh_token: 'new-refresh', expires_at: Math.floor(Date.now() / 1000) + 3600,
  }));
  await newRequest;
  assert.equal(harness.elements['auth-form'].dataset.pending, 'false');
});

test('claim switches the tracked locker before requesting its live state', async () => {
  const restored = { access_token: 'session-token', refresh_token: 'refresh-token', expires_at: Math.floor(Date.now() / 1000) + 3600 };
  const harness = createHarness({
    storedSession: restored,
    fetchImpl: async (url) => {
      if (url === '/api/v1/public-config') return jsonResponse(200, { supabase_url: 'https://supabase.example.test', supabase_anon_key: 'anon-key' });
      if (url === '/api/v1/lockers/claim') return jsonResponse(200, { ok: true, locker: { locker_code: 'LOCKER-002' } });
      return jsonResponse(200, liveState());
    },
  });
  await settle();
  harness.elements['locker-code'].value = 'LOCKER-002';
  await harness.elements['claim-form'].dispatch('submit');

  assert.equal(harness.elements['locker-id'].value, 'LOCKER-002');
  assert.ok(harness.fetchCalls.some((call) => call.url === '/api/v1/lockers/LOCKER-002/state'));
});

test('successful claim remains visible after the immediate live-state poll', async () => {
  const restored = { access_token: 'session-token', refresh_token: 'refresh-token', expires_at: Math.floor(Date.now() / 1000) + 3600 };
  const harness = createHarness({
    storedSession: restored,
    fetchImpl: async (url) => {
      if (url === '/api/v1/public-config') return jsonResponse(200, { supabase_url: 'https://supabase.example.test', supabase_anon_key: 'anon-key' });
      if (url === '/api/v1/lockers/claim') return jsonResponse(200, { ok: true, locker: { locker_code: 'LOCKER-002' } });
      return jsonResponse(200, liveState());
    },
  });
  await settle();

  harness.elements['locker-code'].value = 'LOCKER-002';
  await harness.elements['claim-form'].dispatch('submit');

  assert.equal(
    harness.elements['claim-message'].textContent,
    'Claim thành công: LOCKER-002; đang xác minh live state.',
  );
  assert.match(harness.elements['state-message'].textContent, /mới nhất.*xác nhận/i);
});

test('rejected claim remains visible after a later live-state poll', async () => {
  const restored = { access_token: 'session-token', refresh_token: 'refresh-token', expires_at: Math.floor(Date.now() / 1000) + 3600 };
  const harness = createHarness({
    storedSession: restored,
    fetchImpl: async (url) => {
      if (url === '/api/v1/public-config') return jsonResponse(200, { supabase_url: 'https://supabase.example.test', supabase_anon_key: 'anon-key' });
      if (url === '/api/v1/lockers/claim') return jsonResponse(409, { code: 'CLAIM_REJECTED' });
      return jsonResponse(200, liveState());
    },
  });
  await settle();

  await harness.elements['claim-form'].dispatch('submit');
  const pollTimer = [...harness.timeouts.values()].find((value) => value.delay === 5000);
  assert.ok(pollTimer);
  await pollTimer.callback();

  assert.equal(harness.elements['claim-message'].textContent, 'Claim bị từ chối: CLAIM_REJECTED');
  assert.match(harness.elements['state-message'].textContent, /mới nhất.*xác nhận/i);
});

test('claim disables controls until the newly claimed locker has confirmed live state', async () => {
  const restored = { access_token: 'session-token', refresh_token: 'refresh-token', expires_at: Math.floor(Date.now() / 1000) + 3600 };
  const claimedState = deferred();
  const harness = createHarness({
    storedSession: restored,
    fetchImpl: async (url) => {
      if (url === '/api/v1/public-config') return jsonResponse(200, { supabase_url: 'https://supabase.example.test', supabase_anon_key: 'anon-key' });
      if (url === '/api/v1/lockers/claim') return jsonResponse(200, { ok: true, locker: { locker_code: 'LOCKER-002' } });
      if (url === '/api/v1/lockers/LOCKER-002/state') return claimedState.promise;
      return jsonResponse(200, liveState());
    },
  });
  await settle();
  assert.ok(harness.actionButtons.every((button) => !button.disabled));

  harness.elements['locker-code'].value = 'LOCKER-002';
  const claimRequest = harness.elements['claim-form'].dispatch('submit');
  await settle();
  assert.equal(harness.elements['locker-id'].value, 'LOCKER-002');
  assert.ok(harness.actionButtons.every((button) => button.disabled));

  claimedState.resolve(jsonResponse(200, liveState()));
  await claimRequest;
  assert.ok(harness.actionButtons.every((button) => !button.disabled));
});

test('editing the locker ID immediately invalidates old state and blocks commands', async () => {
  const restored = { access_token: 'session-token', refresh_token: 'refresh-token', expires_at: Math.floor(Date.now() / 1000) + 3600 };
  const harness = createHarness({
    storedSession: restored,
    fetchImpl: async (url) => {
      if (url === '/api/v1/public-config') return jsonResponse(200, { supabase_url: 'https://supabase.example.test', supabase_anon_key: 'anon-key' });
      return jsonResponse(200, liveState());
    },
  });
  await settle();
  assert.ok(harness.actionButtons.every((button) => !button.disabled));

  harness.elements['locker-id'].value = 'LOCKER-002';
  await harness.elements['locker-id'].dispatch('input');
  assert.ok(harness.actionButtons.every((button) => button.disabled));
  assert.equal(harness.elements.door.textContent, 'Chưa xác định');
  assert.equal(harness.elements.door.dataset.state, 'unknown');
  assert.equal(harness.elements.alarm.textContent, 'Chưa xác định');
  assert.equal(harness.elements.alarm.dataset.state, 'unknown');
  assert.equal(harness.elements.led.textContent, 'Chưa xác định');
  assert.equal(harness.elements.led.dataset.state, 'unknown');

  await harness.actionButtons[0].dispatch('click');
  assert.equal(harness.fetchCalls.some((call) => call.url === '/api/v1/commands'), false);
});

test('command completion and Telegram failure statuses are localized without false processing text', async () => {
  const restored = { access_token: 'session-token', refresh_token: 'refresh-token',
    expires_at: Math.floor(Date.now() / 1000) + 3600 };
  const harness = createHarness({
    storedSession: restored,
    fetchImpl: async (url) => {
      if (url === '/api/v1/public-config') {
        return jsonResponse(200, { supabase_url: 'https://supabase.example.test', supabase_anon_key: 'anon-key' });
      }
      return jsonResponse(200, liveState({
        command_status: {
          command_id: '50000000-0000-4000-8000-000000000001',
          action: 'LOCK', status: 'COMMAND_SUCCEEDED',
        },
        latest_alert: {
          event_type: 'UNAUTHORIZED_OPEN', occurred_at: '2026-08-09T00:00:00.000Z',
          notification_status: 'failed',
        },
      }));
    },
  });
  await settle();

  assert.match(harness.elements['command-message'].textContent, /thành công/i);
  assert.doesNotMatch(harness.elements['command-message'].textContent, /COMMAND_SUCCEEDED/);
  assert.match(harness.elements.alert.textContent, /gửi thất bại/i);
  assert.doesNotMatch(harness.elements.alert.textContent, /đang xử lý/i);
});

test('unknown command action and status use safe labels instead of raw enums', async () => {
  const restored = { access_token: 'session-token', refresh_token: 'refresh-token',
    expires_at: Math.floor(Date.now() / 1000) + 3600 };
  const harness = createHarness({
    storedSession: restored,
    fetchImpl: async (url) => {
      if (url === '/api/v1/public-config') {
        return jsonResponse(200, { supabase_url: 'https://supabase.example.test', supabase_anon_key: 'anon-key' });
      }
      return jsonResponse(200, liveState({
        command_status: {
          command_id: '50000000-0000-4000-8000-000000000002',
          action: 'FUTURE_ACTION', status: 'FUTURE_STATUS',
        },
      }));
    },
  });
  await settle();

  assert.match(harness.elements['command-message'].textContent,
    /Lệnh chưa xác định: Trạng thái lệnh chưa xác định/);
  assert.doesNotMatch(harness.elements['command-message'].textContent,
    /FUTURE_ACTION|FUTURE_STATUS/);
});

test('stale API values are rendered as unknown instead of current actuator truth', async () => {
  const restored = { access_token: 'session-token', refresh_token: 'refresh-token',
    expires_at: Math.floor(Date.now() / 1000) + 3600 };
  const harness = createHarness({
    storedSession: restored,
    fetchImpl: async (url) => {
      if (url === '/api/v1/public-config') {
        return jsonResponse(200, { supabase_url: 'https://supabase.example.test', supabase_anon_key: 'anon-key' });
      }
      return jsonResponse(200, liveState({
        stale: true, lock: 'LOCKED', lock_unconfirmed: false, alarm: 'ACTIVE', led: 'ON',
      }));
    },
  });
  await settle();

  for (const id of ['lock', 'alarm', 'led']) {
    assert.match(harness.elements[id].textContent, /Chưa/);
    assert.equal(harness.elements[id].dataset.state, 'unknown');
  }
  assert.ok(harness.actionButtons.every((button) => button.disabled));
});

test('action-level gates explain why LOCK is blocked while the physical door is open', async () => {
  const restored = { access_token: 'session-token', refresh_token: 'refresh-token',
    expires_at: Math.floor(Date.now() / 1000) + 3600 };
  const harness = createHarness({
    storedSession: restored,
    fetchImpl: async (url) => {
      if (url === '/api/v1/public-config') {
        return jsonResponse(200, { supabase_url: 'https://supabase.example.test', supabase_anon_key: 'anon-key' });
      }
      return jsonResponse(200, liveState({
        door: 'OPEN', lock: 'UNLOCKED',
        actions: {
          LOCK: { enabled: false, pending: false, reasons: ['DOOR_NOT_CLOSED'] },
          UNLOCK: { enabled: false, pending: false, reasons: ['DOOR_NOT_CLOSED_FOR_ACCESS'] },
          ALARM_ON: { enabled: true, pending: false, reasons: [] },
          ALARM_OFF: { enabled: false, pending: false, reasons: ['ALREADY_IN_STATE'] },
          LED_ON: { enabled: true, pending: false, reasons: [] },
          LED_OFF: { enabled: false, pending: false, reasons: ['ALREADY_IN_STATE'] },
        },
      }));
    },
  });
  await settle();

  assert.equal(harness.actionButtons[0].disabled, true);
  assert.match(harness.actionButtons[0].getAttribute('title'), /đóng cánh cửa bằng tay.*khóa ngay/i);
  assert.match(harness.actionButtons[1].getAttribute('title'), /đóng cửa.*cấp lượt mở/i);
  assert.match(harness.elements['control-hint'].textContent, /Cửa đang mở.*đóng cửa.*tự khóa.*Đã khóa.*cấp lượt mở mới/i);
  assert.equal(harness.actionButtons[2].disabled, false);
});

test('a backend no-op response is rendered without assuming a command id', async () => {
  const restored = { access_token: 'session-token', refresh_token: 'refresh-token',
    expires_at: Math.floor(Date.now() / 1000) + 3600 };
  const harness = createHarness({
    storedSession: restored,
    fetchImpl: async (url) => {
      if (url === '/api/v1/public-config') {
        return jsonResponse(200, { supabase_url: 'https://supabase.example.test', supabase_anon_key: 'anon-key' });
      }
      if (url === '/api/v1/commands') {
        return jsonResponse(200, { ok: true, noop: true, code: 'ALREADY_IN_STATE', action: 'LOCK' });
      }
      return jsonResponse(200, liveState());
    },
  });
  await settle();

  await harness.actionButtons[0].dispatch('click');
  assert.match(harness.elements['command-message'].textContent, /không gửi lệnh.*không quay servo/i);
});

test('one pending actuator request locks both controls but marks only the requested action busy', async () => {
  const restored = { access_token: 'session-token', refresh_token: 'refresh-token', expires_at: Math.floor(Date.now() / 1000) + 3600 };
  const command = deferred();
  let commandCalls = 0;
  const harness = createHarness({
    storedSession: restored,
    fetchImpl: async (url) => {
      if (url === '/api/v1/public-config') return jsonResponse(200, { supabase_url: 'https://supabase.example.test', supabase_anon_key: 'anon-key' });
      if (url === '/api/v1/commands') {
        commandCalls += 1;
        return command.promise;
      }
      return jsonResponse(200, liveState());
    },
  });
  await settle();

  const first = harness.actionButtons[0].dispatch('click');
  await settle();
  assert.equal(harness.actionButtons[0].disabled, true);
  assert.equal(harness.actionButtons[1].disabled, true);
  assert.equal(harness.actionButtons[0].dataset.pending, 'true');
  assert.equal(harness.actionButtons[1].dataset.pending, 'false');
  assert.equal(harness.actionButtons[0].attributes.get('aria-busy'), 'true');
  assert.equal(harness.actionButtons[1].attributes.get('aria-busy'), 'false');

  await harness.actionButtons[1].dispatch('click');
  assert.equal(commandCalls, 1);

  command.resolve(jsonResponse(200, { command: { command_id: '50000000-0000-4000-8000-000000000001' } }));
  await first;
  assert.equal(harness.actionButtons[0].disabled, false);
  assert.equal(harness.actionButtons[1].disabled, false);
});

test('switching lockers cancels Phase 3 pending UI without leaving controls stuck', async () => {
  const restored = { access_token: 'session-token', refresh_token: 'refresh-token', expires_at: Math.floor(Date.now() / 1000) + 3600 };
  const history = deferred();
  const chart = deferred();
  const settings = deferred();
  const harness = createHarness({
    storedSession: restored,
    fetchImpl: async (url) => {
      if (url === '/api/v1/public-config') return jsonResponse(200, { supabase_url: 'https://supabase.example.test', supabase_anon_key: 'anon-key' });
      if (url.includes('/history?')) return history.promise;
      if (url.includes('/chart?')) return chart.promise;
      if (url.endsWith('/notification-settings')) return settings.promise;
      return jsonResponse(200, liveState());
    },
  });
  await settle();

  const phase3Request = harness.elements['refresh-phase3'].dispatch('click');
  const settingsRequest = harness.elements['load-settings'].dispatch('click');
  await settle();
  assert.equal(harness.elements['refresh-phase3'].disabled, true);
  assert.equal(harness.elements['settings-form'].dataset.pending, 'true');

  harness.elements['locker-id'].value = 'LOCKER-002';
  await harness.elements['locker-id'].dispatch('input');
  assert.equal(harness.elements['refresh-phase3'].disabled, false);
  assert.equal(harness.elements['settings-form'].dataset.pending, 'false');
  assert.equal(harness.elements['settings-form'].attributes.get('aria-busy'), 'false');

  history.resolve(jsonResponse(200, { events: [], range: {} }));
  chart.resolve(jsonResponse(200, { days: 7, buckets: [], totals: {} }));
  settings.resolve(jsonResponse(200, { setting: {} }));
  await Promise.all([phase3Request, settingsRequest]);
  assert.equal(harness.elements['refresh-phase3'].disabled, false);
  assert.equal(harness.elements['settings-form'].dataset.pending, 'false');
});

test('owned history, chart, and settings remain available while live device state is offline', async () => {
  const restored = { access_token: 'session-token', refresh_token: 'refresh-token', expires_at: Math.floor(Date.now() / 1000) + 3600 };
  const harness = createHarness({
    storedSession: restored,
    fetchImpl: async (url) => {
      if (url === '/api/v1/public-config') return jsonResponse(200, { supabase_url: 'https://supabase.example.test', supabase_anon_key: 'anon-key' });
      if (url.endsWith('/state')) return jsonResponse(503, { code: 'DEVICE_OFFLINE' });
      if (url.includes('/history?')) return jsonResponse(200, {
        events: [], range: { from: '2026-08-03T17:00:00.000Z', to: '2026-08-10T17:00:00.000Z' },
      });
      if (url.includes('/chart?')) return jsonResponse(200, {
        days: 7, timezone: 'Asia/Ho_Chi_Minh', totals: { opens: 0, alerts: 0 },
        buckets: [{ date: '2026-08-10', opens: 0, alerts: 0 }],
      });
      if (url.endsWith('/notification-settings')) return jsonResponse(200, {
        setting: { locker_id: 'LOCKER-001', email_enabled: false, report_time: '21:00', timezone: 'Asia/Ho_Chi_Minh' },
      });
      throw new Error(`Unexpected URL ${url}`);
    },
  });
  await settle();

  await harness.elements['refresh-phase3'].dispatch('click');
  await harness.elements['load-settings'].dispatch('click');

  assert.ok(harness.fetchCalls.some((call) => call.url.includes('/history?')));
  assert.ok(harness.fetchCalls.some((call) => call.url.includes('/chart?')));
  assert.ok(harness.fetchCalls.some((call) => call.url.endsWith('/notification-settings')));
  assert.match(harness.elements['history-message'].textContent, /0 sự kiện/);
  assert.match(harness.elements['settings-message'].textContent, /Đã tải/);
  assert.ok(harness.actionButtons.every((button) => button.disabled));
  assert.equal(harness.elements['chart-empty'].hidden, false);
});

test('YC12 renders fresh Wi-Fi state and clears it immediately when locker context changes', async () => {
  const restored = { access_token: 'session-token', refresh_token: 'refresh-token', expires_at: Math.floor(Date.now() / 1000) + 3600 };
  const harness = createHarness({
    storedSession: restored,
    fetchImpl: async (url) => {
      if (url === '/api/v1/public-config') return jsonResponse(200, { supabase_url: 'https://supabase.example.test', supabase_anon_key: 'anon-key' });
      return jsonResponse(200, liveState());
    },
  });
  await settle();

  assert.equal(harness.elements.wifi.textContent, 'Đã kết nối');
  assert.equal(harness.elements.wifi.dataset.state, 'connected');

  harness.elements['locker-id'].value = 'LOCKER-002';
  await harness.elements['locker-id'].dispatch('input');
  assert.equal(harness.elements.wifi.textContent, 'Chưa xác định');
  assert.equal(harness.elements.wifi.dataset.state, 'unknown');
});

test('history timestamps are rendered in the locker timezone returned by the API', async () => {
  const restored = { access_token: 'session-token', refresh_token: 'refresh-token', expires_at: Math.floor(Date.now() / 1000) + 3600 };
  const harness = createHarness({
    storedSession: restored,
    fetchImpl: async (url) => {
      if (url === '/api/v1/public-config') return jsonResponse(200, { supabase_url: 'https://supabase.example.test', supabase_anon_key: 'anon-key' });
      if (url.includes('/history?')) return jsonResponse(200, {
        timezone: 'America/New_York',
        events: [{ occurred_at: '2026-08-09T17:30:00.000Z', event_type: 'DOOR_OPENED', result: 'observed' }],
        range: { from: '2026-08-09T04:00:00.000Z', to: '2026-08-10T04:00:00.000Z' },
      });
      if (url.includes('/chart?')) return jsonResponse(200, {
        days: 7, timezone: 'America/New_York', totals: { opens: 1, alerts: 0 }, buckets: [],
      });
      return jsonResponse(200, liveState());
    },
  });
  await settle();

  await harness.elements['refresh-phase3'].dispatch('click');

  assert.match(harness.elements['history-list'].textContent, /09\/08\/2026/);
  assert.doesNotMatch(harness.elements['history-list'].textContent, /10\/08\/2026/);
});

test('chart renders true zero-height buckets and an equivalent textual data table', async () => {
  const restored = { access_token: 'session-token', refresh_token: 'refresh-token', expires_at: Math.floor(Date.now() / 1000) + 3600 };
  let failChart = false;
  const harness = createHarness({
    storedSession: restored,
    fetchImpl: async (url) => {
      if (url === '/api/v1/public-config') return jsonResponse(200, { supabase_url: 'https://supabase.example.test', supabase_anon_key: 'anon-key' });
      if (url.includes('/history?')) return jsonResponse(200, {
        events: failChart ? [{ occurred_at: '2026-08-10T01:00:00.000Z', event_type: 'DOOR_OPENED', result: 'observed' }] : [],
        range: {},
      });
      if (url.includes('/chart?') && failChart) return jsonResponse(503, { code: 'CHART_UNAVAILABLE' });
      if (url.includes('/chart?')) return jsonResponse(200, {
        days: 7, timezone: 'Asia/Ho_Chi_Minh', totals: { opens: 2, alerts: 0 },
        buckets: [
          { date: '2026-08-09', opens: 0, alerts: 0 },
          { date: '2026-08-10', opens: 2, alerts: 0 },
        ],
      });
      return jsonResponse(200, liveState());
    },
  });
  await settle();

  await harness.elements['refresh-phase3'].dispatch('click');

  assert.match(harness.elements['chart-bars'].innerHTML, /height:0px/);
  assert.match(harness.elements['chart-bars'].innerHTML, /0\/0/);
  assert.match(harness.elements['chart-bars'].innerHTML, /10\/08/);
  assert.doesNotMatch(harness.elements['chart-bars'].innerHTML, /title="0 [^"]+" style="height:2px/);
  assert.match(harness.elements['chart-table-body'].innerHTML, /2026-08-09/);
  assert.match(harness.elements['chart-table-body'].innerHTML, />0<\/td>/);
  assert.match(harness.elements['chart-table-body'].innerHTML, /2026-08-10/);
  assert.match(harness.elements['chart-table-body'].innerHTML, />2<\/td>/);

  failChart = true;
  await harness.elements['refresh-phase3'].dispatch('click');
  assert.match(harness.elements['history-list'].textContent, /Cửa được mở/,
    'a chart failure must not discard a successful history response');
  assert.doesNotMatch(harness.elements['history-list'].textContent, /DOOR_OPENED|authorized=/);
  assert.equal(harness.elements['chart-bars'].innerHTML, '');
  assert.equal(harness.elements['chart-table-body'].innerHTML, '',
    'an unavailable chart must not leave stale screen-reader data behind');
  assert.match(harness.elements['history-message'].textContent, /Không tải được biểu đồ/);
});

test('a history failure does not discard a successful chart response', async () => {
  const restored = { access_token: 'session-token', refresh_token: 'refresh-token', expires_at: Math.floor(Date.now() / 1000) + 3600 };
  const harness = createHarness({
    storedSession: restored,
    fetchImpl: async (url) => {
      if (url === '/api/v1/public-config') return jsonResponse(200, { supabase_url: 'https://supabase.example.test', supabase_anon_key: 'anon-key' });
      if (url.includes('/history?')) return jsonResponse(503, { code: 'HISTORY_UNAVAILABLE' });
      if (url.includes('/chart?')) return jsonResponse(200, {
        days: 7, timezone: 'Asia/Ho_Chi_Minh', totals: { opens: 1, alerts: 0 },
        buckets: [{ date: '2026-08-10', opens: 1, alerts: 0 }],
      });
      return jsonResponse(200, liveState());
    },
  });
  await settle();

  await harness.elements['refresh-phase3'].dispatch('click');

  assert.match(harness.elements['history-list'].textContent, /không khả dụng/i);
  assert.match(harness.elements['chart-bars'].innerHTML, /height:170px/);
  assert.match(harness.elements['history-message'].textContent, /Không tải được lịch sử/);
  assert.match(harness.elements['history-message'].textContent, /Biểu đồ: đã cập nhật/);
});

test('Telegram preference is enabled only after an automatic private-account link', async () => {
  const restored = { access_token: 'session-token', refresh_token: 'refresh-token',
    expires_at: Math.floor(Date.now() / 1000) + 3600 };
  const harness = createHarness({
    storedSession: restored,
    fetchImpl: async (url) => {
      if (url === '/api/v1/public-config') {
        return jsonResponse(200, { supabase_url: 'https://supabase.example.test', supabase_anon_key: 'anon-key' });
      }
      if (url.endsWith('/notification-settings')) return jsonResponse(200, { setting: {
        telegram_connected: true, telegram_enabled: true, telegram_username: 'owner_demo',
        email_enabled: false, report_time: '21:00', timezone: 'Asia/Ho_Chi_Minh',
      } });
      return jsonResponse(200, liveState());
    },
  });
  await settle(10);

  assert.equal(harness.elements['telegram-enabled'].disabled, false);
  assert.equal(harness.elements['telegram-enabled'].checked, true);
  assert.equal(harness.elements['telegram-connection'].dataset.connected, 'true');
  assert.match(harness.elements['telegram-status'].textContent, /@owner_demo/);
  assert.equal(harness.elements['telegram-test'].hidden, false);
  assert.equal(harness.elements['telegram-disconnect'].hidden, false);
  assert.equal(Object.hasOwn(harness.elements, 'telegram-chat-id'), false);

  assert.equal(harness.elements['report-email'].disabled, true);
  harness.elements['email-enabled'].checked = true;
  await harness.elements['email-enabled'].dispatch('change');
  assert.equal(harness.elements['report-email'].disabled, false);
  assert.equal(harness.elements['report-email'].required, true);
  assert.equal(harness.elements['report-time'].disabled, false);
  assert.equal(harness.elements['report-timezone'].disabled, false);
});

test('Telegram link opens the bot, polls the server connection, and never submits a Chat ID', async () => {
  const restored = { access_token: 'session-token', refresh_token: 'refresh-token',
    expires_at: Math.floor(Date.now() / 1000) + 3600 };
  let settingsReads = 0;
  const harness = createHarness({
    storedSession: restored,
    fetchImpl: async (url, options = {}) => {
      if (url === '/api/v1/public-config') {
        return jsonResponse(200, { supabase_url: 'https://supabase.example.test', supabase_anon_key: 'anon-key' });
      }
      if (url.endsWith('/telegram-link') && options.method === 'POST') {
        return jsonResponse(201, { link_url: 'https://t.me/SmartLockerBot?start=opaque_token',
          expires_at: new Date(Date.now() + 600_000).toISOString() });
      }
      if (url.endsWith('/notification-settings') && options.method !== 'PUT') {
        settingsReads += 1;
        return jsonResponse(200, { setting: settingsReads > 1 ? {
          telegram_connected: true, telegram_enabled: true, telegram_username: 'owner_demo',
        } : { telegram_connected: false, telegram_enabled: false } });
      }
      if (url.endsWith('/notification-settings') && options.method === 'PUT') {
        return jsonResponse(200, { setting: {
          ...JSON.parse(options.body), telegram_connected: true, telegram_username: 'owner_demo',
        } });
      }
      return jsonResponse(200, liveState());
    },
  });
  await settle(10);

  await harness.elements['telegram-link'].dispatch('click');
  assert.equal(harness.openedWindows.length, 1);
  assert.equal(harness.openedWindows[0].popup.location.href,
    'https://t.me/SmartLockerBot?start=opaque_token');
  const linkPoll = [...harness.timeouts.values()].find((value) => value.delay === 1500);
  assert.ok(linkPoll);
  await linkPoll.callback();
  await settle();
  assert.equal(harness.elements['telegram-connection'].dataset.connected, 'true');
  assert.match(harness.elements['settings-message'].textContent, /thành công/i);
  assert.equal(harness.elements['telegram-open-link'].hidden, true);
  assert.equal(harness.elements['telegram-open-link'].attributes.has('href'), false,
    'consumed one-time token must be removed from the DOM');

  harness.elements['telegram-enabled'].checked = true;
  await harness.elements['settings-form'].dispatch('submit');
  const save = harness.fetchCalls.find((call) => call.url.endsWith('/notification-settings')
    && call.options.method === 'PUT');
  const submitted = JSON.parse(save.options.body);
  assert.equal(submitted.telegram_enabled, true);
  assert.equal(Object.hasOwn(submitted, 'telegram_chat_id'), false);
});

test('a blocked Telegram popup exposes one fallback link with the issued deep-link URL', async () => {
  const restored = { access_token: 'session-token', refresh_token: 'refresh-token',
    expires_at: Math.floor(Date.now() / 1000) + 3600 };
  const harness = createHarness({
    storedSession: restored,
    popupBlocked: true,
    fetchImpl: async (url, options = {}) => {
      if (url === '/api/v1/public-config') {
        return jsonResponse(200, { supabase_url: 'https://supabase.example.test', supabase_anon_key: 'anon-key' });
      }
      if (url.endsWith('/telegram-link') && options.method === 'POST') {
        return jsonResponse(201, { link_url: 'https://t.me/SmartLockerBot?start=opaque_token',
          expires_at: new Date(Date.now() + 600_000).toISOString() });
      }
      if (url.endsWith('/notification-settings')) {
        return jsonResponse(200, { setting: { telegram_connected: false, telegram_enabled: false } });
      }
      return jsonResponse(200, liveState());
    },
  });
  await settle(10);

  await harness.elements['telegram-link'].dispatch('click');

  assert.equal(harness.openedWindows.length, 0);
  assert.equal(harness.elements['telegram-open-link'].hidden, false);
  assert.equal(harness.elements['telegram-open-link'].attributes.get('href'),
    'https://t.me/SmartLockerBot?start=opaque_token');
  assert.match(harness.elements['settings-message'].textContent, /Mở bot Telegram/);
});

test('a concurrent settings refresh cannot stop or overwrite Telegram link polling', async () => {
  const restored = { access_token: 'session-token', refresh_token: 'refresh-token',
    expires_at: Math.floor(Date.now() / 1000) + 3600 };
  const stalePollResponse = deferred();
  let settingsReads = 0;
  const harness = createHarness({
    storedSession: restored,
    fetchImpl: async (url, options = {}) => {
      if (url === '/api/v1/public-config') {
        return jsonResponse(200, { supabase_url: 'https://supabase.example.test', supabase_anon_key: 'anon-key' });
      }
      if (url.endsWith('/telegram-link') && options.method === 'POST') {
        return jsonResponse(201, { link_url: 'https://t.me/SmartLockerBot?start=opaque_token',
          expires_at: new Date(Date.now() + 600_000).toISOString() });
      }
      if (url.endsWith('/notification-settings')) {
        settingsReads += 1;
        if (settingsReads === 1) {
          return jsonResponse(200, { setting: { telegram_connected: false, telegram_enabled: false } });
        }
        if (settingsReads === 2) return stalePollResponse.promise;
        return jsonResponse(200, { setting: {
          telegram_connected: true, telegram_enabled: true, telegram_username: 'owner_demo',
        } });
      }
      return jsonResponse(200, liveState());
    },
  });
  await settle(10);

  await harness.elements['telegram-link'].dispatch('click');
  const firstPollTimer = [...harness.timeouts.values()].find((value) => value.delay === 1500);
  assert.ok(firstPollTimer);
  const stalePoll = firstPollTimer.callback();
  await settle();
  assert.equal(settingsReads, 2);

  await harness.elements['load-settings'].dispatch('click');
  assert.equal(harness.elements['telegram-connection'].dataset.connected, 'true');

  stalePollResponse.resolve(jsonResponse(200, {
    setting: { telegram_connected: false, telegram_enabled: false },
  }));
  await stalePoll;
  await settle();
  assert.equal(harness.elements['telegram-connection'].dataset.connected, 'true',
    'the stale poll must not overwrite the newer settings response');

  const retryTimer = [...harness.timeouts.values()].find((value) => value.delay === 2000);
  assert.ok(retryTimer, 'the active link operation must continue polling after a superseded response');
  await retryTimer.callback();
  await settle();
  assert.match(harness.elements['settings-message'].textContent, /thành công/i);
  assert.equal(harness.elements['telegram-open-link'].attributes.has('href'), false);
});

test('a response for the previous locker cannot restore chat content after switching lockers', async () => {
  const restored = { access_token: 'session-token', refresh_token: 'refresh-token', expires_at: Math.floor(Date.now() / 1000) + 3600 };
  const oldChat = deferred();
  const harness = createHarness({
    storedSession: restored,
    fetchImpl: async (url) => {
      if (url === '/api/v1/public-config') return jsonResponse(200, { supabase_url: 'https://supabase.example.test', supabase_anon_key: 'anon-key' });
      if (url === '/api/v1/chatbot') return oldChat.promise;
      return jsonResponse(200, liveState());
    },
  });
  await settle();

  const oldRequest = harness.elements['chat-form'].dispatch('submit');
  await settle();
  harness.elements['locker-id'].value = 'LOCKER-002';
  await harness.elements['locker-id'].dispatch('input');
  oldChat.resolve(jsonResponse(200, { answer: 'private state for locker one' }));
  await oldRequest;
  assert.doesNotMatch(harness.elements.answer.textContent, /locker one/);
});

test('claim form admits only one ownership RPC while a claim is pending', async () => {
  const restored = { access_token: 'session-token', refresh_token: 'refresh-token', expires_at: Math.floor(Date.now() / 1000) + 3600 };
  const claim = deferred();
  let claimRequests = 0;
  const harness = createHarness({
    storedSession: restored,
    fetchImpl: async (url) => {
      if (url === '/api/v1/public-config') return jsonResponse(200, { supabase_url: 'https://supabase.example.test', supabase_anon_key: 'anon-key' });
      if (url === '/api/v1/lockers/claim') {
        claimRequests += 1;
        return claimRequests === 1 ? claim.promise : jsonResponse(409, { code: 'CLAIM_REJECTED' });
      }
      return jsonResponse(200, liveState());
    },
  });
  await settle();

  harness.elements['locker-code'].value = 'LOCKER-002';
  const firstClaim = harness.elements['claim-form'].dispatch('submit');
  await settle();
  await harness.elements['claim-form'].dispatch('submit');
  assert.equal(claimRequests, 1);

  claim.resolve(jsonResponse(200, { ok: true, locker: { locker_code: 'LOCKER-002' } }));
  await firstClaim;
  assert.equal(harness.elements['locker-id'].value, 'LOCKER-002');
});

test('an old claim finally cannot unlock a newer session claim form', async () => {
  const restored = { access_token: 'old-session', refresh_token: 'old-refresh', expires_at: Math.floor(Date.now() / 1000) + 3600 };
  const firstClaim = deferred();
  const secondClaim = deferred();
  let claimRequests = 0;
  const harness = createHarness({
    storedSession: restored,
    fetchImpl: async (url) => {
      if (url === '/api/v1/public-config') return jsonResponse(200, { supabase_url: 'https://supabase.example.test', supabase_anon_key: 'anon-key' });
      if (url.endsWith('/auth/v1/logout')) return jsonResponse(204, {});
      if (url.includes('grant_type=password')) return jsonResponse(200, {
        access_token: 'new-session', refresh_token: 'new-refresh', expires_at: Math.floor(Date.now() / 1000) + 3600,
      });
      if (url === '/api/v1/lockers/claim') {
        claimRequests += 1;
        return claimRequests === 1 ? firstClaim.promise : secondClaim.promise;
      }
      return jsonResponse(200, liveState());
    },
  });
  await settle();

  const oldRequest = harness.elements['claim-form'].dispatch('submit');
  await settle();
  await harness.elements.logout.dispatch('click');
  harness.elements.email.value = 'new@example.test';
  harness.elements.password.value = 'new-password';
  await harness.elements['auth-form'].dispatch('submit', { submitter: null });
  const newRequest = harness.elements['claim-form'].dispatch('submit');
  await settle();
  assert.equal(harness.elements['claim-form'].dataset.pending, 'true');

  firstClaim.resolve(jsonResponse(200, { ok: true, locker: { locker_code: 'LOCKER-001' } }));
  await oldRequest;
  assert.equal(harness.elements['claim-form'].dataset.pending, 'true');
  await harness.elements['claim-form'].dispatch('submit');
  assert.equal(claimRequests, 2);

  secondClaim.resolve(jsonResponse(200, { ok: true, locker: { locker_code: 'LOCKER-001' } }));
  await newRequest;
  assert.equal(harness.elements['claim-form'].dataset.pending, 'false');
});

test('recursive polling is serialized and coalesces a request that arrives in flight', async () => {
  const restored = { access_token: 'session-token', refresh_token: 'refresh-token', expires_at: Math.floor(Date.now() / 1000) + 3600 };
  const delayedState = deferred();
  let stateRequests = 0;
  const harness = createHarness({
    storedSession: restored,
    fetchImpl: async (url) => {
      if (url === '/api/v1/public-config') return jsonResponse(200, { supabase_url: 'https://supabase.example.test', supabase_anon_key: 'anon-key' });
      if (url.endsWith('/notification-settings')) return jsonResponse(200, { setting: {} });
      stateRequests += 1;
      if (stateRequests === 2) return delayedState.promise;
      return jsonResponse(200, liveState());
    },
  });
  await settle();
  const pollTimer = [...harness.timeouts.values()].find((value) => value.delay === 5000);
  assert.ok(pollTimer);

  const activePoll = pollTimer.callback();
  await settle();
  pollTimer.callback();
  await settle();
  assert.equal(stateRequests, 2);

  delayedState.resolve(jsonResponse(200, liveState()));
  await activePoll;
  await settle();
  assert.equal(stateRequests, 3);
});

test('state polling backs off while the dashboard tab is hidden', async () => {
  const harness = createHarness({
    fetchImpl: async (url) => url === '/api/v1/public-config'
      ? jsonResponse(200, { supabase_url: 'https://supabase.example.test', supabase_anon_key: 'anon-key' })
      : jsonResponse(200, liveState()),
  });
  await settle();
  assert.ok([...harness.timeouts.values()].some((value) => value.delay === 5000));

  harness.document.visibilityState = 'hidden';
  harness.documentListeners.get('visibilitychange')();
  assert.ok([...harness.timeouts.values()].some((value) => value.delay === 15000));
});

test('logout clears local credentials and sensitive state without waiting for the network', async () => {
  const restored = { access_token: 'session-token', refresh_token: 'refresh-token', expires_at: Math.floor(Date.now() / 1000) + 3600 };
  const remoteLogout = deferred();
  const harness = createHarness({
    storedSession: restored,
    fetchImpl: async (url) => {
      if (url === '/api/v1/public-config') return jsonResponse(200, { supabase_url: 'https://supabase.example.test', supabase_anon_key: 'anon-key' });
      if (url.endsWith('/auth/v1/logout')) return remoteLogout.promise;
      return jsonResponse(200, liveState());
    },
  });
  await settle();
  harness.elements['full-name'].value = 'Private Name';
  harness.elements.email.value = 'private@example.test';
  harness.elements.password.value = 'private-password';
  harness.elements.question.value = 'Private question';
  harness.elements.answer.textContent = 'Nội dung riêng tư';
  harness.elements['claim-message'].textContent = 'Claim thành công: PRIVATE-LOCKER';
  harness.elements['claim-message'].dataset.state = 'success';

  const logoutPromise = harness.elements.logout.dispatch('click');
  await settle();
  assert.equal(harness.stored.has('smart-locker-phase2-session'), false);
  assert.equal(harness.elements.mqtt.textContent, 'Mất kết nối');
  assert.equal(harness.elements.mqtt.dataset.state, 'disconnected');
  assert.equal(harness.elements.answer.textContent, '');
  assert.equal(harness.elements['full-name'].value, '');
  assert.equal(harness.elements.email.value, '');
  assert.equal(harness.elements.password.value, '');
  assert.notEqual(harness.elements.question.value, 'Private question');
  assert.equal(harness.elements['claim-message'].textContent, '');
  assert.equal(harness.elements['claim-message'].dataset.state, 'idle');
  assert.ok(harness.actionButtons.every((button) => button.disabled));

  remoteLogout.resolve(jsonResponse(204, {}));
  await logoutPromise;
});

test('an in-flight protected response cannot restore sensitive UI after logout', async () => {
  const restored = { access_token: 'session-token', refresh_token: 'refresh-token', expires_at: Math.floor(Date.now() / 1000) + 3600 };
  const chatbot = deferred();
  const harness = createHarness({
    storedSession: restored,
    fetchImpl: async (url) => {
      if (url === '/api/v1/public-config') return jsonResponse(200, { supabase_url: 'https://supabase.example.test', supabase_anon_key: 'anon-key' });
      if (url === '/api/v1/chatbot') return chatbot.promise;
      if (url.endsWith('/auth/v1/logout')) return jsonResponse(204, {});
      return jsonResponse(200, liveState());
    },
  });
  await settle();

  const chatPromise = harness.elements['chat-form'].dispatch('submit');
  await settle();
  await harness.elements.logout.dispatch('click');
  assert.equal(harness.elements.answer.textContent, '');

  chatbot.resolve(jsonResponse(200, { answer: 'Thông tin riêng tư' }));
  await chatPromise;
  assert.equal(harness.elements.answer.textContent, '');
});

test('a late 401 from an old protected request cannot clear a newer session', async () => {
  const restored = { access_token: 'old-session', refresh_token: 'old-refresh', expires_at: Math.floor(Date.now() / 1000) + 3600 };
  const oldChat = deferred();
  const harness = createHarness({
    storedSession: restored,
    fetchImpl: async (url) => {
      if (url === '/api/v1/public-config') return jsonResponse(200, { supabase_url: 'https://supabase.example.test', supabase_anon_key: 'anon-key' });
      if (url === '/api/v1/chatbot') return oldChat.promise;
      if (url.endsWith('/auth/v1/logout')) return jsonResponse(204, {});
      if (url.includes('grant_type=password')) return jsonResponse(200, {
        access_token: 'new-session', refresh_token: 'new-refresh', expires_at: Math.floor(Date.now() / 1000) + 3600,
      });
      return jsonResponse(200, liveState());
    },
  });
  await settle();

  const oldRequest = harness.elements['chat-form'].dispatch('submit');
  await settle();
  await harness.elements.logout.dispatch('click');
  await harness.elements['auth-form'].dispatch('submit', { submitter: null });
  assert.equal(JSON.parse(harness.stored.get('smart-locker-phase2-session')).access_token, 'new-session');

  oldChat.resolve(jsonResponse(401, { code: 'INVALID_SESSION' }));
  await oldRequest;
  assert.equal(JSON.parse(harness.stored.get('smart-locker-phase2-session')).access_token, 'new-session');
});

test('a current-session 401 clears identity fields and private question content', async () => {
  const restored = { access_token: 'session-token', refresh_token: 'refresh-token', expires_at: Math.floor(Date.now() / 1000) + 3600 };
  const harness = createHarness({
    storedSession: restored,
    fetchImpl: async (url) => {
      if (url === '/api/v1/public-config') return jsonResponse(200, { supabase_url: 'https://supabase.example.test', supabase_anon_key: 'anon-key' });
      if (url === '/api/v1/chatbot') return jsonResponse(401, { code: 'INVALID_SESSION' });
      return jsonResponse(200, liveState());
    },
  });
  await settle();
  harness.elements['full-name'].value = 'Private Name';
  harness.elements.email.value = 'private@example.test';
  harness.elements.password.value = 'private-password';
  harness.elements.question.value = 'Private question';

  await harness.elements['chat-form'].dispatch('submit');
  assert.equal(harness.stored.has('smart-locker-phase2-session'), false);
  assert.equal(harness.elements['full-name'].value, '');
  assert.equal(harness.elements.email.value, '');
  assert.equal(harness.elements.password.value, '');
  assert.notEqual(harness.elements.question.value, 'Private question');
});

test('chatbot blocks duplicate submits while one question is pending', async () => {
  const restored = { access_token: 'session-token', refresh_token: 'refresh-token', expires_at: Math.floor(Date.now() / 1000) + 3600 };
  const first = deferred();
  let chatRequests = 0;
  const harness = createHarness({
    storedSession: restored,
    fetchImpl: async (url) => {
      if (url === '/api/v1/public-config') return jsonResponse(200, { supabase_url: 'https://supabase.example.test', supabase_anon_key: 'anon-key' });
      if (url === '/api/v1/chatbot') {
        chatRequests += 1;
        return first.promise;
      }
      return jsonResponse(200, liveState());
    },
  });
  await settle();

  harness.elements.question.value = 'Câu hỏi cũ';
  const firstRequest = harness.elements['chat-form'].dispatch('submit');
  await settle();
  harness.elements.question.value = 'Câu hỏi mới';
  const secondRequest = harness.elements['chat-form'].dispatch('submit');
  await settle();

  await secondRequest;
  assert.equal(chatRequests, 1);
  assert.equal(harness.elements['chat-submit'].disabled, true);

  first.resolve(jsonResponse(200, { answer: 'Câu trả lời hiện tại' }));
  await firstRequest;
  assert.equal(harness.elements.answer.textContent, 'Câu trả lời hiện tại');
  assert.equal(harness.elements['chat-submit'].disabled, false);
});

test('browser requests have a bounded timeout with a controlled error', async () => {
  const harness = createHarness({
    fetchImpl: async (_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => {
        const error = new Error('aborted');
        error.name = 'AbortError';
        reject(error);
      });
    }),
  });
  await settle();
  const requestTimer = [...harness.timeouts.values()].find((value) => value.delay === 15_000);
  assert.ok(requestTimer);
  requestTimer.callback();
  await settle();
  assert.match(harness.elements['auth-message'].textContent, /REQUEST_TIMEOUT/);
});

test('history and chart reads use a longer bounded deadline without leaking client options to fetch', async () => {
  const restored = { access_token: 'session-token', refresh_token: 'refresh-token', expires_at: Math.floor(Date.now() / 1000) + 3600 };
  const history = deferred();
  const chart = deferred();
  const harness = createHarness({
    storedSession: restored,
    fetchImpl: async (url) => {
      if (url === '/api/v1/public-config') return jsonResponse(200, { supabase_url: 'https://supabase.example.test', supabase_anon_key: 'anon-key' });
      if (url.includes('/history?')) return history.promise;
      if (url.includes('/chart?')) return chart.promise;
      return jsonResponse(200, liveState());
    },
  });
  await settle();

  const request = harness.elements['refresh-phase3'].dispatch('click');
  await settle();

  assert.equal([...harness.timeouts.values()].filter((value) => value.delay === 30_000).length, 2);
  const phase3Calls = harness.fetchCalls.filter((call) => call.url.includes('/history?') || call.url.includes('/chart?'));
  assert.equal(phase3Calls.length, 2);
  assert.ok(phase3Calls.every((call) => !Object.hasOwn(call.options, 'timeoutMs')));

  history.resolve(jsonResponse(200, { timezone: 'Asia/Ho_Chi_Minh', events: [], range: {} }));
  chart.resolve(jsonResponse(200, { days: 7, timezone: 'Asia/Ho_Chi_Minh', totals: {}, buckets: [] }));
  await request;
});

test('a timed-out physical command is reported as ambiguous and is not retried automatically', async () => {
  const restored = { access_token: 'session-token', refresh_token: 'refresh-token', expires_at: Math.floor(Date.now() / 1000) + 3600 };
  let commandRequests = 0;
  const harness = createHarness({
    storedSession: restored,
    fetchImpl: async (url, options) => {
      if (url === '/api/v1/public-config') return jsonResponse(200, { supabase_url: 'https://supabase.example.test', supabase_anon_key: 'anon-key' });
      if (url === '/api/v1/commands') {
        commandRequests += 1;
        return new Promise((_resolve, reject) => {
          options.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
        });
      }
      return jsonResponse(200, liveState());
    },
  });
  await settle();

  const request = harness.actionButtons[0].dispatch('click');
  await settle();
  const requestTimer = [...harness.timeouts.values()].find((value) => value.delay === 15_000);
  assert.ok(requestTimer);
  requestTimer.callback();
  await request;

  assert.equal(commandRequests, 1);
  assert.match(harness.elements['command-message'].textContent, /CHƯA XÁC ĐỊNH/);
  assert.match(harness.elements['command-message'].textContent, /không gửi lại ngay/);
});
