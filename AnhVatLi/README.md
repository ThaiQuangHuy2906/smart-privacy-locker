# Danh mục ảnh vật lý và ảnh dashboard

Thư mục này lưu **bằng chứng gốc** của mô hình đã lắp và dashboard đã chạy. Các
ảnh vật lý hiện được lưu dưới dạng `.jpg`; tài liệu chỉ lập chỉ mục file hiện
có, không dùng việc đổi tên/định dạng để suy ra chất lượng bằng chứng.

## 1. Ảnh mô hình vật lý

| Tệp | Nội dung quan sát được | Cách dùng trong báo cáo |
| --- | --- | --- |
| [2.3.1.jpg](2.3.1.jpg) | Toàn cảnh bên ngoài tủ khi đóng, có OLED ở mặt trước | Ảnh tổng thể sản phẩm |
| [2.3.2.jpg](2.3.2.jpg) | Tủ mở, thấy bố trí linh kiện bên trong | Ảnh kết cấu bên trong |
| [2.3.3_1.jpg](2.3.3_1.jpg), [2.3.3_2.jpg](2.3.3_2.jpg) | Hai góc nhìn tổng quan hệ thống dây và các module | Ảnh bố trí mạch đã lắp |
| [2.3.4_1.jpg](2.3.4_1.jpg), [2.3.4_2.jpg](2.3.4_2.jpg) | Cận cảnh MC-38 và cơ cấu servo ở mép cửa | Minh họa cảm biến cửa và cơ cấu chốt |
| [2.3.5_1.jpg](2.3.5_1.jpg), [2.3.5_2.jpg](2.3.5_2.jpg) | Tay servo ở hai vị trí cơ khí khác nhau | Minh họa vị trí khóa/mở chốt; không dùng để khẳng định có cảm biến góc |
| [2.3.6.jpg](2.3.6.jpg) | Cụm OLED/LED và dây kết nối bên trong | Minh họa phần hiển thị và chiếu sáng |
| [2.3.7_1.jpg](2.3.7_1.jpg), [2.3.7_2.jpg](2.3.7_2.jpg) | LED ở hai trạng thái bật/tắt | Minh họa điều khiển đèn |
| [2.3.8_1.jpg](2.3.8_1.jpg) | Cận cảnh module active buzzer | Minh họa còi cảnh báo |
| [2.3.8_2.jpg](2.3.8_2.jpg) | ESP32 và hệ thống dây | Minh họa bộ điều khiển trung tâm |
| [2.3.9.jpg](2.3.9.jpg) | Cụm đầu nối và đường cấp nguồn DC | Minh họa phần cấp nguồn đã lắp |

### Kết luận cơ khí từ ảnh

- Tay servo là **chốt quay ở mép cửa**. Servo khóa/mở chốt; người dùng vẫn tự
  mở hoặc đóng cánh cửa.
- MC-38 chỉ xác nhận `OPEN`/`CLOSED` của cánh cửa. Hệ thống không có cảm biến
  góc servo hoặc công tắc hành trình để xác nhận chốt đã thực sự tới vị trí.
- Cấu hình đã chốt theo code hiện tại là `LOCK_ANGLE=80`,
  `UNLOCK_ANGLE=170`, `SERVO_SETTLE_MS=2000`.
- Ảnh chỉ xác nhận bố trí quan sát được, không thay thế phép đo dòng, nhiệt độ,
  lực giữ hoặc thử tải điện/cơ khí.

## 2. Ảnh dashboard ngày 2026-08-18

Các tệp trong [AnhWeb](AnhWeb/) là ảnh chụp **phiên bản trước đợt rà soát UX
hiện tại**:

| Tệp | Nội dung |
| --- | --- |
| [170255](<AnhWeb/Ảnh chụp màn hình 2026-08-18 170255.png>) | Tài khoản và liên kết tủ |
| [170308](<AnhWeb/Ảnh chụp màn hình 2026-08-18 170308.png>) | Trạng thái trực tuyến, cửa, chốt, còi và đèn |
| [170316](<AnhWeb/Ảnh chụp màn hình 2026-08-18 170316.png>) | Điều khiển và chatbot |
| [170323](<AnhWeb/Ảnh chụp màn hình 2026-08-18 170323.png>) | Hướng dẫn Wi-Fi captive portal |
| [170331](<AnhWeb/Ảnh chụp màn hình 2026-08-18 170331.png>) | Lịch sử và biểu đồ khi chưa tải dữ liệu |
| [170338](<AnhWeb/Ảnh chụp màn hình 2026-08-18 170338.png>) | Liên kết Telegram và báo cáo hằng ngày |

Không dùng các ảnh này để khẳng định UI hiện tại đã đạt nghiệm thu, vì code sau
đó đã đổi các điểm sau:

- dùng thuật ngữ **Khóa ngay/Mở chốt**, giải thích auto-lock sau đóng/hết hạn,
  và không nói servo tự đóng/mở cánh cửa;
- đổi **Kiểm tra còi** thành **Bật còi**;
- ẩn form xác thực sau đăng nhập và bỏ nội dung kỹ thuật về Bearer token;
- khóa từng nút theo đúng điều kiện đăng nhập, quyền sở hữu, MQTT, độ mới của
  state, cửa đóng và lệnh đang chờ;
- polling state là 5 giây khi tab hiển thị và 15 giây khi tab ẩn; không tạo các
  request chồng nhau;
- biểu đồ có số liệu đọc được và bảng dữ liệu thay thế cho người dùng không thể
  dựa vào màu/đồ họa.

> **Quyền riêng tư:** một số ảnh gốc có email và tên tài khoản Telegram cá nhân.
> Phải che các trường này trên **bản sao dùng để nộp hoặc công khai**. Giữ ảnh
> gốc riêng tư để bảo toàn bằng chứng; không chỉnh sửa đè lên tệp gốc.
