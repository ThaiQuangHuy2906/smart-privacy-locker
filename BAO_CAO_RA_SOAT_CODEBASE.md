# Báo cáo rà soát toàn bộ Smart Privacy Locker

- Ngày rà soát cuối: **15/08/2026**
- Nhánh: `develop`
- Commit nền tại thời điểm rà soát: `0e3a21f278df656b05ea9a3310b68ee770ae8008`

## 1. Kết luận ngắn

Các lỗi xác định được trong firmware, cấu hình buzzer, trình tự MQTT, mô hình
Wokwi và tài liệu đã được sửa. Toàn bộ gate phần mềm có thể chạy trên máy hiện
tại đều PASS. Năm file hướng dẫn trùng lặp đã được xóa sau khi người dùng xác
nhận rõ phạm vi.

Không thể tuyên bố hệ thống thực tế “đúng 100%” tại thời điểm này. Ba nhóm gate
chưa thể chạy là:

1. ESP32 hiện không cắm vào máy; Windows chỉ đang thấy `COM8` và `COM9` là cổng
   Bluetooth. `COM4` là bằng chứng bench lịch sử ngày 15/08/2026, không phải
   cổng hiện tại.
2. Máy không có Supabase CLI và Docker nên chưa thể clean-rebuild database rồi
   chạy lại pgTAP/RLS trên database cục bộ.
3. Không có `WOKWI_CLI_TOKEN`, vì vậy custom chip, sơ đồ và firmware Wokwi đã
   compile/lint/build được nhưng phiên mô phỏng CLI đầy đủ chưa chạy được.

Do đó, trạng thái trung thực là: **code/build/automated regression PASS; SQL
runtime, Wokwi runtime và full physical E2E chưa kiểm chứng trong vòng rà soát
này**. Quy tắc PASS đầy đủ nằm trong
[HUONG_DAN_CHAY_HE_THONG.md](HUONG_DAN_CHAY_HE_THONG.md).

## 2. Phạm vi đã rà soát

Đã kiểm tra các nhóm sau, bao gồm cả file tracked và file mới đang có trong
working tree:

- firmware ESP32 C/C++, cấu hình PlatformIO, unit test native và bản Arduino
  IDE mirror;
- Node-RED/FlowFuse source, generated flow, Dashboard HTML/CSS/JavaScript,
  simulator và local authenticated MQTT broker;
- migration/test SQL của Supabase ở mức đọc và đối chiếu tĩnh;
- PowerShell scripts đồng bộ, verify và đóng gói;
- toàn bộ JSON, JavaScript, Markdown và liên kết file nội bộ;
- BOM, pin map, power budget, tài liệu kiến trúc/deployment/test/evidence;
- project Wokwi, sơ đồ dây, firmware demo, custom chip C/JSON/WASM và ZIP;
- `TCTA_YÊU CẦU BÁO CÁO CUỐI KỲ.pdf` hai trang;
- `TCTA_QUY ĐỊNH ĐỒ ÁN CUỐI KỲ.pdf` bốn trang;
- đề xuất nhóm `12_24127177_24127205_24127249.pdf` 22 trang để lấy đúng tên,
  MSSV, người phụ trách và các chức năng đã đăng ký.

Hai PDF quy định đã được render và xem trực quan từng trang, không chỉ lấy text.
Nội dung báo cáo được tạo ở
[NOI_DUNG_BAO_CAO_CUOI_KY.md](NOI_DUNG_BAO_CAO_CUOI_KY.md); các điểm số vẫn để
ở trạng thái có điều kiện cho tới khi có evidence thật, tránh khai kết quả chưa
chạy.

## 3. Các lỗi/phát hiện đã xử lý

### F-01 — Sai mặc định polarity của buzzer LOW-trigger

Trước khi sửa, public example và runtime fallback dùng
`SPL_BUZZER_ACTIVE_HIGH=1`, trái với module LOW-level-trigger đã chọn. Điều này
có thể khiến lệnh ON/OFF đảo nghĩa và làm còi hoạt động ngoài ý muốn.

Đã sửa:

- public example và fallback đều dùng `SPL_BUZZER_ACTIVE_HIGH=0`;
- HIGH là inactive, LOW là active;
- setup nạp latch inactive HIGH trước khi đổi GPIO26 thành `OUTPUT`;
- mirror Arduino được đồng bộ byte-for-byte với 30 file nguồn production;
- thêm assertion hồi quy để public default không bị đổi ngược về sau.

### F-02 — Tài liệu buzzer còn mô tả topology 5 V/MOSFET cũ

