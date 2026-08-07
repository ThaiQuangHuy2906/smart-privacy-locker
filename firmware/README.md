# ESP32 firmware — Phase 1

This is a PlatformIO project for the ESP32 Dev Module profile `esp32dev`. It is intentionally limited to the firmware foundation plus CB2, YC1, YC3, and YC12.

## Pinned toolchain

| Component | Pinned version |
|---|---:|
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
| Adafruit NeoPixel | `1.12.5` |

`esp32dev` is the official PlatformIO board identifier for the generic ESP32 Dev Module. PlatformIO's documented configuration supports pinning a specific Espressif platform version, and its Unity runner supports the native tests used here. See [PlatformIO board documentation](https://docs.platformio.org/en/latest/boards/espressif32/esp32dev.html), [platform version pinning](https://docs.platformio.org/en/latest/platforms/espressif32.html), and [Unity test runner documentation](https://docs.platformio.org/en/stable/advanced/unit-testing/frameworks/unity.html).

## Local configuration and secrets

1. Copy `include/secrets.example.h` to `include/secrets.h`.
2. Change the MQTT host, username, password, and—only for a remote/TLS broker—the CA PEM string in the ignored copy.
3. Do **not** put Wi-Fi credentials in a header. WiFiManager receives them in the captive portal and writes them to ESP32 NVS.
4. Leave `secrets.h` ignored. Before committing, run the secret scan in `tests/test-plan.md`.

The committed examples intentionally use `replace_me`. The firmware suppresses MQTT connection attempts until non-placeholder credentials exist. It never prints these values. With `MQTT_USE_TLS=true`, a non-placeholder CA certificate is also required; the code never calls `setInsecure()`.

`include/app_config.example.h` holds safe default behavior. An ignored `include/app_config.h` may override it for local calibration, for example `LOCK_ANGLE`, `UNLOCK_ANGLE`, `OLED_I2C_ADDRESS` (default `0x3C`), `WS2812_PIXEL_COUNT`, or brightness. The OLED address remains a hardware verification item; a compiled default is not evidence that a particular module uses that address.

## Build and test

From this directory:

```powershell
python -m platformio test -e native
python -m platformio run -e esp32dev -t clean
python -m platformio run -e esp32dev
```

PlatformIO Core 6.1.18 in the recorded environment fails to discover/build tests from a Windows path containing Vietnamese characters. If that happens, copy only this `firmware/` directory to a temporary ASCII-only path before running the same commands. The temporary `.pio` output is ignored and must not be copied back:

```powershell
$buildRoot = 'C:\Temp\smart-privacy-locker-phase1-build-local'
New-Item -ItemType Directory -Path $buildRoot
Copy-Item -LiteralPath '<repository>\firmware' -Destination $buildRoot -Recurse
Set-Location "$buildRoot\firmware"
$env:PYTHONUTF8 = '1'
python -X utf8 -m platformio test -e native
python -X utf8 -m platformio run -e esp32dev -t clean
python -X utf8 -m platformio run -e esp32dev
```

The native suite covers contract parser/validation, malformed/correlated error behavior, stale handling, duplicate ACK replay, and cold-boot state. It cannot prove a servo moves correctly, an OLED is wired, a phone opens the portal, or a broker receives an LWT; those remain manual HARD-GATE tests.

## Upload and serial monitor

After completing the power and pin checks in `hardware/`:

```powershell
python -m platformio run -e esp32dev -t upload
python -m platformio device monitor -b 115200
```

The board has no committed Wi-Fi password. On first boot (or when saved Wi-Fi cannot connect), connect a phone to the `Locker-Setup` access point and use the local portal. The portal timeout is 180 seconds to avoid an indefinite portal loop; restart the board or use the local reset procedure below if it expires.

To clear only Wi-Fi configuration, open the USB serial monitor and send a single `R` (or `r`). The firmware invokes WiFiManager's local reset and immediately restarts. This must be performed only when the locker can safely lose connectivity. It does not print saved credentials.

## Runtime behavior

- `loop()` contains no intentional long `delay`; WiFiManager processing, MQTT, DHT polling, OLED refresh, and servo completion run cooperatively.
- MQTT reconnect is bounded from 1 second up to 30 seconds. A broker connection becomes usable only after subscription to `command` succeeds. The firmware then publishes retained `ONLINE` and retained full state before the next MQTT callback can process a command. If subscription is rejected, it sets MQTT state false, publishes retained `OFFLINE` when possible, disconnects, and waits for the bounded retry; it does not publish a false `ONLINE` state.
- PubSubClient publishes at QoS 0. The design therefore uses correlated ACKs, bounded duplicate cache, Node-RED timeout, and `GET_STATE` reconciliation instead of claiming delivery exactly once.
- The servo is **not attached at boot**. `lock=UNKNOWN` remains until a new valid `LOCK` or `UNLOCK` action finishes.
- `ALARM_ON`/`ALARM_OFF` parse as valid shared-contract actions but return a deterministic `ACTUATION_FAILED` ACK. GPIO 26 and CB3 are not configured in Phase 1.
- DHT22 readings are rendered only to OLED. No DHT telemetry topic exists.

The authoritative payload and state rules are [../docs/mqtt-contract.md](../docs/mqtt-contract.md).
