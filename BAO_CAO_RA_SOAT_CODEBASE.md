# Báo cáo rà soát toàn bộ codebase — Smart Privacy Locker

> Cập nhật: 2026-08-18
> Phạm vi: firmware ESP32/Arduino, Node-RED/FlowFuse, Dashboard, simulator,
> Wokwi, tài liệu và bằng chứng trong workspace hiện tại.
> Kết luận: **phần mềm đủ điều kiện handoff/demo có giám sát; chưa được xem là
> đã nghiệm thu phần cứng E2E**.

## 1. Kết luận hiện hành

Lỗi nghiệp vụ được báo ban đầu đã được sửa ở đúng hai lớp:

1. Mỗi ACK `UNLOCK` khi cửa đang `CLOSED` chỉ cấp đúng một lượt mở trong 30
   giây. Lần `CLOSED → OPEN` đầu consume quyền; lần `OPEN → CLOSED` kế tiếp tự
   khóa chốt tại ESP32. Nếu người dùng không mở cửa, chốt tự khóa đúng lúc lượt
   30 giây hết hạn. Mở/ép cửa lần nữa khi chưa có ACK `UNLOCK` mới vẫn bật còi
   cục bộ, không phụ thuộc Wi-Fi, MQTT, Node-RED hoặc Telegram.
2. Mỗi OPEN telemetry mang quyết định `authorized` của firmware. Node-RED dùng
   quyết định đó để tạo `DOOR_OPENED`/`UNAUTHORIZED_OPEN`, yêu cầu `ALARM_ON`,
   lưu sự kiện và gửi Telegram khi dịch vụ tương ứng khả dụng; restart backend
   không được tự suy lại ngược với firmware. Retained OPEN chỉ được hòa giải là
   trái phép khi cùng snapshot xác nhận alarm cục bộ đã `ACTIVE`.

Toàn bộ lỗi phần mềm tìm thấy trong đợt rà soát đã được sửa và có kiểm tra hồi
quy. Không có P0 đã được tái hiện trong source/test hiện tại. Những giới hạn còn
lại đều được nêu rõ ở Mục 7; quan trọng nhất là chốt servo open-loop không có
cảm biến góc và các gate phần cứng/live service chưa được chạy lại trọn bộ trên
cùng release candidate.

Không thể diễn giải từ kết quả này rằng sản phẩm “chính xác 100%” trong mọi môi
trường vật lý. Test phần mềm không đo được sụt áp, lực chốt, kẹt servo, dây lỏng,
âm lượng còi hoặc trạng thái của dịch vụ bên ngoài.

## 2. Nguồn sự thật vật lý và thuật ngữ

| Thuộc tính | Trạng thái đúng hiện tại |
|---|---|
| Cơ cấu | Tay SG90 là **chốt quay**; người dùng tự đóng/mở cánh cửa. |
| Khóa chốt | `LOCK = 80°` |
| Mở chốt | `UNLOCK = 170°` |
| Thời gian servo settle | `2.000 ms` |
| Phản hồi góc chốt | Không có; ACK chỉ xác nhận chu trình điều khiển logic đã hoàn tất. |
| Cảm biến MC-38 | Chỉ xác nhận cửa `OPEN/CLOSED/UNKNOWN`, không xác nhận góc chốt. |
| Điều kiện `LOCK`/`UNLOCK` | Cửa phải ổn định ở `CLOSED`; nếu mở trong lúc servo chạy thì lệnh bị hủy, state chốt về `UNKNOWN` và trả mã cửa-chưa-đóng tương ứng. |
| Lệnh đã đúng state | Action thông thường trả no-op `ALREADY_IN_STATE`. Riêng `UNLOCK` khi cửa đóng được gửi lại để cấp một lượt mới mà không quay servo; khi cửa mở trả `DOOR_NOT_CLOSED_FOR_ACCESS`. |

Dashboard dùng “Khóa ngay/Mở chốt”; không nói servo tự đóng/mở
cánh cửa. Nút còi dùng “Bật còi/Tắt còi”, không dùng cụm “Kiểm tra còi” gây
hiểu nhầm đây là thao tác vô hại.

## 3. Các lỗi đã sửa

