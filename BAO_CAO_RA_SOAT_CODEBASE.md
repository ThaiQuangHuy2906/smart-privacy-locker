# Báo cáo rà soát toàn bộ codebase — Smart Privacy Locker

> Ngày rà soát: 2026-08-17
>
> Nhánh được quan sát: `develop`
>
> Commit nền tại thời điểm bắt đầu: `1604481`
> Kết luận: **đủ điều kiện software handoff; chưa đủ điều kiện
> `FINAL_RELEASE_READY` hoặc tuyên bố E2E phần cứng hoàn tất**.

## 1. Kết luận điều hành

Không phát hiện lỗi P0 đã được chứng minh trong phạm vi source và môi trường
kiểm thử hiện có. Các nền tảng chính — firmware contract, safe boot, command
correlation, Node-RED auth/ownership, Supabase RLS, persistence, Telegram
linking, Gemini grounding và email idempotency — có thiết kế tốt và test tự
động mạnh.

Tuy nhiên, sản phẩm còn ba nhóm chặn nghiệm thu P1:

1. chưa hoàn tất phép đo và acceptance nguồn ngoài/tải đồng thời;
2. cơ cấu hiện không có chốt, SG90 trực tiếp đóng/mở cửa và không có feedback,
   nên nhãn “LOCKED/khóa” và ACK success có thể bị hiểu mạnh hơn khả năng thật;
3. chưa chạy trọn bộ E2E cuối trên đúng phần cứng/deployment release, gồm còi
   GPIO26, 20 chu kỳ, fault recovery và các gate live cần thiết.

Lượt khắc phục sau audit đã sửa các lỗi phần mềm được tái hiện: heartbeat MQTT,
future-skew, ACK anomaly diagnostics, kiểm tra lỗi publish, sáu lỗi UI state/
đồng bộ, auth-mode, secure MQTT example, thuật ngữ đóng/mở cửa và Wokwi help.
Regression test, clean build và Chrome/CDP browser matrix đều đã chạy lại.

Các thay đổi này xử lý nguyên nhân phần mềm khiến thiết bị bị xem là stale sau
hơn 30 giây: ESP32 nay gửi heartbeat không retained kèm refresh full-state mỗi
10 giây; backend chỉ dùng heartbeat đúng generation để làm mới liveness mà
không tạo lịch sử online giả. Chúng không thể chứng minh hoặc sửa bằng code cho
sụt áp, brownout, dây lỏng, servo kẹt hay thiếu feedback cơ khí.

## 2. Quy ước mức độ

| Mức | Nghĩa trong báo cáo này |
|---|---|
| P0 | Rò dữ liệu/quyền nghiêm trọng, nguy cơ an toàn tức thời hoặc hệ thống cốt lõi không thể dùng; phải dừng release ngay. |
| P1 | Chặn demo/nghiệm thu/release vì an toàn, claim sản phẩm hoặc thiếu bằng chứng bắt buộc. Có thể là blocker kiểm chứng chứ không nhất thiết là bug source. |
| P2 | Lỗi chức năng/đồng bộ/UX/độ tin cậy quan trọng, cần sửa trước bản cuối nhưng có workaround hoặc không phá toàn hệ thống. |
| P3 | Lỗi nhỏ, nợ tài liệu/mô phỏng/hardening hoặc polish. |

Trạng thái test:

- `PASS`: đã chạy và đạt trong đúng phạm vi nêu;
- `FAIL`: đã chạy và không đạt;
- `UNAVAILABLE`: không có phần cứng/dịch vụ/source đầu vào để chạy;
- `NOT RUN`: có thể có lịch sử, nhưng audit hiện tại không chạy lại;
- `PARTIAL / USER-REPORTED`: có quan sát thật nhưng thiếu thủ tục/bằng chứng đầy
  đủ để nâng thành PASS cuối.

## 3. Phạm vi và nguồn sự thật

Đã rà soát:

- yêu cầu chính thức trong hai PDF quy định/báo cáo, đề xuất nhóm 12 và kế hoạch
  dự án;
