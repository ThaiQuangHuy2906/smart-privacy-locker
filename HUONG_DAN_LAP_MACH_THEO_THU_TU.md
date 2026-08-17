# Lắp mạch Smart Privacy Locker theo đúng thứ tự

Đây là **nguồn hướng dẫn lắp mạch duy nhất** của dự án. Làm từ Bước 0 đến
Bước 12, không nhảy bước và không cắm/rút dây khi đang có điện. Mỗi bước chỉ
được coi là PASS khi đã đạt tiêu chí ghi ngay tại bước đó; nếu không đạt thì
ngắt nguồn và sửa đúng bước đang lỗi. Sau khi lắp xong, chuyển sang
[HUONG_DAN_CHAY_HE_THONG.md](HUONG_DAN_CHAY_HE_THONG.md) để chạy toàn bộ test
chấp nhận hệ thống.

Sau smoke test, dùng
[HUONG_DAN_TEST_END_TO_END.md](HUONG_DAN_TEST_END_TO_END.md) cho ma trận release,
đo tải đồng thời, fault recovery và bộ bằng chứng. Lắp đúng dây không tự động
đồng nghĩa E2E PASS.

## Cấu hình sản phẩm được dùng trong hướng dẫn này

- ESP32 được cấp nguồn bằng cáp USB-C có truyền dữ liệu.
- ESP32 DevKit 30 chân (`15 × 2`) được đặt **cạnh** breadboard, không cắm lên
  breadboard 830 lỗ; nối sang breadboard bằng dây jumper đực-cái.
- Adapter 5 V/3 A chỉ cấp nguồn cho servo SG90 và WS2812B.
- GND của adapter và GND của ESP32 phải nối chung.
- Chỉ dùng **một** SG90. Servo còn lại là dự phòng.
- Cấu hình local đang điều khiển **10 pixel WS2812B**
  (`WS2812_PIXEL_COUNT = 10`) ở độ sáng giới hạn; không mặc định bật toàn bộ
  dải 1 m.
- Không lắp `SN74HC125N` và MOSFET `4184` vào revision sản phẩm đã chọn. Nếu đường
  WS2812 direct không qua toàn bộ gate ở Bước 8, dừng và đổi sang đúng
  `SN74AHCT125N`; không thay bằng `SN74HC125N`.
- Active buzzer module LOW-level trigger dùng buzzer `TMB12A05` được cấp từ
  ESP32 `3V3`, **không cấp từ 5 V**. Tín hiệu cuối của dự án là `GPIO26` qua
  một điện trở nối tiếp 4,7 kΩ; `GPIO18` chỉ từng được dùng trong sketch thử
  độc lập và vẫn dành cho servo trong mạch hoàn chỉnh.
- Chỉ lắp buzzer sau khi đã đọc Bước 10 và rút toàn bộ nguồn.
- Không nối cực `+5V` của adapter vào chân `5V`/`VIN` của ESP32 trong cấu hình
  sản phẩm này.

### Ghi nhận lắp thực tế ngày 17/08/2026

Các kết quả dưới đây là quan sát chức năng do người lắp xác nhận, chưa thay cho
phép đo nguồn và full-load cuối:

- Breadboard 830 lỗ được quy ước hai rail trên là `+5V tải` và `GND chung`; hai
  rail dưới là `3V3` và `GND chung`.
- OLED (`VDD→3V3`, `GND→GND`, `SDA→GPIO21`, `SCK/SCL→GPIO22`), DHT22 ba chân
  (`+→3V3`, `-→GND`, `OUT→GPIO4`) và MC-38 (`GPIO27↔tiếp điểm↔GND`) đã hoạt
  động đúng trong thử nghiệm thực tế.
- WS2812B (`DI→GPIO25` qua 470 Ω, tụ 470 µF đúng cực ở đầu nguồn) đã sáng đúng
  10 pixel theo cấu hình local.
- SG90 ở `GPIO18` đã chạy với `170° = đóng cửa` và `80° = mở cửa`. Cơ cấu không
  còn chốt khóa; cánh tay servo trực tiếp đóng/mở cửa. Firmware vẫn giữ tên
  logic `LOCK`/`UNLOCK` để tương thích Dashboard và MQTT.
- Buzzer LOW-trigger đã được đấu `VCC/+→3V3`, `GND/-→GND`,
  `IN/S/I/O→GPIO26` qua 4,7 kΩ; kiểm thử tích hợp và safe-boot vẫn phải PASS.
