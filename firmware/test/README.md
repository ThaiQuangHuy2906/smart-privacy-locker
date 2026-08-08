# Firmware automated tests

The native environments cover Phase 1 command behavior plus Phase 2 door debounce without an ESP32 or live broker:

- valid command fields and allowed actions;
- malformed versus correlatable invalid messages;
- locker/action/staleness validation;
- duplicate ACK replay that preserves the original state; and
- cold-boot `UNKNOWN` lock state.
- CB1 boot `UNKNOWN`, exact debounce boundary, bounce suppression, wrap-safe timing, and stable OPEN/CLOSED mapping.

Run it from `firmware/`:

```powershell
pio test -e native
```

The fixtures use UUIDs reserved for tests and no credentials. A real ESP32, broker, phone, servo, DHT22, OLED, and LED remain mandatory `DEFERRED — HARDWARE-FINAL-GATE` verification before final release/demo; they do not block Phase 1 software review. See `tests/test-plan.md`.
