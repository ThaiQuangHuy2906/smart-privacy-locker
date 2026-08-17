# Hướng dẫn kiểm thử End-to-End Smart Privacy Locker

> Cập nhật: 2026-08-17
>
> Trạng thái hiện tại: kiểm thử phần mềm tự động đạt; một số linh kiện đã được
> người lắp ráp quan sát hoạt động riêng lẻ; **chưa có bằng chứng đủ để kết luận
> toàn hệ thống E2E và tải đồng thời đạt**.

Tài liệu này là quy trình kiểm thử chính thức từ lúc chưa cấp nguồn đến lúc đủ
bằng chứng demo/nghiệm thu. Không thay thế hướng dẫn đấu dây trong
[HUONG_DAN_LAP_MACH_THEO_THU_TU.md](HUONG_DAN_LAP_MACH_THEO_THU_TU.md), ngân
sách nguồn trong [hardware/power-budget.md](hardware/power-budget.md), hay hợp
đồng MQTT trong [docs/mqtt-contract.md](docs/mqtt-contract.md).

## 1. Mục tiêu và tiêu chuẩn ghi kết quả

Một lần kiểm thử cuối chỉ được gọi là **E2E PASS** khi đồng thời chứng minh được:

1. phần cứng đúng điện áp, cực tính, GPIO và không reset khi tải đồng thời;
2. firmware nhận lệnh hợp lệ, điều khiển đúng, phát ACK/state đúng hợp đồng;
3. MQTT, Node-RED, Supabase và Dashboard truyền đúng dữ liệu, đúng chủ sở hữu;
4. Telegram, Gemini và email chạy đúng cả đường thành công lẫn lỗi có kiểm soát;
5. hai chiều bắt buộc của đề bài đều có bằng chứng:
   `input → ESP32 → MQTT → backend → frontend` và
   `frontend → backend → MQTT → ESP32 → output`;
6. hệ thống phục hồi đúng sau mất Wi-Fi, mất broker, khởi động lại và dữ liệu
   stale;
7. không có bí mật, thông tin cá nhân hoặc khóa dịch vụ xuất hiện trong ảnh,
   video, log hay Git.

### 1.1. Chỉ dùng năm trạng thái sau

| Trạng thái | Nghĩa chính xác |
|---|---|
| `PASS` | Đã chạy đúng thủ tục, đạt mọi điều kiện, có bằng chứng gắn với đúng phiên bản. |
| `FAIL` | Đã chạy nhưng ít nhất một điều kiện không đạt; không được đổi thành PASS bằng cách hạ tiêu chuẩn. |
| `BLOCKED` | Không chạy được vì thiếu phần cứng, tài khoản, quyền, mạng hoặc quyết định cụ thể. |
| `NOT RUN` | Chưa thực hiện. |
| `PARTIAL / USER-REPORTED` | Có quan sát hữu ích nhưng thiếu một phần thủ tục, phép đo, log hoặc truy vết E2E. |

Không dùng từ “đã kiểm tra” nếu chỉ biên dịch, mô phỏng hoặc quan sát một đầu
của luồng. Ví dụ, WS2812B sáng đúng 10 LED là bằng chứng tốt cho linh kiện,
nhưng chưa chứng minh ACK, state, nguồn tải đầy và phục hồi MQTT.

## 2. Ảnh chụp trạng thái hiện tại

| Hạng mục | Bằng chứng hiện có | Kết luận đúng mức |
|---|---|---|
| OLED SSD1306 | Người lắp ráp đã thấy hiển thị | `PARTIAL / USER-REPORTED` |
| DHT22 | Giá trị đã hiển thị trên OLED | `PARTIAL / USER-REPORTED` |
| MC-38 | Đã tạo thông báo Telegram | `PARTIAL / USER-REPORTED` |
| WS2812B | Đã sáng đúng số LED cấu hình | `PARTIAL / USER-REPORTED` |
| SG90 | Đã chạy ở khoảng đóng `170°`, mở `80°` | `PARTIAL / USER-REPORTED` |
| Còi LOW-trigger GPIO26 | Đã đấu VCC 3.3 V, GND và I/O qua 4.7 kΩ; trước đó chỉ xác nhận trạng thái không kích hoạt riêng lẻ | Chưa đủ bằng chứng còi phát âm, ACK/state, boot và tải đầy |
| Adapter/jack/phân phối nguồn | Jack 5.5 × 2.5 mm đã mua; chưa có kết quả đo hoàn chỉnh | `NOT RUN` cho gate nguồn ngoài |
| Phần mềm tự động | Native 20/20; Node 156/156; simulator 10 assertion/15 scenario; broker 17; audit 0; build ESP32/Arduino/Wokwi đạt | `PASS` trong phạm vi phần mềm |
| E2E thật toàn hệ thống | Chưa chạy trọn bộ theo tài liệu này | `NOT RUN` |

Servo hiện dùng tay đòn để trực tiếp đóng/mở cửa, không còn chốt khóa cơ khí.
Vì vậy trạng thái logic `LOCKED` trong mã hiện có nghĩa là “đã phát lệnh servo
đến góc đóng và hết thời gian di chuyển”, không chứng minh cửa chống bị mở và
không chứng minh servo không kẹt. Đây là giới hạn phải nói rõ khi demo.

## 3. An toàn bắt buộc trước khi thử

### 3.1. Quy tắc dừng ngay

Ngắt nguồn ngay nếu có một trong các dấu hiệu sau:

- mùi khét, linh kiện/dây/jack nóng nhanh hoặc tụ phồng;
- nguồn 5 V hoặc 3.3 V sai cực tính/sai điện áp;
- ESP32 reset liên tục, báo brownout hoặc cổng USB mất kết nối khi servo chạy;
- servo rung, kẹt, rít hoặc ép vào giới hạn cơ khí;
- WS2812B chớp bất thường khi bật nguồn;
- buzzer LOW-trigger không tắt ở trạng thái boot/inactive;
- dây hoặc breadboard mang dòng tải bị lỏng.

Không thử trực tiếp điện lưới. Chỉ dùng adapter DC SELV ổn áp. Không nối đầu ra
5 V của adapter vào chân `3V3`. Với kiến trúc hiện tại, ESP32 nhận nguồn USB;
SG90 và WS2812B nhận nguồn từ rail tải 5 V; mọi GND phải chung. Trước khi cắm
USB đồng thời với nguồn ngoài, xác nhận sơ đồ không back-feed nguồn.

### 3.2. Jack, công tắc và phân phối nguồn

- Jack 5.5 × 2.5 mm chỉ là đầu nối, **không phải mạch chia nguồn**.
- Adapter không bắt buộc phải tích hợp nút I/O. Có thể rút jack để ngắt điện,
  nhưng phương án khuyến nghị là công tắc DC riêng, đặt nối tiếp trên dây dương,
  có định mức điện áp/dòng cao hơn tải tính toán.
- Xác định chân tâm/vỏ và cực tính bằng đồng hồ; không đoán theo hình dáng jack.
- Dùng terminal/khối phân phối phù hợp và bảo vệ nhánh. Không dùng rail
  breadboard/Dupont làm đường cấp tải cố định nếu dòng thực tế vượt khả năng
  tiếp xúc của chúng.
- Tụ 470 µF phải đúng cực, điện áp định mức lớn hơn rail 5 V và đặt gần tải LED;
  tụ không thay thế nguồn thiếu dòng.

## 4. Những gì phải chuẩn bị

### 4.1. Thiết bị

- sản phẩm đã lắp, ESP32, cáp USB dữ liệu tốt;
- adapter ổn áp và jack đúng cỡ/cực tính;
- đồng hồ số có cầu chì và biết cách chuyển đúng cổng đo dòng;
- điện thoại để cấu hình Wi-Fi, Telegram và quay bằng chứng;
- máy tính có Arduino IDE, PowerShell, Git, Node.js 20+, PlatformIO;
- tài khoản thử riêng cho Supabase/Dashboard/Telegram/email;
- broker MQTT thử nghiệm có TLS/ACL hoặc broker cục bộ cho gate phần mềm;
- một nam châm/MC-38 bố trí đúng để tái lập OPEN/CLOSED;
- dụng cụ cách điện, terminal, công tắc và dây đúng định mức.

### 4.2. Phiên bản và tệp cấu hình

Ghi vào phiếu kiểm thử:

- commit hoặc mã snapshot nguồn;
- ngày/giờ và múi giờ `Asia/Ho_Chi_Minh`;
- mã ESP32/board revision và cổng COM thực tế;
- Arduino-ESP32 `2.0.17` cho release Arduino IDE;
- PlatformIO `espressif32@6.10.0` và các thư viện pin trong
  `firmware/platformio.ini`;
- Node.js thực tế (`node --version`) và lockfile hiện hành;
- số pixel `10`, độ sáng cấu hình, góc servo `170°/80°`;
- sơ đồ đấu dây/revision và danh sách part number thật;
- URL deployment/broker/project **không kèm bí mật**.

Các tệp cục bộ chứa bí mật phải nằm trong đường dẫn đã được Git ignore, ví dụ
`.env`, `firmware/include/secrets.h` và
`firmware/include/app_config.h`. Không chụp hoặc tải chúng lên cuộc trò chuyện.

## 5. Cấu trúc thư mục bằng chứng đề nghị

Tạo thư mục ngoài vùng tài liệu lịch sử đã có manifest, ví dụ:

```text
e2e-evidence-YYYYMMDD/
├── 00-session-summary.md
├── 01-as-built/
│   ├── top-view.jpg
│   ├── rails-and-jack.jpg
│   ├── gpio-closeups.jpg
│   ├── servo-open.jpg
│   └── servo-closed.jpg
├── 02-build/
│   ├── versions.txt
│   ├── firmware-native.txt
│   ├── firmware-build.txt
│   └── node-tests.txt
├── 03-hardware/
│   ├── rail-measurements.md
│   ├── component-smoke.mp4
│   └── combined-load.mp4
├── 04-e2e/
│   ├── mqtt-redacted.txt
│   ├── serial-redacted.txt
│   ├── dashboard.mp4
│   └── notifications-redacted/
├── 05-failures/
└── 06-release-checklist.md
```

Đổi tên hoặc che phần chứa SSID, email thật, UUID người dùng, token, URL có
query bí mật, Authorization header và Chat ID. Giữ timestamp/correlation ID
không nhạy cảm để ghép các đầu của cùng một luồng.

## 6. Gate E0 — xác nhận source và bí mật

Chạy từ thư mục gốc:

```powershell
git status --short
git rev-parse --short HEAD
git diff --check
git check-ignore -v .env firmware/include/secrets.h firmware/include/app_config.h firmware/.pio
node tools/check-markdown-links.js .
```

Điều kiện PASS:

- biết rõ mọi tệp đang sửa và không làm mất công việc chưa commit;
- các tệp bí mật thật sự bị ignore;
- không có lỗi whitespace do diff mới;
- liên kết Markdown nội bộ không gãy.

Không đưa nội dung `.env`, token, mật khẩu hoặc chứng thư riêng vào log bằng
chứng. Khi quét bí mật, xem từng match; tên biến mẫu không phải bí mật, còn
giá trị thật là sự cố phải dừng, xóa khỏi bằng chứng và rotate.