| ID | Thành phần | Lỗi/rủi ro trước sửa | Trạng thái hiện tại |
|---|---|---|---|
| F-01 | Firmware cảnh báo | Sau một lần `UNLOCK`, lần `CLOSED → OPEN` thứ hai từng bị coi nhầm là hợp lệ nên còi không bật. | **FIXED** — mỗi ACK `UNLOCK` khi cửa đóng chỉ cấp đúng một lượt; cạnh đầu consume quyền. Firmware hiện tự khóa khi cửa đóng lại, nhưng nếu cửa vẫn bị ép/mở lần nữa mà chưa có quyền mới thì vẫn bật còi cục bộ dù mất mạng. |
| F-02 | Firmware sự kiện cửa | Mất MQTT có thể làm mất cạnh cửa và khó dedupe khi gửi lại. | **FIXED** — mỗi cạnh có UUIDv4 `event_id`; RAM outbox có giới hạn phát lại theo thứ tự sau reconnect. |
| F-03 | Backend sự kiện cửa | Mất cạnh telemetry hoặc restart backend có thể làm lệch quyết định authorized giữa ESP32 và Node-RED. | **FIXED** — firmware gửi `authorized` trong từng cạnh OPEN; backend ưu tiên quyết định đó, vẫn nhận payload legacy, dedupe theo `event_id`, và chỉ hòa giải OPEN từ retained state khi alarm cục bộ đã `ACTIVE`. |
| F-04 | Interlock chốt | Có thể nhận `LOCK`/`UNLOCK` khi cửa chưa đóng hoặc cửa mở trong lúc servo đang chạy. | **FIXED** — dispatcher và firmware cùng chặn; firmware kiểm cả trạng thái debounce và cạnh raw fail-safe, hủy mọi hành trình chốt đang chạy, đặt state về `UNKNOWN`, thu hồi grant và ACK lỗi đúng action nếu đó là lệnh. Auto-lock bị hủy chỉ publish state, không dựng ACK giả. |
| F-05 | Servo/no-op | Lệnh trùng state có thể quay servo và tạo độ trễ/hao mòn không cần thiết. | **FIXED** — action thông thường trả `ALREADY_IN_STATE`; riêng `UNLOCK` khi cửa `CLOSED` được gửi lại để cấp một lượt mở mới nhưng không quay servo. Nếu cửa đã mở, backend/firmware trả `DOOR_NOT_CLOSED_FOR_ACCESS`. |
| F-06 | Auth cache | Cache xác thực có thể giữ token thô và dùng kết quả cũ cho mutation. | **FIXED** — khóa cache bằng SHA-256, TTL/size có giới hạn; command/claim/settings và mutation cần xác thực mới. |
| F-07 | Dashboard action gate | Nút chỉ dựa vào trạng thái chung, chưa giải thích rõ auth/owner/MQTT/offline/stale/pending/interlock. | **FIXED** — từng action có gate và lý do riêng; stale/unknown fail-closed. |
| F-08 | Dashboard auth/privacy | Form đăng nhập còn chiếm chỗ sau login và có thuật ngữ kỹ thuật “Bearer”. | **FIXED** — ẩn form sau xác thực, chuyển focus hợp lý và dùng lời giải thích thân thiện. |
| F-09 | Dashboard concurrency | Poll chồng lấp, chat/claim/data/settings có thể gửi song song hoặc render response cũ. | **FIXED** — polling serialized/coalesced; thao tác dùng single-flight/generation guard và prerequisite gate. |
| F-10 | Dashboard timing | Poll dày khi tab ẩn và nhãn “mỗi 2 giây” không khớp hành vi mong muốn. | **FIXED** — 5 giây khi đang xem, 15 giây khi tab ẩn; Telegram dùng nhịp tăng dần 2/5/10 giây. |
| F-11 | Dashboard dữ liệu | Biểu đồ khó đọc chính xác và history/latest alert có nguy cơ chỉ nhìn một trang dữ liệu. | **FIXED** — biểu đồ hiện số `opens/alerts` kèm bảng tương đương; backend phân trang/dedupe toàn bộ khoảng cần thiết. |
| F-12 | Dashboard accessibility | Exact width 320 px có thể tràn ngang do `min-width`; live region có thể lặp thông báo; target/focus cần kiểm tra. | **FIXED** — không tràn ở layout viewport 305 px có scrollbar cổ điển; text update chống lặp; focus/keyboard/target/reduced-motion được QA. |
| F-13 | Persistence | Ghi Supabase thất bại có thể chỉ tạo promise failure hoặc báo ready không đúng. | **FIXED** — bounded RAM outbox, exponential retry, dead-letter và health rõ; outbox đầy tạo dead-letter thay vì false-ready. |
| F-14 | Chat/API | Câu hỏi không hỗ trợ có thể bị ánh xạ thành lỗi server chung. | **FIXED** — trả `422` và thông báo phù hợp. |
| F-15 | OLED/loop | Refresh màn hình có thể vẽ lại không cần thiết hoặc cạnh tranh với tác vụ ưu tiên cao. | **FIXED** — ưu tiên trạng thái quan trọng và bỏ redraw khi nội dung không đổi. |
| F-16 | Tài liệu/evidence | Góc servo, cơ cấu chốt, số test và UX cũ không còn đồng nhất; guide lắp mạch đã hết vòng đời. | **FIXED** — Markdown hiện hành được đồng bộ; ba guide lắp đã xóa; `AnhVatLi/README.md` phân loại ảnh hiện tại/lịch sử và cảnh báo PII. |
| F-17 | Servo/in-flight command | Hủy hành trình giữa chừng từng giữ state logic cũ; lệnh khác trong lúc servo bận có thể đi vào nhánh no-op và ACK thành công sai. | **FIXED** — cửa mở hủy cả `LOCK` và `UNLOCK`, đặt chốt về `UNKNOWN`, thu hồi quyền mở; `UNLOCK` trả `DOOR_NOT_CLOSED_FOR_ACCESS`, `LOCK` trả `DOOR_NOT_CLOSED`; lệnh mới khi actuator bận trả `ACTUATION_FAILED` trước khi xét same-state. |
| F-18 | MQTT reconnect ordering | Một state retained/heartbeat mới có thể vượt trước cạnh cửa còn nằm trong firmware outbox sau reconnect. | **FIXED** — bootstrap, heartbeat và state pending đều chờ FIFO cạnh cửa rỗng; ACK vẫn được phát sớm nhưng state đi kèm được hoãn có kiểm soát. |
| F-19 | Simulator parity | Simulator từng ACK thành công khi gửi lại `UNLOCK` lúc cửa đang mở và chưa mô phỏng auto-lock, khác firmware/backend. | **FIXED** — trả `DOOR_NOT_CLOSED_FOR_ACCESS`; matrix kiểm từ chối khi OPEN, auto-lock khi đóng, auto-lock đúng biên 30 giây và xác nhận hai đường tự động không sinh thêm ACK. |
| F-20 | Persistence UX | Có dead-letter rồi ghi thành công có thể tạo health `{status:error,last_error:null}`, khiến Dashboard hiện lỗi không hành động được. | **FIXED** — health giữ mã lỗi gần nhất từ pending/dead-letter trong toàn bộ thời gian dead-letter còn hiện diện. |
| F-21 | Dashboard pending UX | Spinner từng lệch phải do không neo pseudo-element vào bốn cạnh; cả hai nút cùng domain đều hiện spinner vì client chỉ nhớ domain. | **FIXED** — spinner 17 px dùng `inset: 0; margin: auto`, chỉ action vừa gửi có spinner/`aria-busy`; nút đối nghịch vẫn disabled để chặn lệnh đua. |
| F-22 | Điều kiện `UNLOCK` | Khi cửa `OPEN` nhưng chốt là `LOCKED` hoặc `UNKNOWN`, backend/firmware/simulator từng có thể nhận `UNLOCK`, quay servo hoặc ACK mà không cấp được lượt mở. | **FIXED** — mọi `UNLOCK` đều cần MC-38 `CLOSED`, được chặn trước same-state/servo và trả `DOOR_NOT_CLOSED_FOR_ACCESS`; kiểm thử phủ `LOCKED`, `UNLOCKED`, `UNKNOWN`. |
| F-23 | Tự khóa sau khi sử dụng | Đóng cửa chỉ từng đổi MC-38 về `CLOSED`, để servo ở `UNLOCKED` và khiến UX trái kỳ vọng của một chốt tự động. | **FIXED** — chỉ cạnh ổn định đã quan sát `CLOSED → OPEN` mới arm; cạnh `OPEN → CLOSED` tiếp theo tự chạy `LOCK=80°`. Lượt mở không dùng tự khóa đúng biên 30 giây. Boot không xoay servo; auto-lock cần cả stable/raw CLOSED, không phụ thuộc mạng, không phát ACK giả và bị hủy về `UNKNOWN` nếu cửa mở trong lúc servo chạy. |

