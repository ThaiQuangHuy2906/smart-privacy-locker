'use strict';

const { randomUUID } = require('node:crypto');

class DeviceSimulator {
  constructor({ lockerId = 'LOCKER-001', publish,
    now = () => Date.parse('2026-08-08T08:00:00.000Z'), authorizationWindowMs = 30_000 }) {
    this.lockerId = lockerId; this.publish = publish; this.now = now;
    this.authorizationWindowMs = authorizationWindowMs;
    this.state = { door: 'CLOSED', lock: 'UNKNOWN', alarm: 'INACTIVE', led: 'OFF' };
    this.completed = new Map(); this.online = false;
    this.openGrantAvailable = false; this.openGrantStartedAt = 0;
    this.autoLockOnClose = false;
  }

  topic(suffix) { return `locker/${this.lockerId}/${suffix}`; }
  timestamp() { return new Date(this.now()).toISOString(); }

  connect() {
    this.online = true;
    this.publish(this.topic('availability'), { schema_version: 1, locker_id: this.lockerId,
      status: 'ONLINE', sent_at: this.timestamp() }, { retain: true });
    this.publishState();
  }

  disconnect() {
    this.online = false;
    this.publish(this.topic('availability'), { schema_version: 1, locker_id: this.lockerId,
      status: 'OFFLINE', sent_at: this.timestamp() }, { retain: true });
  }

  publishState(overrides = {}) {
    this.publish(this.topic('state'), { schema_version: 1, locker_id: this.lockerId,
      ...this.state, wifi_connected: true, mqtt_connected: this.online,
      timestamp: this.timestamp(), ...overrides }, { retain: true });
  }

  heartbeat() {
    if (!this.online) return false;
    this.publish(this.topic('heartbeat'), { schema_version: 1, locker_id: this.lockerId,
      sent_at: this.timestamp() }, { retain: false });
    this.publishState();
    return true;
  }

  door(state, overrides = {}) {
    const previous = this.state.door;
    if (state === previous) return;
    this.state.door = state;
    let authorized = null;
    if (previous === 'CLOSED' && state === 'OPEN') {
      authorized = this.openGrantAvailable && this.state.lock === 'UNLOCKED'
        && this.now() - this.openGrantStartedAt < this.authorizationWindowMs;
      this.openGrantAvailable = false;
      this.autoLockOnClose = true;
      if (!authorized) this.state.alarm = 'ACTIVE';
    } else if (previous === 'OPEN' && state === 'CLOSED' && this.autoLockOnClose) {
      this.state.lock = 'LOCKED';
      this.openGrantAvailable = false;
      this.autoLockOnClose = false;
    }
    this.publish(this.topic('telemetry/door'), { schema_version: 1, locker_id: this.lockerId,
      event_id: randomUUID(), previous_state: previous, state,
      timestamp: this.timestamp(), time_synced: true, authorized,
      ...overrides }, { retain: false });
    this.publishState();
  }

  receiveCommand(command, mode = 'success') {
    if (mode === 'no_ack') return [];
    if (mode === 'malformed') {
      this.publish(this.topic('ack'), '{not-json', { retain: false });
      return [];
    }
    if (this.completed.has(command.command_id)) {
      const duplicate = { ...this.completed.get(command.command_id), duplicate: true };
      this.publish(this.topic('ack'), duplicate, { retain: false });
      return [duplicate];
    }
    if (command.action === 'LOCK') this.openGrantAvailable = false;
    if (mode === 'error') return this.ack(command, 'error', { code: 'ACTUATION_FAILED', message: 'Simulated error' });
    if (command.action === 'LOCK' && this.state.door !== 'CLOSED') {
      return this.ack(command, 'error', { code: 'DOOR_NOT_CLOSED', message: 'Door must be closed' });
    }
    if (command.action === 'UNLOCK' && this.state.door !== 'CLOSED') {
      this.openGrantAvailable = false;
      return this.ack(command, 'error', {
        code: 'DOOR_NOT_CLOSED_FOR_ACCESS',
        message: 'Door must be closed before granting another opening',
      });
    }
    if (command.action === 'LOCK' || command.action === 'UNLOCK') this.autoLockOnClose = false;
    const next = { ...this.state };
    if (command.action === 'LOCK') next.lock = 'LOCKED';
    if (command.action === 'UNLOCK') next.lock = 'UNLOCKED';
    if (command.action === 'ALARM_ON') next.alarm = 'ACTIVE';
    if (command.action === 'ALARM_OFF') next.alarm = 'INACTIVE';
    if (command.action === 'LED_ON') next.led = 'ON';
    if (command.action === 'LED_OFF') next.led = 'OFF';
    this.state = next;
    if (command.action === 'UNLOCK') {
      this.openGrantAvailable = this.state.door === 'CLOSED';
      this.openGrantStartedAt = this.now();
    }
    const overrides = {};
    if (mode === 'wrong_id') overrides.command_id = randomUUID();
    if (mode === 'wrong_locker') overrides.locker_id = 'LOCKER-OTHER';
    if (mode === 'wrong_action') overrides.action = command.action === 'LOCK' ? 'UNLOCK' : 'LOCK';
    if (mode === 'wrong_state') overrides.device_state = { ...next, lock: command.action === 'LOCK' ? 'UNLOCKED' : next.lock };
    const result = this.ack(command, 'success', null, overrides);
    if (command.action === 'GET_STATE') this.publishState();
    else this.publishState();
    return result;
  }

  tick() {
    if (!this.openGrantAvailable
        || this.now() - this.openGrantStartedAt < this.authorizationWindowMs) return false;
    this.openGrantAvailable = false;
    if (this.state.door !== 'CLOSED') return false;
    this.autoLockOnClose = false;
    this.state.lock = 'LOCKED';
    this.publishState();
    return true;
  }

  delayedCommand(command, delayMs, schedule) { schedule(delayMs, () => this.receiveCommand(command)); }

  ack(command, result, error, overrides = {}) {
    const ack = { schema_version: 1, command_id: command.command_id, locker_id: this.lockerId,
      action: command.action, result, device_state: { ...this.state }, error,
      duplicate: false, timestamp: this.timestamp(), ...overrides };
    if (overrides.device_state) ack.device_state = overrides.device_state;
    if (ack.command_id === command.command_id && ack.locker_id === this.lockerId && ack.action === command.action) {
      this.completed.set(command.command_id, ack);
    }
    this.publish(this.topic('ack'), ack, { retain: false });
    return [ack];
  }
}

module.exports = { DeviceSimulator };
