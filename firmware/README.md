# ESP32 firmware — Phase 3 CB3 integration

> Audit snapshot 2026-08-17: native tests pass 20/20 and a clean ESP32 build
> passes at 16.2% RAM/84.3% flash. OLED/DHT22, MC-38, ten WS2812 pixels and SG90
> have individual user-observed results, but GPIO26 active sound, measured
> combined load and final E2E remain open.

This directory is the source of truth and PlatformIO test/build project for the
accepted Phase 1 foundation (CB2, YC1, YC3, YC12), Phase 2 CB1 monitoring, and
Phase 3 CB3 active-buzzer software. The synchronized Arduino IDE sketch is in
`../arduino/SmartPrivacyLocker`. GPIO26 is the control signal. The received
LOW-trigger/TMB12A05 module's inactive path was bench-verified with module VCC
at ESP32 3V3 and a 4.7 kΩ series input resistor; active output, repeated boot
on GPIO26 and combined load remain hardware-final gates.

The as-built SG90 arm directly closes the door at `170°` and opens it at `80°`;
there is no separate latch or servo feedback. `LOCKED`/`UNLOCKED` remain
protocol compatibility enums and describe timed controller completion, not a
measured tamper-resistant lock. MC-38/physical evidence must confirm the door.

Commands are rejected as stale after 120 seconds and, once NTP is plausibly
synchronized, as invalid when more than 30 seconds in the future. The ESP32
publishes a non-retained heartbeat followed by retained full-state refresh every
10 seconds so a healthy quiet device does not become stale at the backend's
30-second boundary. QoS0 can still leave an ambiguous outcome after physical
action: publish failures are logged, but actuators must not be retried
automatically; use timeout/`GET_STATE` reconciliation and preserve diagnostics.

## Pinned toolchain

| Component | Pinned version |
|---|---:|
| Arduino IDE used for verification | `2.3.10` |
| Arduino CLI bundled with that IDE | `1.5.1` |
| Arduino-ESP32 core | `2.0.17` |
| PlatformIO Core used for evidence | `6.1.18` |
| PlatformIO Espressif platform | `espressif32@6.10.0` |
| Board/framework | `esp32dev` / Arduino |
| ArduinoJson | `7.4.2` |
| PubSubClient | `2.8.0` |
| WiFiManager | `2.0.17` |
| ESP32Servo | `3.0.7` |
| DHT sensor library | `1.4.6` |
| Adafruit Unified Sensor | `1.1.15` |
| Adafruit SSD1306 | `2.5.15` |
| Adafruit GFX Library | `1.12.1` |
| Adafruit BusIO | `1.17.4` |
| Adafruit NeoPixel | `1.12.5` |

`esp32dev` is the official PlatformIO board identifier for the generic ESP32 Dev Module. PlatformIO's documented configuration supports pinning a specific Espressif platform version, and its Unity runner supports the native tests used here. See [PlatformIO board documentation](https://docs.platformio.org/en/latest/boards/espressif32/esp32dev.html), [platform version pinning](https://docs.platformio.org/en/latest/platforms/espressif32.html), and [Unity test runner documentation](https://docs.platformio.org/en/stable/advanced/unit-testing/frameworks/unity.html).

## Local configuration and secrets

1. Copy `include/secrets.example.h` to `include/secrets.h`.
2. Change the MQTT host, username, password, and—only for a remote/TLS broker—the CA PEM string in the ignored copy.
3. Do **not** put Wi-Fi credentials in a header. WiFiManager receives them in the captive portal and writes them to ESP32 NVS.
4. Leave `secrets.h` ignored. Before committing, run the secret scan in `tests/test-plan.md`.

The committed examples intentionally use `replace_me`. The firmware suppresses MQTT connection attempts until non-placeholder credentials exist. It never prints these values. With `MQTT_USE_TLS=true`, a non-placeholder CA certificate is also required; the code never calls `setInsecure()`.

`runtime_config.h` selects either ignored `include/app_config.h` or the committed `include/app_config.example.h`; it does not layer a partial override on top of the example. For local calibration, copy the full example and edit the ignored copy directly:

```powershell
Copy-Item firmware\include\app_config.example.h firmware\include\app_config.h
```

For example, scan the actual OLED first. The committed default is `OLED_I2C_ADDRESS = 0x3C`; if the module is `0x3D`, change that constant to `0x3D` in the full ignored `app_config.h` copy. Do not include the example and redeclare a constant: that causes a redefinition. The configured default is not hardware verification.