## 7. Gate E1 — kiểm thử phần mềm tái lập

### 7.1. Firmware native và build ESP32

```powershell
Set-Location firmware
pio test -e native
pio run -e esp32dev -t clean
pio run -e esp32dev
Set-Location ..
```

Kết quả chuẩn hiện tại:

- native: `20/20 PASS`;
- build: exit code 0, khoảng `16.2% RAM`, `84.3% flash`.

Nếu Xtensa làm hỏng đường dẫn Windows có ký tự tiếng Việt, dùng ánh xạ ổ tạm
ASCII được mô tả trong [firmware/README.md](firmware/README.md). Đây là hạn chế
toolchain/path, không phải lý do copy một bản nguồn khác rồi build lệch phiên
bản. Xóa ánh xạ sau khi dùng.

### 7.2. Đồng bộ và kiểm tra bản Arduino IDE

```powershell
.\arduino\sync-sketch.ps1 -IncludeLocalConfig
.\arduino\sync-sketch.ps1 -Check
.\arduino\verify-sketch.ps1
```

Điều kiện PASS: 30 tệp production mirror khớp byte-for-byte và build profile
pin thành công. Nếu dùng Arduino IDE GUI, chọn đúng board/options trong
[HUONG_DAN_CHAY_HE_THONG.md](HUONG_DAN_CHAY_HE_THONG.md).

### 7.3. Node-RED/backend/simulator/broker

```powershell
Set-Location node-red
npm ci
npm test
npm run test:simulator
npm run test:broker
npm run audit
npm audit --omit=dev --audit-level=low
Set-Location ..
```

Kết quả chuẩn hiện tại:

| Gate | Kết quả tham chiếu 2026-08-17 |
|---|---:|
| `npm test` | 156/156 PASS |
| simulator | 10 assertion / 15 scenario PASS |
| broker cục bộ có xác thực | 17 assertion PASS |
| audit cấu hình/bí mật | 0 finding |
| audit dependency production | 0 vulnerability |

`npm ci` thay đổi `node_modules` cục bộ nhưng không được sửa source. Nếu mạng
không có hoặc lockfile không thể cài, ghi `BLOCKED`, không tuyên bố suite đã
chạy. Simulator và broker cục bộ không thay thế ESP32 thật.

### 7.4. Wokwi

Build/chạy dự án trong
[wokwi/smart-privacy-locker-wokwi](wokwi/smart-privacy-locker-wokwi). Xác nhận
đây là mô phỏng có chủ ý, không phải mirror vật lý tuyệt đối:

- mô phỏng dùng 1 pixel thay vì 10 pixel thật;
- điện trở data có thể khác bản lắp 470 Ω;
- không có MQTT/NVS/reconnect như firmware production;
- safe boot không tự quay servo; trợ giúp và lệnh mô phỏng dùng đúng đóng
  `170°`, mở `80°`.

Chỉ ghi `WOKWI PASS`, không ghi `HARDWARE PASS`.

## 8. Gate H0 — kiểm tra phần cứng khi chưa cấp nguồn

Chụp ảnh toàn cảnh và ảnh cận, sau đó đánh dấu từng dòng:

- [ ] rail trên: một rail 5 V, một rail GND;
- [ ] rail dưới: một rail 3.3 V, một rail GND;
- [ ] các đoạn rail breadboard bị ngắt giữa đã được bridge nếu cần;
- [ ] mọi GND của ESP32, adapter, servo, LED, sensor và buzzer nối chung;
- [ ] không có 5 V nối vào `3V3`, GPIO hoặc I2C;
- [ ] OLED: VDD 3.3 V, GND, SDA GPIO21, SCL/SCK GPIO22;
- [ ] DHT22: `+` 3.3 V, `-` GND, OUT GPIO4; pull-up lên 3.3 V nếu cần;
- [ ] MC-38: một dây GPIO27, một dây GND; firmware dùng `INPUT_PULLUP`;
- [ ] WS2812B: 5 V, GND, DI GPIO25 qua 330–470 Ω gần DIN; tụ đúng cực;
- [ ] SG90: signal GPIO18; nguồn tải 5 V riêng; không cấp servo từ chân 3.3 V;
- [ ] buzzer: VCC 3.3 V, GND, I/O GPIO26 qua 4.7 kΩ; active-low;
- [ ] jack tâm/vỏ và cực tính đã đo continuity, không đoán;
- [ ] công tắc DC nằm trên dây dương và đủ định mức nếu được lắp;
- [ ] dây tải, terminal, mối hàn và cách điện chắc chắn;
- [ ] servo ở góc `80°/170°` không chạm end stop và không ép cơ cấu.

Điều kiện PASS: ảnh khớp [hardware/pin-map.md](hardware/pin-map.md), không có
short continuity giữa 5 V và GND/3.3 V và mọi điểm nghi ngờ đã được giải quyết.

## 9. Gate H1 — xác nhận nguồn trước khi gắn tải

1. Tháo SG90 và WS2812B khỏi rail tải.
2. Đặt đồng hồ ở DC voltage, xác nhận que/cổng đo đúng.
3. Cắm adapter vào jack, bật công tắc nếu có.
4. Đo ngay tại jack và hai đầu rail: điện áp, cực tính, độ ổn định.
5. Tắt nguồn, cắm từng tải, đo lại trước khi bật tải đồng thời.
6. Hoàn thành bảng trong [hardware/power-budget.md](hardware/power-budget.md).

Không đo dòng bằng cách đặt đồng hồ ở chế độ A song song trực tiếp hai rail;
đó là ngắn mạch. Đo dòng phải mắc nối tiếp đúng nhánh, đúng cổng và thang đo.
Nếu chưa được hướng dẫn sử dụng đồng hồ an toàn, nhờ giảng viên/người có kinh
nghiệm thực hiện phép đo dòng.