## 4. Rà soát logic nghiệp vụ cuối

### 4.1. Ma trận cửa–chốt–còi

| Điều kiện tại chuyển trạng thái cửa | Kết quả |
|---|---|
| `CLOSED → OPEN`, có quyền một lần chưa dùng, chốt `UNLOCKED`, chưa đủ 30 giây | Firmware phát `authorized=true`, consume quyền ngay tại cạnh này và không tự bật còi. |
| `CLOSED → OPEN`, không có quyền hợp lệ: đã mở một lần, quyền hết hạn/bị `LOCK` thu hồi, reboot, chốt `LOCKED` hoặc `UNKNOWN` | Firmware phát `authorized=false` và bật còi cục bộ ngay; backend tạo đúng một `UNAUTHORIZED_OPEN` cho episode và gửi Telegram theo cấu hình. |
| `OPEN → CLOSED` sau một OPEN ổn định đã quan sát | Cập nhật state/event và chạy auto-lock `80°` ngay sau debounce 50 ms; không cấp lại quyền, không tự tắt còi và không phát ACK giả. |
| Không có OPEN sau ACK `UNLOCK`, đủ 30 giây, cửa vẫn stable/raw `CLOSED` | Thu hồi lượt mở và chạy cùng auto-lock; dùng phép trừ `millis()` an toàn khi tràn số. |
| Mẫu stable đầu tiên sau boot là `CLOSED`, hoặc boot ở `OPEN` rồi đóng | Chỉ khởi tạo trạng thái cửa; không arm auto-lock và không làm servo tự xoay khi khởi động. |

