# Lắp mạch Smart Privacy Locker theo thứ tự — bản demo dùng nguồn USB

Đây là **bản thử nghiệm ngắn trên bàn** dành cho trường hợp chưa có nguồn tải
và đầu chia nguồn hoàn chỉnh. Bản này cố ý dùng nguồn USB đi qua đường
`5V`/`VIN` của ESP32 để thử một SG90 không tải hoặc tải cơ khí rất nhẹ và
pixel đầu tiên của WS2812B ở độ sáng thấp. Đây không phải cấu hình nguồn đáng
tin cậy để vận hành lâu dài và không thay thế hướng dẫn chuẩn
[HUONG_DAN_LAP_MACH_THEO_THU_TU.md](HUONG_DAN_LAP_MACH_THEO_THU_TU.md).

Sản phẩm ghi nhận ngày 17/08/2026 đã dùng 10 pixel và cánh tay SG90 để trực
tiếp đóng/mở cửa, nên đã vượt phạm vi của bản USB này. Bản demo chỉ còn dùng
để chẩn đoán từng tải khi tách khỏi cơ khí; mọi lần chạy sản phẩm hiện tại phải
theo hướng dẫn chuẩn với nhánh tải 5 V ngoài.

Bản demo không được dùng để đóng gate final. Sau chẩn đoán, quay về
[HUONG_DAN_LAP_MACH_THEO_THU_TU.md](HUONG_DAN_LAP_MACH_THEO_THU_TU.md), rồi
chạy [HUONG_DAN_TEST_END_TO_END.md](HUONG_DAN_TEST_END_TO_END.md) trên đúng
nguồn ngoài, 10 pixel và cơ cấu cửa release.

Làm từ Bước 0 đến Bước 12, không nhảy bước và không cắm/rút dây khi đang có
điện. Mỗi bước chỉ được coi là PASS khi đạt tiêu chí ghi tại bước đó. Nếu
ESP32 reset/brownout, servo rung hoặc kẹt, LED chớp sai, dây nóng hay có mùi
khét, rút USB ngay và quay lại cấu hình nguồn tải ngoài của hướng dẫn chuẩn.

## Cấu hình demo được dùng trong hướng dẫn này

- Chỉ dùng cấu hình này để demo ngắn trên bàn; không dùng như sản phẩm hoàn
  chỉnh, không chạy không giám sát và không coi kết quả này là kiểm thử
  full-load.
- Khi chỉ nạp firmware, ESP32 được nối với máy tính bằng cáp USB-C có data.
- Khi thử servo/LED, rút ESP32 khỏi máy tính và cấp USB-C bằng **củ sạc hoặc
  power bank 5 V có khả năng cấp ít nhất 2 A**. Không thử tải từ cổng USB của
  laptop/máy tính.
- Đường USB 5 V được đưa từ chân ESP32 có chữ `5V` hoặc `VIN` sang một rail
  `+5V DEMO` trên breadboard. Không lấy 5 V từ chân `3V3`.
- Không cắm adapter 5 V/3 A ngoài trong toàn bộ bản hướng dẫn này. Tuyệt đối
  không nối đồng thời adapter ngoài và nguồn USB vào đường `5V`/`VIN`.
- ESP32 DevKit 30 chân (`15 × 2`) đặt **cạnh** breadboard; nối bằng jumper
  đực-cái ngắn. Chỉ dùng một nửa rail liên tục, không giả định rail đi xuyên qua
  chỗ ngắt giữa breadboard.
- Chỉ dùng **một** SG90 và để cánh tay không tác động lên cửa trong bản USB.
  Cơ cấu cửa thực tế `170° = đóng`, `80° = mở` chỉ được thử theo hướng dẫn
  nguồn tải ngoài.
- Firmware chỉ điều khiển **pixel đầu tiên** của WS2812B
  (`WS2812_PIXEL_COUNT = 1`) ở độ sáng thấp; không bật trắng toàn dải 1 m.
- Không lắp `SN74HC125N` và MOSFET `4184`. Nếu đường WS2812 direct không
  PASS ở Bước 8, tháo LED khỏi bản demo; không đổi điện trở ngẫu nhiên.
- Active buzzer module LOW-trigger dùng buzzer `TMB12A05` vẫn lấy nguồn từ
  ESP32 `3V3`, không lấy từ rail `+5V DEMO`. Tín hiệu dùng `GPIO26` qua
  điện trở nối tiếp 4,7 kΩ.
