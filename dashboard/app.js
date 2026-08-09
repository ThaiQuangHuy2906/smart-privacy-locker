'use strict';

const storageKey = 'smart-locker-phase2-session';
const refreshRetryMs = 30_000;
const requestTimeoutMs = 15_000;
let config = null;
let session = null;
let sessionEpoch = 0;
let renderedLockerId = null;
let renderedSessionEpoch = -1;
let refreshTimer = null;
let pollInFlight = null;
let pollRequested = 0;
let chatRequestGeneration = 0;
let authRequestGeneration = 0;
let claimRequestGeneration = 0;

const $ = (id) => document.getElementById(id);
const lockerId = () => $('locker-id').value.trim();
const defaultQuestion = $('question').value;
function message(id, text) { $(id).textContent = text; }
function claimMessage(text = '', state = 'idle') {
  message('claim-message', text);
  $('claim-message').dataset.state = state;
}

function hasRenderedContext() {
  return Boolean(session) && renderedSessionEpoch === sessionEpoch
    && renderedLockerId === lockerId();
}

function clearSensitiveState(reason = 'Chưa có dữ liệu live đã xác nhận.', clearAnswer = false) {
  renderedLockerId = null;
  renderedSessionEpoch = -1;
  $('mqtt').textContent = 'DISCONNECTED';
  $('device').textContent = 'OFFLINE';
  $('door').textContent = 'UNKNOWN';
  $('lock').textContent = 'UNKNOWN — chưa xác nhận';
  $('updated').textContent = '—';
  $('alert').textContent = '—';
  message('state-message', reason);
  message('command-message', 'Success chỉ xuất hiện sau ACK hợp lệ.');
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
    ['auth-form', 'claim-form', 'chat-form'].forEach((id) => {
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
  renderControls(null);
}

async function jsonFetch(url, options = {}) {
  const controller = new AbortController();
  const callerSignal = options.signal;
  let timedOut = false;
  const forwardAbort = () => controller.abort(callerSignal.reason);
  if (callerSignal?.aborted) forwardAbort();
  else callerSignal?.addEventListener('abort', forwardAbort, { once: true });
  const requestTimer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, requestTimeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
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
  if (!value) clearSensitiveState(undefined, shouldClearPrivate);
  scheduleRefresh();
  renderControls(null);
}

function scheduleRefresh() {
  clearTimeout(refreshTimer);
  if (!session?.expires_at) return;
  const wait = Math.max(1000, session.expires_at * 1000 - Date.now() - 60_000);
  refreshTimer = setTimeout(refresh, wait);
}

async function refresh() {
  const refreshSession = session;
  const refreshEpoch = sessionEpoch;
  if (!refreshSession?.refresh_token) return saveSession(null);
  try {
    const next = await supabase('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: JSON.stringify({ refresh_token: refreshSession.refresh_token }) });
    if (sessionEpoch !== refreshEpoch) return;
    saveSession(next); await pollState();
  } catch (error) {
    if (sessionEpoch !== refreshEpoch) return;
    if ([400, 401, 403].includes(error.status)) {
      saveSession(null); message('auth-message', 'Phiên đã hết hạn. Vui lòng đăng nhập lại.');
      return;
    }
    message('auth-message', 'Dịch vụ xác thực tạm thời không khả dụng; phiên cục bộ được giữ và sẽ thử lại.');
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(refresh, refreshRetryMs);
  }
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
    const pending = Boolean(ui?.controls?.[domain]?.pending);
    button.disabled = !hasRenderedContext() || !ui?.controls?.[domain]?.enabled || pending;
    button.dataset.pending = pending ? 'true' : 'false';
    button.setAttribute('aria-busy', pending ? 'true' : 'false');
  });
}

function renderState(ui, targetLocker) {
  if (!session || targetLocker !== lockerId()) return;
  renderedLockerId = targetLocker;
  renderedSessionEpoch = sessionEpoch;
  $('mqtt').textContent = ui.mqtt; $('device').textContent = ui.device; $('door').textContent = ui.door;
  $('lock').textContent = ui.lock_unconfirmed ? 'UNKNOWN — chưa xác nhận' : ui.lock;
  $('updated').textContent = ui.last_updated || '—';
  $('alert').textContent = ui.latest_alert
    ? `${ui.latest_alert.event_type} @ ${ui.latest_alert.occurred_at} — Telegram: ${ui.latest_alert.notification_status || 'pending'}`
    : '—';
  message('state-message', ui.stale ? 'Dữ liệu stale/untrusted; controls bị khóa.' : 'Dữ liệu live đã được xác nhận.');
  if (ui.command_status) {
    const value = ui.command_status;
    message('command-message', `${value.action}: ${value.status} (${value.command_id.slice(0, 8)})`);
  }
  renderControls(ui);
}

function pollState() {
  pollRequested += 1;
  if (pollInFlight) return pollInFlight;
  pollInFlight = (async () => {
    let currentRequest;
    do {
      currentRequest = pollRequested;
      if (!session) break;
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
  const mode = event.submitter?.dataset.mode || 'login';
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
    if (result.access_token) { saveSession(result); message('auth-message', 'Xác thực thành công.'); await pollState(); }
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
  if (!hasRenderedContext()) {
    invalidateLockerContext('Locker chưa có live state được xác nhận; command bị khóa.');
    return;
  }
  button.disabled = true;
  button.dataset.pending = 'true';
  button.setAttribute('aria-busy', 'true');
  message('command-message', `${button.dataset.action}: PENDING — chờ ACK.`);
  try {
    const result = await protectedFetch('/api/v1/commands', { method: 'POST', body: JSON.stringify({ locker_id: targetLocker, action: button.dataset.action }) });
    if (sessionEpoch !== requestEpoch || lockerId() !== targetLocker
      || renderedLockerId !== targetLocker) return;
    message('command-message', `${button.dataset.action}: PENDING ${result.command.command_id.slice(0, 8)}. Không coi publish là success.`);
    await pollState();
  } catch (error) {
    if (sessionEpoch !== requestEpoch || lockerId() !== targetLocker
      || renderedLockerId !== targetLocker) return;
    if (error.code === 'REQUEST_TIMEOUT') {
      message('command-message', `${button.dataset.action}: KẾT QUẢ CHƯA XÁC ĐỊNH — đang đối soát; không gửi lại ngay.`);
    } else {
      message('command-message', `Command bị từ chối: ${error.message}`);
    }
    await pollState();
  }
}));

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
  try { const result = await protectedFetch('/api/v1/chatbot', { method: 'POST', body: JSON.stringify({ locker_id: targetLocker, question: $('question').value }) });
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
  if (renderedLockerId !== null && renderedLockerId !== lockerId()) invalidateLockerContext();
});

$('locker-id').addEventListener('change', () => {
  if (session) pollState();
});

(async function start() {
  const callback = consumeAuthFragment();
  if (callback?.session) {
    saveSession(callback.session);
    message('auth-message', 'Xác thực thành công.');
  } else if (callback?.error) {
    saveSession(null, { clearPrivate: true });
    message('auth-message', `Xác thực thất bại: ${callback.error}`);
  }
  try {
    config = await jsonFetch('/api/v1/public-config');
    if (!callback) {
      const restored = restoreStoredSession();
      if (restored?.expires_at * 1000 > Date.now()) saveSession(restored);
      else if (restored?.refresh_token) { saveSession(restored); await refresh(); }
      else saveSession(null);
    }
    await pollState(); setInterval(pollState, 2000);
  } catch (error) { message('auth-message', `Dashboard chưa được cấu hình: ${error.message}`); }
}());
