# Hướng dẫn kiểm thử và chạy Smart Privacy Locker sau khi lắp mạch

Đây là **nguồn hướng dẫn kiểm thử sau lắp mạch duy nhất** của dự án. Tài liệu
dùng để kiểm tra chấp nhận, khởi động, vận hành, recovery và tắt hệ thống sau
khi đã làm xong
[HUONG_DAN_LAP_MACH_THEO_THU_TU.md](HUONG_DAN_LAP_MACH_THEO_THU_TU.md). Đây
không phải hướng dẫn cắm dây lần đầu.

Không có phép kiểm tra phần mềm nào bảo đảm sản phẩm thật “đúng 100%” nếu chưa
đo và chạy trên đúng ESP32, module, nguồn, cơ khí và dịch vụ triển khai. Trong
tài liệu này, “đạt toàn hệ thống” chỉ có nghĩa là **mọi gate bắt buộc đều PASS
trên cùng commit firmware và cùng revision dây**, có evidence, không có mục
`PENDING`, `SKIPPED`, `UNAVAILABLE` hoặc defect chưa xử lý.

Nếu còn hạng mục lắp dây chưa đạt, quay lại hướng dẫn lắp mạch ở trên. Nếu chưa
hoàn thành số liệu nguồn, cập nhật
[hardware/power-budget.md](hardware/power-budget.md) trước khi chạy full-load.

## 1. Cách hệ thống hoạt động

Arduino IDE không phải thành phần phải chạy liên tục khi vận hành. Firmware
dùng Arduino framework và bản release có thể được build/nạp trực tiếp bằng
Arduino IDE. PlatformIO vẫn được giữ để chạy automated test và làm đường dự
phòng có thể tái lập. Sau khi firmware đã được nạp, ESP32 hoạt động độc lập qua
Wi-Fi và MQTT:

```text
Dashboard ── HTTP/Auth ──> Node-RED / FlowFuse ── MQTT ──> Broker ──> ESP32
Dashboard <────────────── state/ACK qua Node-RED <──────── Broker <──── ESP32

Supabase <── xác thực, quyền sở hữu, lịch sử và cài đặt ──> Node-RED/Dashboard

Điện thoại ── Wi-Fi cục bộ Locker-Setup ──> ESP32 NVS
              SSID và mật khẩu Wi-Fi không đi qua Dashboard hoặc cloud
```

Trong vận hành hằng ngày:

- Không cần mở Arduino IDE hoặc PlatformIO sau khi đã nạp firmware.
- Không cần cắm USB vào máy tính nếu ESP32 đã có nguồn theo topology cuối cùng
  và đã lưu Wi-Fi.
- Không cần chạy `npm start` trong thư mục `node-red/` khi hệ thống dùng
  FlowFuse Cloud; FlowFuse là runtime đang chạy.
- Trình duyệt không kết nối trực tiếp với ESP32 và không chứa MQTT credential.

## 2. Điều kiện trước khi vận hành

Chỉ tiếp tục khi tất cả mục sau đều đúng:

- [ ] Firmware release cuối đã được nạp vào đúng ESP32 Dev Module.
- [ ] Board, dây, connector, switch, bảo vệ nhánh và nguồn đã được nghiệm thu.
- [ ] Servo không kẹt, không ép end-stop và cơ cấu chốt tự vận hành an toàn.
- [ ] Servo và WS2812 không lấy dòng từ GPIO hoặc rail 3,3 V của ESP32; buzzer
  LOW-trigger/TMB12A05 là ngoại lệ đã chọn cho prototype: `VCC→3V3`,
  `GND→GND`, `IN/S/I/O→GPIO26` qua 4,7 kΩ, tuyệt đối không lấy VCC từ GPIO.
- [ ] Đường WS2812 đã chọn rõ `Direct-D` hoặc `Shifted-S` theo Stage 6 của
  hướng dẫn lắp mạch. Nếu dùng direct 3,3 V → strip 5 V, đúng specimen/wiring
  đã qua gate direct và exact datasheet + rail đo chứng minh ngưỡng; một lần
  flicker/sai màu là FAIL chứ không phải lỗi bỏ qua.
- [ ] `SPL_BUZZER_ACTIVE_HIGH=0` có hiệu lực cho module LOW-trigger. Tracked
  example và fallback đều đã mặc định `0`; nếu có local `app_config.h` cũ thì
  xác nhận nó không override thành `1`.
- [ ] Mọi phần mạch dùng chung GND theo wiring revision đã duyệt.
- [ ] Phương án cấp nguồn cuối không back-feed cổng USB hoặc máy tính.
- [ ] Power budget và full-load test đã PASS, không brownout, reboot hoặc quá
  nhiệt.
- [ ] `LOCKER_ID` giống tuyệt đối trong firmware, FlowFuse, Supabase và MQTT
  ACL.
