'use strict';

const { normalizedEvent } = require('./events');

class UnauthorizedDetector {
  constructor({ windowMs = 30_000, now = Date.now, uuid, dispatchAlarm,
    emit = () => {}, notify = async () => ({ status: 'not_configured' }),
    notificationStatus = () => {}, latestAlert = () => {} }) {
    this.windowMs = windowMs;
    this.now = now;
    this.uuid = uuid;
    this.dispatchAlarm = dispatchAlarm;
    this.emit = emit;
    this.notify = notify;
    this.notificationStatus = notificationStatus;
    this.latestAlert = latestAlert;
    this.restart();
  }

  restart() { this.windows = new Map(); this.openEpisodes = new Set(); }

  onCommandResult(result) {
    if (!result.ok) return;
    const { pending } = result;
    if (pending.action === 'UNLOCK') {
      this.windows.set(pending.lockerId, { commandId: pending.commandId, expiresAt: this.now() + this.windowMs });
    } else if (pending.action === 'LOCK') {
      this.windows.delete(pending.lockerId);
    }
  }

  onDoor({ lockerId, previousState, state, deviceState, occurredAt, observedAt, timeSynced = true }) {
    const eventMetadata = timeSynced ? {} : { device_time_unsynced: true };
    if (previousState === state) return [];
    if (state === 'CLOSED') {
      this.openEpisodes.delete(lockerId);
      const event = this.event('DOOR_CLOSED', lockerId, deviceState, null, occurredAt, observedAt,
        null, eventMetadata);
      this.emit(event);
      return [event];
    }
    if (state !== 'OPEN' || this.openEpisodes.has(lockerId)) return [];
    this.openEpisodes.add(lockerId);

    const window = this.windows.get(lockerId);
    const authorized = Boolean(window && this.now() < window.expiresAt && deviceState.lock === 'UNLOCKED');
    if (authorized) this.windows.delete(lockerId);
    const opened = this.event('DOOR_OPENED', lockerId, deviceState, authorized, occurredAt, observedAt,
      window?.commandId || null, eventMetadata);
    this.emit(opened);
    if (authorized) return [opened];

    this.windows.delete(lockerId);
    const unauthorized = this.event('UNAUTHORIZED_OPEN', lockerId, deviceState, false, occurredAt,
      observedAt, null, eventMetadata);
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
    metadata = {}) {
    return normalizedEvent({ eventType, lockerId, state, source: 'sensor', result: 'observed',
      authorized, commandId, occurredAt, recordedAt: observedAt, uuid: this.uuid,
      principal: eventType === 'UNAUTHORIZED_OPEN' ? 'system:unauthorized-detector' : null,
      metadata: { detector: 'authorized-window-v1', ...metadata } });
  }
}

module.exports = { UnauthorizedDetector };
