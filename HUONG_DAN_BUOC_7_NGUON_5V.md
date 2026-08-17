# Bước 7 — Nối nguồn tải 5 V với đầu nối 2 vào / 6 ra

Dùng đúng các món đang có:

- Adapter đầu tròn 5 V / 3 A
- Jack DC cái 5,5 × 2,5 mm
- Công tắc I/O đã có sẵn hai dây: dây đỏ phía O, dây đen phía I
- Dây đỏ 22 AWG
- Dây đen 22 AWG
- Một đầu nối 2 vào / 6 ra có cần gạt xanh dương và cam
- Đồng hồ vạn năng

Mục tiêu: tạo hai rail trên breadboard:

~~~text
rail trên thứ nhất: +5V tải
rail trên thứ hai:  GND tải
~~~

Ở Bước 7, chưa nối servo, WS2812B hoặc ESP32 vào hai rail này.

> **Cảnh báo:** Rút adapter khỏi ổ điện, rút phích DC khỏi jack cái và rút USB-C khỏi ESP32 trước khi cắm/rút/đổi dây.

## 1. Cấu trúc đúng của đầu nối 2 vào / 6 ra

Đầu nối của bạn là khối nhựa xám có cần gạt **xanh dương** và **cam**. Nó có **hai nhánh điện tách biệt**:

~~~text
NHÁNH XANH
  1 cổng VÀO XANH  ─── thông với ─── 3 cổng RA XANH

NHÁNH CAM
  1 cổng VÀO CAM   ─── thông với ─── 3 cổng RA CAM
~~~

Nhánh xanh và nhánh cam **không thông với nhau**. Không phải tất cả 8 cổng là một điểm điện chung.

Trong hướng dẫn này, quy ước:

~~~text
Nhánh XANH = +5V tải
Nhánh CAM  = GND tải
~~~

Đây chỉ là quy ước để dễ theo dõi; màu xanh/cam không tự có nghĩa là dương/âm.

## 2. Vị trí các cổng trên đầu nối

Đặt đầu nối giống chiều trong ảnh đầu tiên của bạn: hai cần gạt đơn nằm ở phía dưới, sáu cần gạt nằm thành hai cụm ba ở phía trên.

~~~text
Phía trên đầu nối: sáu cổng RA

  [RA XANH 1] [RA XANH 2] [RA XANH 3]
  [RA CAM   1] [RA CAM   2] [RA CAM   3]

Phía dưới đầu nối: hai cổng VÀO

  [VÀO XANH] [VÀO CAM]
~~~

Nếu khi cầm thực tế bạn thấy bố cục bị xoay, đừng dựa vào trái/phải. Chỉ dựa vào màu:

~~~text
VÀO XANH → chỉ đi với các cổng RA XANH
VÀO CAM  → chỉ đi với các cổng RA CAM
~~~

## 3. Vị trí hai rail trên breadboard

Breadboard có hai dải lỗ dài ở mép trên; không dùng vùng lỗ giữa để nhận nguồn ở bước này.

~~~text
Mép trên breadboard

rail dài thứ nhất:  +5V tải
rail dài thứ hai:   GND tải

vùng lỗ giữa:       không cắm dây nguồn Bước 7 vào đây

rail dưới:          3V3 và GND logic — chưa dùng ở Bước 7
~~~

Nếu breadboard có vạch màu, chọn rail vạch đỏ làm +5V tải và rail vạch xanh/đen cạnh nó làm GND tải. Nếu rail dài bị ngắt ở giữa, dùng cùng một nửa rail hoặc đo continuity trước khi dùng nửa còn lại.

## 4. Để mạch không có điện

1. Rút adapter khỏi ổ điện.
2. Rút phích adapter khỏi jack DC cái.
3. Rút USB-C khỏi ESP32.
4. Gạt công tắc về O / OFF.
5. Chưa cắm servo, WS2812B hay ESP32 vào breadboard.

## 5. Đo cực adapter và chân jack DC

1. Cắm adapter vào ổ điện, nhưng chưa cắm nó vào jack cái.
2. Đặt đồng hồ ở thang 20 V DC.
3. Que đỏ vào đầu kim loại giữa phích adapter; que đen vào vỏ kim loại ngoài.
4. Kết quả phải gần +5 V. Khi đó:

