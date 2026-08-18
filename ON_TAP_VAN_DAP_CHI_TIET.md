# Ôn tập vấn đáp chi tiết — Smart Privacy Locker

> Cập nhật: 2026-08-18
>
> Dùng cho nhóm 12: Thái Quang Huy — 24127177, Nguyễn Văn Minh — 24127205,
> Mai Phương Thùy — 24127249.

Tài liệu này giúp cả nhóm hiểu và bảo vệ sản phẩm bằng kiến thức thật. Không
học thuộc máy móc một đoạn văn; giảng viên có thể đổi điều kiện, hỏi chéo phần
tích hợp hoặc yêu cầu chỉ ngay vào code/mạch. Theo quy định đồ án, mức hiểu khi
vấn đáp ảnh hưởng hệ số `K`; vì vậy “chức năng chạy” nhưng không giải thích được
vẫn có thể làm giảm điểm cá nhân.

## 1. Bốn nguyên tắc khi trả lời

1. **Nói đúng mức bằng chứng.** Phân biệt “test tự động đạt”, “người lắp ráp đã
   quan sát”, “đã test live trước đây” và “chưa test E2E cuối”.
2. **Trả lời từ nguyên nhân đến hệ quả.** Ví dụ: servo kéo dòng xung lớn → rail
   có thể sụt áp → ESP32 brownout → cần nguồn, dây, tụ và phép đo phù hợp.
3. **Không che giới hạn.** SG90 là chốt quay nhưng không có feedback góc; ACK
   không tự chứng minh chốt đã tới vị trí. MC-38 chỉ đo cửa OPEN/CLOSED.
4. **Chỉ nhận phần việc thật.** Mỗi người phải biết phần tích hợp chung nhưng
   không nhận code/evidence của thành viên khác là của mình.

## 2. Trạng thái trung thực phải nhớ

### 2.1. Có thể khẳng định

- Source firmware, Node-RED, Dashboard, Supabase, simulator và Wokwi hiện diện
  trong repository và đã được rà soát.
- Native firmware đạt 28/28 test; clean PlatformIO ESP32 build dùng 16,4% RAM
  và 84,5% flash; Arduino mirror 32 tệp đồng bộ và compile đạt.
- Node suite đạt 177/177; simulator đạt 28 assertion trên 22 scenario; broker
  cục bộ có xác thực đạt 18 assertion; audit dependency/config không có finding.
- Chrome/CDP audit đạt 18 check ở 1280 × 720 và exact 320 × 800: action gates,
  auth privacy, focus, effective target, reduced motion, biểu đồ/bảng, polling
  và không tràn ngang với classic scrollbar.
- Người lắp ráp đã quan sát riêng lẻ OLED, DHT22, MC-38/Telegram, 10 WS2812B và
  SG90 hoạt động.
- Mapping as-built hiện tại: servo khóa chốt `80°`, mở chốt `170°`; buzzer active-low
  dùng VCC 3.3 V, GPIO26 qua 4.7 kΩ.

### 2.2. Chưa được khẳng định

- chưa thể nói toàn hệ thống E2E thật đã PASS;
- chưa có bảng đo nguồn/tải đồng thời hoàn chỉnh; P1-05 được người dùng chấp
  nhận cho demo, nhưng không được gọi là measured PASS;
- chưa chốt jack, công tắc, phân phối và bảo vệ nhánh bằng phép đo;
- chưa đủ bằng chứng còi GPIO26 phát/tắt, ACK/state, cold boot và full-load;
- chưa chứng minh servo không kẹt trong mọi chu kỳ hoặc cửa chống bị cạy;
- các gate live Supabase/Telegram/Gemini/email có bằng chứng lịch sử, nhưng
  audit ngày 2026-08-18 không chạy lại toàn bộ trên dịch vụ thật;
- `playwright-cli` riêng lẻ không chạy được trên Node 24 do assertion upstream;
  đây là giới hạn tool đã ghi, không phải bằng chứng giao diện fail.

Một câu trả lời tốt khi bị hỏi “sản phẩm hoàn tất chưa?” là:

> Phần mềm và từng linh kiện chính đã có bằng chứng mạnh ở các mức khác nhau,
> nhưng nhóm chưa gọi sản phẩm là final-release-ready vì còn còi tích hợp, các
> chu kỳ vật lý và luồng E2E thật. Gate nguồn P1-05 đã được chấp nhận riêng cho
> demo, không phải kết quả đo. Nhóm dùng
> `HUONG_DAN_TEST_END_TO_END.md` để đóng các gate này trước khi nộp.

## 3. Bài giới thiệu mẫu

### 3.1. Phiên bản 30 giây

> Smart Privacy Locker là mô hình tủ riêng tư dùng ESP32. MC-38 cung cấp trạng
> thái cửa; SG90 khóa/mở chốt quay; người dùng đóng/mở cánh cửa; WS2812B và buzzer là đầu ra; DHT22
> hiển thị cục bộ trên OLED. ESP32 giao tiếp MQTT với Node-RED, còn Dashboard
> dùng Supabase Auth và ownership để người dùng chỉ điều khiển tủ của mình. Sự
> kiện được lưu ở Supabase, hiển thị lịch sử/biểu đồ, có cảnh báo Telegram, báo
> cáo email và chatbot Gemini được grounding bằng dữ liệu tin cậy.

### 3.2. Phiên bản 2 phút

> Hệ thống chia thành bốn lớp. Lớp vật lý có MC-38, SG90, WS2812B, buzzer,
> DHT22 và OLED. Firmware ESP32 chạy loop không chặn, boot an toàn, debounce
> cửa, kiểm tra command schema và phát ACK/state tương quan. MQTT v1 dùng topic
> theo locker; command không retained, state/availability retained, có LWT và
> `GET_STATE` để hòa giải khi QoS0 mất ACK. Node-RED là trust boundary: xác thực
> Bearer token, kiểm tra owner, tạo command ID và không để browser giữ MQTT hay
> service-role credential. Supabase RLS là lớp bảo vệ độc lập cho dữ liệu.
>
> Khi MC-38 mở trái phép, detector tạo một episode, yêu cầu `ALARM_ON`, lưu sự
> kiện và gửi Telegram theo liên kết riêng của đúng owner. Dữ liệu lịch sử được
> tổng hợp theo 7/30 ngày và dùng cho email ngày trước đó cũng như câu trả lời
> Gemini đã giới hạn intent/facts. Điểm nhóm đặc biệt lưu ý là SG90 open-loop:
> ACK sau thời gian settle chỉ xác nhận chu kỳ điều khiển logic; MC-38 mới là
> tín hiệu cửa vật lý. Sản phẩm hiện dùng tay servo làm chốt quay nhưng không có
> feedback góc, nên nhóm không suy diễn ACK thành bằng chứng cơ khí tuyệt đối.

### 3.3. Phiên bản 5 phút

Trình bày theo thứ tự:

1. vấn đề: theo dõi/điều khiển một tủ riêng tư và phát hiện mở trái phép;
2. sơ đồ hai chiều bắt buộc của đề;
3. thiết bị vào/ra và pin map;
4. firmware an toàn, non-blocking và MQTT contract;
5. Node-RED auth/ownership/ACK/timeout;
6. Supabase history/RLS, Telegram, email và Gemini;
7. demo một input→frontend và một frontend→output;
8. test/evidence;
9. giới hạn và hướng cải tiến.

Không dành cả 5 phút đọc danh sách thư viện. Chỉ nêu version khi được hỏi về
tái lập hoặc tương thích.

## 4. Sơ đồ hệ thống phải tự vẽ lại được

```text
                         ┌──────── Supabase Auth ────────┐
                         │                               │
Người dùng ── Browser/Dashboard ── Bearer token ── Node-RED/FlowFuse
                                                   │      │
                                             owner/RLS    ├── Supabase events/settings
                                                   │      ├── Telegram Bot API
                                                   │      ├── Gemini API
                                                   │      └── SMTP daily report
                                                   │
                                                   MQTT broker
                                                   │
                                           ESP32 Smart Locker
                                ┌──────────────┼───────────────┐
                              MC-38         SG90/LED/buzzer   DHT22→OLED
                           input vật lý       output vật lý    local only
```

### 4.1. Hai luồng bắt buộc

```text
Input → ESP32 → MQTT → backend → frontend
MC-38 → GPIO27 → door telemetry/state → Node-RED → Dashboard/history
```

