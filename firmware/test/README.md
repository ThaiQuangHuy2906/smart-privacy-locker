# Firmware automated tests

`test/test_command_contract/test_main.cpp` covers the Phase 1 behavior that does not need an ESP32 or live broker:

- valid command fields and allowed actions;
- malformed versus correlatable invalid messages;
- locker/action/staleness validation;
- duplicate ACK replay that preserves the original state; and
- cold-boot `UNKNOWN` lock state.

Run it from `firmware/`:

```powershell
pio test -e native
```

The fixtures use UUIDs reserved for tests and no credentials. A real ESP32, broker, phone, servo, DHT22, OLED, and LED remain mandatory `DEFERRED — HARDWARE-FINAL-GATE` verification before final release/demo; they do not block Phase 1 software review. See `tests/test-plan.md`.
