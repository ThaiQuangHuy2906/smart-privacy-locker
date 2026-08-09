'use strict';

const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { randomBytes, randomUUID } = require('node:crypto');
const { spawn } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const SESSION_KEY = 'smart-locker-phase2-session';
const REQUEST_TIMEOUT_MS = 15_000;
const UI_TIMEOUT_MS = 20_000;
const results = [];
const resources = { lockerCodes: [], userIds: [], emails: [] };
let browser = null;
let cleanupComplete = false;

class GateError extends Error {
  constructor(code, status) {
    super(code);
    this.name = 'GateError';
    this.code = code;
    this.status = status;
  }
}

function parseDotEnv(filePath) {
  const env = {};
  for (const rawLine of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

function required(env, keys) {
  const missing = keys.filter((key) => !env[key]);
  if (missing.length) throw new GateError(`MISSING_ENV_${missing.join('_')}`);
}

function buildSignupTestEmail(template, nonce, accountSuffix) {
  ensure(typeof template === 'string' && template.includes('{nonce}'),
    'INVALID_PHASE2_SIGNUP_TEST_EMAIL_TEMPLATE');
  const uniqueValue = `${String(nonce).toLowerCase()}-${accountSuffix}`;
  const email = template.replaceAll('{nonce}', uniqueValue).trim();
  ensure(email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email),
    'INVALID_PHASE2_SIGNUP_TEST_EMAIL_TEMPLATE');
  const domain = email.slice(email.lastIndexOf('@') + 1).toLowerCase();
  const blockedRoots = ['example.com', 'example.org', 'example.net', 'example.edu', 'localhost'];
  const blockedDomain = blockedRoots.some((root) => domain === root || domain.endsWith(`.${root}`))
    || domain.endsWith('.test')
    || domain.endsWith('.invalid')
    || domain.endsWith('.localhost')
    || domain.endsWith('.example');
  ensure(!blockedDomain, 'UNSUPPORTED_PHASE2_SIGNUP_TEST_EMAIL_DOMAIN');
  return email;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function record(gate, check, pass, evidence) {
  results.push({ gate, check, result: pass ? 'PASS' : 'FAIL', evidence });
  return pass;
}

function ensure(condition, code, status) {
  if (!condition) throw new GateError(code, status);
}

async function fetchJson(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs || REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const raw = await response.text();
    let body = null;
    if (raw) {
      try { body = JSON.parse(raw); } catch { body = null; }
    }
    return { ok: response.ok, status: response.status, body };
  } catch (error) {
    if (error?.name === 'AbortError') throw new GateError('HTTP_TIMEOUT');
    throw new GateError('HTTP_TRANSPORT_FAILED');
  } finally {
    clearTimeout(timer);
  }
}

function serviceHeaders(env, extra = {}) {
  return {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
    ...extra,
  };
}

async function adminAuth(env, route, options = {}) {
  return fetchJson(`${env.SUPABASE_URL}${route}`, {
    ...options,
    headers: serviceHeaders(env, options.headers),
  });
}

async function adminRest(env, route, options = {}) {
  return fetchJson(`${env.SUPABASE_URL}/rest/v1/${route}`, {
    ...options,
    headers: serviceHeaders(env, options.headers),
  });
}

async function createAdminUser(env, account) {
  const response = await adminAuth(env, '/auth/v1/admin/users', {
    method: 'POST',
    body: JSON.stringify({
      email: account.email,
      password: account.password,
      email_confirm: true,
      user_metadata: { full_name: account.fullName },
    }),
  });
  ensure(response.status === 200 || response.status === 201, 'ADMIN_USER_CREATE_FAILED', response.status);
  ensure(response.body?.id, 'ADMIN_USER_CREATE_MALFORMED');
  resources.userIds.push(response.body.id);
  return response.body;
}

async function findAdminUser(env, email) {
  const response = await adminAuth(env, '/auth/v1/admin/users?page=1&per_page=1000');
  ensure(response.ok && Array.isArray(response.body?.users), 'ADMIN_USER_LIST_FAILED', response.status);
  const normalizedEmail = String(email).toLowerCase();
  return response.body.users.find((user) => String(user.email || '').toLowerCase() === normalizedEmail) || null;
}

async function confirmAdminUser(env, userId) {
  const response = await adminAuth(env, `/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
    method: 'PUT',
    body: JSON.stringify({ email_confirm: true }),
  });
  ensure(response.ok, 'ADMIN_USER_CONFIRM_FAILED', response.status);
}

async function provisionLockers(env, lockerCodes) {
  const body = lockerCodes.map((lockerCode, index) => ({
    locker_code: lockerCode,
    display_name: `Phase 2 disposable locker ${index + 1}`,
  }));
  const response = await adminRest(env, 'lockers', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify(body),
  });
  ensure(response.status === 201, 'LOCKER_PROVISION_FAILED', response.status);
  resources.lockerCodes.push(...lockerCodes);
}

async function readLocker(env, lockerCode) {
  const select = 'id,locker_code,owner_id,claimed_at';
  const response = await adminRest(env,
    `lockers?select=${select}&locker_code=eq.${encodeURIComponent(lockerCode)}`);
  ensure(response.ok && Array.isArray(response.body), 'LOCKER_READ_FAILED', response.status);
  return response.body[0] || null;
}

function findChrome() {
  const candidates = [
    path.join(process.env.PROGRAMFILES || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(process.env['PROGRAMFILES(X86)'] || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
  ].filter(Boolean);
  const chrome = candidates.find((candidate) => fs.existsSync(candidate));
  if (!chrome) throw new GateError('CHROME_NOT_FOUND');
  return chrome;
}

async function availablePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

class CdpClient {
  constructor(webSocketUrl) {
    this.webSocketUrl = webSocketUrl;
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Map();
  }

  async connect() {
    this.socket = new WebSocket(this.webSocketUrl);
    await new Promise((resolve, reject) => {
      this.socket.addEventListener('open', resolve, { once: true });
      this.socket.addEventListener('error', () => reject(new GateError('CDP_CONNECT_FAILED')), { once: true });
    });
    this.socket.addEventListener('message', (event) => {
      Promise.resolve(event.data).then(async (data) => {
        const text = typeof data === 'string'
          ? data
          : Buffer.from(await data.arrayBuffer()).toString('utf8');
        const message = JSON.parse(text);
        if (message.id) {
          const pending = this.pending.get(message.id);
          if (!pending) return;
          this.pending.delete(message.id);
          if (message.error) pending.reject(new GateError('CDP_COMMAND_FAILED'));
          else pending.resolve(message.result);
          return;
        }
        for (const listener of this.listeners.get(message.method) || []) listener(message.params || {});
      }).catch(() => {});
    });
    this.socket.addEventListener('close', () => {
      for (const pending of this.pending.values()) pending.reject(new GateError('CDP_CLOSED'));
      this.pending.clear();
    });
  }

  on(method, listener) {
    if (!this.listeners.has(method)) this.listeners.set(method, []);
    this.listeners.get(method).push(listener);
  }

  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(fn, argument) {
    const serialized = JSON.stringify(argument).replaceAll('<', '\\u003c');
    const expression = `(${fn.toString()})(${serialized})`;
    const response = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true,
    });
    if (response.exceptionDetails) throw new GateError('BROWSER_EVALUATION_FAILED');
    return response.result?.value;
  }

  close() {
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.close();
  }
}

async function launchBrowser(dashboardUrl) {
  const port = await availablePort();
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'spl-phase2-e2e-'));
  const child = spawn(findChrome(), [
    `--remote-debugging-port=${port}`,
    '--remote-debugging-address=127.0.0.1',
    '--remote-allow-origins=*',
    `--user-data-dir=${profile}`,
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--window-size=1440,1200',
    'about:blank',
  ], { stdio: 'ignore', windowsHide: true });

  let version = null;
  for (let attempt = 0; attempt < 100 && !version; attempt += 1) {
    if (child.exitCode !== null) throw new GateError('CHROME_START_FAILED');
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (response.ok) version = await response.json();
    } catch {}
    if (!version) await delay(100);
  }
  ensure(version, 'CHROME_DEBUG_ENDPOINT_TIMEOUT');

  const targetResponse = await fetch(
    `http://127.0.0.1:${port}/json/new?${encodeURIComponent(dashboardUrl)}`,
    { method: 'PUT' },
  );
  ensure(targetResponse.ok, 'CHROME_TARGET_CREATE_FAILED', targetResponse.status);
  const target = await targetResponse.json();
  const cdp = new CdpClient(target.webSocketDebuggerUrl);
  await cdp.connect();
  await Promise.all([
    cdp.send('Page.enable'),
    cdp.send('Runtime.enable'),
    cdp.send('Network.enable'),
  ]);
  return { child, cdp, profile, port };
}

async function waitFor(cdp, predicate, argument, code, timeoutMs = UI_TIMEOUT_MS) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await cdp.evaluate(predicate, argument);
    if (value) return value;
    await delay(100);
  }
  throw new GateError(code);
}