- Nhánh nguồn ngoài vẫn là `PENDING` cho đến khi jack, công tắc/đường ngắt,
  điểm chia, dây tải và common GND được đấu rồi đo theo Bước 7 và kiểm thử
  full-load.

## Sơ đồ nối cuối cùng

| Thiết bị | Chân thiết bị | Nối tới |
|---|---|---|
| Rail dưới `3V3` | Đầu vào | ESP32 `3V3` |
| Rail dưới GND | Đầu vào | ESP32 `GND` |
| Rail trên GND | Đầu vào | Rail dưới GND và GND nguồn tải ngoài |
| Rail trên `+5V tải` | Đầu vào | Nhánh sau công tắc/điểm chia; không nối ESP32 `5V`/`VIN` |
| OLED SSD1306 I2C | `VCC` | Rail dưới `3V3` |
| OLED SSD1306 I2C | `GND` | Rail dưới GND |
| OLED SSD1306 I2C | `SDA` | ESP32 `GPIO21` |
| OLED SSD1306 I2C | `SCL` | ESP32 `GPIO22` |
| DHT22 | `VCC`/`+` | Rail dưới `3V3` |
| DHT22 | `DATA`/`S`/`OUT` | ESP32 `GPIO4` |
| DHT22 | `GND`/`-` | Rail dưới GND |
| MC-38 | Dây thứ nhất | ESP32 `GPIO27` |
| MC-38 | Dây thứ hai | Rail dưới GND |
| WS2812B | `+5V`/`5V` | Rail trên `+5V tải`, được cấp từ điểm chia ngoài |
| WS2812B | `GND`/`-` | Rail trên GND chung |
| WS2812B | `DIN`/`DI` | ESP32 `GPIO25` qua **một** điện trở 330 Ω hoặc 470 Ω |
| SG90 đóng/mở cửa | Dây tín hiệu cam/vàng/trắng | ESP32 `GPIO18` |
| SG90 đóng/mở cửa | Dây đỏ | Nhánh trực tiếp từ điểm chia `+5V tải` |
| SG90 đóng/mở cửa | Dây nâu/đen | Nhánh trực tiếp từ điểm chia GND tải |
| Nguồn tải ngoài | GND | Một chân `GND` của ESP32 |
| Active buzzer module LOW-trigger (`TMB12A05`) | `VCC`/`+` | Rail dưới `3V3` — **không nối 5 V** |
| Active buzzer module LOW-trigger (`TMB12A05`) | `GND`/`-` | Rail dưới GND |
| Active buzzer module LOW-trigger (`TMB12A05`) | `IN`/`S`/`I/O` | ESP32 `GPIO26` qua điện trở nối tiếp 4,7 kΩ |

Không dựa vào vị trí trái/phải trong ảnh trên mạng. Chỉ nối theo **chữ in trên
chính module**. Nếu chữ trên module khác bảng này, dừng lại và chụp rõ hai mặt
module trước khi nối.

## Bước 0 — Chuẩn bị và để toàn bộ mạch mất điện

1. Rút USB-C khỏi ESP32.
2. Rút adapter 5 V/3 A khỏi ổ điện và khỏi jack DC.
3. Tách cánh tay servo khỏi cửa hoặc đặt cửa ở vị trí không thể bị ép; tháo
   horn nếu nó có thể vướng vật khác.
4. Đặt breadboard trên mặt phẳng cách điện, tránh bản lề, cánh tay servo và
   phần kim loại.
5. Chuẩn bị cáp USB-C **có data**, đồng hồ vạn năng, dây nguồn chịu được dòng
   tải, đầu chia nguồn/terminal phù hợp, điện trở 330 Ω hoặc 470 Ω, **một điện
   trở 4,7 kΩ riêng cho tín hiệu buzzer** và tụ 470 µF. Nếu DHT22 cũng cần
   pull-up rời thì cần thêm một điện trở 4,7 kΩ khác; không dùng chung một điện
   trở cho hai tín hiệu.
6. Chỉ dùng jumper Dupont cho tín hiệu và module dòng nhỏ. Nhánh servo phải đi
   trực tiếp từ điểm chia bằng dây/connector chịu dòng; không đưa dòng stall
   của servo qua rail breadboard hoặc nhiều jumper Dupont song song. Rail
   `+5V tải` trên breadboard chỉ cấp cho nhánh WS2812B đã giới hạn 10 pixel/độ
   sáng và chỉ được chấp nhận sau phép đo full-load.

