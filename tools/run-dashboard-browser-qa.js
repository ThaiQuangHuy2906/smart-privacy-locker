#!/usr/bin/env node

'use strict';

const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { dashboardState } = require('../node-red/lib/dashboard-state');
const {
  capture,
  delay,
  launchBrowser,
  waitFor,
  waitForDashboard,
} = require('./run-phase2-live-gates');

const ROOT = path.resolve(__dirname, '..');
const DASHBOARD_ROOT = path.join(ROOT, 'dashboard');
const OUTPUT_ROOT = path.join(ROOT, 'output', 'playwright');
const results = [];

function check(name, condition, evidence) {
  results.push({ check: name, result: condition ? 'PASS' : 'FAIL', evidence });
  if (!condition) throw new Error(`DASHBOARD_QA_FAILED: ${name}: ${evidence}`);
}

function json(response, status, body) {
  const data = Buffer.from(JSON.stringify(body));
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': data.length,
    'Cache-Control': 'no-store',
  });
  response.end(data);
}

function dashboardFixture() {
  return dashboardState({
    authenticated: true,
    ownsLocker: true,
    snapshot: {
      mqtt_connected: true,
      availability: 'ONLINE',
      fresh: true,
      state: {
        door: 'CLOSED',
        lock: 'LOCKED',
        alarm: 'INACTIVE',
        led: 'OFF',
        wifi_connected: true,
      },
      observed_at: '2026-08-18T05:00:00.000Z',
      latest_alert: null,
    },
  });
}

async function requestBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

function startServer() {
  const observations = { stateRequests: [], unexpected: [] };
  let origin = null;
  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url, origin || 'http://127.0.0.1');
    const pathname = url.pathname;

    if (request.method === 'GET' && (pathname === '/' || pathname === '/locker')) {
      const body = fs.readFileSync(path.join(DASHBOARD_ROOT, 'index.html'));
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Length': body.length });
      response.end(body);
      return;
    }
    if (request.method === 'GET' && pathname === '/styles.css') {
      const body = fs.readFileSync(path.join(DASHBOARD_ROOT, 'styles.css'));
      response.writeHead(200, { 'Content-Type': 'text/css; charset=utf-8', 'Content-Length': body.length });
      response.end(body);
      return;
    }
    if (request.method === 'GET' && pathname === '/app.js') {
      const body = fs.readFileSync(path.join(DASHBOARD_ROOT, 'app.js'));
      response.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Content-Length': body.length });
      response.end(body);
      return;
    }
    if (request.method === 'GET' && pathname === '/favicon.ico') {
      response.writeHead(204);
      response.end();
      return;
    }
    if (request.method === 'GET' && pathname === '/api/v1/public-config') {
      json(response, 200, { supabase_url: `${origin}/mock-supabase`, supabase_anon_key: 'browser-qa-anon' });
      return;
    }
    if (request.method === 'POST' && pathname === '/mock-supabase/auth/v1/token') {
      await requestBody(request);
      json(response, 200, {
        access_token: 'browser-qa-access-token',
        refresh_token: 'browser-qa-refresh-token',
        expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        token_type: 'bearer',
        user: { id: '20000000-0000-4000-8000-000000000001', email: 'qa@example.invalid' },
      });
      return;
    }
    if (request.method === 'GET' && pathname === '/api/v1/lockers/LOCKER-001/state') {
      observations.stateRequests.push(Date.now());
      json(response, 200, dashboardFixture());
      return;
    }
    if (request.method === 'GET' && pathname === '/api/v1/lockers/LOCKER-001/notification-settings') {
      json(response, 200, { setting: {
        locker_id: 'LOCKER-001',
        telegram_connected: false,
        telegram_enabled: false,
        email_enabled: false,
        report_time: '21:00',
        timezone: 'Asia/Ho_Chi_Minh',
      } });
      return;
    }
    if (request.method === 'GET' && pathname === '/api/v1/lockers/LOCKER-001/history') {
      json(response, 200, {
        timezone: 'Asia/Ho_Chi_Minh',
        range: { from: '2026-08-11T17:00:00.000Z', to: '2026-08-18T17:00:00.000Z' },
        events: [
          { occurred_at: '2026-08-18T04:55:00.000Z', event_type: 'DOOR_OPENED', result: 'observed', authorized: true },
          { occurred_at: '2026-08-17T03:00:00.000Z', event_type: 'UNAUTHORIZED_OPEN', result: 'detected', authorized: false },
        ],
      });
      return;
    }
    if (request.method === 'GET' && pathname === '/api/v1/lockers/LOCKER-001/chart') {
      json(response, 200, {
        days: Number(url.searchParams.get('days')) || 7,
        timezone: 'Asia/Ho_Chi_Minh',
        totals: { opens: 3, alerts: 1 },
        buckets: [
          { date: '2026-08-16', opens: 0, alerts: 0 },
          { date: '2026-08-17', opens: 1, alerts: 1 },
          { date: '2026-08-18', opens: 2, alerts: 0 },
        ],
      });
      return;
    }

    observations.unexpected.push(`${request.method} ${pathname}`);
    json(response, 404, { code: 'NOT_FOUND' });
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      origin = `http://127.0.0.1:${address.port}`;
      resolve({ server, origin, observations });
    });
  });
}

