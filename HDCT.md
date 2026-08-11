# Hướng dẫn chi tiết hoàn thiện Smart Privacy Locker khi nhận phần cứng

> Trạng thái áp dụng: Phase 1–3 software đã <code>COMPLETED</code>; dự án đang
> <code>SOFTWARE_COMPLETE</code> nhưng chưa <code>FINAL_RELEASE_READY</code>.
> Tài liệu này là runbook bắt buộc từ lúc nhận linh kiện đến lúc đủ bằng chứng
> phát hành/demo.

## 0. Đọc phần này trước: có phải import và Deploy lại FlowFuse không?

**Có, nếu instance FlowFuse hiện tại được Deploy trước lần audit/sửa lỗi cuối.**
Backend vừa được sửa để không đếm trùng event khi hai trang Supabase chồng lấn
do insert đồng thời. Giao diện có thể nhìn không đổi, nhưng code chạy trong
Function initializer đã đổi, nên chỉ hard refresh trình duyệt là không đủ.

Artefact phải dùng:

- File: [node-red/flows.flowfuse.json](node-red/flows.flowfuse.json)
- SHA-256:
  <code>ee73551fac45c79b8706f0813595c386030e3acd32ed8fb4943f641d9d58afa8</code>
- Kích thước: <code>235945</code> byte
- Inventory đúng: 7 tab, 81 node, 15 HTTP route duy nhất

Lần sửa này:

- **Cần:** thay flow hiện tại bằng <code>flows.flowfuse.json</code> mới và
  Full Deploy.
- **Không cần:** chạy migration Supabase mới, nếu project đã có đủ migration
  hiện hành.
- **Không cần:** flash lại ESP32 chỉ vì lỗi phân trang này; firmware không đổi
  trong lần sửa.
- **Cần:** rotate MQTT credential đã được cảnh báo trong phiên audit, rồi cập
  nhật credential mới ở broker, FlowFuse và file firmware ignored trước khi
  dùng phần cứng.

### 0.1. Cập nhật một instance FlowFuse đang chạy

Không import chồng một bản mới bên cạnh bản cũ. Làm đúng thứ tự:

1. [ ] Mở Node-RED editor của instance hiện tại.
2. [ ] Chọn **Export → all flows → Download** và lưu bản rollback vào nơi
   private.
3. [ ] Nếu tài khoản FlowFuse có **Snapshots**, tạo snapshot tên rõ ràng, ví
   dụ <code>before-hardware-rc-YYYYMMDD-HHMM</code>.
4. [ ] Xác nhận đã có MQTT username/password mới để nhập lại. JSON export của
   project cố ý không chứa các giá trị này.
5. [ ] Xóa đúng các tab Smart Privacy Locker cũ:
   - <code>MQTT - Validation and readiness</code>
   - <code>Control - Auth and commands</code>
   - <code>Security - Unauthorized alerts</code>
   - <code>Assistant - Grounded chatbot</code>
   - <code>Dashboard - API and ownership</code>
   - <code>Data - History and reports</code>
   - <code>Telegram - Account linking</code>
6. [ ] Nếu bản cũ dùng tên <code>P2 1</code>–<code>P2 5</code> và
   <code>P3</code>, xóa đúng các tab project đó, không xóa flow của ứng dụng
   khác.
7. [ ] Sau khi các tab cũ đã được xóa, vào config-node sidebar và xóa các
   config node project không còn được dùng: một <code>mqtt-broker</code>, một
   <code>tls-config</code>, và một node mỗi loại <code>ui-base</code>,
   <code>ui-theme</code>, <code>ui-page</code>, <code>ui-group</code>.
8. [ ] Chọn **Import**, upload
   <code>node-red/flows.flowfuse.json</code>, import thành các flow mới.
9. [ ] Mở config node MQTT duy nhất, nhập lại MQTT username/password mới.
10. [ ] Kiểm tra TLS:
    - Broker Internet phải xác minh certificate.
    - Chỉ upload private CA khi broker dùng private CA.
    - Không dùng chế độ insecure để chữa lỗi certificate.
11. [ ] Kiểm tra đủ environment variables ở Section 4.3.
12. [ ] Chọn **Full Deploy** một lần.
13. [ ] Sau Deploy, xác nhận đúng 7 tab, đúng một config node mỗi loại kể trên
    và 15 HTTP route.
14. [ ] Mở <code>/locker</code> bằng private window hoặc hard reload.
15. [ ] Đăng nhập owner test; kiểm tra history, chart 7/30 ngày, settings và
    chatbot.
16. [ ] Khi ESP32 có mặt, chỉ bật control sau khi Dashboard báo MQTT,
    device ONLINE và fresh full state.
17. [ ] Nếu inventory sai, route trùng hoặc runtime lỗi, dừng ngay và restore
    export/snapshot; không sửa trực tiếp JSON sinh tự động.

Node-RED hỗ trợ import file JSON và export toàn bộ flow; FlowFuse Snapshot có
thể lưu flow, credential, environment, package và runtime settings. Bản snapshot
có credential/environment phải được coi là secret:

- [Node-RED Import/Export](https://nodered.org/docs/user-guide/editor/workspace/import-export)
- [FlowFuse Snapshots](https://flowfuse.com/docs/user/snapshots/)

## 1. “Hoàn thiện 100%” trong tài liệu này nghĩa là gì?

Không có phép thử hữu hạn nào chứng minh một sản phẩm sẽ không bao giờ lỗi.
Trong project này, “hoàn thiện 100%” chỉ được ghi khi **toàn bộ acceptance gate
đã định nghĩa** đều đạt trên cùng một release candidate:

1. [ ] Source và release candidate được xác định bằng commit/build/deploy ID.
2. [ ] Automated tests đều PASS.
3. [ ] P1-M01–P1-M11 đều PASS trên phần cứng thật.
4. [ ] P2-M01/P2-M02 đều PASS với ESP32 và MC-38 thật.
5. [ ] Telegram automatic-link lifecycle còn thiếu đã PASS.
6. [ ] P3-M01–P3-M03 và P3-M07–P3-M12 đều PASS.
7. [ ] E2E-01–E2E-45 đều PASS hoặc automated row có report PASS tương ứng.
8. [ ] Power budget, wiring và pin map đã được đổi từ candidate sang as-built.
9. [ ] Không còn Critical/High defect; mọi defect đã sửa và regression lại.
10. [ ] Không còn secret/PII trong Git, flow, log, ảnh, video hoặc release
    package.
11. [ ] Full demo regression PASS bằng dữ liệu thật, không mock.
12. [ ] Evidence liên kết được tới đúng firmware build, FlowFuse deploy,
    database migration set, phần cứng và người chạy.

Chỉ sau đó mới cập nhật project thành <code>FINAL_RELEASE_READY</code>.

## 2. Quy tắc an toàn bắt buộc

### 2.1. Quy tắc STOP

Dừng cấp nguồn ngay nếu có một trong các dấu hiệu:

- Mùi khét, khói, tiếng nổ nhỏ, linh kiện/dây/jack nóng bất thường.
- Nguồn sai cực, rail vượt giới hạn part, rail sụt mạnh hoặc dao động.
- ESP32 brownout/reboot, MQTT reconnect loop khi actuator hoạt động.
- Servo rung, kẹt, chạm end-stop hoặc nóng.
- OLED/DHT/LED lỗi đồng thời khi servo hoặc buzzer bật.
- Buzzer active ngay lúc boot khi chưa có lệnh.
- Dây trần, connector lỏng hoặc dây bị kẹp bởi cửa/chốt.
- Máy tính có dấu hiệu bị back-feed từ nguồn ngoài.

Sau STOP:

1. Ngắt nguồn thấp áp.
2. Không chạm/sửa dây khi đang cấp điện.
3. Ghi test ID, wiring revision, triệu chứng và thời điểm.
4. Đo lại continuity/polarity khi đã mất điện.
5. Sửa root cause.
6. Chạy lại test bị lỗi và các test liên quan; không đổi expected result để
   hợp thức hóa lỗi.

### 2.2. Quy tắc điện

- Chỉ dùng nguồn **SELV DC 5 V**; project không bao giờ nối trực tiếp vào điện
  lưới.
- ESP32 GPIO là logic 3,3 V; không đưa 5 V trực tiếp vào GPIO.
- Servo, WS2812 và buzzer không lấy dòng từ GPIO hoặc rail 3,3 V của ESP32.
- Nối và xác minh common ground trước khi nối signal.
- Mọi thay đổi wiring phải thực hiện khi đã ngắt nguồn.
- Không đồng thời cấp external 5 V và USB có nguồn nếu tài liệu đúng board
  không xác nhận chống back-feed.
- Khi đo dòng bằng đồng hồ, mắc đúng **nối tiếp** và đúng cổng/range có fuse;
  không đặt đồng hồ ở current mode trực tiếp song song hai cực nguồn. Nếu chưa
  chắc cách đo, phải có người hướng dẫn phòng lab.
- Capacitor không thay thế nguồn, dây hoặc connector thiếu dòng.
- Không cố tình stall servo để đo; nếu linkage vô tình gây stall, ngắt nguồn
  ngay.

Nguồn chi tiết:

- [BOM](hardware/bom.md)
- [Power budget](hardware/power-budget.md)
- [Pin map](hardware/pin-map.md)
- [Wiring baseline](hardware/wiring-diagram/phase-1-wiring.md)
- [Buzzer wiring](hardware/wiring-diagram/phase-3-buzzer-wiring.md)
- [Assembly guide](hardware/assembly-guide.md)

## 3. Stage A — đóng băng release candidate và tạo hồ sơ test

Không bắt đầu hardware test trên source không xác định.

### 3.1. Ghi nhận release candidate

Từ repository root:

~~~powershell
git status --short
git rev-parse HEAD
git diff --check
~~~

Điều kiện:

- [ ] Biết rõ commit nền.
- [ ] Biết rõ local diff nào sẽ thuộc release candidate.
- [ ] Không có file untracked không rõ nguồn gốc.
- [ ] Không có secret trong diff.
- [ ] Không thay source giữa các test mà không tạo build/deploy ID mới.

Nếu working tree còn thay đổi hợp lệ, review và commit theo workflow của nhóm
trước khi gọi đó là release candidate. Không dùng một commit ID cũ để mô tả
binary được build từ working tree khác.

### 3.2. Tạo nơi lưu evidence private

Tạo một thư mục theo mẫu:

~~~text
tests/evidence/private/YYYYMMDD-hardware-rc/
  00-release-record/
  01-parts/
  02-wiring/
  03-p1/
  04-p2/
  05-p3/
  06-e2e/
  07-failures/
  08-final-demo/
~~~

<code>tests/evidence/private/</code> đã được ignore. Không bỏ secret vào
evidence chỉ vì thư mục đang ignored. Bản summary đã sanitize mới được đưa vào
thư mục evidence tracked.

Tạo release record gồm:

| Trường | Giá trị phải ghi |
|---|---|
| Ngày/giờ và timezone | Thời điểm bắt đầu test |
| Tester | Họ tên người chạy |
| Git commit + local diff | Giá trị thật |
| Firmware build ID/hash | Giá trị thật |
| FlowFuse artefact hash | Giá trị thật |
| FlowFuse deploy/snapshot ID | Giá trị thật |
| Supabase project test | Tên/ID đã sanitize |
| Migration cuối | Tên file migration cuối đã áp dụng |
| Locker ID | ID test, không dùng locker production |
| Board | Model/revision/ảnh label |
| Wiring revision | Ví dụ <code>HW-R1</code> |
| Power supply | Model, 5 V rating, polarity |
| Người duyệt kết quả | Thành viên/giảng viên nếu yêu cầu |

## 4. Stage B — xác minh software và dịch vụ trước khi cấp nguồn phần cứng

### 4.1. Chạy lại toàn bộ software gate

Từ <code>node-red/</code>:

~~~powershell
npm ci
npm test
npm run test:simulator
npm run test:broker
npm run audit
npm audit --audit-level=high
npm run build:flowfuse
~~~

Kết quả hiện hành mong đợi:

- [ ] Node: 145/145 PASS.
- [ ] Simulator: 8 assertions/14 scenarios PASS.
- [ ] Broker: 15 assertions PASS.
- [ ] Config/secret audit: 0 finding.
- [ ] Dependency audit: 0 vulnerability.
- [ ] Build FlowFuse thành công.
- [ ] SHA-256 artefact đúng release record.

Từ <code>firmware/</code>:

~~~powershell
python -m platformio test -e native
python -m platformio run -e esp32dev -t clean
python -m platformio run -e esp32dev
~~~

Kết quả hiện hành mong đợi:

- [ ] Native: 17/17 PASS.
- [ ] Clean ESP32 build exit 0.
- [ ] RAM khoảng 16,2% và flash khoảng 84,2%; nếu khác, ghi số thật và điều tra
  thay đổi trước khi tiếp tục.

Nếu Xtensa lỗi vì đường dẫn Windows có tiếng Việt, dùng temporary ASCII drive
theo [firmware/README.md](firmware/README.md); phải gỡ mapping sau khi build.

### 4.2. Supabase

Với database Supabase local sạch:

1. [ ] Xác nhận đây là local development database, không phải remote project.
2. [ ] Chạy reset và pgTAP:

~~~powershell
supabase db reset
supabase test db supabase/tests/phase2_claim_rls.sql
supabase test db supabase/tests/phase3_data_rls.sql
~~~

Không thêm cờ remote/linked vào lệnh reset. Không dùng <code>db reset</code>
để xóa một remote project có dữ liệu.

Với remote development project mới:

1. [ ] Xác nhận đúng project ref và đây không phải production.
2. [ ] Backup dữ liệu cần giữ.
3. [ ] Apply mọi file trong <code>supabase/migrations/</code> theo thứ tự tên
   qua Supabase CLI migration workflow hoặc SQL Editor.
4. [ ] Chạy pgTAP theo môi trường test được nhóm phê duyệt.
5. [ ] Tạo disposable User A/User B và Locker A/Locker B.
6. [ ] Xác nhận owner isolation, wrong-owner deny và correct-owner history.

Với project đang dùng:

- Kiểm tra migration history trước.
- Không chạy lại migration không idempotent.
- Nếu đã có <code>202608110001</code> và <code>202608110002</code>, chỉ bảo đảm
  forward fix <code>202608110003</code> đã áp dụng.
- Lần sửa phân trang hiện tại không thêm migration mới.
- Rollback app ưu tiên restore FlowFuse cũ; không drop bảng/index/evidence để
  rollback nhanh.

Chi tiết: [supabase/README.md](supabase/README.md).
Theo Supabase CLI hiện hành, <code>supabase db reset</code> mặc định reset local
database; thêm <code>--linked</code> hoặc <code>--db-url</code> có thể reset
remote và phá hủy dữ liệu. Với remote project, ưu tiên kiểm tra migration
history, preview rồi chỉ push pending migrations:

~~~powershell
supabase migration list
supabase db push --dry-run
supabase db push
~~~

Chỉ chạy các lệnh remote sau khi đã xác nhận đúng project ref và có backup:

- [Supabase local/remote migration workflow](https://supabase.com/docs/guides/local-development/cli-workflows)
- [Supabase database testing](https://supabase.com/docs/guides/database/testing)

### 4.3. FlowFuse environment

Xác nhận đủ các biến sau trước Full Deploy:

| Nhóm | Biến |
|---|---|
| Locker/MQTT | <code>LOCKER_ID</code>, <code>MQTT_HOST</code>, <code>MQTT_PORT</code> |
| Runtime | <code>COMMAND_TIMEOUT_MS</code>, <code>AUTHORIZED_UNLOCK_WINDOW_SECONDS</code>, <code>DEVICE_STALE_AFTER_SECONDS</code>, <code>DASHBOARD_BASE_URL</code> |
| Supabase | <code>SUPABASE_URL</code>, <code>SUPABASE_ANON_KEY</code>, <code>SUPABASE_SERVICE_ROLE_KEY</code> |
| Telegram | <code>TELEGRAM_BOT_TOKEN</code>, <code>TELEGRAM_BOT_USERNAME</code>, <code>TELEGRAM_WEBHOOK_SECRET</code> |
| Gemini | <code>GEMINI_API_KEY</code>, <code>GEMINI_MODEL</code> |
| Time/email | <code>REPORT_TIMEZONE</code>, <code>GMAIL_SMTP_HOST</code>, <code>GMAIL_SMTP_PORT</code>, <code>GMAIL_SMTP_USER</code>, <code>GMAIL_APP_PASSWORD</code>, <code>EMAIL_FROM</code> |

Quy tắc:

- <code>SUPABASE_SERVICE_ROLE_KEY</code>, Telegram token và SMTP password chỉ
  ở backend secret store.
- Browser chỉ nhận Supabase URL/anon key và owner-scoped response.
- MQTT username/password nằm trong MQTT config-node credential fields, không
  nằm trong flow JSON.
- Node-RED dùng credential riêng có publish + subscribe
  <code>locker/+/#</code>.
- ESP32 dùng credential riêng chỉ có quyền
  <code>locker/LOCKER-001/#</code>, thay ID bằng locker thật.
- <code>LOCKER_ID</code> ở FlowFuse, Supabase locker, MQTT ACL và firmware phải
  giống tuyệt đối.

### 4.4. Smoke sau FlowFuse Deploy

Chỉ tiếp tục hardware khi toàn bộ mục sau đạt:

- [ ] <code>GET /locker</code> trả Dashboard mới.
- [ ] Hard reload/private window hiển thị giao diện đúng.
- [ ] Login/logout hoạt động.
- [ ] Owner load history, chart 7/30 và notification settings được.
- [ ] Wrong owner bị deny.
- [ ] History/chart vẫn đọc được khi device offline.
- [ ] Không có route trùng.
- [ ] Runtime log không có <code>RUNTIME_STARTING</code> kéo dài,
  <code>DATA_NOT_CONFIGURED</code> hoặc lỗi module.
- [ ] MQTT config dùng credential đã rotate và TLS đúng.
- [ ] Không có secret trong browser Network response/log.

## 5. Stage C — kiểm nhận linh kiện ngay khi nhận hàng

Không cắm điện ngay. Trải linh kiện trên mặt bàn cách điện, phân loại và chụp
ảnh label.

### 5.1. Kiểm kê

Đối chiếu [hardware/bom.md](hardware/bom.md):

- [ ] ESP32 DevKit đúng MCU/profile <code>esp32dev</code>.
- [ ] Nguồn regulated SELV 5 V, candidate tối thiểu 3 A.
- [ ] Công tắc, terminal/distribution, fuse/polyfuse và dây đủ rating.
- [ ] SG90-class servo có thông số voltage và stall current.
- [ ] DHT22/AM2302 rõ bare sensor hay module, biết pull-up.
- [ ] OLED SSD1306 biết voltage, I2C pull-up và địa chỉ dự kiến.
- [ ] WS2812 exact part, số pixel và datasheet.
- [ ] 74AHCT125 hoặc 74HCT14 đúng logic family.
- [ ] Điện trở data 330–470 ohm.
- [ ] Tụ WS2812 470–1000 µF, đúng polarity/rating.
- [ ] MC-38 là dry contact.
- [ ] Active buzzer/module có voltage, current, active polarity.
- [ ] Driver/MOSFET/transistor phù hợp nếu buzzer không phải logic-input
  3,3 V.
- [ ] Dây, connector, cách điện, strain relief.
- [ ] Đồng hồ đo còn fuse/que đo tốt.

Reject hoặc tạm dừng part nếu model/điện áp/dòng/polarity không xác định.
Không dùng thông số của một clone khác để thay datasheet part thực.

### 5.2. Ghi as-received record

Với mỗi part, ghi:

- Manufacturer/model/revision/marking.
- Seller/source.
- Primary datasheet URL.
- Quantity.
- Rated voltage.
- Normal/max/transient/stall current.
- Logic thresholds/pull-up.
- Kết quả continuity/polarity khi chưa cấp nguồn.
- Ảnh label.
- Trạng thái: Accepted / Rejected / Needs clarification.

### 5.3. Hoàn tất power budget trước wiring

Điền [hardware/power-budget.md](hardware/power-budget.md):

1. [ ] Copy normal/max/peak current từ datasheet đúng part.
2. [ ] Tính simultaneous peak.
3. [ ] Continuous supply rating đạt ít nhất
   <code>1.25 × maximum continuous load</code>.
4. [ ] Supply/connector/switch/protection/wire chịu được peak.
5. [ ] Xác định topology USB/external power không back-feed.
6. [ ] Nếu không đạt, đổi nguồn hoặc giảm tải đã xác minh trước khi nối.

Nguồn 5 V/3 A chỉ là candidate, không phải bằng chứng đủ dòng.

## 6. Stage D — chuẩn bị cấu hình firmware

### 6.1. Tạo local config nếu chưa có

Không overwrite file local đang có mà chưa backup:

~~~powershell
if (-not (Test-Path firmware/include/secrets.h)) {
  Copy-Item firmware/include/secrets.example.h firmware/include/secrets.h
}
if (-not (Test-Path firmware/include/app_config.h)) {
  Copy-Item firmware/include/app_config.example.h firmware/include/app_config.h
}
~~~

Hai file này phải tiếp tục ignored. Không paste nội dung vào chat, commit, ảnh
hoặc log.

### 6.2. Đồng bộ cấu hình giữa các hệ

| Giá trị | Nơi cấu hình | Điều kiện |
|---|---|---|
| Locker ID | Firmware, FlowFuse, Supabase, MQTT ACL | Giống tuyệt đối |
| MQTT host/port | Firmware secret/app config, FlowFuse | Đúng broker test |
| MQTT TLS | <code>MQTT_USE_TLS</code>, CA, FlowFuse TLS | Remote broker phải verify |
| Servo | <code>LOCK_ANGLE</code>, <code>UNLOCK_ANGLE</code>, <code>SERVO_SETTLE_MS</code> | Đo no-load rồi có tải |
| OLED | <code>OLED_I2C_ADDRESS</code> | Dựa trên scan thật |
| LED | <code>WS2812_PIXEL_COUNT</code>, <code>WS2812_BRIGHTNESS</code> | Dựa part và power budget |
| MC-38 | <code>MC38_CLOSED_LEVEL_HIGH</code> | Dựa continuity/mount thật |
| Buzzer | <code>SPL_BUZZER_ACTIVE_HIGH</code> | Dựa module/driver thật |
| Timezone | FlowFuse setting và locker notification setting | Dùng timezone demo thống nhất |

Candidate mặc định:

- Servo signal GPIO18.
- DHT22 GPIO4.
- OLED SDA GPIO21, SCL GPIO22.
- WS2812 data GPIO25.
- Buzzer control GPIO26.
- MC-38 GPIO27 với <code>INPUT_PULLUP</code>.
- Lock angle 15°, unlock angle 95°.
- OLED 0x3C.
- Một pixel, brightness 32/255.
- MC-38 candidate LOW = CLOSED.
- Buzzer candidate active-high.

Các giá trị trên **không phải kết quả đo**. Nếu thay đổi local config, clean
build và flash lại; ghi build mới vào release record.

## 7. Stage E — bring-up ESP32 một mình

1. [ ] Ngắt toàn bộ peripheral và nguồn tải.
2. [ ] Đối chiếu board label với GPIO thật; đặc biệt không nhầm VIN/5V, 3V3,
   GND.
3. [ ] Kiểm tra USB cable có data.
4. [ ] Dùng USB theo topology board cho phép; chưa nối external 5 V.
5. [ ] Clean build release candidate.
6. [ ] Upload:

~~~powershell
cd firmware
python -m platformio run -e esp32dev -t upload
python -m platformio device monitor -b 115200
~~~

7. [ ] Xác nhận boot ổn định, không brownout/reboot loop.
8. [ ] Xác nhận log không in MQTT/Wi-Fi credential.
9. [ ] Nếu chưa có Wi-Fi, dùng điện thoại nối AP
   <code>Locker-Setup</code>, nhập Wi-Fi test trong portal cục bộ.
10. [ ] Xác nhận log <code>Wi-Fi connected</code>.
11. [ ] Xác nhận MQTT retained availability <code>ONLINE</code> và full state
    xuất hiện ở đúng locker topic.
12. [ ] Xác nhận cold boot state: lock <code>UNKNOWN</code>, alarm
    <code>INACTIVE</code>, LED <code>OFF</code>, door <code>UNKNOWN</code>
    trước stable sample.

PASS khi board chạy ổn định, Wi-Fi/MQTT hoạt động và không có output pin/load
ngoài ý muốn. Nếu board không đúng profile hoặc rail không đúng, STOP.

## 8. Stage F — lắp từng module theo thứ tự

Mỗi module phải đạt test riêng trước khi nối module tiếp theo. Mỗi lần đổi dây:
ngắt nguồn, chụp wiring revision mới, kiểm tra continuity/polarity rồi mới cấp
nguồn.

### 8.1. OLED SSD1306

1. [ ] Xác nhận breakout chạy 3,3 V hoặc có level shifter phù hợp.
2. [ ] Khi mất điện, kiểm tra SDA/SCL không bị pull-up lên 5 V.
3. [ ] Nối VCC 3,3 V, GND, SDA GPIO21, SCL GPIO22.
4. [ ] Dùng I2C scanner đã xác minh để tìm address; ghi address thật.
5. [ ] Nếu address khác 0x3C, sửa
   <code>OLED_I2C_ADDRESS</code> trong full local
   <code>app_config.h</code>, rebuild và flash lại release candidate.
6. [ ] Boot firmware; không còn <code>OLED initialization failed</code>.
7. [ ] Xác nhận OLED hiển thị và không flicker/reboot.
8. [ ] Sau scanner tạm thời, luôn flash lại đúng release firmware trước khi
   ghi evidence.

### 8.2. DHT22

1. [ ] Xác nhận part hỗ trợ 3,3 V.
2. [ ] Nếu module không có pull-up, nối 4,7–5,1 kΩ từ DATA đến 3,3 V.
3. [ ] Không để DATA bị kéo lên 5 V.
4. [ ] Nối DATA GPIO4, cable ban đầu không quá 1 m.
5. [ ] Chờ nhiều chu kỳ 2,5 giây.
6. [ ] Xác nhận nhiệt độ/độ ẩm hợp lý và tiếp tục cập nhật trên OLED.
7. [ ] Test lỗi an toàn: power off, tháo DATA/sensor, power on; OLED phải báo
   lỗi nhưng firmware/MQTT vẫn hoạt động.
8. [ ] Power off, lắp lại và xác nhận recovery.
9. [ ] Xác nhận không có DHT topic/card trên Dashboard.

Đây đóng P1-M04/P1-M05 và E2E-09–E2E-11 khi evidence đầy đủ.

### 8.3. WS2812

1. [ ] Xác nhận số pixel và dòng theo exact datasheet.
2. [ ] Cấp WS2812 từ 5 V load branch, không từ GPIO/3,3 V.
3. [ ] Cấp buffer 74AHCT125/74HCT14 đúng 5 V.
4. [ ] Tie mọi enable/input không dùng về mức xác định; không để floating.
5. [ ] GPIO25 → buffer → điện trở 330–470 Ω gần DIN → WS2812 DIN.
6. [ ] Đặt tụ 470–1000 µF đúng cực/rating gần pixel.
7. [ ] Xác nhận common ground.
8. [ ] Đặt count/brightness theo power budget.
9. [ ] Dùng owner Dashboard gửi LED ON rồi OFF.
10. [ ] Xác nhận pending → ACK → state đúng, màu/độ sáng ổn định, không reset.
11. [ ] Đo rail/current và ghi lại.

Đây đóng P1-M06 và E2E-08; test phối hợp với servo ở P1-M07 chạy sau.

### 8.4. Servo SG90 — no-load trước, linkage sau

1. [ ] Tháo linkage/chốt; horn không được va vào vật.
2. [ ] Servo lấy 5 V từ load branch riêng, signal GPIO18, common ground.
3. [ ] Đặt phương án emergency power-off trong tầm tay.
4. [ ] Boot; servo không được tự di chuyển.
5. [ ] Dùng Dashboard owner gửi UNLOCK một lần.
6. [ ] Chờ ACK; kiểm tra góc/thời gian/rail.
7. [ ] Gửi LOCK một lần; kiểm tra tương tự.
8. [ ] Nếu góc không đúng, power off, sửa local
   <code>LOCK_ANGLE</code>/<code>UNLOCK_ANGLE</code> và
   <code>SERVO_SETTLE_MS</code>, rebuild/flash rồi thử lại.
9. [ ] Chỉ khi no-load ổn định mới lắp horn/linkage.
10. [ ] Căn linkage khi mất điện; không để servo ép vào end-stop.
11. [ ] Chạy lock/unlock có tải theo số vòng nhóm/giảng viên chấp nhận; ghi
    chính xác số vòng.
12. [ ] Mọi vòng phải không kẹt, không stall, không quá nhiệt, không reset,
    ACK/state đúng.
13. [ ] Xác định chốt tự giữ sau khi firmware detach servo hay cần holding
    torque.
14. [ ] Nếu cơ khí cần holding torque, không tự đổi firmware policy. Dừng,
    thiết kế linkage tự giữ hoặc phê duyệt riêng thay đổi servo policy và power
    budget.
15. [ ] Đo rail lúc start/reverse ở load thật.

Đây đóng P1-M01–P1-M03 và E2E-05/E2E-06 khi đủ evidence.

### 8.5. MC-38

1. [ ] Khi chưa nối ESP32, dùng continuity mode xác định contact khi nam châm
   gần/xa.
2. [ ] Xác nhận MC-38 là dry contact.
3. [ ] Power off.
4. [ ] Nối một đầu GPIO27, một đầu GND; firmware dùng
   <code>INPUT_PULLUP</code>.
5. [ ] Gắn reed trên khung cố định, magnet trên cánh cửa; dây không bị
   kéo/kẹp.
6. [ ] Kiểm tra khoảng cách đóng/mở thực.
7. [ ] Nếu cửa đóng không ánh xạ đúng, sửa
   <code>MC38_CLOSED_LEVEL_HIGH</code>, rebuild/flash và ghi lý do.
8. [ ] Boot và quan sát <code>UNKNOWN</code> trước full stable interval.
9. [ ] Giữ cửa đóng ổn định quá 50 ms; state phải <code>CLOSED</code>.
10. [ ] Mở cửa ổn định; chỉ một transition <code>OPEN</code>.
11. [ ] Rung/toggle nhanh; không được flood transition.
12. [ ] Dùng subscriber mới; retained full state phải có state hiện tại,
    nhưng door transition cũ không được replay.
13. [ ] Không tuyên bố hệ hai dây này phát hiện dây đứt.

Đây đóng P2-M01/P2-M02 và E2E-01–E2E-04.

### 8.6. Active buzzer

1. [ ] Đọc exact module datasheet: supply, current, logic threshold, active
   polarity.
2. [ ] Nếu module không có input logic 3,3 V hoặc dòng tải vượt GPIO, dùng
   driver được tính/chọn và người hướng dẫn lab duyệt.
3. [ ] GPIO26 chỉ nối control input/driver, không cấp dòng buzzer.
4. [ ] Nối load rail đúng rating và common ground.
5. [ ] Power off trước khi đổi <code>SPL_BUZZER_ACTIVE_HIGH</code>.
6. [ ] Đặt macro 1 cho active-high hoặc 0 cho active-low theo phép đo/datasheet.
7. [ ] Rebuild và flash.
8. [ ] Boot/restart nhiều lần; buzzer phải im lặng, alarm
   <code>INACTIVE</code>.
9. [ ] Dùng Dashboard **Kiểm tra còi**; phải pending → ACK →
   <code>ACTIVE</code> và có âm.
10. [ ] Dùng **Tắt còi**; phải ACK → <code>INACTIVE</code> và im.
11. [ ] Kiểm tra nhiệt, âm lượng và thời lượng an toàn cho demo.
12. [ ] Nếu ACK success nhưng không có âm, power off và quay lại kiểm tra
    driver/polarity/supply; không sửa UI để che lỗi.

Đây đóng P3-M01/P3-M02 và E2E-07.

## 9. Stage G — nguồn và full-load

Chạy bằng đúng release firmware và wiring revision cuối.

### 9.1. Đo theo thứ tự tăng tải

Điền từng row trong [hardware/power-budget.md](hardware/power-budget.md):

1. [ ] ESP32 idle, toàn bộ peripheral đã nối.
2. [ ] Wi-Fi + MQTT reconnect.
3. [ ] Servo no-load.
4. [ ] Servo có linkage.
5. [ ] WS2812 ở configured maximum.
6. [ ] Buzzer active.
7. [ ] Servo + LED + buzzer + radio; OLED/DHT vẫn chạy.

Mỗi row ghi:

- 5 V tại nguồn.
- 5 V tại servo/LED.
- Rail 3,3 V.
- Total current.
- Có/không reset/brownout.
- Nhiệt/noise/behavior.
- Serial/MQTT timestamp.

### 9.2. Điều kiện PASS full-load

- [ ] Mọi rail nằm trong operating range của exact part.
- [ ] Không brownout/reset/MQTT loss.
- [ ] Không OLED corruption hoặc DHT error.
- [ ] Không LED flicker bất thường.
- [ ] Không servo chatter/binding.
- [ ] Không buzzer instability.
- [ ] Không connector/dây/driver quá nhiệt.
- [ ] Common-ground voltage drop không làm signal sai.
- [ ] Wire/connector/protection rating có margin.
- [ ] Không back-feed host.

Chỉ khi toàn bộ đạt mới tick P3-M11 và E2E-44.

## 10. Stage H — WiFiManager, MQTT và recovery thật

### 10.1. WiFiManager

1. [ ] Đảm bảo locker ở trạng thái cơ khí an toàn.
2. [ ] Mở USB serial 115200.
3. [ ] Gửi một ký tự <code>R</code>.
4. [ ] Xác nhận log báo xóa Wi-Fi config rồi restart.
5. [ ] Dùng điện thoại nối <code>Locker-Setup</code> trong 180 giây.
6. [ ] Nhập Wi-Fi test chỉ trong portal local; không quay password.
7. [ ] Xác nhận ESP32 rời portal, Wi-Fi và MQTT reconnect.
8. [ ] Restart lại; NVS phải tự reconnect mà không reflash.
9. [ ] Dashboard chỉ hiển thị fresh Wi-Fi status, không có input
   SSID/password.

Đóng P1-M08, E2E-12/E2E-13.

### 10.2. MQTT/network recovery

1. [ ] Với system ONLINE, bắt đầu timestamped serial, broker và Dashboard
   recording.
2. [ ] Ngắt test Wi-Fi hoặc broker.
3. [ ] Xác nhận control disabled và door trở thành
   <code>UNKNOWN</code> khi state không còn đáng tin.
4. [ ] Với abrupt network/power loss, chờ broker nhận LWT theo keepalive;
   retained availability phải <code>OFFLINE</code>.
5. [ ] Restore network/broker.
6. [ ] Xác nhận bounded reconnect, không reboot loop.
7. [ ] Xác nhận retained <code>ONLINE</code> và fresh full state.
8. [ ] Node-RED phải phát đúng một <code>GET_STATE</code> bootstrap cho
   connection generation.
9. [ ] Fresh subscriber nhận retained availability/full state.
10. [ ] Door transition cũ không replay.
11. [ ] Lặp lại hơn một lần; một lần thuận lợi không đủ đóng recovery gate.
12. [ ] Sau một cold boot, gửi <code>GET_STATE</code>; lock vẫn
    <code>UNKNOWN</code> cho đến khi một lệnh LOCK/UNLOCK mới hoàn tất.
13. [ ] Nếu broker test cho phép tạo an toàn trường hợp local/send-level
    <code>subscribe()</code> trả false, xác nhận firmware không publish false
    ONLINE/full state và dùng bounded reconnect. Broker ACL chỉ trả SUBACK deny
    không chứng minh nhánh này vì PubSubClient 2.8 không expose broker SUBACK.

Đóng P1-M09–P1-M11 và E2E-14–E2E-17/E2E-43.

## 11. Stage I — test auth, database và external services

Chỉ dùng development/test environment. Mỗi failure injection phải có baseline
success trước, kế hoạch restore, người quan sát và post-restore smoke.

### 11.1. Auth/ownership/RLS

1. [ ] Tạo disposable User A/User B.
2. [ ] Tạo Locker A/Locker B.
3. [ ] User A claim Locker A; User B không claim lại được.
4. [ ] User B claim Locker B.
5. [ ] Logged-out control/API trả 401, broker không có command.
6. [ ] Session expired/revoked yêu cầu login lại, không side effect.
7. [ ] User A request Locker B trả 403, broker không có command B.
8. [ ] JWT A và unauthenticated không đọc event/settings/delivery của B theo
   RLS.
9. [ ] Service-role key không xuất hiện trong browser.

Đóng E2E-24–E2E-27 và revalidate P2-M03–P2-M05/P3-M04.

### 11.2. Telegram automatic linking

1. [ ] Xác nhận webhook URL đúng deployed host và
   <code>getWebhookInfo</code> không có lỗi.
2. [ ] Login owner, chọn locker test.
3. [ ] Nhấn **Liên kết Telegram**.
4. [ ] Mở private bot chat và nhấn **Start** trong 10 phút.
5. [ ] Dashboard hiển thị **Đã liên kết** nhưng browser không nhận Chat/User
   ID.
6. [ ] Nhấn **Gửi tin nhắn thử**; đúng account nhận một message.
7. [ ] Disable rồi re-enable Telegram preference; link phải được giữ.
8. [ ] Mở lại exact deep link đã consume bằng cùng private account; retry phải
   idempotent, không tạo destination thứ hai.
9. [ ] Nếu có account test thứ hai, thử reuse consumed token; phải bị từ chối.
10. [ ] Nhấn **Ngắt liên kết**; destination biến mất và test-message bị deny.
11. [ ] Tạo link mới và relink thành công.
12. [ ] Test <code>/start</code>, <code>/help</code>,
    <code>/settings</code> trong private chat.
13. [ ] Group/supergroup command bị ignore.

Sau các bước này mới tick automatic Telegram-link rollout gate.

### 11.3. Telegram success/failure trong unauthorized flow

1. [ ] Chạy success baseline.
2. [ ] Trigger một unauthorized episode; chỉ một alert được gửi.
3. [ ] Trong test deployment riêng, dùng controlled invalid bot credential
   hoặc chặn provider network.
4. [ ] Full Deploy failure config.
5. [ ] Trigger episode mới.
6. [ ] Event/buzzer/Dashboard vẫn hoạt động; Telegram failure rõ; không storm.
7. [ ] Restore valid secret ngay, Full Deploy.
8. [ ] Chạy post-restore success smoke.

Đóng P3-M07/P3-M08 và E2E-30/E2E-31.

### 11.4. Supabase persistence/history/chart

1. [ ] Chạy door CLOSED/OPEN.
2. [ ] Chạy LOCK/UNLOCK.
3. [ ] Chạy ALARM ON/OFF.
4. [ ] Chạy LED ON/OFF.
5. [ ] Chạy authorized và unauthorized OPEN.
6. [ ] Query bằng owner route; kiểm tra
   <code>event_id</code>, locker, type, source, result, authorized,
   command ID, occurred/recorded time.
7. [ ] Replay cùng event ID có kiểm soát; chỉ một row.
8. [ ] Kiểm tra 7 buckets và 30 buckets.
9. [ ] Tạo disposable events trước/sau local midnight; DB giữ UTC, chart chia
   đúng local date.
10. [ ] Kiểm tra zero-day/empty-state, không biến lỗi API thành số 0.
11. [ ] Trong test deployment riêng, gây Supabase credential/endpoint failure.
12. [ ] Real-time control không crash; lỗi được surface; không retry vô hạn.
13. [ ] Restore và chạy success smoke.

Đóng P3-M03/P3-M05/P3-M08 và E2E-32–E2E-36.

### 11.5. Daily email

1. [ ] Dùng Mailtrap Sandbox hoặc mailbox test.
2. [ ] Enable email, nhập recipient test, report time và timezone.
3. [ ] Tạo deterministic previous-local-day events.
4. [ ] Đặt report time đến minute test được kiểm soát.
5. [ ] Chờ scheduler; chỉ một email.
6. [ ] Đối chiếu owner, period, timezone, số open, số alert, latest activity.
7. [ ] Kiểm tra delivery row <code>delivered</code> và
   <code>DAILY_EMAIL_REPORT</code> event.
8. [ ] Restart/Full Deploy hoặc tick scheduler lại cùng report date; không có
   email thứ hai.
9. [ ] Dùng invalid disposable recipient để tạo definite failure; không
   <code>sent_at</code>, không crash/loop.
10. [ ] Restore valid setting và cleanup disposable rows.

Đóng E2E-37/E2E-38 và revalidate P3-M06.

### 11.6. Gemini

1. [ ] Hỏi live lock/door/alarm; đối chiếu fresh MQTT cache.
2. [ ] Hỏi count 7 ngày/recent alert; đối chiếu exact Supabase source rows.
3. [ ] Hỏi khi không có data; câu trả lời phải nói thiếu dữ liệu, không bịa.
4. [ ] Trong test deployment, dùng controlled invalid model/key hoặc provider
   failure.
5. [ ] UI trả lỗi kiểm soát/facts fallback theo contract, không leak secret.
6. [ ] Restore config, Full Deploy và chạy success smoke.
7. [ ] Xác nhận Gemini chỉ diễn đạt; Node-RED tính facts/counts.

Đóng P3-M09 và E2E-39–E2E-42.

### 11.7. Buzzer ACK/no-ACK failure an toàn

Không tạo failure bằng cách chặn ACK sau khi buzzer đã bật, vì có thể để còi
ACTIVE mà không điều khiển tắt được. Dùng một test broker/simulator riêng và
giữ buzzer thật INACTIVE:

1. [ ] Chạy một ALARM ON/OFF success baseline trên hardware.
2. [ ] Tắt còi và xác nhận state <code>INACTIVE</code>.
3. [ ] Chuyển Node-RED test locker sang endpoint/simulator được cấu hình nhận
   command nhưng cố ý không trả ACK; không dùng production locker/topic.
4. [ ] Gửi ALARM_ON qua Dashboard.
5. [ ] Xác nhận UI pending rồi timeout; không báo success, không tự retry
   actuator và chỉ một GET_STATE reconciliation.
6. [ ] Xác nhận buzzer thật không actuation vì test endpoint tách biệt.
7. [ ] Restore hardware locker/broker mapping.
8. [ ] Chờ fresh ONLINE/full state rồi chạy lại ALARM ON/OFF success smoke.

Kết hợp failure này với Telegram và Supabase failure ở trên để hoàn tất
P3-M08. Nếu giảng viên yêu cầu một failure trực tiếp trên device thật, chỉ dùng
phương án lab đã được phê duyệt có local emergency-off và bảo đảm command không
đến actuator; không tự thiết kế ACL/drop rule ngay trong buổi demo.

### 11.8. Dashboard responsive và state gates

1. [ ] Test desktop ở viewport 1440 px.
2. [ ] Test phone ở 390 px và 320 px hoặc thiết bị thật tương đương.
3. [ ] Không horizontal overflow/card overlap.
4. [ ] Control target tối thiểu 44 px và focus nhìn thấy được.
5. [ ] Reduced-motion preference không làm mất trạng thái.
6. [ ] Loading, empty và error state của history/chart độc lập, không ghi đè
   panel đang đúng.
7. [ ] Offline, stale, logged-out, expired session, wrong owner và pending đều
   disable đúng control.
8. [ ] Switching locker xóa state/pending/chat cũ.
9. [ ] Telegram fallback link chỉ hiện khi đã được issue.
10. [ ] Wi-Fi panel chỉ hướng dẫn local portal, không có SSID/password field.
11. [ ] Quay screen recording đã che PII/token.

Đóng P3-M10.

## 12. Stage J — chạy full E2E checklist trên cùng release candidate

Không tick từ ký ức hoặc từ test của build cũ. Mỗi row phải có timestamp và
evidence.

### 12.1. Physical/state/recovery

| Done | ID | Thao tác và điều kiện PASS |
|---|---|---|
| [ ] | E2E-01 | Nam châm ở vị trí đóng; sau debounce firmware/Dashboard là <code>CLOSED</code>. |
| [ ] | E2E-02 | Từ CLOSED mở cửa; đúng một stable <code>OPEN</code> và recent event. |
| [ ] | E2E-03 | Rung MC-38 nhanh; không flood, chỉ stable transition. |
| [ ] | E2E-04 | Boot/offline/stale/invalid state cho <code>UNKNOWN</code>; không gọi tháo dây là broken-wire detection. |
| [ ] | E2E-05 | Owner UNLOCK; pending, một command, servo mở, ACK, UI <code>UNLOCKED</code>. |
| [ ] | E2E-06 | LOCK có tải; không kẹt/quá góc/reset, ACK <code>LOCKED</code>. |
| [ ] | E2E-07 | Buzzer ON/OFF qua Node-RED; hardware/ACK/UI đúng. |
| [ ] | E2E-08 | LED ON/OFF; WS2812/ACK/UI đúng, không reset. |
| [ ] | E2E-09 | DHT thật cập nhật hợp lý trên OLED, không có Dashboard telemetry. |
| [ ] | E2E-10 | DHT lỗi an toàn; OLED báo lỗi, MQTT/control khác tiếp tục. |
| [ ] | E2E-11 | OLED boot/value/error/recovery đúng, không flicker bất thường. |
| [ ] | E2E-12 | Xóa Wi-Fi, AP/portal local xuất hiện, không reflash. |
| [ ] | E2E-13 | Lưu Wi-Fi test; restart và reconnect MQTT, credential chỉ ở device. |
| [ ] | E2E-14 | Ngắt/restore network/broker; bounded retry, tự reconnect. |
| [ ] | E2E-15 | Restart: servo không replay, lock UNKNOWN, alarm INACTIVE, LED OFF, door UNKNOWN đến stable sample. |
| [ ] | E2E-16 | Abrupt loss tạo retained OFFLINE; reconnect tạo ONLINE đúng. |
| [ ] | E2E-17 | Reconnect publish retained full state; UI reconcile; door event cũ không replay. |

### 12.2. Protocol/command

| Done | ID | Thao tác và điều kiện PASS |
|---|---|---|
| [ ] | E2E-18 | Valid ACK khớp pending; cancel timer, update đúng domain một lần. |
| [ ] | E2E-19 | Wrong ID không cancel pending thật và không tạo success. |
| [ ] | E2E-20 | No ACK đến deadline: timeout, không retry actuator, một GET_STATE. |
| [ ] | E2E-21 | Publish exact command ID hai lần trong test: actuator một lần, cached ACK, một event. |
| [ ] | E2E-22 | Malformed/no ID không actuation/normal ACK; correlatable invalid payload nhận error ACK. |
| [ ] | E2E-23 | Invalid action nhận <code>INVALID_ACTION</code>, không actuation/UI success. |

E2E-18–E2E-20/E2E-22/E2E-23 có automated evidence; E2E-21 còn cần hardware
action count.

### 12.3. Security, business flows và external services

| Done | ID | Thao tác và điều kiện PASS |
|---|---|---|
| [ ] | E2E-24 | Logged-out UI/API disabled/401; zero MQTT publish. |
| [ ] | E2E-25 | Expired/revoked session trả 401; không data leak/side effect. |
| [ ] | E2E-26 | User A điều khiển Locker B bị 403; zero command B. |
| [ ] | E2E-27 | JWT A/anonymous không đọc rows của B; service-role không ở client. |
| [ ] | E2E-28 | UNLOCK ACK rồi OPEN trong window: <code>authorized=true</code>, không alert. |
| [ ] | E2E-29 | LOCKED/no window rồi OPEN: một unauthorized event, buzzer, Telegram, latest alert. |
| [ ] | E2E-30 | Telegram link/Start/test/unauthorized success; browser không nhận Chat/User ID. |
| [ ] | E2E-31 | Telegram controlled failure không chặn event/buzzer, không retry storm; restore success. |
| [ ] | E2E-32 | Door/lock/buzzer/LED/unauthorized tạo đúng Supabase rows. |
| [ ] | E2E-33 | Supabase controlled failure không crash real-time path; restore success. |
| [ ] | E2E-34 | Chart 7 local buckets, totals và zero days đúng. |
| [ ] | E2E-35 | Chart 30 local buckets và totals đúng. |
| [ ] | E2E-36 | Event quanh local midnight vào đúng bucket/report; DB vẫn UTC. |
| [ ] | E2E-37 | Một daily email đúng owner/period/timezone/count/latest activity. |
| [ ] | E2E-38 | Cùng report date qua retry/restart chỉ một email. |
| [ ] | E2E-39 | Gemini live answer đúng trusted cache facts. |
| [ ] | E2E-40 | Gemini history answer đúng source count/range. |
| [ ] | E2E-41 | No data trả thiếu dữ liệu, không bịa. |
| [ ] | E2E-42 | Gemini controlled failure an toàn, không leak secret; restore success. |
| [ ] | E2E-43 | Offline làm disable controls, door UNKNOWN và zero publish. |

### 12.4. Full load và rehearsal

| Done | ID | Thao tác và điều kiện PASS |
|---|---|---|
| [ ] | E2E-44 | OLED/DHT/MQTT chạy, LED configured max, buzzer ON, servo actuate; rail ổn định, không reset/MQTT loss/nhiệt nguy hiểm. |
| [ ] | E2E-45 | Chạy demo từ login đến recovery trên cùng build/deploy; đủ 12 requirement, data thật, zero Critical/High defect. |

## 13. Stage K — trình tự full demo regression

Chạy E2E-45 đúng thứ tự:

1. [ ] Giới thiệu model, kiến trúc và 12 requirement.
2. [ ] Login User A; chứng minh logged-out/invalid session bị chặn.
3. [ ] Chứng minh User A không đọc/điều khiển Locker B.
4. [ ] Door CLOSED → OPEN → CLOSED, chỉ ra debounce/timestamp/history.
5. [ ] UNLOCK: pending → servo → ACK → UNLOCKED.
6. [ ] Mở trong authorized window; event <code>authorized=true</code>, không
   alert.
7. [ ] Đóng cửa, LOCK: pending → servo → ACK → LOCKED.
8. [ ] LED ON/OFF và ACK/state.
9. [ ] Buzzer ON/OFF và ACK/state.
10. [ ] Hiển thị DHT22 trên OLED; nói rõ không lên Dashboard.
11. [ ] Tạo unauthorized OPEN khi LOCKED/no window.
12. [ ] Chứng minh một unauthorized event, buzzer, Telegram, Dashboard alert
    và Supabase row.
13. [ ] Đóng cửa/tắt còi; không duplicate alert trong cùng episode.
14. [ ] Mở history, chart 7/30, zero bucket/timezone.
15. [ ] Mở email report và delivery/dedupe evidence.
16. [ ] Hỏi Gemini một câu live và một câu history; đối chiếu facts.
17. [ ] Trình bày WiFiManager và MQTT recovery bằng live test hoặc evidence
    cùng release candidate.
18. [ ] Trình bày full-load readings.
19. [ ] Kết luận traceability 12 requirement và build/deploy IDs thật.

Chuẩn bị trước demo:

- Nguồn, emergency power-off, laptop/phone/cáp.
- Test Wi-Fi/hotspot dự phòng.
- User A/B và Locker A/B.
- Telegram private account, SMTP sandbox, Gemini quota.
- Sanitized DB/MQTT/log evidence.
- Known-good firmware binary và FlowFuse rollback.
- Không hiển thị token/password/JWT trên màn chiếu.

## 14. Evidence và xử lý defect

### 14.1. Evidence tối thiểu mỗi manual test

- Test ID.
- Ngày/giờ/timezone.
- Tester.
- Release commit/build/deploy ID.
- Board/part model.
- Wiring revision.
- Non-secret config: angles, brightness, polarity, timezone.
- Bước đã làm.
- Expected và actual.
- PASS/FAIL.
- Ảnh/video/log đã redact.
- Defect ID nếu FAIL.

Không ghi PASS nếu:

- Thiếu hardware/service thật mà test yêu cầu.
- Dùng simulator thay physical evidence.
- Chỉ có ảnh kết quả không xác định build/deploy.
- Có lỗi nhưng đổi expected result.
- Evidence chứa secret và bị xóa mà không tạo bản sanitized thay thế.

### 14.2. Vòng sửa lỗi

Với mọi FAIL:

1. Ghi defect ID và severity.
2. Giữ nguyên evidence lỗi.
3. Tái hiện tối thiểu.
4. Xác định root cause.
5. Sửa nhỏ nhất có thể.
6. Thêm regression automated nếu phù hợp.
7. Tạo release candidate/build/deploy ID mới.
8. Chạy lại test lỗi.
9. Chạy adjacent regression.
10. Chạy lại E2E-45 trước final release.

## 15. Stage L — cập nhật as-built và đóng final release

Sau khi hardware/final E2E PASS:

1. [ ] Cập nhật [hardware/bom.md](hardware/bom.md) bằng exact parts.
2. [ ] Cập nhật [hardware/power-budget.md](hardware/power-budget.md) bằng số
   đo thật.
3. [ ] Cập nhật [hardware/pin-map.md](hardware/pin-map.md) từ candidate thành
   as-built nếu mapping đã khóa.
4. [ ] Cập nhật wiring diagram bằng wiring revision cuối.
5. [ ] Cập nhật assembly guide theo enclosure/linkage thật.
6. [ ] Cập nhật [tests/test-plan.md](tests/test-plan.md): chỉ tick row có
   evidence.
7. [ ] Cập nhật [PLAN.md](PLAN.md) final release checklist.
8. [ ] Cập nhật README/user/deployment/troubleshooting theo system thật.
9. [ ] Lưu sanitized summary vào phase evidence.
10. [ ] Chạy lại automated tests, clean build, secret scan và
    <code>git diff --check</code>.
11. [ ] Xác nhận PDF nguồn còn nguyên.
12. [ ] Xác nhận không production mock/debug code.
13. [ ] Ghi release commit/tag/version/deployment URL bằng giá trị thật.
14. [ ] Archive known-good firmware binary, FlowFuse artefact/hash, migration
    list, wiring revision và evidence index.
15. [ ] Cả ba thành viên review phần mình và dependency tích hợp.

Final audit:

~~~powershell
git diff --check
git status --short
git check-ignore -v .env firmware/include/secrets.h firmware/include/app_config.h firmware/.pio tests/evidence/private

Push-Location node-red
npm test
npm run test:simulator
npm run test:broker
npm run audit
npm audit --audit-level=high
Pop-Location

Push-Location firmware
python -m platformio test -e native
python -m platformio run -e esp32dev -t clean
python -m platformio run -e esp32dev
Pop-Location
~~~

Chỉ ghi <code>FINAL_RELEASE_READY</code> khi:

- [ ] Mọi checklist bắt buộc trong tài liệu này PASS.
- [ ] E2E-45 PASS trên cùng release candidate.
- [ ] Critical = 0, High = 0.
- [ ] Không còn blocker phần cứng/dịch vụ/evidence.
- [ ] Secret audit sạch.
- [ ] Release package khôi phục được.

## 16. Rollback và recovery

### FlowFuse

1. Dừng test actuator.
2. Restore snapshot hoặc import full-flow backup đã export.
3. Xác nhận MQTT credential/environment vẫn đúng.
4. Full Deploy.
5. Chạy login, history và one-device-state smoke.

### Firmware

1. Ngắt nguồn tải và đặt linkage an toàn.
2. Flash known-good binary/source build.
3. Không restore config polarity/angle của part khác.
4. Chạy safe boot và module smoke trước full-load.

### Database

- Không drop migration/table/index để rollback ứng dụng khẩn cấp.
- Redeploy compatible previous FlowFuse runtime trước.
- Down-migration chỉ làm trong maintenance window với data audit/backup riêng.

### Credential incident

Nếu credential xuất hiện trong terminal transcript, Git, log, ảnh hoặc video:

1. Dừng sử dụng credential.
2. Rotate ở provider.
3. Cập nhật secret stores/ignored files.
4. Revoke credential cũ.
5. Kiểm tra access log.
6. Redeploy/reflash phần bị ảnh hưởng.
7. Chạy post-rotation smoke.
8. Tạo sanitized evidence mới.

## 17. Bảng xử lý nhanh

| Hiện tượng | Hành động đúng |
|---|---|
| Dashboard giống bản cũ sau Deploy | Hard reload/private window; kiểm tra đã replace flow, không import chồng |
| Route trùng hoặc có hơn 7 tab | Restore backup; xóa đúng flow/config cũ rồi import lại |
| MQTT connected nhưng không có telemetry | Kiểm tra ACL Node-RED <code>locker/+/#</code> và device-scoped ACL |
| ESP32 build lỗi đường dẫn tiếng Việt | Dùng temporary ASCII drive mapping trong firmware README |
| Boot buzzer kêu | Power off; kiểm tra polarity/driver và local macro |
| ACK alarm success nhưng không có âm | Power off; kiểm tra supply/current/driver/GPIO26 |
| Servo kẹt/nóng/reset | Power off; tháo linkage, kiểm tra góc/cơ khí/nguồn |
| OLED không init | Kiểm tra 3,3 V pull-up/address; scan rồi reflash release firmware |
| DHT lỗi liên tục | Kiểm tra 3,3 V, pull-up 4,7–5,1 kΩ, cable và exact part |
| LED chập chờn/reset | Kiểm tra power budget, buffer, resistor, capacitor, ground |
| Door mapping ngược | Đo continuity, sửa local <code>MC38_CLOSED_LEVEL_HIGH</code>, rebuild |
| Control disabled | Kiểm tra session, ownership, MQTT, ONLINE và fresh full state |
| Telegram link không xong | Kiểm tra Start private chat, webhook URL/secret, expiry 10 phút |
| History/chart lỗi | Kiểm tra migrations, service role, owner mapping và backend log đã sanitize |
| Email không gửi | Kiểm tra setting/timezone/SMTP/delivery state; không log password |
| Full-load làm reboot | FAIL; kiểm tra nguồn, wire, connector, branch distribution và peak current |

Tài liệu troubleshooting đầy đủ:
[docs/troubleshooting.md](docs/troubleshooting.md).

---

**Nguyên tắc cuối:** không có video, simulator, screenshot hoặc câu “chạy được
một lần” nào thay thế đầy đủ power measurement, physical regression, security
negative test và full E2E trên cùng release candidate. Khi một mục chưa chạy,
giữ nó ở <code>[ ]</code>; đó là trạng thái trung thực, không phải thất bại của
phần software.