Một số comment và tài liệu còn mô tả buzzer 5 V qua driver/MOSFET, trong khi
specimen đã kiểm tra là module ba chân LOW-trigger cấp từ ESP32 `3V3`.

Đã thống nhất topology hiện tại:

```text
ESP32 3V3    -> buzzer VCC/+
ESP32 GND    -> buzzer GND/-
ESP32 GPIO26 -> điện trở 4,7 kΩ -> buzzer IN/S/I/O
```

Điện trở 4,7 kΩ chỉ hạn dòng tín hiệu, không nâng HIGH 3,3 V thành 5 V. Vì vậy
nó không giải quyết được chênh mức tham chiếu khi module vẫn cấp VCC 5 V. Việc
còi im lúc bootloader nhưng kêu lại sau hard reset phù hợp với một đầu vào tự
kéo lên VCC khi GPIO high-impedance, rồi bị GPIO chủ động giữ ở 3,3 V sau khi
firmware chạy. Đây là suy luận từ hiện tượng bench; chưa có sơ đồ chính xác của
mạch module ba chân để coi nó là đặc tính datasheet.

Datasheet được liên kết chỉ mô tả **buzzer rời** TMB12A05: rated 5 V, operating
3–7 V, không mô tả tầng transistor/input của module. Vì thế cấu hình `VCC=3V3`
được chốt cho đúng specimen đã thử, nhưng phép đo dòng, 10 lần boot và full-load
vẫn bắt buộc.

### F-03 — MQTT có thể báo ONLINE dù retained bootstrap chưa đầy đủ

Luồng connect trước đây không xử lý kết quả thất bại của hai publish retained
ban đầu và phát ONLINE trước full state. Một client khác có thể nhìn thấy ONLINE
trong khi state chưa được thiết lập đầy đủ.

Đã sửa:

- subscribe thành công mới bắt đầu bootstrap;
- publish retained full state trước, ONLINE sau;
- nếu state hoặc ONLINE publish thất bại: hạ state kết nối, thử sửa retained
  state, phát OFFLINE và lên lịch retry;
- nếu OFFLINE không ghi được, đóng transport thay vì gửi clean MQTT DISCONNECT,
  để broker có thể áp dụng Last Will đã đăng ký;
- chỉ cho phép connect khi PubSubClient cấp được buffer 1024 byte;
- thêm regression assertion về thứ tự và failure path.

### F-04 — Kích thước MQTT phụ thuộc riêng PlatformIO

Kích thước packet ứng dụng được đưa về
`RuntimeConfig::MQTT_PACKET_SIZE = 1024`; PubSubClient được resize và kiểm tra
return value ở runtime. Arduino IDE và PlatformIO vì vậy dùng cùng contract,
không dựa vào build flag riêng của một toolchain.

### F-05 — Wokwi dùng buzzer thụ động/polarity không khớp module thật

Đã thay bằng custom chip `TMB12A05 LOW-trigger module (simulation)`:

- nhận `VCC`, `GND`, `IN` như module ba chân;
- chỉ active khi VCC HIGH, GND LOW và IN LOW;
- IN mặc định pull-up để safe inactive khi chưa được drive;
- tạo sóng âm khoảng 2,4 kHz cho transducer mô phỏng;
- firmware Wokwi pre-load HIGH trước `pinMode(OUTPUT)` và dùng LOW/HIGH ổn định,
  không dùng `tone()` để che polarity của module.

Sơ đồ đã được bố trí lại thành các vùng logic 3,3 V, tải ngoài 5 V, cửa và
buzzer; các phần tử đều có nhãn và không chồng lên nhau. Nó có DHT22 + pull-up,
OLED, SG90, WS2812B + điện trở data, MC-38 mô phỏng bằng switch, module buzzer +
4,7 kΩ, nguồn tải ngoài và common GND. Tụ 470 µF được ghi nhãn vì Wokwi không
mô phỏng đầy đủ hành vi nguồn/tụ/dòng stall.

### F-06 — Trùng nhiều tài liệu lắp mạch

Đã chọn đúng hai tài liệu vận hành chuẩn:

1. [HUONG_DAN_LAP_MACH_THEO_THU_TU.md](HUONG_DAN_LAP_MACH_THEO_THU_TU.md) —
   nguồn duy nhất để lắp dây theo thứ tự.
2. [HUONG_DAN_CHAY_HE_THONG.md](HUONG_DAN_CHAY_HE_THONG.md) — nguồn duy nhất để
   cài/nạp/chạy và nghiệm thu sau khi lắp.

Các hướng dẫn legacy đã được xóa sau khi người dùng xác nhận. Kiểm thử artifact
đã được chuyển sang đọc hướng dẫn chuẩn thay vì phụ thuộc file cũ.

