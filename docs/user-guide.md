# Phase 3 user guide

1. Open the deployed Dashboard and sign in with the locker owner's account.
2. Enter or claim the locker code. Controls stay disabled until MQTT, ESP32 and
   fresh full state are all confirmed.
3. Use **Test Alarm** or **Stop Alarm**. HTTP acceptance displays pending; only
   the correlated ESP32 ACK changes alarm state to ACTIVE/INACTIVE.
4. Select 7 or 30 days and press **Tải lịch sử / biểu đồ**. Empty days remain
   visible as zero buckets. A failed backend request shows an error, not zero.
5. Load notification settings before editing them. Enable Telegram/email only
   with the intended destination, choose local time/timezone, then save.
6. Use the chatbot for the supported live/history questions. It summarizes
   trusted cache/database facts; it does not control hardware.

If the page reports stale/offline state, do not repeatedly send commands. Wait
for recovery/full state or ask the operator to inspect the deployment using the
troubleshooting guide.