- [ ] MQTT host, port, TLS và CA trong firmware khớp broker đang dùng.
- [ ] FlowFuse đã Full Deploy đúng `node-red/flows.flowfuse.json`.
- [ ] MQTT credential của Node-RED nằm trong credential store của config node.
- [ ] Supabase migrations đã được áp dụng đúng thứ tự và locker đã tồn tại.
- [ ] Dashboard `/locker` truy cập được.
- [ ] Tài khoản vận hành là owner của đúng locker hoặc có thể claim locker đó.
- [ ] Có đường ngắt nguồn dễ tiếp cận khi xảy ra kẹt cơ khí, sụt áp hoặc quá
  nhiệt.

Các dịch vụ Telegram, email và Gemini có thể được kiểm tra sau khi đường điều
khiển lõi ESP32–MQTT–Node-RED đã hoạt động. Không để lỗi của dịch vụ phụ che
lấp lỗi nguồn, MQTT hoặc actuator.

### 2.1. Ma trận test chấp nhận bắt buộc sau khi lắp

Chạy theo đúng thứ tự dưới đây. Ghi `PASS` chỉ khi kết quả quan sát được khớp
hoàn toàn; ghi `FAIL` rồi dừng nếu sai. Không dùng “có vẻ chạy” làm evidence.

| ID | Test | Điều kiện PASS tối thiểu | Evidence cần giữ |
|---|---|---|---|
| `SYS-01` | Kiểm tra mất điện | Không chập 3V3/GND hoặc 5V/GND; đúng cực adapter/tụ; common GND; không có 5 V vào GPIO/3V3 | ảnh dây có nhãn + số đo continuity/điện áp |
| `SYS-02` | Safe boot/reset | 10 lần cold boot và 10 lần `EN`: buzzer luôn im trước lệnh, LED OFF, servo không tự chạy, không brownout/reboot loop | video liên tục + serial reset reason |
| `SYS-03` | Sensor/display | OLED đúng địa chỉ; DHT22 có giá trị hợp lý qua ít nhất 5 chu kỳ; MC-38 đổi đúng OPEN/CLOSED và debounce ổn định | ảnh OLED + serial/state + video nam châm |
| `SYS-04` | Từng output riêng | LED ON/OFF, servo LOCK/UNLOCK và buzzer ON/OFF đều có physical result khớp correlated ACK + retained state; buzzer HIGH im/LOW kêu ở GPIO26 | video + MQTT ACK/state theo `command_id` |
| `SYS-05` | Cửa và cảnh báo | Cửa mở trong cửa sổ authorized không báo giả; mở ngoài cửa sổ tạo đúng một unauthorized episode, alarm và Telegram theo cấu hình | event/history + notification + video |
| `SYS-06` | Wi-Fi portal | `Locker-Setup` hoạt động, lưu Wi-Fi, reboot tự nối lại; credential không đi vào log/source | video portal đã che SSID nhạy cảm + serial redacted |
| `SYS-07` | MQTT recovery | Mất broker/mạng làm controls khóa; reconnect có LWT/availability đúng, fresh full state mới và không replay actuator command | broker log + Dashboard trước/sau reconnect |
| `SYS-08` | Auth/ownership/RLS | Owner đúng được phép; user khác bị chặn; claim một lần; không có đường browser dùng service-role/MQTT credential | ảnh/API result đã ẩn token + pgTAP/live gate |
| `SYS-09` | Cloud/UI | History đúng event, chart 7/30 ngày có bucket 0, Telegram/email/chatbot chạy đúng phạm vi và lỗi provider được báo có kiểm soát | ảnh chức năng + record DB/email/Telegram |
| `SYS-10` | Full-load | Ít nhất 20 chu kỳ servo cùng Wi-Fi/MQTT, LED mức cấu hình và buzzer; rail nằm trong giới hạn đã duyệt, không reset, flicker, nóng, kẹt hoặc sụt áp bất thường | video liên tục + min/max V, dòng, nhiệt độ |
| `SYS-11` | Regression release | Node, simulator, broker, audit, firmware native/ESP32, Arduino verify, Wokwi build/lint và database tests đều PASS trên cùng source | log lệnh, version, hash commit/artifact |

Nếu môi trường không có Docker/Supabase CLI thì `SYS-11` phần database là
`UNAVAILABLE`, không phải PASS. Nếu ESP32 không xuất hiện ở cổng USB-serial thì
`SYS-02` đến `SYS-10` chưa thể xác nhận. Hoàn thành mọi phần còn chạy được rồi
ghi rõ blocker; không nâng trạng thái toàn hệ thống thành PASS.

## 3. Khởi động hệ thống hằng ngày

### Bước 1 — kiểm tra khi chưa cấp nguồn

1. Đảm bảo cửa, chốt và servo không bị vật cản.
2. Kiểm tra nhanh dây nguồn, common ground, connector và các điểm có thể chạm
   vỏ hoặc cơ cấu chuyển động.