Điều kiện PASS:

- đúng cực và đúng phạm vi của part thật;
- nguồn liên tục có dự phòng tối thiểu theo chính sách `1.25 ×` tải liên tục;
- jack, switch, terminal, dây và bảo vệ nhánh đủ định mức;
- không back-feed giữa USB và nguồn ngoài;
- đã lưu ảnh đồng hồ và sơ đồ điểm đo.

## 10. Gate H2 — test từng linh kiện bằng firmware release

Mọi test sau phải dùng cùng firmware/config sẽ dùng khi demo, không dùng sketch
chẩn đoán riêng làm bằng chứng cuối.

### H2-01 — boot an toàn

1. Đặt cửa ở vị trí không gây va chạm.
2. Quay video servo, LED và buzzer từ trước khi cấp nguồn.
3. Cấp nguồn ESP32; mở Serial Monitor 115200.
4. Không gửi lệnh trong ít nhất 15 giây.

PASS khi servo không tự chạy/replay lệnh, LED off, buzzer im lặng, lock/door
khởi đầu `UNKNOWN` đúng điều kiện dữ liệu và không reset/brownout.

### H2-02 — OLED và DHT22

1. Quan sát ít nhất 10 chu kỳ cập nhật khoảng 2.5 giây.
2. So sánh nhiệt độ/độ ẩm với điều kiện phòng; ghi “plausible”, không tuyên bố
   độ chính xác chuẩn nếu chưa có thiết bị tham chiếu.
3. Tắt nguồn, tháo an toàn đường data DHT, bật lại để kiểm tra lỗi có kiểm soát.
4. Khôi phục dây và xác nhận tự hoạt động lại.

PASS khi OLED cập nhật ổn định, lỗi sensor không làm treo MQTT/ESP32 và không
có topic/card cloud DHT ngoài phạm vi thiết kế.

### H2-03 — MC-38

1. Xác nhận bằng đồng hồ trạng thái contact khi nam châm gần/xa.
2. Bật hệ thống và giữ mỗi trạng thái qua thời gian debounce.
3. Thao tác nhanh quanh biên debounce rồi thao tác ổn định.
4. Theo dõi serial, MQTT telemetry, retained full state và Dashboard.

PASS khi mapping vật lý CLOSED/OPEN đúng, một chuyển trạng thái ổn định chỉ tạo
một event, bounce không tạo bão event và cold boot không tự suy diễn sai trước
mẫu ổn định.

### H2-04 — WS2812B

1. Ghi exact part, số pixel 10, độ sáng, điện trở và đường Direct-D/Shifted-S.
2. Gửi `LED_ON`, `LED_OFF` qua backend, không điều khiển trực tiếp broker cho
   bằng chứng E2E.
3. Lặp 20 chu kỳ; khởi động nguội 10 lần.
4. Quan sát màu, đủ 10 pixel, flicker và boot flash; đo rail/dòng.

PASS khi cả output vật lý, ACK và state đồng ý; không flicker/sai màu/mất pixel.
Direct-D chỉ được chấp nhận cho đúng specimen và wiring đã test; nếu không ổn
định, dùng level shifter phù hợp.

### H2-05 — servo và cửa

1. Test không tải: `UNLOCK` đến `80°`, `LOCK` đến `170°`, xen kẽ 10 chu kỳ.
2. Lắp tay đòn vào cửa; kiểm tra cơ cấu bằng tay khi tắt nguồn.
3. Test có tải 20 chu kỳ, quay cả cửa, servo và Dashboard.
4. Đo sụt áp khi khởi động/đảo chiều; chạm kiểm tra nhiệt chỉ khi an toàn.
5. Dùng MC-38 làm bằng chứng cửa thật đã OPEN/CLOSED.

PASS khi không kẹt, rung, nóng hoặc reset; MC-38 xác nhận kết quả vật lý. ACK
servo chỉ chứng minh firmware hoàn tất chu kỳ lệnh sau thời gian settle vì SG90
không có feedback vị trí/dòng. Không gọi đây là khóa chống cạy nếu không có
chốt cơ khí.

### H2-06 — buzzer active-low

1. Quay video từ trước boot để chứng minh không kêu ngoài ý muốn.
2. Gửi `ALARM_ON` qua Dashboard; xác nhận GPIO26 active-low, âm thanh, ACK/state.
3. Gửi `ALARM_OFF`; xác nhận im lặng và state INACTIVE.
4. Lặp 20 lần, sau đó 10 cold boot.
5. Kích hoạt luồng MC-38 không được phép mở để chứng minh còi tự động không phụ
   thuộc Telegram.

PASS khi boot im lặng, ON/OFF lặp lại ổn định, không reset, không có điện áp
vượt mức GPIO và Telegram lỗi không ngăn còi kích hoạt.

## 11. Gate C0 — cấu hình cloud/broker an toàn

Thực hiện theo [docs/deployment-guide.md](docs/deployment-guide.md). Trước E2E:

- broker dùng tài khoản firmware riêng, ACL chỉ cho
  `locker/LOCKER-001/#`; Node-RED dùng credential tin cậy riêng;
- deployment từ xa dùng TLS/8883 và CA phù hợp; cấu hình mẫu firmware đã mặc
  định `MQTT_USE_TLS=true`; chỉ override 1883/non-TLS cho broker lab cô lập;
- Supabase migrations đúng thứ tự, RLS bật và test user/locker tách biệt;
- FlowFuse/Node-RED chỉ trả anon key và cấu hình public cần thiết cho browser;
- service-role, broker password, bot token, webhook secret, Gemini key và SMTP
  password chỉ tồn tại phía server/ignored environment;
