'use strict';

const { createHash } = require('node:crypto');

const DEFAULT_AUTHORIZATION_TIMEOUT_MS = 9000;

function bearer(headers = {}) {
  const raw = headers.authorization || headers.Authorization;
  const match = typeof raw === 'string' && raw.match(/^Bearer ([^\s]+)$/);
  return match ? match[1] : null;
}

function authFailure(status, code, message) {
  return Object.assign(new Error(message), { status, code });
}

class SupabaseAuthAdapter {
  constructor({ url, anonKey, fetchImpl = globalThis.fetch, timeoutMs = 5000 }) {
    this.url = String(url || '').replace(/\/$/, '');
    this.anonKey = anonKey;
    this.fetch = fetchImpl;
    this.timeoutMs = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 5000;
  }

  configured() { return Boolean(this.url && this.anonKey && this.fetch); }

  async request(path, options, handleResponse) {
    const controller = new AbortController();
    const callerSignal = options.signal;
    const forwardAbort = () => controller.abort(callerSignal.reason);
    if (callerSignal?.aborted) forwardAbort();
    else callerSignal?.addEventListener('abort', forwardAbort, { once: true });
    let timer;
    const deadline = new Promise((_resolve, reject) => {
      const timeout = () => {
        controller.abort();
        reject(authFailure(503, 'AUTH_PROVIDER_TIMEOUT', 'Auth provider request timed out'));
      };
      if (controller.signal.aborted) timeout();
      else timer = setTimeout(timeout, this.timeoutMs);
    });
    const operation = (async () => {
      const response = await this.fetch(`${this.url}${path}`, { ...options, signal: controller.signal });
      if (!response || typeof response.ok !== 'boolean') {
        throw authFailure(503, 'AUTH_PROVIDER_INVALID_RESPONSE', 'Auth provider returned an invalid response');
      }
      return handleResponse(response);
    })();
    try {
      return await Promise.race([operation, deadline]);
    } catch (error) {
      if (error?.code === 'AUTH_PROVIDER_TIMEOUT' || controller.signal.aborted) {
        throw authFailure(503, 'AUTH_PROVIDER_TIMEOUT', 'Auth provider request timed out');
      }
      if (error?.status) throw error;
      throw authFailure(503, 'AUTH_PROVIDER_UNAVAILABLE', 'Auth provider is unavailable');
    } finally {
      clearTimeout(timer);
      callerSignal?.removeEventListener('abort', forwardAbort);
    }
  }

  async json(response) {
    try {
      return await response.json();
    } catch {
      throw authFailure(503, 'AUTH_PROVIDER_INVALID_RESPONSE', 'Auth provider returned invalid JSON');
    }
  }

  async verify(accessToken, { signal } = {}) {
    if (!this.configured()) throw Object.assign(new Error('Auth service is not configured'), { status: 503 });
    return this.request('/auth/v1/user', {
      headers: { apikey: this.anonKey, Authorization: `Bearer ${accessToken}` },
      signal,
    }, async (response) => {
      if ([401, 403].includes(response.status)) {
        throw authFailure(401, 'INVALID_SESSION', 'Invalid or expired session');
      }
      if (!response.ok) throw authFailure(503, 'AUTH_PROVIDER_UNAVAILABLE', 'Auth provider is unavailable');
      const user = await this.json(response);
      if (!user || typeof user.id !== 'string') {
        throw authFailure(503, 'AUTH_PROVIDER_INVALID_RESPONSE', 'Auth provider returned an invalid user');
      }
      return { id: user.id };
    });
  }

  async owns(accessToken, userId, lockerId, { signal } = {}) {
    const query = new URLSearchParams({ select: 'id', locker_code: `eq.${lockerId}`, owner_id: `eq.${userId}`, limit: '1' });
    return this.request(`/rest/v1/lockers?${query}`, {
      headers: { apikey: this.anonKey, Authorization: `Bearer ${accessToken}` },
      signal,
    }, async (response) => {
      if (response.status === 401) {
        throw authFailure(401, 'INVALID_SESSION', 'Invalid or expired session');
      }
      if (!response.ok) throw authFailure(503, 'OWNERSHIP_UNAVAILABLE', 'Ownership lookup failed');
      const rows = await this.json(response);
      if (!Array.isArray(rows)) {
        throw authFailure(503, 'AUTH_PROVIDER_INVALID_RESPONSE', 'Ownership provider returned invalid rows');
      }
      return rows.length === 1;
    });
  }