```text
Frontend → backend → MQTT → ESP32 → output
Dashboard → Node-RED auth/owner → command → ESP32 → SG90/WS2812B/buzzer
```

Giảng viên có thể hỏi “DHT22 có đi lên cloud không?”. Câu đúng là **không**:
YC1 cố ý local `DHT22 → ESP32 → OLED`; firmware không publish topic nhiệt độ
hoặc độ ẩm.

## 5. Phân công theo đề xuất

| Thành viên | Chức năng đăng ký | Phải trình bày sâu |
|---|---|---|
| Thái Quang Huy — 24127177 | CB2, YC1, YC3, YC12 | SG90, DHT/OLED, WS2812B, WiFiManager và phần firmware tích hợp liên quan |
| Nguyễn Văn Minh — 24127205 | CB1, YC6, YC8, YC9 | MC-38, unauthorized detector/Telegram, Gemini grounding, Auth/ownership/RLS |
| Mai Phương Thùy — 24127249 | CB3, YC4, YC5, YC7 | buzzer, persistence/history, chart 7/30 ngày, daily email |

Mỗi người vẫn phải giải thích được contract chung, vì một chức năng E2E luôn
đi qua phần của nhiều người. “Em không làm nên em không biết” không phải câu trả
lời tốt cho interface mà phần mình trực tiếp dùng.

## 6. Pin map và ý nghĩa điện

| Thiết bị | Nguồn | GPIO | Ý nghĩa |
|---|---|---:|---|
| DHT22 | 3.3 V | 4 | data; pull-up lên 3.3 V nếu module chưa có |
| SG90 | rail tải 5 V | 18 | PWM/control signal; không cấp dòng servo từ GPIO |
| OLED SSD1306 | 3.3 V | SDA 21, SCL 22 | I2C; pull-up không được lên 5 V |
| WS2812B | rail tải 5 V | DI 25 | data qua 330–470 Ω gần DIN; tụ 470–1000 µF gần tải |
| Active buzzer LOW-trigger | ESP32 3.3 V | I/O 26 | active-low, signal qua 4.7 kΩ |
| MC-38 | dry contact về GND | 27 | `INPUT_PULLUP`; mapping LOW=CLOSED phải test thật |

GPIO 0, 2, 12 và 15 được tránh vì liên quan boot strapping; GPIO34–39 chỉ input
nên không dùng cho output. ESP32 là logic 3.3 V, vì vậy không đưa tín hiệu 5 V
trực tiếp vào GPIO.

## 7. Kiến thức vật lý và điện tử cần thuộc bản chất

### 7.1. Định luật và công thức

| Khái niệm | Công thức | Cách liên hệ sản phẩm |
|---|---|---|
| Định luật Ohm | `V = I × R` | điện trở hạn dòng/độ sụt áp trên dây và contact |
| Công suất | `P = V × I` | chọn adapter, dây, switch và đánh giá nhiệt |
| Sụt áp dây | `V_drop = I × R_wire` | servo/LED kéo dòng lớn làm điện áp tại tải thấp hơn đầu nguồn |
| Năng lượng tụ | `E = 1/2 × C × V²` | tụ hỗ trợ xung ngắn nhưng không cấp đủ công suất liên tục |
| Điện tích tụ | `Q = C × V` | tụ lớn hơn lưu nhiều điện tích ở cùng điện áp |
| Hằng số RC | `τ = R × C` | minh họa lọc/bounce; firmware đang debounce theo thời gian ổn định |
| Dự phòng nguồn | `I_supply ≥ 1.25 × I_continuous_max` | chính sách acceptance của dự án, còn phải kiểm peak/stall |

### 7.2. Điều phải nói chính xác

- Adapter 5 V/3 A không “đẩy 3 A” vào mọi linh kiện; tải lấy dòng theo mạch,
  miễn là điện áp đúng và nguồn đủ khả năng cung cấp.
- Nguồn dòng lớn không tự gây cháy, nhưng short, sai điện áp, dây/connector yếu
  hoặc thiết bị lỗi có thể kéo dòng nguy hiểm; cần bảo vệ và định mức.
- Common GND tạo cùng mốc 0 V cho signal. Không chung GND, mức HIGH/LOW ở phía
  nhận không có tham chiếu đáng tin cậy.
- Tụ 470 µF giảm transient/noise gần WS2812B, nhưng không sửa được adapter thiếu
  dòng hoặc dây quá mảnh.
- Điện trở 470 Ω nối tiếp data WS2812B giảm ringing/inrush vào input và bảo vệ
  phần nào đường signal; nó không phải điện trở hạn dòng cho nguồn LED.
- 4.7 kΩ của buzzer nằm trên đường I/O để giới hạn/giảm rủi ro dòng input; vẫn
  phải test module thật vì mạch trigger bên trong clone có thể khác.
- Pull-up DHT22 giữ đường data ở HIGH khi không thiết bị nào kéo xuống; pull-up
  phải về 3.3 V để bảo vệ GPIO.

### 7.3. Servo PWM

SG90 nhận chuỗi xung điều khiển lặp lại; độ rộng xung được ánh xạ thành góc bởi
thư viện. Nó không được điều khiển bằng cách cấp “170 V” hay thay đổi nguồn DC
theo góc. `170°/80°` là giá trị lệnh, còn góc/lực thật phụ thuộc servo, horn,
nguồn và cơ khí. Stall current thường lớn hơn dòng không tải, nhưng phải lấy
giá trị từ datasheet đúng specimen hoặc đo an toàn, không dùng một con số mạng
cho mọi SG90 clone.

### 7.4. I2C

I2C dùng SDA/SCL kiểu open-drain/open-collector: thiết bị kéo LOW, điện trở kéo
lên tạo HIGH. Nhiều thiết bị dùng chung hai dây và phân biệt bằng địa chỉ; OLED
thường là `0x3C` nhưng phải scan part thật. Pull-up lên 5 V có thể đưa mức quá
cao vào ESP32 dù OLED được quảng cáo “hỗ trợ 5 V”.

### 7.5. MC-38 và debounce

MC-38 là reed contact thụ động, không tự xuất logic 3.3 V. `INPUT_PULLUP` kéo
GPIO27 HIGH khi hở; contact nối GND khi đóng. Công tắc cơ/reed có thể rung quanh
chuyển trạng thái, nên firmware chỉ phát event sau trạng thái ổn định 50 ms.
Boot là `UNKNOWN` để không báo sai trước khi có mẫu ổn định.

## 8. Firmware phải giải thích được

### 8.1. Vì sao loop không chặn?

Wi-Fi, MQTT, servo completion, debounce, DHT/OLED và buzzer phải tiến triển gần
đồng thời. Nếu dùng `delay()` dài trong callback, MQTT keepalive/reconnect và
sensor có thể bị đói. Thiết kế lưu state/timestamp, mỗi vòng xử lý một bước nhỏ.

### 8.2. Safe boot

State lạnh:

```json
{"door":"UNKNOWN","lock":"UNKNOWN","alarm":"INACTIVE","led":"OFF"}
```

Servo không attach/move trong `setup()`, buzzer được đưa về inactive, LED off,
không replay command cũ. Đây là lựa chọn an toàn vì retained state chỉ là last
known, không đủ quyền làm actuator chạy sau reboot.

### 8.3. Chu trình command

1. Node-RED tạo UUID, thời gian, requester đã xác thực.
2. ESP32 parse JSON và kiểm schema, UUID, locker/topic, action, timestamp.
3. Nếu duplicate đã hoàn tất, replay ACK cache với `duplicate:true`, không chạy
   actuator lần hai.
4. Nếu hợp lệ, controller bắt đầu state machine.
5. Sau completion/settle, state manager cập nhật và phát ACK + full state.
6. Node-RED chỉ hoàn tất pending nếu ID, locker, action và expected state khớp.

Cache firmware mặc định giữ 16 command kết quả gần nhất trong RAM; reboot làm
mất cache nhưng command là non-retained/clean session nên không bị broker replay.

### 8.4. Giới hạn timestamp và cách đã harden

Sau khi NTP hợp lệ, firmware chặn command quá cũ hơn 120 giây và command xa
hơn 30 giây trong tương lai. Quá cũ trả `STALE_COMMAND`; quá xa tương lai trả
`INVALID_ISSUED_AT`. Khi NTP chưa sync, firmware không giả vờ biết wall-clock:
nó dựa thêm command non-retained, clean session và backend timeout. Đây là giới
hạn trung thực, không phải bỏ kiểm tra sau khi đồng hồ đã đáng tin cậy.

