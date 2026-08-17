'use strict';

const storageKey = 'smart-locker-phase2-session';
const refreshRetryMs = 30_000;
const configRetryMs = 5_000;
const requestTimeoutMs = 15_000;
const dataRequestTimeoutMs = 30_000;
const chatbotRequestTimeoutMs = 40_000;
let config = null;
let session = null;
let sessionEpoch = 0;
let renderedLockerId = null;
let renderedSessionEpoch = -1;
let refreshTimer = null;
let refreshRequest = null;
let pollInFlight = null;
let pollRequested = 0;
let chatRequestGeneration = 0;
let authRequestGeneration = 0;
let claimRequestGeneration = 0;
let phase3RequestGeneration = 0;
let settingsRequestGeneration = 0;
let telegramOperationGeneration = 0;
let telegramLinkPollTimer = null;
let telegramConnected = false;
let commandRequestSequence = 0;
let renderedUi = null;
const commandRequests = new Map();

const $ = (id) => document.getElementById(id);
const lockerId = () => $('locker-id').value.trim();
const defaultQuestion = $('question').value;
const statusLabels = {
  mqtt: { CONNECTED: 'Đã kết nối', DISCONNECTED: 'Mất kết nối' },
  device: { ONLINE: 'Đang hoạt động', OFFLINE: 'Ngoại tuyến' },
  wifi: { CONNECTED: 'Đã kết nối', DISCONNECTED: 'Chưa kết nối', UNKNOWN: 'Chưa xác định' },
  door: { OPEN: 'Đang mở', CLOSED: 'Đang đóng', UNKNOWN: 'Chưa xác định' },
  lock: { LOCKED: 'Servo ở vị trí đóng', UNLOCKED: 'Servo ở vị trí mở', UNKNOWN: 'Chưa xác nhận vị trí' },
  alarm: { ACTIVE: 'Đang bật', INACTIVE: 'Đang tắt', UNKNOWN: 'Chưa xác định' },
  led: { ON: 'Đang bật', OFF: 'Đang tắt', UNKNOWN: 'Chưa xác định' },
};
const actionLabels = {
  LOCK: 'Đóng cửa',
  UNLOCK: 'Mở cửa',
  ALARM_ON: 'Bật còi',
  ALARM_OFF: 'Tắt còi',
  LED_ON: 'Bật đèn',
  LED_OFF: 'Tắt đèn',
  GET_STATE: 'Làm mới trạng thái',
};
const eventTypeLabels = {
  DOOR_OPENED: 'Cửa được mở',
  DOOR_CLOSED: 'Cửa đã đóng',
  DOOR_UNKNOWN: 'Trạng thái cửa chưa xác định',
  LOCK_COMMAND: 'Yêu cầu đóng cửa',
  UNLOCK_COMMAND: 'Yêu cầu mở cửa',
  LOCK_STATE_CHANGED: 'Vị trí tay servo thay đổi',
  ALARM_STARTED: 'Còi cảnh báo đã bật',
  ALARM_STOPPED: 'Còi cảnh báo đã tắt',
  LED_TURNED_ON: 'Đèn trong tủ đã bật',
  LED_TURNED_OFF: 'Đèn trong tủ đã tắt',
  DEVICE_ONLINE: 'Thiết bị đã trực tuyến',
  DEVICE_OFFLINE: 'Thiết bị đã ngoại tuyến',
  UNAUTHORIZED_OPEN: 'Phát hiện mở cửa trái phép',
  COMMAND_REJECTED: 'Lệnh bị từ chối',
  COMMAND_TIMEOUT: 'Thiết bị không xác nhận lệnh',
  TELEGRAM_NOTIFICATION: 'Đã xử lý cảnh báo Telegram',
  DAILY_EMAIL_REPORT: 'Đã xử lý báo cáo email',
};
const resultLabels = {
  observed: 'Đã ghi nhận',
  success: 'Thành công',
  failure: 'Thất bại',
  rejected: 'Bị từ chối',
  timeout: 'Hết thời gian chờ',
};
const commandStatusLabels = {
  PENDING: 'Đang chờ thiết bị xác nhận',
  ACKED: 'Thiết bị đã xác nhận',
  COMMAND_TIMEOUT: 'Thiết bị không phản hồi',
  MQTT_DISCONNECTED: 'Mất kết nối MQTT',
  COMMAND_SUCCEEDED: 'Thiết bị đã thực hiện thành công',
  COMMAND_FAILED: 'Thiết bị báo thực hiện thất bại',
};
const notificationStatusLabels = {
  delivered: 'đã gửi',
  failed: 'gửi thất bại',
  not_configured: 'chưa liên kết',
  duplicate_suppressed: 'đã bỏ qua bản trùng',
  rate_limited: 'tạm hoãn do giới hạn tần suất',
};
function message(id, text) { $(id).textContent = text; }
function renderStatus(id, rawValue = 'UNKNOWN') {
  const normalized = String(rawValue || 'UNKNOWN').toUpperCase();
  const element = $(id);
  element.textContent = statusLabels[id]?.[normalized] || 'Chưa xác định';
  element.dataset.state = normalized.toLowerCase();
}
function actionLabel(action) { return actionLabels[action] || 'Lệnh chưa xác định'; }
function notificationStatusLabel(status) {
  return notificationStatusLabels[status] || (status ? 'chưa xác định' : 'đang xử lý');
}

function setAuthMode(mode) {
  const registering = mode === 'register';
  $('auth-form').dataset.mode = registering ? 'register' : 'login';
  $('full-name-field').hidden = !registering;
  $('full-name').required = registering;
  $('password').autocomplete = registering ? 'new-password' : 'current-password';
  $('auth-submit').textContent = registering ? 'Đăng ký' : 'Đăng nhập';
  $('auth-mode-toggle').textContent = registering ? 'Quay lại đăng nhập' : 'Tạo tài khoản mới';
  $('auth-mode-toggle').setAttribute('aria-pressed', registering ? 'true' : 'false');
}

