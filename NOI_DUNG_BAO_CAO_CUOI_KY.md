# Nội dung báo cáo cuối kỳ — Smart Privacy Locker

> Trạng thái: bản Markdown biên soạn theo
> [TCTA_YÊU CẦU BÁO CÁO CUỐI KỲ.pdf](TCTA_YÊU%20CẦU%20BÁO%20CÁO%20CUỐI%20KỲ.pdf),
> đối chiếu thêm
> [TCTA_QUY ĐỊNH ĐỒ ÁN CUỐI KỲ.pdf](TCTA_QUY%20ĐỊNH%20ĐỒ%20ÁN%20CUỐI%20KỲ.pdf)
> và đề xuất đã nộp của nhóm
> [12_24127177_24127205_24127249.pdf](12_24127177_24127205_24127249.pdf).
> Những ô `CHƯA CHỐT` phải được thay bằng evidence thật trước khi xuất PDF.

## 1. Trang bìa

**ĐẠI HỌC QUỐC GIA THÀNH PHỐ HỒ CHÍ MINH**<br>
**TRƯỜNG ĐẠI HỌC KHOA HỌC TỰ NHIÊN**<br>
**KHOA CÔNG NGHỆ THÔNG TIN**

**BÁO CÁO ĐỒ ÁN CUỐI KỲ**<br>
**MÔN: VẬT LÝ CHO CÔNG NGHỆ THÔNG TIN**

# SMART PRIVACY LOCKER

## Hệ thống tủ đồ bảo mật IoT

**Nhóm:** 12<br>
**Giảng viên hướng dẫn:** Đặng Hoài Thương

| STT | Họ và tên | MSSV |
|---:|---|---:|
| 1 | Thái Quang Huy | 24127177 |
| 2 | Nguyễn Văn Minh | 24127205 |
| 3 | Mai Phương Thùy | 24127249 |

**Thành phố Hồ Chí Minh, [THÁNG/NĂM NỘP]**

---

## 2. Danh sách chức năng

### 2.1. Chức năng cơ bản

| Mã | Luồng chức năng được đăng ký | Sinh viên phụ trách | Trạng thái/evidence cuối | Thay đổi so với đề xuất |
|---|---|---|---|---|
| CB1 | MC-38 phát hiện trạng thái cửa → ESP32 → MQTT → Node-RED/FlowFuse → Dashboard hiển thị | Nguyễn Văn Minh — 24127205 | `CHƯA CHỐT`: cần video MC-38 thật, MQTT state và Dashboard cùng trạng thái | Không |
| CB2 | Dashboard gửi lệnh khóa/mở → Node-RED/FlowFuse → MQTT → ESP32 → servo SG90 điều khiển chốt | Thái Quang Huy — 24127177 | `CHƯA CHỐT`: cần video cơ khí + correlated ACK + retained state | Không |
| CB3 | Dashboard/luồng cảnh báo gửi lệnh → MQTT → ESP32 → active buzzer LOW-trigger phát/tắt âm | Mai Phương Thùy — 24127249 | `CHƯA CHỐT`: inactive HIGH ở VCC 3V3 đã quan sát; còn GPIO26 LOW/HIGH, ACK/state, boot lặp và full-load | Không thay đổi chức năng; chỉ hiệu chỉnh wiring module từ VCC 5 V trong đề xuất sang VCC 3V3 theo specimen thật |

Ghi chú: thay đổi `VCC` của buzzer là thay đổi chi tiết triển khai phần cứng để
phù hợp module nhận được, không phải thêm/xóa một chức năng. Theo yêu cầu đề
bài, nếu nhóm quyết định khai báo một chức năng là “thay đổi/thêm/xóa”, toàn
báo cáo chỉ được có tối đa **một** chức năng như vậy.

### 2.2. Chức năng nâng cao

