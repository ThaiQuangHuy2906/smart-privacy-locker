# Automated evidence — Phase 1

**Recorded:** 2026-08-07 (local execution environment)

**Source tested:** current `firmware/` tree on branch `phase/1-huy-firmware-foundation`
**Secret exposure:** none; examples contain only `replace_me` and test UUIDs.

## Toolchain

- Python: `C:\Program Files\Python314\python.exe`
- PlatformIO Core: `6.1.18`
- Target: PlatformIO `espressif32@6.10.0`, `esp32dev`, Arduino framework
- Target framework package resolved by PlatformIO: `framework-arduinoespressif32 3.20017.241212+sha.dcc1105b`

PlatformIO 6.1.18 failed when invoked from this repository's Windows path containing Vietnamese characters (`Năm`, `Vật lý`): it reported `Nothing to build` and raised `UnicodeEncodeError` in console output. The same unmodified firmware source was copied to an ASCII-only temporary path and commands were invoked using `python -X utf8 -m platformio`. This is an environment/tooling path limitation, not a pass from the original path; the workaround is documented in `firmware/README.md`.

## P1-A02 / P1-A03 / P1-A04 — native contract suite

Command actually run from an ASCII-only temporary copy:

```text
python -X utf8 -m platformio test -e native
```

Result: **PASS**, 7/7 in 4.039 seconds.

```text
test_valid_command_has_expected_consumer_fields                         PASSED
test_malformed_json_has_no_correlatable_ack_id                          PASSED
test_missing_action_with_valid_id_can_be_correlated_as_error            PASSED
test_invalid_action_and_locker_are_rejected_without_actuation           PASSED
test_stale_command_is_rejected_only_when_clock_is_synced                PASSED
test_cached_ack_replays_original_state_with_duplicate_true              PASSED
test_cold_boot_state_does_not_claim_lock_position                       PASSED
```

The fixtures use literal valid/invalid JSON and independently calculated stale time (`2026-08-07T08:00:00Z + 121 seconds`) rather than calling production serialization to build expected input. Mutation targets: accept invalid action/locker, publish an ID for malformed JSON, disable stale check after sync, remove `duplicate:true`, or initialize cold-boot lock as `LOCKED`; at least one listed test fails for each behavior.

## P1-A01 — clean target build

Commands actually run from the same ASCII-only temporary copy:

```text
python -X utf8 -m platformio run -e esp32dev -t clean
python -X utf8 -m platformio run -e esp32dev
```

Result: **PASS**. The clean target finished with exit 0 in 1.144 seconds; the clean target build finished with exit 0 in 42.886 seconds.

Resolved project dependencies observed in the successful build:

```text
ArduinoJson 7.4.2
PubSubClient 2.8.0
WiFiManager 2.0.17
ESP32Servo 3.0.7
DHT sensor library 1.4.6
Adafruit Unified Sensor 1.1.15
Adafruit SSD1306 2.5.15
Adafruit GFX Library 1.12.1
Adafruit NeoPixel 1.12.5
```

Size report from the successful build:

```text
RAM:   16.1% (used 52900 bytes from 327680 bytes)
Flash: 83.7% (used 1097373 bytes from 1310720 bytes)
```

No compiler error or warning was ignored. Flash headroom is approximately 16.3% in the default Arduino partition; it is recorded as a known sizing constraint for later phases, not a completed hardware test.

## Manual test availability check

At evidence time, PlatformIO and Windows detected only Bluetooth virtual ports `COM8` and `COM9`; no ESP32 serial device and no local MQTT broker process were available. Therefore P1-M01 through P1-M11 have not been run, no manual checkbox is ticked, and Phase 1 remains `ACTIVE`.
