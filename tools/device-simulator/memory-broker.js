'use strict';

class MemoryBroker {
  constructor() { this.retained = new Map(); this.subscribers = []; this.capture = []; }

  subscribe(filter, callback) {
    this.subscribers.push({ filter, callback });
    for (const [topic, payload] of this.retained) if (matches(filter, topic)) callback(topic, payload, { retained: true });
  }

  publish(topic, payload, { retain = false } = {}) {
    const cloned = typeof payload === 'string' ? payload : JSON.parse(JSON.stringify(payload));
    this.capture.push({ topic, payload: cloned, retain });
    if (retain) this.retained.set(topic, cloned);
    for (const subscriber of this.subscribers) if (matches(subscriber.filter, topic)) subscriber.callback(topic, cloned, { retained: false });
  }
}

function matches(filter, topic) {
  const f = filter.split('/'); const t = topic.split('/');
  if (f.length !== t.length && f.at(-1) !== '#') return false;
  for (let i = 0; i < f.length; i += 1) {
    if (f[i] === '#') return true;
    if (f[i] !== '+' && f[i] !== t[i]) return false;
  }
  return f.length === t.length;
}

module.exports = { MemoryBroker, matches };