~~~text
đầu giữa adapter = +5V
vỏ ngoài adapter = GND
~~~

5. Rút adapter khỏi ổ điện.
6. Cắm phích adapter vào jack DC cái khi adapter vẫn rút điện.
7. Đặt đồng hồ sang continuity mode.
8. Terminal jack nào thông với đầu giữa phích adapter là J+.
9. Terminal jack nào thông với vỏ ngoài phích adapter là J−.
10. Nếu jack có chân thứ ba, không dùng chân đó.

## 6. Giữ nguyên jumper bạn đã cắm ở cổng vào xanh

Bạn đã nối:

~~~text
dây đen có sẵn ở phía I của công tắc
    → jumper
    → cổng VÀO XANH
~~~

Việc này đúng. **Không cần gỡ jumper.**

Dây đen ở phía I công tắc, cùng jumper nối tiếp với nó, được xem là đường +5V sau công tắc. Nó không phải GND.

Công tắc có hai dây không có cực. Chỉ cần kiểm tra khi adapter rút điện:

| Vị trí công tắc | Giữa đầu cuối dây đỏ O và dây đen I |
|---|---|
| O / OFF | Không thông |
| I / ON | Thông |

## 7. Hoàn tất nhánh xanh: +5V tải

### 7.1 Đưa +5V từ jack tới công tắc

Nối đầu cuối của dây đỏ có sẵn ở phía O công tắc vào terminal J+ của jack DC:

~~~text
J+ jack DC → dây đỏ có sẵn ở O công tắc
~~~

### 7.2 Đưa +5V từ đầu nối xanh tới rail +5V tải

1. Lấy một đoạn **dây đỏ 22 AWG rời**. Đây không phải dây đỏ/dây đen gắn sẵn trên công tắc và không phải jumper.
2. Cắt đoạn dây vừa đủ từ đầu nối tới rail trên breadboard; tuốt mỗi đầu khoảng 6–8 mm.
3. Đầu dây 22 AWG này phải đi **thẳng** từ đầu nối tới breadboard, không cần
   nối qua jumper Dupont. Nếu dây là lõi đơn thì cắm thẳng đầu đã tuốt vào lỗ
   rail breadboard. Nếu là dây nhiều sợi mềm, xoắn thật gọn các sợi đồng rồi
   cắm thẳng vào lỗ rail; chỉ tiếp tục khi dây giữ chắc, không tuột và không có
   sợi đồng tưa chạm lỗ/rail cạnh bên. Không ép dây nếu nó không vào hoặc bị
   lỏng; trong trường hợp đó dừng tại đây, không dùng jumper làm dây thay thế
   cho đường nguồn này.
4. Mở một **cổng RA XANH còn trống**.
5. Cắm một đầu dây đỏ 22 AWG vào cổng RA XANH đó, rồi đóng cần gạt.
6. Cắm đầu còn lại của cùng dây đỏ 22 AWG vào rail dài trên breadboard đã chọn làm +5V tải.

~~~text
J+ jack
  → dây đỏ phía O công tắc
  → công tắc
  → dây đen phía I công tắc
  → jumper
  → VÀO XANH
  → RA XANH bất kỳ
  → dây đỏ 22 AWG
  → rail "+5V tải"
~~~

> **Không dùng cổng RA CAM cho dây đỏ +5V này.** Cổng RA CAM thuộc nhánh GND của hướng dẫn này.

## 8. Hoàn tất nhánh cam: GND tải

1. Lấy một đoạn **dây đen 22 AWG rời**. Cắt từ J− của jack DC tới cổng VÀO CAM; tuốt hai đầu khoảng 6–8 mm.
2. Nối:

~~~text
J− jack DC → dây đen 22 AWG → VÀO CAM
~~~

3. Lấy đoạn **dây đen 22 AWG rời thứ hai**. Cắt từ một cổng RA CAM tới rail GND tải; tuốt hai đầu khoảng 6–8 mm.
4. Nối:

~~~text
RA CAM bất kỳ → dây đen 22 AWG → rail "GND tải"
~~~

Toàn bộ nhánh GND:

~~~text
J− jack DC
  → dây đen 22 AWG
  → VÀO CAM
  → RA CAM bất kỳ
  → dây đen 22 AWG
  → rail "GND tải"