| YC | Chức năng đã đăng ký | Sinh viên phụ trách | Điểm tối đa theo đề xuất | Evidence phải có trước khi ghi hoàn thành | Thay đổi so với đề xuất |
|---:|---|---|---:|---|---|
| YC1 | DHT22 → ESP32 → OLED hiển thị nhiệt độ/độ ẩm | Thái Quang Huy — 24127177 | 1,5 | ảnh/video DHT22 thật đổi giá trị và OLED hiển thị ổn định | Không |
| YC3 | Website/Dashboard → backend → MQTT → ESP32 → WS2812B đổi trạng thái | Thái Quang Huy — 24127177 | 1,5 | video pixel thật + ACK/state + gate direct/full-load | Không |
| YC12 | ESP32 cung cấp WiFiManager captive portal để cấu hình Wi-Fi | Thái Quang Huy — 24127177 | 1,0 | video `Locker-Setup`, lưu Wi-Fi và reboot tự kết nối lại | Không |
| YC4 | Lưu lịch sử hoạt động theo thời gian trên Supabase | Mai Phương Thùy — 24127249 | 1,5 | record database thật, chống trùng và đúng owner | Không |
| YC5 | Đọc dữ liệu cloud và hiển thị lịch sử/biểu đồ trên Dashboard | Mai Phương Thùy — 24127249 | 1,5 | ảnh history và chart 7/30 ngày, có bucket 0 | Không |
| YC7 | Gửi báo cáo hằng ngày qua Gmail SMTP | Mai Phương Thùy — 24127249 | 1,0 | email nhận thật hoặc mailbox test được giảng viên chấp nhận; không lộ credential | Không |
| YC6 | Phát hiện mở cửa trái phép và gửi cảnh báo nhanh qua Telegram, đồng thời bật buzzer | Nguyễn Văn Minh — 24127205 | 1,0 | video unauthorized flow + một event + Telegram + alarm; không gửi trùng | Không |
| YC8 | Chatbot trả lời theo điều kiện/trạng thái/lịch sử với Gemini | Nguyễn Văn Minh — 24127205 | 1,5 | ảnh câu hỏi thuộc phạm vi, câu trả lời có nguồn dữ liệu và lỗi provider có kiểm soát | Không |
| YC9 | Đăng ký/đăng nhập và phân quyền owner bằng Supabase Auth/RLS | Nguyễn Văn Minh — 24127205 | 1,5 | owner được phép, user khác bị chặn, claim một lần; pgTAP/live gate | Không |

Tổng điểm nâng cao **đã đăng ký trong đề xuất** của mỗi thành viên là 4,0.
Đây chưa phải kết luận điểm đạt cuối kỳ; điểm tự đánh giá chỉ được chốt sau khi
evidence của đúng chức năng đã PASS.

### 2.3. Đối chiếu phạm vi với đề xuất

- Không thêm chức năng ngoài bảng đăng ký.
- Không xóa chức năng đã đăng ký.
- Không đổi người phụ trách so với đề xuất.
- CB3 giữ nguyên chức năng active buzzer; revision phần cứng chốt
  `VCC→ESP32 3V3`, `GND→GND`, `IN←4,7 kΩ←GPIO26`, active-low.
- Nếu trạng thái thực tế trước ngày nộp khác bốn dòng trên, nhóm phải sửa bảng
  chức năng và cột thay đổi trung thực; không được giữ mô tả “hoàn thành” khi
  evidence không tồn tại.

---

## 3. Hình sản phẩm hoặc sơ đồ Wokwi

### 3.1. Hình bắt buộc đưa vào báo cáo

Chọn ít nhất một trong hai phương án; nên dùng cả hai nếu sản phẩm thật đã lắp
hoàn chỉnh:

1. **Ảnh sản phẩm thật toàn cảnh**, có nhãn/callout cho:
   - ESP32 DevKit;
   - OLED SSD1306;
   - DHT22;
   - MC-38 và nam châm;
   - SG90 và cơ cấu chốt;
   - WS2812B;
   - module active buzzer LOW-trigger TMB12A05;
   - nguồn tải 5 V, công tắc và common GND.