### F-07 — Không có kiểm tra tự động liên kết Markdown

Đã thêm `tools/check-markdown-links.js`. Script bỏ qua code fence, URL ngoài và
anchor, rồi xác minh mọi đích file cục bộ. Vòng cuối sau khi tạo báo cáo này phải
cho kết quả 0 broken link.

## 4. Kết quả kiểm chứng thực tế

| Gate | Kết quả thực tế |
|---|---|
| Node test | PASS — 145/145; 0 fail, 0 skipped, 0 todo |
| Memory simulator | PASS — 8 assertion trên 14 scenario |
| Authenticated local MQTT broker | PASS — 15 assertion; anonymous bị từ chối |
| Config/secret audit | PASS — 0 finding |
| `npm audit` và `npm audit --omit=dev` | PASS — 0 vulnerability |
| JavaScript syntax | PASS — 39 file |
| JSON parse | PASS — 33 file |
| PowerShell parser | PASS — 5 file |
| Firmware native unit tests | PASS — 17/17 |
| PlatformIO ESP32 build | PASS — RAM 52.940/327.680 byte (16,2%); flash 1.103.737/1.310.720 byte (84,2%) |
| Arduino isolated profile | PASS — 1.107.893 byte flash (84%); 52.968 byte RAM (16%) |
| Arduino IDE global environment | PASS — CLI 1.5.1, core 2.0.17, đúng toàn bộ library pin; 1.107.681 byte flash (84%); 52.960 byte RAM (16%) |
| Arduino source parity | PASS — 30 file production/mirror khớp SHA-256 |
| FlowFuse regeneration | PASS — 235.945 byte; SHA-256 `ee73551fac45c79b8706f0813595c386030e3acd32ed8fb4943f641d9d58afa8` |
| Wokwi custom chip compile | PASS — WASM 66.402 byte |
| Wokwi diagram lint | PASS, không có error/warning; 3 dòng info cho loại part được CLI ghi là undocumented/unsupported catalog |
| Wokwi firmware build | PASS — RAM 22.432 byte (6,8%); flash 321.613 byte (24,5%) |
| Wokwi ZIP | PASS — 12 file, build output/private config bị loại; hai lần đóng gói cùng SHA-256 `0f21f00741750243f7acb71a65a7d0074d316e9317f0b5b3dea58ede4c069857` |
| Markdown local links sau khi xóa tài liệu legacy và chuyển gói `THUYETMINH` | PASS — 40 file, 61 link, 0 broken |
| `git diff --check` | PASS — không có whitespace error; cảnh báo LF→CRLF là cấu hình line-ending của working tree, không phải diff error |
| Supabase clean rebuild + pgTAP | **UNAVAILABLE** — không có Supabase CLI/Docker |
| Wokwi runtime simulation | **UNAVAILABLE** — không có `WOKWI_CLI_TOKEN` |
| ESP32 upload/full physical E2E hiện tại | **UNAVAILABLE** — board chưa cắm; chỉ có Bluetooth COM8/COM9 |

Ba dòng `info` của Wokwi linter không phải lỗi kết nối. Chính tài liệu diagram
format của Wokwi liệt kê `board-esp32-devkit-c-v4` là microcontroller được hỗ
trợ; hai part còn lại là ký hiệu VCC/GND dùng để biểu diễn rõ nguồn tải ngoài và
common ground. Nếu Wokwi đổi catalog trong tương lai, phải lint lại trước demo.

## 5. File trùng lặp đã xóa theo xác nhận

Năm file sau đã được xóa sau khi người dùng xác nhận:

1. `HUONG_DAN_LAP_MACH_CHI_TIET.md`
2. `HDCT.md`
3. `hardware/assembly-guide.md`
4. `hardware/wiring-diagram/phase-1-wiring.md`
5. `hardware/wiring-diagram/phase-3-buzzer-wiring.md`

Các file `firmware/README.md`, `arduino/README.md`, BOM, pin map, power budget,
architecture, deployment, contract, test plan và evidence **không** được xem là
hướng dẫn lắp mạch trùng lặp; chúng là tài liệu kỹ thuật/truy vết cho subsystem.
Các PDF môn học và proposal cũng là hồ sơ nguồn, nên giữ nguyên.

## 6. File đầu ra chính

