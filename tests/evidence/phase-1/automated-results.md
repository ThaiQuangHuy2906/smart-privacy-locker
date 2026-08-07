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

## Targeted Phase 1 correctness/documentation patch verification

**Recorded:** 2026-08-07 (local execution environment), after correcting the PubSubClient subscription semantics and local OLED-calibration documentation.

Commands actually run from fresh ASCII-only temporary copies of the patched `firmware/` tree:

```text
python -X utf8 -m platformio test -e native
python -X utf8 -m platformio run -e esp32dev -t clean
python -X utf8 -m platformio run -e esp32dev
```

Results: **PASS**. The native suite passed 7/7 in 5.921 seconds. The clean target completed in 1.170 seconds and the subsequent `esp32dev` build completed in 63.205 seconds with the same RAM/Flash report above. The successful target build compiled `src/mqtt_client.cpp` and `src/display_controller.cpp` after the change.

The native environment intentionally builds only parser/state/ACK source (`platformio.ini` `build_src_filter`) and does not provide Arduino Wi-Fi, PubSubClient, or a live broker. Adding a mock transport seam solely for this patch would change the firmware architecture without proving PubSubClient/broker behavior. Consequently the local/send-level `subscribe()` failure path has no false native assertion: it remains an optional controlled real condition in pending manual HARD-GATE P1-M09. Source inspection of resolved PubSubClient 2.8 showed `subscribe()` returns its local `write()` result and exposes no broker SUBACK grant/rejection, so an ACL rejection is not a firmware-detection assertion. The clean ESP32 build is compile evidence only; it is not a broker or hardware pass.

## Manual test availability check

At evidence time, PlatformIO and Windows detected only Bluetooth virtual ports `COM8` and `COM9`; no ESP32 serial device and no local MQTT broker process were available. This was rechecked during the targeted quality-patch execution with `python -X utf8 -m platformio device list` and a local broker-process check. Therefore P1-M01 through P1-M11 have not been run and no manual checkbox is ticked. Under the current SOFTWARE-FIRST workflow they are `[ ] DEFERRED — HARDWARE-FINAL-GATE`, not PASS or VERIFIED.

## SOFTWARE-GATE re-audit

**Recorded:** 2026-08-07, before Phase 1 handoff for human review.

**Source tested:** the unmodified `firmware/` tree at `8695b3c` (`phase/1-huy-firmware-foundation`), copied to an ASCII-only temporary directory because of the documented Windows-path limitation. No ESP32, module, phone, broker, credential, or simulator was used.

Commands actually run:

```text
python -X utf8 -m platformio test -e native
python -X utf8 -m platformio run -e esp32dev -t clean
python -X utf8 -m platformio run -e esp32dev
```

Results:

- Native contract suite: **PASS**, 7/7 in 7.870 seconds.
- `esp32dev -t clean`: **PASS**, 1.580 seconds.
- Clean `esp32dev` build: **PASS**, 13.075 seconds; RAM 52,900 / 327,680 bytes (16.1%), flash 1,097,373 / 1,310,720 bytes (83.7%).

The audit also inspected the resolved PubSubClient 2.8 source: `subscribe()` returns the local transport `write()` result and does not wait for or expose a broker SUBACK grant. The current firmware, MQTT contract, and documentation use that boundary consistently. P1-S05/P1-S06 remain planned Phase 2 simulator scenarios and are not a circular Phase 1 blocker. P1-M01–P1-M11 remain `[ ] DEFERRED — HARDWARE-FINAL-GATE`; no physical claim is inferred from these results.
