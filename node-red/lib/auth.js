'use strict';

function bearer(headers = {}) {
  const raw = headers.authorization || headers.Authorization;
  const match = typeof raw === 'string' && raw.match(/^Bearer ([^\s]+)$/);
  return match ? match[1] : null;
}

class SupabaseAuthAdapter {
  constructor({ url, anonKey, fetchImpl = globalThis.fetch }) {
    this.url = String(url || '').replace(/\/$/, '');
    this.anonKey = anonKey;
    this.fetch = fetchImpl;
  }

  configured() { return Boolean(this.url && this.anonKey && this.fetch); }

  async verify(accessToken) {
    if (!this.configured()) throw Object.assign(new Error('Auth service is not configured'), { status: 503 });
    const response = await this.fetch(`${this.url}/auth/v1/user`, {
      headers: { apikey: this.anonKey, Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) throw Object.assign(new Error('Invalid or expired session'), { status: 401 });
    const user = await response.json();
    if (!user || typeof user.id !== 'string') throw Object.assign(new Error('Invalid auth response'), { status: 401 });
    return { id: user.id };
  }

  async owns(accessToken, userId, lockerId) {
    const query = new URLSearchParams({ select: 'id', locker_code: `eq.${lockerId}`, owner_id: `eq.${userId}`, limit: '1' });
    const response = await this.fetch(`${this.url}/rest/v1/lockers?${query}`, {
      headers: { apikey: this.anonKey, Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) throw Object.assign(new Error('Ownership lookup failed'), { status: 503 });
    const rows = await response.json();
    return Array.isArray(rows) && rows.length === 1;
  }

  async claim(accessToken, lockerCode) {
    const response = await this.fetch(`${this.url}/rest/v1/rpc/claim_locker`, {
      method: 'POST',
      headers: { apikey: this.anonKey, Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ requested_code: lockerCode }),
    });
    if (!response.ok) throw Object.assign(new Error('Locker is invalid or already claimed'), { status: response.status === 401 ? 401 : 409 });
    return response.json();
  }
}

class AuthGate {
  constructor(adapter) { this.adapter = adapter; }

  async authenticate(headers) {
    const accessToken = bearer(headers);
    if (!accessToken) return { ok: false, status: 401, code: 'AUTH_REQUIRED' };
    try {
      const principal = await this.adapter.verify(accessToken);
      return { ok: true, principal, accessToken };
    } catch (error) {
      return { ok: false, status: error.status || 401, code: error.status === 503 ? 'AUTH_UNAVAILABLE' : 'INVALID_SESSION' };
    }
  }

  async authorize(headers, lockerId) {
    const authentication = await this.authenticate(headers);
    if (!authentication.ok) return authentication;
    try {
      const owns = await this.adapter.owns(authentication.accessToken, authentication.principal.id, lockerId);
      return owns ? authentication : { ok: false, status: 403, code: 'LOCKER_FORBIDDEN' };
    } catch {
      return { ok: false, status: 503, code: 'OWNERSHIP_UNAVAILABLE' };
    }
  }
}

module.exports = { bearer, SupabaseAuthAdapter, AuthGate };
