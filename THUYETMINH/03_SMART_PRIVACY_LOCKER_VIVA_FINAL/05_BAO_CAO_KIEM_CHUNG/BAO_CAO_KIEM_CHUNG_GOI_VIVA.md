# VIVA PACKAGE VERIFICATION REPORT

Generated: 2026-07-31T22:57:17+07:00

## Kết luận

**PASS — package này chỉ được tạo sau khi toàn bộ nguồn bắt buộc vượt qua kiểm tra.**

| Hạng mục | Kết quả |
|---|---:|
| Component / occurrence | 25 / 24 |
| F3D body / solid | 340 / 340 |
| STEP body / solid | 340 / 340 |
| Timeline / lỗi | 118 / 0 |
| User parameters | 29 |
| Named Views | 28 |
| Tuyến dây / đoạn dây | 26 / 159 |
| Góc quét interference | 22 |
| Va chạm nghiêm trọng | 0 |

## Liên kết bằng SHA-256

- F3D: `952C9DC516304B4D54C5CAFB1EB40B13A8F54367086E4128AC262A8EBA59C0E3`
- STEP: `F415D863D2D649A854163CD1172152E21F4CC9A5014B80E26F7271D821A41DCE`
- Fresh-reopen audit ghi đúng hai hash trên.
- Từng ảnh/PDF được đối chiếu với endpoint-evidence audit khi audit có danh sách `generated_files`.
- PDF/DOCX đã nộp được đối chiếu với hash bất biến đã khóa trong builder.

## Giới hạn được công bố trung thực

- Các pin ESP32 trong CAD là tên logic theo chức năng; số GPIO cụ thể thuộc firmware/pinout và không được tự suy diễn từ thuyết minh đã nộp.
- STEP dùng để dự phòng hình học; F3D là file chính khi vấn đáp vì giữ component, timeline, parameters, joint và Named Views.