Nếu chưa có đồng hồ vạn năng hoặc chưa có cách chia nguồn tải chắc chắn, có
thể làm đến hết Bước 6 nhưng **không được làm Bước 7 trở đi**.

## Bước 1 — Nạp chương trình vào ESP32 khi chưa nối linh kiện

Toàn bộ thao tác Verify và Upload của hướng dẫn này dùng **Arduino IDE**.
Script đồng bộ chỉ chuẩn bị đúng các file cho sketch Arduino; nó không chuyển
dự án sang PlatformIO.

1. Để ESP32 hoàn toàn độc lập, chưa nối OLED, DHT22, MC-38, LED, servo, buzzer
   hoặc adapter ngoài.
2. Cắm USB-C vào ESP32 và máy tính.
3. Mở Arduino IDE, sau đó mở:

   ```text
   arduino/SmartPrivacyLocker/SmartPrivacyLocker.ino
   ```

4. Chọn **Tools → Board → esp32 → ESP32 Dev Module**.
5. Chọn đúng cổng COM vừa xuất hiện khi cắm board.
6. Chọn **Tools → Partition Scheme → Default 4MB with spiffs
   (1.2MB APP/1.5MB SPIFFS)**.
7. Nhấn **Verify**, rồi nhấn **Upload**.
8. Nếu IDE đứng ở `Connecting...`, giữ nút `BOOT`, bắt đầu Upload và thả nút
   khi IDE bắt đầu ghi.
9. Mở **Serial Monitor**, chọn `115200` baud. Board phải boot ổn định và không
   lặp lại dòng reset/brownout.
10. Rút USB-C trước khi chuyển sang Bước 2.

Nếu chưa cài Arduino IDE/core/thư viện hoặc chưa tạo cấu hình Wi-Fi/MQTT, làm
theo [HUONG_DAN_CHAY_HE_THONG.md](HUONG_DAN_CHAY_HE_THONG.md), mục cài đặt
Arduino IDE, rồi quay lại đây.

## Bước 2 — Đặt ESP32 30 chân cạnh breadboard

ESP32 của bạn có `15 × 2 = 30` chân và quá rộng để dùng thuận tiện trên
breadboard 830 lỗ. **Không cố ép board vào breadboard và không vắt board qua
rãnh giữa.** Làm như sau:

1. Đặt ESP32 **bên cạnh** breadboard trên một mặt phẳng cách điện, mặt có chữ
   hướng lên và cổng USB-C không bị che.
2. Không để mặt dưới ESP32 chạm bản lề, cánh tay servo, vít hoặc vật kim loại.
3. Dùng dây jumper **đực-cái**:
   - đầu **cái** cắm vào chân đực trên ESP32;
   - đầu **đực** cắm vào lỗ breadboard.
4. Dán nhãn hai rail trên: một rail `+5V tải`, một rail `GND chung`.
5. Dán nhãn hai rail dưới: một rail `3V3`, một rail `GND chung`.
6. Nối ESP32 `3V3` → rail dưới `3V3` bằng một dây đực-cái. Không dùng rail này
   cho servo hoặc WS2812B.
7. Nối ESP32 `GND` → rail dưới GND; nối rail dưới GND → rail trên GND. Hai rail
   GND phải thông nhau, còn rail `+5V tải` và `3V3` phải tách biệt.
8. Để rail trên `+5V tải` chưa được cấp điện cho đến Bước 7. Nếu rail bị ngắt ở
   giữa, chỉ nối hai nửa sau khi đã kiểm tra bằng continuity mode.
9. Dùng đồng hồ xác nhận `3V3` không thông với GND hoặc `+5V tải`, và `+5V tải`
   không thông với GND.
10. Chừa nhìn thấy các nhãn `4`, `18`, `21`, `22`, `25`, `26`, `27` trên chính
   ESP32 để tránh đếm nhầm vị trí chân.
11. Chưa cắm USB và chưa cắm adapter.

