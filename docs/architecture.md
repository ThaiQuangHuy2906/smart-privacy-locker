# Phase 1–3 architecture

> Audit status 2026-08-17: this architecture matches the current source, with
> the explicit limitations below. The as-built SG90 arm directly closes/opens
> the door; there is no separate latch or position/current feedback. Automated
> software paths pass, while physical E2E/full-load remains open.

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
| `mqtt_client` | Broker lifecycle | unique client ID, LWT, retained availability/state, bounded retry and subscription |
| `wifi_provisioning` | WiFiManager lifecycle | captive portal/non-blocking processing and USB-local reset |
| `lock_controller` | CB2 SG90 direct door arm | attach/write after a valid action, settle, detach, then confirm the logical commanded state; no position/current feedback proves physical travel |
| `led_controller` | YC3 WS2812B | configured brightness/pixel count; changes only on LED actions |
| `alarm_controller` | CB3 active buzzer | configurable active-high/low polarity, safe boot inactive and non-blocking state change |
| `environment_monitor` | YC1 DHT22 | 2.5-second polling with valid/error readings |
| `display_controller` | YC1 OLED | local value/error render plus Wi-Fi/MQTT status |
| `time_utils` | NTP plausibility guard | applies stale checks only after time sync |
| `door_sensor` | CB1 MC-38 | boot `UNKNOWN`, stable `OPEN/CLOSED` debounce and transition-only output |

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

Runtime restart clears pending commands, completed IDs, authorization windows,
cache freshness and in-memory operational buffers. Durable events, settings and
delivery reservations remain in Supabase.

Telegram alerts have no deployment-wide recipient. Each owner selects a locker
and requests a 10-minute deep link; only a secret-authenticated webhook from a
private chat can atomically consume it. Supabase stores the destination behind
the backend service-role boundary, while owner-facing settings expose only
connected/username/link-time metadata. Unauthorized-open handling looks up that
locker destination at send time, so one user's alert cannot fall back to or be
routed through another user's Chat ID.

## Cooperative firmware loop

`loop()` runs short activities in order: serial reset command, Wi-Fi
portal/process, MQTT tick/reconnect, actuator completion, and
environment/display refresh. Servo and buzzer work are state transitions; an
incoming MQTT callback does not block for motion or replay an already cached
command as a new physical action.

The compatibility enums `LOCKED`/`UNLOCKED` remain in MQTT/database/UI, but on
the current prototype they mean “the SG90 control cycle reached its configured
close/open deadline.” The controller cannot detect a jam, detached horn,
insufficient force or manually opened door. MC-38 `CLOSED/OPEN` and physical
test evidence are separate outcome signals; the system must not claim a
tamper-resistant mechanical lock from the servo ACK alone.

## Recovery and safe boot

At cold boot, the source of truth is:

```json
{"door":"UNKNOWN","lock":"UNKNOWN","alarm":"INACTIVE","led":"OFF"}
```

The SG90 is not attached in `setup()`, the buzzer is driven to its configured
inactive level, no stored command is replayed, and no lock position is inferred
from NVS. After broker reconnect the firmware sends the command subscription,
then publishes retained `ONLINE` and full state only after local/send-level
subscription success. It publishes retained `ONLINE` immediately followed by
retained full state; consumers require that same-generation state after ONLINE,
so the brief bootstrap cannot enable controls on old retained data.
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
[database-design.md](database-design.md) and
[../HUONG_DAN_LAP_MACH_THEO_THU_TU.md](../HUONG_DAN_LAP_MACH_THEO_THU_TU.md)
for the exact contracts and physical safety gates.