## 9. MQTT và đồng bộ phải giải thích được

### 9.1. Topic/retain

| Topic | Retained? | Vì sao |
|---|---:|---|
| `command` | Không | tránh lệnh actuator cũ chạy lại khi reconnect |
| `ack` | Không | kết quả tương quan theo pending hiện tại, không phải state mới nhất |
| `state` | Có | client mới nhận last-known full state |
| `heartbeat` | Không | chứng minh application liveness hiện tại; không tạo history online lặp |
| `telemetry/door` | Không | transition event, không phải replay log |
| `availability` | Có | biểu diễn ONLINE/OFFLINE hiện tại; LWT hỗ trợ mất kết nối bất thường |

### 9.2. Tại sao ACK nếu đã có MQTT?

Publish thành công chỉ cho biết client đã chuyển packet theo khả năng của nó,
không chứng minh ESP32 nhận và output hoàn tất. ACK có `command_id` nối request
với kết quả. Với QoS0, ACK vẫn có thể mất, nên timeout không được biến thành
success; backend gửi một `GET_STATE` để reconcile.

### 9.3. Retained state có phải realtime không?

Không. Nó là last-known. Phải kết hợp availability, timestamp/freshness và
connection generation. UI hiện đã xử lý door/wifi stale thành UNKNOWN nhưng
còn giữ lock/alarm/LED cũ theo cách gây hiểu nhầm; đây là lỗi audit đang mở.

### 9.4. LWT

ESP32 đăng ký retained LWT `OFFLINE`; broker publish nếu kết nối mất bất thường.
Sau reconnect và subscribe send-level thành công, firmware publish ONLINE rồi
full state. PubSubClient 2.8 không cho code đọc SUBACK grant/reject, nên ACL
broker phải được kiểm tra như điều kiện deployment.

## 10. Backend, dữ liệu và bảo mật

### 10.1. Trust boundary

Browser đăng nhập Supabase Auth và gửi `Authorization: Bearer <access token>`
đến route bảo vệ. Node-RED xác minh token, lấy identity từ token và kiểm owner;
browser không được tự gửi `requested_by` đáng tin. Browser không chứa MQTT
password hay service-role key và không publish thẳng ESP32.

### 10.2. Vì sao cần cả ownership check và RLS?

Ownership check ngăn command/API sai từ backend; RLS là defense-in-depth ở
database nếu một query/application path sai. Service-role bypass RLS nên chỉ
được giữ server-side và các thao tác của nó phải dùng identity/locker đã kiểm
tra.

### 10.3. Event idempotency

Mỗi normalized event có UUID `event_id`; Supabase insert dùng khóa đó để không
ghi trùng. Unauthorized OPEN tạo hai ý nghĩa: `DOOR_OPENED` để đếm lượt mở và
`UNAUTHORIZED_OPEN` để đếm cảnh báo. Một episode OPEN ổn định được dedupe đến
khi CLOSED.

### 10.4. Telegram

Không có Chat ID global. Owner yêu cầu deep link một lần, token tồn tại 10 phút
và chỉ hash được lưu. Webhook phải có secret header, private `/start` mới consume
token atomically. Browser chỉ thấy metadata đã làm sạch, không thấy Chat ID.
Cảnh báo Telegram chạy bất đồng bộ; còi không chờ provider.

### 10.5. Gemini grounding

Raw câu hỏi không được trao quyền truy cập tùy ý. Backend phân loại một trong
sáu intent/câu hỏi canonical, tự lấy facts live/history đúng owner và tính số
liệu; Gemini chỉ diễn đạt trên context whitelist. Provider lỗi trả 503 an toàn,
không sửa state.

### 10.6. Báo cáo email

Scheduler tính ngày địa phương trước đó theo timezone, reserve một delivery
duy nhất trên `(locker_id, channel, report_date)` và giới hạn retry. Lỗi chắc
chắn chưa gửi có thể retry; trạng thái SMTP mơ hồ chuyển `delivery_unknown` và
không tự gửi lại để tránh người dùng nhận hai email.

## 11. UI/UX: điểm mạnh và lỗi đã khắc phục

### 11.1. Điểm mạnh đã kiểm tra

- giao diện responsive ở 320 CSS px, không document overflow ngang;
- cấu trúc heading/lang tốt;
- tab order và skip link hợp lý;
- focus ring 3 px nhìn thấy;
- target tương tác đạt ngưỡng 24 × 24 CSS px/spacing;
- live regions và reduced-motion hiện diện;
- thiết kế màu/khối thông tin tương đối rõ, low-noise.

### 11.2. Các correction phải giải thích được

1. Command/delivery status có bảng dịch đầy đủ và fallback an toàn, không lộ raw enum.
2. Spinner dùng màu border riêng, vẫn giữ accessible status và khóa cùng domain.
3. Public config retry mỗi 5 giây; auth fail-closed cho đến khi cấu hình hồi phục.
4. No-data/stale lock, alarm và LED chuyển thành unknown; stale khóa control.
5. Auth có một submit theo mode; full-name chỉ ở registration và autocomplete đúng.
6. UI nói “đóng/mở cửa” và “vị trí tay servo”; MQTT v1 enums giữ nguyên để tương thích.

Khi demo, nếu thấy hành vi cũ thì không cắt video để che. Phải giải thích đó là
version mismatch giữa source/generated FlowFuse/browser cache, sửa deployment
và chạy lại. Giới hạn SG90 open-loop vẫn còn dù câu chữ UI đã đúng.

## 12. Kịch bản demo vấn đáp 8–10 phút

### Chuẩn bị trước

- chọn account/locker thử, xóa dữ liệu gây nhiễu;
- kiểm nguồn, pin, common GND và nhiệt;
- mở Serial Monitor/log đã redaction;
- mở Dashboard desktop và Telegram test;
- có video dự phòng kèm timestamp/commit nếu mạng lỗi;
- đặt cửa CLOSED, alarm inactive, LED off;
- không để secret trong tab, history terminal hoặc ảnh nền.

### Trình tự

1. Chỉ sơ đồ và nói hai luồng bắt buộc.
2. Đăng nhập, chỉ owner/locker và fresh state.
3. Bật/tắt 10 LED; chỉ ACK/state và LED thật.
4. Đóng cửa bằng tay, khóa/mở chốt SG90 ở `80°/170°`; chỉ rõ MC-38 xác nhận cửa
   chứ không xác nhận góc chốt.
5. Mở trái phép; quan sát event, buzzer, Dashboard và Telegram.
6. Mở lịch sử/biểu đồ; hỏi chatbot một câu live và một câu history.
7. Chỉ email sandbox/record ngày trước đó.
8. Ngắt Wi-Fi/broker ngắn theo kế hoạch; chỉ offline/stale và recovery.
9. Kết thúc bằng evidence và giới hạn chốt open-loop.

Nếu phần cứng kẹt, ngắt nguồn trước; không cố lặp lệnh trước giảng viên.

## 13. Ngân hàng câu hỏi và đáp án

### Nhóm A — mục tiêu, phạm vi và kiến trúc

#### Câu 1. Sản phẩm giải quyết vấn đề gì?

Nó cho phép chủ sở hữu theo dõi trạng thái cửa, điều khiển các output và nhận
cảnh báo khi cửa mở trong lúc chốt logic đang `LOCKED`. Nó là mô hình IoT học thuật về cảm
biến–cloud–giao diện, không phải chứng nhận an ninh thương mại.

#### Câu 2. Vì sao gọi là “privacy locker” thay vì chỉ “smart box”?

Vì có ownership, lịch sử, cảnh báo riêng theo người dùng và kiểm soát truy cập
digital. Bản hiện tại có chốt quay bằng servo nhưng không có cảm biến góc, nên
“lock” trong UI là state hoàn tất chu trình chốt, không đồng nghĩa chống cạy.

#### Câu 3. Hai luồng nào đáp ứng yêu cầu đề bài?

MC-38 tạo luồng input→ESP32→MQTT→Node-RED→Dashboard/history. Dashboard tạo
luồng frontend→Node-RED→MQTT→ESP32→SG90/LED/buzzer. DHT→OLED là luồng local bổ
sung chứ không thay luồng cloud bắt buộc.