Khi một module có hàng chân đực và cắm được lên breadboard, đặt module lên
breadboard rồi nối tín hiệu từ ESP32 tới đúng hàng của module bằng dây
đực-cái. Nếu module không cắm được lên breadboard, dùng dây cái-cái nối trực
tiếp từ chân module sang chân ESP32. Kết nối điện trong các bước tiếp theo
không thay đổi dù dùng cách vật lý nào.

## Bước 3 — Nối OLED

Khi toàn bộ mạch vẫn mất điện, nối đúng bốn dây:

1. OLED `VCC` → rail `3V3` đã nối với ESP32 `3V3`.
2. OLED `GND` → rail GND logic.
3. OLED `SDA` → ESP32 `GPIO21`.
4. OLED `SCL` → ESP32 `GPIO22`.
5. Đo để chắc chắn `3V3` không chập `GND`.
6. Cắm USB-C, kiểm tra OLED hiển thị và ESP32 không reset.
7. Rút USB-C trước Bước 4.

Nếu OLED không chạy, không đảo dây ngẫu nhiên. Kiểm tra lại đúng bốn nhãn chân;
địa chỉ firmware mặc định là `0x3C`.

## Bước 4 — Nối DHT22

1. Xác định DHT22 của bạn là module 3 chân hay cảm biến rời 4 chân.
2. DHT22 `VCC`/`+` → rail `3V3` đã nối với ESP32 `3V3`.
3. DHT22 `DATA`/`S`/`OUT` → ESP32 `GPIO4`.
4. DHT22 `GND`/`-` → rail GND logic.
5. Nếu là cảm biến rời hoặc module không có điện trở pull-up, đặt điện trở
   4,7 kΩ giữa `DATA` và `3V3`. Nếu module đã có pull-up thì không cần lắp thêm.
6. Chân `NC` của DHT22 4 chân để trống.
7. Đo để chắc chắn `3V3` không chập `GND`.
8. Cắm USB-C, chờ ít nhất vài chu kỳ đọc 2,5 giây; OLED phải hiện nhiệt độ và
   độ ẩm hợp lý.
9. Rút USB-C trước Bước 5.

Không nối bất kỳ chân DHT22 nào vào 5 V trong cấu hình này.

## Bước 5 — Nối MC-38 khi đã có đủ hai nửa

Một nửa MC-38 không đủ để làm bước này.

1. Khi MC-38 đầy đủ về, để nó chưa nối ESP32.
2. Dùng continuity mode đo hai dây của phần reed contact khi đưa nam châm lại
   gần và khi đưa ra xa. Phải thấy trạng thái đóng/hở thay đổi.
3. Dây thứ nhất của MC-38 → ESP32 `GPIO27`.
4. Dây thứ hai của MC-38 → rail GND logic.
5. Không cấp nguồn riêng cho MC-38 và không nối nó vào `3V3` hoặc `5V`.
6. Cắm USB-C, đưa nam châm gần/xa và kiểm tra trạng thái cửa thay đổi ổn định.
7. Rút USB-C trước Bước 6.

Hai dây MC-38 không phân cực nên có thể đổi chỗ cho nhau.

## Bước 6 — Kiểm tra lại phần logic trước khi thêm tải 5 V

Ở thời điểm này chỉ được có các dây sau trên ESP32:

- `3V3` tới OLED và DHT22;
- GND tới OLED, DHT22 và MC-38;
- `GPIO21`, `GPIO22` tới OLED;
- `GPIO4` tới DHT22;
- `GPIO27` tới MC-38.

Cắm USB-C và chạy ít nhất 5 phút. OLED, DHT22 và MC-38 phải hoạt động, ESP32
không brownout/reset. Sau đó rút USB-C.

## Bước 7 — Làm đường nguồn tải 5 V riêng

Jack DC chỉ là đầu nối, không phải mạch chia điện. Adapter không cần có sẵn nút
I/O: có thể dùng công tắc DC riêng ở dây dương. Về điện, rút/cắm adapter cũng
có thể ngắt nguồn; nhưng với cánh tay servo đã gắn vào cửa, cấu hình cuối của
dự án phải có công tắc hoặc đường ngắt 5 V dễ tiếp cận để dừng khẩn cấp.

Không làm bước này nếu chưa xác định được chân jack, chân công tắc và cực tính
bằng đồng hồ vạn năng. Hình dạng jack/công tắc không đủ để đoán chân; đầu
5,5 × 2,5 mm cũng không được thay bằng 5,5 × 2,1 mm chỉ vì nhìn giống nhau.

