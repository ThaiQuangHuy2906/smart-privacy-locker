'use strict';

const storageKey = 'smart-locker-phase2-session';
let config = null;
let session = null;
let refreshTimer = null;

const $ = (id) => document.getElementById(id);
const lockerId = () => $('locker-id').value.trim();
function message(id, text) { $(id).textContent = text; }

async function jsonFetch(url, options = {}) {
  const response = await fetch(url, options);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(body.msg || body.message || body.code || `HTTP ${response.status}`), { status: response.status, body });
  return body;
}

async function supabase(path, options = {}) {
  return jsonFetch(`${config.supabase_url}${path}`, { ...options, headers: {
    apikey: config.supabase_anon_key, 'Content-Type': 'application/json', ...(options.headers || {}),
  } });
}

function saveSession(value) {
  session = value;
  if (value) sessionStorage.setItem(storageKey, JSON.stringify(value)); else sessionStorage.removeItem(storageKey);
  $('logout').hidden = !value;
  $('session-label').textContent = value ? 'Đã đăng nhập — token được vận chuyển bằng Bearer' : 'Chưa đăng nhập';
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
  if (!session?.refresh_token) return saveSession(null);
  try {
    const next = await supabase('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: JSON.stringify({ refresh_token: session.refresh_token }) });
    saveSession(next); await pollState();
  } catch { saveSession(null); message('auth-message', 'Phiên đã hết hạn. Vui lòng đăng nhập lại.'); }
}

async function protectedFetch(path, options = {}) {
  if (!session?.access_token) throw new Error('AUTH_REQUIRED');
  try {
    return await jsonFetch(path, { ...options, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}`, ...(options.headers || {}) } });
  } catch (error) {
    if (error.status === 401) { saveSession(null); message('auth-message', 'Phiên không còn hợp lệ.'); }
    throw error;
  }
}

function renderControls(ui) {
  document.querySelectorAll('[data-action]').forEach((button) => {
    const domain = button.dataset.domain;
    button.disabled = !session || !ui?.controls?.[domain]?.enabled;
    button.dataset.pending = ui?.controls?.[domain]?.pending ? 'true' : 'false';
  });
}

function renderState(ui) {
  $('mqtt').textContent = ui.mqtt; $('device').textContent = ui.device; $('door').textContent = ui.door;
  $('lock').textContent = ui.lock_unconfirmed ? 'UNKNOWN — chưa xác nhận' : ui.lock;
  $('updated').textContent = ui.last_updated || '—';
  $('alert').textContent = ui.latest_alert ? `${ui.latest_alert.event_type} @ ${ui.latest_alert.occurred_at}` : '—';
  message('state-message', ui.stale ? 'Dữ liệu stale/untrusted; controls bị khóa.' : 'Dữ liệu live đã được xác nhận.');
  if (ui.command_status) {
    const value = ui.command_status;
    message('command-message', `${value.action}: ${value.status} (${value.command_id.slice(0, 8)})`);
  }
  renderControls(ui);
}

async function pollState() {
  if (!session) return;
  try { renderState(await protectedFetch(`/api/v1/lockers/${encodeURIComponent(lockerId())}/state`)); }
  catch (error) { message('state-message', `Không lấy được live state: ${error.message}`); renderControls(null); }
}

$('auth-form').addEventListener('click', async (event) => {
  const mode = event.target.dataset.mode; if (!mode) return; event.preventDefault();
  const email = $('email').value; const password = $('password').value;
  try {
    const path = mode === 'register' ? '/auth/v1/signup' : '/auth/v1/token?grant_type=password';
    const result = await supabase(path, { method: 'POST', body: JSON.stringify({ email, password }) });
    if (result.access_token) { saveSession(result); message('auth-message', 'Xác thực thành công.'); await pollState(); }
    else message('auth-message', 'Đăng ký thành công; kiểm tra email nếu project yêu cầu xác nhận.');
  } catch (error) { message('auth-message', `Xác thực thất bại: ${error.message}`); }
});

$('logout').addEventListener('click', async () => {
  try { if (session) await supabase('/auth/v1/logout', { method: 'POST', headers: { Authorization: `Bearer ${session.access_token}` } }); }
  finally { saveSession(null); message('auth-message', 'Đã đăng xuất.'); }
});

$('claim-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  try { const result = await protectedFetch('/api/v1/lockers/claim', { method: 'POST', body: JSON.stringify({ locker_code: $('locker-code').value.trim() }) });
    message('state-message', `Claim thành công: ${result.locker?.locker_code || $('locker-code').value}`); await pollState();
  } catch (error) { message('state-message', `Claim bị từ chối: ${error.message}`); }
});

document.querySelectorAll('[data-action]').forEach((button) => button.addEventListener('click', async () => {
  button.disabled = true; message('command-message', `${button.dataset.action}: PENDING — chờ ACK.`);
  try {
    const result = await protectedFetch('/api/v1/commands', { method: 'POST', body: JSON.stringify({ locker_id: lockerId(), action: button.dataset.action }) });
    message('command-message', `${button.dataset.action}: PENDING ${result.command.command_id.slice(0, 8)}. Không coi publish là success.`);
    await pollState();
  } catch (error) { message('command-message', `Command bị từ chối: ${error.message}`); await pollState(); }
}));

$('chat-form').addEventListener('submit', async (event) => {
  event.preventDefault(); $('answer').textContent = 'Đang xử lý…';
  try { const result = await protectedFetch('/api/v1/chatbot', { method: 'POST', body: JSON.stringify({ locker_id: lockerId(), question: $('question').value }) });
    $('answer').textContent = result.answer; } catch (error) { $('answer').textContent = `Không thể trả lời: ${error.message}`; }
});

(async function start() {
  try {
    config = await jsonFetch('/api/v1/public-config');
    const restored = JSON.parse(sessionStorage.getItem(storageKey) || 'null');
    if (restored?.expires_at * 1000 > Date.now()) saveSession(restored);
    else if (restored?.refresh_token) { session = restored; await refresh(); }
    else saveSession(null);
    await pollState(); setInterval(pollState, 2000);
  } catch (error) { message('auth-message', `Dashboard chưa được cấu hình: ${error.message}`); }
}());