async function waitForDashboard(cdp) {
  return waitFor(cdp, () => document.readyState === 'complete'
    && Boolean(document.getElementById('auth-form')),
  null, 'DASHBOARD_LOAD_TIMEOUT');
}

async function setAuthFields(cdp, fields) {
  await cdp.evaluate((values) => {
    for (const [id, value] of Object.entries(values)) {
      const element = document.getElementById(id);
      element.value = value;
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }, fields);
}

async function submitAuth(cdp, mode) {
  await cdp.evaluate((requestedMode) => {
    const form = document.getElementById('auth-form');
    const button = form.querySelector(`[data-mode="${requestedMode}"]`);
    form.requestSubmit(button);
  }, mode);
  await waitFor(cdp,
    () => document.getElementById('auth-form').dataset.pending === 'false',
    null, 'AUTH_FORM_TIMEOUT');
}

async function login(cdp, account, network) {
  const marker = network?.responses.length || 0;
  await setAuthFields(cdp, { email: account.email, password: account.password });
  await submitAuth(cdp, 'login');
  const response = network
    ? await waitForResponse(network, '/auth/v1/token', marker, 'LOGIN_RESPONSE_TIMEOUT')
    : null;
  try {
    return await waitFor(cdp, () => {
      const label = document.getElementById('session-label')?.textContent || '';
      if (!label.startsWith('Đã đăng nhập')) return null;
      const stored = sessionStorage.getItem('smart-locker-phase2-session');
      return stored ? JSON.parse(stored) : null;
    }, null, 'LOGIN_FAILED');
  } catch {
    const diagnostic = await cdp.evaluate(() => ({
      stored: Boolean(sessionStorage.getItem('smart-locker-phase2-session')),
      labelLoggedIn: document.getElementById('session-label')?.textContent.startsWith('Đã đăng nhập'),
      authFailureVisible: document.getElementById('auth-message')?.textContent.startsWith('Xác thực thất bại'),
      invalidSessionVisible: document.getElementById('auth-message')?.textContent.includes('Phiên không còn hợp lệ'),
      pending: document.getElementById('auth-form')?.dataset.pending === 'true',
    }), null);
    throw new GateError(`LOGIN_FAILED_HTTP_${response?.status || 'NONE'}_STORED_${diagnostic.stored}_LABEL_${diagnostic.labelLoggedIn}_AUTHFAIL_${diagnostic.authFailureVisible}_INVALID_${diagnostic.invalidSessionVisible}_PENDING_${diagnostic.pending}`);
  }
}

async function logout(cdp, network) {
  const marker = network?.responses.length || 0;
  await cdp.evaluate(() => document.getElementById('logout').click(), null);
  await waitFor(cdp, () => document.getElementById('session-label')?.textContent === 'Chưa đăng nhập',
    null, 'LOGOUT_LOCAL_CLEAR_TIMEOUT');
  if (!network) return null;
  return waitForResponse(network, '/auth/v1/logout', marker, 'LOGOUT_RESPONSE_TIMEOUT');
}

async function claim(cdp, lockerCode, expectedPrefix) {
  await cdp.evaluate((code) => {
    const input = document.getElementById('locker-code');
    input.value = code;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    document.getElementById('claim-form').requestSubmit();
  }, lockerCode);
  return waitFor(cdp, (prefix) => {
    const form = document.getElementById('claim-form');
    const message = document.getElementById('claim-message')?.textContent || '';
    return form.dataset.pending === 'false' && message.startsWith(prefix)
      ? { message, state: document.getElementById('claim-message').dataset.state }
      : null;
  }, expectedPrefix, 'CLAIM_UI_TIMEOUT');
}

async function reload(cdp, network) {
  const marker = network?.responses.length || 0;
  const previousTimeOrigin = await cdp.evaluate(() => performance.timeOrigin, null);
  await cdp.send('Page.reload', { ignoreCache: true });
  await waitFor(cdp, (previous) => performance.timeOrigin !== previous
    && document.readyState === 'complete'
    && Boolean(document.getElementById('auth-form')),
  previousTimeOrigin, 'DASHBOARD_RELOAD_TIMEOUT');
  if (network) {
    const response = await waitForResponse(network, '/api/v1/public-config', marker,
      'RELOAD_PUBLIC_CONFIG_TIMEOUT');
    ensure(response.status === 200, 'RELOAD_PUBLIC_CONFIG_FAILED', response.status);
  }
}

async function capture(cdp, filePath) {
  const response = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  fs.writeFileSync(filePath, Buffer.from(response.data, 'base64'));
}

function routeOf(rawUrl) {
  try { return new URL(rawUrl).pathname; } catch { return ''; }
}

function installNetworkSummary(cdp) {
  const summary = {
    responses: [], bearerPaths: new Set(), completed: new Set(), requestMethods: new Map(),
  };
  cdp.on('Network.responseReceived', ({ response, requestId }) => {
    const route = routeOf(response?.url || '');
    if (!route) return;
    if (route.startsWith('/api/v1/') || route.startsWith('/auth/v1/')) {
      summary.responses.push({
        route, status: response.status, requestId, method: summary.requestMethods.get(requestId) || 'UNKNOWN',
      });
    }
  });
  cdp.on('Network.requestWillBeSent', ({ request, requestId }) => {
    summary.requestMethods.set(requestId, request.method || 'UNKNOWN');
    const route = routeOf(request?.url || '');
    if (!route.startsWith('/api/v1/') || route === '/api/v1/public-config') return;
    const authorization = Object.entries(request.headers || {})
      .find(([key]) => key.toLowerCase() === 'authorization')?.[1];
    if (typeof authorization === 'string' && authorization.startsWith('Bearer ')) {
      summary.bearerPaths.add(route);
    }
  });
  cdp.on('Network.loadingFinished', ({ requestId }) => summary.completed.add(requestId));
  return summary;
}

async function waitForResponse(summary, route, afterIndex, code) {
  const deadline = Date.now() + UI_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const found = summary.responses.slice(afterIndex)
      .find((entry) => entry.route === route && entry.method !== 'OPTIONS');
    if (found) return found;
    await delay(100);
  }
  throw new GateError(code);
}