1. Khi adapter đang rút điện, dùng continuity mode xác định terminal của jack
   nối với tiếp điểm giữa và terminal nối với vỏ ngoài. Bỏ trống terminal
   switched nếu jack có ba chân mà bạn chưa dùng chức năng này.
2. Đọc ký hiệu polarity trên adapter và đo lại điện áp DC. Chỉ tiếp tục khi xác
   nhận đầu giữa là `+5V`, vỏ ngoài là GND và điện áp thực phù hợp.
3. Chuẩn bị một điểm chia chịu dòng như terminal block, Wago đúng loại hoặc
   jack cái ra cọc vít. Không xoắn dây để hở và không dùng rail breadboard làm
   điểm chia duy nhất cho servo.
4. Dùng một công tắc có định mức DC tối thiểu 5 V/3 A và không thấp hơn dòng
   cực đại đã tính của nhánh tải; đặt công tắc nối tiếp trên dây `+5V`. Công tắc
   rời hoặc loại tích hợp với jack đều được, không cần mua adapter mới chỉ để
   có nút I/O.
5. Nối theo topology sau:

   ```text
   Adapter 5 V/3 A
      center + → jack → công tắc → bảo vệ nhánh → điểm chia +5V
                                      ├─→ SG90 dây đỏ (nhánh trực tiếp)
                                      └─→ rail trên +5V → WS2812B

      outer  - → jack ─────────────→ điểm chia GND
                                      ├─→ SG90 dây nâu/đen (nhánh trực tiếp)
                                      └─→ rail trên GND → rail dưới GND
                                                            └─→ ESP32 GND
   ```

6. Dùng dây/terminal chịu được dòng tải, chống kéo dây và bọc kín mối hàn bằng
   ống co nhiệt. Gắn tụ 470 µF ở đầu WS2812B, không đặt thay cho tụ nhánh servo.
7. Khi adapter vẫn rút điện, kiểm tra:
   - công tắc OFF: đầu ra `+5V` không thông với center `+`;
   - công tắc ON: đầu ra `+5V` thông với center `+`;
   - `+5V` không chập GND hoặc `3V3`;
   - hai rail GND thông nhau và thông với GND nguồn tải/ESP32.
8. Chưa nối servo, LED hay ESP32. Cắm adapter, bật công tắc và đo điện áp tại
   điểm chia, rail trên `+5V` và GND.
9. Tắt công tắc, rút adapter và đo lại để chắc chắn đã mất điện.

Công tắc thứ hai chưa cần dùng. Không nối `+5V` USB/ESP32 với `+5V` adapter;
hai nguồn chỉ dùng chung GND theo topology trên.

## Bước 8 — Nối WS2812B không dùng IC 74HC125

Thử đúng 10 pixel đã cấu hình ở `WS2812_BRIGHTNESS = 32`; không bật trắng toàn
dải. Đây vẫn là phương án direct có điều kiện vì GPIO ESP32 là 3,3 V còn strip
dùng nguồn 5 V.

1. Tìm chữ `DIN`/`DI` hoặc mũi tên trên strip. Tín hiệu phải đi từ `DIN` về
   phía `DOUT`; không nối vào đầu ra `DOUT`.
2. WS2812B `+5V` → rail trên `+5V tải`.
3. WS2812B `GND` → rail trên GND chung.
4. Nối một tụ 470 µF sát đầu vào strip:
   - chân tụ có dấu `+` → `+5V`;
   - chân tụ có vạch `-` → GND.
5. Xác nhận rail dưới GND (ESP32) thông với rail trên/điểm chia GND tải. Đây là
   kết nối **bắt buộc** để tín hiệu LED và servo có cùng mốc điện áp với ESP32.
6. ESP32 `GPIO25` → một điện trở 330 Ω **hoặc** 470 Ω → WS2812B `DIN`.
7. Đặt điện trở gần `DIN`; giữ đoạn dây data ban đầu khoảng 10 cm hoặc ngắn hơn.
8. Không lắp `SN74HC125N` vào đường data.
9. Bật nguồn tải 5 V trước, sau đó mới cắm USB-C để boot ESP32.
10. Kiểm tra cả 10 pixel đổi đúng màu, không nhấp nháy và ESP32 không reset.
11. Khi tắt: rút USB-C trước, sau đó tắt/rút nguồn tải.