- Luôn rút USB-C trước khi thêm, tháo hoặc đổi bất kỳ dây nào.

## Sơ đồ nối cuối cùng

| Thiết bị | Chân thiết bị | Nối tới |
|---|---|---|
| OLED SSD1306 I2C | `VCC` | ESP32 `3V3` |
| OLED SSD1306 I2C | `GND` | ESP32 `GND` |
| OLED SSD1306 I2C | `SDA` | ESP32 `GPIO21` |
| OLED SSD1306 I2C | `SCL` | ESP32 `GPIO22` |
| DHT22 | `VCC`/`+` | ESP32 `3V3` |
| DHT22 | `DATA`/`S`/`OUT` | ESP32 `GPIO4` |
| DHT22 | `GND`/`-` | ESP32 `GND` |
| MC-38 | Dây thứ nhất | ESP32 `GPIO27` |
| MC-38 | Dây thứ hai | ESP32 `GND` |
| Rail `+5V DEMO` | Đầu vào | ESP32 `5V` hoặc `VIN` được cấp từ USB-C |
| Rail GND tải demo | Đầu vào | ESP32 `GND` |
| WS2812B | `+5V`/`5V` | Rail `+5V DEMO` |
| WS2812B | `GND`/`-` | Rail GND tải demo |
| WS2812B | `DIN`/`DI` | ESP32 `GPIO25` qua **một** điện trở 330 Ω hoặc 470 Ω |
| SG90 dùng cho demo | Dây tín hiệu cam/vàng/trắng | ESP32 `GPIO18` |
| SG90 dùng cho demo | Dây đỏ | Rail `+5V DEMO` |
| SG90 dùng cho demo | Dây nâu/đen | Rail GND tải demo |
| Active buzzer module LOW-trigger (`TMB12A05`) | `VCC`/`+` | ESP32 `3V3` — **không nối 5 V** |
| Active buzzer module LOW-trigger (`TMB12A05`) | `GND`/`-` | ESP32 `GND` |
| Active buzzer module LOW-trigger (`TMB12A05`) | `IN`/`S`/`I/O` | ESP32 `GPIO26` qua điện trở nối tiếp 4,7 kΩ |

Không dựa vào vị trí trái/phải trong ảnh trên mạng. Chỉ nối theo chữ in trên
chính module và ESP32. Nếu board không có chân được in rõ `5V` hoặc `VIN`,
không dùng bản demo này.

## Bước 0 — Chuẩn bị và để toàn bộ mạch mất điện

1. Rút USB-C khỏi ESP32 và để adapter 5 V/3 A ngoài hoàn toàn không sử dụng.
2. Tách cánh tay servo khỏi cửa; tháo horn nếu nó có thể vướng vật khác.
3. Đặt breadboard trên mặt phẳng cách điện, tránh bản lề, cánh tay servo và vít
   kim loại.
4. Chuẩn bị:
   - cáp USB-C có data để nạp firmware;
   - củ sạc hoặc power bank USB 5 V có khả năng cấp ít nhất 2 A để thử tải;
   - jumper Dupont ngắn;
   - điện trở 330 Ω hoặc 470 Ω cho WS2812B;
   - tụ 470 µF;
   - một điện trở 4,7 kΩ riêng cho buzzer;
   - thêm một điện trở 4,7 kΩ nếu DHT22 cần pull-up rời.
5. Quy ước hai rail trên là `+5V DEMO` và GND chung; hai rail dưới là `3V3` và
   GND chung. Nối hai rail GND với nhau, dán nhãn rõ và không dùng màu dây thay
   cho nhãn chân.
6. Kiểm tra bằng mắt để không có sợi đồng, chân linh kiện hoặc jumper nào nối
   chéo giữa `+5V DEMO`, `3V3` và GND.
7. Cấu hình jumper/breadboard này chỉ dùng cho demo ngắn. Không để servo chịu
   tải nặng, không chạy toàn dải LED và không để mạch hoạt động không giám sát.

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
4. Dán nhãn hai rail trên là `+5V DEMO` và GND; hai rail dưới là `3V3` và GND.
5. Nối ESP32 `3V3` → rail dưới `3V3`; nối ESP32 `GND` → rail dưới GND.
6. Nối rail dưới GND → rail trên GND. Không dùng rail `3V3` cho servo hoặc
   WS2812B và chưa cấp điện cho rail `+5V DEMO`.
