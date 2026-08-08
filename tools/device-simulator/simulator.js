'use strict';

const { randomUUID } = require('node:crypto');

class DeviceSimulator {
  constructor({ lockerId = 'LOCKER-001', publish, now = () => Date.parse('2026-08-08T08:00:00.000Z') }) {
    this.lockerId = lockerId; this.publish = publish; this.now = now;
    this.state = { door: 'CLOSED', lock: 'UNKNOWN', alarm: 'INACTIVE', led: 'OFF' };
    this.completed = new Map(); this.online = false;
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

  door(state, overrides = {}) {
    const previous = this.state.door;
    if (state === previous) return;
    this.state.door = state;
    this.publish(this.topic('telemetry/door'), { schema_version: 1, locker_id: this.lockerId,
      previous_state: previous, state, timestamp: this.timestamp(), time_synced: true,
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
    if (mode === 'error') return this.ack(command, 'error', { code: 'ACTUATION_FAILED', message: 'Simulated error' });
    const next = { ...this.state };
    if (command.action === 'LOCK') next.lock = 'LOCKED';
    if (command.action === 'UNLOCK') next.lock = 'UNLOCKED';
    if (command.action === 'ALARM_ON') next.alarm = 'ACTIVE';
    if (command.action === 'ALARM_OFF') next.alarm = 'INACTIVE';
    if (command.action === 'LED_ON') next.led = 'ON';
    if (command.action === 'LED_OFF') next.led = 'OFF';
    this.state = next;
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