- firmware modular PlatformIO và Arduino IDE mirror;
- Wokwi standalone;
- Node-RED runtime/modules/flows, Dashboard HTML/CSS/JS;
- Supabase migrations, RLS, pgTAP/live-gate scripts;
- simulator/broker test tools;
- BOM, pin map, power budget, Fusion/VIVA package;
- toàn bộ Markdown chuẩn hiện hành và các snapshot evidence.

Nguồn được ưu tiên theo thứ tự: source/config thực tế → test/build thực chạy →
contract/migration → tài liệu chuẩn → bằng chứng lịch sử → lời báo cáo của người
lắp ráp. Không dùng simulator làm bằng chứng vật lý.

### 3.1. Tài liệu lịch sử được giữ nguyên

Các file dưới `tests/evidence/` là snapshot tại ngày chạy. Ba file Markdown
trong `THUYETMINH/03_SMART_PRIVACY_LOCKER_VIVA_FINAL/` thuộc gói có manifest.
Chúng không được viết lại để “cập nhật trạng thái”, vì làm vậy sẽ sai lệch lịch
sử hoặc phá integrity/hash. Trạng thái mới được ghi ở tài liệu hiện hành và
[HUONG_DAN_TEST_END_TO_END.md](HUONG_DAN_TEST_END_TO_END.md).

## 4. Đối chiếu yêu cầu môn học

Đã xác nhận từ PDF chính thức:

- nhóm 2–3 sinh viên; nhóm hiện có 3 thành viên;
- phải thể hiện cả hai họ luồng
  `input → ESP → MQTT → backend → frontend` và
  `frontend → backend → MQTT → ESP → output`;
- các thiết bị được dùng trong các luồng/hạng mục chấm phải phân biệt theo yêu
  cầu đề;
- báo cáo cần trang bìa, bảng chức năng/chủ sở hữu/thay đổi, ảnh sản phẩm có
  chú thích, ảnh web có tên chức năng và bảng tự đánh giá;
- số chức năng thêm/xóa/cập nhật so với đề xuất không vượt quá một;
- tên file nộp:
  `12_24127177_24127205_24127249_FINAL.PDF`;
- vấn đáp dùng hệ số hiểu `K`; nội dung/evidence phải trung thực.

Mapping người phụ trách khớp đề xuất:

| Thành viên | Phạm vi đăng ký |
|---|---|
| Thái Quang Huy — 24127177 | CB2, YC1, YC3, YC12 |
| Nguyễn Văn Minh — 24127205 | CB1, YC6, YC8, YC9 |
| Mai Phương Thùy — 24127249 | CB3, YC4, YC5, YC7 |

Rủi ro yêu cầu lớn nhất là CB2 vẫn được mô tả “khóa/mở khóa” trong code/UI/báo
cáo, trong khi as-built đã bỏ chốt. Trước khi nộp, nhóm phải mô tả đúng là tay
servo đóng/mở cửa, hoặc bổ sung một cơ cấu khóa thật và re-test; không được để
ảnh/caption tuyên bố có chốt không tồn tại.

## 5. Kết quả kiểm thử đã chạy trong audit

### 5.1. Firmware và Arduino

| Kiểm tra | Kết quả | Ghi chú |
|---|---|---|
| `pio test -e native` | PASS — 20/20 | Contract, cold boot, door, alarm, future-skew và wrap-safe heartbeat/retry. |
| Clean `pio run -e esp32dev` | PASS | RAM 16.2%, flash 84.3%. |
| Build trực tiếp ở đường dẫn Unicode Windows | FAIL do môi trường/toolchain path | Xtensa mangling đường dẫn tiếng Việt; không phải compiler error source. |
| Build qua ánh xạ ổ ASCII tạm `R:` | PASS | Không copy source, không commit output; workaround được ghi trong firmware README. |
| Arduino production mirror | PASS | 30 tệp đồng bộ byte-for-byte. |
| Arduino profile compile | PASS | 1,108,993 byte flash (Arduino CLI làm tròn 84%), 52,976 byte RAM (16%). |
| Wokwi clean build | PASS | RAM 6.8%, flash 24.5%; chỉ chứng minh mô phỏng đơn giản. |

### 5.2. Node-RED/backend/simulator