Sau lần mở hợp lệ, người dùng đẩy cánh cửa vào; khi MC-38 xác nhận `CLOSED`,
firmware tự quay chốt về `LOCKED`. Muốn mở hợp lệ lần nữa, người dùng chờ state
`LOCKED` rồi nhấn **Mở chốt**. Nếu cửa bị mở/ép lại khi chưa có quyền mới, còi
vẫn báo. Nút **Khóa ngay** là override thủ công, không phải bước bắt buộc sau
mỗi lần đóng cửa.

### 4.2. Command và ACK

- UI không publish MQTT trực tiếp; mọi lệnh người dùng đi qua auth, ownership,
  trạng thái broker/device và action gate.
- Một actuator domain chỉ có một lệnh pending; lệnh mới xung đột bị từ chối.
- Timeout mặc định `5.000 ms`, lớn hơn servo settle `2.000 ms`; timeout không tự
  retry actuator mà chỉ yêu cầu `GET_STATE` để hòa giải.
- ACK phải khớp `command_id`, locker, action và expected state. ACK lạ, muộn,
  trùng hoặc mismatch được ghi diagnostic nhưng không tạo success giả.
- MQTT dùng QoS 0; hệ thống không tuyên bố exactly-once. UUID/dedupe, timeout và
  reconciliation giảm rủi ro nhưng không loại bỏ outcome mơ hồ khi mất ACK.

### 4.3. Event, persistence và restart

- Firmware dùng RAM outbox tối đa 8 cạnh cửa. Outbox đầy không làm tắt còi hoặc
  đổi sai live state; sự kiện mới không thể xếp hàng được ghi log rõ.
- Node-RED dedupe theo UUID nguồn và sinh UUID dẫn xuất ổn định cho
  `UNAUTHORIZED_OPEN`.
- Persistence retry/dead-letter có giới hạn, không retry vô hạn và có health
  `ready/degraded/error` cùng mã lỗi có thể hành động và số pending/dead-letter.
- Các outbox đang nằm trong RAM nên pending event có thể mất nếu ESP32 hoặc
  Node-RED bị reboot trước khi flush. Đây là giới hạn còn lại, không phải cơ chế
  durable queue.

## 5. Rà soát UI/UX và độ trễ