3. Xác nhận còi, LED và servo không ở trạng thái có thể gây nguy hiểm khi cấp
   nguồn.
4. Không cắm đồng thời USB có nguồn và external 5 V trừ khi đúng topology cuối
   đã được xác minh cho board thực tế.

Nếu có dây lỏng, mùi lạ, vết nóng, chạm chập hoặc cơ khí bị kẹt, không cấp
nguồn.

### Bước 2 — kiểm tra dịch vụ phần mềm

Nếu dùng FlowFuse Cloud, mở console của instance và xác nhận instance đang ở
trạng thái chạy, flow đúng phiên bản đã được Deploy. Không import thêm một bản
flow thứ hai chỉ để khởi động hệ thống.

Mở URL đã cấu hình trong `DASHBOARD_BASE_URL`, thường có dạng:

```text
https://<instance>.flowfuse.cloud/locker
```

Trang đăng nhập phải tải được. Việc trang tải được chỉ chứng minh HTTP đang
hoạt động; chưa chứng minh ESP32 hoặc MQTT đang ONLINE.

### Bước 3 — cấp nguồn

1. Dùng switch và bộ nguồn low-voltage đã được duyệt trong wiring revision
   cuối.
2. Quan sát ESP32, OLED, LED, servo và buzzer ngay khi bật nguồn.
3. Buzzer phải im lặng, LED ở trạng thái `OFF` và servo không được tự quay chỉ
   vì boot.
4. Dừng và ngắt nguồn ngay nếu có brownout/reboot loop, servo rung/kẹt, LED
   chớp bất thường, dây/driver nóng, mùi lạ hoặc điện áp rail sụt ngoài giới
   hạn đã nghiệm thu.

Cold boot state hợp lệ là:

```text
door  = UNKNOWN, sau đó thành CLOSED hoặc OPEN sau stable sample
lock  = UNKNOWN
alarm = INACTIVE
led   = OFF
```

`lock=UNKNOWN` sau cold boot là hành vi an toàn có chủ đích. Firmware không lưu
và không tự suy đoán vị trí cơ khí. Trạng thái chỉ trở thành `LOCKED` hoặc
`UNLOCKED` sau khi một lệnh mới thực sự hoàn tất.

### Bước 4 — chờ Wi-Fi và MQTT

Khi ESP32 đã lưu một mạng còn dùng được, thiết bị phải tự kết nối Wi-Fi rồi
MQTT mà không cần reflash. Chờ đến khi hệ thống có đủ:

```text
Wi-Fi connected
MQTT connected
Retained availability = ONLINE
Fresh full state của đúng LOCKER_ID
```

Không kích hoạt actuator khi thiết bị đang reconnect hoặc Dashboard chỉ có
retained state cũ.

Nếu đây là lần đầu dùng Wi-Fi hoặc Wi-Fi đã đổi, thực hiện mục 7 của tài liệu
này.

### Bước 5 — đăng nhập Dashboard

1. Mở `/locker` và đăng nhập bằng tài khoản owner.
2. Nếu locker chưa có owner, nhập đúng `LOCKER_ID` và claim một lần.
3. Nếu locker đã được claim, chỉ chọn locker thuộc tài khoản hiện tại.
4. Chờ Dashboard xác nhận đồng thời MQTT, device `ONLINE` và fresh full state.
5. Chỉ tiếp tục khi các nút điều khiển được bật cho đúng locker.

Controls bị khóa khi offline, state stale hoặc chưa đủ freshness là hành vi
fail-closed đúng thiết kế; không tìm cách bỏ qua gate này.

## 4. Smoke test đầu phiên

Chạy smoke test ngắn sau mỗi lần lắp đặt, di chuyển, thay nguồn, thay mạng,
flash firmware hoặc Deploy flow. Trong vận hành bình thường, không lặp actuator
quá nhiều lần chỉ để kiểm tra.

### 4.1. Kiểm tra trạng thái cục bộ

- [ ] OLED hiển thị ổn định, không nhấp nháy hoặc mất ký tự.
- [ ] DHT22 cập nhật nhiệt độ/độ ẩm hợp lý sau nhiều chu kỳ đọc.
- [ ] Door state đúng với vị trí MC-38 thực tế.
- [ ] Không có reset, brownout hoặc MQTT reconnect loop.

DHT22 chỉ hiển thị cục bộ trên OLED. Không có temperature/humidity MQTT topic
hoặc card Dashboard trong thiết kế hiện tại.

### 4.2. Kiểm tra một lệnh không cơ khí trước

1. Gửi `LED_ON` từ Dashboard.
2. Xác nhận UI chuyển sang pending.
3. Chờ correlated ACK và state `ON`.
4. Gửi `LED_OFF`, chờ ACK và state `OFF`.
5. Xác nhận ESP32 không reset và LED hoạt động ổn định.