| Lệnh | Kết quả |
|---|---|
| `npm test` | PASS — 156/156 |
| `npm run test:simulator` | PASS — 10 assertion / 15 scenario |
| `npm run test:broker` | PASS — 17 assertion, broker cục bộ có xác thực |
| `npm run audit` | PASS — 0 finding |
| `npm audit --omit=dev --audit-level=low` | PASS — 0 vulnerability production |
| Syntax JavaScript first-party | PASS — 39 file |
| Python AST Fusion/CAD scripts | PASS — 6 file |

Các kết quả trên là bằng chứng phần mềm. Broker cục bộ không thay broker deploy;
simulator không thay ESP32, điện áp, chuyển động hoặc âm thanh thật.

### 5.3. Browser/UI

Đã dùng Chrome headless/CDP với API mock an toàn, ở desktop 1280 × 720 và
mobile 320 × 800; đã kiểm focus, reduced motion, trạng thái no-data/fresh/stale,
pending và lỗi startup. `playwright-cli 0.1.18` trên Node `v24.14.1` không khả
dụng do cùng assertion upstream `UV_HANDLE_CLOSING` ở wrapper và lệnh trực
tiếp; không tự ý đổi/pin runtime để che giới hạn môi trường này.

PASS:

- `lang="vi"`, một H1 và cấu trúc H2 rõ;
- không document horizontal overflow;
- 27 target tương tác khả kiến, không target nào nhỏ hơn 24 × 24 CSS px theo
  effective target check;
- focus outline 3 px;
- 10 ARIA live/status regions hiện diện;
- reduced-motion làm animation gần như tức thời;
- bố cục desktop/mobile rõ, responsive, không tràn ngang;
- public-config 503 giữ auth disabled, tự retry sau 5 giây và phục hồi;
- `COMMAND_SUCCEEDED`/Telegram `failed` được dịch đúng;
- spinner pending 17 px có màu độc lập và khóa cả hai nút cùng domain;
- stale lock/alarm/LED hiển thị unknown và khóa mọi actuator control;
- login/register có đúng một submit, full-name chỉ ở registration và password
  autocomplete đúng mode.

### 5.4. Supabase/live services

Audit hiện tại **không chạy lại** clean migration/pgTAP/FlowFuse/Telegram/
Gemini/SMTP trên dịch vụ thật vì đó là external state, cần scope/credential test
và có side effect. Các snapshot đã làm sạch trước đây ghi nhận các gate live
tương ứng đã PASS ở phiên bản/ngày của chúng; chúng không tự chứng minh
deployment hiện tại vẫn giống hệt.

### 5.5. CAD/VIVA package

| Kiểm tra | Kết quả |
|---|---|
| Verify package bình thường | UNAVAILABLE/FAIL precondition | Thiếu thư mục source build-output dùng để so sánh nguồn. |
| `verify --no-source-compare` | PASS | Gói tự chứa 23 file gồm manifest, 22 record, 9 image và strict allowlist. |

Kết luận đúng: package hiện tự nhất quán theo manifest; audit không chứng minh
nó còn byte-for-byte khớp một source build-output đã không còn trong workspace.

## 6. Phát hiện và trạng thái khắc phục

### 6.1. P0

Không có P0 đã được tái hiện hoặc chứng minh. Điều này không phải cam kết hệ
thống không thể có lỗi; live production và phần cứng E2E chưa được audit đầy đủ.

### 6.2. P1 — chặn final release