#### Câu 4. Vì sao không cho Dashboard publish MQTT trực tiếp?

Nếu làm vậy browser phải giữ broker credential và có thể tự giả requester/topic.
Node-RED tập trung auth, ownership, validation, timeout và audit trước khi phát
lệnh, giảm trust đặt vào client.

#### Câu 5. Vì sao chia firmware/backend/database thay vì viết tất cả trên ESP32?

ESP32 phù hợp realtime thiết bị và hoạt động local; backend phù hợp identity,
API/provider và điều phối; database phù hợp lịch sử/RLS. Tách lớp giúp mỗi trust
boundary rõ và test được độc lập.

#### Câu 6. DHT22 có dữ liệu trên Dashboard không?

Không theo phạm vi hiện tại. DHT22 chỉ đi qua EnvironmentMonitor đến OLED; đó
là quyết định contract, không phải thiếu topic ngoài ý muốn.

#### Câu 7. Ai là source of truth cho live state?

Trong firmware, `state_manager` giữ full device state. Trên cloud, Node-RED
cache state đã validate cùng freshness/availability; retained MQTT chỉ là
last-known. Supabase là source of truth cho lịch sử bền vững, không phải trạng
thái actuator realtime.

#### Câu 8. Tại sao cần `schema_version`?

Nó cho phép producer/consumer nhận biết hợp đồng và từ chối payload không tương
thích. Thay đổi phá vỡ field/type/semantics phải dùng version mới và cập nhật
đồng thời fixtures, firmware, backend và tài liệu.

#### Câu 9. Tại sao dùng Node-RED?

Nó phù hợp orchestration IoT, MQTT/HTTP/provider và deployment FlowFuse, nhưng
logic quan trọng vẫn được tách thành module JS/testable thay vì chỉ dựa vào dây
flow trực quan. Lựa chọn này giúp demo flow và vẫn có test semantic.

#### Câu 10. Nếu cloud mất thì tủ còn gì?

DHT/OLED local vẫn có thể cập nhật; firmware giữ loop và reconnect có backoff.
Điều khiển Dashboard/Telegram/history không khả dụng; command không được queue
retained để tự chạy muộn khi mạng trở lại.

#### Câu 11. Chức năng nào thuộc từng phase?

Phase 1 xây firmware/output/WiFiManager; Phase 2 thêm door/security/auth/chatbot;
Phase 3 thêm buzzer/data/chart/email và giao diện cuối. Interface Phase 2 vẫn
giữ ownership dù Phase 3 nối adapter persistence/UI.

#### Câu 12. Thước đo “hoàn thành” là gì?

Không chỉ compile. Phải có test contract, build, live service trong scope, test
phần cứng, hai luồng E2E, failure/recovery, nguồn tải đầy và evidence gắn đúng
phiên bản.

### Nhóm B — nguồn, wiring và thiết bị

#### Câu 13. Vì sao có rail 5 V và rail 3.3 V riêng?

SG90/WS2812B là tải 5 V, còn OLED/DHT/GPIO/buzzer specimen dùng 3.3 V. Tách
rail tránh đưa 5 V vào input ESP32 và giúp phân phối/đo tải rõ hơn.

#### Câu 14. Vì sao vẫn nối chung GND?

Signal voltage là hiệu điện thế so với GND. Không chung tham chiếu, HIGH 3.3 V
từ ESP32 có thể không được module hiểu đúng và dòng hồi không có đường xác định.

#### Câu 15. Adapter có cần sẵn nút I/O không?

Không. Có thể dùng công tắc DC rời trên dây dương, đúng định mức; jack chỉ nối
nguồn, không chia nguồn. Rút jack cũng ngắt điện nhưng kém thuận tiện và có thể
làm connector mòn.

#### Câu 16. Vì sao phải đo cực jack 5.5 × 2.5 mm?

Kích thước cơ khí không đảm bảo center-positive và chân hàn không luôn trực
quan. Đảo cực có thể phá module/tụ; phải dùng continuity và DC voltage để xác
nhận tâm/vỏ và chân.

#### Câu 17. Vì sao không cấp servo từ 3V3 ESP32?

Servo cần rail khoảng 5 V và dòng xung/stall lớn hơn khả năng regulator 3.3 V
của board. Dùng 3V3 có thể sụt áp, reset hoặc làm hỏng regulator.

#### Câu 18. Vì sao nguồn servo ngoài vẫn phải nối GND ESP32?

GPIO18 điều khiển servo dựa trên mốc GND. Common GND cho đường signal/hồi dòng
logic; không có nghĩa phải nối hai đầu dương nguồn với nhau.

#### Câu 19. Tụ 470 µF làm gì?

Nó đặt gần rail LED để cung cấp/thu transient ngắn và giảm nhiễu/sụt áp cục bộ.
Năng lượng hữu hạn `1/2CV²`, nên không thay adapter/dây đủ dòng.

#### Câu 20. Điện trở 470 Ω trước DIN làm gì?

Nó giảm ringing/reflection và dòng xung vào input đầu tiên, đặc biệt với dây
dài/cạnh nhanh. Đặt gần DIN; nó không nối tiếp đường nguồn 5 V của strip.

#### Câu 21. 3.3 V data có chắc điều khiển WS2812B 5 V không?

Không chắc cho mọi exact part/rail. Direct-D chỉ được chấp nhận nếu datasheet
và test specimen cho thấy ổn định; đường robust dùng 74AHCT125 hoặc hai gate
74HCT14 phù hợp. `SN74HC125N` thuần HC không tự có ngưỡng TTL như AHCT.

#### Câu 22. Tại sao hai inverter 74HCT14?

Một inverter đảo bitstream và làm protocol sai logic; hai inverter nối tiếp
khôi phục polarity đồng thời tạo cạnh/level phù hợp. Phải buộc input không dùng
vào mức xác định.

#### Câu 23. Vì sao DHT22 có pull-up?

Bus một dây dùng các pha kéo LOW và release; pull-up tạo HIGH khi release. Nếu
module đã có pull-up thì không nhất thiết thêm; mọi pull-up thấy bởi GPIO phải
lên 3.3 V.

#### Câu 24. OLED dùng SCK hay SCL?

Breakout có thể ghi `SCK` nhưng ở mode I2C chân đó là clock SCL. Dự án nối GPIO22
cho clock và GPIO21 cho SDA; không phải bus SPI theo cấu hình hiện tại.

#### Câu 25. Vì sao buzzer VCC 3.3 V dù ban đầu dự kiến 5 V?

Specimen LOW-trigger/TMB12A05 đã được bench quan sát inactive ổn định ở 3.3 V,
và direct input với ESP32 an toàn hơn về mức logic. Đây là hiệu chỉnh wiring
theo module thật; vẫn phải đo active current/sound và full-load trước nghiệm thu.

#### Câu 26. Active-low nghĩa là gì?

I/O LOW kích hoạt, HIGH tắt. Firmware cấu hình `SPL_BUZZER_ACTIVE_HIGH=0` và phải
đặt inactive ngay lúc boot để tránh còi kêu ngoài ý muốn.

#### Câu 27. Điện trở 4.7 kΩ có cấp nguồn cho buzzer không?

Không. VCC/GND cấp module; 4.7 kΩ chỉ nằm giữa GPIO26 và chân điều khiển I/O.
GPIO không được cấp dòng tải buzzer.

#### Câu 28. Vì sao tránh GPIO0/2/12/15?

Đó là các strapping pin có thể ảnh hưởng mode boot tùy board/mức lúc reset.
Dùng output/module ở đó tăng rủi ro không boot; dự án chọn các GPIO ít xung đột.

#### Câu 29. GPIO34–39 có dùng cho LED/buzzer được không?

Không trên ESP32 cổ điển vì chúng chỉ input. Chúng có thể đọc sensor phù hợp
nhưng không drive output.

#### Câu 30. Làm sao biết MC-38 LOW là CLOSED?

Đo continuity khi nam châm gần/xa và quan sát GPIO với `INPUT_PULLUP`. Mapping
candidate là LOW=CLOSED, nhưng lắp ngược vị trí/loại contact có thể đổi hành vi;
phải test as-built.

#### Câu 31. Vì sao servo phải detach sau di chuyển?

Thiết kế giảm giữ lực/jitter/nhiệt và chỉ attach khi có lệnh. Đổi lại, nếu cơ
cấu chốt cần holding torque thì có thể bị dịch chuyển; đó là lý do phải test cơ
khí và không suy diễn ACK thành vị trí chốt đã đo.