async function responseShape(cdp, response, network) {
  if (!response?.requestId) return { readable: false };
  try {
    const deadline = Date.now() + 5000;
    while (!network.completed.has(response.requestId) && Date.now() < deadline) await delay(50);
    const payload = await cdp.send('Network.getResponseBody', { requestId: response.requestId });
    const raw = payload.base64Encoded
      ? Buffer.from(payload.body, 'base64').toString('utf8')
      : payload.body;
    const body = JSON.parse(raw);
    const rawErrorCode = body?.code || body?.error_code || body?.error || '';
    const errorCode = typeof rawErrorCode === 'string'
      ? rawErrorCode.replace(/[^a-z0-9_.-]/gi, '').slice(0, 80)
      : '';
    return {
      readable: true,
      topLevelKeys: Object.keys(body).sort(),
      userObject: Boolean(body?.user && typeof body.user === 'object'),
      userIdPresent: Boolean(body?.user?.id),
      identitiesCount: Array.isArray(body?.user?.identities) ? body.user.identities.length : null,
      accessTokenPresent: Boolean(body?.access_token),
      errorCodePresent: Boolean(errorCode),
      errorCode,
    };
  } catch {
    return { readable: false };
  }
}

async function userRest(env, token, route, options = {}) {
  return fetchJson(`${env.SUPABASE_URL}/rest/v1/${route}`, {
    ...options,
    headers: {
      apikey: env.SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
}

async function nodeApi(env, token, route, options = {}) {
  const base = new URL(env.DASHBOARD_BASE_URL);
  const url = new URL(route, base.origin);
  return fetchJson(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
}

function mqttConnect(client, timeoutMs = 12_000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new GateError('MQTT_CONNECT_TIMEOUT')), timeoutMs);
    const onConnect = () => {
      clearTimeout(timer);
      client.off('error', onError);
      resolve();
    };
    const onError = () => {
      clearTimeout(timer);
      client.off('connect', onConnect);
      reject(new GateError('MQTT_CONNECT_FAILED'));
    };
    client.once('connect', onConnect);
    client.once('error', onError);
  });
}