7. Nếu rail breadboard bị ngắt ở giữa, chỉ dùng một nửa rail liên tục; không
   nối hai nửa và không giả định chúng đã thông nhau.
8. Soát từng lỗ bằng mắt: `3V3`, `+5V DEMO` và GND không được nối chéo; hai
   rail GND phải thông nhau.
9. Chừa nhìn thấy các nhãn `4`, `18`, `21`, `22`, `25`, `26`, `27` trên chính
   ESP32 để tránh đếm nhầm vị trí chân.
10. Chưa cắm USB và chưa cắm adapter.

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
5. Soát lại bốn dây và xác nhận bằng mắt không có dây nối chéo `3V3` với
   `GND`.
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
7. Soát lại dây DHT22 và xác nhận bằng mắt không có dây nối chéo `3V3` với
   `GND`.
8. Cắm USB-C, chờ ít nhất vài chu kỳ đọc 2,5 giây; OLED phải hiện nhiệt độ và
   độ ẩm hợp lý.
9. Rút USB-C trước Bước 5.

Không nối bất kỳ chân DHT22 nào vào 5 V trong cấu hình này.

## Bước 5 — Nối và thử MC-38 bằng ESP32

1. Khi MC-38 đầy đủ về, để ESP32 đang rút USB-C.
2. Dây thứ nhất của MC-38 → ESP32 `GPIO27`.
3. Dây thứ hai của MC-38 → rail GND logic.
4. Không cấp nguồn riêng cho MC-38 và không nối nó vào `3V3` hoặc `5V`.
5. Cắm USB-C, dùng firmware hoặc sketch test `INPUT_PULLUP` để quan sát
   `GPIO27`; đưa nam châm gần/xa và xác nhận trạng thái đổi ổn định.
6. Rút USB-C trước Bước 6.

Hai dây MC-38 không phân cực nên có thể đổi chỗ cho nhau. Nam châm khác bộ vẫn
dùng được nếu nó làm trạng thái `GPIO27` thay đổi ổn định.

## Bước 6 — Kiểm tra lại phần logic trước khi thêm tải 5 V

Ở thời điểm này chỉ được có các dây sau trên ESP32:

- `3V3` tới OLED và DHT22;
- GND tới OLED, DHT22 và MC-38;
- `GPIO21`, `GPIO22` tới OLED;
- `GPIO4` tới DHT22;
- `GPIO27` tới MC-38.

Cắm USB-C và chạy ít nhất 5 phút. OLED, DHT22 và MC-38 phải hoạt động, ESP32
không brownout/reset. Sau đó rút USB-C.

## Bước 7 — Tạo rail nguồn tải demo từ USB qua ESP32

Đây là thay đổi chính của bản demo. Rail này chỉ dùng cho một SG90 không tải
hoặc tải rất nhẹ và pixel đầu tiên của WS2812B ở độ sáng thấp.

1. Xác nhận firmware đã được nạp ở Bước 1, sau đó rút USB-C khỏi máy tính.
2. Xác định đúng chân trên board có chữ `5V` hoặc `VIN`. Không suy ra bằng
   vị trí trái/phải và không dùng chân `3V3`.
3. Dùng một jumper ngắn nối:

   ```text
   ESP32 5V/VIN → rail +5V DEMO
   ESP32 GND    → rail GND tải demo
   ```

4. Dùng cùng một nửa rail liên tục; không vượt qua chỗ ngắt giữa breadboard.
5. Chưa nối servo hoặc WS2812B. Soát bằng mắt:
   - không có dây từ `+5V DEMO` sang `3V3` hoặc GND;
   - không có adapter 5 V ngoài được cắm;
   - không có chân kim loại rời chạm hai rail.
6. Cắm USB-C vào **củ sạc hoặc power bank 5 V ít nhất 2 A**, không cắm vào máy
   tính. ESP32 phải boot và chạy phần logic ổn định trong ít nhất 1 phút.
7. Nếu board reset, nóng hoặc nguồn USB tự ngắt, rút USB ngay và dừng bản demo.
8. Rút USB-C trước Bước 8.

PASS của bước này chỉ xác nhận ESP32 và rail demo boot được khi chưa có tải;
nó không chứng minh đường nguồn chịu được servo.

## Bước 8 — Thử pixel đầu tiên của WS2812B

Chỉ thử pixel đầu tiên ở độ sáng thấp; servo vẫn chưa nối nguồn.

