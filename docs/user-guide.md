# Smart Privacy Locker user guide

> Current audit status (2026-08-18): state-label, action-gating, polling,
> startup-retry, auth-mode and exact 320 px reflow corrections pass automated
> and Chrome/CDP checks.
> A stale card is deliberately shown as unknown and controls are disabled; this
> still does not prove a safe physical state without MC-38/visual evidence.

1. Open the deployed Dashboard and sign in with the locker owner's account.
2. Enter or claim the locker code. Controls stay disabled until MQTT, ESP32 and
   fresh full state are all confirmed.
3. Check **Cấu hình Wi-Fi cho tủ** when the device has no usable saved network.
   Restart the nearby locker, join `Locker-Setup` within three minutes, open
   the captive portal (or `192.168.4.1`), select the new Wi-Fi and save. Wait
   for the Wi-Fi status and MQTT/device state to recover. Enter the SSID and
   password only in that local ESP32 portal; the Dashboard never asks for or
   displays either value.
4. Close the door manually before selecting **Khóa ngay**. The protocol keeps
   `LOCK`/`UNLOCK` for compatibility; the as-built servo rotates the latch to
   lock at `80°` and unlock at `170°`. MC-38 confirms only whether the door is
   open/closed, and there is no latch-angle feedback. A lock command is blocked
   while the door is open. Opening the door during either latch movement
   cancels that movement; wait for fresh `CLOSED` before trying again.
5. Select **Mở chốt** while the door is closed and wait for its ACK. That ACK
   grants only the next door opening within 30 seconds. Pull the door open by
   hand; opening consumes the grant. When you push the door closed and MC-38
   confirms a stable close, ESP32 automatically rotates the latch to `80°`
   without waiting for Wi-Fi/MQTT. If you do not open the door, it performs the
   same auto-lock at the exact 30-second deadline. Wait until the Dashboard
   reports `LOCKED` before selecting **Mở chốt** for the next opening. Forcing
   or reopening the door without that new grant is unauthorized and sounds the
   buzzer. Every **Mở chốt** request remains blocked until MC-38 reports a fresh
   `CLOSED`, regardless of the current logical latch state.
6. Use **Bật còi** or **Tắt còi**. HTTP acceptance displays a waiting
   state; only the correlated ESP32 ACK changes the confirmed alarm state.
7. Select 7 or 30 days and press **Cập nhật dữ liệu**. Recent events use
   friendly Vietnamese labels and the locker's saved local date/time instead of raw protocol
   enums. Empty days remain visible as zero buckets and the chart states
   explicitly when the selected period has no opening or alert. A failed
   backend request shows an error, not zero.
   History and chart are independent: if one request fails, the valid result
   from the other panel remains visible.
   Owner-protected history, chart and settings remain available when the ESP32
   is offline; only physical controls require fresh live state.
8. To receive Telegram alerts, press **Liên kết Telegram**. The Dashboard opens
   the correct bot with a one-time link; press **Start** in that private chat,
   return to the Dashboard and wait for **Đã liên kết**. You never need to find
   or type a Chat ID. Use **Gửi tin nhắn thử** to verify the destination, or
   **Ngắt liên kết** before moving the locker to another account. The Telegram
   switch becomes available only after a valid link. For daily email, enable
   the email channel, enter the intended address, choose local time/timezone,
   then save. Each message summarizes the previous local calendar day; opening
   the door today therefore appears in tomorrow's report. The report localizes
   timestamps and activity labels, and notification-delivery events are not
   presented as locker activity. That timezone also governs history boundaries,
   chart dates and grounded history questions.
9. Use the chatbot for the supported live/history questions. It summarizes
   trusted cache/database facts; it does not control hardware.

Protocol enums are translated into plain Vietnamese while support logs and API
responses keep canonical values. Public configuration retries every five
seconds with authentication disabled until recovery; no-data/stale actuator
cards are unknown; pending buttons show one visible, centered spinner only on
the action just requested, while its same-domain counterpart remains disabled.
If a deployed page
still shows a raw enum or the older behavior, verify that the regenerated
FlowFuse artifact and browser cache match the current source.

The live state refreshes every 5 seconds while the tab is visible and every 15
seconds while hidden. These requests are serialized; do not repeatedly click a
control while an ACK is pending. Same-state actions are intentionally disabled
when they would not move hardware or add useful information; closed-door
**Mở chốt** remains the deliberate exception while the latch is already
`UNLOCKED` and the door has not yet opened: it renews the one-time 30-second
grant without moving the servo.

Use the API/MQTT timestamp and device freshness when diagnosing state.
If the page reports stale/offline state, do not repeatedly send commands. Wait
for recovery/full state or ask the operator to inspect the deployment using
the [troubleshooting guide](troubleshooting.md).

For the assembled prototype, use [the BOM](../hardware/bom.md),
[the power budget](../hardware/power-budget.md) and
[the pin map](../hardware/pin-map.md) as the current physical reference; the
Dashboard cannot prove electrical safety. After any wiring or mechanical
change, execute [the run guide](../HUONG_DAN_CHAY_HE_THONG.md) and the complete
[E2E guide](../HUONG_DAN_TEST_END_TO_END.md).