### Upgrade from a Phase 1/2 local config

Phase 3 adds active-buzzer polarity without invalidating an existing ignored
`app_config.h`. `runtime_config.h` supplies the selected active-low project
fallback when an old copy has no Phase 3 field, so a pull remains buildable and
safe for the received LOW-trigger specimen. The tracked example and fallback
both use:

```cpp
#define SPL_BUZZER_ACTIVE_HIGH 0
```

The liveness/future-skew correction also adds two normal `AppConfig` constants.
An existing ignored full-copy config must include them (or be recreated from
the example and recalibrated) before compiling:

```cpp
constexpr uint32_t MQTT_HEARTBEAT_INTERVAL_MS = 10000;
constexpr uint32_t COMMAND_MAX_FUTURE_SKEW_SECONDS = 30;
```

Do not overwrite an ignored calibrated file blindly; merge these constants and
retain the verified OLED address, servo angles, LED count and buzzer polarity.

The 2026-08-15 isolated test observed that VCC 5 V remained audible with an
ESP32 HIGH, while moving module VCC to 3V3 made the same inactive HIGH silent.
The selected prototype wiring is therefore module `VCC→3V3`, `GND→GND`, and
`IN/S/I/O→GPIO26` through 4.7 kΩ. GPIO18 was used only by the diagnostic sketch
and remains allocated to the servo. LOW-at-3V3 sound, repeated safe boot,
Dashboard ACK/state and full-load behavior still require the CB3 hardware gate.

## Arduino IDE mirror

Production changes are made under `src/` and `include/`. Refresh the Arduino
IDE sketch from the repository root, optionally copying the existing ignored
local configuration without printing it:

```powershell
.\arduino\sync-sketch.ps1 -IncludeLocalConfig
.\arduino\sync-sketch.ps1 -Check
```

Open `arduino/SmartPrivacyLocker/SmartPrivacyLocker.ino`. The primary `.ino`
contains dependency includes while `main.cpp` contains `setup()` and `loop()`;
all modules remain visible as Arduino IDE tabs. Do not edit a generated mirror
file as the source of truth. The exact IDE installation, board options, upload
and Serial Monitor steps are in
[../HUONG_DAN_CHAY_HE_THONG.md](../HUONG_DAN_CHAY_HE_THONG.md).

The checked-in `sketch.yaml` provides an isolated reproducible verification
profile. With Arduino IDE 2.3.10 installed, this clean build has been verified:

```powershell
.\arduino\verify-sketch.ps1
```

Recorded result (rechecked 2026-08-17): 1,108,993 of 1,310,720 program bytes
(Arduino CLI reports 84%) and 52,976 of 327,680 global-variable bytes (16%).
This compile result does not replace the physical gates.

The Arduino IDE global environment is prepared with core 2.0.17 and the same
pinned libraries. Its separate GUI-equivalent build can be reproduced with
`.\arduino\verify-arduino-ide.ps1`; the rechecked 2026-08-17 result is
1,108,781 program
bytes (84%) and 52,968 global-variable bytes (16%). A small binary-size
difference between isolated and global packaging is recorded, not hidden;
both compile the same 30 mirrored production source files.

## Build and test

From this directory:

```powershell
python -m platformio test -e native
python -m platformio run -e esp32dev -t clean
python -m platformio run -e esp32dev
```

The native suite succeeds from the repository's current Vietnamese Windows
path. The Xtensa toolchain used by the clean `esp32dev` build can still mangle
that path and then report missing temporary compiler files. If that exact
failure occurs, map the unchanged repository root to an unused ASCII drive
letter for the command, then remove the mapping. From the repository root:

```powershell
$repoRoot = (Resolve-Path '.').Path
if (Test-Path 'R:\') { throw 'Choose an unused drive letter instead of R:' }

subst.exe R: $repoRoot
try {
  Push-Location R:\firmware
  python -m platformio test -e native
  python -m platformio run -e esp32dev -t clean
  python -m platformio run -e esp32dev
}
finally {
  Pop-Location
  subst.exe R: /D
}
```