| Hành vi | Giá trị hiện tại | Đánh giá |
|---|---:|---|
| Poll live state khi đang xem | 5 giây | Hợp lý cho dashboard demo, không tạo tải/request quá dày. |
| Poll khi tab ẩn | 15 giây | Giảm tài nguyên nhưng vẫn cập nhật nền vừa đủ. |
| Public config retry | 5 giây | Fail-closed, có thông báo và tự phục hồi. |
| Request API thông thường | 15 giây | Có timeout rõ; không để UI treo vô hạn. |
| Tải data/history | 30 giây | Cho phép truy vấn nhiều trang nhưng vẫn bounded. |
| Chatbot | 40 giây | Phù hợp độ trễ model; UI single-flight và báo pending. |
| Command pending | 5 giây | Có dư khoảng 3 giây sau servo settle; không tăng tùy tiện để che lỗi mạng. |
| Telegram link poll | bắt đầu 1,5 giây; sau đó 2/5/10 giây | Phản hồi nhanh lúc đầu và giảm tải khi người dùng thao tác lâu. |
| Auth refresh retry khi provider tạm lỗi | 30 giây | Giữ refresh token cục bộ, xóa live data nhạy cảm nếu access token đã hết hạn. |
| MC-38 debounce | 50 ms | Lọc rung contact mà không tạo cảm giác chậm khi mở cửa. |
| Auto-lock sau đóng | 50 ms xác nhận CLOSED + 2.000 ms servo settle | Bắt đầu ngay sau cạnh đóng ổn định; không thêm delay UX tùy ý và không chờ mạng. |
| Lượt mở chưa dùng | 30 giây | Đủ thời gian thao tác demo; hết hạn đúng biên thì tự khóa thay vì để chốt mở vô hạn. |
| MQTT heartbeat/full-state refresh | 10 giây | Giữ liveness trước ngưỡng stale 30 giây. |

UI dùng thông báo pending/success/error theo đúng kết quả backend; không hiển
thị success trước ACK. Nút bị khóa luôn có lý do gần nhóm điều khiển. Exact
mobile width, keyboard tab order, focus visible, effective target size,
reduced-motion, live region, chart/table và auth privacy đã được chạy bằng
Chrome thật qua CDP với API mock cục bộ.

## 6. Bằng chứng kiểm tra hiện tại

| Cổng kiểm tra | Kết quả gần nhất |
|---|---|
| PlatformIO native | **PASS — 28/28** |
| Clean ESP32 build | **PASS** — RAM 53.580 byte (16,4%); flash 1.108.145 byte (84,5%) |
| Arduino mirror | **PASS** — 32 tệp đồng bộ byte-for-byte |
| Arduino isolated compile | **PASS** — flash 1.112.269 byte; RAM 53.608 byte |
| Arduino IDE-equivalent compile | **NOT RERUN sau auto-lock** — kết quả 1.111.201/53.600 byte là lịch sử trước thay đổi; current source đã được kiểm bằng mirror parity + isolated compile |
| Node test suite | **PASS — 177/177** |
| Device simulator | **PASS — 28 assertion / 22 scenario** |
| Authenticated local broker | **PASS — 18 assertion** |
| Dashboard browser QA | **PASS — 18 check** ở 1280×720 và exact 320×800 |
| Config/secret audit | **PASS — 0 finding** |
| npm production dependency audit | **PASS — 0 vulnerability** |
| Wokwi clean build | **PASS** — RAM 22.440 byte (6,8%); flash 322.729 byte (24,6%) |
| FlowFuse artifact | SHA-256 `c154c9fbd41041667678c04bfc62e0181a87c9601c35d6606d4c801e84af1d37`; 266.041 byte; 81 node; 7 tab; 15 HTTP route; 0 credential object |
| Wokwi ZIP | SHA-256 `e820e846d633fa7497ca3fe33a4e36e1963c690b2e2186f4905f7549b1693ed8` |

`playwright-cli 0.1.18` không dùng được trên Node `v24.14.1` vì wrapper và lệnh
trực tiếp cùng gặp assertion upstream `UV_HANDLE_CLOSING`. Không ghi CLI là
PASS. Browser QA thay thế dùng Chrome cài trên máy và Chrome DevTools Protocol;
mọi route đều là HTTP/mock cục bộ, không gọi Supabase/Telegram/Gemini thật.

