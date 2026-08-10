'use strict';

function dashboardState({ authenticated, ownsLocker, snapshot, pendingDomains = [] }) {
  const reasons = [];
  if (!authenticated) reasons.push('AUTH_REQUIRED');
  if (!ownsLocker) reasons.push('LOCKER_FORBIDDEN');
  if (!snapshot.mqtt_connected) reasons.push('MQTT_DISCONNECTED');
  if (snapshot.availability !== 'ONLINE') reasons.push('DEVICE_OFFLINE');
  if (!snapshot.fresh) reasons.push('STATE_UNTRUSTED');
  return {
    mqtt: snapshot.mqtt_connected ? 'CONNECTED' : 'DISCONNECTED',
    device: snapshot.availability,
    door: snapshot.fresh ? snapshot.state.door : 'UNKNOWN',
    lock: snapshot.state.lock,
    alarm: snapshot.state.alarm,
    led: snapshot.state.led,
    lock_unconfirmed: snapshot.state.lock === 'UNKNOWN',
    last_updated: snapshot.observed_at,
    stale: !snapshot.fresh,
    latest_alert: snapshot.latest_alert,
    controls: Object.fromEntries(['lock', 'alarm', 'led'].map((domain) => [domain, {
      enabled: reasons.length === 0 && !pendingDomains.includes(domain),
      pending: pendingDomains.includes(domain),
      reasons: [...reasons, ...(pendingDomains.includes(domain) ? ['PENDING_CONFLICT'] : [])],
    }])),
  };
}

module.exports = { dashboardState };