2. **Ảnh sơ đồ Wokwi đã cập nhật** từ
   `wokwi/smart-privacy-locker-wokwi/diagram.json`, trong đó từng thiết bị đã
   có nhãn và được bố trí theo vùng để không che nhau.

**Hình 1.** Sơ đồ phần cứng Smart Privacy Locker. DHT22 dùng GPIO4; OLED dùng
GPIO21/22; SG90 dùng GPIO18; WS2812B dùng GPIO25; active buzzer LOW-trigger
dùng GPIO26 qua 4,7 kΩ và VCC 3V3; MC-38 dùng GPIO27.

> Chèn ảnh thật tại đây: `report-assets/hinh-01-san-pham-hoac-wokwi.png`

### 3.2. Lưu ý trung thực cho hình Wokwi

Wokwi xác thực cấu trúc logic và trình tự GPIO, không chứng minh dòng nguồn,
brownout, nhiệt, lực cơ hoặc độ ổn định của đúng module thật. Nếu chỉ có Wokwi,
chú thích rõ “mô phỏng”; không dùng ảnh mô phỏng để tuyên bố full-load phần
cứng đã PASS.

---

## 4. Ảnh website và tên chức năng

Mỗi ảnh phải chụp rõ trạng thái/đầu ra, che token/email/credential nhạy cảm và
đặt caption nói đúng chức năng. Bộ ảnh tối thiểu đề xuất:

| Hình | Nội dung ảnh | Caption chức năng |
|---:|---|---|
| 2 | Trang đăng nhập/đăng ký | YC9 — Supabase Auth |
| 3 | Claim/chọn locker và trạng thái owner | YC9 — ownership và RLS |
| 4 | Dashboard live: MQTT, device, door, lock, alarm, LED | CB1/CB2/CB3 — trạng thái và điều khiển thiết bị |
| 5 | Lệnh LOCK/UNLOCK đã có ACK/state | CB2 — điều khiển SG90 |
| 6 | Lệnh LED ON/OFF đã có ACK/state | YC3 — điều khiển WS2812B từ web |
| 7 | Alarm/unauthorized event | CB3 + YC6 — buzzer và cảnh báo mở trái phép |
| 8 | History | YC4 — lưu lịch sử Supabase |
| 9 | Biểu đồ 7 hoặc 30 ngày | YC5 — dữ liệu cloud hiển thị trên website |
| 10 | Liên kết/nhận Telegram | YC6 — thông báo nhanh |
| 11 | Email báo cáo hằng ngày | YC7 — Gmail SMTP |
| 12 | Chatbot hỏi trạng thái/lịch sử | YC8 — chatbot Gemini có grounding |
| 13 | Wi-Fi connectivity trên Dashboard và/hoặc portal `Locker-Setup` | YC12 — cấu hình Wi-Fi cục bộ |

Không cần cố nhét tất cả ảnh vào một trang. Ưu tiên ảnh đọc được, mỗi ảnh có
caption ngay bên dưới và cùng kích thước hợp lý.

---

## 5. Tự đánh giá điểm từng thành viên

Theo quy định, bảng cuối phải tách điểm chức năng cơ bản, chức năng nâng cao,
điểm nhóm và điểm báo cáo. Công thức tổng quát của môn là
`(điểm cơ bản + điểm nâng cao + điểm báo cáo) × K`; bảng yêu cầu của báo cáo
còn có cột điểm nhóm. Nhóm cần dùng đúng cách trình bày mà giảng viên đã hướng
dẫn trên lớp nếu có cập nhật.

### 5.1. Bảng dự kiến theo đề xuất — chưa phải điểm đạt