Nếu pixel sai màu, chớp, bỏ lệnh hoặc ESP32 reset, dừng dùng LED direct; không
tiếp tục bằng cách đổi điện trở ngẫu nhiên. Phương án ổn định hơn là bộ đệm
`SN74AHCT125N` đúng loại.

Khi chỉ cấp USB cho ESP32 mà nguồn tải đang tắt, hãy tháo dây `GPIO25` khỏi
điện trở để tránh cấp điện ngược vào strip qua chân data.

## Bước 9 — Nối và thử SG90 cho cánh tay đóng/mở cửa

1. Tắt/rút cả USB-C và adapter.
2. Tách cánh tay servo khỏi cửa ở lần thử không tải; horn không vướng vật cản.
3. Dây tín hiệu cam/vàng/trắng → ESP32 `GPIO18`.
4. Dây đỏ → điểm chia `+5V` tải.
5. Dây nâu/đen → điểm chia GND tải.
6. Không cấp dây đỏ của servo từ chân `3V3`, chân `5V` của ESP32, rail
   breadboard hoặc một dây jumper Dupont đơn.
7. Nếu đang giữ LED đã nối, bảo đảm common GND ở Bước 8 vẫn còn nguyên.
8. Bật nguồn tải trước, sau đó cắm USB-C.
9. Gửi `UNLOCK` để servo về `80°` (mở cửa), sau đó gửi `LOCK` để servo về
   `170°` (đóng cửa). Hai tên lệnh logic được giữ để tương thích phần mềm dù
   sản phẩm không còn chốt khóa.
10. Chạy tối thiểu 20 chu kỳ đóng/mở không tải. Dừng ngay nếu servo kẹt, rung
     liên tục, nóng bất thường hoặc làm ESP32 reset.
11. Rút USB-C trước, rồi tắt/rút adapter.

Chỉ sau khi no-load PASS mới cho cánh tay tác động lên cửa. Xác nhận cửa chuyển
động tự do, cánh tay không trở thành chặn cứng và servo không phải giữ lực liên
tục ở `80°` hoặc `170°`.

## Bước 10 — Nối active buzzer LOW-trigger ở 3,3 V

### Kết quả bench đã quan sát ngày 15/08/2026

Module thực tế là active buzzer module LOW-level trigger dùng buzzer
`TMB12A05`. ESP32 được Windows nhận ở `COM4` qua `USB-SERIAL CH340`; Arduino
IDE 2.3.10 chọn `ESP32 Dev Module`. Sketch thử độc lập tạm dùng `GPIO18` và đặt
OUTPUT HIGH để yêu cầu tắt.

- Khi `VCC` module ở 5 V, buzzer im trong lúc ESP32 ở bootloader/đang ghi flash
  nhưng kêu lại ngay sau `Hard resetting via RTS pin...`; nhấn `EN` chỉ làm nó
  im một nhịp rồi kêu lại. Quan sát này phù hợp với việc HIGH 3,3 V của ESP32
  không tắt được đầu vào module đang tham chiếu theo 5 V.
- Điện trở nối tiếp 4,7 kΩ chỉ giới hạn dòng tín hiệu; nó **không phải bộ đổi
  mức** và không biến HIGH 3,3 V thành 5 V. Suy luận phù hợp nhất với hiện tượng
  đã thấy là: lúc bootloader/ghi flash, GPIO ở trạng thái high-impedance nên mạch
  input trên module có thể tự kéo lên gần VCC 5 V và tắt; khi firmware bắt đầu
  chủ động xuất HIGH 3,3 V, mức này vẫn thấp hơn VCC module đủ nhiều để tầng
  LOW-trigger còn dẫn và còi kêu. Không có sơ đồ mạch chính xác của module nên
  đây là suy luận điện tử từ phép thử, không phải đặc tính đã được datasheet của
  module ba chân xác nhận.
- Sau khi chuyển duy nhất `VCC` module sang ESP32 `3V3`, cùng sketch OUTPUT HIGH
  làm buzzer im liên tục. Vì vậy wiring demo được chốt ở **VCC 3V3**, không
  dùng 5 V và không dùng `pinMode(INPUT)` làm cách tắt.
