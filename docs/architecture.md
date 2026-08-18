# Phase 1–3 architecture

> Audit status 2026-08-18: this architecture matches the current source, with
> the explicit limitations below. Physical photos confirm the SG90 arm is a
> rotating latch at the door edge. It has no position/current feedback;
> automated software paths pass while final physical E2E remains manual.

## Trust and data boundaries

The Dashboard authenticates directly with Supabase Auth, then sends only the
current access token to protected Node-RED routes:

```text
Browser -> Supabase Auth
Browser -- Authorization: Bearer <access token> --> Node-RED
Node-RED -- user token --> Supabase ownership/RLS checks
Node-RED -- service role (backend only) --> event/settings/delivery persistence
Node-RED -- authenticated MQTT --> ESP32
ESP32 -- ACK/state/availability --> MQTT -> Node-RED
Browser -- owner-authenticated link request --> Node-RED --> one-time token hash in Supabase
Telegram -- private /start + secret webhook header --> Node-RED --> per-locker destination in Supabase
```

Dashboard code contains no MQTT credential or service-role key and never
publishes directly to ESP32. Node-RED derives identity from the verified token,
checks locker ownership, and is the sole command egress. Physical commands also
require fresh device availability/state; history, chart and settings remain
available to an authenticated owner while the device is offline.

Phase 2 owns CB1, YC6 logic/Telegram, YC8 routing/grounding and YC9. Phase 3
adds CB3 actuation, YC4 persistence/history, YC5 aggregation/chart and YC7
settings/report delivery. Connecting the Phase 3 adapters does not transfer
ownership of YC6 or YC8.

The YC1 path remains deliberately local:

```text
DHT22 -> EnvironmentMonitor -> DisplayController (OLED SSD1306)
```

There is no temperature/humidity MQTT publisher in the source.

YC12 has two deliberately separate paths:

```text
Phone/computer -> local Locker-Setup captive portal -> ESP32 NVS
ESP32 wifi_connected -> validated MQTT state -> fresh Node-RED cache -> owner Dashboard
```

Only the boolean connectivity result follows the second path. SSID and Wi-Fi
password never enter MQTT, Node-RED, Supabase or the Dashboard. A stale or
untrusted full-state message maps to `wifi=UNKNOWN` instead of displaying an
old connectivity value.

## Firmware modules

| Module | Responsibility | Implemented behavior |
|---|---|---|
| `state_manager` | One in-memory full-state source | cold boot defaults; only a completed actuator action confirms state |
| `command_handler` | Parse and validate MQTT v1 command JSON | validates schema, UUID, topic/device locker, action, timestamp and requester |
| `ack_publisher` | Serialize ACK and cache bounded results | duplicate replay preserves the original result/state/error and adds `duplicate:true` |
| `mqtt_client` | Broker lifecycle | unique client ID, LWT, retained availability/state, bounded retry/subscription, and outbox-before-state reconnect bootstrap |
| `wifi_provisioning` | WiFiManager lifecycle | captive portal/non-blocking processing and USB-local reset |
| `lock_controller` | CB2 SG90 rotating latch | attach/write after a valid command or local auto-lock request, settle, detach, cancel any in-flight movement if the door opens, then confirm the logical commanded state; no position/current feedback proves physical travel |
| `led_controller` | YC3 WS2812B | configured brightness/pixel count; changes only on LED actions |
| `alarm_controller` | CB3 active buzzer | configurable active-high/low polarity, safe boot inactive and non-blocking state change |
| `environment_monitor` | YC1 DHT22 | 2.5-second polling with valid/error readings |
| `display_controller` | YC1 OLED | local value/error render plus Wi-Fi/MQTT status |
| `time_utils` | NTP plausibility guard | applies stale checks only after time sync |
| `door_sensor` | CB1 MC-38 | boot `UNKNOWN`, stable `OPEN/CLOSED` debounce and transition-only output |
| `door_security` | Local door-security/auto-lock policy and RAM outbox | one closed-door `UNLOCK` grants one OPEN for 30 seconds; the next OPEN consumes it and arms lock-on-close, an unused grant locks at expiry, any OPEN without a grant alarms locally, and transition decisions replay through a bounded FIFO after MQTT recovery |

## Node-RED and Supabase modules