- Telegram webhook dùng secret hợp lệ; bot linking chỉ cho private chat;
- dùng SMTP sandbox hoặc mailbox thử có quyền kiểm soát.

Chụp màn hình trạng thái nhưng che toàn bộ secret. Không gửi secret cho Codex
qua chat để “nhờ test”.

## 12. Gate E2E-A — input vật lý đến frontend

Luồng bắt buộc:

```text
MC-38 → ESP32 → MQTT telemetry/state → Node-RED → Supabase/cache → Dashboard
                                              └→ Telegram khi trái phép
```

### A1 — đóng/mở hợp lệ

1. Đăng nhập đúng owner, xác nhận Dashboard online/fresh.
2. Tạo cửa sổ mở khóa hợp lệ bằng lệnh mở qua Dashboard.
3. Đưa MC-38 sang OPEN trong cửa sổ.
4. Đưa về CLOSED.
5. Ghép timestamp ở serial, MQTT, Node-RED, database và Dashboard.

PASS khi event được phân loại hợp lệ, không kích hoạt báo động trái phép, lịch
sử owner đúng và không rò dữ liệu sang user khác.

### A2 — mở trái phép

1. Đảm bảo không còn cửa sổ mở khóa hợp lệ.
2. Chuyển MC-38 CLOSED → OPEN ổn định.
3. Giữ cửa mở rồi đóng lại.

PASS khi:

- một episode trái phép được tạo, không nhân bản bởi bounce;
- `ALARM_ON` được phát và còi kêu độc lập với Telegram;
- Telegram gửi đúng tài khoản đã link, trạng thái delivery đúng `delivered`
  hoặc `failed`;
- event lưu Supabase và xuất hiện đúng owner trên Dashboard;
- đóng cửa kết thúc episode theo contract;
- user khác không đọc được state/history/notification.

Dashboard hiện map `failed` thành “gửi thất bại”. Nếu deployment còn hiện
“đang xử lý”, dừng chụp bằng chứng và đồng bộ lại source/generated FlowFuse/
browser cache; vẫn đối chiếu API/database/provider để loại trừ version mismatch.

## 13. Gate E2E-B — frontend đến output vật lý

Luồng bắt buộc:

```text
Dashboard → Bearer auth/ownership → Node-RED → MQTT command → ESP32
          ← HTTP result/cache      ← ACK/state          ← SG90/LED/buzzer
```

Chạy lần lượt và dùng UUID/correlation ID riêng:

| Test | Thao tác UI | Output cần quan sát | State/ACK cần đối chiếu |
|---|---|---|---|
| B1 | Mở cửa | SG90 đến `80°`; MC-38 sau đó OPEN | `UNLOCKED` logic + door OPEN |
| B2 | Đóng cửa | SG90 đến `170°`; MC-38 sau đó CLOSED | `LOCKED` logic + door CLOSED |
| B3 | Bật đèn | đủ 10 pixel sáng | LED ON |
| B4 | Tắt đèn | toàn bộ pixel tắt | LED OFF |
| B5 | Kiểm tra còi | còi kêu | alarm ACTIVE |
| B6 | Tắt còi | còi im | alarm INACTIVE |
| B7 | `GET_STATE` sau reconnect | không tự làm actuator chạy | retained full state mới |

Mỗi hàng chỉ PASS khi đồng thời có video output, HTTP result, ACK đúng
`command_id`, retained state và không có reset. Nếu HTTP timeout nhưng actuator
đã chạy, ghi `FAIL/AMBIGUOUS`, không bấm lặp vô thức: QoS0 có thể mất ACK sau
hành động và hệ thống phải reconcile bằng `GET_STATE`.

Dashboard hiện dịch `COMMAND_SUCCEEDED`, có spinner pending nhìn thấy và khóa
hai nút cùng actuator domain. Nếu không thấy các hành vi này, artifact deploy
không cùng version với source; không dùng phiên đó làm bằng chứng release.

## 14. Gate E2E-C — tài khoản, ownership và RLS

Dùng hai user thử A/B và hai locker khác nhau:

1. đăng ký, xác nhận email và đăng nhập A;
2. claim locker A; xác nhận feedback 200;
3. claim lại hoặc claim locker đã thuộc người khác; xác nhận 409/deny;
4. đăng nhập B và thử URL/API trực tiếp của locker A;
5. subscribe spy broker khi B gửi lệnh bị cấm;
6. truy vấn Supabase bằng token B đối với row của A;
7. logout, reload và kiểm tra dữ liệu nhạy cảm bị xóa;
8. thử token hết hạn, malformed, provider timeout có kiểm soát.

PASS khi sai owner trả 403/không row, không publish MQTT, không rò state/history,
session lỗi được phân biệt với provider outage và service-role không xuất hiện
trong browser.

## 15. Gate E2E-D — Telegram, Gemini và email

### D1 — Telegram linking/lifecycle

- tạo deep link một lần, hết hạn sau 10 phút;
- chỉ private chat và đúng webhook secret được chấp nhận;
- nhấn **Start**, kiểm tra browser chỉ nhận trạng thái đã làm sạch;
- replay token đã dùng phải bị từ chối;
- disable/re-enable thông báo;
- disconnect và relink bằng tài khoản thử;
- gửi alert thành công và tạo một lỗi destination/provider có kiểm soát;
- xác nhận một attempt/episode và hệ thống còi không chờ Telegram.

### D2 — Gemini grounding

Hỏi đủ sáu câu canonical trong tài liệu chatbot, bao gồm trạng thái trực tiếp
và lịch sử. Kiểm tra câu trả lời chỉ dùng facts owner-scoped đã whitelist. Sau
đó cấu hình model/key sai trong môi trường thử và xác nhận 503 an toàn, không
làm hỏng cache/state. Khôi phục cấu hình rồi re-test.

