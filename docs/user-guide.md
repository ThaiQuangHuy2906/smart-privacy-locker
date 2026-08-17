# Smart Privacy Locker user guide

> Current audit status (2026-08-17): state-label, pending-spinner,
> startup-retry and auth-mode corrections pass automated and Chrome/CDP checks.
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
4. Use the close/open controls for the SG90. The protocol keeps
   `LOCK`/`UNLOCK` for compatibility, but the UI states that the as-built arm directly
   closes at `170°` and opens at `80°`; there is no separate latch or position
   feedback. Confirm the physical door with MC-38 rather than relying on the
   servo ACK alone.
5. Use **Kiểm tra còi** or **Tắt còi**. HTTP acceptance displays a waiting
   state; only the correlated ESP32 ACK changes the confirmed alarm state.
6. Select 7 or 30 days and press **Cập nhật dữ liệu**. Recent events use
   friendly Vietnamese labels and the locker's saved local date/time instead of raw protocol
   enums. Empty days remain visible as zero buckets and the chart states
   explicitly when the selected period has no opening or alert. A failed
   backend request shows an error, not zero.
   History and chart are independent: if one request fails, the valid result
   from the other panel remains visible.
   Owner-protected history, chart and settings remain available when the ESP32
   is offline; only physical controls require fresh live state.
7. To receive Telegram alerts, press **Liên kết Telegram**. The Dashboard opens
   the correct bot with a one-time link; press **Start** in that private chat,
   return to the Dashboard and wait for **Đã liên kết**. You never need to find
   or type a Chat ID. Use **Gửi tin nhắn thử** to verify the destination, or
   **Ngắt liên kết** before moving the locker to another account. The Telegram
   switch becomes available only after a valid link. For daily email, enable
   the email channel, enter the intended address, choose local time/timezone,
   then save. That timezone also governs history boundaries, chart dates and
   grounded history questions.
8. Use the chatbot for the supported live/history questions. It summarizes
   trusted cache/database facts; it does not control hardware.

Protocol enums are translated into plain Vietnamese while support logs and API
responses keep canonical values. Public configuration retries every five
seconds with authentication disabled until recovery; no-data/stale actuator
cards are unknown; pending buttons show a visible spinner. If a deployed page
still shows a raw enum or the older behavior, verify that the regenerated
FlowFuse artifact and browser cache match the current source.

Use the API/MQTT timestamp and device freshness when diagnosing state.
If the page reports stale/offline state, do not repeatedly send commands. Wait
for recovery/full state or ask the operator to inspect the deployment using
the [troubleshooting guide](troubleshooting.md).

Before installing hardware, follow [the BOM](../hardware/bom.md),
[the power budget](../hardware/power-budget.md) and the single canonical
[assembly guide](../HUONG_DAN_LAP_MACH_THEO_THU_TU.md); the Dashboard cannot
prove electrical safety. After assembly, execute
[the run guide](../HUONG_DAN_CHAY_HE_THONG.md) and the complete
[E2E guide](../HUONG_DAN_TEST_END_TO_END.md).