### 4.3. Kiểm tra khóa

Chỉ thực hiện khi vùng chuyển động an toàn và có thể ngắt nguồn ngay:

1. Gửi một lệnh phù hợp với vị trí cần kiểm tra: `LOCK` hoặc `UNLOCK`.
2. Không bấm lại khi UI đang pending.
3. Quan sát phần cứng thực sự di chuyển hết hành trình mà không kẹt hoặc stall.
4. Chỉ chấp nhận thành công khi có đủ chuyển động vật lý, correlated ACK và
   state cuối đúng.
5. Nếu HTTP timeout hoặc kết quả chưa xác định, không gửi lại ngay. Chờ
   `GET_STATE` reconciliation hoặc kiểm tra trạng thái thực tế trước.

### 4.4. Kiểm tra MC-38 và cảnh báo

1. Xác nhận cửa đóng cho state `CLOSED`.
2. Thực hiện đúng luồng unlock hợp lệ rồi mở cửa; sự kiện không được bị phân
   loại là mở trái phép trong authorized window.
3. Chỉ khi môi trường demo an toàn mới thử controlled unauthorized-open flow.
4. Kiểm tra alarm command, buzzer thực tế, event history và thông báo đã cấu
   hình.
5. Tắt alarm sau phép thử và xác nhận `INACTIVE` cả trên phần cứng lẫn
   Dashboard.

Không dùng unauthorized-open test như thao tác khởi động hằng ngày nếu nó làm
ồn, tạo thông báo hoặc ghi event không cần thiết.

### 4.5. Điều kiện smoke test PASS

- [ ] Dashboard hiển thị đúng locker và đúng trạng thái hiện tại.
- [ ] Mỗi command đi theo chuỗi pending → correlated ACK → confirmed state.
- [ ] Phần cứng thực tế khớp ACK/state; không chỉ UI đổi trạng thái.
- [ ] Event tương ứng xuất hiện trong history khi loại event được lưu.
- [ ] Không brownout, reboot, nóng bất thường, servo chatter hoặc LED flicker.
- [ ] Không có command pending treo hoặc controls được bật từ state cũ.

Nếu một mục không đạt, dừng smoke test và dùng mục 10 để khoanh vùng; không tiếp
tục demo như thể hệ thống đã sẵn sàng.

## 5. Vận hành bình thường

### Khóa và mở khóa

- Chỉ gửi một lệnh tại một thời điểm trong cùng actuator domain.
- Chờ ACK và state cuối trước khi gửi lệnh tiếp theo.
- Luôn quan sát cơ khí khi chạy thử trực tiếp.
- Không dùng thao tác lặp nhanh để ép servo hoặc kiểm tra tải.
- Nếu kết quả timeout/không xác định, đối chiếu state và vị trí thật trước khi
  quyết định thao tác tiếp.

### LED và buzzer

- LED chỉ được coi là đã đổi khi ESP32 trả ACK và state mới.
- Buzzer `ACTIVE` trên Dashboard nhưng không có âm thanh là lỗi phần cứng,
  driver, polarity hoặc nguồn; không sửa UI để che lỗi.
- Sau demo cảnh báo, luôn đưa alarm về `INACTIVE`.

### Lịch sử và biểu đồ

- Chọn 7 hoặc 30 ngày rồi cập nhật dữ liệu.
- Ngày không có event phải hiện bucket 0, không bị bỏ khỏi biểu đồ.
- History/chart/settings vẫn có thể dùng khi ESP32 offline nếu owner auth và
  Supabase còn hoạt động; chỉ physical controls cần fresh live state.

### Telegram

1. Chọn đúng locker đã sở hữu.
2. Nhấn **Liên kết Telegram**.
3. Trong private chat được mở, nhấn **Start**.
4. Quay lại Dashboard, chờ trạng thái đã liên kết.
5. Gửi tin nhắn thử trước khi bật notification.

Không nhập, hiển thị hoặc yêu cầu người dùng tìm Chat ID. Khi chuyển locker
sang tài khoản khác, ngắt liên kết Telegram cũ trước.

### Email hằng ngày

- Bật email, nhập địa chỉ nhận, report time và timezone hợp lệ rồi lưu.
- Xác nhận SMTP variables và sender đã được đặt trong FlowFuse secret store.
- Không xóa delivery history chỉ để ép gửi lại một báo cáo đã được chống trùng.
- `delivery_unknown` cần được kiểm tra thủ công; không tự động gửi lại vì SMTP
  có thể đã nhận email.

### Chatbot

Chatbot chỉ trả lời các câu hỏi live/history được hỗ trợ. Chatbot không điều
khiển phần cứng và không thay thế state/ACK của ESP32.

## 6. Cài Arduino IDE và nạp firmware khi cần

