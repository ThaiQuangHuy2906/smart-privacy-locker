'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const mqtt = require('../node-red/node_modules/mqtt');
const {
  GateError,
  adminAuth,
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
} = require('./run-phase2-live-gates');

const ROOT = path.resolve(__dirname, '..');
const LOCKER_ID = 'LOCKER-001';
const REQUEST_TIMEOUT_MS = 15_000;
const results = [];

function record(gate, check, pass, evidence) {
  results.push({ gate, check, result: pass ? 'PASS' : 'FAIL', evidence });
  return pass;
}

function iso() {
  return new Date().toISOString();
}

function availability(status) {
  return { schema_version: 1, locker_id: LOCKER_ID, status, sent_at: iso() };
}

function state({ door = 'CLOSED', alarm = 'INACTIVE' } = {}) {
  return {
    schema_version: 1,
    locker_id: LOCKER_ID,
    door,
    lock: 'LOCKED',
    alarm,
    led: 'OFF',
    wifi_connected: true,
    mqtt_connected: true,
    timestamp: iso(),
  };
}

function door(previousState, nextState) {
  return {
    schema_version: 1,
    locker_id: LOCKER_ID,
    previous_state: previousState,
    state: nextState,
    time_synced: true,
    timestamp: iso(),
  };
}

function publish(client, topic, payload, options = {}) {
  return new Promise((resolve, reject) => {
    client.publish(topic, JSON.stringify(payload), { qos: 1, retain: false, ...options }, (error) => {
      if (error) reject(new GateError('MQTT_PUBLISH_FAILED'));
      else resolve();
    });
  });
}

function subscribe(client, topic) {
  return new Promise((resolve, reject) => {
    client.subscribe(topic, { qos: 1 }, (error, grants) => {
      if (error || !grants?.length || grants[0].qos === 128) {
        reject(new GateError('MQTT_SUBSCRIBE_DENIED'));
      } else resolve();
    });
  });
}

function connectMqtt(env) {
  const tls = String(env.MQTT_TLS).toLowerCase() !== 'false';
  const host = env.MQTT_HOST.replace(/^mqtts?:\/\//, '').replace(/\/$/, '');
  const config = {
    clientId: `phase2-owner-gate-${crypto.randomBytes(8).toString('hex')}`,
    username: env.MQTT_USERNAME,
    password: env.MQTT_PASSWORD,
    protocolVersion: 4,
    clean: true,
    reconnectPeriod: 0,
    connectTimeout: 10_000,
    rejectUnauthorized: true,
  };
  if (env.MQTT_CA_CERT_PATH) config.ca = fs.readFileSync(path.resolve(ROOT, env.MQTT_CA_CERT_PATH));
  const client = mqtt.connect(`${tls ? 'mqtts' : 'mqtt'}://${host}:${env.MQTT_PORT}`, config);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      client.end(true);
      reject(new GateError('MQTT_CONNECT_TIMEOUT'));
    }, 12_000);
    client.once('connect', () => {
      clearTimeout(timer);
      resolve(client);
    });
    client.once('error', () => {
      clearTimeout(timer);
      client.end(true);
      reject(new GateError('MQTT_CONNECT_FAILED'));
    });
  });
}

function waitForAlarmCommand(client) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      client.off('message', onMessage);
      reject(new GateError('ALARM_COMMAND_TIMEOUT'));
    }, 12_000);
    function onMessage(topic, payload) {
      if (topic !== `locker/${LOCKER_ID}/command`) return;
      let command;
      try { command = JSON.parse(payload.toString()); } catch { return; }
      if (command?.locker_id !== LOCKER_ID || command?.action !== 'ALARM_ON'
          || typeof command?.command_id !== 'string') return;
      clearTimeout(timer);
      client.off('message', onMessage);
      resolve(command);
    }
    client.on('message', onMessage);
  });
}

async function closeMqtt(client) {
  if (!client) return;
  await new Promise((resolve) => client.end(false, {}, resolve));
}