| MSSV | Họ và tên | Cơ bản (tối đa) | Nâng cao đã đăng ký (tối đa) | Nhóm (tối đa) | Báo cáo (tối đa) | Tổng dự kiến tối đa | Điểm tự đánh giá cuối |
|---:|---|---:|---:|---:|---:|---:|---:|
| 24127177 | Thái Quang Huy | 4,0 | 4,0 | 1,0 | 1,0 | 10,0 | `CHƯA CHỐT` |
| 24127205 | Nguyễn Văn Minh | 4,0 | 4,0 | 1,0 | 1,0 | 10,0 | `CHƯA CHỐT` |
| 24127249 | Mai Phương Thùy | 4,0 | 4,0 | 1,0 | 1,0 | 10,0 | `CHƯA CHỐT` |

### 5.2. Quy tắc chốt điểm trung thực

- Chỉ giữ điểm của chức năng có sản phẩm/evidence thật và giải thích được.
- Trừ điểm tương ứng nếu chức năng không chạy, chỉ mô phỏng khi yêu cầu sản
  phẩm thật, hoặc không chứng minh được người phụ trách.
- Điểm nhóm chỉ chốt khi tích hợp chung hoạt động và các thành viên phối hợp.
- Điểm báo cáo chỉ chốt sau khi PDF đủ phần, ảnh/caption rõ, tên file đúng và
  không có tuyên bố sai.
- Mỗi thành viên đọc và xác nhận bảng điểm trước khi trưởng nhóm nộp.

---

## 6. Nguồn kỹ thuật dùng để xác thực triển khai

- [Espressif ESP32-DevKitC V4 user guide](https://documentation.espressif.com/projects/esp-dev-kits/en/latest/esp32/esp32-devkitc/user_guide.html)
- [Espressif Arduino-ESP32 GPIO API](https://docs.espressif.com/projects/arduino-esp32/en/latest/api/gpio.html)
- [Espressif esptool boot mode/BOOT/EN/RTS-DTR](https://docs.espressif.com/projects/esptool/en/latest/esp32/advanced-topics/boot-mode-selection.html)
- [TMB12A05 manufacturer datasheet linked by LCSC](https://datasheet.lcsc.com/datasheet/pdf/2a16321f74deffcaef3942d9437fae37.pdf?productCode=C96093)
- [Wokwi diagram format và linter](https://docs.wokwi.com/diagram-format)
- [Wokwi custom chip configuration](https://docs.wokwi.com/vscode/project-config)
- [PubSubClient release 2.8](https://github.com/knolleary/pubsubclient/releases/tag/v2.8)
- [WiFiManager 2.0.17 source metadata](https://github.com/tzapu/WiFiManager/blob/master/library.properties)

---

## 7. Checklist trước khi xuất và nộp PDF

- [ ] Tất cả `CHƯA CHỐT` đã được thay bằng kết quả thật hoặc mô tả trung thực
  rằng chức năng chưa hoàn thành.
- [ ] Tên trường, khoa, môn, đề tài, nhóm, giảng viên, họ tên và MSSV đúng.
- [ ] Bảng chức năng có đủ cơ bản/nâng cao, người phụ trách và thay đổi so với
  đề xuất; tổng số chức năng thay đổi/thêm/xóa không vượt quá một.
- [ ] Ảnh sản phẩm hoặc Wokwi có nhãn tên thiết bị.
- [ ] Ảnh website có tên chức năng/caption.
- [ ] Bảng tự đánh giá có điểm từng thành viên và được cả nhóm xác nhận.
- [ ] Không có mật khẩu Wi-Fi, MQTT credential, JWT, Supabase service-role,
  Telegram token, Gemini key hoặc Gmail app password trong ảnh/PDF.
- [ ] Render PDF và kiểm tra mọi trang: không chữ tràn, bảng vỡ, ảnh mờ hoặc
  link/placeholder còn sót.
- [ ] Trưởng nhóm nộp đúng một file có tên:

  ```text
  12_24127177_24127205_24127249_FINAL.PDF
  ```

- [ ] Nội dung phản ánh đúng phần việc thật. Theo yêu cầu môn học, báo cáo
  không trung thực có chế tài rất nặng; không điền kết quả/điểm theo kỳ vọng.