#### Câu 32. Làm sao chứng minh servo đã đến vị trí?

SG90 không có feedback trong mạch này, nên firmware không đo được trực tiếp.
Video xác nhận chuyển động chốt; MC-38 chỉ xác nhận kết quả cửa. Cải tiến có thể
thêm limit switch/encoder hoặc đo dòng/kẹt.

#### Câu 33. Tại sao số pixel ảnh hưởng nguồn?

Tổng dòng tăng theo số pixel, màu và brightness; 10 pixel khác một pixel Wokwi.
Phải dùng exact strip/datasheet và đo scenario release, không nhân một giá trị
ước lượng từ clone khác rồi gọi là chắc chắn.

#### Câu 34. Vì sao breadboard chưa phải phân phối nguồn cuối tốt?

Contact/rail có giới hạn dòng không rõ, dễ lỏng và có đoạn rail bị ngắt. Với
servo/LED, terminal, dây đúng định mức, strain relief và branch protection đáng
tin cậy hơn.

#### Câu 35. Kiểm tải đồng thời như thế nào?

Bật 10 LED, chạy servo, còi, Wi-Fi/MQTT và sensor cùng lúc; đo tại nguồn và tải,
quan sát reset/flicker/nhiệt. Lặp 20 chu kỳ và soak; không cố tình stall servo.

### Nhóm C — firmware, MQTT và độ tin cậy

#### Câu 36. Vì sao lock cold boot là UNKNOWN?

ESP32 không có feedback vị trí và không nên tin state cũ sau mất nguồn. UNKNOWN
trung thực hơn và tránh tự chạy servo chỉ để “đồng bộ” một giá trị lưu.

#### Câu 37. Vì sao alarm/LED cold boot không UNKNOWN?

Firmware chủ động đưa chúng về trạng thái an toàn inactive/OFF, nên biết output
được yêu cầu tắt. Lock/door phụ thuộc cơ khí/sensor nên bắt đầu UNKNOWN.

#### Câu 38. Debounce 50 ms xử lý gì?

Nó yêu cầu mẫu OPEN/CLOSED giữ ổn định đủ thời gian trước khi commit transition.
Điều này lọc rung contact nhưng vẫn phải test biên 50 ms và wrap `millis()`.

#### Câu 39. Tại sao không dùng `delay(2000)` cho servo?

Controller lưu deadline settle và loop kiểm tra. Nhờ vậy MQTT, Wi-Fi và sensor
tiếp tục chạy trong lúc servo di chuyển.

#### Câu 40. ACK thành công có nghĩa cơ khí thành công không?

Không hoàn toàn. Nó nghĩa controller nhận lệnh, bắt đầu và hết chu kỳ settle
không gặp lỗi logic đã phát hiện. Không có position/current feedback nên jam
vẫn có thể ACK success; MC-38/video là bằng chứng vật lý bổ sung.

#### Câu 41. Tại sao command có UUID?

Để correlation ACK/pending, dedupe và audit. Cùng một UUID là cùng một request;
lệnh mới phải dùng UUID mới.

#### Câu 42. Duplicate command được xử lý ra sao?

Nếu kết quả đã cache, firmware replay chính ACK gốc và thêm `duplicate:true`,
không chạy output lại. Duplicate khi servo còn pending bị bỏ qua đến completion,
không bắt đầu movement thứ hai.

#### Câu 43. Nếu ESP32 reboot thì cache duplicate còn không?

Không, cache ở RAM. Rủi ro được giảm bởi command non-retained, clean MQTT
session và backend không retry actuator sau timeout.

#### Câu 44. Vì sao command không retained?

Retained actuator command có thể tự chạy khi ESP32 reconnect/reboot, rất nguy
hiểm. Recovery dùng `GET_STATE`, không replay ý định cũ.

#### Câu 45. Vì sao state retained?

Subscriber mới cần last-known state mà không chờ hành động tiếp theo. Nhưng
phải kiểm availability/freshness vì retained không chứng minh thiết bị live.

#### Câu 46. Vì sao telemetry door không retained?

Nó là edge/transition event; retain sẽ khiến restart trông như event mới. Full
state retained đã giữ trạng thái cửa gần nhất, còn history dùng event ID/idempotency.

#### Câu 47. QoS0 có vấn đề gì?

Packet có thể mất và không có broker-level delivery guarantee. Thiết kế dùng
correlated application ACK, timeout, no actuator retry và `GET_STATE` reconcile;
vẫn phải chấp nhận outcome mơ hồ nếu ACK mất sau hành động.

#### Câu 48. Tại sao timeout là 5 giây?

Nó lớn hơn thời gian actuator settle 2.000 ms và có dư cho mạng/backend, nhưng
vẫn giới hạn UX. Đây là config/contract; tăng timeout tùy tiện không sửa nguyên
nhân mất ACK.

#### Câu 49. Tại sao không retry LOCK/UNLOCK tự động?

Không biết lệnh đầu đã chạy hay chưa; retry có thể gây chuyển động lặp hoặc
nguy hiểm. Query state an toàn hơn, rồi người dùng quyết định lệnh mới.

#### Câu 50. `GET_STATE` có làm actuator chạy không?

Không. Nó ACK và publish full state hiện tại; không suy diễn hay hiệu chỉnh cơ
khí.

#### Câu 51. LWT hoạt động khi nào?

Broker phát OFFLINE retained khi connection chết không graceful. Khi mất điện,
`sent_at` của LWT là lúc đăng ký chứ không phải lúc broker phát, nên backend ghi
`observed_at` lúc nhận.

#### Câu 52. Reconnect backoff là gì?

Khoảng thử bắt đầu 1 giây và nhân đôi đến tối đa 30 giây. Nó tránh busy loop/
flood broker nhưng vẫn phục hồi tự động.

#### Câu 53. Nếu broker từ chối subscribe ACL thì sao?

PubSubClient 2.8 chỉ biết packet subscribe đã gửi, không expose SUBACK grant.
Vì vậy broker ACL phải được kiểm tra deployment-side; local send success không
chứng minh broker cấp quyền wildcard/topic.

#### Câu 54. NTP chưa sync thì stale command xử lý ra sao?

Firmware không giả timestamp và không áp age check dựa trên thời gian vô lý;
nó dựa thêm command non-retained, clean session và backend timeout. Sau NTP
plausible mới chặn lệnh quá cũ.

#### Câu 55. Lỗi future timestamp là gì?

Khi NTP đã sync, validator giới hạn tương lai mặc định 30 giây. Xa hơn trả
`INVALID_ISSUED_AT`; regression test bao phủ cả đúng biên và vượt biên. Khi chưa
sync, không thể áp wall-clock bound đáng tin cậy và phải nói rõ điều đó.

#### Câu 56. ACK sai locker/action xử lý thế nào?

Dispatcher không hoàn tất pending vì correlation phải khớp. Runtime hiện trả
`accepted:false`, ghi diagnostic bounded với code/topic/locker/command và không
ghi raw payload/secret. ACK lỗi nhưng tương quan đúng vẫn đóng đúng pending ở
trạng thái failure và refresh reported state.

#### Câu 57. Restart Node-RED làm gì với pending?

Xóa pending, completed IDs, legacy authorization window phía backend và cache
freshness trong RAM. Không thể đánh dấu command cũ success; durable
event/settings/delivery vẫn ở Supabase. Quyền một lần còn sống trên ESP32 không
bị backend đoán lại: telemetry OPEN hiện tại mang boolean `authorized` do
firmware quyết định.

#### Câu 58. Vì sao state payload luôn đầy đủ?

Consumer nhận một snapshot nhất quán thay vì ghép nhiều retained topic có thời
điểm khác nhau. ACK cũng kèm complete state để đối chiếu kết quả.

#### Câu 59. Firmware có log secret không?

Thiết kế không nên log credential; placeholder config còn ngăn reconnect thay
vì in secret. Khi demo phải redaction SSID/token/URL nhạy cảm trong serial/log.

#### Câu 60. Cách test wrap-around `millis()`?

Native test đưa timestamp gần giới hạn 32-bit và kiểm phép so sánh deadline
wrap-safe. Không chờ thiết bị chạy 49 ngày để mới test.

### Nhóm D — auth, dữ liệu, thông báo và AI