function setAuthConfigReady(ready) {
  $('auth-submit').disabled = !ready;
  $('auth-mode-toggle').disabled = !ready;
}
function formatDateTime(value, timezone = 'Asia/Ho_Chi_Minh') {
  const parsed = new Date(value);
  if (!value || Number.isNaN(parsed.getTime())) return 'Không rõ thời gian';
  const options = { timeZone: timezone, hour12: false,
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit' };
  try {
    return parsed.toLocaleString('vi-VN', options);
  } catch (_error) {
    return parsed.toLocaleString('vi-VN', { ...options, timeZone: 'Asia/Ho_Chi_Minh' });
  }
}
function claimMessage(text = '', state = 'idle') {
  message('claim-message', text);
  $('claim-message').dataset.state = state;
}

function hasRenderedContext() {
  return Boolean(session) && renderedSessionEpoch === sessionEpoch
    && renderedLockerId === lockerId();
}

function hasAuthenticatedLockerSelection() {
  return Boolean(session?.access_token) && lockerId().length > 0;
}

function clearPhase3State() {
  phase3RequestGeneration += 1;
  settingsRequestGeneration += 1;
  telegramOperationGeneration += 1;
  clearTimeout(telegramLinkPollTimer);
  telegramLinkPollTimer = null;
  $('refresh-phase3').disabled = false;
  $('refresh-phase3').dataset.pending = 'false';
  $('refresh-phase3').setAttribute('aria-busy', 'false');
  $('settings-form').dataset.pending = 'false';
  $('settings-form').setAttribute('aria-busy', 'false');
  $('history-list').textContent = 'Chưa tải lịch sử.';
  $('chart-summary').textContent = 'Chưa tải dữ liệu biểu đồ.';
  $('chart-bars').innerHTML = '';
  $('chart-empty').hidden = true;
  $('chart-table-body').innerHTML = '';
  message('history-message', '');
  $('telegram-enabled').checked = false;
  telegramConnected = false;
  $('telegram-connection').dataset.connected = 'false';
  $('telegram-status').textContent = 'Chưa liên kết. Bạn không cần tìm hoặc nhập Chat ID.';
  $('telegram-link').textContent = 'Liên kết Telegram';
  $('telegram-link').dataset.pending = 'false';
  $('telegram-link').setAttribute('aria-busy', 'false');
  $('telegram-test').hidden = true;
  $('telegram-test').dataset.pending = 'false';
  $('telegram-test').setAttribute('aria-busy', 'false');
  $('telegram-disconnect').hidden = true;
  $('telegram-disconnect').dataset.pending = 'false';
  $('telegram-disconnect').setAttribute('aria-busy', 'false');
  $('telegram-open-link').hidden = true;
  $('telegram-open-link').removeAttribute('href');
  $('email-enabled').checked = false;
  $('report-email').value = '';
  $('report-time').value = '21:00';
  $('report-timezone').value = 'Asia/Ho_Chi_Minh';
  syncNotificationFields();
  message('settings-message', '');
}

function clearSensitiveState(reason = 'Chưa có dữ liệu live đã xác nhận.', clearAnswer = false) {
  renderedLockerId = null;
  renderedSessionEpoch = -1;
  renderedUi = null;
  commandRequests.clear();
  renderStatus('mqtt', 'DISCONNECTED');
  renderStatus('device', 'OFFLINE');
  renderStatus('wifi', 'UNKNOWN');
  renderStatus('door', 'UNKNOWN');
  renderStatus('lock', 'UNKNOWN');
  renderStatus('alarm', 'UNKNOWN');
  renderStatus('led', 'UNKNOWN');
  $('updated').textContent = '—';
  $('alert').textContent = '—';
  message('state-message', reason);
  message('command-message', 'Chưa có lệnh nào được gửi. Kết quả chỉ được xác nhận sau ACK hợp lệ.');
  if (clearAnswer) {
    chatRequestGeneration += 1;
    authRequestGeneration += 1;
    claimRequestGeneration += 1;
    $('answer').textContent = '';
    $('full-name').value = '';
    $('email').value = '';
    $('password').value = '';
    $('question').value = defaultQuestion;
    claimMessage();
    clearPhase3State();
    ['auth-form', 'claim-form', 'chat-form', 'settings-form'].forEach((id) => {
      $(id).dataset.pending = 'false';
      $(id).setAttribute('aria-busy', 'false');
    });
  }
}

function invalidateLockerContext(reason = 'Locker ID đã thay đổi; đang chờ trạng thái được xác nhận.') {
  chatRequestGeneration += 1;
  $('answer').textContent = '';
  $('chat-form').dataset.pending = 'false';
  $('chat-form').setAttribute('aria-busy', 'false');
  clearSensitiveState(reason);
  clearPhase3State();
  renderControls(null);
}

async function jsonFetch(url, options = {}) {
  const controller = new AbortController();
  const callerSignal = options.signal;
  const timeoutMs = Number.isFinite(options.timeoutMs) && options.timeoutMs > 0
    ? options.timeoutMs : requestTimeoutMs;
  const fetchOptions = { ...options };
  delete fetchOptions.timeoutMs;
  let timedOut = false;
  const forwardAbort = () => controller.abort(callerSignal.reason);
  if (callerSignal?.aborted) forwardAbort();
  else callerSignal?.addEventListener('abort', forwardAbort, { once: true });
  const requestTimer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  try {
    const response = await fetch(url, { ...fetchOptions, signal: controller.signal });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw Object.assign(new Error(body.msg || body.message || body.code || `HTTP ${response.status}`), { status: response.status, body });
    return body;
  } catch (error) {
    if (timedOut) throw Object.assign(new Error('REQUEST_TIMEOUT'), { code: 'REQUEST_TIMEOUT' });
    throw error;
  } finally {
    clearTimeout(requestTimer);
    callerSignal?.removeEventListener('abort', forwardAbort);
  }
}

function consumeAuthFragment() {
  const rawHash = window.location.hash;
  if (!rawHash || rawHash.length === 1) return null;
  const params = new URLSearchParams(rawHash.slice(1));
  const authKeys = ['access_token', 'refresh_token', 'error', 'error_code', 'error_description'];
  if (!authKeys.some((key) => params.has(key))) return null;

  window.history.replaceState(null, document.title, `${window.location.pathname}${window.location.search}`);
  if (params.has('error') || params.has('error_code') || params.has('error_description')) {
    const code = params.get('error_code') || params.get('error') || 'AUTH_CALLBACK_FAILED';
    const description = params.get('error_description') || 'Supabase không thể hoàn tất xác thực.';
    return { error: `${code}: ${description}` };
  }

  const accessToken = params.get('access_token');
  if (!accessToken) return { error: 'AUTH_CALLBACK_INVALID: Callback không có access token.' };
  const expiresIn = Number(params.get('expires_in'));
  const explicitExpiry = Number(params.get('expires_at'));
  const expiresAt = Number.isFinite(explicitExpiry) && explicitExpiry > 0
    ? explicitExpiry
    : Math.floor(Date.now() / 1000) + (Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn : 3600);
  const callbackSession = {
    access_token: accessToken,
    token_type: params.get('token_type') || 'bearer',
    expires_at: expiresAt,
  };
  const refreshToken = params.get('refresh_token');
  if (refreshToken) callbackSession.refresh_token = refreshToken;
  if (Number.isFinite(expiresIn) && expiresIn > 0) callbackSession.expires_in = expiresIn;
  return { session: callbackSession };
}

function restoreStoredSession() {
  try {
    return JSON.parse(sessionStorage.getItem(storageKey) || 'null');
  } catch {
    sessionStorage.removeItem(storageKey);
    return null;
  }
}

async function supabase(path, options = {}) {
  return jsonFetch(`${config.supabase_url}${path}`, { ...options, headers: {
    apikey: config.supabase_anon_key, 'Content-Type': 'application/json', ...(options.headers || {}),
  } });
}

function saveSession(value, { clearPrivate = false } = {}) {
  const shouldClearPrivate = !value
    && (clearPrivate || Boolean(session) || Boolean(sessionStorage.getItem(storageKey)));
  session = value;
  sessionEpoch += 1;
  pollRequested += 1;
  if (value) sessionStorage.setItem(storageKey, JSON.stringify(value)); else sessionStorage.removeItem(storageKey);
  $('logout').hidden = !value;
  $('session-label').textContent = value ? 'Đã đăng nhập — token được vận chuyển bằng Bearer' : 'Chưa đăng nhập';
  if (!value) {
    setAuthMode('login');
    clearSensitiveState(undefined, shouldClearPrivate);
  }
  scheduleRefresh();
  renderControls(null);
}

function scheduleRefresh() {
  clearTimeout(refreshTimer);
  if (!session?.expires_at) return;
  const wait = Math.max(1000, session.expires_at * 1000 - Date.now() - 60_000);
  refreshTimer = setTimeout(refresh, wait);
}

function accessTokenExpired(value = session) {
  const expiresAt = Number(value?.expires_at);
  return Boolean(value?.access_token) && Number.isFinite(expiresAt)
    && expiresAt * 1000 <= Date.now();
}

function refresh() {
  const refreshSession = session;
  const refreshEpoch = sessionEpoch;
  if (refreshRequest?.epoch === refreshEpoch) return refreshRequest.promise;

  const currentRequest = { epoch: refreshEpoch, promise: null };
  refreshRequest = currentRequest;
  currentRequest.promise = (async () => {
    try {
      if (!refreshSession?.refresh_token) {
        saveSession(null);
        return;
      }
      const next = await supabase('/auth/v1/token?grant_type=refresh_token', {
        method: 'POST', body: JSON.stringify({ refresh_token: refreshSession.refresh_token }),
      });
      if (sessionEpoch !== refreshEpoch) return;
      saveSession(next); await pollState(); await loadSettings({ quiet: true });
    } catch (error) {
      if (sessionEpoch !== refreshEpoch) return;
      if ([400, 401, 403].includes(error.status)) {
        saveSession(null); message('auth-message', 'Phiên đã hết hạn. Vui lòng đăng nhập lại.');
        return;
      }
      if (accessTokenExpired(refreshSession)) {
        clearSensitiveState('Phiên truy cập đã hết hạn; đang chờ làm mới an toàn.');
        renderControls(null);
      }
      message('auth-message', 'Dịch vụ xác thực tạm thời không khả dụng; phiên cục bộ được giữ và sẽ thử lại.');
      clearTimeout(refreshTimer);
      refreshTimer = setTimeout(refresh, refreshRetryMs);
    } finally {
      if (refreshRequest === currentRequest) refreshRequest = null;
    }
  })();
  return currentRequest.promise;
}

async function protectedFetch(path, options = {}) {
  const requestSession = session;
  const requestEpoch = sessionEpoch;
  if (!requestSession?.access_token) throw new Error('AUTH_REQUIRED');
  try {
    return await jsonFetch(path, { ...options, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${requestSession.access_token}`, ...(options.headers || {}) } });
  } catch (error) {
    if (error.status === 401 && sessionEpoch === requestEpoch
      && session?.access_token === requestSession.access_token) {
      saveSession(null); message('auth-message', 'Phiên không còn hợp lệ.');
    }
    throw error;
  }
}

function renderControls(ui) {
  document.querySelectorAll('[data-action]').forEach((button) => {
    const domain = button.dataset.domain;
    const pending = Boolean(ui?.controls?.[domain]?.pending) || commandRequests.has(domain);
    button.disabled = !hasRenderedContext() || Boolean(ui?.stale)
      || !ui?.controls?.[domain]?.enabled || pending;
    button.dataset.pending = pending ? 'true' : 'false';
    button.setAttribute('aria-busy', pending ? 'true' : 'false');
  });
}

function renderState(ui, targetLocker) {
  if (!session || targetLocker !== lockerId()) return;
  renderedLockerId = targetLocker;
  renderedSessionEpoch = sessionEpoch;
  renderedUi = ui;
  renderStatus('mqtt', ui.mqtt);
  renderStatus('device', ui.device);
  renderStatus('wifi', ui.wifi);
  renderStatus('door', ui.door);
  renderStatus('lock', ui.stale || ui.lock_unconfirmed ? 'UNKNOWN' : ui.lock);
  renderStatus('alarm', ui.stale ? 'UNKNOWN' : ui.alarm);
  renderStatus('led', ui.stale ? 'UNKNOWN' : ui.led);
  $('updated').textContent = ui.last_updated ? formatDateTime(ui.last_updated) : '—';
  $('alert').textContent = ui.latest_alert
    ? `${eventTypeLabels[ui.latest_alert.event_type] || 'Cảnh báo'} · ${formatDateTime(ui.latest_alert.occurred_at)}`
      + ` · Telegram: ${notificationStatusLabel(ui.latest_alert.notification_status)}`
    : '—';
  const persistence = ui.persistence?.status === 'error'
    ? ` Supabase: ${ui.persistence.last_error}.` : '';
  message('state-message', (ui.stale
    ? 'Dữ liệu đã cũ hoặc chưa được xác minh; các nút điều khiển tạm khóa.'
    : 'Dữ liệu mới nhất đã được xác nhận.') + persistence);
  if (ui.command_status) {
    const value = ui.command_status;
    message('command-message', `${actionLabel(value.action)}: ${commandStatusLabels[value.status] || 'Trạng thái lệnh chưa xác định'}`
      + ` (${value.command_id.slice(0, 8)})`);
  }
  renderControls(ui);
}

function validRangeDays() {
  return ['7', '30'].includes($('range-days').value) ? $('range-days').value : '7';
}

function renderHistory(result) {
  const events = Array.isArray(result.events) ? result.events : [];
  const timezone = result.timezone || 'Asia/Ho_Chi_Minh';
  $('history-list').textContent = events.length
    ? events.map((event) => {
      const details = [resultLabels[event.result] || 'Đã ghi nhận'];
      if (event.action) details.push(actionLabel(event.action));
      if (event.authorized === true) details.push('Mở cửa hợp lệ');
      if (event.authorized === false) details.push('Cần kiểm tra');
      return `${formatDateTime(event.occurred_at, timezone)} — ${eventTypeLabels[event.event_type] || 'Hoạt động khác'}\n${details.join(' · ')}`;
    }).join('\n\n')
    : 'Không có sự kiện trong khoảng đã chọn.';
  const from = result.range?.from ? formatDateTime(result.range.from, timezone) : '—';
  const to = result.range?.to ? formatDateTime(result.range.to, timezone) : '—';
  message('history-message', `${events.length} sự kiện · ${from} đến ${to}`);
}

function renderChart(result) {
  const buckets = Array.isArray(result.buckets) ? result.buckets : [];
  const maximum = Math.max(1, ...buckets.flatMap((bucket) => [Number(bucket.opens) || 0, Number(bucket.alerts) || 0]));
  $('chart-summary').textContent = `${result.days || validRangeDays()} ngày · ${result.timezone || 'Asia/Ho_Chi_Minh'} · `
    + `${result.totals?.opens || 0} lần mở · ${result.totals?.alerts || 0} cảnh báo`;
  $('chart-empty').hidden = buckets.some((bucket) => (Number(bucket.opens) || 0) > 0
    || (Number(bucket.alerts) || 0) > 0);
  $('chart-bars').innerHTML = buckets.map((bucket) => {
    const date = /^\d{4}-\d{2}-\d{2}$/.test(String(bucket.date)) ? String(bucket.date) : 'unknown';
    const opens = Math.max(0, Number(bucket.opens) || 0);
    const alerts = Math.max(0, Number(bucket.alerts) || 0);
    const openHeight = opens === 0 ? 0 : Math.max(2, Math.round((opens / maximum) * 170));
    const alertHeight = alerts === 0 ? 0 : Math.max(2, Math.round((alerts / maximum) * 170));
    return `<div class="chart-day"><i class="chart-bar chart-bar--open" title="${opens} lần mở" style="height:${openHeight}px"></i>`
      + `<i class="chart-bar chart-bar--alert" title="${alerts} cảnh báo" style="height:${alertHeight}px"></i>`
      + `<span class="chart-label">${date.slice(5)}</span></div>`;
  }).join('');
  $('chart-table-body').innerHTML = buckets.map((bucket) => {
    const date = /^\d{4}-\d{2}-\d{2}$/.test(String(bucket.date)) ? String(bucket.date) : 'unknown';
    const opens = Math.max(0, Number(bucket.opens) || 0);
    const alerts = Math.max(0, Number(bucket.alerts) || 0);
    return `<tr><th scope="row">${date}</th><td>${opens}</td><td>${alerts}</td></tr>`;
  }).join('');
}

async function loadPhase3Data() {
  if (!hasAuthenticatedLockerSelection()) {
    message('history-message', 'Cần đăng nhập và chọn Locker ID trước khi tải dữ liệu.');
    return;
  }
  const requestGeneration = ++phase3RequestGeneration;
  const requestEpoch = sessionEpoch;
  const targetLocker = lockerId();
  const days = validRangeDays();
  $('refresh-phase3').disabled = true;
  $('refresh-phase3').dataset.pending = 'true';
  $('refresh-phase3').setAttribute('aria-busy', 'true');
  message('history-message', 'Đang tải lịch sử và biểu đồ…');
  try {
    const [historyResult, chartResult] = await Promise.allSettled([
      protectedFetch(`/api/v1/lockers/${encodeURIComponent(targetLocker)}/history?days=${days}`,
        { timeoutMs: dataRequestTimeoutMs }),
      protectedFetch(`/api/v1/lockers/${encodeURIComponent(targetLocker)}/chart?days=${days}`,
        { timeoutMs: dataRequestTimeoutMs }),
    ]);
    if (phase3RequestGeneration !== requestGeneration || sessionEpoch !== requestEpoch
      || lockerId() !== targetLocker) return;

    const messages = [];
    if (historyResult.status === 'fulfilled') {
      renderHistory(historyResult.value);
      const count = Array.isArray(historyResult.value.events) ? historyResult.value.events.length : 0;
      messages.push(`Lịch sử: ${count} sự kiện`);
    } else {
      $('history-list').textContent = 'Dữ liệu tạm thời không khả dụng.';
      messages.push(`Không tải được lịch sử: ${historyResult.reason?.message || 'HISTORY_UNAVAILABLE'}`);
    }

    if (chartResult.status === 'fulfilled') {
      renderChart(chartResult.value);
      messages.push('Biểu đồ: đã cập nhật');
    } else {
      $('chart-summary').textContent = 'Biểu đồ tạm thời không khả dụng.';
      $('chart-bars').innerHTML = '';
      $('chart-empty').hidden = true;
      $('chart-table-body').innerHTML = '';
      messages.push(`Không tải được biểu đồ: ${chartResult.reason?.message || 'CHART_UNAVAILABLE'}`);
    }
    message('history-message', messages.join(' · '));
  } catch (error) {
    if (phase3RequestGeneration === requestGeneration && sessionEpoch === requestEpoch) {
      message('history-message', `Không tải được dữ liệu: ${error.message}`);
    }
  } finally {
    if (phase3RequestGeneration === requestGeneration) {
      $('refresh-phase3').disabled = false;
      $('refresh-phase3').dataset.pending = 'false';
      $('refresh-phase3').setAttribute('aria-busy', 'false');
    }
  }
}

function syncNotificationFields() {
  const emailEnabled = $('email-enabled').checked;
  $('telegram-enabled').disabled = !telegramConnected;
  if (!telegramConnected) $('telegram-enabled').checked = false;
  ['report-email', 'report-time', 'report-timezone'].forEach((id) => {
    $(id).disabled = !emailEnabled;
  });
  $('report-email').required = emailEnabled;
  ['report-email-field', 'report-time-field', 'report-timezone-field'].forEach((id) => {
    $(id).dataset.enabled = emailEnabled ? 'true' : 'false';
  });
}

function renderTelegramConnection(setting = {}) {
  telegramConnected = Boolean(setting.telegram_connected);
  $('telegram-connection').dataset.connected = telegramConnected ? 'true' : 'false';
  $('telegram-link').textContent = telegramConnected ? 'Liên kết lại' : 'Liên kết Telegram';
  $('telegram-test').hidden = !telegramConnected;
  $('telegram-disconnect').hidden = !telegramConnected;
  const identity = setting.telegram_username ? `@${setting.telegram_username}` : 'tài khoản Telegram riêng tư';
  $('telegram-status').textContent = telegramConnected
    ? `Đã liên kết với ${identity}. Chat ID được giữ kín ở máy chủ.`
    : 'Chưa liên kết. Bạn không cần tìm hoặc nhập Chat ID.';
}

function applySettings(setting) {
  renderTelegramConnection(setting);
  $('telegram-enabled').checked = Boolean(setting.telegram_enabled);
  $('email-enabled').checked = Boolean(setting.email_enabled);
  $('report-email').value = setting.email_address || '';
  $('report-time').value = String(setting.report_time || '21:00').slice(0, 5);
  $('report-timezone').value = setting.timezone || 'Asia/Ho_Chi_Minh';
  syncNotificationFields();
}

async function loadSettings(options = {}) {
  const quiet = Boolean(options.quiet);
  if (!hasAuthenticatedLockerSelection()) {
    if (!quiet) message('settings-message', 'Cần đăng nhập và chọn Locker ID trước khi tải cài đặt.');
    return;
  }
  const generation = ++settingsRequestGeneration;
  const requestEpoch = sessionEpoch;
  const targetLocker = lockerId();
  $('settings-form').dataset.pending = 'true';
  $('settings-form').setAttribute('aria-busy', 'true');
  try {
    const result = await protectedFetch(
      `/api/v1/lockers/${encodeURIComponent(targetLocker)}/notification-settings`,
      { timeoutMs: dataRequestTimeoutMs });
    if (generation !== settingsRequestGeneration || requestEpoch !== sessionEpoch || targetLocker !== lockerId()) return;
    applySettings(result.setting || {});
    if (!quiet) message('settings-message', 'Đã tải cài đặt báo cáo.');
  } catch (error) {
    if (!quiet && generation === settingsRequestGeneration && requestEpoch === sessionEpoch) {
      message('settings-message', `Không tải được cài đặt: ${error.message}`);
    }
  } finally {
    if (generation === settingsRequestGeneration) {
      $('settings-form').dataset.pending = 'false';
      $('settings-form').setAttribute('aria-busy', 'false');
    }
  }
}

function scheduleTelegramLinkPolling({ operation, requestEpoch, targetLocker, expiresAt }) {
  clearTimeout(telegramLinkPollTimer);
  const deadline = Number.isFinite(Date.parse(expiresAt)) ? Date.parse(expiresAt) : Date.now() + 10 * 60_000;
  const poll = async () => {
    if (operation !== telegramOperationGeneration || requestEpoch !== sessionEpoch
        || targetLocker !== lockerId()) return;
    if (Date.now() >= deadline) {
      message('settings-message', 'Liên kết Telegram đã hết hạn. Hãy bấm “Liên kết Telegram” để tạo mã mới.');
      $('telegram-open-link').hidden = true;
      $('telegram-open-link').removeAttribute('href');
      return;
    }
    const generation = ++settingsRequestGeneration;
    try {
      const result = await protectedFetch(
        `/api/v1/lockers/${encodeURIComponent(targetLocker)}/notification-settings`,
        { timeoutMs: dataRequestTimeoutMs });
      if (operation !== telegramOperationGeneration || requestEpoch !== sessionEpoch
          || targetLocker !== lockerId()) return;
      // Another settings request may have superseded this response. Do not
      // render stale data, but keep the active link operation polling until
      // it succeeds, expires, or the session/locker changes.
      if (generation === settingsRequestGeneration) {
        applySettings(result.setting || {});
        if (telegramConnected) {
          $('telegram-open-link').hidden = true;
          $('telegram-open-link').removeAttribute('href');
          message('settings-message', 'Liên kết Telegram thành công. Bạn có thể gửi tin nhắn thử ngay.');
          return;
        }
      }
    } catch (_error) {
      if (operation !== telegramOperationGeneration || requestEpoch !== sessionEpoch) return;
    }
    if (operation === telegramOperationGeneration && requestEpoch === sessionEpoch
        && targetLocker === lockerId()) {
      telegramLinkPollTimer = setTimeout(poll, 2000);
    }
  };
  telegramLinkPollTimer = setTimeout(poll, 1500);
}

function pollState() {
  pollRequested += 1;
  if (pollInFlight) return pollInFlight;
  pollInFlight = (async () => {
    let currentRequest;
    do {
      currentRequest = pollRequested;
      if (!session) break;
      if (accessTokenExpired()) {
        clearSensitiveState('Phiên truy cập đã hết hạn; đang chờ làm mới an toàn.');
        renderControls(null);
        break;
      }
      const requestEpoch = sessionEpoch;
      const targetLocker = lockerId();
      try {
        const ui = await protectedFetch(`/api/v1/lockers/${encodeURIComponent(targetLocker)}/state`);
        if (sessionEpoch === requestEpoch && lockerId() === targetLocker) renderState(ui, targetLocker);
      } catch (error) {
        if (sessionEpoch === requestEpoch && lockerId() === targetLocker) {
          clearSensitiveState(`Không lấy được live state: ${error.message}`);
          renderControls(null);
        }
      }
    } while (session && currentRequest !== pollRequested);
  })().finally(() => { pollInFlight = null; });
  return pollInFlight;
}

$('auth-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  if (form.dataset.pending === 'true') return;
  const mode = form.dataset.mode || 'login';
  if (!['login', 'register'].includes(mode)) return;
  if (!config) {
    $('password').value = '';
    message('auth-message', 'Dashboard đang khởi tạo cấu hình; vui lòng thử lại sau giây lát.');
    return;
  }
  const email = $('email').value.trim(); const password = $('password').value;
  const fullName = $('full-name').value.trim();
  if (mode === 'register' && !fullName) {
    $('password').value = '';
    message('auth-message', 'Vui lòng nhập họ và tên khi đăng ký.'); return;
  }
  const requestEpoch = sessionEpoch;
  const requestGeneration = ++authRequestGeneration;
  form.dataset.pending = 'true';
  form.setAttribute('aria-busy', 'true');
  try {
    const path = mode === 'register' ? '/auth/v1/signup' : '/auth/v1/token?grant_type=password';
    const payload = mode === 'register' ? { email, password, data: { full_name: fullName } } : { email, password };
    $('password').value = '';
    const result = await supabase(path, { method: 'POST', body: JSON.stringify(payload) });
    if (sessionEpoch !== requestEpoch) return;
    if (result.access_token) {
      saveSession(result);
      message('auth-message', 'Xác thực thành công.');
      await pollState();
      await loadSettings({ quiet: true });
    }
    else message('auth-message', 'Đăng ký thành công; kiểm tra email nếu project yêu cầu xác nhận.');
  } catch (error) { if (sessionEpoch === requestEpoch) message('auth-message', `Xác thực thất bại: ${error.message}`); }
  finally {
    $('password').value = '';
    if (authRequestGeneration === requestGeneration) {
      form.dataset.pending = 'false';
      form.setAttribute('aria-busy', 'false');
    }
  }
});

$('auth-mode-toggle').addEventListener('click', () => {
  setAuthMode($('auth-form').dataset.mode === 'register' ? 'login' : 'register');
  message('auth-message', $('auth-form').dataset.mode === 'register'
    ? 'Nhập họ tên, email và mật khẩu để tạo tài khoản.'
    : 'Nhập email và mật khẩu để đăng nhập.');
});

$('logout').addEventListener('click', async () => {
  const accessToken = session?.access_token;
  saveSession(null);
  const logoutEpoch = sessionEpoch;
  message('auth-message', 'Đã đăng xuất.');
  if (!accessToken) return;
  try {
    await supabase('/auth/v1/logout', { method: 'POST', headers: { Authorization: `Bearer ${accessToken}` } });
  } catch (error) {
    if (sessionEpoch === logoutEpoch) message('auth-message', `Đã đăng xuất trên thiết bị này; không thể kết thúc phiên máy chủ: ${error.message}`);
  }
});

$('claim-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  if (form.dataset.pending === 'true') return;
  form.dataset.pending = 'true';
  form.setAttribute('aria-busy', 'true');
  const requestEpoch = sessionEpoch;
  const requestGeneration = ++claimRequestGeneration;
  const requestedLocker = $('locker-code').value.trim();
  claimMessage('Đang gửi yêu cầu claim…', 'pending');
  try { const result = await protectedFetch('/api/v1/lockers/claim', { method: 'POST', body: JSON.stringify({ locker_code: requestedLocker }) });
    if (sessionEpoch !== requestEpoch) return;
    const claimedLocker = result.locker?.locker_code || requestedLocker;
    $('locker-id').value = claimedLocker;
    invalidateLockerContext('Đang xác minh live state cho tủ vừa claim.');
    claimMessage(`Claim thành công: ${claimedLocker}; đang xác minh live state.`, 'success');
    await pollState();
    await loadSettings({ quiet: true });
  } catch (error) {
    if (sessionEpoch === requestEpoch) claimMessage(`Claim bị từ chối: ${error.message}`, 'error');
  }
  finally {
    if (claimRequestGeneration === requestGeneration) {
      form.dataset.pending = 'false';
      form.setAttribute('aria-busy', 'false');
    }
  }
});

document.querySelectorAll('[data-action]').forEach((button) => button.addEventListener('click', async () => {
  const requestEpoch = sessionEpoch;
  const targetLocker = lockerId();
  const domain = button.dataset.domain;
  if (!hasRenderedContext()) {
    invalidateLockerContext('Locker chưa có live state được xác nhận; command bị khóa.');
    return;
  }
  if (commandRequests.has(domain)) return;
  const requestId = ++commandRequestSequence;
  commandRequests.set(domain, { requestId, requestEpoch, targetLocker });
  renderControls(renderedUi);
  message('command-message', `${actionLabel(button.dataset.action)}: đang chờ thiết bị xác nhận…`);
  try {
    const result = await protectedFetch('/api/v1/commands', { method: 'POST', body: JSON.stringify({ locker_id: targetLocker, action: button.dataset.action }) });
    if (sessionEpoch !== requestEpoch || lockerId() !== targetLocker
      || renderedLockerId !== targetLocker) return;
    message('command-message', `${actionLabel(button.dataset.action)}: đã gửi, đang chờ ACK (${result.command.command_id.slice(0, 8)}).`);
    await pollState();
  } catch (error) {
    if (sessionEpoch !== requestEpoch || lockerId() !== targetLocker
      || renderedLockerId !== targetLocker) return;
    if (error.code === 'REQUEST_TIMEOUT') {
      message('command-message', `${actionLabel(button.dataset.action)}: KẾT QUẢ CHƯA XÁC ĐỊNH — đang đối soát; không gửi lại ngay.`);
    } else {
      message('command-message', `Lệnh bị từ chối: ${error.message}`);
    }
    await pollState();
  } finally {
    if (commandRequests.get(domain)?.requestId === requestId) {
      commandRequests.delete(domain);
      if (sessionEpoch === requestEpoch && lockerId() === targetLocker
        && renderedLockerId === targetLocker) renderControls(renderedUi);
    }
  }
}));

$('refresh-phase3').addEventListener('click', loadPhase3Data);
$('range-days').addEventListener('change', () => { if (hasAuthenticatedLockerSelection()) loadPhase3Data(); });
$('load-settings').addEventListener('click', loadSettings);
$('telegram-enabled').addEventListener('change', syncNotificationFields);
$('email-enabled').addEventListener('change', syncNotificationFields);

$('telegram-link').addEventListener('click', async () => {
  if (!hasAuthenticatedLockerSelection() || $('telegram-link').dataset.pending === 'true') {
    message('settings-message', 'Cần đăng nhập và chọn đúng tủ trước khi liên kết Telegram.');
    return;
  }
  const operation = ++telegramOperationGeneration;
  const requestEpoch = sessionEpoch;
  const targetLocker = lockerId();
  clearTimeout(telegramLinkPollTimer);
  $('telegram-open-link').hidden = true;
  $('telegram-open-link').removeAttribute('href');
  $('telegram-link').dataset.pending = 'true';
  $('telegram-link').setAttribute('aria-busy', 'true');
  message('settings-message', 'Đang tạo liên kết Telegram dùng một lần…');
  let popup = null;
  try {
    popup = window.open('about:blank', '_blank');
    if (popup) popup.opener = null;
  } catch (_error) {
    popup = null;
  }
  try {
    const result = await protectedFetch(
      `/api/v1/lockers/${encodeURIComponent(targetLocker)}/telegram-link`,
      { method: 'POST', timeoutMs: dataRequestTimeoutMs });
    if (operation !== telegramOperationGeneration || requestEpoch !== sessionEpoch
        || targetLocker !== lockerId()) {
      popup?.close?.();
      return;
    }
    $('telegram-open-link').setAttribute('href', result.link_url);
    $('telegram-open-link').hidden = Boolean(popup);
    if (popup) popup.location.href = result.link_url;
    message('settings-message', popup
      ? 'Telegram đã được mở. Hãy bấm Start; hệ thống sẽ tự nhận diện tài khoản của bạn.'
      : 'Trình duyệt đã chặn cửa sổ mới. Hãy bấm “Mở bot Telegram”, rồi bấm Start.');
    scheduleTelegramLinkPolling({ operation, requestEpoch, targetLocker, expiresAt: result.expires_at });
  } catch (error) {
    popup?.close?.();
    if (operation === telegramOperationGeneration && requestEpoch === sessionEpoch) {
      message('settings-message', `Không tạo được liên kết Telegram: ${error.message}`);
    }
  } finally {
    if (operation === telegramOperationGeneration) {
      $('telegram-link').dataset.pending = 'false';
      $('telegram-link').setAttribute('aria-busy', 'false');
    }
  }
});

$('telegram-test').addEventListener('click', async () => {
  if (!hasAuthenticatedLockerSelection() || !telegramConnected
      || $('telegram-test').dataset.pending === 'true') return;
  const operation = ++telegramOperationGeneration;
  const requestEpoch = sessionEpoch;
  const targetLocker = lockerId();
  $('telegram-test').dataset.pending = 'true';
  $('telegram-test').setAttribute('aria-busy', 'true');
  try {
    await protectedFetch(`/api/v1/lockers/${encodeURIComponent(targetLocker)}/telegram-test`, {
      method: 'POST', timeoutMs: dataRequestTimeoutMs,
    });
    if (operation === telegramOperationGeneration && requestEpoch === sessionEpoch
        && targetLocker === lockerId()) message('settings-message', 'Đã gửi tin nhắn thử tới Telegram đã liên kết.');
  } catch (error) {
    if (operation === telegramOperationGeneration && requestEpoch === sessionEpoch) {
      message('settings-message', `Không gửi được tin nhắn thử: ${error.message}`);
    }
  } finally {
    if (operation === telegramOperationGeneration) {
      $('telegram-test').dataset.pending = 'false';
      $('telegram-test').setAttribute('aria-busy', 'false');
    }
  }
});

$('telegram-disconnect').addEventListener('click', async () => {
  if (!hasAuthenticatedLockerSelection() || !telegramConnected
      || $('telegram-disconnect').dataset.pending === 'true') return;
  if (typeof window.confirm === 'function'
      && !window.confirm('Ngắt liên kết Telegram khỏi tủ này?')) return;
  const operation = ++telegramOperationGeneration;
  const requestEpoch = sessionEpoch;
  const targetLocker = lockerId();
  clearTimeout(telegramLinkPollTimer);
  $('telegram-disconnect').dataset.pending = 'true';
  $('telegram-disconnect').setAttribute('aria-busy', 'true');
  try {
    const result = await protectedFetch(
      `/api/v1/lockers/${encodeURIComponent(targetLocker)}/telegram-link`,
      { method: 'DELETE', timeoutMs: dataRequestTimeoutMs });
    if (operation !== telegramOperationGeneration || requestEpoch !== sessionEpoch
        || targetLocker !== lockerId()) return;
    applySettings(result.setting || {});
    $('telegram-open-link').hidden = true;
    $('telegram-open-link').removeAttribute('href');
    message('settings-message', 'Đã ngắt liên kết Telegram và tắt cảnh báo trên kênh này.');
  } catch (error) {
    if (operation === telegramOperationGeneration && requestEpoch === sessionEpoch) {
      message('settings-message', `Không ngắt được liên kết Telegram: ${error.message}`);
    }
  } finally {
    if (operation === telegramOperationGeneration) {
      $('telegram-disconnect').dataset.pending = 'false';
      $('telegram-disconnect').setAttribute('aria-busy', 'false');
    }
  }
});

$('settings-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!hasAuthenticatedLockerSelection() || event.currentTarget.dataset.pending === 'true') {
    message('settings-message', 'Cần đăng nhập và chọn Locker ID trước khi lưu cài đặt.');
    return;
  }
  const generation = ++settingsRequestGeneration;
  const requestEpoch = sessionEpoch;
  const targetLocker = lockerId();
  const form = event.currentTarget;
  form.dataset.pending = 'true';
  form.setAttribute('aria-busy', 'true');
  try {
    const result = await protectedFetch(`/api/v1/lockers/${encodeURIComponent(targetLocker)}/notification-settings`, {
      method: 'PUT',
      timeoutMs: dataRequestTimeoutMs,
      body: JSON.stringify({
        email_enabled: $('email-enabled').checked,
        email_address: $('report-email').value.trim(),
        report_time: $('report-time').value,
        timezone: $('report-timezone').value.trim(),
        telegram_enabled: $('telegram-enabled').checked,
      }),
    });
    if (generation !== settingsRequestGeneration || requestEpoch !== sessionEpoch || targetLocker !== lockerId()) return;
    applySettings(result.setting || {});
    message('settings-message', 'Đã lưu cài đặt; scheduler sẽ chống gửi trùng theo ngày báo cáo.');
  } catch (error) {
    if (generation === settingsRequestGeneration && requestEpoch === sessionEpoch) {
      message('settings-message', `Không lưu được cài đặt: ${error.message}`);
    }
  } finally {
    if (generation === settingsRequestGeneration) {
      form.dataset.pending = 'false';
      form.setAttribute('aria-busy', 'false');
    }
  }
});

$('chat-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const requestEpoch = sessionEpoch;
  const targetLocker = lockerId();
  if (!hasRenderedContext()) {
    $('answer').textContent = 'Locker chưa có live state được xác nhận.';
    return;
  }
  const requestGeneration = ++chatRequestGeneration;
  form.dataset.pending = 'true';
  form.setAttribute('aria-busy', 'true');
  $('answer').textContent = 'Đang xử lý…';
  try { const result = await protectedFetch('/api/v1/chatbot', {
    method: 'POST', timeoutMs: chatbotRequestTimeoutMs,
    body: JSON.stringify({ locker_id: targetLocker, question: $('question').value }),
  });
    if (sessionEpoch === requestEpoch && chatRequestGeneration === requestGeneration
      && lockerId() === targetLocker && renderedLockerId === targetLocker) $('answer').textContent = result.answer;
  } catch (error) {
    if (sessionEpoch === requestEpoch && chatRequestGeneration === requestGeneration
      && lockerId() === targetLocker && renderedLockerId === targetLocker) {
      $('answer').textContent = `Không thể trả lời: ${error.message}`;
    }
  } finally {
    if (chatRequestGeneration === requestGeneration) {
      form.dataset.pending = 'false';
      form.setAttribute('aria-busy', 'false');
    }
  }
});

$('locker-id').addEventListener('input', () => {
  invalidateLockerContext();
});

$('locker-id').addEventListener('change', async () => {
  if (session) {
    await pollState();
    await loadSettings({ quiet: true });
  }
});

syncNotificationFields();
setAuthMode('login');
setAuthConfigReady(false);

(async function start() {
  const callback = consumeAuthFragment();
  if (callback?.session) {
    saveSession(callback.session);
    message('auth-message', 'Xác thực thành công.');
  } else if (callback?.error) {
    saveSession(null, { clearPrivate: true });
    message('auth-message', `Xác thực thất bại: ${callback.error}`);
  }
  let restoredHandled = Boolean(callback);
  let pollingStarted = false;
  const loadConfigAndStart = async () => {
    try {
      config = await jsonFetch('/api/v1/public-config');
      setAuthConfigReady(true);
      if (!restoredHandled) {
        restoredHandled = true;
        const restored = restoreStoredSession();
        if (restored?.expires_at * 1000 > Date.now()) saveSession(restored);
        else if (restored?.refresh_token) { saveSession(restored); await refresh(); }
        else saveSession(null);
      }
      await pollState();
      if (session) await loadSettings({ quiet: true });
      if (!pollingStarted) {
        pollingStarted = true;
        setInterval(pollState, 2000);
      }
      if ($('auth-message').textContent.startsWith('Dashboard chưa được cấu hình')) {
        message('auth-message', 'Dashboard đã kết nối lại và sẵn sàng xác thực.');
      }
    } catch (error) {
      config = null;
      setAuthConfigReady(false);
      message('auth-message', `Dashboard chưa được cấu hình: ${error.message}. Hệ thống sẽ tự thử lại sau 5 giây.`);
      setTimeout(loadConfigAndStart, configRetryMs);
    }
  };
  await loadConfigAndStart();
}());
