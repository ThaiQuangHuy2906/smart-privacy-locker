# Smart Privacy Locker — Wokwi hardware demo

Gói này mô phỏng độc lập toàn bộ phần cứng được firmware điều khiển trực tiếp:

- ESP32 DevKitC;
- DHT22 ở GPIO4, có pull-up 5,1 kΩ lên 3V3;
- OLED SSD1306 I2C ở GPIO21/GPIO22, địa chỉ `0x3C`;
- servo SG90 ở GPIO18, đại diện nhánh tải 5 V ngoài;
- một pixel WS2812B ở GPIO25 qua 330 Ω, đại diện nhánh tải 5 V ngoài;
- MC-38 ở GPIO27, mô phỏng bằng công tắc trượt;
- module active buzzer TMB12A05 LOW-trigger ở GPIO26 qua 4,7 kΩ, `VCC=3V3`.

Sơ đồ được chia thành các vùng riêng và nối trực tiếp để không che linh kiện:
logic 3,3 V ở phía trên, tải 5 V ở bên phải, cảm biến cửa và còi ở phía dưới.
Mỗi thiết bị đều có nhãn tên, chân tín hiệu và nguồn ngay trên sơ đồ.

## Chạy bằng Wokwi trong VS Code

1. Giải nén ZIP vào đường dẫn chỉ có ký tự ASCII, ví dụ
   `C:\wokwi\smart-privacy-locker-wokwi`.
2. Mở đúng thư mục vừa giải nén trong VS Code.
3. Cài PlatformIO IDE và Wokwi for VS Code nếu máy chưa có.
4. Chạy `pio run` để tạo `.pio/build/esp32dev/firmware.bin` và
   `.pio/build/esp32dev/firmware.elf`.
5. Mở Command Palette và chọn **Wokwi: Start Simulator**.

`wokwi.toml` còn nạp `chips/tmb12a05.chip.wasm`. Chip tùy chỉnh này nhận ba
đường giống module thật (`VCC`, `GND`, `IN`) và tạo âm thanh mô phỏng khi
`IN=LOW`. File C nguồn được giữ cạnh file WASM để có thể kiểm tra và biên dịch
lại bằng lệnh chính thức:

```powershell
wokwi-cli chip compile chips\tmb12a05.chip.c `
  -o chips\tmb12a05.chip.wasm
```

Trên Windows, toolchain ESP32 của PlatformIO có thể gặp lỗi khi build bên trong
đường dẫn chứa tiếng Việt có dấu. Nếu gặp lỗi đường dẫn, hãy sao chép/giải nén
gói vào một đường dẫn ASCII như ví dụ trên; đây không phải lỗi của sketch.

## Dùng trên Wokwi web

Các file chính nằm ngay trong project:

- `sketch.ino`;
- `diagram.json`;
- `libraries.txt`;
- `chips/tmb12a05.chip.c` và `chips/tmb12a05.chip.json`.

Wokwi Custom Chips API hiện là tính năng beta. Nếu giao diện web không nhập
được custom chip từ ZIP, dùng bản VS Code ở trên; không thay module bằng mạch
5 V hoặc đổi polarity firmware để làm mô phỏng chạy.

## Điều khiển mô phỏng

Mở Serial Monitor ở 115200 baud rồi gửi một ký tự:

| Phím | Tác dụng |
|---|---|
| `L` | Khóa, servo về 15° |
| `U` | Mở khóa, servo tới 95° |
| `1` | Bật WS2812B |
| `0` | Tắt WS2812B |
| `A` | Bật báo động: GPIO26 xuống LOW |
| `a` | Tắt báo động: GPIO26 lên HIGH |
| `S` | In trạng thái hiện tại |
| `H` | In hướng dẫn |

- Công tắc trượt bên trái là `CLOSED`, bên phải là `OPEN`.
- Click DHT22 để đổi nhiệt độ/độ ẩm; OLED cập nhật sau chu kỳ đọc.
- Ngay khi boot/reset, còi phải im vì sketch nạp latch HIGH trước khi đặt
  GPIO26 thành OUTPUT.

## Đối chiếu dây quan trọng

| Thiết bị | Dây mô phỏng |
|---|---|
| DHT22 | `VCC→3V3`, `GND→GND`, `SDA→GPIO4`, pull-up 5,1 kΩ `SDA→3V3` |
| OLED | `VCC→3V3`, `GND→GND`, `SDA→GPIO21`, `SCL→GPIO22` |
| SG90 | `PWM→GPIO18`, `V+→5V ngoài`, `GND→GND chung` |
| WS2812B | `DIN←330 Ω←GPIO25`, `VDD→5V ngoài`, `VSS→GND chung` |
| MC-38 | `GPIO27↔tiếp điểm↔GND` |
| TMB12A05 module | `VCC→ESP32 3V3`, `GND→GND`, `IN←4,7 kΩ←GPIO26` |

## Giới hạn bắt buộc phải hiểu

Wokwi kiểm tra logic GPIO và trình tự hoạt động, không chứng minh an toàn điện:

- ký hiệu 5 V không mô phỏng khả năng cấp dòng, sụt áp, brownout hay dòng stall
  của SG90;
- tụ 470 µF ở đầu WS2812B được ghi nhãn trên sơ đồ nhưng không được Wokwi mô
  phỏng điện học; mạch thật vẫn phải lắp đúng cực;
- custom chip mô phỏng cực tính LOW-trigger và âm danh định, không thay thế phép
  đo dòng/điện áp/nhiệt độ/âm lượng của module thật;
- Wokwi không kiểm tra lực cơ, hành trình chốt, dây tải, connector, cầu chì,
  chống kéo dây hoặc khả năng chịu dòng của nguồn ngoài;
- chỉ kết luận hệ thống thật đạt sau khi hoàn thành
  `HUONG_DAN_LAP_MACH_THEO_THU_TU.md` và `HUONG_DAN_CHAY_HE_THONG.md`.