- Datasheet của **buzzer rời** TMB12A05 liên kết ở cuối tài liệu ghi điện áp
  hoạt động 3–7 V và điện áp định mức 5 V, nên 3,3 V nằm trong dải của buzzer
  rời. Datasheet đó không mô tả transistor/mạch input trên module ba chân;
  vì vậy kết quả bench của đúng specimen và phép đo dòng/full-load vẫn là gate
  bắt buộc, không được suy ra chỉ từ tên `TMB12A05`.
- Đây mới là PASS cho đường **tắt/inactive** trên bench. Vẫn phải chạy chu kỳ
  LOW/HIGH ở 3,3 V, chuyển tín hiệu sang `GPIO26`, rồi chạy boot lặp và full-load
  trước khi đánh dấu toàn bộ P3-M01/P3-M03 PASS.

### Nối vào firmware dự án

1. Rút USB-C và adapter 5 V; không thay dây khi mạch đang có điện.
2. Đọc đúng chữ in trên module, không đoán thứ tự chân theo vị trí trái/phải.
3. Nối đúng ba đường:

   ```text
   ESP32 3V3    ─────────────────── buzzer VCC/+
   ESP32 GND    ─────────────────── buzzer GND/-
   ESP32 GPIO26 ── điện trở 4,7 kΩ ─ buzzer IN/S/I/O
   ```

4. **Không nối VCC buzzer vào 5 V/VIN hoặc rail tải 5 V.** Không nối trực tiếp
   VCC buzzer vào GPIO26; GPIO26 chỉ là tín hiệu điều khiển.
5. Xác nhận `GPIO18` vẫn dành cho SG90. Sketch bench từng dùng GPIO18 không phải
   pin map cuối của dự án.
6. Source công khai hiện đã mặc định đúng active-low trong cả
   `firmware/include/app_config.example.h` và fallback của
   `firmware/include/runtime_config.h`:

   ```cpp
   #define SPL_BUZZER_ACTIVE_HIGH 0
   ```

   Nếu đã có `firmware/include/app_config.h` cũ, kiểm tra nó không override
   macro thành `1`. Không cần tạo override riêng chỉ để nhận giá trị `0`.

7. Chạy lại:

   ```powershell
   .\arduino\sync-sketch.ps1 -IncludeLocalConfig
   .\arduino\sync-sketch.ps1 -Check
   ```

8. Mở sketch dự án, chọn `ESP32 Dev Module`, rồi chọn đúng cổng USB-serial vừa
   xuất hiện khi cắm board và Verify/Upload. `COM4` chỉ là cổng đã quan sát ở
   phiên bench ngày 15/08/2026, không phải tên cổng cố định. Không chọn cổng
   Bluetooth `Standard Serial over Bluetooth link`. Đóng Serial Monitor trước
   khi upload nếu nó đang giữ cổng.
9. Sau upload/reset, buzzer phải im ở alarm `INACTIVE`. Với active-low:

   ```text
   GPIO26 HIGH (xấp xỉ 3,3 V) → tắt
   GPIO26 LOW  (xấp xỉ 0 V)   → kêu
   ```

10. Dùng **Kiểm tra còi** rồi **Tắt còi**, hoặc chạy sketch chu kỳ riêng trên
    GPIO26: im 5 giây → kêu 1 giây → lặp lại. Không dùng `tone()`, PWM hoặc
    đổi chân sang `INPUT` để điều khiển active buzzer này.
11. Reset bằng `EN` ít nhất 10 lần. Chỉ PASS safe boot nếu sau mỗi lần reset
    buzzer vẫn im cho tới khi có lệnh bật.
12. Dừng ngay nếu buzzer kêu liên tục ở HIGH, âm không ổn định, module nóng,
    rail 3V3 sụt hoặc ESP32 reset. Kiểm tra lại đúng VCC 3V3, common GND, điện
    trở 4,7 kΩ, GPIO26 và macro active-low trước khi thử tiếp.

## Bước 11 — Lắp cơ khí

1. Bắt hai bản lề để cửa chuyển động trơn, không cạ khung.
2. Gắn phần reed của MC-38 lên khung cố định và nam châm lên cửa.
3. Gắn servo chắc chắn; dây không bị cửa, bản lề hoặc horn kẹp vào.
4. Đưa servo về `80°` trước khi đặt cánh tay vào vị trí mở cửa.
5. Không lắp chốt khóa hoặc linkage chốt. Khi mất điện, thử cửa bằng tay và xác
   nhận cánh tay không làm kẹt bản lề hoặc chặn lối thoát của cửa.
