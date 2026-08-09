'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const mqtt = require('../node-red/node_modules/mqtt');

const ROOT = path.resolve(__dirname, '..');
const LOCKER_ID = 'LOCKER-001';
const COMMAND_TIMEOUT_MS = 12_000;

function readEnv(file) {
  const values = {};
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"'))
        || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    values[match[1]] = value;
  }
  return values;
}

function requireEnv(env, names) {
  const missing = names.filter((name) => !env[name]);
  if (missing.length) throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
}

function iso() { return new Date().toISOString(); }

function availability(status) {
  return { schema_version: 1, locker_id: LOCKER_ID, status, sent_at: iso() };
}

function state({ door = 'CLOSED', alarm = 'INACTIVE' } = {}) {
  return {
    schema_version: 1,
    locker_id: LOCKER_ID,
    door,
    lock: 'LOCKED',
    alarm,
    led: 'OFF',
    wifi_connected: true,
    mqtt_connected: true,
    timestamp: iso(),
  };
}

function door(previousState, nextState) {
  return {
    schema_version: 1,
    locker_id: LOCKER_ID,
    previous_state: previousState,
    state: nextState,
    time_synced: true,
    timestamp: iso(),
  };
}

function wait(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

function publish(client, topic, payload, options = {}) {
  return new Promise((resolve, reject) => {
    client.publish(topic, JSON.stringify(payload), { qos: 1, retain: false, ...options }, (error) => {
      if (error) reject(error); else resolve();
    });
  });
}

function subscribe(client, topic) {
  return new Promise((resolve, reject) => {
    client.subscribe(topic, { qos: 1 }, (error, grants) => {
      if (error) return reject(error);
      if (!grants?.length || grants[0].qos === 128) return reject(new Error('MQTT subscription denied'));
      return resolve();
    });
  });
}

function connect(options) {
  return new Promise((resolve, reject) => {
    const client = mqtt.connect(options.url, options.config);
    const timer = setTimeout(() => {
      client.end(true);
      reject(new Error('MQTT connection timed out'));
    }, 12_000);
    client.once('connect', () => {
      clearTimeout(timer);
      resolve(client);
    });
    client.once('error', (error) => {
      clearTimeout(timer);
      client.end(true);
      reject(error);
    });
  });
}

function commandPromise(client) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      client.off('message', onMessage);
      reject(new Error('ALARM_ON command was not observed'));
    }, COMMAND_TIMEOUT_MS);
    function onMessage(topic, payload) {
      if (topic !== `locker/${LOCKER_ID}/command`) return;
      let command;
      try { command = JSON.parse(payload.toString()); } catch { return; }
      if (command?.locker_id !== LOCKER_ID || command?.action !== 'ALARM_ON'
          || typeof command?.command_id !== 'string') return;
      clearTimeout(timer);
      client.off('message', onMessage);
      resolve(command);
    }
    client.on('message', onMessage);
  });
}

async function cleanup(client) {
  if (!client?.connected) return false;
  await publish(client, `locker/${LOCKER_ID}/telemetry/door`, door('OPEN', 'CLOSED'));
  await publish(client, `locker/${LOCKER_ID}/state`, state(), { retain: true });
  await publish(client, `locker/${LOCKER_ID}/availability`, availability('OFFLINE'), { retain: true });
  await wait(500);
  return true;
}

async function main() {
  const env = readEnv(path.join(ROOT, '.env'));
  requireEnv(env, ['MQTT_HOST', 'MQTT_PORT', 'MQTT_USERNAME', 'MQTT_PASSWORD']);
  const tls = String(env.MQTT_TLS).toLowerCase() !== 'false';
  const host = env.MQTT_HOST.replace(/^mqtts?:\/\//, '').replace(/\/$/, '');
  const config = {
    clientId: `phase2-alert-${crypto.randomBytes(8).toString('hex')}`,
    username: env.MQTT_USERNAME,
    password: env.MQTT_PASSWORD,
    protocolVersion: 4,
    clean: true,
    reconnectPeriod: 0,
    connectTimeout: 10_000,
    rejectUnauthorized: true,
  };
  if (env.MQTT_CA_CERT_PATH) config.ca = fs.readFileSync(path.resolve(ROOT, env.MQTT_CA_CERT_PATH));
  const url = `${tls ? 'mqtts' : 'mqtt'}://${host}:${env.MQTT_PORT}`;
  let client;
  let cleaned = false;
  const report = {
    run: 'P2-M06 live unauthorized alert trigger',
    generated_at: iso(),
    identifiers: 'fixed contract locker; command/event identifiers redacted',
    checks: [],
  };
  try {
    client = await connect({ url, config });
    report.checks.push({ check: 'Authenticated TLS MQTT connection', result: 'PASS' });
    await subscribe(client, `locker/${LOCKER_ID}/command`);
    report.checks.push({ check: 'Command topic subscription', result: 'PASS' });

    await publish(client, `locker/${LOCKER_ID}/availability`, availability('ONLINE'), { retain: true });
    await publish(client, `locker/${LOCKER_ID}/state`, state(), { retain: true });
    await publish(client, `locker/${LOCKER_ID}/telemetry/door`, door('OPEN', 'CLOSED'));
    await wait(500);
    await publish(client, `locker/${LOCKER_ID}/state`, state(), { retain: true });
    await wait(1000);

    const alarmCommand = commandPromise(client);
    await publish(client, `locker/${LOCKER_ID}/telemetry/door`, door('CLOSED', 'OPEN'));
    report.checks.push({ check: 'Valid unauthorized OPEN telemetry published', result: 'PASS' });
    const command = await alarmCommand;
    report.checks.push({ check: 'Node-RED emitted ALARM_ON', result: 'PASS' });

    const ack = {
      schema_version: 1,
      command_id: command.command_id,
      locker_id: LOCKER_ID,
      action: 'ALARM_ON',
      result: 'success',
      device_state: state({ door: 'OPEN', alarm: 'ACTIVE' }),
      error: null,
      duplicate: false,
      timestamp: iso(),
    };
    delete ack.device_state.schema_version;
    delete ack.device_state.locker_id;
    delete ack.device_state.wifi_connected;
    delete ack.device_state.mqtt_connected;
    delete ack.device_state.timestamp;
    await publish(client, `locker/${LOCKER_ID}/ack`, ack);
    report.checks.push({ check: 'Simulator returned correlated success ACK', result: 'PASS' });

    // Telegram delivery is detached from ALARM_ON. Allow its bounded provider
    // call to complete before returning the broker state to the safe baseline.
    await wait(6500);
    report.checks.push({
      check: 'Telegram delivery observation window elapsed',
      result: 'MANUAL_CONFIRMATION_REQUIRED',
      evidence: 'Check exactly one new alert in the configured Telegram chat.',
    });
  } finally {
    try { cleaned = await cleanup(client); } catch { cleaned = false; }
    if (client) await new Promise((resolve) => client.end(false, {}, resolve));
    report.cleanup = {
      retained_state: cleaned ? 'OFFLINE/CLOSED/LOCKED/INACTIVE' : 'NOT_CONFIRMED',
      completed: cleaned,
    };
    console.log(JSON.stringify(report, null, 2));
  }
  if (!cleaned) process.exitCode = 1;
}

main().catch((error) => {
  console.error(JSON.stringify({
    run: 'P2-M06 live unauthorized alert trigger',
    error: error.message,
    secrets_printed: false,
  }, null, 2));
  process.exitCode = 1;
});
