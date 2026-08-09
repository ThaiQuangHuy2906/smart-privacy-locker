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
    door: 'CLOSED',
    lock: 'LOCKED',
    lock_unconfirmed: false,
    last_updated: '2026-08-09T00:00:00.000Z',
    latest_alert: null,
    stale: false,
    controls: {
      lock: { enabled: true, pending: false },
      led: { enabled: true, pending: false },
    },
    ...overrides,
  };
}

function createHarness({ hash = '', storedSession = null, fetchImpl } = {}) {
  const ids = [
    'auth-form', 'full-name', 'email', 'password', 'logout', 'session-label', 'auth-message',
    'claim-form', 'locker-code', 'claim-message', 'locker-id', 'mqtt', 'device', 'door', 'lock', 'updated',
    'alert', 'state-message', 'command-message', 'chat-form', 'question', 'answer',
  ];
  const elements = Object.fromEntries(ids.map((id) => [id, new FakeElement(id)]));
  elements['locker-code'].value = 'LOCKER-001';
  elements['locker-id'].value = 'LOCKER-001';
  elements.email.value = 'user@example.test';
  elements.password.value = 'password-123';
  elements.question.value = 'Cửa tủ đang đóng hay mở?';

  const actionButtons = [
    new FakeElement('lock', { dataset: { action: 'LOCK', domain: 'lock' } }),
    new FakeElement('unlock', { dataset: { action: 'UNLOCK', domain: 'lock' } }),
    new FakeElement('led-on', { dataset: { action: 'LED_ON', domain: 'led' } }),
    new FakeElement('led-off', { dataset: { action: 'LED_OFF', domain: 'led' } }),
  ];
  const document = {
    title: 'Smart Privacy Locker',
    getElementById: (id) => elements[id],
    querySelectorAll: (selector) => (selector === '[data-action]' ? actionButtons : []),
  };

  const stored = new Map();
  if (storedSession) stored.set('smart-locker-phase2-session', JSON.stringify(storedSession));
  const sessionStorage = {
    getItem: (key) => stored.get(key) ?? null,
    setItem: (key, value) => stored.set(key, value),
    removeItem: (key) => stored.delete(key),
  };

  const location = { hash, pathname: '/phase2', search: '?view=live' };
  const replacedUrls = [];
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

  const context = vm.createContext({
    document,
    window: { location, history },
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
    timeouts,
    intervals,
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
  assert.deepEqual(harness.replacedUrls, ['/phase2?view=live']);
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

test('auth uses form submit, event.submitter, and Enter defaults to login', async () => {
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

  harness.elements['full-name'].value = 'Nguyễn Văn A';
  const registerEvent = await harness.elements['auth-form'].dispatch('submit', { submitter: { dataset: { mode: 'register' } } });
  assert.equal(registerEvent.defaultPrevented, true);
  const signup = harness.fetchCalls.find((call) => call.url.endsWith('/auth/v1/signup'));
  assert.deepEqual(JSON.parse(signup.options.body), {
    email: 'user@example.test', password: 'password-123', data: { full_name: 'Nguyễn Văn A' },
  });

  const loginEvent = await harness.elements['auth-form'].dispatch('submit', { submitter: null });
  assert.equal(loginEvent.defaultPrevented, true);
  assert.ok(harness.fetchCalls.some((call) => call.url.includes('grant_type=password')));
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
  assert.match(harness.elements['state-message'].textContent, /live/i);
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
  const interval = [...harness.intervals.values()].find((value) => value.delay === 2000);
  assert.ok(interval);
  await interval.callback();

  assert.equal(harness.elements['claim-message'].textContent, 'Claim bị từ chối: CLAIM_REJECTED');
  assert.match(harness.elements['state-message'].textContent, /live/i);
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
  assert.equal(harness.elements.door.textContent, 'UNKNOWN');

  await harness.actionButtons[0].dispatch('click');
  assert.equal(harness.fetchCalls.some((call) => call.url === '/api/v1/commands'), false);
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

test('periodic polling is serialized and coalesces a request that arrives in flight', async () => {
  const restored = { access_token: 'session-token', refresh_token: 'refresh-token', expires_at: Math.floor(Date.now() / 1000) + 3600 };
  const delayedState = deferred();
  let stateRequests = 0;
  const harness = createHarness({
    storedSession: restored,
    fetchImpl: async (url) => {
      if (url === '/api/v1/public-config') return jsonResponse(200, { supabase_url: 'https://supabase.example.test', supabase_anon_key: 'anon-key' });
      stateRequests += 1;
      if (stateRequests === 2) return delayedState.promise;
      return jsonResponse(200, liveState());
    },
  });
  await settle();
  const interval = [...harness.intervals.values()].find((value) => value.delay === 2000);
  assert.ok(interval);

  const activePoll = interval.callback();
  await settle();
  interval.callback();
  await settle();
  assert.equal(stateRequests, 2);

  delayedState.resolve(jsonResponse(200, liveState()));
  await activePoll;
  await settle();
  assert.equal(stateRequests, 3);
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
  assert.equal(harness.elements.mqtt.textContent, 'DISCONNECTED');
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

test('an older chatbot response cannot overwrite the answer to a newer question', async () => {
  const restored = { access_token: 'session-token', refresh_token: 'refresh-token', expires_at: Math.floor(Date.now() / 1000) + 3600 };
  const first = deferred();
  const second = deferred();
  let chatRequests = 0;
  const harness = createHarness({
    storedSession: restored,
    fetchImpl: async (url) => {
      if (url === '/api/v1/public-config') return jsonResponse(200, { supabase_url: 'https://supabase.example.test', supabase_anon_key: 'anon-key' });
      if (url === '/api/v1/chatbot') {
        chatRequests += 1;
        return chatRequests === 1 ? first.promise : second.promise;
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

  second.resolve(jsonResponse(200, { answer: 'Câu trả lời mới' }));
  await secondRequest;
  first.resolve(jsonResponse(200, { answer: 'Câu trả lời cũ' }));
  await firstRequest;
  assert.equal(harness.elements.answer.textContent, 'Câu trả lời mới');
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
