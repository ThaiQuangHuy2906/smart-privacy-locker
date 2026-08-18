'use strict';

const { createHash } = require('node:crypto');
const { normalizedEvent } = require('./events');

function derivedEventId(sourceId, purpose) {
  if (!sourceId) return null;
  const bytes = createHash('sha256').update(`${purpose}\0${sourceId}`).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

class UnauthorizedDetector {
  constructor({ windowMs = 30_000, now = Date.now, uuid, dispatchAlarm,
    emit = () => {}, notify = async () => ({ status: 'not_configured' }),
    notificationStatus = () => {}, latestAlert = () => {}, deviceEventLimit = 128,
    reconciliationReplayMs = 10_000 }) {
    this.windowMs = windowMs;
    this.now = now;
    this.uuid = uuid;
    this.dispatchAlarm = dispatchAlarm;
    this.emit = emit;
    this.notify = notify;
    this.notificationStatus = notificationStatus;
    this.latestAlert = latestAlert;
    this.deviceEventLimit = deviceEventLimit;
    this.reconciliationReplayMs = reconciliationReplayMs;
    this.restart();
  }

  restart() {
    this.windows = new Map();
    this.openEpisodes = new Set();
    this.deviceEvents = new Set();
    this.reconciledTransitions = new Map();
  }

  rememberDeviceEvent(eventId) {
    if (!eventId) return true;
    if (this.deviceEvents.has(eventId)) return false;
    this.deviceEvents.add(eventId);
    while (this.deviceEvents.size > this.deviceEventLimit) {
      this.deviceEvents.delete(this.deviceEvents.values().next().value);
    }
    return true;
  }

  rememberReconciliation(lockerId, previousState, state) {
    this.reconciledTransitions.delete(lockerId);
    this.reconciledTransitions.set(lockerId, {
      previousState, state, observedAt: this.now(),
    });
    while (this.reconciledTransitions.size > this.deviceEventLimit) {
      this.reconciledTransitions.delete(this.reconciledTransitions.keys().next().value);
    }
  }

  suppressReplayedReconciliation({ lockerId, previousState, state, eventId, metadata }) {
    if (metadata.reconciled_from_state) {
      this.rememberReconciliation(lockerId, previousState, state);
      return false;
    }
    const reconciled = this.reconciledTransitions.get(lockerId);
    if (!reconciled) return false;
    const stillRecent = this.now() - reconciled.observedAt <= this.reconciliationReplayMs;
    const matches = reconciled.previousState === previousState && reconciled.state === state;
    if (eventId && stillRecent && matches) {
      this.rememberDeviceEvent(eventId);
      this.reconciledTransitions.delete(lockerId);
      return true;
    }
    this.reconciledTransitions.delete(lockerId);
    return false;
  }

  onCommandStarted({ lockerId, action }) {
    if (action === 'LOCK' || action === 'UNLOCK') this.windows.delete(lockerId);
  }

  onCommandResult(result) {
    const { pending } = result;
    if (!pending) return;
    if (pending.action === 'LOCK') {
      this.windows.delete(pending.lockerId);
      return;
    }
    if (pending.action === 'UNLOCK') {
      const state = result.ack?.device_state;
      if (result.ok && state?.lock === 'UNLOCKED' && state?.door === 'CLOSED') {
        this.windows.set(pending.lockerId, {
          commandId: pending.commandId,
          expiresAt: this.now() + this.windowMs,
        });
      } else {
        this.windows.delete(pending.lockerId);
      }
    }
  }

  onDoor({ lockerId, previousState, state, deviceState, lockTrusted = false,
    occurredAt, observedAt, timeSynced = true, eventId = null, metadata = {},
    authorization = undefined, authorizationSource = null }) {
    const eventMetadata = timeSynced ? {} : { device_time_unsynced: true };
    if (previousState === state) return [];
    if (this.suppressReplayedReconciliation({
      lockerId, previousState, state, eventId, metadata,
    })) return [];
    if (!this.rememberDeviceEvent(eventId)) return [];
    if (state === 'CLOSED') {
      this.openEpisodes.delete(lockerId);
      const event = this.event('DOOR_CLOSED', lockerId, deviceState, null, occurredAt, observedAt,
        null, { ...eventMetadata, ...metadata }, eventId);
      this.emit(event);
      return [event];
    }
    if (state !== 'OPEN' || this.openEpisodes.has(lockerId)) return [];
    this.openEpisodes.add(lockerId);

    const window = this.windows.get(lockerId);
    const firmwareDecision = typeof authorization === 'boolean';
    const authorized = firmwareDecision ? authorization
      : Boolean(lockTrusted && window && this.now() < window.expiresAt
        && deviceState.lock === 'UNLOCKED');
    this.windows.delete(lockerId);
    const decisionMetadata = {
      access_decision_source: firmwareDecision
        ? (authorizationSource || 'firmware') : 'backend_window_legacy',
    };
    const opened = this.event('DOOR_OPENED', lockerId, deviceState, authorized, occurredAt, observedAt,
      authorized && window ? window.commandId : null,
      { ...eventMetadata, ...decisionMetadata, ...metadata }, eventId);
    this.emit(opened);
    if (authorized) return [opened];

    const unauthorized = this.event('UNAUTHORIZED_OPEN', lockerId, deviceState, false, occurredAt,
      observedAt, null, { ...eventMetadata, ...decisionMetadata, ...metadata },
      derivedEventId(eventId, 'unauthorized'));
    this.emit(unauthorized);
    this.latestAlert(lockerId, unauthorized);
    const alarm = this.dispatchAlarm(lockerId);
    // Notification delivery is deliberately detached from the alarm path. A
    // slow provider must never hold ALARM_ON in the Node-RED MQTT outbox.
    Promise.resolve(this.notify(unauthorized)).then((notification) => {
      unauthorized.notification_status = notification.status;
      this.notificationStatus(notification, unauthorized);
    }).catch(() => {
      const notification = {
        schema_version: 1, event_id: unauthorized.event_id, channel: 'telegram',
        status: 'failed', attempts: 1, attempted_at: new Date(this.now()).toISOString(),
        error: { code: 'TELEGRAM_DELIVERY_FAILED', message: 'Telegram delivery failed' },
      };
      unauthorized.notification_status = notification.status;
      this.notificationStatus(notification, unauthorized);
    });
    return [opened, unauthorized, { interface: 'ALARM_ON', result: alarm },
      { interface: 'TELEGRAM', event_id: unauthorized.event_id, delivery: 'asynchronous' }];
  }

  event(eventType, lockerId, state, authorized, occurredAt, observedAt, commandId = null,
    metadata = {}, eventId = null) {
    return normalizedEvent({ eventType, lockerId, state, source: 'sensor', result: 'observed',
      authorized, commandId, occurredAt, recordedAt: observedAt, uuid: this.uuid,
      principal: eventType === 'UNAUTHORIZED_OPEN' ? 'system:unauthorized-detector' : null,
      metadata: { detector: 'one-time-unlock-window-v2', ...metadata },
      ...(eventId ? { uuid: () => eventId } : {}) });
  }
}

module.exports = { UnauthorizedDetector, derivedEventId };