async function closeBrowser(browser) {
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

async function ephemeralOwnerSession(env) {
  const locker = await readLocker(env, LOCKER_ID);
  ensure(locker?.owner_id, 'LOCKER_HAS_NO_OWNER');

  const user = await adminAuth(env, `/auth/v1/admin/users/${encodeURIComponent(locker.owner_id)}`);
  ensure(user.ok && user.body?.email, 'OWNER_LOOKUP_FAILED', user.status);

  const link = await adminAuth(env, '/auth/v1/admin/generate_link', {
    method: 'POST',
    body: JSON.stringify({ type: 'magiclink', email: user.body.email }),
  });
  ensure(link.ok, 'MAGIC_LINK_GENERATION_FAILED', link.status);
  // Hosted GoTrue currently returns these fields at the top level, while the
  // supabase-js wrapper exposes them under `properties`. Support both official
  // response shapes without reading the action link itself.
  const tokenHash = link.body?.properties?.hashed_token || link.body?.hashed_token;
  if (typeof tokenHash !== 'string' || !tokenHash.length) {
    const topLevel = Object.keys(link.body || {}).sort().join('-') || 'NONE';
    const propertyLevel = Object.keys(link.body?.properties || {}).sort().join('-') || 'NONE';
    throw new GateError(`MAGIC_LINK_HASH_MISSING_TOP_${topLevel}_PROPERTIES_${propertyLevel}`);
  }

  const verified = await fetchJson(`${env.SUPABASE_URL}/auth/v1/verify`, {
    method: 'POST',
    headers: { apikey: env.SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'email', token_hash: tokenHash }),
  });
  ensure(verified.ok && verified.body?.access_token, 'MAGIC_LINK_VERIFY_FAILED', verified.status);
  const expiresAt = verified.body.expires_at
    || Math.floor(Date.now() / 1000) + Number(verified.body.expires_in || 3600);
  return {
    access_token: verified.body.access_token,
    refresh_token: verified.body.refresh_token,
    expires_at: expiresAt,
    expires_in: verified.body.expires_in,
    token_type: verified.body.token_type || 'bearer',
  };
}