- Lắp mạch: [HUONG_DAN_LAP_MACH_THEO_THU_TU.md](HUONG_DAN_LAP_MACH_THEO_THU_TU.md)
- Test sau lắp: [HUONG_DAN_CHAY_HE_THONG.md](HUONG_DAN_CHAY_HE_THONG.md)
- Nội dung report: [NOI_DUNG_BAO_CAO_CUOI_KY.md](NOI_DUNG_BAO_CAO_CUOI_KY.md)
- Wokwi source: [wokwi/smart-privacy-locker-wokwi](wokwi/smart-privacy-locker-wokwi)
- Wokwi ZIP: [wokwi/smart-privacy-locker-wokwi.zip](wokwi/smart-privacy-locker-wokwi.zip)
- Arduino sketch: [arduino/SmartPrivacyLocker/SmartPrivacyLocker.ino](arduino/SmartPrivacyLocker/SmartPrivacyLocker.ino)
- Evidence Arduino: [tests/evidence/phase-3/arduino-ide-results.md](tests/evidence/phase-3/arduino-ide-results.md)

## 7. Nguồn chính thức đã đối chiếu

- [Espressif ESP32 GPIO API](https://docs.espressif.com/projects/arduino-esp32/en/latest/api/gpio.html)
- [Espressif ESP32 datasheet](https://documentation.espressif.com/esp32_datasheet_en.pdf)
- [Espressif esptool troubleshooting](https://docs.espressif.com/projects/esptool/en/latest/esp32/troubleshooting.html)
- [Espressif boot mode selection — BOOT/EN/RTS/DTR](https://docs.espressif.com/projects/esptool/en/latest/esp32/advanced-topics/boot-mode-selection.html)
- [Wokwi diagram format và linter](https://docs.wokwi.com/diagram-format)
- [Wokwi CLI usage](https://docs.wokwi.com/wokwi-ci/cli-usage)
- [Wokwi custom chips to WASM](https://docs.wokwi.com/guides/custom-chips-to-wasm)
- [Wokwi custom-chip project configuration](https://docs.wokwi.com/vscode/project-config)
- [PubSubClient 2.8 source](https://github.com/knolleary/pubsubclient/blob/v2.8/src/PubSubClient.cpp)
- [ArduinoJson `measureJson()` v7](https://arduinojson.org/v7/api/json/measurejson/)
- [Jiangsu Huaneng TMB12A05 raw-buzzer datasheet](https://datasheet.lcsc.com/datasheet/pdf/2a16321f74deffcaef3942d9437fae37.pdf?productCode=C96093)
- [TowerPro SG90 product data](https://towerpro.com.tw/product/sg90-7/)
- [Aosong AM2302/DHT22 product data](https://www.aosong.com/en/Products/info.aspx?itemid=2294&lcid=139)

## 8. Điều kiện để nâng trạng thái lên full-system PASS

Chỉ nâng khi cùng một revision source và cùng wiring cuối đã hoàn thành toàn bộ
`SYS-01` đến `SYS-11`, đặc biệt:

- đo rail/continuity/dòng và chạy full-load;
- buzzer GPIO26 LOW/HIGH, 10 cold boot + 10 EN, ACK/state đúng;
- sensor, OLED, MC-38, SG90, WS2812B và nguồn tải thật;
- WiFiManager, mất/kết nối lại Wi-Fi và MQTT;
- Supabase clean migration/RLS/pgTAP;
- Dashboard/Node-RED/MQTT/ESP32 end-to-end;
- lưu ảnh/video/log đã loại credential.

Compile, simulator hoặc Wokwi PASS riêng lẻ không được dùng để thay thế các gate
vật lý này.

## 9. Ghi nhận chuyển gói Fusion/VIVA vào repository

Theo xác nhận của người dùng, toàn bộ thư mục `THUYETMINH` gồm 34 file
(39.349.988 byte) đã được chuyển từ thư mục môn học vào repository. File chính
hiện ở
`THUYETMINH/03_SMART_PRIVACY_LOCKER_VIVA_FINAL/01_MO_HINH_FUSION_CHINH/Smart_Privacy_Locker_v2.1_Final.f3d`.
SHA-256 trước và sau khi chuyển đều là
`952c9dc516304b4d54c5cafb1eb40b13a8f54367086e4128ac262a8eba59c0e3`.

Ba script chạy trong Fusion trước đây hard-code đường dẫn cũ. Chúng đã được đổi
sang thứ tự resolve an toàn: biến môi trường `SPL_THUYETMINH_WORKSPACE`, vị trí
tương đối từ `__file__` khi có, rồi mới dùng fallback tuyệt đối của vị trí mới
khi chạy qua Fusion MCP không định nghĩa `__file__`. JSON audit trong gói final
vẫn giữ đường dẫn lịch sử vì đó là evidence của lần build cũ, không phải cấu
hình runtime. Việc chuyển file và kiểm tra hash đạt mức `ARTIFACT_VERIFIED`; mô
hình không được mở/chỉnh sửa bằng Fusion trong thao tác di chuyển này.
