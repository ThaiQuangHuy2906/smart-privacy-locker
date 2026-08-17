# Firmware automated tests

The native environments cover Phase 1 command behavior, Phase 2 door debounce
and the Phase 3 alarm controller without an ESP32 or live broker:

- valid command fields and allowed actions;
- malformed versus correlatable invalid messages;
- locker/action/staleness validation;
- bounded future-time validation when the clock is synchronized;
- duplicate ACK replay that preserves the original state; and
- cold-boot `UNKNOWN` lock state;
- CB1 boot `UNKNOWN`, exact debounce boundary, bounce suppression, wrap-safe timing, and stable OPEN/CLOSED mapping; and
- CB3 active-high/active-low output, safe boot, idempotent ON/OFF and missing-writer behavior; and
- wrap-safe MQTT heartbeat scheduling.

Run it from `firmware/`:

```powershell
pio test -e native
```

The 2026-08-17 rerun result is 20/20. The fixtures use UUIDs reserved for tests
and no credentials. OLED/DHT22 display, MC-38-to-Telegram, ten WS2812 pixels and
SG90 close/open travel have individual user-observed results, but they are not
a synchronized release test. A real ESP32, broker, phone, GPIO26 buzzer,
measured power distribution, direct-arm door load, reconnect/full-load and E2E
trace remain mandatory before final release/demo. There is no mechanical latch
in the current as-built product; SG90 directly closes/opens the door. See
[../../tests/test-plan.md](../../tests/test-plan.md),
[../../hardware/power-budget.md](../../hardware/power-budget.md) and
[../../HUONG_DAN_TEST_END_TO_END.md](../../HUONG_DAN_TEST_END_TO_END.md).