Các con số trên là bằng chứng phần mềm/build theo lần chạy gần nhất. Cổng kiểm
tra cuối phải được chạy lại nếu source tương ứng tiếp tục thay đổi.

## 7. Giới hạn/rủi ro còn lại

| ID | Trạng thái | Giới hạn và cách hiểu đúng |
|---|---|---|
| P1-05 | **ACCEPTED FOR DEMO BY USER** | Chưa đo nguồn/tải đồng thời đầy đủ. Người dùng chấp nhận rủi ro cho sản phẩm demo; đây không phải `PASS` điện, không phải measured acceptance và không áp dụng cho sản phẩm thật/không giám sát. |
| R-01 | OPEN | SG90/chốt không có cảm biến góc; ACK không chứng minh chốt đã vào khớp hoặc không bị kẹt. Cần quan sát/video hoặc thêm limit switch/encoder nếu muốn claim mạnh hơn. |
| R-02 | MANUAL HARDWARE GATE | Còi GPIO26, lực chốt, 20 chu kỳ, reconnect/fault và full physical E2E cần chạy trên đúng board/wiring/release candidate. |
| R-03 | DESIGN LIMIT | MQTT QoS 0 vẫn có outcome mơ hồ khi hành động xảy ra nhưng ACK mất; hệ thống chủ động không auto-retry actuator. |
| R-04 | DESIGN LIMIT | Firmware và backend persistence outbox đều ở RAM; reboot trước flush có thể mất pending item. |
| R-05 | NOT RERUN | Supabase/FlowFuse deploy, Telegram, Gemini và SMTP thật chưa được audit lại trong lượt local này để tránh side effect/đụng dữ liệu bên ngoài. |
| R-06 | EVIDENCE HYGIENE | Bảy ảnh Dashboard trong `AnhVatLi/` là giao diện lịch sử, chứa email/Telegram username cá nhân. Giữ bản gốc làm evidence nội bộ; phải redact trên bản sao trước khi công khai. |

Với phạm vi demo đã được người dùng xác nhận, P1-05 không chặn tiếp tục phát
triển. Nó vẫn phải xuất hiện trong báo cáo để không biến một ngoại lệ có chủ ý
thành một phép đo chưa từng được thực hiện.

## 8. Tài liệu và evidence

- Chạy hệ thống: [HUONG_DAN_CHAY_HE_THONG.md](HUONG_DAN_CHAY_HE_THONG.md)
- Test E2E/phần cứng: [HUONG_DAN_TEST_END_TO_END.md](HUONG_DAN_TEST_END_TO_END.md)
- Requirement hiện hành: [docs/requirements.md](docs/requirements.md)
- Kiến trúc: [docs/architecture.md](docs/architecture.md)
- MQTT contract: [docs/mqtt-contract.md](docs/mqtt-contract.md)
- Event contract: [docs/event-contract.md](docs/event-contract.md)
- Test registry: [tests/test-plan.md](tests/test-plan.md)
- Pin map: [hardware/pin-map.md](hardware/pin-map.md)
- Power/risk waiver: [hardware/power-budget.md](hardware/power-budget.md)
- Manifest ảnh vật lý: [AnhVatLi/README.md](AnhVatLi/README.md)
- Ôn vấn đáp: [ON_TAP_VAN_DAP_CHI_TIET.md](ON_TAP_VAN_DAP_CHI_TIET.md)

Ba guide lắp mạch cũ đã được xóa theo yêu cầu vì mạch đã lắp xong:

- `HUONG_DAN_LAP_MACH_THEO_THU_TU.md`;
- `HUONG_DAN_LAP_MACH_THU_TU_demo.md`;
- `HUONG_DAN_BUOC_7_NGUON_5V.md`.

Các snapshot Phase 1/2 dưới `tests/evidence/` tiếp tục được giữ nguyên như bằng
chứng lịch sử và có ghi chú trỏ sang kết quả hiện hành; không sửa ngược số cũ để
làm đẹp kết quả. Evidence Phase 3 hiện hành đã được cập nhật bằng đúng lượt chạy
2026-08-18, còn quan sát phần cứng 2026-08-15 vẫn giữ nguyên ngày và mức chứng cứ.
