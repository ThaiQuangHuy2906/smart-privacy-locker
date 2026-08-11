'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { SupabaseAuthAdapter, AuthGate } = require('../lib/auth');
const { makeRuntime, prime, headers, LOCKER_A, LOCKER_B, USER_A } = require('./helpers');

test('P2-A03 canonical Bearer auth ignores spoofed user_id and denies missing/expired/wrong owner', async () => {
  const { runtime, publications } = makeRuntime(); await prime(runtime);
  for (const request of [
    { headers: {}, body: { locker_id: LOCKER_A, action: 'LOCK' }, status: 401 },
    { headers: headers('expired'), body: { locker_id: LOCKER_A, action: 'LOCK' }, status: 401 },
    { headers: headers(), body: { locker_id: LOCKER_B, action: 'LOCK' }, status: 403 },
  ]) assert.equal((await runtime.protectedCommand(request)).status, request.status);
  assert.equal(publications.length, 0);
  const accepted = await runtime.protectedCommand({ headers: headers(), body: {
    locker_id: LOCKER_A, action: 'LOCK', user_id: '20000000-0000-4000-8000-000000000099' } });
  assert.equal(accepted.ok, true);
  assert.equal(accepted.command.requested_by, USER_A);
});

test('P2-A04 valid dispatcher creates UUID/timestamp and non-retained command', async () => {
  const { runtime, publications } = makeRuntime(); await prime(runtime);
  const result = await runtime.protectedCommand({ headers: headers(), body: { locker_id: LOCKER_A, action: 'UNLOCK' } });
  assert.equal(result.status, 202);
  assert.match(result.command.command_id, /^[0-9a-f-]{36}$/);
  assert.equal(result.command.issued_at, '2026-08-08T08:00:00.000Z');
  assert.equal(publications[0].topic, `locker/${LOCKER_A}/command`);
  assert.equal(publications[0].options.retain, false);
});

test('dispatcher rejects MQTT/device/stale gates before publish', async () => {
  const { runtime, clock, publications } = makeRuntime();
  assert.equal((await runtime.protectedCommand({ headers: headers(), body: { locker_id: LOCKER_A, action: 'LOCK' } })).code, 'MQTT_DISCONNECTED');
  await prime(runtime); clock.value += 30_001;
  assert.equal((await runtime.protectedCommand({ headers: headers(), body: { locker_id: LOCKER_A, action: 'LOCK' } })).code, 'DEVICE_OFFLINE');
  assert.equal(publications.length, 0);
});

test('P2-A05 same-domain pending conflicts while a different domain remains allowed', async () => {
  const { runtime } = makeRuntime(); await prime(runtime);
  assert.equal((await runtime.protectedCommand({ headers: headers(), body: { locker_id: LOCKER_A, action: 'LOCK' } })).ok, true);
  assert.equal((await runtime.protectedCommand({ headers: headers(), body: { locker_id: LOCKER_A, action: 'UNLOCK' } })).code, 'PENDING_CONFLICT');
  assert.equal((await runtime.protectedCommand({ headers: headers(), body: { locker_id: LOCKER_A, action: 'LED_ON' } })).ok, true);
});

test('internal automation is allowlisted and is not an HTTP auth bypass', async () => {
  const { runtime } = makeRuntime(); await prime(runtime);
  assert.equal(runtime.dispatcher.dispatchInternal({ lockerId: LOCKER_A, action: 'LOCK' }).code, 'INTERNAL_ACTION_DENIED');
  assert.equal(runtime.dispatcher.dispatchInternal({ lockerId: LOCKER_A, action: 'ALARM_ON' }).ok, true);
});

test('Supabase ownership query uses locker_code plus verified owner identity', async () => {
  let requestedUrl;
  const adapter = new SupabaseAuthAdapter({ url: 'https://project.example.test', anonKey: 'anon_test_value',
    fetchImpl: async (url) => { requestedUrl = url; return { ok: true, async json() { return [{ id: '50000000-0000-4000-8000-000000000001' }]; } }; } });
  assert.equal(await adapter.owns('redacted-access-token', USER_A, LOCKER_A), true);
  const query = new URL(requestedUrl).searchParams;
  assert.equal(query.get('locker_code'), `eq.${LOCKER_A}`);
  assert.equal(query.get('owner_id'), `eq.${USER_A}`);
});

test('auth provider transport and 5xx failures remain fail-closed as 503', async () => {
  for (const fetchImpl of [
    async () => { throw new TypeError('fetch failed'); },
    async () => ({ ok: false, status: 503, async json() { return {}; } }),
  ]) {
    const gate = new AuthGate(new SupabaseAuthAdapter({
      url: 'https://project.example.test', anonKey: 'anon_test_value', fetchImpl,
    }));
    const result = await gate.authenticate(headers());
    assert.deepEqual(result, { ok: false, status: 503, code: 'AUTH_UNAVAILABLE' });
  }
});

test('auth provider timeout aborts a stalled request and remains fail-closed', async () => {
  let observedSignal;
  const adapter = new SupabaseAuthAdapter({
    url: 'https://project.example.test', anonKey: 'anon_test_value', timeoutMs: 5,
    fetchImpl: async (_url, options) => {
      observedSignal = options.signal;
      return new Promise((_resolve, reject) => {
        options.signal.addEventListener('abort', () => {
          const error = new Error('aborted');
          error.name = 'AbortError';
          reject(error);
        }, { once: true });
      });
    },
  });

  await assert.rejects(() => adapter.verify('redacted-access-token'),
    (error) => error.status === 503 && error.code === 'AUTH_PROVIDER_TIMEOUT');
  assert.equal(observedSignal.aborted, true);
});