#### Câu 61. JWT/Bearer token đi đâu?

Browser nhận từ Supabase Auth và gửi qua Authorization header đến Node-RED.
Node-RED xác minh/tra user; token không đi MQTT, ESP32 hoặc event metadata.

#### Câu 62. Vì sao không tin `user_id` từ body?

Client có thể sửa body và giả người khác. Identity phải lấy từ token đã xác
thực; `requested_by` command được backend điền.

#### Câu 63. 401 khác 403 thế nào?

401 là thiếu/không hợp lệ session; 403 là đã xác thực nhưng không sở hữu locker
hoặc không được phép. Provider outage nên trả lỗi 503 có kiểm soát, không giả
thành sai mật khẩu.

#### Câu 64. Claim locker chống tranh chấp ra sao?

RPC/transaction database thực hiện claim atomic và chỉ owner rỗng mới được
gán; update owner tùy ý bị RLS/grant chặn. Hai request đồng thời không được cùng
thành công.

#### Câu 65. RLS bảo vệ bảng nào?

Profiles, owned lockers, event history, notification settings và dữ liệu liên
quan có policy owner; browser chỉ có grant cần thiết. Chi tiết phải chỉ được
migration/test, không chỉ nói “Supabase tự bảo mật”.

#### Câu 66. Service-role nguy hiểm ở điểm nào?

Nó có quyền cao và bypass RLS. Nếu lộ trong browser/Git, attacker có thể đọc/
ghi diện rộng; vì vậy chỉ Node-RED secret store giữ và không trả qua public config.

#### Câu 67. Làm sao chống event trùng?

`event_id` là idempotency key; insert conflict không tạo row thứ hai. Các retained
availability có timestamp dùng deterministic ID; payload không timestamp chỉ
cập nhật live cache, không persist để tránh replay thành history mới.

#### Câu 68. Vì sao unauthorized OPEN sinh hai event?

Một event mô tả sự kiện vật lý mở cửa, một event mô tả kết luận an ninh. Nhờ
vậy chart/report đếm lượt mở và cảnh báo theo semantics khác nhau.

#### Câu 69. Cửa sổ mở hợp lệ là gì?

Sau ACK `UNLOCK` khi cửa đóng, firmware cấp đúng một lượt OPEN trong 30 giây.
Cạnh `CLOSED→OPEN` đầu tiên consume quyền và arm auto-lock; khi người dùng đóng
cửa, cạnh `OPEN→CLOSED` ổn định làm servo tự về `80°`. Nếu không mở, đúng 30
giây firmware cũng tự khóa. Hai đường này chạy cục bộ và không sinh ACK giả.
Mở/ép lại mà chưa có quyền mới phải báo còi. Firmware gửi boolean `authorized`
trong telemetry nên backend restart không làm đổi kết luận; muốn mở hợp lệ lần
nữa phải chờ `LOCKED` rồi gửi lại `UNLOCK`.

#### Câu 69a. Vì sao boot thấy `CLOSED` không tự khóa ngay?

Mẫu ổn định đầu tiên chỉ khởi tạo trạng thái MC-38, không phải bằng chứng người
dùng vừa mở rồi đóng cửa. Auto-lock-on-close chỉ được arm sau một cạnh thật
`CLOSED→OPEN`; vì vậy cold boot luôn giữ `lock=UNKNOWN` và không làm servo chạy.
Lượt `UNLOCK` chưa dùng là trường hợp khác: nó có timer riêng và tự khóa đúng
biên 30 giây nếu cửa vẫn stable/raw `CLOSED`.

#### Câu 70. Nếu Telegram chậm, còi có chậm không?

Không. Detector dispatch `ALARM_ON` và Telegram theo đường tách; provider không
nằm trên critical path của actuator.

#### Câu 71. Vì sao không cho người dùng nhập Chat ID?

Chat ID khó dùng và có thể liên kết sai/người khác. One-time deep link + private
Start chứng minh quyền kiểm soát cuộc chat và lưu destination theo owner/locker.

#### Câu 72. Webhook secret bảo vệ gì?

Nó giúp Node-RED phân biệt update thật từ Telegram với request giả vào endpoint.
Vẫn cần token one-time/private chat/atomic consume; secret header không thay toàn
bộ authorization logic.

#### Câu 73. Token linking được lưu thế nào?

Lưu hash thay vì plaintext, có TTL 10 phút, one-time và consume atomic. Nếu DB
lộ, hash không trực tiếp là deep link sử dụng được như token plaintext.

#### Câu 74. Làm sao tránh spam Telegram?

Dedupe theo episode/locker, rate limit và bounded state; một OPEN kéo dài không
gửi vô hạn. Delivery status tách delivered/failed/suppressed/rate-limited.

#### Câu 75. Vì sao UI “failed” hiện sai là vấn đề?

Nó khiến người dùng tin cảnh báo còn đang xử lý thay vì biết đã thất bại, ảnh
hưởng quyết định an toàn. Backend status đúng chưa đủ; UI phải map mọi enum và
thông báo failure rõ.

#### Câu 76. History phân trang ra sao?

Backend dùng thứ tự xác định `(occurred_at,event_id)`, phân trang và dedupe
overlap. Safety ceiling trả lỗi controlled thay vì silently truncate dataset
lớn, giúp chart/chatbot không tính thiếu mà không báo.

#### Câu 77. Chart 7/30 ngày xử lý ngày không event thế nào?

Tạo bucket zero để trục thời gian liên tục. Biên ngày dùng timezone cấu hình và
khoảng half-open, tránh đếm trùng ở đúng nửa đêm.

#### Câu 78. Tại sao report lấy ngày trước đó?

Khi scheduler chạy trong ngày mới, ngày địa phương trước đó đã khép lại, cho
số liệu ổn định. Phải quy đổi timezone chứ không cắt ngày UTC tùy tiện.

#### Câu 79. Vì sao SMTP ambiguous không retry tự động?

Provider có thể đã nhận mail nhưng response/DB update bị mất. Retry có thể gửi
hai bản; `delivery_unknown` ưu tiên at-most-once trong tình huống không chắc.

#### Câu 80. Gemini có tự truy vấn database không?

Không. Backend quyết định intent, truy vấn owner-scoped facts, tính counts và
gửi context an toàn. Mô hình không nhận service-role/token và không được tự tạo
sự thật ngoài dữ liệu.

#### Câu 81. Prompt injection được giảm thế nào?

Raw câu người dùng không quyết định query/quyền; chỉ canonical intent allowlist
được định tuyến và context có cấu trúc. Cần tiếp tục coi model output là dữ liệu
không tin cậy và render text an toàn.

#### Câu 82. Nếu Gemini lỗi thì sao?

Trả 503/thông báo có kiểm soát, không fabricate câu trả lời và không sửa live
state/history. UI vẫn dùng được các phần không phụ thuộc AI.

#### Câu 83. Tại sao settings/history vẫn xem được khi ESP32 offline?

Đó là dữ liệu bền vững/owner-scoped trên cloud, không cần actuator live. Nhưng
physical command phải bị chặn khi availability/state không fresh.

#### Câu 84. Làm sao chứng minh user B không điều khiển locker A?

Dùng hai account/locker: API direct B→A trả 403, Supabase query zero row và MQTT
spy thấy zero command. Chỉ screenshot nút disabled không đủ vì attacker có thể
gọi API trực tiếp.

#### Câu 85. Tại sao migration phải chạy theo thứ tự?

Migration sau phụ thuộc schema/function/policy trước. Chạy lại sai project có
thể conflict hoặc làm lệch state; phải kiểm lịch sử migration và chỉ apply phần
chưa có trên đúng test project.

### Nhóm E — UI, test, lỗi và bảo vệ kết quả

#### Câu 86. Vì sao accessibility liên quan dự án này?

Dashboard là giao diện điều khiển/trạng thái; keyboard/focus/status rõ giúp
người dùng thao tác và nhận cảnh báo. Nó cũng làm UI dễ test, không chỉ là điểm
trang trí.

#### Câu 87. Spinner vô hình do đâu?

Nguyên nhân cũ là nút pending đặt `color: transparent` trong khi pseudo spinner
dùng `currentColor`, làm cả border trong suốt. Bản sửa dùng màu border độc lập;
Chrome đo spinner 17 px, opacity 1, đồng thời giữ `aria-busy` và status text.

#### Câu 88. Vì sao public-config 503 không retry là lỗi đồng bộ?

