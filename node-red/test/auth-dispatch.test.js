'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { SupabaseAuthAdapter } = require('../lib/auth');
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
