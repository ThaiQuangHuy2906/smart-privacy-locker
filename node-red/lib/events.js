'use strict';

const { randomUUID } = require('node:crypto');

function eventDevice(eventType) {
  if (eventType.startsWith('DOOR_') || eventType === 'UNAUTHORIZED_OPEN') return 'door';
  if (eventType.startsWith('LOCK_') || eventType === 'UNLOCK_COMMAND') return 'lock';
  if (eventType.startsWith('ALARM_')) return 'alarm';
  if (eventType.startsWith('LED_')) return 'led';
  if (eventType.includes('NOTIFICATION') || eventType === 'DAILY_EMAIL_REPORT') return 'notification';
  return 'system';
}

function normalizedEvent({ eventType, lockerId, state, source, result = 'observed',
  authorized = null, commandId = null, principal = null, action = null,
  occurredAt = null, recordedAt = new Date().toISOString(), error = null,
  metadata = {}, notification = null, uuid = randomUUID }) {
  const allowedMetadata = Object.fromEntries(Object.entries(metadata)
    .filter(([key]) => !/token|jwt|authorization|password|secret|cookie/i.test(key)));
  return {
    schema_version: 1,
    event_id: uuid(),
    event_type: eventType,
    locker_id: lockerId,
    device: eventDevice(eventType),
    action,
    source,
    result,
    authorized,
    command_id: commandId,
    device_state: state ? { door: state.door, lock: state.lock, alarm: state.alarm, led: state.led } : null,
    error,
    occurred_at: occurredAt || recordedAt,
    recorded_at: recordedAt,
    principal,
    notification_status: notification,
    metadata: allowedMetadata,
  };
}

module.exports = { eventDevice, normalizedEvent };
