'use strict';

const { normalizedEvent } = require('./events');

class UnauthorizedDetector {
  constructor({ windowMs = 30_000, now = Date.now, uuid, dispatchAlarm,
    emit = () => {}, notify = async () => ({ status: 'not_configured' }),
    latestAlert = () => {} }) {
    this.windowMs = windowMs;
    this.now = now;
    this.uuid = uuid;
    this.dispatchAlarm = dispatchAlarm;
    this.emit = emit;
    this.notify = notify;
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

  async onDoor({ lockerId, previousState, state, deviceState, occurredAt, observedAt }) {
    if (previousState === state) return [];
    if (state === 'CLOSED') {
      this.openEpisodes.delete(lockerId);
      const event = this.event('DOOR_CLOSED', lockerId, deviceState, true, occurredAt, observedAt);
      this.emit(event);
      return [event];
    }
    if (state !== 'OPEN' || this.openEpisodes.has(lockerId)) return [];
    this.openEpisodes.add(lockerId);

    const window = this.windows.get(lockerId);
    const authorized = Boolean(window && this.now() < window.expiresAt && deviceState.lock === 'UNLOCKED');
    if (authorized) this.windows.delete(lockerId);
    const opened = this.event('DOOR_OPENED', lockerId, deviceState, authorized, occurredAt, observedAt,
      window?.commandId || null);
    this.emit(opened);
    if (authorized) return [opened];

    this.windows.delete(lockerId);
    const unauthorized = this.event('UNAUTHORIZED_OPEN', lockerId, deviceState, false, occurredAt, observedAt);
    this.emit(unauthorized);
    this.latestAlert(lockerId, unauthorized);
    const alarm = this.dispatchAlarm(lockerId);
    const notification = await this.notify(unauthorized);
    unauthorized.notification_status = notification.status;
    return [opened, unauthorized, { interface: 'ALARM_ON', result: alarm }, { interface: 'TELEGRAM', result: notification }];
  }

  event(eventType, lockerId, state, authorized, occurredAt, observedAt, commandId = null) {
    return normalizedEvent({ eventType, lockerId, state, source: 'sensor', result: 'observed',
      authorized, commandId, occurredAt, recordedAt: observedAt, uuid: this.uuid,
      principal: eventType === 'UNAUTHORIZED_OPEN' ? 'system:unauthorized-detector' : null,
      metadata: { detector: 'authorized-window-v1' } });
  }
}

module.exports = { UnauthorizedDetector };
