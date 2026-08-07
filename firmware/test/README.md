# Firmware automated tests

`native/test_command_contract.cpp` covers the Phase 1 behavior that does not need an ESP32 or live broker:

- valid command fields and allowed actions;
- malformed versus correlatable invalid messages;
- locker/action/staleness validation;
- duplicate ACK replay that preserves the original state; and
- cold-boot `UNKNOWN` lock state.

Run it from `firmware/`:

```powershell
pio test -e native
```

The fixtures use UUIDs reserved for tests and no credentials. A real ESP32, broker, phone, servo, DHT22, OLED, and LED remain mandatory MANUAL HARD-GATE verification; see `tests/test-plan.md`.