Không reflash trong vận hành hằng ngày. Chỉ nạp lại khi code hoặc các giá trị
local như MQTT/TLS, góc servo, địa chỉ OLED, số lượng/độ sáng LED, polarity
MC-38 hoặc polarity buzzer thực sự thay đổi.

Bản dùng để mở trong Arduino IDE là:

```text
arduino/SmartPrivacyLocker/SmartPrivacyLocker.ino
```

Không mở `firmware/src/main.cpp` như một sketch riêng và không gộp các file
thành một `.ino` khác. `SmartPrivacyLocker.ino` là entry point; `setup()` và
`loop()` nằm trong tab `main.cpp`. Các file C++ trong sketch là bản đồng bộ từ
`firmware/`, không phải một thuật toán khác.

### 6.1. Cài đúng toolchain một lần

Tại lần kiểm tra ngày 14/08/2026, máy này có Arduino IDE `2.3.10`. Board
package ban đầu là ESP32 `3.3.11`; trong lần chuẩn bị này nó đã được hạ và xác
minh ở ESP32 core `2.0.17`, đồng thời Sketchbook được Arduino IDE cấu hình tại
đường ASCII `C:\ArduinoSketches`. Không nâng lại `3.3.11`/`latest` trước buổi
nộp khi chưa thực hiện một đợt migration/test riêng.

Trên chính máy này, setup đã hoàn thành. Nếu cài lại Arduino IDE, đổi máy hoặc
Library Manager làm lệch version, có thể chạy script idempotent sau khi đóng
Arduino IDE:

```powershell
.\arduino\setup-arduino-ide.ps1
```

Với một bản Arduino IDE vừa cài chưa từng mở, hãy khởi động IDE một lần để nó
tạo `arduino-cli.yaml`, đóng IDE, rồi mới chạy script.

Script thay version ESP32/libraries đang hoạt động toàn cục, nên các sketch
Arduino khác trên máy cũng có thể bị ảnh hưởng. Có thể đổi lại version sau
buổi nộp bằng Boards Manager/Library Manager.

1. Mở **File → Preferences** trong Arduino IDE.
2. Thêm URL sau vào **Additional Boards Manager URLs**:

   ```text
   https://espressif.github.io/arduino-esp32/package_esp32_index.json
   ```

3. Mở **Tools → Board → Boards Manager**.
4. Tìm `esp32`, chọn **esp32 by Espressif Systems**, chọn version `2.0.17` và
   nhấn **Install**. Nếu IDE đang dùng `3.3.11`, thao tác này đổi version ESP32
   đang hoạt động cho các sketch khác trên máy; sau buổi nộp chỉ nâng lại khi
   các project đó cần.
5. Mở **Tools → Manage Libraries** và cài đúng các version sau. Với thư viện đã
   có version khác, chọn lại version trong dropdown rồi nhấn **Install**.

| Library Manager name | Version |
|---|---:|
| ArduinoJson | 7.4.2 |
| PubSubClient | 2.8.0 |
| WiFiManager | 2.0.17 |
| ESP32Servo | 3.0.7 |
| DHT sensor library | 1.4.6 |
| Adafruit Unified Sensor | 1.1.15 |
| Adafruit SSD1306 | 2.5.15 |
| Adafruit GFX Library | 1.12.1 |
| Adafruit BusIO | 1.17.4 |
| Adafruit NeoPixel | 1.12.5 |

6. Đóng/mở lại Arduino IDE sau khi thay board package.

Không commit credential. Source of truth của cấu hình local vẫn là hai file đã
ignore dưới `firmware/include/`. Sau khi chỉnh chúng bằng editor cục bộ, cập
nhật bản Arduino mà không in nội dung secret:

```powershell
.\arduino\sync-sketch.ps1 -IncludeLocalConfig
.\arduino\sync-sketch.ps1 -Check
```

Nếu chưa có local config, tạo từ example, điền giá trị thật ở bản đã ignore,
rồi chạy hai lệnh trên:

```powershell
Copy-Item firmware\include\app_config.example.h firmware\include\app_config.h
Copy-Item firmware\include\secrets.example.h firmware\include\secrets.h
```

Credential Arduino thật nằm trong file đã ignore
`arduino/SmartPrivacyLocker/private/secrets.local.h`; tab `secrets.h` ở root
chỉ là wrapper an toàn. Không mở/chụp file private và không gửi các file local
trong ZIP công khai.

### 6.2. Chọn đúng board và Tools options

Mở `arduino/SmartPrivacyLocker/SmartPrivacyLocker.ino`, sau đó đặt:

| Arduino IDE option | Giá trị release |
|---|---|
| Board package | `esp32 by Espressif Systems 2.0.17` |
| Board | `ESP32 Dev Module` |
| Upload Speed | `921600` |
| CPU Frequency | `240MHz (WiFi/BT)` |
| Flash Frequency | `40MHz` |
| Flash Mode | `DIO` |
| Flash Size | `4MB (32Mb)` |
| Partition Scheme | `Default 4MB with spiffs (1.2MB APP/1.5MB SPIFFS)` |
| Core Debug Level | `Info` |
| PSRAM | `Disabled` |
| Arduino Runs On | `Core 1` |
| Events Run On | `Core 1` |
| Erase All Flash Before Sketch Upload | `Disabled` |
| Port | Cổng USB-serial vừa xuất hiện khi cắm board; `COM4` chỉ là evidence bench ngày 15/08/2026, không phải giá trị cố định |

Không chọn `Standard Serial over Bluetooth link`. Nếu không chắc cổng nào là
board, rút ESP32, xem danh sách port, cắm lại và chọn port vừa xuất hiện.

`921600` khớp cấu hình release và giúp upload nhanh. Nếu đúng cổng/cáp nhưng
upload không ổn định, có thể hạ riêng **Upload Speed** xuống `115200`; việc này
chỉ làm nạp chậm hơn, không đổi baud runtime của Serial Monitor.

### 6.3. Verify, upload và Serial Monitor

1. Đưa locker về trạng thái cơ khí an toàn.
2. Tắt/rút external 5 V và tháo tải khỏi đường nguồn ESP32 theo flash mode đã
   duyệt. Chỉ cắm ESP32 bằng USB-C data cable; không cấp hai nguồn đồng thời.
3. Trong Arduino IDE, nhấn **Verify**. Build phải kết thúc không có error.
4. Build tham chiếu đã xác minh cho source hiện tại là:

   ```text
   Program storage: 1,107,681 / 1,310,720 bytes (84%)
   Global variables: 52,960 / 327,680 bytes (16%)
   ```

   Sai khác nhỏ do output/tool metadata không nhất thiết là lỗi; nhưng tuyệt
   đối không được vượt partition hoặc bỏ qua compiler error.

   Evidence ngày 15/08/2026: Windows nhận board là `USB-SERIAL CH340 (COM4)`,
   driver `OK`; Arduino IDE chọn `ESP32 Dev Module` trên COM4. Sketch bench
   buzzer đã upload thành công (giữ `BOOT` trong `Connecting`, thả khi bắt đầu
   `Writing`). Đây là PASS cho kết nối/upload bench, không tự động chứng minh
   production firmware hoặc toàn bộ physical gate.
5. Chọn đúng port rồi nhấn **Upload**.
6. Nếu board clone dừng lâu ở `Connecting...`, giữ `BOOT`, bắt đầu Upload và
   thả khi IDE chuyển sang ghi flash. Chỉ dùng cách này sau khi đã kiểm tra đúng
   port, cáp data và nguồn.
7. Khi IDE báo upload hoàn tất, mở **Tools → Serial Monitor**, chọn `115200`
   baud và reset board một lần nếu cần.
8. Phải thấy thông báo firmware khởi động; log không được chứa MQTT password,
   Wi-Fi password hoặc CA private material.
9. Đóng Serial Monitor trước một lần Upload khác để tránh giữ cổng COM.
10. Sau khi flash, rút USB trước khi chuyển sang final external-power mode,
    rồi chạy lại toàn bộ smoke test ở mục 4.

### 6.4. Kiểm tra tái lập và automated test

Arduino IDE dùng chính Arduino CLI làm backend. Kiểm tra đúng môi trường toàn
cục mà nút **Verify** của GUI sử dụng:

```powershell
.\arduino\verify-arduino-ide.ps1
```

Repository còn có `sketch.yaml` pin core/thư viện để kiểm tra cô lập, không phụ
thuộc các version toàn cục đang cài. Lệnh sau cũng đã PASS trên máy này; đây là
verification command, không phải cách vận hành hằng ngày:

```powershell
.\arduino\verify-sketch.ps1
```

Các automated unit/contract test vẫn chạy bằng PlatformIO vì Arduino IDE
không thay thế test runner của repository:

```powershell
Push-Location firmware
python -m platformio test -e native
Pop-Location
```

Nếu PlatformIO gặp lỗi encoding do đường dẫn tiếng Việt, dùng ASCII drive
mapping đã ghi trong [firmware/README.md](firmware/README.md). Việc giữ
PlatformIO cho test không làm firmware demo trở thành một chương trình khác.

## 7. Đổi hoặc khôi phục Wi-Fi

Wi-Fi credential chỉ được nhập vào captive portal cục bộ của ESP32; không nhập
SSID/password vào Dashboard, FlowFuse, Supabase, file header hoặc ảnh/log.

### Khi Wi-Fi cũ không còn dùng được

1. Đảm bảo locker ở trạng thái cơ khí an toàn.
2. Restart ESP32.
3. Dùng điện thoại kết nối AP `Locker-Setup` trong vòng 180 giây.
4. Nếu portal không tự mở, truy cập:

```text
http://192.168.4.1
```

