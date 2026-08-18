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
- wrap-safe MQTT heartbeat scheduling; and
- local CLOSED→OPEN alarm policy, bounded FIFO door outbox, wrap-safe grant
  expiry, observed-open-only auto-lock arming and cancellation of any in-flight
  latch movement.

Run it from `firmware/`:

```powershell
pio test -e native
```

The final 2026-08-18 auto-lock rerun result is 28/28. The fixtures use UUIDs reserved for tests
and no credentials. OLED/DHT22 display, MC-38-to-Telegram, ten WS2812 pixels and
SG90 close/open travel have individual user-observed results, but they are not
a synchronized release test. A real ESP32, broker, phone, GPIO26 buzzer,
reconnect and E2E trace remain manual before final release/demo. P1-05 power
measurement is an accepted demo-only risk, not a measured PASS. The current
as-built SG90 is a rotating latch with no angle feedback. See
[../../tests/test-plan.md](../../tests/test-plan.md),
[../../hardware/power-budget.md](../../hardware/power-budget.md) and
[../../HUONG_DAN_TEST_END_TO_END.md](../../HUONG_DAN_TEST_END_TO_END.md).