Backend có thể khởi động chậm hơn trang. Bản sửa disable auth khi chưa có config,
hiển thị lỗi có hành động, retry mỗi 5 giây và tự bật lại khi endpoint khỏe.
Chrome đã test 503 đầu tiên rồi recovery không reload.

#### Câu 89. Vì sao stale state không nên hiện như realtime?

Người dùng có thể hành động dựa trên alarm/lock/LED cũ. Vì vậy bản sửa ghi
unknown và disable toàn bộ actuator control khi stale; retained data vẫn chỉ là
last-known, không phải bằng chứng hiện tại.

#### Câu 90. Test unit có thay E2E không?

Không. Unit test chứng minh logic ở boundary giả lập; E2E chứng minh wiring,
network, identity, broker, provider và output thật tương tác đúng. Hai loại bổ
sung nhau.

#### Câu 91. Wokwi chứng minh được gì?

Pin mapping/logic/trình tự trong giới hạn mô hình. Nó không chứng minh dòng,
brownout, logic threshold của clone, lực servo, nhiệt hoặc contact thật.

#### Câu 92. 28/28 native test có nghĩa firmware không lỗi không?

Không. Nó chỉ chứng minh các case được viết chạy đúng trên native; clean ESP32
build và hardware/manual/fault tests vẫn cần. Coverage không bao phủ vật lý.

#### Câu 93. 177/177 Node test có nghĩa live service chắc chắn đúng không?

Không. Test xác nhận module/contracts; credential, ACL, migrations, provider và
deployment thật có thể lệch. Live gate cần project thử và evidence.

#### Câu 94. Tại sao lưu cả failure evidence?

Failure giúp tái hiện/root cause và chứng minh nhóm không cherry-pick. Sau sửa,
cần giữ before/after và test hồi quy; không xóa lịch sử để tạo cảm giác luôn PASS.

#### Câu 95. Vì sao không sửa snapshot evidence cũ?

Snapshot ghi kết quả tại thời điểm/phiên bản cụ thể. Sửa ngược làm mất integrity;
tạo record mới và link version mới. Gói VIVA có manifest còn bị phá hash nếu
sửa tùy ý.

#### Câu 96. Finding nghiêm trọng nhất hiện tại là gì?

Hai giới hạn chính là SG90 không có feedback góc và chưa có E2E thật đầy đủ.
Nguồn/tải đồng thời chưa đo nhưng P1-05 đã được người dùng chấp nhận riêng cho
demo; không được gọi ngoại lệ đó là measured PASS. Không có P0 source đã xác
nhận trong audit.

#### Câu 97. Vì sao audit và lượt sửa được tách trạng thái?

Audit đầu tiên đóng băng findings/evidence để có baseline tái hiện. Khi user yêu
cầu sửa, nhóm thêm regression, sửa source rồi tạo kết quả rerun mới thay vì sửa
ngược snapshot cũ. Cách đó giữ được before/after và tránh gọi finding cũ là
chưa từng tồn tại.

#### Câu 98. Nếu ACK timeout nhưng cửa đã mở thì báo gì?

Outcome mơ hồ/timeout, không success. Quan sát state/MC-38 và gửi `GET_STATE`;
không tự retry UNLOCK. UI nên hướng dẫn người dùng kiểm tra vật lý.

#### Câu 99. Nếu Telegram failed nhưng buzzer kêu thì YC6 có PASS không?

Luồng local alarm đã hoạt động nhưng delivery Telegram không đạt success case.
Ghi từng sub-result; cần một test delivered và một test failure-safe, không gộp
thành PASS toàn YC6 từ riêng còi.

#### Câu 100. Nếu adapter 3 A nhưng đo chỉ 0.8 A có sao không?

Không, nếu điện áp đúng và nguồn ổn; tải lấy 0.8 A ở scenario đó. Tuy nhiên phải
kiểm peak servo/combined và định mức dây/switch, không chỉ idle average.

#### Câu 101. Nếu servo nóng khi giữ cửa?

Ngắt test, kiểm binding/end stop và nhu cầu holding torque. Không tăng delay hay
ép góc; chỉnh cơ khí/góc hoặc thêm chốt tự giữ/cơ cấu phù hợp.

#### Câu 102. Nếu ESP32 reset khi LED và servo cùng chạy?

Khả năng cao rail sụt/nhiễu/ground path, nhưng phải đo để xác định. Kiểm nguồn,
dây/connector, điểm common GND, decoupling và branch distribution; không chỉ
thêm tụ ngẫu nhiên.

#### Câu 103. Nếu MC-38 báo ngược?

Đo contact/magnet, kiểm loại NO/NC và mounting, rồi sửa mapping/config có test.
Không đổi label UI để che wiring sai mà không cập nhật contract/evidence.

#### Câu 104. Nếu OLED không hiện nhưng DHT vẫn đọc?

Kiểm 3.3 V/GND, SDA21/SCL22, địa chỉ `0x3C/0x3D`, pull-up voltage và I2C scan.
Tách lỗi display khỏi sensor; không kết luận DHT lỗi chỉ vì OLED trống.

#### Câu 105. Nếu WS2812 pixel đầu đúng, các pixel sau sai?

Kiểm pixel count/order, data direction DIN/DOUT, nguồn dọc strip, solder và
exact protocol/part. Đo rail ở cuối strip và giảm brightness cho chẩn đoán,
nhưng cấu hình release vẫn phải test tải đầy đã chọn.

#### Câu 106. Nếu WiFiManager portal không hiện?

Kiểm serial, reset config bằng lệnh USB `R`, SSID `Locker-Setup`, phone captive
portal/192.168.4.1 và trạng thái non-blocking. Không đưa Wi-Fi password lên
Dashboard/cloud để workaround.

#### Câu 107. Nếu browser nói offline nhưng MQTT state retained còn ONLINE?

Đối chiếu availability LWT, observed time và freshness. Retained ONLINE cũ có
thể tồn tại nếu disconnect graceful/LWT issue; consumer không được dựa một field
đơn lẻ.

#### Câu 108. Nhóm sẽ cải tiến gì đầu tiên?

Đóng gate an toàn nguồn và E2E trước vì các P2 UI/status/retry, future-skew,
heartbeat và ACK anomaly đã sửa trong source. Về sản phẩm, ưu tiên feedback/
limit switch hoặc cơ cấu phù hợp để trạng thái vật lý không chỉ dựa timer servo.

#### Câu 109. Làm sao bảo đảm báo cáo trung thực?

Mọi claim map tới test ID/evidence/version; placeholder chưa có giữ `CHƯA CHỐT`.
Không dùng simulator làm phần cứng, không sửa snapshot, không lộ secret và mỗi
người xác nhận phần việc/điểm của mình.

#### Câu 110. Nếu giảng viên hỏi phần không thuộc mình?

Giải thích interface chung ở mức hiểu, rồi chỉ rõ ownership và nhờ thành viên
phụ trách bổ sung chi tiết. Không đoán API/điện áp/kết quả; có thể mở source hoặc
evidence để trả lời chính xác.

#### Câu 111. Vì sao nhấn `EN` thấy thiết bị rồi khoảng 30 giây sau mất tín hiệu?

Backend coi state cũ sau 30 giây là stale. Trước lượt sửa, thiết bị yên lặng chỉ
publish lúc connect/chuyển trạng thái nên có thể bị hiểu offline dù MQTT còn
sống. Bản hiện tại gửi heartbeat không retained rồi refresh retained full state
mỗi 10 giây; backend chỉ làm mới đúng `ONLINE` generation và không tạo history
online lặp. Nếu vẫn mất, kiểm topic/ACL/artifact/firmware version. Nếu serial
reboot hoặc báo brownout thì nguyên nhân là nguồn/tải, không phải heartbeat. AP
`Locker-Setup` tự biến mất sau 180 giây lại là timeout provisioning bình thường.

## 14. Câu hỏi gài nhanh