Node-RED responsibilities are split across `contracts`, `live-state`, `auth`,
`dispatcher`, `security`, `events`, `telegram`, `chatbot`, `dashboard-state`,
`data`, `statistics`, `report-time` and `email`.

Normalized events are persisted idempotently by `event_id`. Owner-protected
history and chart routes query deterministic paginated data through the backend adapter. The
daily-report scheduler computes the previous local day, reserves one canonical
locker/channel/report-date delivery, and records a bounded delivery state.
Definite non-delivery may retry up to the configured cap; an ambiguous SMTP
outcome is not automatically resent.

Availability without a device `sent_at` updates live readiness only. It is not
inserted into durable history because it cannot be assigned a stable event
identity across a retained-message replay. Timestamped availability keeps a
stable deterministic ID and remains idempotent.

Supabase RLS independently protects profiles, owned lockers, event history and
notification settings. Browser roles receive only explicit least-privilege
grants. The service role is confined to Node-RED and is required for trusted
persistence/scheduler operations that must not be exposed to a browser.

Runtime restart clears pending commands, completed IDs, cache freshness,
authorization caches and in-memory operational buffers/outboxes. Durable
events, settings and delivery reservations remain in Supabase. Both the
firmware door-event outbox and Node-RED persistence retry outbox are RAM-only,
so a process/device reboot before replay can lose an undelivered item.

Telegram alerts have no deployment-wide recipient. Each owner selects a locker
and requests a 10-minute deep link; only a secret-authenticated webhook from a
private chat can atomically consume it. Supabase stores the destination behind
the backend service-role boundary, while owner-facing settings expose only
connected/username/link-time metadata. Unauthorized-open handling looks up that
locker destination at send time, so one user's alert cannot fall back to or be
routed through another user's Chat ID.

## Cooperative firmware loop

`loop()` runs short activities in order: serial reset command, Wi-Fi
portal/process, MQTT tick/reconnect, debounced/raw door safety checks, door
outbox replay, grant-expiry/auto-lock handling, actuator completion, and
environment/display refresh. Servo and buzzer work are state transitions; an
incoming MQTT callback does not block for motion or replay an already cached
command as a new physical action. A stable observed `OPEN → CLOSED` requests
local lock immediately after the 50 ms debounce; a grant that remains unused
requests it at 30 seconds. Neither path depends on MQTT or creates a command
ACK. A raw open edge cancels either command-driven or automatic servo travel.

The compatibility enums `LOCKED`/`UNLOCKED` remain in MQTT/database/UI, but on
the current prototype they mean “the SG90 latch-control cycle reached its
configured deadline.” The controller cannot detect a jam, detached horn or
insufficient force. MC-38 `CLOSED/OPEN` is a separate door-contact signal; the
system must not claim measured latch position from the servo ACK alone.

## Recovery and safe boot

At cold boot, the source of truth is:

```json
{"door":"UNKNOWN","lock":"UNKNOWN","alarm":"INACTIVE","led":"OFF"}
```

The SG90 is not attached in `setup()`, the buzzer is driven to its configured
inactive level, no stored command is replayed, and no lock position is inferred
from NVS. After broker reconnect the firmware sends the command subscription,
then publishes retained `ONLINE` after local/send-level subscription success.
It defers incoming command callbacks and retained full state until the bounded
door-transition outbox is empty, so queued edges arrive before the newer state
snapshot. Consumers still require same-generation state after ONLINE, so this
bootstrap cannot enable controls on old or incomplete retained data.
PubSubClient 2.8 does not expose broker SUBACK grant
confirmation, so the broker ACL remains a deployment prerequisite. Consumers
must use availability and staleness, not retained state alone, to decide whether
the device is live. A non-retained heartbeat followed by retained full-state
refresh every 10 seconds keeps a quiet healthy device fresh without generating
periodic online-history events.

The software findings and their corrected status are tracked in
[../BAO_CAO_RA_SOAT_CODEBASE.md](../BAO_CAO_RA_SOAT_CODEBASE.md). The remaining
architectural limit is that QoS0 can leave an ambiguous physical outcome and
the SG90 has no position feedback; neither warrants automatic actuator retry.

See [mqtt-contract.md](mqtt-contract.md), [event-contract.md](event-contract.md),
[database-design.md](database-design.md), [the pin map](../hardware/pin-map.md)
and [the power budget](../hardware/power-budget.md) for the exact contracts and
physical safety gates.