| ID | Phát hiện | Bằng chứng/tác động | Điều kiện đóng |
|---|---|---|---|
| P1-01 | Nguồn ngoài và tải đồng thời chưa được acceptance | Jack/phân phối/switch/bảo vệ chưa có bảng đo; servo + 10 LED + buzzer + radio có thể sụt áp, reset, nóng hoặc back-feed. | Điền exact-part budget, đo idle/peak/tải đầy, 20 chu kỳ/soak và đạt mọi tiêu chí `hardware/power-budget.md`. |
| P1-02 | “Khóa” cơ khí không khớp as-built và ACK servo không có feedback | Đã bỏ chốt; tay servo trực tiếp đóng/mở. SG90 open-loop, firmware chờ 550 ms rồi đặt state logic; jam/disconnected horn vẫn có thể được báo success. | Đổi semantics/caption/UI thành đóng/mở + dùng MC-38 xác nhận, hoặc bổ sung chốt/limit feedback và re-test. Không tuyên bố chống cạy trước khi có bằng chứng. |
| P1-03 | Chưa có final E2E release evidence | Còi GPIO26 active, exact rail, hai chiều đề bài, live lifecycle, reconnect và full-load chưa chạy trọn trên cùng version/wiring. | Chạy toàn bộ gate bắt buộc trong `HUONG_DAN_TEST_END_TO_END.md`, lưu correlation/video/đo và cập nhật test plan. |

P1-03 là blocker kiểm chứng, không phải khẳng định source sai. Người dùng đã
quan sát một số linh kiện riêng lẻ hoạt động; bằng chứng đó được ghi `PARTIAL /
USER-REPORTED`, không bị bỏ qua và cũng không bị nâng quá mức.

### 6.3. P2 — lỗi/độ tin cậy quan trọng

| ID | Thành phần | Trạng thái khắc phục | Bằng chứng/giới hạn còn lại |
|---|---|---|---|
| P2-01 | Dashboard state | **FIXED** — no-data/stale lock, alarm và LED dùng `UNKNOWN`; stale khóa control. | DOM regression và Chrome fresh→stale PASS. |
| P2-02 | Dashboard Telegram | **FIXED** — map đủ delivery status có fallback an toàn. | Regression và Chrome `failed` → “gửi thất bại” PASS. |
| P2-03 | Dashboard control | **FIXED** — spinner có màu độc lập, giữ `aria-busy` và khóa cùng domain. | Chrome đo spinner 17 px, opacity 1. |
| P2-04 | Dashboard startup | **FIXED** — retry public config mỗi 5 giây; auth fail-closed đến khi sẵn sàng. | Regression và Chrome 503→recovery PASS. |
| P2-05 | Dashboard label | **FIXED** — exhaustive command map và fallback không lộ raw enum. | Regression và Chrome localization PASS. |
| P2-06 | Firmware validator | **FIXED** — khi đồng hồ đã sync, command tương lai quá 30 giây bị `INVALID_ISSUED_AT`. | Native future-skew regression PASS; khi chưa sync không thể áp time bound đáng tin cậy. |
| P2-07 | Node-RED observability | **FIXED** — unknown/late/mismatch ACK trả `accepted:false` và diagnostic bounded. | ACK correlation regressions PASS; không chứa raw payload/secret. |
| P2-08 | MQTT QoS0 outcome | **FIXED phần quan sát** — firmware log mọi ACK/state/door publish failure, giữ timeout/GET_STATE và không retry actuator. | QoS0 vẫn có outcome mơ hồ theo thiết kế; không thể biến ACK mất thành exactly-once. |
| P2-09 | MQTT liveness | **FIXED** — heartbeat không retained + full-state refresh mỗi 10 giây; generation-safe backend ingestion. | Regression 30 giây, simulator và broker PASS. Brownout/mất nguồn vẫn phải đo vật lý. |
| P2-10 | Dashboard refresh | **FIXED** — refresh single-flight; access token đã hết hạn không còn được gửi vào protected polling khi provider tạm lỗi. | Hai regression đỏ-trước/sau-đó-xanh xác nhận refresh token được giữ, control fail-closed và chỉ có một refresh request mỗi session generation. |

### 6.4. P3 — polish/hardening/tài liệu

| ID | Thành phần | Trạng thái khắc phục |
|---|---|---|
| P3-01 | Auth form | **FIXED** — một submit theo mode, full-name chỉ ở registration, `new-password`/`current-password` đúng ngữ cảnh. |
| P3-02 | Wokwi | **FIXED** — help dùng 170°/80°, safe boot không tự quay servo; README vẫn nêu rõ delta điện/mô phỏng. |
| P3-03 | Remote MQTT default | **FIXED** — example mặc định TLS/8883; non-TLS chỉ được phép là local isolated override. |
| P3-04 | Status semantics | **FIXED ở UI/tài liệu** — dùng “đóng/mở cửa” và “vị trí tay servo”; MQTT v1 enums giữ nguyên để tương thích. Feedback cơ khí vẫn là P1-02. |