| Câu gài | Trả lời ngắn đúng |
|---|---|
| “Retained state nghĩa là online?” | Không; chỉ last-known, cần availability + freshness. |
| “Heartbeat một mình cho phép điều khiển?” | Không; vẫn cần ONLINE cùng generation và full state mới. |
| “MQTT publish thành công nghĩa actuator chạy?” | Không; phải có correlated ACK và bằng chứng vật lý. |
| “ACK success nghĩa cửa đã đóng?” | Chưa chắc; SG90 open-loop, dùng MC-38/feedback vật lý. |
| “Adapter 3 A sẽ ép 3 A?” | Không; tải lấy dòng, nhưng short/định mức vẫn phải bảo vệ. |
| “Tụ càng lớn càng giải quyết nguồn yếu?” | Không; tụ chỉ hỗ trợ transient, nguồn/dây phải đủ liên tục/peak. |
| “Có thể nối GND khác nhau?” | Signal cần common reference; phải chung GND theo topology an toàn. |
| “Buzzer active-low thì boot LOW?” | Không; boot phải inactive HIGH với cấu hình specimen này. |
| “DHT có trên MQTT?” | Không; local OLED theo YC1 hiện tại. |
| “Command nên retained để không mất?” | Không với actuator; có nguy cơ replay nguy hiểm. |
| “Timeout thì retry UNLOCK?” | Không tự động; `GET_STATE` reconcile. |
| “RLS đủ nên bỏ owner check?” | Không; dùng cả policy boundary và defense-in-depth DB. |
| “Service-role đưa frontend cho tiện?” | Tuyệt đối không. |
| “Gemini tự tính số lần mở?” | Không; backend tính facts, model chỉ diễn đạt. |
| “Wokwi đã PASS nghĩa nguồn thật ổn?” | Không. |
| “ACK khóa có chứng minh chốt đã vào khớp?” | Không; chốt servo open-loop không có cảm biến góc, cần quan sát cơ khí riêng. |

## 15. Tình huống chẩn đoán thực hành

### 15.1. Servo chạy làm ESP32 mất Wi-Fi

Trình tự trả lời:

1. xác nhận log reset/brownout/mất MQTT;
2. đo 5 V tại servo và 3.3 V tại ESP32 trong transient;
3. kiểm common-ground drop, dây, rail, connector và supply peak;
4. test servo riêng rồi combined;
5. sửa power distribution/root cause;
6. chạy lại P1-M03/full-load, không chỉ tăng timeout.

### 15.2. Dashboard treo ở “chưa cấu hình”

Kiểm Network xem `/api/v1/public-config` có tiếp tục 503 không. Bản hiện tại tự
retry mỗi 5 giây, giữ auth disabled và báo recovery; nếu chỉ có một request thì
deployment/cache đang cũ. Không hard-code config/secret vào HTML.

### 15.3. Người dùng B nhìn thấy history A

Đây là lỗi P0/P1 tùy dữ liệu; dừng release, thu hồi session nếu cần, lưu evidence
đã làm sạch, kiểm route ownership, token propagation, Supabase RLS/grants và
service-role query filter. Không chỉ ẩn card frontend.

### 15.4. Buzzer không kêu

Tách kiểm tra VCC 3.3/GND, trạng thái GPIO26 HIGH inactive/LOW active, series
4.7 kΩ, exact input label/pin, firmware active-low và dòng module. Không chuyển
VCC về 5 V tùy tiện; specimen đã được chọn cho direct 3.3 V prototype.

### 15.5. Telegram không gửi nhưng event có

Kiểm owner link enabled, destination lookup, webhook/link lifecycle, provider
response và delivery status. Alarm path phải vẫn hoạt động; sau test lỗi phải
khôi phục destination/config và gửi test success.

## 16. Phần mỗi thành viên phải tự chỉ được trong code

### Thái Quang Huy

- pin và config servo/DHT/OLED/LED;
- safe boot và state machine servo;
- local-only DHT/OLED path;
- WS2812 count/brightness/level shifting;
- WiFiManager portal/reset/NVS và boolean Wi-Fi đi lên state;
- vì sao `170°/80°` là calibration as-built, không phải chân lý mọi servo.

### Nguyễn Văn Minh

- MC-38 debounce/boot UNKNOWN/telemetry;
- authorized window và unauthorized episode;
- Telegram one-time link, owner destination, dedupe/failure;
- Auth Bearer, claim, owner check và RLS;
- sáu chatbot intent, facts/history grounding và provider failure.

### Mai Phương Thùy

- alarm controller active-low/safe boot/non-blocking;
- normalized event/persistence idempotency;
- migration/RLS/history pagination;
- 7/30-day timezone/zero bucket;
- scheduler ngày trước đó, delivery reservation/retry/unknown SMTP.

### Cả ba

- MQTT v1 topics/retain/ACK/timeout;
- hai luồng bắt buộc;
- trust boundaries và secret handling;
- nguồn/common GND/full-load;
- trạng thái evidence hiện tại và giới hạn chốt open-loop;
- demo/failure recovery.

## 17. Kế hoạch ôn trong ba buổi

### Buổi 1 — hiểu kiến trúc và phần cứng

- mỗi người tự vẽ sơ đồ hệ thống và pin map không nhìn tài liệu;
- giải thích common GND, rail, công suất, tụ, pull-up và servo;
- thực hành chỉ dây thật và nói điện áp trước khi chạm;
- hỏi chéo 35 câu nhóm A/B.

### Buổi 2 — code, dữ liệu và bảo mật

- mở code và trace một `UNLOCK` cùng một unauthorized OPEN;
- trace UUID từ HTTP đến MQTT ACK/history;
- giải thích RLS/service role/Telegram/Gemini/email;
- hỏi chéo câu 36–85, yêu cầu chỉ file/module chứ không chỉ nói miệng.

### Buổi 3 — demo và phản biện

- chạy đúng [HUONG_DAN_TEST_END_TO_END.md](HUONG_DAN_TEST_END_TO_END.md);
- mỗi người thuyết trình 2 phút, người khác giả làm giảng viên;
- cố tình tạo một timeout, stale UI hoặc provider failure an toàn;
- luyện nói giới hạn và không phóng đại;
- rà secret, ảnh/caption, tên PDF và evidence.

## 18. Checklist trước khi vào vấn đáp

- [ ] cả nhóm thuộc đúng họ tên/MSSV/phân công;
- [ ] mỗi người nói được pitch 30 giây và 2 phút;
- [ ] tự vẽ được hai dataflow;
- [ ] chỉ đúng pin/rail trên sản phẩm thật;
- [ ] giải thích được mọi điện trở/tụ/công tắc;
- [ ] biết safe boot, debounce, non-blocking, ACK, retain, LWT, timeout;
- [ ] biết auth/ownership/RLS/service-role;
- [ ] biết Telegram link/Gemini grounding/email idempotency;
- [ ] nói được bằng chứng nào PASS, PARTIAL, NOT RUN;
- [ ] nói rõ SG90 là chốt quay nhưng không có feedback góc; MC-38 chỉ đo cửa;
- [ ] biết ít nhất năm lỗi audit đã sửa, regression tương ứng và giới hạn vật lý còn lại;
- [ ] video/log dự phòng có version/timestamp và đã che bí mật;
- [ ] báo cáo đúng tên `12_24127177_24127205_24127249_FINAL.PDF`;
- [ ] không còn `CHƯA CHỐT` bị thay bằng claim không có evidence;
- [ ] mỗi thành viên xác nhận nội dung và điểm tự đánh giá của mình.

## 19. Câu kết thúc mẫu

> Điểm mạnh của dự án là contract rõ, safe boot, ownership/RLS nhiều lớp và
> test phần mềm có khả năng tái lập. Giới hạn hiện tại là cơ cấu servo open-loop
> không có feedback góc và gate E2E vật lý chưa đóng; P1-05 nguồn là ngoại lệ
> demo được chấp nhận chứ không phải measured PASS; các lỗi UI/liveness
> đã có correction và regression. Nhóm không xem simulator hay ACK logic là bằng chứng thay
> phần cứng; trước khi nộp, nhóm sẽ chỉ đánh dấu PASS cho các test có đo, log và
> video gắn đúng phiên bản.

Đọc thêm:

- [BAO_CAO_RA_SOAT_CODEBASE.md](BAO_CAO_RA_SOAT_CODEBASE.md)
- [HUONG_DAN_TEST_END_TO_END.md](HUONG_DAN_TEST_END_TO_END.md)
- [docs/architecture.md](docs/architecture.md)
- [docs/mqtt-contract.md](docs/mqtt-contract.md)
- [docs/event-contract.md](docs/event-contract.md)
- [hardware/pin-map.md](hardware/pin-map.md)
- [hardware/power-budget.md](hardware/power-budget.md)
- [tests/test-plan.md](tests/test-plan.md)