async function signOut(env, accessToken) {
  return fetchJson(`${env.SUPABASE_URL}/auth/v1/logout`, {
    method: 'POST',
    headers: {
      apikey: env.SUPABASE_ANON_KEY,
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  }).catch(() => ({ ok: false, status: 0 }));
}

async function tokenStatus(env, accessToken) {
  return fetchJson(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${accessToken}` },
  }).catch(() => ({ ok: false, status: 0 }));
}

async function waitForOwnerState(env, token, predicate, errorCode, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    last = await nodeApi(env, token, `/api/v1/lockers/${LOCKER_ID}/state`);
    if (last.status === 200 && predicate(last.body)) return last.body;
    await delay(250);
  }
  throw new GateError(errorCode, last?.status);
}

async function seedTrustedState(client, env, token) {
  await publish(client, `locker/${LOCKER_ID}/availability`, availability('ONLINE'), { retain: true });
  await publish(client, `locker/${LOCKER_ID}/state`, state(), { retain: true });
  return waitForOwnerState(env, token, (ui) => ui.mqtt === 'CONNECTED'
    && ui.device === 'ONLINE' && ui.lock === 'LOCKED' && ui.door === 'CLOSED' && ui.stale === false,
  'TRUSTED_STATE_TIMEOUT');
}

async function triggerAndVerifyAlert(client, env, token, expectNotificationFailure = false) {
  const gate = expectNotificationFailure ? 'P2-M07' : 'P2-M06';
  const before = await nodeApi(env, token, `/api/v1/lockers/${LOCKER_ID}/state`);
  const previousAlertTime = Date.parse(before.body?.latest_alert?.occurred_at || '');
  const remainingRateLimit = Number.isFinite(previousAlertTime)
    ? 31_000 - (Date.now() - previousAlertTime)
    : 0;
  if (remainingRateLimit > 0) await delay(Math.min(remainingRateLimit, 31_000));

  await publish(client, `locker/${LOCKER_ID}/telemetry/door`, door('OPEN', 'CLOSED'));
  await publish(client, `locker/${LOCKER_ID}/state`, state(), { retain: true });
  await delay(500);
  const commandPromise = waitForAlarmCommand(client);
  const triggeredAfter = Date.now() - 2000;
  await publish(client, `locker/${LOCKER_ID}/telemetry/door`, door('CLOSED', 'OPEN'));
  record(gate, 'Valid unauthorized OPEN telemetry accepted', true, 'Contract-valid telemetry published');

  const command = await commandPromise;
  record(gate, 'Node-RED emitted ALARM_ON', true, 'Correlated command observed; identifier redacted');
  const deviceState = state({ door: 'OPEN', alarm: 'ACTIVE' });
  const ack = {
    schema_version: 1,
    command_id: command.command_id,
    locker_id: LOCKER_ID,
    action: 'ALARM_ON',
    result: 'success',
    device_state: {
      door: deviceState.door,
      lock: deviceState.lock,
      alarm: deviceState.alarm,
      led: deviceState.led,
    },
    error: null,
    duplicate: false,
    timestamp: iso(),
  };
  await publish(client, `locker/${LOCKER_ID}/ack`, ack);
  record(gate, 'Simulator returned correlated ACK', true, 'ACK result=success');

  const alertState = await waitForOwnerState(env, token, (ui) => {
    const alert = ui.latest_alert;
    return alert?.event_type === 'UNAUTHORIZED_OPEN'
      && Date.parse(alert.occurred_at || '') >= triggeredAfter
      && typeof alert.notification_status === 'string';
  }, 'ALERT_NOTIFICATION_STATUS_TIMEOUT', 20_000);
  const notification = alertState.latest_alert.notification_status;
  if (expectNotificationFailure) {
    record(gate, 'Telegram controlled failure is visible and bounded', notification === 'failed',
      `notification_status=${notification}; detector and ACK path stayed operational`);
  } else {
    record(gate, 'Telegram notification completed successfully', notification === 'delivered',
      `notification_status=${notification}`);
  }

  await publish(client, `locker/${LOCKER_ID}/telemetry/door`, door('OPEN', 'CLOSED'));
  await publish(client, `locker/${LOCKER_ID}/state`, state(), { retain: true });
  await waitForOwnerState(env, token, (ui) => ui.mqtt === 'CONNECTED'
    && ui.device === 'ONLINE' && ui.lock === 'LOCKED' && ui.door === 'CLOSED' && ui.stale === false,
  'POST_ALERT_STATE_TIMEOUT');
}

async function verifyChatApi(env, token, expectProviderFailure = false) {
  const response = await nodeApi(env, token, '/api/v1/chatbot', {
    method: 'POST',
    body: JSON.stringify({ locker_id: LOCKER_ID, question: 'Tủ hiện đang khóa hay mở?' }),
    timeoutMs: REQUEST_TIMEOUT_MS,
  });
  const facts = response.body?.context?.facts?.state;
  const answer = response.body?.answer;
  if (expectProviderFailure) {
    const providerCode = response.body?.code;
    record('P2-M08', 'Controlled Gemini provider failure is returned without losing context',
      response.status === 503 && /^PROVIDER_/.test(providerCode || '') && facts?.lock === 'LOCKED',
      `HTTP ${response.status}; provider_code_present=${/^PROVIDER_/.test(providerCode || '')}; context.lock=${facts?.lock || 'NONE'}`);
    record('P2-M08', 'Controlled Gemini failure includes a non-empty safe fallback',
      typeof answer === 'string' && answer.trim().length > 0,
      `fallback_nonempty=${Boolean(answer?.trim())}; fallback_length=${answer?.trim().length || 0}`);
    ensure(response.status === 503 && /^PROVIDER_/.test(providerCode || '')
      && facts?.lock === 'LOCKED' && typeof answer === 'string' && answer.trim(),
    'CHAT_PROVIDER_FAILURE_GATE_FAILED', response.status);
    return;
  }
  record('P2-M08', 'Protected chatbot API completed', response.status === 200 && response.body?.ok === true,
    `HTTP ${response.status}; route=${response.body?.route || 'NONE'}`);
  record('P2-M08', 'Gemini prompt is grounded in trusted live state', facts?.lock === 'LOCKED'
    && response.body?.context?.facts?.source?.state === 'mqtt:state',
  `context.lock=${facts?.lock || 'NONE'}; state_source=${response.body?.context?.facts?.source?.state || 'NONE'}`);
  record('P2-M08', 'Gemini returned a non-empty answer', typeof answer === 'string' && answer.trim().length > 0,
    `answer_nonempty=${Boolean(answer?.trim())}; answer_length=${answer?.trim().length || 0}`);
  ensure(response.status === 200 && response.body?.ok === true && facts?.lock === 'LOCKED'
    && typeof answer === 'string' && answer.trim(), 'CHAT_API_GATE_FAILED', response.status);
}

async function verifyChatUi(env, session, evidenceDir, expectProviderFailure = false) {
  const dashboard = new URL(env.DASHBOARD_BASE_URL);
  dashboard.hash = '';
  let browser;
  try {
    browser = await launchBrowser(dashboard.toString());
    const { cdp } = browser;
    const network = installNetworkSummary(cdp);
    await waitForDashboard(cdp);
    const firstTimeOrigin = await cdp.evaluate(() => performance.timeOrigin, null);
    await cdp.evaluate((value) => {
      sessionStorage.setItem('smart-locker-phase2-session', JSON.stringify(value));
    }, session);
    await cdp.send('Page.reload', { ignoreCache: true });
    await waitFor(cdp, (previous) => performance.timeOrigin !== previous
      && document.readyState === 'complete' && Boolean(document.getElementById('chat-form')),
    firstTimeOrigin, 'OWNER_SESSION_RELOAD_TIMEOUT');
    await waitFor(cdp, () => {
      const stored = sessionStorage.getItem('smart-locker-phase2-session');
      return Boolean(stored) && document.getElementById('logout')?.hidden === false;
    }, null, 'OWNER_SESSION_RESTORE_TIMEOUT');

    await cdp.evaluate((lockerId) => {
      const input = document.getElementById('locker-id');
      input.value = lockerId;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }, LOCKER_ID);
    await waitFor(cdp, () => document.getElementById('mqtt')?.dataset.state === 'connected'
      && document.getElementById('device')?.dataset.state === 'online'
      && document.getElementById('lock')?.dataset.state === 'locked',
    null, 'OWNER_UI_STATE_TIMEOUT');

    const marker = network.responses.length;
    await cdp.evaluate(() => {
      const question = document.getElementById('question');
      question.value = 'Tủ hiện đang khóa hay mở?';
      question.dispatchEvent(new Event('input', { bubbles: true }));
      document.getElementById('chat-form').requestSubmit();
    }, null);
    const response = await waitForResponse(network, '/api/v1/chatbot', marker, 'OWNER_UI_CHAT_TIMEOUT');
    const ui = await waitFor(cdp, () => {
      const form = document.getElementById('chat-form');
      const answer = document.getElementById('answer')?.textContent?.trim() || '';
      if (form?.dataset.pending !== 'false' || !answer || answer.includes('Đang xử lý')) return null;
      return {
        answerLength: answer.length,
        groundedWording: /khóa|locked/i.test(answer),
        controlledFailure: answer.startsWith('Không thể trả lời:')
          && !/access_token|refresh_token|bearer\s+[a-z0-9._-]+/i.test(answer),
        authFieldsBlank: ['full-name', 'email', 'password'].every((id) => !document.getElementById(id)?.value),
        fragmentEmpty: location.hash === '',
        trustedStatePreserved: document.getElementById('lock')?.dataset.state === 'locked'
          && document.getElementById('mqtt')?.dataset.state === 'connected',
      };
    }, null, 'OWNER_UI_ANSWER_TIMEOUT');
    if (expectProviderFailure) {
      record('P2-M08', 'Dashboard renders a controlled Gemini provider failure',
        response.status === 503 && ui.controlledFailure,
        `HTTP ${response.status}; controlled_failure=${ui.controlledFailure}`);
      record('P2-M08', 'Provider failure does not corrupt trusted locker state', ui.trustedStatePreserved,
        `trusted_state_preserved=${ui.trustedStatePreserved}`);
    } else {
      record('P2-M08', 'Dashboard chatbot request succeeds through the deployed UI',
        response.status === 200 && ui.answerLength > 0,
        `HTTP ${response.status}; answer_length=${ui.answerLength}`);
      record('P2-M08', 'Dashboard renders a LOCKED-grounded answer', ui.groundedWording,
        `grounded_wording=${ui.groundedWording}`);
    }
    record('P2-M08', 'Protected UI requests use Bearer transport without URL fragments',
      network.bearerPaths.has('/api/v1/lockers/LOCKER-001/state')
        && network.bearerPaths.has('/api/v1/chatbot') && ui.fragmentEmpty,
      `state_bearer=${network.bearerPaths.has('/api/v1/lockers/LOCKER-001/state')}; chat_bearer=${network.bearerPaths.has('/api/v1/chatbot')}; fragment_empty=${ui.fragmentEmpty}`);
    record('P2-M08', 'Private screenshot contains no populated auth fields', ui.authFieldsBlank,
      `auth_fields_blank=${ui.authFieldsBlank}`);
    await capture(cdp, path.join(evidenceDir, expectProviderFailure
      ? 'p2-m08-provider-failure-state.png' : 'p2-m08-owner-state.png'));
    await cdp.evaluate(() => document.getElementById('answer')?.scrollIntoView({ block: 'center' }), null);
    await delay(200);
    await capture(cdp, path.join(evidenceDir, expectProviderFailure
      ? 'p2-m08-provider-failure.png' : 'p2-m08-owner-chat.png'));

    const logoutMarker = network.responses.length;
    await cdp.evaluate(() => document.getElementById('logout').click(), null);
    await waitFor(cdp, () => !sessionStorage.getItem('smart-locker-phase2-session')
      && document.getElementById('logout')?.hidden === true
      && ['full-name', 'email', 'password'].every((id) => !document.getElementById(id)?.value)
      && document.getElementById('question')?.value === document.getElementById('question')?.defaultValue
      && !document.getElementById('answer')?.textContent,
    null, 'OWNER_UI_LOGOUT_TIMEOUT');
    const logoutResponse = await waitForResponse(network, '/auth/v1/logout', logoutMarker,
      'OWNER_UI_LOGOUT_RESPONSE_TIMEOUT');
    record('P2-M08', 'Ephemeral owner session is cleared by UI logout',
      [200, 204].includes(logoutResponse.status), `HTTP ${logoutResponse.status}; local session cleared=true`);
    await capture(cdp, path.join(evidenceDir, 'p2-m08-after-logout.png'));
  } finally {
    await closeBrowser(browser).catch(() => {});
  }
}

async function safeMqttBaseline(client) {
  if (!client?.connected) return false;
  await publish(client, `locker/${LOCKER_ID}/telemetry/door`, door('OPEN', 'CLOSED'));
  await publish(client, `locker/${LOCKER_ID}/state`, state(), { retain: true });
  await publish(client, `locker/${LOCKER_ID}/availability`, availability('OFFLINE'), { retain: true });
  await delay(500);
  return true;
}

async function main() {
  const env = parseDotEnv(path.join(ROOT, '.env'));
  required(env, [
    'DASHBOARD_BASE_URL', 'SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY',
    'MQTT_HOST', 'MQTT_PORT', 'MQTT_USERNAME', 'MQTT_PASSWORD',
  ]);
  const evidenceDir = path.join(ROOT, 'tests', 'evidence', 'private',
    `phase2-owner-${Date.now().toString(36)}`);
  fs.mkdirSync(evidenceDir, { recursive: true });
  let session;
  let client;
  let cleanupOk = false;
  let sessionInvalidated = false;
  let failure = null;
  const expectTelegramFailure = process.argv.includes('--expect-telegram-failure');
  const expectGeminiFailure = process.argv.includes('--expect-gemini-failure');
  try {
    session = await ephemeralOwnerSession(env);
    record('P2-M08', 'One-time owner session created without email delivery or password change', true,
      'Admin-generated magic-link hash verified in memory only');
    client = await connectMqtt(env);
    await subscribe(client, `locker/${LOCKER_ID}/command`);
    record('P2-M06', 'Updated Node-RED MQTT credential can subscribe to the command topic', true,
      'TLS authenticated; subscription granted');
    await seedTrustedState(client, env, session.access_token);
    record('P2-M08', 'Owner sees fresh trusted LOCKED state', true,
      'MQTT=CONNECTED; device=ONLINE; door=CLOSED; lock=LOCKED; stale=false');
    if (!process.argv.includes('--m08-only')) {
      await triggerAndVerifyAlert(client, env, session.access_token, expectTelegramFailure);
    }
    await verifyChatApi(env, session.access_token, expectGeminiFailure);
    await verifyChatUi(env, session, evidenceDir, expectGeminiFailure);

    const afterLogout = await tokenStatus(env, session.access_token);
    sessionInvalidated = [401, 403].includes(afterLogout.status);
    record('P2-M08', 'Logged-out access token is rejected by Supabase', sessionInvalidated,
      `HTTP ${afterLogout.status}`);
  } catch (error) {
    failure = {
      code: error instanceof GateError ? error.code : 'UNEXPECTED_FAILURE',
      status: error instanceof GateError ? error.status : undefined,
    };
    record('RUNNER', 'Owner live-gate execution completed', false,
      `${failure.code}${failure.status ? `; HTTP ${failure.status}` : ''}`);
  } finally {
    const sessionWasCreated = Boolean(session?.access_token);
    const mqttWasConnected = Boolean(client);
    if (sessionWasCreated && !sessionInvalidated) {
      await signOut(env, session.access_token);
      const afterSignOut = await tokenStatus(env, session.access_token);
      sessionInvalidated = [401, 403].includes(afterSignOut.status);
    }
    try { cleanupOk = mqttWasConnected ? await safeMqttBaseline(client) : true; } catch { cleanupOk = false; }
    await closeMqtt(client).catch(() => {});
    record('CLEANUP', 'Ephemeral owner session invalidated', !sessionWasCreated || sessionInvalidated,
      sessionWasCreated ? `server_rejects_token=${sessionInvalidated}` : 'No session was created');
    record('CLEANUP', 'MQTT retained baseline restored', cleanupOk,
      mqttWasConnected && cleanupOk ? 'OFFLINE/CLOSED/LOCKED/INACTIVE'
        : cleanupOk ? 'No MQTT connection was established' : 'Retained baseline not confirmed');
  }

  const failed = results.filter((item) => item.result === 'FAIL');
  const report = {
    run: 'Phase 2 owner live gates',
    generated_at: iso(),
    identifiers: 'owner, email, token and command identifiers redacted',
    secrets_persisted: false,
    summary: { pass: results.length - failed.length, fail: failed.length },
    results,
  };
  fs.writeFileSync(path.join(evidenceDir, 'sanitized-results.json'),
    `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (failure || failed.length) process.exitCode = 1;
}

main().catch((error) => {
  process.stdout.write(`${JSON.stringify({
    run: 'Phase 2 owner live gates',
    summary: { pass: 0, fail: 1 },
    results: [{ gate: 'RUNNER', check: 'Unhandled failure', result: 'FAIL',
      evidence: error instanceof GateError ? error.code : 'UNEXPECTED_FAILURE' }],
    secrets_persisted: false,
  }, null, 2)}\n`);
  process.exitCode = 1;
});
