# Firmware automated tests

The native environments cover Phase 1 command behavior, Phase 2 door debounce
and the Phase 3 alarm controller without an ESP32 or live broker:

- valid command fields and allowed actions;
- malformed versus correlatable invalid messages;
- locker/action/staleness validation;
- duplicate ACK replay that preserves the original state; and
- cold-boot `UNKNOWN` lock state;
- CB1 boot `UNKNOWN`, exact debounce boundary, bounce suppression, wrap-safe timing, and stable OPEN/CLOSED mapping; and
- CB3 active-high/active-low output, safe boot, idempotent ON/OFF and missing-writer behavior.

Run it from `firmware/`:

```powershell
pio test -e native
```

The recorded result is 17/17. The fixtures use UUIDs reserved for tests and no
credentials. A real ESP32, broker, phone, servo, MC-38, DHT22, OLED, LED,
buzzer, exact power distribution and mechanical latch remain mandatory
`DEFERRED — HARDWARE-FINAL-GATE` verification before final release/demo. See
`tests/test-plan.md`, `hardware/bom.md` and `hardware/power-budget.md`.