test('auth provider timeout also bounds a stalled successful response body', async () => {
  const observedSignals = [];
  const adapter = new SupabaseAuthAdapter({
    url: 'https://project.example.test', anonKey: 'anon_test_value', timeoutMs: 5,
    fetchImpl: async (_url, options) => {
      observedSignals.push(options.signal);
      return { ok: true, status: 200, json: () => new Promise(() => {}) };
    },
  });

  await assert.rejects(() => adapter.verify('redacted-access-token'),
    (error) => error.status === 503 && error.code === 'AUTH_PROVIDER_TIMEOUT');
  await assert.rejects(() => adapter.claim('redacted-access-token', LOCKER_A),
    (error) => error.status === 503 && error.code === 'AUTH_PROVIDER_TIMEOUT');
  assert.equal(observedSignals.length, 2);
  assert.ok(observedSignals.every((signal) => signal.aborted));
});

test('authorization has one aggregate deadline across verification and ownership', async () => {
  let ownershipStarted = false;
  const adapter = {
    async verify(_token, { signal }) {
      assert.equal(signal.aborted, false);
      await new Promise((resolve) => setTimeout(resolve, 30));
      return { id: USER_A };
    },
    async owns(_token, _userId, _lockerId, { signal }) {
      ownershipStarted = true;
      return new Promise((resolve) => {
        const timer = setTimeout(() => resolve(true), 30);
        signal.addEventListener('abort', () => {
          clearTimeout(timer);
          resolve(false);
        }, { once: true });
      });
    },
  };
  const gate = new AuthGate(adapter, { authorizationTimeoutMs: 40 });

  assert.deepEqual(await gate.authorize(headers(), LOCKER_A),
    { ok: false, status: 503, code: 'AUTH_UNAVAILABLE' });
  assert.equal(ownershipStarted, true);
  assert.ok(new AuthGate(adapter).authorizationTimeoutMs < 15_000);
});

test('request aborted while authorization is pending cannot publish a command', async () => {
  const { runtime, publications } = makeRuntime();
  await prime(runtime);
  let releaseAuthorization;
  runtime.authGate = { authorize: () => new Promise((resolve) => { releaseAuthorization = resolve; }) };
  let aborted = false;

  const pending = runtime.protectedCommand({
    headers: headers(),
    body: { locker_id: LOCKER_A, action: 'UNLOCK' },
    isAborted: () => aborted,
  });
  aborted = true;
  releaseAuthorization({ ok: true, principal: { id: USER_A }, accessToken: 'redacted-access-token' });

  assert.deepEqual(await pending, { ok: false, status: 499, code: 'REQUEST_ABORTED' });
  assert.equal(publications.length, 0);
  assert.equal(runtime.dispatcher.pending.size, 0);
});

test('auth rejects invalid sessions as 401 but treats malformed provider success as 503', async () => {
  const invalidGate = new AuthGate(new SupabaseAuthAdapter({
    url: 'https://project.example.test', anonKey: 'anon_test_value',
    fetchImpl: async () => ({ ok: false, status: 401, async json() { return {}; } }),
  }));
  assert.deepEqual(await invalidGate.authenticate(headers()),
    { ok: false, status: 401, code: 'INVALID_SESSION' });

  const malformedGate = new AuthGate(new SupabaseAuthAdapter({
    url: 'https://project.example.test', anonKey: 'anon_test_value',
    fetchImpl: async () => ({ ok: true, status: 200, async json() { return {}; } }),
  }));
  assert.deepEqual(await malformedGate.authenticate(headers()),
    { ok: false, status: 503, code: 'AUTH_UNAVAILABLE' });
});

test('ownership rejects malformed success payload and claim normalizes one RPC row', async () => {
  const locker = { id: '50000000-0000-4000-8000-000000000001', locker_code: LOCKER_A,
    display_name: 'Locker A', owner_id: USER_A, claimed_at: '2026-08-08T08:00:00.000Z' };
  const adapter = new SupabaseAuthAdapter({
    url: 'https://project.example.test', anonKey: 'anon_test_value',
    fetchImpl: async (url) => url.includes('/rpc/claim_locker')
      ? { ok: true, status: 200, async json() { return [locker]; } }
      : { ok: true, status: 200, async json() { return {}; } },
  });
  await assert.rejects(() => adapter.owns('redacted-access-token', USER_A, LOCKER_A),
    (error) => error.status === 503 && error.code === 'AUTH_PROVIDER_INVALID_RESPONSE');
  assert.deepEqual(await adapter.claim('redacted-access-token', LOCKER_A), locker);
});

test('a session expiring during ownership lookup remains a 401 invalid session', async () => {
  let calls = 0;
  const gate = new AuthGate(new SupabaseAuthAdapter({
    url: 'https://project.example.test', anonKey: 'anon_test_value',
    fetchImpl: async () => {
      calls += 1;
      if (calls === 1) {
        return { ok: true, status: 200, async json() { return { id: USER_A }; } };
      }
      return { ok: false, status: 401, async json() { return {}; } };
    },
  }));

  assert.deepEqual(await gate.authorize(headers(), LOCKER_A),
    { ok: false, status: 401, code: 'INVALID_SESSION' });
});