function mqttSubscribe(client, topic) {
  return new Promise((resolve) => {
    client.subscribe(topic, { qos: 0 }, (_error, granted = []) => {
      resolve(granted.some((entry) => entry.topic === topic && entry.qos !== 128));
    });
  });
}

function mqttEnd(client) {
  return new Promise((resolve) => client.end(false, {}, resolve));
}

async function brokerSpy(env, preferredLocker, fallbackLocker, userBToken) {
  let mqtt;
  try {
    mqtt = require(path.join(ROOT, 'node-red', 'node_modules', 'mqtt'));
  } catch {
    record('P2-M04', 'MQTT spy dependency available', false, 'mqtt package unavailable');
    return;
  }
  const tlsEnabled = String(env.MQTT_TLS).toLowerCase() === 'true';
  const protocol = tlsEnabled ? 'mqtts' : 'mqtt';
  const brokerUrl = env.MQTT_HOST.includes('://')
    ? env.MQTT_HOST
    : `${protocol}://${env.MQTT_HOST}:${env.MQTT_PORT}`;
  const options = {
    username: env.MQTT_USERNAME,
    password: env.MQTT_PASSWORD,
    clientId: `spl-e2e-${randomBytes(8).toString('hex')}`,
    clean: true,
    reconnectPeriod: 0,
    connectTimeout: 10_000,
    rejectUnauthorized: true,
  };
  if (env.MQTT_CA_CERT_PATH) options.ca = fs.readFileSync(path.resolve(ROOT, env.MQTT_CA_CERT_PATH));
  const client = mqtt.connect(brokerUrl, options);
  client.on('error', () => {});
  let selectedLocker = null;
  let selectedTopic = null;
  let messages = 0;
  try {
    await mqttConnect(client);
    for (const candidate of [preferredLocker, fallbackLocker].filter(Boolean)) {
      const topic = `locker/${candidate}/command`;
      if (await mqttSubscribe(client, topic)) {
        selectedLocker = candidate;
        selectedTopic = topic;
        break;
      }
    }
    if (!selectedLocker) {
      record('P2-M04', 'Broker spy can observe protected topic', false, 'Broker ACL denied both scoped subscriptions');
      return;
    }
    client.on('message', (topic) => { if (topic === selectedTopic) messages += 1; });
    await delay(300);
    messages = 0;
    const denied = await nodeApi(env, userBToken, '/api/v1/commands', {
      method: 'POST',
      body: JSON.stringify({ locker_id: selectedLocker, action: 'LOCK' }),
    });
    record('P2-M04', 'Non-owner command denied during broker capture',
      denied.status === 403 && denied.body?.code === 'LOCKER_FORBIDDEN',
      `HTTP ${denied.status}; code ${denied.body?.code || 'NONE'}`);
    await delay(1600);
    record('P2-M04', 'No MQTT command after ownership denial', messages === 0,
      `${messages} command message observed`);
  } finally {
    await mqttEnd(client).catch(() => {});
  }
}