~~~

Không đưa dây GND vào cổng xanh và không đưa +5V vào cổng cam.

## 9. Kiểm tra khi chưa cắm adapter

Adapter vẫn rút điện.

1. Đặt công tắc ở O / OFF. Đo J+ jack ↔ rail +5V tải. Kết quả: **không thông**.
2. Gạt công tắc sang I / ON. Đo lại J+ jack ↔ rail +5V tải. Kết quả: **thông**.
3. Đo J− jack ↔ rail GND tải. Kết quả: **thông**.
4. Đo rail +5V tải ↔ rail GND tải. Kết quả: **không thông**.
5. Nếu Bước 4 kêu/thông, dừng lại và kiểm tra lại: dây từ công tắc phải nằm ở VÀO XANH; dây từ J− phải nằm ở VÀO CAM.

## 10. Cấp điện thử không tải — PASS Bước 7

Servo, WS2812B và ESP32 vẫn chưa được nối vào hai rail tải.

1. Gạt công tắc về O / OFF.
2. Cắm adapter vào jack DC.
3. Cắm adapter vào ổ điện.
4. Gạt công tắc sang I / ON.
5. Đặt đồng hồ ở thang 20 V DC.
6. Que đỏ chạm rail +5V tải; que đen chạm rail GND tải.
7. Kết quả phải gần +5 V.
8. Gạt công tắc về O / OFF. Kết quả phải về gần 0 V.
9. Rút adapter khỏi ổ điện và rút đầu DC khỏi jack trước khi chuyển bước.

## Không được làm

- Không lấy dây đỏ +5V từ RA CAM.
- Không lấy dây đen GND từ RA XANH.
- Không nối +5V tải vào chân 5V hoặc VIN của ESP32.
- Không nối servo, WS2812B hoặc ESP32 vào rail trong Bước 7.
- Không đổi dây khi adapter đang cấp điện.

## 11. Sau khi Bước 7 PASS — chuyển sản phẩm đang chạy USB sang adapter

Phần này dành cho trường hợp bạn đã từng cho ESP32 cấp 5 V tới servo và
WS2812B để thử, còn bây giờ chuyển sang adapter. Mục tiêu cuối cùng là:

~~~text
USB-C              → chỉ cấp nguồn cho ESP32
adapter qua nhánh xanh/cam → chỉ cấp nguồn 5 V cho servo và WS2812B
GND adapter        → nối chung với GND ESP32
~~~

### 11.1 Tắt hoàn toàn và tháo đường nguồn 5 V cũ từ ESP32

1. Rút USB-C khỏi ESP32.
2. Tắt công tắc adapter về O / OFF, rút adapter khỏi ổ điện và rút phích DC
   khỏi jack.
3. Tìm và tháo dây cũ từng nối:

   ~~~text
   ESP32 5V hoặc VIN → rail +5V cũ / rail +5V DEMO
   ~~~

4. Dây này phải được tháo khỏi rail hoàn toàn. Sau khi chuyển, không được còn
   bất kỳ dây nào nối chân 5V/VIN ESP32 với rail +5V tải.
5. Giữ dây ESP32 GND đang nối vào rail GND logic; nó sẽ được nối chung với
   GND tải ở mục 11.3.

### 11.2 Hoàn tất nguồn +5V cho WS2812B và servo từ nhánh xanh

Giữ nguyên đường đã làm ở Bước 7:

~~~text
VÀO XANH → RA XANH số 1 → dây đỏ 22 AWG → rail +5V tải
~~~

Nối WS2812B:

~~~text
WS2812B +5V → rail +5V tải
~~~

Sau đó dùng **một cổng RA XANH còn trống khác**, không dùng rail breadboard,
để cấp trực tiếp cho servo:

~~~text
RA XANH số 2 → dây đỏ 22 AWG → dây đỏ servo SG90
~~~

Tháo dây đỏ servo cũ khỏi rail/bất kỳ chân 5V nào của ESP32 trước khi nối nó
vào RA XANH số 2.

### 11.3 Hoàn tất GND chung bằng nhánh cam

Giữ nguyên đường đã làm ở Bước 7:

~~~text
VÀO CAM → RA CAM số 1 → dây đen 22 AWG → rail GND tải
~~~