1. Để USB-C đang rút. Tìm chữ `DIN`/`DI` hoặc mũi tên trên strip; tín hiệu
   phải đi từ `DIN` về `DOUT`.
2. WS2812B `+5V` → rail `+5V DEMO`.
3. WS2812B `GND` → rail GND tải demo.
4. Nối tụ 470 µF sát đầu vào strip:
   - chân tụ có dấu `+` → rail `+5V DEMO`;
   - chân tụ có vạch `-` → rail GND tải demo.
5. ESP32 `GPIO25` → một điện trở 330 Ω **hoặc** 470 Ω → WS2812B `DIN`.
6. Đặt điện trở gần `DIN`; giữ dây data khoảng 10 cm hoặc ngắn hơn.
7. Không lắp `SN74HC125N`.
8. Cắm USB-C vào củ sạc/power bank 5 V ít nhất 2 A.
9. Kiểm tra pixel đầu tiên đổi đúng màu, không nhấp nháy và ESP32 không reset.
10. Rút USB-C. Nếu pixel sai màu, chớp, bỏ lệnh hoặc làm ESP32 reset, tháo nguồn
    và data của WS2812B khỏi bản demo; không đổi điện trở ngẫu nhiên.

Không bật trắng toàn strip và không tăng `WS2812_PIXEL_COUNT` quá 1 trong cấu
hình nguồn USB qua ESP32.

## Bước 9 — Thử một servo SG90 không tải

1. Để USB-C đang rút và cánh tay servo tách khỏi cửa; horn không vướng vật cản.
2. Tạm tháo dây `+5V` của WS2812B khỏi rail để thử servo riêng trước.
3. Nối:
   - dây tín hiệu cam/vàng/trắng → ESP32 `GPIO18`;
   - dây đỏ → rail `+5V DEMO`;
   - dây nâu/đen → rail GND tải demo.
4. Xác nhận không có adapter 5 V ngoài và servo không lấy nguồn từ `3V3`.
5. Cắm USB-C vào củ sạc/power bank 5 V ít nhất 2 A.
6. Gửi `UNLOCK`, chờ servo về `80°`, rồi gửi `LOCK` để servo về `170°`. Đây là
   mapping đã xác nhận cho cơ cấu cửa hiện tại; trong bản USB, cánh tay vẫn
   phải tách khỏi cửa.
7. Chạy tối đa 5 chu kỳ không tải. Dừng ngay nếu:
   - ESP32 reset/brownout hoặc OLED khởi động lại;
   - servo rung, kêu liên tục, đứng im hoặc nóng;
   - jumper/rail breadboard nóng;
   - nguồn USB tự ngắt.
8. Rút USB-C. Chỉ khi servo riêng PASS mới nối lại pixel đầu tiên và thử đúng
   một chu kỳ tích hợp ở độ sáng LED thấp.

Không chạy kiểm thử 20 chu kỳ và không coi PASS này là full-load. Không dùng
nguồn USB qua ESP32 để cho servo trực tiếp đóng/mở cửa; quay lại nguồn tải
ngoài của hướng dẫn chuẩn trước khi gắn cánh tay vào cơ khí.

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

1. Rút USB-C; adapter 5 V ngoài phải vẫn không được sử dụng. Không thay dây
   khi mạch đang có điện.
2. Đọc đúng chữ in trên module, không đoán thứ tự chân theo vị trí trái/phải.
3. Nối đúng ba đường:

   ```text
   ESP32 3V3    ─────────────────── buzzer VCC/+
   ESP32 GND    ─────────────────── buzzer GND/-
   ESP32 GPIO26 ── điện trở 4,7 kΩ ─ buzzer IN/S/I/O
   ```

4. **Không nối VCC buzzer vào 5V/VIN hoặc rail +5V DEMO.** Không nối trực tiếp
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
12. Dừng ngay nếu buzzer kêu liên tục ở HIGH, âm không ổn định, module nóng
    hoặc ESP32 reset. Kiểm tra lại đúng VCC 3V3, common GND, điện trở 4,7 kΩ,
    GPIO26 và macro active-low trước khi thử tiếp.

## Bước 11 — Lắp cơ khí cho bản demo

1. Bắt hai bản lề để cửa chuyển động trơn, không cạ khung.
2. Gắn phần reed của MC-38 lên khung cố định và nam châm lên cửa.
3. Gắn servo chắc chắn; dây không bị cửa, bản lề hoặc horn kẹp vào.
4. Trong bản USB, giữ cánh tay tách khỏi cửa và chỉ quan sát hành trình tự do
   `80° ↔ 170°`.
