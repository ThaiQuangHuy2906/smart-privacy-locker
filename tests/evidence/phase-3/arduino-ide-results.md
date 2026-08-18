# Arduino IDE conversion evidence — 2026-08-14; revalidated 2026-08-18

## Scope and environment

- Source: current local `develop` working tree; no commit was created.
- Arduino IDE: 2.3.10.
- Arduino CLI bundled with the IDE: 1.5.1.
- Isolated profile target: `esp32:esp32` 2.0.17, `ESP32 Dev Module`.
- Profile board options: upload 921600, CPU 240 MHz, flash 40 MHz/DIO,
  4 MB/default partition, Core Debug Level Info, PSRAM disabled.
- The machine originally had global ESP32 core 3.3.11. It was intentionally
  replaced with 2.0.17 for the requested Arduino IDE demo workflow; this is
  reversible in Boards Manager but may affect other ESP32 sketches.
- Arduino IDE Sketchbook: `C:\ArduinoSketches` (ASCII-only path).
- Local configuration/credentials were copied only to ignored paths and were
  not printed in command output.

## P1-A01B — source parity and Arduino profile build

Commands actually run from the repository:

```powershell
.\arduino\sync-sketch.ps1 -IncludeLocalConfig
.\arduino\sync-sketch.ps1 -Check
.\arduino\verify-sketch.ps1
```

Result: **PASS**.

- 32 production `.cpp`/`.h` source files matched the `firmware/` source of
  truth byte-for-byte by SHA-256 comparison.
- The sketch compiled directly from the repository path containing Vietnamese
  characters.
- Program storage after the auto-lock correction: 1,112,269 / 1,310,720 bytes (84%).
- Global variables: 53,608 / 327,680 bytes (16%).
- No compiler error was ignored.

The profile build automatically used the versions pinned in
`arduino/SmartPrivacyLocker/sketch.yaml`, including ArduinoJson 7.4.2,
PubSubClient 2.8.0, WiFiManager 2.0.17, ESP32Servo 3.0.7, DHT sensor library
1.4.6, Adafruit Unified Sensor 1.1.15, Adafruit SSD1306 2.5.15, Adafruit GFX
Library 1.12.1, Adafruit BusIO 1.17.4 and Adafruit NeoPixel 1.12.5.

## P1-A01C — Arduino IDE global environment

The Arduino IDE global environment was prepared with:

```powershell
.\arduino\setup-arduino-ide.ps1
.\arduino\verify-arduino-ide.ps1
```

Result: **HISTORICAL PASS BEFORE AUTO-LOCK; NOT RERUN FOR THE CURRENT SOURCE**.

- Global Arduino-ESP32 core: 2.0.17.
- Every listed direct/transitive library matched the release versions. Because
  installing SSD1306 selected a newer compatible GFX transitively, setup pins
  Adafruit GFX Library 1.12.1 again as its final step.
- Historical GUI-equivalent program storage: 1,111,201 / 1,310,720 bytes (84%).
- Historical GUI-equivalent global variables: 53,600 / 327,680 bytes (16%).
- Current source is verified by the byte-identical 32-file mirror and isolated
  pinned profile above; do not cite these older GUI numbers as the current binary.
- The earlier Unicode library-discovery failure from the default OneDrive
  Documents path was avoided by using the Arduino IDE's configured ASCII
  Sketchbook path.

## PlatformIO regression after portability change

Commands actually run against the same source through a temporary ASCII
`subst` drive, removed in the command's `finally` block:

```text
python -X utf8 -m platformio test -e native
python -X utf8 -m platformio run -e esp32dev -t clean
python -X utf8 -m platformio run -e esp32dev
```

Result: **PASS**.

- Native suite: 28/28.
- ESP32 build RAM: 53,580 / 327,680 bytes (16.4%).
- ESP32 build flash: 1,108,145 / 1,310,720 bytes (84.5%).

The application MQTT packet size is now a shared
`RuntimeConfig::MQTT_PACKET_SIZE = 1024`; PubSubClient buffer allocation is
checked at runtime instead of depending on a PlatformIO-only compiler flag.

## Adjacent software regression recheck — 2026-08-18

The existing Node-RED/FlowFuse software gates were rerun after the Arduino IDE
conversion:

```text
npm test
npm run test:simulator
npm run test:broker
npm run audit
npm audit --audit-level=high
npm run build:flowfuse
```

Result: **PASS**.

- Node tests: 177/177; 0 failed, skipped or todo.
- Deterministic simulator: 28 assertions across 22 scenarios.
- Authenticated loopback MQTT broker: 18 assertions.
- Configuration/secret audit: 0 findings.
- Dependency audit: 0 vulnerabilities.
- FlowFuse export regeneration produced deterministic SHA-256
  `c154c9fbd41041667678c04bfc62e0181a87c9601c35d6606d4c801e84af1d37`
  and size 266,041 bytes.

Supabase CLI and Docker were unavailable in the local environment, so the
clean database rebuild and pgTAP migration tests were not rerun. This is the
same explicit local limitation recorded in `automated-results.md`; no database
gate is upgraded to PASS by the checks above.

## Board and isolated buzzer update — 2026-08-15

The earlier observation of only `COM8`/`COM9` Bluetooth ports is superseded:

- Windows detected `USB-SERIAL CH340 (COM4)`, VID/PID `1A86:7523`, with PnP
  status `OK`/`CM_PROB_NONE`.
- Arduino IDE 2.3.10 selected `ESP32 Dev Module` (`esp32:esp32:esp32`) on COM4.
- The IDE's monitor profile was 115200 baud, 8 data bits, no parity, one stop
  bit, RTS/DTR off.
- An isolated buzzer sketch was uploaded after holding `BOOT` during
  `Connecting` and releasing it when writing began. The IDE completed writing
  and hard-reset the board.

User-observed behavior for the LOW-trigger module containing a TMB12A05 buzzer:

1. The diagnostic sketch temporarily used GPIO18, wrote HIGH before setting
   OUTPUT, and left `loop()` empty.
2. With module VCC at 5 V, the buzzer was silent while the ESP32 was in the
   bootloader/writing phase, then sounded again after
   `Hard resetting via RTS pin...`. Pressing `EN` produced a short silent
   interval followed by sound again.
3. Moving module VCC from 5 V to ESP32 `3V3`, with the same inactive sketch,
   made the buzzer remain silent.

Result: **PASS — board detection/upload and isolated inactive state at module
VCC 3V3.** The observation rejects direct VCC 5 V for this prototype wiring;
the selected final signal is GPIO26 through 4.7 kΩ because GPIO18 belongs to
the servo. No meter reading was recorded, so this result does not claim an
exact GPIO voltage or module current.

Still pending: LOW=audible/HIGH=silent cycle at 3.3 V on GPIO26, ten silent
boots, synchronized production firmware, Dashboard `ALARM_ON/OFF` ACK/state,
rail/current/temperature measurements, sensors, servo, LED, MC-38, Wi-Fi portal
and physical combined-load/full-E2E gates. These may not be inferred from the
isolated inactive result.