async function stopServer(server) {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

async function closeBrowser(browser) {
  if (!browser) return;
  try { await browser.cdp.send('Browser.close'); } catch {}
  browser.cdp.close();
  await delay(300);
  if (browser.child.exitCode === null) browser.child.kill();

  const profile = path.resolve(browser.profile);
  const temporaryRoot = `${path.resolve(os.tmpdir())}${path.sep}`;
  const expectedName = path.basename(profile).startsWith('spl-phase2-e2e-');
  const insideTemporaryRoot = profile.startsWith(temporaryRoot);
  const profileStat = fs.existsSync(profile) ? fs.lstatSync(profile) : null;
  if (profileStat && insideTemporaryRoot && expectedName && !profileStat.isSymbolicLink()) {
    fs.rmSync(profile, { recursive: true, force: false });
  }
}

async function resize(cdp, width, height) {
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await delay(200);
}

async function login(cdp) {
  const started = await cdp.evaluate(() => {
    const email = document.getElementById('email');
    const password = document.getElementById('password');
    email.value = 'qa@example.invalid';
    password.value = 'browser-only-password';
    email.dispatchEvent(new Event('input', { bubbles: true }));
    password.dispatchEvent(new Event('input', { bubbles: true }));
    document.getElementById('auth-form').requestSubmit(document.getElementById('auth-submit'));
    return document.getElementById('auth-form').dataset.pending === 'true';
  }, null);
  check('Đăng nhập bắt đầu từ form thật', started, 'form chuyển sang aria-busy/pending');
  await waitFor(cdp, () => document.getElementById('session-label')?.textContent.startsWith('Đã đăng nhập')
    && document.getElementById('auth-form')?.dataset.pending === 'false',
  null, 'BROWSER_QA_LOGIN_TIMEOUT');
}

async function visibleInteractionMetrics(cdp) {
  return cdp.evaluate(() => [...document.querySelectorAll('button, input, select, textarea, a[href], summary')]
    .filter((element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return !element.hidden && style.display !== 'none' && style.visibility !== 'hidden'
        && rect.width > 0 && rect.height > 0;
    })
    .map((element) => {
      const labelledTarget = element.matches('input[type="checkbox"], input[type="radio"]')
        ? element.closest('label') : null;
      const rect = (labelledTarget || element).getBoundingClientRect();
      return {
        label: element.id || element.dataset.action || element.textContent.trim().slice(0, 40),
        width: Math.round(rect.width * 10) / 10,
        height: Math.round(rect.height * 10) / 10,
      };
    }), null);
}

async function run() {
  let local = null;
  let browser = null;
  fs.mkdirSync(OUTPUT_ROOT, { recursive: true });
  try {
    local = await startServer();
    browser = await launchBrowser(`${local.origin}/locker`);
    const { cdp } = browser;
    await waitForDashboard(cdp);
    await waitFor(cdp, () => document.getElementById('auth-submit')?.disabled === false,
      null, 'BROWSER_QA_CONFIG_TIMEOUT');
    await resize(cdp, 1280, 720);

    const initial = await cdp.evaluate(() => ({
      lang: document.documentElement.lang,
      h1: document.querySelectorAll('h1').length,
      horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      authVisible: !document.getElementById('auth-form').hidden,
    }), null);
    check('Ngôn ngữ và cấu trúc trang', initial.lang === 'vi' && initial.h1 === 1,
      `lang=${initial.lang}; h1=${initial.h1}`);
    check('Desktop không tràn ngang trước đăng nhập', !initial.horizontalOverflow,
      'viewport 1280×720');
    check('Form xác thực hiện khi chưa đăng nhập', initial.authVisible,
      'auth-form hiển thị');

    await login(cdp);
    await waitFor(cdp, () => document.getElementById('mqtt')?.textContent === 'Đã kết nối'
      && document.getElementById('settings-form')?.dataset.pending === 'false',
    null, 'BROWSER_QA_STATE_TIMEOUT');

    const authenticated = await cdp.evaluate(() => {
      const actions = Object.fromEntries([...document.querySelectorAll('[data-action]')]
        .map((button) => [button.dataset.action, { disabled: button.disabled, title: button.title }]));
      const text = document.body.innerText;
      return {
        authHidden: document.getElementById('auth-form').hidden,
        passwordCleared: document.getElementById('password').value === '',
        labels: [...document.querySelectorAll('[data-action]')].map((button) => button.textContent.trim()),
        forbiddenTerms: ['Bearer', 'Kiểm tra còi', 'Đóng cửa', 'Mở cửa'].filter((term) => text.includes(term)),
        actions,
        hint: document.getElementById('control-hint').textContent,
        freshness: document.querySelector('.freshness-key').textContent.trim(),
      };
    }, null);
    check('Ẩn credential sau đăng nhập', authenticated.authHidden && authenticated.passwordCleared,
      `authHidden=${authenticated.authHidden}; passwordCleared=${authenticated.passwordCleared}`);
    check('Thuật ngữ UI đúng cơ cấu chốt', authenticated.forbiddenTerms.length === 0
      && authenticated.labels.includes('Khóa ngay')
      && authenticated.labels.includes('Mở chốt')
      && authenticated.labels.includes('Bật còi'),
    `forbidden=${authenticated.forbiddenTerms.join(',') || 'none'}`);
    check('Action-level gate đúng trạng thái hiện tại',
      authenticated.actions.LOCK.disabled
      && !authenticated.actions.UNLOCK.disabled
      && !authenticated.actions.ALARM_ON.disabled
      && authenticated.actions.ALARM_OFF.disabled
      && !authenticated.actions.LED_ON.disabled
      && authenticated.actions.LED_OFF.disabled,
    JSON.stringify(authenticated.actions));
    check('UI nói rõ ACK không phải feedback góc', /không đo góc servo/i.test(authenticated.hint),
      authenticated.hint);
    check('Nhãn polling khớp runtime', /5 giây/.test(authenticated.freshness),
      authenticated.freshness);

    await cdp.evaluate(() => document.getElementById('refresh-phase3').click(), null);
    await waitFor(cdp, () => document.getElementById('history-message')?.textContent.includes('Biểu đồ: đã cập nhật'),
      null, 'BROWSER_QA_PHASE3_TIMEOUT');
    const dataUi = await cdp.evaluate(() => ({
      chartSummary: document.getElementById('chart-summary').textContent,
      barValues: [...document.querySelectorAll('.chart-values')].map((element) => element.textContent.trim()),
      tableRows: document.querySelectorAll('#chart-table-body tr').length,
      historyText: document.getElementById('history-list').textContent,
    }), null);
    check('Biểu đồ có số đọc được và bảng tương đương', dataUi.tableRows === 3
      && dataUi.barValues.length >= 3 && /3 lần mở/.test(dataUi.chartSummary),
    `rows=${dataUi.tableRows}; values=${dataUi.barValues.join('|')}; summary=${dataUi.chartSummary}`);
    check('Lịch sử dùng nhãn thân thiện', /Cửa được mở/.test(dataUi.historyText)
      && /mở cửa trái phép/i.test(dataUi.historyText), dataUi.historyText.replace(/\s+/g, ' ').trim());

    await cdp.evaluate(() => {
      document.getElementById('locker-id').focus();
    }, null);
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
    const keyboard = await cdp.evaluate(() => ({
      action: document.activeElement?.dataset?.action || null,
      outlineWidth: getComputedStyle(document.activeElement).outlineWidth,
    }), null);
    check('Thứ tự Tab bỏ qua nút disabled và focus rõ', keyboard.action === 'UNLOCK'
      && parseFloat(keyboard.outlineWidth) >= 2, JSON.stringify(keyboard));

    const desktopTargets = await visibleInteractionMetrics(cdp);
    const desktopSmall = desktopTargets.filter((item) => item.width < 24 || item.height < 24);
    check('Target desktop đạt tối thiểu 24×24 CSS px', desktopSmall.length === 0,
      desktopSmall.length ? JSON.stringify(desktopSmall) : `${desktopTargets.length} target`);

    await cdp.send('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
    });
    const reducedMotion = await cdp.evaluate(() => {
      const style = getComputedStyle(document.querySelector('.button'));
      return { animationDuration: style.animationDuration, transitionDuration: style.transitionDuration };
    }, null);
    check('Reduced motion được áp dụng', parseFloat(reducedMotion.animationDuration) <= 0.001
      && parseFloat(reducedMotion.transitionDuration) <= 0.001, JSON.stringify(reducedMotion));

    await cdp.evaluate(() => window.scrollTo(0, 0), null);
    await capture(cdp, path.join(OUTPUT_ROOT, 'dashboard-desktop.png'));
    await resize(cdp, 320, 800);
    await cdp.evaluate(() => window.scrollTo(0, 0), null);
    const mobile = await cdp.evaluate(() => ({
      viewport: window.innerWidth,
      layoutViewport: document.documentElement.clientWidth,
      visualViewport: window.visualViewport?.width || window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      bodyWidth: document.body.scrollWidth,
      cardsOutsideViewport: [...document.querySelectorAll('.card')].filter((card) => {
        const rect = card.getBoundingClientRect();
        return rect.left < -0.5 || rect.right > document.documentElement.clientWidth + 0.5;
      }).length,
    }), null);
    check('Mobile 320 px không tràn ngang', mobile.documentWidth <= mobile.layoutViewport
      && mobile.bodyWidth <= mobile.layoutViewport
      && mobile.visualViewport <= mobile.layoutViewport + 0.5
      && mobile.cardsOutsideViewport === 0,
    JSON.stringify(mobile));
    const mobileTargets = await visibleInteractionMetrics(cdp);
    const mobileSmall = mobileTargets.filter((item) => item.width < 24 || item.height < 24);
    check('Target mobile đạt tối thiểu 24×24 CSS px', mobileSmall.length === 0,
      mobileSmall.length ? JSON.stringify(mobileSmall) : `${mobileTargets.length} target`);
    await capture(cdp, path.join(OUTPUT_ROOT, 'dashboard-mobile-320.png'));

    // Earlier requests include event-driven refreshes (for example, the one
    // immediately after login). Observe two subsequent background polls so
    // the assertion measures the scheduler itself rather than that useful
    // foreground refresh plus a pre-existing timer.
    const pollingStartIndex = local.observations.stateRequests.length;
    const pollingDeadline = Date.now() + 12_000;
    while (local.observations.stateRequests.length < pollingStartIndex + 2
        && Date.now() < pollingDeadline) {
      await delay(100);
    }
    const requestTimes = local.observations.stateRequests.slice(pollingStartIndex);
    const gap = requestTimes.length >= 2 ? requestTimes[1] - requestTimes[0] : null;
    check('Hai poll nền liên tiếp cách nhau khoảng 5 giây', gap !== null && gap >= 4_900,
      `requests=${requestTimes.length}; gap=${gap ?? 'n/a'} ms`);
    check('Không có route mock ngoài dự kiến', local.observations.unexpected.length === 0,
      local.observations.unexpected.join(', ') || 'none');
  } finally {
    await closeBrowser(browser).catch((error) => {
      results.push({ check: 'Dọn Chrome profile tạm', result: 'FAIL', evidence: error.message });
    });
    if (local?.server) await stopServer(local.server).catch((error) => {
      results.push({ check: 'Dừng HTTP server local', result: 'FAIL', evidence: error.message });
    });
  }

  const failures = results.filter((item) => item.result !== 'PASS');
  process.stdout.write(`${JSON.stringify({
    result: failures.length ? 'FAIL' : 'PASS',
    browser: 'installed Google Chrome via local CDP',
    external_services: 'not contacted',
    viewports: ['1280x720', '320x800'],
    screenshots: [
      path.relative(ROOT, path.join(OUTPUT_ROOT, 'dashboard-desktop.png')),
      path.relative(ROOT, path.join(OUTPUT_ROOT, 'dashboard-mobile-320.png')),
    ],
    checks: results,
  }, null, 2)}\n`);
  if (failures.length) process.exitCode = 1;
}

run().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  if (results.length) process.stderr.write(`${JSON.stringify({ checks: results }, null, 2)}\n`);
  process.exitCode = 1;
});