6. Chạy từng lệnh `UNLOCK`/`LOCK`; xác nhận `80°` mở và `170°` đóng mà không ép
   cửa quá hành trình hoặc giữ lực liên tục ở end-stop.
7. Cố định ESP32, breadboard, OLED và dây nhưng vẫn chừa đường tháo USB/jack.
8. Bọc mối hàn nguồn, chống kéo dây và không để phần kim loại chạm chân mạch.

## Bước 12 — Trình tự bật và kiểm tra toàn hệ thống

Trước khi bật:

1. Kiểm tra `+5V` không chập GND.
2. Kiểm tra tụ 470 µF đúng cực.
3. Kiểm tra tất cả GND đã nối chung.
4. Kiểm tra không có external `+5V` nối vào ESP32.
5. Kiểm tra servo lấy 5 V bằng nhánh trực tiếp từ điểm chia, không qua rail
   breadboard; rail trên `+5V` chỉ cấp nhánh WS2812B đã giới hạn.
6. Kiểm tra WS2812 data vào `DIN`, không vào `DOUT`.
7. Kiểm tra buzzer `VCC` đang ở ESP32 `3V3`, không phải 5 V; `IN/S/I/O` đi qua
   4,7 kΩ tới `GPIO26`. Nếu chưa PASS đường bật/tắt ở Bước 10, tháo buzzer khỏi
   bản demo tích hợp.

Bật hệ thống:

1. Bật adapter 5 V cho servo/LED.
2. Cắm USB-C cho ESP32.
3. Chờ board boot, Wi-Fi/MQTT kết nối.
4. Đóng/mở cửa để thử MC-38.
5. Gửi `UNLOCK` để mở rồi `LOCK` để đóng; kiểm tra servo, cửa, MC-38, trạng thái
   OLED và LED. ACK servo không thay cho quan sát vị trí cửa thực tế.
6. Chạy ít nhất 20 chu kỳ đóng/mở, 10 lần khởi động nguội và một lần mất/kết
   nối lại Wi-Fi/MQTT.
7. Không được có reset, brownout, servo kẹt, LED nhấp nháy sai, dây nóng, mùi
   khét hoặc nguồn tụt bất thường.

Tắt hệ thống:

1. Rút USB-C khỏi ESP32.
2. Tắt công tắc nguồn tải.
3. Rút adapter nếu cần sửa dây.
4. Đo xác nhận đã mất điện rồi mới chạm vào phần nguồn.

Phần khởi động MQTT, dashboard và kiểm thử phần mềm end-to-end nằm trong
[HUONG_DAN_CHAY_HE_THONG.md](HUONG_DAN_CHAY_HE_THONG.md). Nếu một bước ở trên
không PASS, quay lại chính bước đó, ngắt mọi nguồn và kiểm tra bằng đồng hồ;
không đổi dây theo phỏng đoán.

## Nguồn chính thức đã dùng để xác thực

- [Espressif ESP32-DevKitC V4 — pin và ba phương án cấp nguồn loại trừ lẫn nhau](https://documentation.espressif.com/projects/esp-dev-kits/en/latest/esp32/esp32-devkitc/user_guide.html)
- [Espressif Arduino-ESP32 GPIO API — `pinMode()` và `digitalWrite()`](https://docs.espressif.com/projects/arduino-esp32/en/latest/api/gpio.html)
- [Espressif esptool — BOOT/EN, GPIO0 và auto-reset RTS/DTR](https://docs.espressif.com/projects/esptool/en/latest/esp32/advanced-topics/boot-mode-selection.html)
- [Jiangsu Huaneng TMB12A05 manufacturer datasheet — buzzer rời, rated 5 V, operating 3–7 V](https://datasheet.lcsc.com/datasheet/pdf/2a16321f74deffcaef3942d9437fae37.pdf?productCode=C96093)
- [TowerPro SG90 — điện áp danh định 4,8 V và nguồn ngoài](https://towerpro.com.tw/product/sg90-7/)
- [ASAIR/Aosong AM2302 (DHT22) product page](https://www.aosong.com/en/Products/info.aspx?itemid=2294&lcid=139)
- [Worldsemi WS2812B-V5/W datasheet](https://datasheet.lcsc.com/lcsc/2206131216_Worldsemi-WS2812B-V5-W_C2874885.pdf)