async function cleanup(env) {
  const cleanupResults = [];
  for (const lockerCode of [...new Set(resources.lockerCodes)]) {
    const response = await adminRest(env, `lockers?locker_code=eq.${encodeURIComponent(lockerCode)}`, {
      method: 'DELETE',
      headers: { Prefer: 'return=minimal' },
    }).catch(() => ({ ok: false, status: 0 }));
    cleanupResults.push(response.ok || response.status === 204);
  }
  for (const email of [...new Set(resources.emails)]) {
    if (resources.userIds.length >= resources.emails.length) break;
    const user = await findAdminUser(env, email).catch(() => null);
    if (user?.id) resources.userIds.push(user.id);
  }
  for (const userId of [...new Set(resources.userIds)]) {
    const response = await adminAuth(env, `/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
      method: 'DELETE',
    }).catch(() => ({ ok: false, status: 0 }));
    cleanupResults.push(response.ok);
  }
  cleanupComplete = cleanupResults.length > 0 && cleanupResults.every(Boolean);
  record('CLEANUP', 'Disposable users and lockers removed', cleanupComplete,
    cleanupComplete ? 'Exact test resources deleted' : 'At least one exact-resource delete failed');
}

async function closeBrowser() {
  if (!browser) return;
  try { await browser.cdp.send('Browser.close'); } catch {}
  browser.cdp.close();
  await delay(300);
  if (browser.child.exitCode === null) browser.child.kill();
  const profile = path.resolve(browser.profile);
  const tempRoot = `${path.resolve(os.tmpdir())}${path.sep}`;
  if (profile.startsWith(tempRoot) && path.basename(profile).startsWith('spl-phase2-e2e-')) {
    fs.rmSync(profile, { recursive: true, force: true });
  }
}

async function run() {
  const env = parseDotEnv(path.join(ROOT, '.env'));
  required(env, [
    'DASHBOARD_BASE_URL', 'SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY',
    'MQTT_HOST', 'MQTT_PORT', 'MQTT_USERNAME', 'MQTT_PASSWORD',
    'PHASE2_SIGNUP_TEST_EMAIL_TEMPLATE',
  ]);
  const dashboard = new URL(env.DASHBOARD_BASE_URL);
  dashboard.hash = '';
  const nonce = Date.now().toString(36).toUpperCase();
  const accountA = {
    email: buildSignupTestEmail(env.PHASE2_SIGNUP_TEST_EMAIL_TEMPLATE, nonce, 'a'),
    password: `P2!${randomBytes(18).toString('base64url')}`,
    fullName: 'Phase Two Test A',
  };
  const accountB = {
    email: buildSignupTestEmail(env.PHASE2_SIGNUP_TEST_EMAIL_TEMPLATE, nonce, 'b'),
    password: `P2!${randomBytes(18).toString('base64url')}`,
    fullName: 'Phase Two Test B',
  };
  resources.emails.push(accountA.email, accountB.email);
  const lockerA = `P2E2E-${nonce}-A`;
  const lockerB = `P2E2E-${nonce}-B`;
  ensure(lockerA.length <= 32 && lockerB.length <= 32, 'LOCKER_CODE_TOO_LONG');

  await provisionLockers(env, [lockerA, lockerB]);
  const userB = await createAdminUser(env, accountB);

  browser = await launchBrowser(dashboard.href);
  const { cdp } = browser;
  const network = installNetworkSummary(cdp);
  const evidenceDir = path.join(ROOT, 'tests', 'evidence', 'private', `phase2-live-${nonce}`);
  fs.mkdirSync(evidenceDir, { recursive: true });
  await cdp.send('Page.navigate', { url: dashboard.href });
  await waitForDashboard(cdp);
  const publicConfig = await waitForResponse(network, '/api/v1/public-config', 0,
    'PUBLIC_CONFIG_RESPONSE_TIMEOUT');
  ensure(publicConfig.status === 200, 'PUBLIC_CONFIG_FAILED', publicConfig.status);

  // P2-M03: public registration, confirmed login, callback cleanup, reload and logout.
  const registerMarker = network.responses.length;
  await setAuthFields(cdp, {
    'full-name': accountA.fullName,
    email: accountA.email,
    password: accountA.password,
  });
  await submitAuth(cdp, 'register');
  const registerResponse = await waitForResponse(network, '/auth/v1/signup', registerMarker,
    'REGISTER_RESPONSE_TIMEOUT');
  const registerShape = await responseShape(cdp, registerResponse, network);
  const registerUi = await cdp.evaluate(() => ({
    message: document.getElementById('auth-message').textContent,
    loggedIn: document.getElementById('session-label').textContent.startsWith('Đã đăng nhập'),
    passwordCleared: document.getElementById('password').value === '',
  }), null);
  record('P2-M03', 'Public registration through Dashboard', registerResponse.status === 200,
    `HTTP ${registerResponse.status}; response readable=${registerShape.readable}; user object=${registerShape.userObject}; identity count=${registerShape.identitiesCount}; access token present=${registerShape.accessTokenPresent}; error code=${registerShape.errorCode || 'none'}`);
  record('P2-M03', 'Registration clears password field', registerUi.passwordCleared,
    registerUi.passwordCleared ? 'Password absent from DOM input' : 'Password remained in DOM input');

  let userA = await findAdminUser(env, accountA.email);
  if (!userA) {
    record('P2-M03', 'Registration created disposable user', false, 'No exact test user found');
    userA = await createAdminUser(env, accountA);
  } else {
    resources.userIds.push(userA.id);
    record('P2-M03', 'Registration created disposable user', true, 'Exact test user exists');
    if (!registerUi.loggedIn) await confirmAdminUser(env, userA.id);
  }

  const profile = await adminRest(env,
    `profiles?select=full_name&user_id=eq.${encodeURIComponent(userA.id)}`);
  record('P2-M03', 'Registration metadata created profile name',
    profile.ok && profile.body?.[0]?.full_name === accountA.fullName,
    profile.ok ? 'Profile metadata matched' : `HTTP ${profile.status}`);

  if (registerUi.loggedIn) await logout(cdp, network);
  const loginMarker = network.responses.length;
  const sessionA = await login(cdp, accountA, network);
  const loginResponse = await waitForResponse(network, '/auth/v1/token', loginMarker, 'LOGIN_RESPONSE_TIMEOUT');
  const loginSnapshot = await cdp.evaluate(() => ({
    stored: Boolean(sessionStorage.getItem('smart-locker-phase2-session')),
    passwordCleared: document.getElementById('password').value === '',
    cleanUrl: !location.href.includes('access_token=') && !location.href.includes('refresh_token='),
  }), null);
  record('P2-M03', 'Password login and session storage', loginResponse.status === 200 && loginSnapshot.stored,
    `HTTP ${loginResponse.status}; session stored=${loginSnapshot.stored}`);
  record('P2-M03', 'Login clears password and keeps token out of URL',
    loginSnapshot.passwordCleared && loginSnapshot.cleanUrl,
    `password cleared=${loginSnapshot.passwordCleared}; URL clean=${loginSnapshot.cleanUrl}`);

  const callbackUrl = new URL(dashboard.href);
  callbackUrl.searchParams.set('e2e_callback', nonce);
  callbackUrl.hash = new URLSearchParams({
    access_token: sessionA.access_token,
    refresh_token: sessionA.refresh_token || '',
    token_type: sessionA.token_type || 'bearer',
    expires_at: String(sessionA.expires_at),
  }).toString();
  const previousTimeOrigin = await cdp.evaluate(() => performance.timeOrigin, null);
  const callbackConfigMarker = network.responses.length;
  await cdp.send('Page.navigate', { url: callbackUrl.href });
  await waitFor(cdp, (previous) => performance.timeOrigin !== previous
    && document.readyState === 'complete'
    && Boolean(document.getElementById('auth-form')),
  previousTimeOrigin, 'CALLBACK_DOCUMENT_TIMEOUT');
  const callbackConfig = await waitForResponse(network, '/api/v1/public-config', callbackConfigMarker,
    'CALLBACK_PUBLIC_CONFIG_TIMEOUT');
  ensure(callbackConfig.status === 200, 'CALLBACK_PUBLIC_CONFIG_FAILED', callbackConfig.status);
  try {
    await waitFor(cdp, () => document.getElementById('session-label')?.textContent.startsWith('Đã đăng nhập')
      && location.hash === '', null, 'CALLBACK_CLEANUP_TIMEOUT');
  } catch (error) {
    const diagnostic = await cdp.evaluate(() => ({
      hashPresent: location.hash.length > 0,
      hashContainsAccessToken: location.hash.includes('access_token='),
      labelLoggedIn: document.getElementById('session-label')?.textContent.startsWith('Đã đăng nhập'),
      stored: Boolean(sessionStorage.getItem('smart-locker-phase2-session')),
      authFailureVisible: document.getElementById('auth-message')?.textContent.startsWith('Xác thực thất bại'),
      configFailureVisible: document.getElementById('auth-message')?.textContent.startsWith('Dashboard chưa được cấu hình'),
    }), null);
    record('P2-M03', 'Implicit callback reaches clean authenticated state', false,
      `hash present=${diagnostic.hashPresent}; access token key in hash=${diagnostic.hashContainsAccessToken}; logged in=${diagnostic.labelLoggedIn}; session stored=${diagnostic.stored}; auth failure=${diagnostic.authFailureVisible}; config failure=${diagnostic.configFailureVisible}`);
    await capture(cdp, path.join(evidenceDir, 'p2-m03-callback-failure.png'));
    throw error;
  }
  const callbackSnapshot = await cdp.evaluate(() => ({
    cleanHash: location.hash === '',
    cleanUrl: !location.href.includes('access_token=') && !location.href.includes('refresh_token='),
    stored: Boolean(sessionStorage.getItem('smart-locker-phase2-session')),
  }), null);
  record('P2-M03', 'Implicit callback strips token fragment',
    callbackSnapshot.cleanHash && callbackSnapshot.cleanUrl && callbackSnapshot.stored,
    `hash clean=${callbackSnapshot.cleanHash}; URL clean=${callbackSnapshot.cleanUrl}; session stored=${callbackSnapshot.stored}`);

  await reload(cdp, network);
  const reloadSnapshot = await waitFor(cdp, () => {
    const loggedIn = document.getElementById('session-label')?.textContent.startsWith('Đã đăng nhập');
    return loggedIn ? {
      loggedIn,
      stored: Boolean(sessionStorage.getItem('smart-locker-phase2-session')),
    } : null;
  }, null, 'SESSION_RELOAD_TIMEOUT');
  record('P2-M03', 'Reload restores session', reloadSnapshot.loggedIn && reloadSnapshot.stored,
    `logged in=${reloadSnapshot.loggedIn}; session stored=${reloadSnapshot.stored}`);
  await capture(cdp, path.join(evidenceDir, 'p2-m03-session-reload.png'));

  await logout(cdp, network);
  const logoutSnapshot = await cdp.evaluate(() => ({
    stored: Boolean(sessionStorage.getItem('smart-locker-phase2-session')),
    fieldsEmpty: ['full-name', 'email', 'password'].every((id) => document.getElementById(id).value === ''),
    controlsDisabled: [...document.querySelectorAll('[data-action]')].every((button) => button.disabled),
    cleanUrl: location.hash === '' && !location.href.includes('access_token='),
  }), null);
  record('P2-M03', 'Logout clears local session and sensitive UI immediately',
    !logoutSnapshot.stored && logoutSnapshot.fieldsEmpty && logoutSnapshot.controlsDisabled && logoutSnapshot.cleanUrl,
    `session absent=${!logoutSnapshot.stored}; fields empty=${logoutSnapshot.fieldsEmpty}; controls disabled=${logoutSnapshot.controlsDisabled}; URL clean=${logoutSnapshot.cleanUrl}`);
  await reload(cdp, network);
  const loggedOutAfterReload = await cdp.evaluate(() => ({
    label: document.getElementById('session-label')?.textContent,
    stored: Boolean(sessionStorage.getItem('smart-locker-phase2-session')),
  }), null);
  record('P2-M03', 'Reload after logout stays logged out',
    loggedOutAfterReload.label === 'Chưa đăng nhập' && !loggedOutAfterReload.stored,
    `logged out=${loggedOutAfterReload.label === 'Chưa đăng nhập'}; session absent=${!loggedOutAfterReload.stored}`);

  const activeA = await login(cdp, accountA, network);
  await waitFor(cdp, () => document.getElementById('state-message')?.textContent.length > 0,
    null, 'OWNER_STATE_POLL_TIMEOUT');
  record('P2-M03', 'Protected browser requests use Bearer transport',
    [...network.bearerPaths].some((route) => route.startsWith('/api/v1/lockers/')),
    'Authorization scheme observed and token value discarded');

  if (process.argv.includes('--m03-only')) {
    await logout(cdp, network);
    const publicReport = {
      run: 'Phase 2 M03 live manual gate',
      generated_at: new Date().toISOString(),
      environment: 'development',
      identifiers: 'redacted/disposable',
      results,
    };
    fs.writeFileSync(path.join(evidenceDir, 'sanitized-results.json'),
      `${JSON.stringify(publicReport, null, 2)}\n`);
    return;
  }

  // P2-M05: first/repeat/cross-user claim and immutable owner boundary.
  let marker = network.responses.length;
  const firstClaim = await claim(cdp, lockerA, 'Claim thành công:');
  const firstClaimResponse = await waitForResponse(network, '/api/v1/lockers/claim', marker,
    'FIRST_CLAIM_RESPONSE_TIMEOUT');
  record('P2-M05', 'First one-time claim succeeds with visible feedback',
    firstClaimResponse.status === 200 && firstClaim.state === 'success'
      && firstClaim.message.includes('đang xác minh live state.'),
    `HTTP ${firstClaimResponse.status}; UI state=${firstClaim.state}; success copy visible=${firstClaim.message.includes('đang xác minh live state.')}`);
  const ownerAfterFirstClaim = await readLocker(env, lockerA);
  ensure(ownerAfterFirstClaim?.owner_id === userA.id && ownerAfterFirstClaim.claimed_at,
    'FIRST_CLAIM_OWNER_MISMATCH');

  marker = network.responses.length;
  const repeatClaim = await claim(cdp, lockerA, 'Claim bị từ chối:');
  const repeatResponse = await waitForResponse(network, '/api/v1/lockers/claim', marker,
    'REPEAT_CLAIM_RESPONSE_TIMEOUT');
  record('P2-M05', 'Repeat claim is rejected with visible feedback',
    repeatResponse.status === 409 && repeatClaim.state === 'error'
      && repeatClaim.message.includes('CLAIM_REJECTED'),
    `HTTP ${repeatResponse.status}; UI state=${repeatClaim.state}; code visible=${repeatClaim.message.includes('CLAIM_REJECTED')}`);
  await capture(cdp, path.join(evidenceDir, 'p2-m05-repeat-claim.png'));

  await logout(cdp, network);
  const activeB = await login(cdp, accountB, network);
  marker = network.responses.length;
  const crossClaim = await claim(cdp, lockerA, 'Claim bị từ chối:');
  const crossResponse = await waitForResponse(network, '/api/v1/lockers/claim', marker,
    'CROSS_CLAIM_RESPONSE_TIMEOUT');
  record('P2-M05', 'Second user cannot claim an owned locker',
    crossResponse.status === 409 && crossClaim.state === 'error'
      && crossClaim.message.includes('CLAIM_REJECTED'),
    `HTTP ${crossResponse.status}; UI state=${crossClaim.state}; code visible=${crossClaim.message.includes('CLAIM_REJECTED')}`);
  const ownerAfterCrossClaim = await readLocker(env, lockerA);
  record('P2-M05', 'Owner and claim timestamp remain unchanged after denials',
    ownerAfterCrossClaim?.owner_id === ownerAfterFirstClaim.owner_id
      && ownerAfterCrossClaim?.claimed_at === ownerAfterFirstClaim.claimed_at,
    'Owner/timestamp equality checked without recording identifiers');

  const ownerPatch = await userRest(env, activeB.access_token,
    `lockers?locker_code=eq.${encodeURIComponent(lockerA)}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ owner_id: userB.id }),
    });
  const ownerAfterPatch = await readLocker(env, lockerA);
  record('P2-M05', 'Authenticated client cannot update lockers.owner_id',
    ownerPatch.status === 403 && ownerAfterPatch?.owner_id === ownerAfterFirstClaim.owner_id,
    `HTTP ${ownerPatch.status}; owner unchanged=${ownerAfterPatch?.owner_id === ownerAfterFirstClaim.owner_id}`);

  // Give User B an owned locker, then prove cross-owner read/control denial.
  const ownBClaim = await claim(cdp, lockerB, 'Claim thành công:');
  record('P2-M04', 'User B owns its separate disposable locker', ownBClaim.state === 'success',
    `UI state=${ownBClaim.state}`);

  await cdp.evaluate((code) => {
    const input = document.getElementById('locker-id');
    input.value = code;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, lockerA);
  const crossOwnerUi = await waitFor(cdp, () => {
    const text = document.getElementById('state-message')?.textContent || '';
    if (!text.includes('LOCKER_FORBIDDEN')) return null;
    return {
      denied: true,
      controlsDisabled: [...document.querySelectorAll('[data-action]')].every((button) => button.disabled),
    };
  }, null, 'CROSS_OWNER_UI_TIMEOUT');
  record('P2-M04', 'Cross-owner UI read is denied and controls stay disabled',
    crossOwnerUi.denied && crossOwnerUi.controlsDisabled,
    `LOCKER_FORBIDDEN visible=${crossOwnerUi.denied}; controls disabled=${crossOwnerUi.controlsDisabled}`);
  await capture(cdp, path.join(evidenceDir, 'p2-m04-cross-owner-denied.png'));

  const directState = await nodeApi(env, activeB.access_token,
    `/api/v1/lockers/${encodeURIComponent(lockerA)}/state`);
  record('P2-M04', 'Direct Node-RED state API denies cross-owner read',
    directState.status === 403 && directState.body?.code === 'LOCKER_FORBIDDEN',
    `HTTP ${directState.status}; code ${directState.body?.code || 'NONE'}`);

  const rlsRead = await userRest(env, activeB.access_token,
    `lockers?select=locker_code,owner_id&locker_code=eq.${encodeURIComponent(lockerA)}`);
  record('P2-M04', 'Supabase RLS hides User A locker from User B',
    rlsRead.status === 200 && Array.isArray(rlsRead.body) && rlsRead.body.length === 0,
    `HTTP ${rlsRead.status}; visible rows=${Array.isArray(rlsRead.body) ? rlsRead.body.length : 'invalid'}`);

  const directCommand = await nodeApi(env, activeB.access_token, '/api/v1/commands', {
    method: 'POST',
    body: JSON.stringify({ locker_id: lockerA, action: 'LOCK' }),
  });
  record('P2-M04', 'Direct Node-RED command API denies cross-owner control',
    directCommand.status === 403 && directCommand.body?.code === 'LOCKER_FORBIDDEN',
    `HTTP ${directCommand.status}; code ${directCommand.body?.code || 'NONE'}`);

  let fallbackLocker = null;
  if (env.LOCKER_ID) {
    const existing = await readLocker(env, env.LOCKER_ID).catch(() => null);
    if (existing && existing.owner_id !== userB.id) fallbackLocker = env.LOCKER_ID;
  }
  await brokerSpy(env, lockerA, fallbackLocker, activeB.access_token);

  await logout(cdp, network);
  const publicReport = {
    run: 'Phase 2 live manual gates',
    generated_at: new Date().toISOString(),
    environment: 'development',
    identifiers: 'redacted/disposable',
    results,
  };
  fs.writeFileSync(path.join(evidenceDir, 'sanitized-results.json'), `${JSON.stringify(publicReport, null, 2)}\n`);
}