The recorded native suite covers 20 contract/state tests: command parsing,
stale/future/duplicate behavior, wrap-safe heartbeat timing, door debounce and the CB3 controller's
active-high/active-low, safe-boot and idempotent behavior. A clean ESP32 build
also guards the ESP32Servo 3.0.7 integration: channel `0` returned by
`attach()` is valid, so initialization verifies `attached()` rather than
treating the return value as a boolean. These checks cannot prove a
buzzer/servo moves or sounds, an OLED is wired, or an ESP32 physically
recovers; physical gates remain mandatory before release/demo.

## Upload and serial monitor

The presentation path uses Arduino IDE after completing the power and pin
checks in `hardware/`; follow the exact procedure in
[../HUONG_DAN_CHAY_HE_THONG.md](../HUONG_DAN_CHAY_HE_THONG.md). PlatformIO
upload remains an optional maintenance fallback:

```powershell
python -m platformio run -e esp32dev -t upload
python -m platformio device monitor -b 115200
```

The board has no committed Wi-Fi password. On first boot (or when saved Wi-Fi cannot connect), connect a phone to the `Locker-Setup` access point and use the local portal. The portal timeout is 180 seconds to avoid an indefinite portal loop; restart the board or use the local reset procedure below if it expires.

To clear only Wi-Fi configuration, open the USB serial monitor and send a single `R` (or `r`). The firmware invokes WiFiManager's local reset and immediately restarts. This must be performed only when the locker can safely lose connectivity. It does not print saved credentials.

## Runtime behavior

- `loop()` contains no intentional long `delay`; WiFiManager processing, MQTT, DHT polling, OLED refresh, and servo completion run cooperatively.
- MQTT reconnect is bounded from 1 second up to 30 seconds. With PubSubClient 2.8, a broker connection becomes operational only after the `command` SUBSCRIBE packet is sent successfully by the local transport. That return value is not broker confirmation: the library does not wait for or expose a SUBACK grant/rejection. The firmware then publishes retained `ONLINE` immediately followed by retained full state before the next MQTT callback can process a command. Backend controls require that new-generation state after `ONLINE`. If subscribe or either bootstrap publish fails, firmware repairs retained `OFFLINE` when possible, disconnects, and waits for bounded retry; it does not leave an incomplete bootstrap as ready.
- While connected, every 10 seconds the firmware publishes a non-retained `heartbeat` and then a retained full-state refresh. If either local publish fails it marks MQTT disconnected, attempts retained `OFFLINE`, disconnects and enters the normal bounded retry. Heartbeat does not create periodic `DEVICE_ONLINE` history.
- The application packet limit is `RuntimeConfig::MQTT_PACKET_SIZE = 1024`.
  Startup checks PubSubClient's runtime buffer resize; if allocation fails,
  MQTT connection attempts stay suppressed instead of silently using a
  smaller build-system-dependent buffer.
- PubSubClient publishes at QoS 0. The design therefore uses correlated ACKs, bounded duplicate cache, Node-RED timeout, and `GET_STATE` reconciliation instead of claiming delivery exactly once.
- The servo is **not attached at boot**. `lock=UNKNOWN` remains until a new valid `LOCK` or `UNLOCK` action finishes. When motion starts, the ESP32Servo 3.0.7 result is checked with `attached()` because allocated channel `0` is a valid success result.
- GPIO27 is sampled with `INPUT_PULLUP` through a 50 ms non-blocking stable debounce. Door remains `UNKNOWN` until the first full stable interval. A later stable edge publishes one non-retained `telemetry/door` message and updates retained full state. Unsynchronized telemetry uses `timestamp:null,time_synced:false`.
- `ALARM_ON`/`ALARM_OFF` update GPIO26 through `AlarmController`, return a success ACK only after the state changes, and publish full state `ACTIVE`/`INACTIVE`. `SPL_BUZZER_ACTIVE_HIGH` supports a deployment override; the public project baseline is `0` for the selected module (LOW=active, HIGH=inactive). Setup writes the inactive latch before configuring the output pin to reduce boot glitches.
- DHT22 readings are rendered only to OLED. No DHT telemetry topic exists.

The authoritative payload and state rules are [../docs/mqtt-contract.md](../docs/mqtt-contract.md).

The committed electrical mapping (`LOW` with the reed closed to ground) is a
candidate software configuration. P2-M01/P2-M02 must verify polarity, physical
magnet placement, pull-up, debounce, and retained/non-retained behavior on a
real ESP32/MC-38. A simple two-wire input does not detect a broken wire.
