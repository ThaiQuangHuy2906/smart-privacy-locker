'use strict';

function dashboardState({ authenticated, ownsLocker, snapshot, pendingDomains = [] }) {
  const baseReasons = [];
  if (!authenticated) baseReasons.push('AUTH_REQUIRED');
  if (!ownsLocker) baseReasons.push('LOCKER_FORBIDDEN');
  if (!snapshot.mqtt_connected) baseReasons.push('MQTT_DISCONNECTED');
  if (snapshot.availability !== 'ONLINE') baseReasons.push('DEVICE_OFFLINE');
  if (!snapshot.fresh) baseReasons.push('STATE_UNTRUSTED');

  const actionDomains = {
    LOCK: 'lock',
    UNLOCK: 'lock',
    ALARM_ON: 'alarm',
    ALARM_OFF: 'alarm',
    LED_ON: 'led',
    LED_OFF: 'led',
  };
  const actionReasons = (action) => {
    const domain = actionDomains[action];
    const reasons = [...baseReasons];
    if (pendingDomains.includes(domain)) reasons.push('PENDING_CONFLICT');
    if (snapshot.fresh) {
      if (action === 'LOCK' && snapshot.state.door !== 'CLOSED') reasons.push('DOOR_NOT_CLOSED');
      if (action === 'LOCK' && snapshot.state.lock === 'LOCKED') reasons.push('ALREADY_IN_STATE');
      if (action === 'UNLOCK' && snapshot.state.door !== 'CLOSED') {
        reasons.push('DOOR_NOT_CLOSED_FOR_ACCESS');
      }
      if (action === 'ALARM_ON' && snapshot.state.alarm === 'ACTIVE') reasons.push('ALREADY_IN_STATE');
      if (action === 'ALARM_OFF' && snapshot.state.alarm === 'INACTIVE') reasons.push('ALREADY_IN_STATE');
      if (action === 'LED_ON' && snapshot.state.led === 'ON') reasons.push('ALREADY_IN_STATE');
      if (action === 'LED_OFF' && snapshot.state.led === 'OFF') reasons.push('ALREADY_IN_STATE');
    }
    return reasons;
  };
  const actions = Object.fromEntries(Object.keys(actionDomains).map((action) => {
    const reasons = actionReasons(action);
    return [action, {
      enabled: reasons.length === 0,
      pending: reasons.includes('PENDING_CONFLICT'),
      reasons,
    }];
  }));
  const domains = ['lock', 'alarm', 'led'];
  return {
    mqtt: snapshot.mqtt_connected ? 'CONNECTED' : 'DISCONNECTED',
    device: snapshot.availability,
    wifi: snapshot.fresh && typeof snapshot.state.wifi_connected === 'boolean'
      ? (snapshot.state.wifi_connected ? 'CONNECTED' : 'DISCONNECTED')
      : 'UNKNOWN',
    door: snapshot.fresh ? snapshot.state.door : 'UNKNOWN',
    lock: snapshot.fresh ? snapshot.state.lock : 'UNKNOWN',
    alarm: snapshot.fresh ? snapshot.state.alarm : 'UNKNOWN',
    led: snapshot.fresh ? snapshot.state.led : 'UNKNOWN',
    lock_unconfirmed: !snapshot.fresh || snapshot.state.lock === 'UNKNOWN',
    last_updated: snapshot.observed_at,
    stale: !snapshot.fresh,
    latest_alert: snapshot.latest_alert,
    actions,
    controls: Object.fromEntries(domains.map((domain) => [domain, {
      enabled: Object.entries(actionDomains)
        .some(([action, actionDomain]) => actionDomain === domain && actions[action].enabled),
      pending: pendingDomains.includes(domain),
      reasons: [...baseReasons, ...(pendingDomains.includes(domain) ? ['PENDING_CONFLICT'] : [])],
    }])),
  };
}

module.exports = { dashboardState };