5. Muốn cánh tay trực tiếp đóng/mở cửa, dừng bản demo và hoàn tất Bước 7 của
   hướng dẫn chuẩn trước.
6. Không dùng một lần chạy thành công bằng USB để chấp nhận tải cơ khí hoặc
   thay cho phép đo full-load.
7. Cố định ESP32, breadboard, OLED và dây nhưng vẫn chừa đường rút USB nhanh.
8. Không để jumper, chân tụ hoặc phần kim loại hở chạm khung/cánh tay servo.

Bản demo USB không phù hợp để truyền động cửa hoặc cho servo giữ lực liên tục.

## Bước 12 — Trình tự bật và kiểm tra bản demo tích hợp

Trước khi bật:

1. Xác nhận adapter 5 V/3 A ngoài không được cắm.
2. Kiểm tra tụ 470 µF đúng cực.
3. Kiểm tra `+5V DEMO`, `3V3` và GND không bị dây/chân linh kiện nối chéo.
4. Kiểm tra WS2812B data vào `DIN`, không vào `DOUT`.
5. Kiểm tra cánh tay servo đang tách khỏi cửa và không kẹt ở end-stop.
6. Kiểm tra buzzer `VCC` ở ESP32 `3V3`; tín hiệu qua 4,7 kΩ tới `GPIO26`.
7. Không nối ESP32 với laptop/máy tính trong lúc thử tải.

Bật hệ thống:

1. Cắm USB-C từ củ sạc hoặc power bank 5 V có khả năng cấp ít nhất 2 A.
2. Chờ board boot, Wi-Fi/MQTT kết nối.
3. Đóng/mở cửa để thử MC-38.
4. Gửi `UNLOCK` (`80°`) rồi `LOCK` (`170°`); kiểm tra servo tự do, OLED và
   pixel đầu.
5. Chạy tối đa 5 chu kỳ, từng chu kỳ cách nhau đủ để servo dừng hẳn.
6. Dừng ngay và rút USB nếu có reset/brownout, servo kẹt hoặc rung, LED chớp
   sai, dây nóng, mùi khét hay nguồn USB tự ngắt.

Tắt hệ thống:

1. Rút USB-C khỏi ESP32.
2. Chờ servo và LED tắt hẳn rồi mới chạm hoặc đổi dây.
3. Không cắm lại adapter ngoài vào rail `+5V DEMO`.

Phần MQTT, dashboard và kiểm thử phần mềm end-to-end nằm trong
[HUONG_DAN_CHAY_HE_THONG.md](HUONG_DAN_CHAY_HE_THONG.md). Kết quả từ bản demo
USB chỉ chứng minh luồng chức năng ngắn; không thay cho kiểm thử nguồn ngoài,
20 chu kỳ đóng/mở hoặc full-load của hướng dẫn chuẩn.

## Nguồn chính thức đã dùng để xác thực

- [Espressif ESP32-DevKitC V4 — pin và ba phương án cấp nguồn loại trừ lẫn nhau](https://documentation.espressif.com/projects/esp-dev-kits/en/latest/esp32/esp32-devkitc/user_guide.html)
- [Espressif Arduino-ESP32 GPIO API — `pinMode()` và `digitalWrite()`](https://docs.espressif.com/projects/arduino-esp32/en/latest/api/gpio.html)
- [Espressif esptool — BOOT/EN, GPIO0 và auto-reset RTS/DTR](https://docs.espressif.com/projects/esptool/en/latest/esp32/advanced-topics/boot-mode-selection.html)
- [Jiangsu Huaneng TMB12A05 manufacturer datasheet — buzzer rời, rated 5 V, operating 3–7 V](https://datasheet.lcsc.com/datasheet/pdf/2a16321f74deffcaef3942d9437fae37.pdf?productCode=C96093)
- [TowerPro SG90 — điện áp danh định 4,8 V và nguồn ngoài](https://towerpro.com.tw/product/sg90-7/)
- [ASAIR/Aosong AM2302 (DHT22) product page](https://www.aosong.com/en/Products/info.aspx?itemid=2294&lcid=139)
- [Worldsemi WS2812B-V5/W datasheet](https://datasheet.lcsc.com/lcsc/2206131216_Worldsemi-WS2812B-V5-W_C2874885.pdf)
