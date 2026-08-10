# Phase 3 troubleshooting

| Symptom | Check | Safe action |
|---|---|---|
| Alarm command stays pending | MQTT/ESP32 state, matching ACK, timeout diagnostic | Do not auto-repeat; request/reconcile full state |
| Alarm ACK says success but no sound | Module supply, polarity, driver and GPIO26 wiring | Power off; return to P3-M01 hardware verification |
| `DATA_NOT_CONFIGURED` | Backend `SUPABASE_SERVICE_ROLE_KEY` and URL | Restore the secret in the deployment store; never expose it to the browser |
| History/chart unavailable | Migration order, service-role access, owner/locker mapping | Run the adapter/SQL tests and inspect sanitized backend diagnostics |
| Email not sent | Email enabled/address/time/timezone and SMTP variables | Test one controlled report; inspect delivery status without logging password |
| Duplicate report suppressed | Existing locker/channel/report key row | Expected behavior; do not delete production delivery history just to resend |
| Dashboard controls disabled | Session, ownership, MQTT ONLINE and fresh full state | Re-authenticate or wait for the current connection generation to synchronize |

For physical work, disconnect the low-voltage supply before touching wiring.
Do not bypass the driver/power checks and do not connect this project to mains.