## 7. Rà soát theo thành phần

### 7.1. Firmware

Điểm mạnh:

- safe cold boot: lock/door UNKNOWN, alarm inactive, LED off;
- servo không attach/write lúc boot;
- buzzer được đặt inactive trước output operation;
- cooperative loop, controller theo deadline, không block callback;
- schema/topic/locker/action/requester/timestamp validation;
- duplicate cache có giới hạn và replay ACK không actuate lại;
- retained full state/availability, LWT, reconnect backoff;
- MC-38 stable debounce, boot UNKNOWN, transition-only telemetry;
- DHT/OLED local path đúng phạm vi;
- local config ignored và Arduino mirror có workflow kiểm tra.

Giới hạn còn lại: open-loop actuation, QoS0 publish ambiguity, đồng hồ chưa sync
không thể kiểm time bound, exact hardware polarity/current và full-load chưa đóng.

### 7.2. Node-RED và đồng bộ

Điểm mạnh:

- Bearer-only identity, owner gate trước command;
- server tạo UUID/time/requester;
- pending theo domain, timeout 5 s, không retry actuator;
- một `GET_STATE` reconciliation, restart/disconnect cancellation;
- correlation ID/locker/action/state chặt;
- bounded operational buffers và deterministic simulator/broker tests;
- normalized event interface tách MQTT v1;
- Telegram không chặn alarm path.

Finding chính: ACK anomaly observability; công cụ/lifecycle live cuối chưa chạy
lại; MQTT QoS0 vẫn tạo outcome mơ hồ theo thiết kế.

### 7.3. Supabase/data

Điểm mạnh:

- migrations có RLS, least privilege và fixed search paths;
- atomic claim/owner immutability;
- event idempotency, deterministic availability ID;
- history pagination/order/dedupe/ceiling;
- chart timezone/zero bucket;
- daily delivery reservation, bounded retry và `delivery_unknown` an toàn.

Không phát hiện source issue P0 từ review tĩnh/test. Tuy nhiên clean live rebuild,
pgTAP và cross-owner gate không được rerun trong audit này; phải coi là
`NOT RUN` hiện tại, không ghi PASS mới dựa trên snapshot cũ.

### 7.4. Telegram/Gemini/email

Điểm mạnh:

- Telegram one-time hashed token, TTL 10 phút, private-chat-only, secret webhook,
  no global Chat ID, sanitized browser response;
- Gemini intent/canonical facts/owner scope, backend tính số liệu;
- SMTP dedupe và phân biệt definitive failure/ambiguous outcome.

Rủi ro còn lại: lifecycle live cuối trên deployment thật; provider credential/
scope phải ở môi trường test và không xuất hiện trong evidence.

### 7.5. UI/UX/accessibility

Visual/responsive/accessibility baseline và các sửa state truthfulness đã PASS
ở regression/Chrome local. Ma trận đã kiểm:

- config 503→recovery;
- no-data/fresh/stale/offline→fresh;
- mọi command/delivery enum;
- pending spinner;
- mobile/keyboard/reduced motion sau sửa.

