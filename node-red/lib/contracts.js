'use strict';

const SCHEMA_VERSION = 1;
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LOCKER = /^[A-Z0-9][A-Z0-9_-]{0,31}$/;
const DOOR = new Set(['OPEN', 'CLOSED', 'UNKNOWN']);
const LOCK = new Set(['LOCKED', 'UNLOCKED', 'UNKNOWN']);
const ALARM = new Set(['ACTIVE', 'INACTIVE', 'UNKNOWN']);
const LED = new Set(['ON', 'OFF', 'UNKNOWN']);
const ACTIONS = new Set(['LOCK', 'UNLOCK', 'ALARM_ON', 'ALARM_OFF', 'LED_ON', 'LED_OFF', 'GET_STATE']);

function safeJson(input) {
  try {
    const value = typeof input === 'string' || Buffer.isBuffer(input)
      ? JSON.parse(input.toString()) : input;
    return value && typeof value === 'object' && !Array.isArray(value)
      ? { ok: true, value } : { ok: false, code: 'INVALID_JSON' };
  } catch {
    return { ok: false, code: 'INVALID_JSON' };
  }
}

function utc(value, nullable = false) {
  if (value === null && nullable) return true;
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)
    && Number.isFinite(Date.parse(value));
}

function topicLocker(topic, suffix) {
  const match = typeof topic === 'string' && topic.match(/^locker\/([^/]+)\/(.+)$/);
  return match && match[2] === suffix && LOCKER.test(match[1]) ? match[1] : null;
}

function common(payload, topic, suffix) {
  const parsed = safeJson(payload);
  if (!parsed.ok) return parsed;
  const value = parsed.value;
  const lockerId = topicLocker(topic, suffix);
  if (value.schema_version !== SCHEMA_VERSION) return { ok: false, code: 'INVALID_SCHEMA' };
  if (!lockerId || value.locker_id !== lockerId) return { ok: false, code: 'LOCKER_MISMATCH' };
  return { ok: true, value, lockerId };
}

function validDeviceState(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
    && DOOR.has(value.door) && LOCK.has(value.lock) && ALARM.has(value.alarm) && LED.has(value.led);
}

function validateState(topic, payload) {
  const result = common(payload, topic, 'state');
  if (!result.ok) return result;
  const v = result.value;
  if (!validDeviceState(v) || typeof v.wifi_connected !== 'boolean'
      || typeof v.mqtt_connected !== 'boolean' || !utc(v.timestamp, true)) {
    return { ok: false, code: 'INVALID_STATE' };
  }
  return result;
}

function validateDoor(topic, payload) {
  const result = common(payload, topic, 'telemetry/door');
  if (!result.ok) return result;
  const v = result.value;
  if (!DOOR.has(v.previous_state) || v.previous_state === 'UNKNOWN'
      || !DOOR.has(v.state) || v.state === 'UNKNOWN' || v.state === v.previous_state
      || typeof v.time_synced !== 'boolean'
      || (v.time_synced ? !utc(v.timestamp) : v.timestamp !== null)) {
    return { ok: false, code: 'INVALID_DOOR_TELEMETRY' };
  }
  return result;
}

function validateAvailability(topic, payload) {
  const result = common(payload, topic, 'availability');
  if (!result.ok) return result;
  const v = result.value;
  if (!['ONLINE', 'OFFLINE'].includes(v.status) || !utc(v.sent_at, true)) {
    return { ok: false, code: 'INVALID_AVAILABILITY' };
  }
  return result;
}

function validateHeartbeat(topic, payload) {
  const result = common(payload, topic, 'heartbeat');
  if (!result.ok) return result;
  if (!utc(result.value.sent_at, true)) {
    return { ok: false, code: 'INVALID_HEARTBEAT' };
  }
  return result;
}

function validateAck(topic, payload) {
  const result = common(payload, topic, 'ack');
  if (!result.ok) return result;
  const v = result.value;
  if (!UUID.test(v.command_id) || !ACTIONS.has(v.action)
      || !['success', 'error'].includes(v.result) || !validDeviceState(v.device_state)
      || typeof v.duplicate !== 'boolean' || !utc(v.timestamp, true)
      || (v.result === 'success' ? v.error !== null
        : !(v.error && typeof v.error.code === 'string' && typeof v.error.message === 'string'))) {
    return { ok: false, code: 'INVALID_ACK' };
  }
  return result;
}

function validateCommand(topic, payload) {
  const result = common(payload, topic, 'command');
  if (!result.ok) return result;
  const v = result.value;
  if (!UUID.test(v.command_id) || !ACTIONS.has(v.action) || !utc(v.issued_at)
      || typeof v.requested_by !== 'string' || v.requested_by.length === 0) {
    return { ok: false, code: 'INVALID_COMMAND' };
  }
  return result;
}

function expectedState(action, state) {
  if (!validDeviceState(state)) return false;
  return ({ LOCK: 'LOCKED', UNLOCK: 'UNLOCKED' }[action] || state.lock) === state.lock
    && ({ ALARM_ON: 'ACTIVE', ALARM_OFF: 'INACTIVE' }[action] || state.alarm) === state.alarm
    && ({ LED_ON: 'ON', LED_OFF: 'OFF' }[action] || state.led) === state.led;
}

module.exports = {
  SCHEMA_VERSION, UUID, UUID_V4, ACTIONS, safeJson, utc, topicLocker,
  validDeviceState, validateState, validateDoor, validateAvailability,
  validateHeartbeat, validateAck, validateCommand, expectedState,
};
