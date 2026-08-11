# Smart Privacy Locker user guide

1. Open the deployed Dashboard and sign in with the locker owner's account.
2. Enter or claim the locker code. Controls stay disabled until MQTT, ESP32 and
   fresh full state are all confirmed.
3. Check **Cấu hình Wi-Fi cho tủ** when the device has no usable saved network.
   Restart the nearby locker, join `Locker-Setup` within three minutes, open
   the captive portal (or `192.168.4.1`), select the new Wi-Fi and save. Wait
   for the Wi-Fi status and MQTT/device state to recover. Enter the SSID and
   password only in that local ESP32 portal; the Dashboard never asks for or
   displays either value.
4. Use **Kiểm tra còi** or **Tắt còi**. HTTP acceptance displays a waiting
   state; only the correlated ESP32 ACK changes the confirmed alarm state.
5. Select 7 or 30 days and press **Cập nhật dữ liệu**. Recent events use
   friendly Vietnamese labels and the locker's saved local date/time instead of raw protocol
   enums. Empty days remain visible as zero buckets and the chart states
   explicitly when the selected period has no opening or alert. A failed
   backend request shows an error, not zero.
   History and chart are independent: if one request fails, the valid result
   from the other panel remains visible.
   Owner-protected history, chart and settings remain available when the ESP32
   is offline; only physical controls require fresh live state.
6. To receive Telegram alerts, press **Liên kết Telegram**. The Dashboard opens
   the correct bot with a one-time link; press **Start** in that private chat,
   return to the Dashboard and wait for **Đã liên kết**. You never need to find
   or type a Chat ID. Use **Gửi tin nhắn thử** to verify the destination, or
   **Ngắt liên kết** before moving the locker to another account. The Telegram
   switch becomes available only after a valid link. For daily email, enable
   the email channel, enter the intended address, choose local time/timezone,
   then save. That timezone also governs history boundaries, chart dates and
   grounded history questions.
7. Use the chatbot for the supported live/history questions. It summarizes
   trusted cache/database facts; it does not control hardware.

Protocol enums such as `CONNECTED`, `UNKNOWN` and `LOCKED` are translated into
plain Vietnamese on screen; support logs and API responses keep the canonical
enum values. If the page reports stale/offline state, do not repeatedly send commands. Wait
for recovery/full state or ask the operator to inspect the deployment using the
troubleshooting guide.

Before installing hardware, follow `hardware/bom.md`,
`hardware/power-budget.md`, `hardware/wiring-diagram/phase-1-wiring.md` and
`hardware/assembly-guide.md`; the Dashboard cannot prove electrical safety.
