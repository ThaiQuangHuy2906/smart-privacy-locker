'use strict';

class LiveStateCache {
  constructor({ staleAfterMs = 30_000 } = {}) {
    this.staleAfterMs = staleAfterMs;
    this.restart();
  }

  restart() {
    this.mqttConnected = false;
    this.connectionGeneration = 0;
    this.lockers = new Map();
  }

  entry(lockerId) {
    if (!this.lockers.has(lockerId)) {
      this.lockers.set(lockerId, {
        state: null, stateObservedAt: 0, stateDeviceAt: null, stateSource: null,
        doorObservedAt: 0, doorDeviceAt: null, doorSource: null,
        availability: 'OFFLINE', availabilityObservedAt: 0,
        availabilityGeneration: -1, stateGeneration: -1,
        door: 'UNKNOWN', latestAlert: null,
      });
    }
    return this.lockers.get(lockerId);
  }

  setMqttConnected(connected) {
    const next = Boolean(connected);
    if (next && !this.mqttConnected) this.connectionGeneration += 1;
    this.mqttConnected = next;
  }

  ingestAvailability(lockerId, value, observedAt) {
    const item = this.entry(lockerId);
    if (observedAt < item.availabilityObservedAt) return false;
    item.availability = value.status;
    item.availabilityObservedAt = observedAt;
    item.availabilityGeneration = this.connectionGeneration;
    return true;
  }

  ingestState(lockerId, value, observedAt, source = 'mqtt:state') {
    const item = this.entry(lockerId);
    if (observedAt < item.stateObservedAt) return false;
    if (value.timestamp && item.stateDeviceAt && Date.parse(value.timestamp) < Date.parse(item.stateDeviceAt)) {
      return false;
    }
    item.state = { door: value.door, lock: value.lock, alarm: value.alarm, led: value.led };
    item.door = value.door;
    item.stateObservedAt = observedAt;
    item.stateDeviceAt = value.timestamp;
    item.stateSource = source;
    item.stateGeneration = this.connectionGeneration;
    item.doorObservedAt = observedAt;
    item.doorDeviceAt = value.timestamp;
    item.doorSource = source;
    return true;
  }

  ingestDoor(lockerId, value, observedAt) {
    const item = this.entry(lockerId);
    if (observedAt < item.doorObservedAt) return false;
    if (value.timestamp && item.doorDeviceAt && Date.parse(value.timestamp) < Date.parse(item.doorDeviceAt)) return false;
    item.door = value.state;
    if (item.state) item.state = { ...item.state, door: value.state };
    item.doorObservedAt = observedAt;
    item.doorDeviceAt = value.timestamp;
    item.doorSource = 'mqtt:door';
    return true;
  }

  setLatestAlert(lockerId, alert) { this.entry(lockerId).latestAlert = alert; }

  snapshot(lockerId, now = Date.now()) {
    const item = this.entry(lockerId);
    const availabilityFresh = item.availability === 'ONLINE'
      && item.availabilityGeneration === this.connectionGeneration
      && now - item.availabilityObservedAt <= this.staleAfterMs;
    const stateFresh = Boolean(item.state) && now - item.stateObservedAt <= this.staleAfterMs
      && item.stateGeneration === this.connectionGeneration
      && item.stateObservedAt >= item.availabilityObservedAt;
    const trusted = this.mqttConnected && availabilityFresh && stateFresh;
    return {
      locker_id: lockerId,
      mqtt_connected: this.mqttConnected,
      availability: availabilityFresh ? 'ONLINE' : 'OFFLINE',
      state: trusted ? { ...item.state, door: item.door } : {
        door: 'UNKNOWN', lock: item.state?.lock || 'UNKNOWN',
        alarm: item.state?.alarm || 'UNKNOWN', led: item.state?.led || 'UNKNOWN',
      },
      source: { state: item.stateSource, door: item.doorSource },
      device_time: { state: item.stateDeviceAt, door: item.doorDeviceAt },
      observed_at: item.stateObservedAt || item.doorObservedAt
        ? new Date(Math.max(item.stateObservedAt, item.doorObservedAt)).toISOString() : null,
      fresh: trusted,
      stale: !trusted,
      latest_alert: item.latestAlert,
    };
  }
}

module.exports = { LiveStateCache };