async function main() {
  let failure = null;
  let env = null;
  try {
    env = parseDotEnv(path.join(ROOT, '.env'));
    await run();
  } catch (error) {
    failure = {
      code: error instanceof GateError ? error.code : 'UNEXPECTED_FAILURE',
      status: error instanceof GateError && error.status ? error.status : undefined,
    };
    record('RUNNER', 'Live gate execution completed', false,
      `${failure.code}${failure.status ? `; HTTP ${failure.status}` : ''}`);
  } finally {
    await closeBrowser().catch(() => {});
    if (env?.SUPABASE_URL && env?.SUPABASE_SERVICE_ROLE_KEY) {
      await cleanup(env).catch(() => {
        record('CLEANUP', 'Disposable users and lockers removed', false, 'Cleanup transport failed');
      });
    }
  }

  const failed = results.filter((item) => item.result === 'FAIL');
  const report = {
    run: 'Phase 2 live manual gates',
    generated_at: new Date().toISOString(),
    identifiers: 'redacted/disposable',
    summary: { pass: results.length - failed.length, fail: failed.length, cleanup_complete: cleanupComplete },
    results,
  };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (failure || failed.length || !cleanupComplete) process.exitCode = 1;
}

if (require.main === module) main();

module.exports = {
  GateError,
  adminAuth,
  adminRest,
  buildSignupTestEmail,
  capture,
  delay,
  ensure,
  fetchJson,
  installNetworkSummary,
  launchBrowser,
  nodeApi,
  parseDotEnv,
  readLocker,
  required,
  waitFor,
  waitForDashboard,
  waitForResponse,
};