Tiêu chí tham chiếu:
[WCAG 2.2](https://www.w3.org/TR/WCAG22/),
[Reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html),
[Status Messages](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html),
[Keyboard](https://www.w3.org/WAI/WCAG22/Understanding/keyboard.html),
[Focus Visible](https://www.w3.org/WAI/WCAG22/Understanding/focus-visible) và
[Target Size](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html).

### 7.6. Phần cứng as-built

Mapping đã ghi:

| Thiết bị | Wiring hiện tại | Trạng thái evidence |
|---|---|---|
| OLED | 3.3 V/GND, SDA21, SCL22 | user-reported hiển thị đúng |
| DHT22 | 3.3 V/GND, OUT4 | user-reported giá trị đúng trên OLED |
| MC-38 | GPIO27 ↔ contact ↔ GND | user-reported tạo Telegram |
| WS2812B | 5 V/GND, DI25 qua 470 Ω, tụ 470 µF, local 10 pixel | user-reported sáng đúng count |
| SG90 | signal GPIO18, 5 V load, `170°/80°` | user-reported chạy; không còn chốt |
| Buzzer | VCC 3.3 V, GND, I/O26 qua 4.7 kΩ, active-low | wiring có; active/ACK/full-load chưa đủ |
| Jack/power | 5.5 × 2.5 mm | polarity/distribution/switch/full-load chưa acceptance |

Adapter không cần nút I/O tích hợp. Khuyến nghị công tắc DC rời đúng định mức ở
dây dương; jack không phải bộ chia. Phải dùng phân phối nguồn, common GND, đo
cực/tải và tránh đưa adapter 5 V vào `3V3` hoặc topology USB có back-feed.

## 8. Thứ tự xử lý đề xuất

### Đợt 1 — an toàn và sự thật sản phẩm

1. hoàn tất BOM exact part/power budget;
2. đo jack/polarity/rail, lắp switch/distribution/protection;
3. chốt thuật ngữ direct-arm hoặc bổ sung chốt/feedback;
4. test còi GPIO26 và từng linh kiện bằng firmware release;
5. full-load 20 cycle/soak.

### Đợt 2 — source P2 đã hoàn tất trong workspace

1. heartbeat/state refresh và generation-safe liveness;
2. Dashboard state/failure labels/spinner/config retry/auth-mode;
3. future-skew validation;
4. ACK anomaly diagnostics;
5. publish-failure logging, không retry actuator.

### Đợt 3 — final E2E và báo cáo

1. chạy hai luồng đề bài + auth/owner + providers;
2. chạy reconnect/restart/stale/failure;
3. lưu evidence có timestamp/correlation/version;
4. cập nhật test plan và report claims;
5. render PDF, kiểm caption, secret, tên file và luyện vấn đáp.

## 9. Quyết định release

| Mốc | Quyết định hiện tại | Lý do |
|---|---|---|
| Static/source review | PASS | Không có P0 đã chứng minh; P2/P3 phần mềm đã sửa và rerun. |
| Automated software handoff | PASS | Firmware/Node/build/audit đạt trong phạm vi. |
| Individual hardware smoke | PARTIAL / USER-REPORTED | Nhiều linh kiện đã chạy, thiếu biên bản/tải/trace đầy đủ. |
| External power/full-load | NOT RUN/UNAVAILABLE | Chưa có measurement/acceptance. |
| Live services current audit | NOT RUN | Chỉ có evidence lịch sử, không rerun external state. |
| Full physical E2E | NOT RUN | Chưa hoàn tất guide mới. |
| Final report/demo ready | NO-GO | P1-01, P1-02, P1-03 còn mở. |

## 10. Tài liệu hành động

- Lắp mạch chuẩn: [HUONG_DAN_LAP_MACH_THEO_THU_TU.md](HUONG_DAN_LAP_MACH_THEO_THU_TU.md)
- Chạy hệ thống: [HUONG_DAN_CHAY_HE_THONG.md](HUONG_DAN_CHAY_HE_THONG.md)
- Test từ đầu đến cuối: [HUONG_DAN_TEST_END_TO_END.md](HUONG_DAN_TEST_END_TO_END.md)
- Ôn vấn đáp: [ON_TAP_VAN_DAP_CHI_TIET.md](ON_TAP_VAN_DAP_CHI_TIET.md)
- Test registry: [tests/test-plan.md](tests/test-plan.md)
- Requirement trace: [docs/requirements.md](docs/requirements.md)
- Nội dung báo cáo: [NOI_DUNG_BAO_CAO_CUOI_KY.md](NOI_DUNG_BAO_CAO_CUOI_KY.md)
- Pin/power: [hardware/pin-map.md](hardware/pin-map.md),
  [hardware/power-budget.md](hardware/power-budget.md)

Sau khi các sửa source và gate E2E hoàn tất, tạo một record audit mới hoặc một
phần addendum có ngày/commit. Không sửa ngược kết quả 2026-08-17 thành PASS.