### D3 — email hằng ngày

- bật setting cho user thử;
- tạo dữ liệu ở ngày địa phương trước đó, bao gồm biên nửa đêm;
- chạy scheduler đúng workflow thử;
- xác nhận một email, nội dung đúng facts và delivery row `delivered`;
- chạy lại để chứng minh chống gửi trùng;
- dùng recipient sandbox sai có kiểm soát để tạo definitive failure;
- xác nhận không đặt `sent_at` cho thất bại xác định;
- xóa dữ liệu thử sau khi lưu bằng chứng.

Không chạy scheduler hoặc migration trên production nếu chưa xác nhận project,
quyền và phạm vi. Gate live có thể làm phát sinh email/Telegram và dữ liệu.

## 16. Gate R — lỗi, reconnect và đồng bộ

Chạy từng kịch bản riêng, không dùng sleep tùy tiện thay cho trigger quan sát
được:

| ID | Tác động | Điều phải chứng minh |
|---|---|---|
| R1 | Tắt Wi-Fi rồi bật lại | LWT OFFLINE khi mất bất thường; retry có giới hạn; ONLINE + full state mới sau hồi phục. |
| R2 | Dừng broker rồi khởi động lại | pending cũ bị hủy an toàn; mỗi generation chỉ bootstrap một `GET_STATE`. |
| R3 | Restart ESP32 | không replay actuator; lock/door bắt đầu UNKNOWN theo contract; state fresh sau mẫu/lệnh mới. |
| R4 | Restart Node-RED | không coi pending cũ là thành công; cache/reconciliation phục hồi. |
| R5 | Mất ACK | UI/API timeout có kiểm soát; không retry actuator; một `GET_STATE` reconcile. |
| R6 | ACK sai/late/duplicate | không hoàn tất lệnh khác; ingestion trả `accepted:false` và ghi diagnostic bounded theo đúng code/correlation, không raw payload. |
| R7 | Command quá cũ | ESP32 từ chối. |
| R8 | Command có `issued_at` tương lai | Khi NTP đã sync: quá 30 giây phải bị `INVALID_ISSUED_AT`; trong giới hạn được xử lý bình thường. Khi chưa sync, ghi rõ time bound chưa thể áp dụng. |
| R9 | API public-config trả 503 khi startup | Auth submit/toggle bị disable, UI báo sẽ thử lại; sau 5 giây endpoint hồi phục thì UI tự sẵn sàng, không reload. |
| R10 | Không có dữ liệu/stale | Lock/alarm/LED hiện unknown, status nêu dữ liệu cũ và mọi actuator control bị khóa. |
| R11 | Không gửi command/không đổi cảm biến trong 45 giây | Quan sát ít nhất bốn heartbeat không retained và state refresh; Dashboard vẫn fresh qua mốc 30 giây, không tạo `DEVICE_ONLINE` history lặp. |

R11 là regression trực tiếp cho hiện tượng “nhấn `EN`, thiết bị xuất hiện rồi
mất tín hiệu”. Nếu heartbeat dừng nhưng serial vẫn chạy, kiểm firmware version,
ACL/subscription và FlowFuse artifact. Nếu serial cũng reboot hoặc có
`Brownout detector was triggered`, quay lại gate nguồn/tải. Nếu chỉ AP
`Locker-Setup` biến mất đúng sau 180 giây thì đó là timeout portal provisioning,
không phải heartbeat của thiết bị đã kết nối.

Mỗi lần fault injection phải có đường khôi phục và xác nhận cấu hình hợp lệ đã
được phục hồi. Không phá mạng, broker hoặc dịch vụ dùng chung của người khác.

## 17. Gate UI/UX và accessibility

Kiểm tra trên desktop 1280 × 720 và mobile 320 × 800:

- [ ] không tràn ngang tài liệu;
- [ ] H1/H2 có thứ tự rõ, `lang="vi"` đúng;
- [ ] tab order hợp lý và mọi hành động dùng được bằng bàn phím;
- [ ] skip link hiện rõ khi focus;
- [ ] focus indicator nhìn thấy;
- [ ] target tương tác ít nhất 24 × 24 CSS px hoặc có khoảng cách tương đương;
- [ ] status động được thông báo qua live region;
- [ ] `prefers-reduced-motion` giảm chuyển động;
- [ ] mobile không che nút/lịch sử/biểu đồ;
- [ ] trạng thái loading, empty, stale, offline, failure và success phân biệt rõ;
- [ ] password autocomplete đúng theo login/register;
- [ ] không có raw enum tiếng Anh ở giao diện người dùng.