5. Chọn Wi-Fi test/được phép, nhập password và lưu.
6. Chờ ESP32 rời portal, kết nối Wi-Fi và MQTT.
7. Chờ Dashboard nhận `ONLINE` cùng fresh full state trước khi dùng controls.
8. Restart thêm một lần để xác nhận NVS tự reconnect mà không reflash.

### Xóa Wi-Fi đã lưu qua USB

Chỉ dùng trong bảo trì có giám sát:

1. Kết nối board bằng USB theo flash/maintenance power mode an toàn.
2. Chọn đúng port trong Arduino IDE.
3. Mở **Tools → Serial Monitor**, đặt `115200` baud.
4. Gửi một ký tự `R` hoặc `r`.

Firmware sẽ xóa riêng WiFiManager settings và restart. Lệnh này không in
SSID/password và không thay MQTT credential.

## 8. Recovery sau mất mạng hoặc restart

Khi Wi-Fi, broker, FlowFuse hoặc ESP32 mất kết nối:

1. Không gửi lặp actuator command.
2. Dashboard phải disable controls khi device offline hoặc state hết fresh.
3. Với mất kết nối đột ngột, broker sẽ phát retained LWT `OFFLINE` theo
   keepalive.
4. Khôi phục đúng dịch vụ hoặc mạng bị lỗi.
5. ESP32 phải reconnect có giới hạn, không reboot loop.
6. Sau reconnect, ESP32 phát `ONLINE` và fresh full state.
7. Node-RED phát một `GET_STATE` bootstrap cho connection generation mới.
8. Chỉ điều khiển lại khi Dashboard đã nhận current-generation availability và
   full state.

Sau một cold boot, `lock` vẫn có thể là `UNKNOWN` cho đến khi một `LOCK` hoặc
`UNLOCK` mới hoàn tất. Không sửa retained state thủ công để biến `UNKNOWN`
thành một vị trí chưa được xác nhận.

## 9. Tắt hệ thống

1. Hoàn tất command đang pending; không cắt nguồn giữa lúc servo đang chạy.
2. Đưa alarm về `INACTIVE` và LED về `OFF` nếu quy trình vận hành yêu cầu.
3. Đưa cửa/chốt về trạng thái cơ khí an toàn đã thống nhất.
4. Xác nhận không còn actuator chuyển động.
5. Tắt bằng main switch/nguồn low-voltage đã duyệt.
6. Không rút dây tín hiệu hoặc connector tải khi mạch còn điện.
7. Chỉ rút USB/external power theo topology cuối, tránh back-feed.

Đóng tab trình duyệt hoặc đăng xuất Dashboard không tắt nguồn ESP32 và không
thay đổi trạng thái cơ khí.

## 10. Xử lý nhanh khi có lỗi

| Hiện tượng | Kiểm tra đầu tiên | Hành động an toàn |
|---|---|---|
| Không thấy cổng ESP32 | Cáp data, USB-UART driver, Device Manager | Không chọn cổng Bluetooth; thử cáp/cổng/driver đúng chip |
| Không thấy `Locker-Setup` | Wi-Fi cũ còn dùng được hoặc portal đã hết 180 giây | Restart gần thiết bị; chỉ reset Wi-Fi qua USB khi bảo trì |
| Wi-Fi connected nhưng MQTT offline | Host/port/TLS/CA, credential, ACL, broker | Sửa đúng một lớp cấu hình; không đưa secret vào log |
| Dashboard tải được nhưng controls bị khóa | Auth, ownership, MQTT, `ONLINE`, fresh full state | Chờ đồng bộ hoặc sửa lớp đang offline; không bỏ freshness gate |
| Command pending rồi timeout | ACK, device state, broker và Node-RED diagnostic | Không tự gửi lại; dùng `GET_STATE`/đối chiếu vị trí thật |
| ACK success nhưng actuator không chạy | Nguồn tải, driver, wiring, polarity, cơ khí | Ngắt nguồn và kiểm tra phần cứng; không sửa UI để che lỗi |
| Servo rung/kẹt hoặc ESP32 reset | Linkage, end-stop, rail 5 V, current, common ground | Ngắt nguồn ngay; quay lại power/full-load gate |
| WS2812 direct sai màu/flicker/lúc chạy lúc không | Margin 3,3 V → `DIN`, data wire, common GND, rail tại pixel | Ngắt nguồn; kiểm tra Stage 6, rút ngắn data; nếu tái diễn dùng `SN74AHCT125N` hoặc bỏ LED vật lý |
| Buzzer kêu lại sau `Hard resetting via RTS pin...` hoặc sau `EN` | Kiểm tra VCC module có bị nối 5 V, local `SPL_BUZZER_ACTIVE_HIGH=0`, tín hiệu đúng GPIO26 qua 4,7 kΩ; nhớ rằng 4,7 kΩ chỉ hạn dòng, không đổi HIGH 3,3 V thành 5 V | Ngắt nguồn; với specimen hiện tại chuyển VCC về ESP32 `3V3`, không dùng `INPUT` để tắt và không đưa 5 V vào GPIO |
| Door state ngược | MC-38 continuity, placement, `MC38_CLOSED_LEVEL_HIGH` | Power off, xác minh bằng đồng hồ rồi rebuild nếu cần |
| `lock=UNKNOWN` sau reboot | Safe-boot policy | Bình thường; xác nhận bằng một lệnh mới khi cơ khí an toàn |
| History/chart lỗi nhưng device online | Supabase migration, service role, ownership | Kiểm tra backend; không diễn giải lỗi thành dữ liệu 0 |
| Telegram không liên kết | Private Start, webhook URL/secret, token 10 phút | Tạo link mới; không yêu cầu Chat ID |
| Email không gửi | Channel setting, timezone, SMTP variables, delivery status | Kiểm tra một controlled report; không log SMTP password |

