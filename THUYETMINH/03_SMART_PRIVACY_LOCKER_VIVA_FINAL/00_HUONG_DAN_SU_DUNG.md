# SMART PRIVACY LOCKER — GÓI VẤN ĐÁP MỚI NHẤT

## Mở file nào trước?

1. Mở `01_MO_HINH_FUSION_CHINH/Smart_Privacy_Locker_v2.1_Final.f3d` trong Autodesk Fusion.
2. Mở **Named Views** và chọn `VIVA_00_START_HERE` để bắt đầu. Named View lưu camera; trạng thái cửa/nắp được điều khiển riêng như bên dưới.
3. Demo cửa: trong Browser, nhấp phải `Joint_Door_Revolute` -> **Drive Joint** -> cho chạy 0° đến 105°. Dùng `VIVA_03_Interior_Open` hoặc `VIVA_08_Annotated_Interior_Context` khi cửa ở 105°.
4. Demo khoang điện tử: tắt bóng đèn của component `19_Technical_Compartment_Cover`; nếu cần nhìn từ trên thì tắt thêm body `Top_Panel` và `Front_Technical_Fascia` trong `01_Enclosure`. Sau đó chọn `VIVA_04`, `VIVA_09` hoặc `VIVA_14`.
5. Các camera còn lại: `VIVA_05`/`VIVA_12` cho nguồn phía sau; `VIVA_10` cho cơ cấu khóa; `VIVA_11` cho MC-38; `VIVA_06`/`VIVA_07` cho kích thước.
6. Kết thúc demo: đưa joint về 0° và bật lại nắp/các body đã ẩn. Không Save đè lên file gốc nếu chỉ đang trình diễn.
7. Mở `02_BANG_TRINH_BAY_VIVA/2.1_Design_Board_VIVA.pdf` khi cần xem ảnh chú thích cỡ chữ lớn và vị trí linh kiện; các PNG riêng nằm trong `03_HINH_ANH_VIVA`, audit nằm trong `05_BAO_CAO_KIEM_CHUNG`.

## Trạng thái đã kiểm chứng

- Fresh F3D/STEP: PASS; 340 body/solid.
- Cơ khí lắp ghép và 26 tuyến dây chức năng: PASS.
- Named Views: 28, có đủ `VIVA_00`–`VIVA_14`.
- Joint cửa 0° → 105° → 0°: PASS.
- Quét va chạm: 22 góc, bước 5°, 0 va chạm nghiêm trọng.
- Hai file trong `04_THUYET_MINH_DA_NOP` là bản đã nộp, được giữ nguyên byte và khóa bằng SHA-256.

## Cấu trúc sạch

- `01_MO_HINH_FUSION_CHINH`: file F3D chính, giữ component, timeline, parameters, joint và Named Views.
- `02_BANG_TRINH_BAY_VIVA`: PDF tổng hợp dùng để trình bày nhanh khi vấn đáp.
- `03_HINH_ANH_VIVA`: đúng 9 ảnh VIVA mới nhất.
- `04_THUYET_MINH_DA_NOP`: PDF/DOCX gốc, không chỉnh sửa.
- `05_BAO_CAO_KIEM_CHUNG`: build, fresh-reopen, routing/mechanical, interference, endpoint và mapping chức năng.
- `06_MO_HINH_STEP_DU_PHONG`: STEP mới nhất.
- `99_MANIFEST_SHA256.txt`: hash của mọi file trong gói, trừ chính manifest để tránh vòng lặp hash.