Audit Chrome/CDP 2026-08-17 đã đạt cấu trúc, responsive, focus, effective
target, reduced motion, state stale/unknown, spinner, status localization,
auth-mode và config 503→recovery. Bộ DOM regression tương ứng nằm trong
`npm test`. `playwright-cli 0.1.18` trên Node `v24.14.1` bị assertion upstream
`UV_HANDLE_CLOSING` ở cả wrapper và direct command nên được ghi `UNAVAILABLE`,
không ghi PASS. Tiêu chí tham chiếu:
[WCAG 2.2](https://www.w3.org/TR/WCAG22/),
[Keyboard Accessible](https://www.w3.org/WAI/WCAG22/Understanding/keyboard.html),
[Focus Visible](https://www.w3.org/WAI/WCAG22/Understanding/focus-visible),
[Reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html),
[Status Messages](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html),
và [Target Size (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html).

## 18. Gate L — tải đồng thời và soak

Chỉ chạy sau khi từng linh kiện và nguồn riêng đã PASS:

1. bật đủ 10 LED ở cấu hình release;
2. duy trì Wi-Fi/MQTT và refresh Dashboard;
3. cho SG90 đóng/mở trong khi LED bật;
4. kích hoạt còi trong một phần chu kỳ;
5. tạo MC-38 OPEN/CLOSED và để OLED/DHT cập nhật;
6. đo 5 V tại nguồn và tại servo/LED, rail 3.3 V, tổng dòng;
7. chạy tối thiểu 20 chu kỳ chức năng hoàn chỉnh;
8. chạy tối thiểu 30 phút soak hoặc thời lượng do giảng viên yêu cầu;
9. thực hiện một reconnect Wi-Fi và một reconnect broker trong phiên;
10. quan sát nhiệt, reset, flicker, servo chatter, OLED lỗi và event trùng.

PASS khi toàn bộ tiêu chí trong `hardware/power-budget.md` đạt, không reset,
không mất đồng bộ kéo dài, mọi lệnh có kết quả hoặc timeout/reconcile đúng, và
không có connector/dây/module nóng bất thường.

## 19. Ma trận kết luận release

| Nhóm | Bắt buộc trước demo cuối | Cho phép simulator thay thế? |
|---|---|---|
| Build/native/Node/audit | Có | Không áp dụng |
| Wiring, rail, cực tính, dòng và nhiệt | Có | Không |
| OLED/DHT/MC-38/LED/SG90/buzzer thật | Có | Không |
| Hai luồng E2E bắt buộc | Có | Không |
| Auth/ownership/RLS | Có | Chỉ một phần; cần live project thử |
| Telegram/Gemini/email | Có nếu trình bày là chức năng hoàn tất | Mock không thay live delivery |
| Failure/reconnect/stale | Có | Simulator chỉ là bằng chứng bổ sung |
| UI desktop/mobile/keyboard | Có | Browser tự động là bằng chứng tốt, cần kèm demo thật |
| 20 chu kỳ + tải đồng thời | Có | Không |

Chỉ kết luận `FINAL_RELEASE_READY` khi không còn P1 blocker, mọi gate bắt buộc
PASS và failure được đóng hoặc chấp nhận bằng văn bản. Hiện tại dự án chưa đạt
mức này.

## 20. Mẫu biên bản cho mỗi test

```markdown
### Test ID: E2E-B2

- Ngày/giờ/múi giờ:
- Người test:
- Commit/snapshot:
- Firmware/config không bí mật:
- Board/COM:
- Wiring revision:
- Deployment/project thử:
- Điều kiện ban đầu:
- Các bước đã chạy:
- Kết quả quan sát:
- Timestamp/correlation ID:
- Điện áp/dòng liên quan:
- Bằng chứng: đường dẫn ảnh/video/log:
- Trạng thái: PASS | FAIL | BLOCKED | NOT RUN | PARTIAL
- Sai lệch/defect ID:
- Khôi phục/cleanup đã làm:
```

Một video dài không thay thế biên bản. Nên có đồng hồ/timestamp và thao tác
thực tế trong cùng khung hình; ghép với log có timestamp/correlation ID.

## 21. Cần cung cấp gì để Codex có thể kiểm tra E2E

Codex có thể tự kiểm tra source, build, test, browser và dịch vụ thử nếu môi
trường cục bộ có quyền truy cập. Codex không thể tự biết cửa thật đã đóng, rail
không sụt áp hoặc còi đã kêu nếu không có phần cứng truy cập được hay bằng
chứng do bạn cung cấp.

### 21.1. Gói source tối thiểu

Cung cấp một trong hai cách:

1. mở đúng thư mục Git bằng local environment của Codex; hoặc
2. tải ZIP snapshot source vào workspace.

Nếu repository có cấu hình local environment trong `.codex`, mở đúng project
root chứa thư mục đó. Theo OpenAI Docs, setup scripts/actions có thể chuẩn bị
dependency và lệnh build/test cho project; chúng không tự cung cấp file/secret
không nằm trong repository, nên vẫn phải đặt các giá trị test trong secret store
hoặc file ignored của đúng máy.

Gói phải có:

- toàn bộ source `firmware/`, `arduino/`, `node-red/`, `dashboard/`,
  `supabase/`, `tools/`, `wokwi/`, `hardware/`, `docs/`, `tests/`;
- `package.json`, lockfile, `platformio.ini`, migrations và script build/test;
- các file `*.example.*`, không có giá trị bí mật thật;
- đề bài/rubric/PDF và mọi tiêu chí chấm;
- danh sách commit/snapshot và thay đổi chưa commit cần giữ.

Không cần tải `node_modules`, `.pio`, binary build, cache, `.git` nếu dùng ZIP,
hay bản sao trùng lặp không phải source of truth. Nếu cần đánh giá lịch sử Git,
phải cung cấp repository Git thay vì ZIP.

Hướng dẫn chính thức của OpenAI về việc cho Codex làm việc với repo/môi trường
cục bộ nằm tại
[Local environments](https://learn.chatgpt.com/docs/environments/local-environment);
cách làm việc với file/artifact nằm tại
[Work with files](https://learn.chatgpt.com/docs/artifacts-viewer).

### 21.2. Thông tin phần cứng phải cung cấp

- ảnh toàn cảnh từ trên xuống, đủ thấy cả bốn rail;
- ảnh cận jack, cực tính, công tắc, terminal/phân phối và bảo vệ nhánh;
- ảnh cận từng GPIO và nhãn module;
- ảnh servo/cửa ở mở `80°` và đóng `170°`;
- mặt trước/sau của module, exact part number, datasheet chính hãng;
- số pixel và revision WS2812 thật;
- sơ đồ as-built có màu dây, không chỉ sơ đồ dự kiến;
- bảng đo điện áp/dòng ở idle, servo, LED, buzzer và tải đồng thời;
- video boot, 20 chu kỳ, reconnect và full-load;
- mô tả rõ đã bỏ chốt, tay servo trực tiếp đóng/mở cửa.

Che SSID, mật khẩu Wi-Fi, serial number nhạy cảm và địa chỉ nhà/phòng trong ảnh.

### 21.3. Log và bằng chứng số

- output đầy đủ của các lệnh Gate E1, kèm exit code;
- serial log 115200 có timestamp, đã redaction;
- MQTT transcript cho `command`, `ack`, `state`, `heartbeat`, `availability`,
  `telemetry`; giữ ít nhất 45 giây yên lặng để chứng minh heartbeat 10 giây qua
  mốc stale 30 giây;
- HTTP status/body đã làm sạch cho login, ownership, commands và alerts;
- ảnh/video Dashboard desktop/mobile;
- Supabase migration list và kết quả pgTAP/RLS từ project thử;
- Telegram webhook/link/delivery status đã che Chat ID/token;
- email sandbox delivery/failure và scheduler log;
- lỗi nguyên bản, bước tái hiện và trạng thái trước/sau; không chỉ gửi ảnh “không
  chạy”.

### 21.4. Quyền/môi trường cần thiết cho live test

Nếu muốn Codex tự chạy thay vì chỉ đánh giá bằng chứng, máy đang chạy Codex cần:

- truy cập được cổng COM của ESP32 và driver USB phù hợp;
- được phép flash firmware vào đúng board;
- mạng tới broker/FlowFuse/Supabase/Gemini/Telegram/SMTP sandbox;
- một deployment/project **test**, không phải production không xác định;
- test account A/B, locker ID thử và dữ liệu dùng một lần;
- quyền thực hiện các side effect cụ thể: gửi Telegram/email thử, ghi/xóa dữ
  liệu thử, deploy flow hoặc apply migration. Nếu chưa cho phép, Codex chỉ được
  kiểm tra read-only/phần mềm cục bộ;
- người dùng đứng cạnh sản phẩm để xác nhận âm thanh, chuyển động, nhiệt và đọc
  đồng hồ nếu không có thiết bị đo tự động nối máy.

Không đưa credential vào chat hoặc commit. Đặt chúng trong `.env`/secret store
đã ignore trên máy và chỉ xác nhận tên biến đã được cấu hình. Khi một quyền có
thể làm thay đổi dịch vụ thật, nêu rõ project/test scope trước khi yêu cầu chạy.

### 21.5. Mẫu tin nhắn bàn giao cho Codex

```text
Repo/snapshot: <commit hoặc ngày>
Mục tiêu: chạy các gate <ID> trong HUONG_DAN_TEST_END_TO_END.md
Cho phép: build/test/flash board COM<x>/gọi các dịch vụ ở project TEST <tên>
Không cho phép: production, gửi người thật, commit/push/deploy ngoài scope
Secrets: đã đặt cục bộ trong file ignore; không in giá trị
Hardware: sơ đồ revision <x>, servo 170/80, 10 LED, buzzer active-low 3.3 V
Test accounts/locker: tên định danh đã làm sạch
Bằng chứng vật lý: nằm tại <đường dẫn workspace>
Tiêu chí kết luận: mọi gate bắt buộc PASS; giữ nguyên mọi thay đổi chưa commit
```

### 21.6. Gói nào vẫn chưa đủ

Các trường hợp sau chỉ cho phép review hạn chế:

- chỉ có video nhưng không có commit/config/wiring revision;
- chỉ có source nhưng không có board/phần cứng;
- chỉ có token/password trong chat nhưng không có test scope — phải xóa/rotate;
- chỉ có screenshot “PASS” mà không có output, timestamp và lệnh;
- chỉ có simulator/Wokwi để thay thế servo/nguồn/MC-38 thật;
- chỉ có ảnh lắp mạch nhưng không có phép đo nguồn/tải;
- chỉ có production account mà không cho phép tạo/xóa dữ liệu thử.

## 22. Checklist cuối trước khi trình diễn

- [ ] mọi bí mật nằm ngoài Git và ngoài ảnh/log;
- [ ] pin map/as-built/power budget khớp sản phẩm thật;
- [ ] jack/công tắc/phân phối nguồn đã đo và được chấp nhận;
- [ ] từng linh kiện dùng firmware release đã PASS;
- [ ] boot an toàn và 20 chu kỳ/tải đồng thời đã PASS;
- [ ] E2E-A và E2E-B có correlation/timestamp từ đầu đến cuối;
- [ ] account B không đọc/điều khiển locker A;
- [ ] Telegram/Gemini/email có success và failure an toàn;
- [ ] reconnect/restart/stale không tạo trạng thái sai hoặc lệnh lặp;
- [ ] UI release đã qua config-retry/stale/status/spinner/auth-mode checks; nếu
  còn hành vi cũ thì dừng và sửa version/deploy/cache;
- [ ] báo cáo dùng thuật ngữ “tay servo đóng/mở cửa”, không tuyên bố có chốt;
- [ ] có kịch bản demo offline/fallback và bản sao bằng chứng;
- [ ] mọi `FAIL/BLOCKED/NOT RUN` còn lại được nói trung thực.

Khi checklist này hoàn tất, cập nhật
[BAO_CAO_RA_SOAT_CODEBASE.md](BAO_CAO_RA_SOAT_CODEBASE.md) và
[tests/test-plan.md](tests/test-plan.md) bằng đường dẫn bằng chứng mới. Không
sửa ngược các snapshot `tests/evidence/` cũ hoặc gói VIVA có manifest; tạo bản
ghi mới để giữ tính toàn vẹn lịch sử.