Xem thêm [docs/troubleshooting.md](docs/troubleshooting.md) cho mã lỗi và hành
động chi tiết.

## 11. Tiêu chí hệ thống sẵn sàng để demo/vận hành

Hệ thống chỉ được coi là sẵn sàng khi cùng một release candidate và wiring
revision đáp ứng tất cả điều kiện sau:

- [ ] Nguồn và full-load gate đã PASS.
- [ ] Boot an toàn: servo không tự chạy, buzzer im, alarm `INACTIVE`, LED
  `OFF`.
- [ ] ESP32 kết nối Wi-Fi và MQTT ổn định, không reboot loop.
- [ ] Broker có retained `ONLINE` và fresh full state đúng locker.
- [ ] Dashboard đăng nhập/ownership đúng và controls chỉ bật khi state fresh.
- [ ] LED, lock/unlock, door sensor và alarm đã có physical result + ACK +
  state nhất quán.
- [ ] History và chart đọc đúng dữ liệu owner-scoped.
- [ ] Telegram/email/Gemini đã được kiểm tra nếu nằm trong phạm vi buổi demo.
- [ ] Mất mạng và reconnect đã phục hồi đúng, không replay actuator command.
- [ ] Không credential nào xuất hiện trong source, flow export, log, ảnh hoặc
  video.
- [ ] Người vận hành biết vị trí main switch và quy trình ngắt nguồn khẩn cấp.

Nếu bất kỳ điều kiện nào không đạt, ghi nhận failure/defect và quay lại đúng
ID trong ma trận 2.1 hoặc đúng bước trong
[HUONG_DAN_LAP_MACH_THEO_THU_TU.md](HUONG_DAN_LAP_MACH_THEO_THU_TU.md); không
đổi kỳ vọng để biến kết quả thành PASS.

## 12. Tài liệu liên quan

- [README.md](README.md): trạng thái và quick start của repository.
- [firmware/README.md](firmware/README.md): cấu hình, build, upload và serial.
- [arduino/README.md](arduino/README.md): quy tắc đồng bộ và profile Arduino.
- [arduino/SmartPrivacyLocker/SmartPrivacyLocker.ino](arduino/SmartPrivacyLocker/SmartPrivacyLocker.ino): sketch mở bằng Arduino IDE.
- [docs/architecture.md](docs/architecture.md): luồng dữ liệu và trust boundary.
- [docs/deployment-guide.md](docs/deployment-guide.md): Supabase và
  Node-RED/FlowFuse.
- [docs/user-guide.md](docs/user-guide.md): hành vi Dashboard cho người dùng.
- [docs/mqtt-contract.md](docs/mqtt-contract.md): topic, payload, ACK và state.
- [hardware/pin-map.md](hardware/pin-map.md): GPIO và calibration values.
- [hardware/power-budget.md](hardware/power-budget.md): nguồn và full-load gate.
- [docs/troubleshooting.md](docs/troubleshooting.md): xử lý sự cố chi tiết.
- [HUONG_DAN_LAP_MACH_THEO_THU_TU.md](HUONG_DAN_LAP_MACH_THEO_THU_TU.md):
  nguồn hướng dẫn cắm dây duy nhất.
- [Arduino Sketch Specification](https://docs.arduino.cc/arduino-cli/sketch-specification/): quy tắc sketch nhiều file và file `.ino` chính.
- [Arduino Sketch Project File](https://docs.arduino.cc/arduino-cli/sketch-project-file/): profile pin core/library để build tái lập.
- [Espressif Arduino-ESP32 Installation](https://docs.espressif.com/projects/arduino-esp32/en/latest/installing.html): URL Boards Manager và quy trình cài core.
- [Espressif Arduino IDE Tools Menu](https://docs.espressif.com/projects/arduino-esp32/en/latest/guides/tools_menu.html): ý nghĩa các tùy chọn board/flash/upload.
