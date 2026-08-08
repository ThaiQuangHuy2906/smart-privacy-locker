'use strict';

const { randomUUID } = require('node:crypto');
const { expectedState } = require('./contracts');

const USER_ACTIONS = new Set(['LOCK', 'UNLOCK', 'ALARM_ON', 'ALARM_OFF', 'LED_ON', 'LED_OFF', 'GET_STATE']);
const INTERNAL_ACTIONS = new Set(['ALARM_ON', 'GET_STATE']);

function domain(action) {
  if (['LOCK', 'UNLOCK'].includes(action)) return 'lock';
  if (['ALARM_ON', 'ALARM_OFF'].includes(action)) return 'alarm';
  if (['LED_ON', 'LED_OFF'].includes(action)) return 'led';
  return 'system';
}

class CommandDispatcher {
  constructor({ cache, publish, timeoutMs = 5000, now = Date.now, uuid = randomUUID,
    completedLimit = 64, onResult = () => {} }) {
    this.cache = cache;
    this.publish = publish;
    this.timeoutMs = timeoutMs;
    this.now = now;
    this.uuid = uuid;
    this.completedLimit = completedLimit;
    this.onResult = onResult;
    this.restart();
  }

  restart() { this.pending = new Map(); this.completed = new Map(); }

  dispatchUser({ principal, lockerId, action }) {
    if (!principal?.id) return { ok: false, status: 401, code: 'AUTH_REQUIRED' };
    if (!USER_ACTIONS.has(action)) return { ok: false, status: 400, code: 'ACTION_NOT_ALLOWED' };
    return this.dispatch({ lockerId, action, requestedBy: principal.id, caller: 'authenticated_user' });
  }

  dispatchInternal({ lockerId, action, service = 'system:unauthorized-detector' }) {
    if (service !== 'system:unauthorized-detector' || !INTERNAL_ACTIONS.has(action)) {
      return { ok: false, status: 403, code: 'INTERNAL_ACTION_DENIED' };
    }
    return this.dispatch({ lockerId, action, requestedBy: service, caller: 'trusted_internal_automation' });
  }

  dispatch({ lockerId, action, requestedBy, caller }) {
    const snapshot = this.cache.snapshot(lockerId, this.now());
    if (!snapshot.mqtt_connected) return { ok: false, status: 503, code: 'MQTT_DISCONNECTED' };
    if (snapshot.availability !== 'ONLINE') return { ok: false, status: 503, code: 'DEVICE_OFFLINE' };
    if (!snapshot.fresh) return { ok: false, status: 409, code: 'STATE_UNTRUSTED' };
    const actuatorDomain = domain(action);
    if ([...this.pending.values()].some((item) => item.lockerId === lockerId && item.domain === actuatorDomain)) {
      return { ok: false, status: 409, code: 'PENDING_CONFLICT' };
    }
    const commandId = this.uuid();
    const issuedAt = new Date(this.now()).toISOString();
    const command = { schema_version: 1, command_id: commandId, locker_id: lockerId,
      action, issued_at: issuedAt, requested_by: requestedBy };
    const pending = { commandId, lockerId, action, domain: actuatorDomain, requestedBy,
      caller, issuedAt, deadline: this.now() + this.timeoutMs };
    this.pending.set(commandId, pending);
    try {
      this.publish(`locker/${lockerId}/command`, command, { retain: false });
    } catch {
      this.pending.delete(commandId);
      return { ok: false, status: 503, code: 'MQTT_PUBLISH_FAILED' };
    }
    return { ok: true, status: 202, command, pending };
  }

  processAck(ack) {
    const pending = this.pending.get(ack.command_id);
    if (!pending) {
      return { ok: false, code: this.completed.has(ack.command_id) ? 'DUPLICATE_OR_LATE_ACK' : 'UNKNOWN_ACK' };
    }
    if (ack.locker_id !== pending.lockerId || ack.action !== pending.action
      || (ack.result === 'success' && !expectedState(pending.action, ack.device_state))) {
      return { ok: false, code: 'ACK_CORRELATION_MISMATCH' };
    }
    this.pending.delete(ack.command_id);
    this.remember(ack.command_id, { ...pending, result: ack.result });
    const result = { ok: ack.result === 'success', code: ack.result === 'success' ? 'COMMAND_SUCCEEDED' : 'COMMAND_FAILED', pending, ack };
    this.onResult(result);
    return result;
  }

  expire() {
    const results = [];
    const current = this.now();
    for (const [id, pending] of this.pending) {
      if (current < pending.deadline) continue;
      this.pending.delete(id);
      this.remember(id, { ...pending, result: 'timeout' });
      let reconciliation = null;
      const snapshot = this.cache.snapshot(pending.lockerId, current);
      // GET_STATE is itself a command. If it times out, stop: reconciling a
      // reconciliation command would otherwise create an unbounded loop.
      if (pending.action !== 'GET_STATE' && snapshot.mqtt_connected
          && snapshot.availability === 'ONLINE' && snapshot.fresh) {
        reconciliation = this.dispatchInternal({ lockerId: pending.lockerId, action: 'GET_STATE' });
      }
      const result = { ok: false, code: 'COMMAND_TIMEOUT', pending, reconciliation };
      this.onResult(result);
      results.push(result);
    }
    return results;
  }

  remember(id, value) {
    this.completed.set(id, value);
    while (this.completed.size > this.completedLimit) this.completed.delete(this.completed.keys().next().value);
  }
}

module.exports = { CommandDispatcher, domain, USER_ACTIONS, INTERNAL_ACTIONS };