Nối ba thứ sau vào rail GND tải:

~~~text
WS2812B GND → rail GND tải
ESP32 GND   → rail GND tải
~~~

Vì ESP32 GND và GND adapter đã nối vào cùng rail này, servo và LED có cùng mốc
điện áp với các chân tín hiệu GPIO của ESP32.

Sau đó dùng **một cổng RA CAM còn trống khác**, không dùng rail breadboard, để
cho servo hồi dòng trực tiếp:

~~~text
RA CAM số 2 → dây đen 22 AWG → dây nâu/đen servo SG90
~~~

Tháo dây nâu/đen servo cũ khỏi rail/bất kỳ GND cũ nào trước khi nối nó vào
RA CAM số 2.

Sơ đồ nguồn sau khi chuyển xong:

~~~text
NHÁNH XANH (+5V)
  VÀO XANH
    ├─ RA XANH 1 → rail +5V tải → WS2812B +5V
    └─ RA XANH 2 → dây đỏ 22 AWG trực tiếp → servo đỏ

NHÁNH CAM (GND)
  VÀO CAM
    ├─ RA CAM 1 → rail GND tải → WS2812B GND và ESP32 GND
    └─ RA CAM 2 → dây đen 22 AWG trực tiếp → servo nâu/đen
~~~

### 11.4 Giữ nguyên các dây tín hiệu

Các dây tín hiệu này không đổi khi chuyển nguồn:

~~~text
ESP32 GPIO25 → điện trở 330 Ω hoặc 470 Ω → WS2812B DIN
ESP32 GPIO18 → dây tín hiệu cam/vàng/trắng của servo
~~~

Dây WS2812B phải đi vào DIN/DI, không phải DOUT. Tụ 470 µF ở đầu vào strip:

~~~text
chân tụ + (dấu +)   → +5V tải
chân tụ − (vạch −)  → GND tải
~~~

### 11.5 Kiểm tra trước khi bật adapter

Adapter và USB-C vẫn rút.

1. Đo continuity: rail +5V tải ↔ rail GND tải. Kết quả: **không thông**.
2. Kiểm tra bằng mắt: không còn dây ESP32 5V/VIN → rail +5V tải.
3. Kiểm tra servo:

   ~~~text
   servo đỏ       → RA XANH trực tiếp
   servo nâu/đen  → RA CAM trực tiếp
   servo signal   → GPIO18
   ~~~

4. Kiểm tra WS2812B:

   ~~~text
   +5V → rail +5V tải
   GND → rail GND tải
   DIN → GPIO25 qua điện trở 330 Ω hoặc 470 Ω
   ~~~

5. Nếu servo đang gắn cơ khí vào cửa, tách cánh tay servo khỏi cửa trước lần
   thử đầu tiên với adapter.

### 11.6 Bật và thử lại sau khi chuyển nguồn

1. Gạt công tắc adapter về O / OFF.
2. Cắm adapter vào jack DC, rồi cắm adapter vào ổ điện.
3. Gạt công tắc sang I / ON. Khi này adapter đã cấp 5 V cho servo/WS2812B,
   nhưng ESP32 chưa được cấp USB nên chưa chạy chương trình.
4. Đo giữa rail +5V tải và rail GND tải: phải gần +5 V.
5. Cắm USB-C vào ESP32. USB-C chỉ cấp ESP32; không được nối USB 5 V sang rail
   +5V tải.
6. Thử WS2812B trước: 10 pixel phải đổi màu đúng, không chớp và ESP32 không
   reset.
7. Thử servo khi cánh tay còn tách khỏi cửa: gửi UNLOCK (80°), rồi LOCK (170°).
   Chạy ít nhất 20 chu kỳ không tải; dừng ngay nếu servo kẹt/rung/nóng hoặc
   ESP32 reset.
8. Chỉ khi các thử nghiệm không tải PASS mới gắn cánh tay servo lại vào cửa và
   thử cơ cấu.

Khi tắt hệ thống: rút USB-C khỏi ESP32 trước, sau đó gạt công tắc adapter về
O / OFF hoặc rút adapter. Nếu chỉ cấp USB cho ESP32 nhưng adapter tải đang tắt,
tháo dây GPIO25 khỏi điện trở WS2812B để tránh cấp điện ngược vào strip qua dây
data.