  async claim(accessToken, lockerCode) {
    return this.request('/rest/v1/rpc/claim_locker', {
      method: 'POST',
      headers: { apikey: this.anonKey, Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ requested_code: lockerCode }),
    }, async (response) => {
      if (response.status === 401) throw authFailure(401, 'INVALID_SESSION', 'Invalid or expired session');
      if (response.status >= 500) throw authFailure(503, 'CLAIM_UNAVAILABLE', 'Locker claim provider is unavailable');
      if (!response.ok) throw authFailure(409, 'CLAIM_REJECTED', 'Locker is invalid or already claimed');
      const rows = await this.json(response);
      if (!Array.isArray(rows) || rows.length !== 1 || typeof rows[0]?.locker_code !== 'string') {
        throw authFailure(503, 'AUTH_PROVIDER_INVALID_RESPONSE', 'Locker claim provider returned invalid rows');
      }
      return rows[0];
    });
  }
}

class AuthGate {
  constructor(adapter, { authorizationTimeoutMs = DEFAULT_AUTHORIZATION_TIMEOUT_MS,
    cacheTtlMs = 15_000, cacheLimit = 64, now = Date.now } = {}) {
    this.adapter = adapter;
    this.authorizationTimeoutMs = Number.isFinite(authorizationTimeoutMs) && authorizationTimeoutMs > 0
      ? authorizationTimeoutMs : DEFAULT_AUTHORIZATION_TIMEOUT_MS;
    this.cacheTtlMs = Number.isFinite(cacheTtlMs) && cacheTtlMs > 0 ? cacheTtlMs : 15_000;
    this.cacheLimit = Number.isInteger(cacheLimit) && cacheLimit > 0 ? cacheLimit : 64;
    this.now = now;
    this.authenticationCache = new Map();
    this.ownershipCache = new Map();
  }

  cacheKey(accessToken) {
    return createHash('sha256').update(accessToken).digest('hex');
  }

  cached(cache, key) {
    const item = cache.get(key);
    if (!item) return null;
    if (item.expiresAt <= this.now()) {
      cache.delete(key);
      return null;
    }
    cache.delete(key);
    cache.set(key, item);
    return item.value;
  }

  remember(cache, key, value) {
    cache.delete(key);
    cache.set(key, { value, expiresAt: this.now() + this.cacheTtlMs });
    while (cache.size > this.cacheLimit) cache.delete(cache.keys().next().value);
  }

  clearCache() {
    this.authenticationCache.clear();
    this.ownershipCache.clear();
  }

  async authenticate(headers, { signal, forceFresh = false } = {}) {
    const accessToken = bearer(headers);
    if (!accessToken) return { ok: false, status: 401, code: 'AUTH_REQUIRED' };
    const tokenKey = this.cacheKey(accessToken);
    if (!forceFresh) {
      const principal = this.cached(this.authenticationCache, tokenKey);
      if (principal) return { ok: true, principal, accessToken };
    }
    try {
      const principal = await this.adapter.verify(accessToken, { signal });
      this.remember(this.authenticationCache, tokenKey, principal);
      return { ok: true, principal, accessToken };
    } catch (error) {
      const status = error.status === 401 ? 401 : 503;
      return { ok: false, status, code: status === 401 ? 'INVALID_SESSION' : 'AUTH_UNAVAILABLE' };
    }
  }

  async authorize(headers, lockerId, { forceFresh = false } = {}) {
    const controller = new AbortController();
    let timer;
    const deadline = new Promise((resolve) => {
      timer = setTimeout(() => {
        controller.abort();
        resolve({ ok: false, status: 503, code: 'AUTH_UNAVAILABLE' });
      }, this.authorizationTimeoutMs);
    });
    const authorization = (async () => {
      const authentication = await this.authenticate(headers, {
        signal: controller.signal, forceFresh,
      });
      if (!authentication.ok) return authentication;
      const ownershipKey = `${this.cacheKey(authentication.accessToken)}:${lockerId}`;
      if (!forceFresh && this.cached(this.ownershipCache, ownershipKey) === true) {
        return authentication;
      }
      try {
        const owns = await this.adapter.owns(authentication.accessToken, authentication.principal.id,
          lockerId, { signal: controller.signal });
        if (owns) this.remember(this.ownershipCache, ownershipKey, true);
        return owns ? authentication : { ok: false, status: 403, code: 'LOCKER_FORBIDDEN' };
      } catch (error) {
        if (error?.status === 401) {
          return { ok: false, status: 401, code: 'INVALID_SESSION' };
        }
        return { ok: false, status: 503, code: 'OWNERSHIP_UNAVAILABLE' };
      }
    })();
    try {
      return await Promise.race([authorization, deadline]);
    } finally {
      clearTimeout(timer);
    }
  }
}

module.exports = { bearer, SupabaseAuthAdapter, AuthGate };
