# Smart Privacy Locker — Implementation Plan

> Baseline lập kế hoạch: 2026-08-07, repository greenfield, chưa có source code và chưa có implementation evidence.
>
> Trạng thái ban đầu bắt buộc: **Phase 1 — ACTIVE**; **Phase 2 — NOT_STARTED**; **Phase 3 — NOT_STARTED**.
>
> Quy tắc cập nhật: không tick công việc, không ghi `PASS`, không điền commit hash/PR URL và không chuyển trạng thái Phase nếu chưa có evidence thực tế tương ứng.

## 1. Project Overview

Smart Privacy Locker là mô hình tủ bảo mật IoT mini dùng ESP32 để giám sát cửa, điều khiển khóa servo, còi báo động và đèn trong tủ. Người dùng thao tác qua FlowFuse Dashboard; Node-RED là backend bắt buộc đứng giữa Dashboard, MQTT Broker, ESP32, Supabase và các dịch vụ Telegram, Gmail, Gemini. DHT22 và OLED tạo thành luồng hiển thị cục bộ, không mặc định đưa nhiệt độ/độ ẩm lên Dashboard.

Repository hiện là greenfield: Git chưa có commit; tại thời điểm lập kế hoạch chỉ có hai tài liệu PDF nguồn. `PLAN.md` là artifact triển khai duy nhất được tạo trong lần lập kế hoạch này. Không có chức năng nào đã được triển khai hoặc kiểm thử.

### Nguồn sự thật và audit tài liệu

Thứ tự ưu tiên khi triển khai:

1. Bản thuyết minh dự án.
2. Yêu cầu trong prompt tạo kế hoạch này.
3. Master Project Plan.
4. Quyết định kỹ thuật được ghi rõ trong tài liệu này.

Source-document audit là phần duy nhất đã hoàn thành tại baseline:

- Đã đọc toàn bộ 22 trang của `12_24127177_24127205_24127249.pdf`, gồm phạm vi chức năng, thiết kế 3D, vị trí linh kiện, wireframe, sơ đồ truyền nhận dữ liệu, BOM, lịch và phân công gốc.
- Đã đọc toàn bộ 49 trang của `Master Project Plan.pdf`, gồm kiến trúc, MQTT/database đề xuất, firmware/Node-RED decomposition, lịch 5 tuần, acceptance criteria, test plan, risk register, demo và recovery audit.
- Đã kiểm tra trực quan các trang chứa thiết kế 3D, wireframe, sơ đồ hệ thống và ảnh linh kiện; hai PDF là born-digital, không mã hóa, không có JavaScript và không có lỗi cấu trúc do `qpdf` phát hiện.
- Hai PDF là tài liệu chỉ đọc; không được sửa, thay thế hoặc âm thầm di chuyển trong quá trình triển khai.

### Phạm vi cam kết và traceability

Có **12 requirement** phải được triển khai đầy đủ; `Owner chính` không được thay đổi dù hạ tầng dùng chung do thành viên khác xây dựng.

| Requirement | Phạm vi cam kết | Owner chính | Phase triển khai chính | Dependency tích hợp cuối |
|---|---|---|---|---|
| CB1 | MC-38 đọc `OPEN/CLOSED` → ESP32 → MQTT → Node-RED → Dashboard; hỗ trợ `UNKNOWN` | Nguyễn Văn Minh | Phase 2 | YC4 persistence ở Phase 3 |
| CB2 | Dashboard Lock/Unlock → Node-RED xác thực → MQTT → ESP32 → Servo SG90 → ACK/state | Thái Quang Huy | Phase 1, tích hợp shared backend ở Phase 2/3 | Dispatcher/Auth của Phase 2; Dashboard cuối của Phase 3 |
| CB3 | Dashboard Test Alarm/Stop Alarm → Node-RED → MQTT → ESP32 → Active Buzzer → ACK/state | Mai Phương Thùy | Phase 3 | Command contract/foundation từ Phase 1/2 |
| YC1 | DHT22 → ESP32 → OLED SSD1306, chỉ cục bộ | Thái Quang Huy | Phase 1 | Hardware integration cuối Phase 3 |
| YC3 | Dashboard LED On/Off → Node-RED xác thực → MQTT → ESP32 → WS2812B → ACK/state | Thái Quang Huy | Phase 1, tích hợp shared backend ở Phase 2/3 | Dispatcher/Auth của Phase 2; Dashboard cuối của Phase 3 |
| YC4 | Node-RED lưu lịch sử cửa, khóa, buzzer, LED, cảnh báo, source, result, authorized, command_id, timestamp vào Supabase | Mai Phương Thùy | Phase 3 | Event contract do Phase 2 phát cho YC6 |
| YC5 | Biểu đồ số lần mở tủ và số cảnh báo theo 7/30 ngày | Mai Phương Thùy | Phase 3 | YC4, timezone contract |
| YC6 | Phát hiện mở trái phép; `authorized=false`; buzzer; Telegram; cảnh báo Dashboard | Nguyễn Văn Minh | Logic Phase 2; tích hợp đầy đủ Phase 3 | CB3 và YC4 do Thùy triển khai |
| YC7 | Báo cáo email hằng ngày: số lần mở, số cảnh báo, hoạt động gần nhất | Mai Phương Thùy | Phase 3 | YC4 và notification settings |
| YC8 | Chatbot dùng live state + Supabase history làm context cho Gemini; Gemini chỉ diễn đạt | Nguyễn Văn Minh | Routing/grounding Phase 2; history integration Phase 3 | YC4 history query thực ở Phase 3 |
| YC9 | Supabase Auth register/login/logout/session/JWT, ownership, RLS | Nguyễn Văn Minh | Phase 2 | Dashboard cuối Phase 3 |
| YC12 | WiFiManager captive portal đổi Wi-Fi không nạp lại firmware | Thái Quang Huy | Phase 1 | User/deployment guide Phase 3 |

### Phase registry và reviewer chéo

| Phase | Thành viên | MSSV | Owner chính | Reviewer | Trạng thái baseline |
|---|---|---|---|---|---|
| 1 | Thái Quang Huy | 24127177 | CB2, YC1, YC3, YC12 | Nguyễn Văn Minh | **ACTIVE** |
| 2 | Nguyễn Văn Minh | 24127205 | CB1, YC6, YC8, YC9 | Mai Phương Thùy | **NOT_STARTED** |
| 3 | Mai Phương Thùy | 24127249 | CB3, YC4, YC5, YC7 | Thái Quang Huy | **NOT_STARTED** |

### Phase lifecycle và ranh giới quyền hạn

Lifecycle chuẩn, chỉ chuyển theo evidence thật chứ không theo lịch:

`NOT_STARTED → ACTIVE → READY_FOR_REVIEW → COMPLETED`

- `NOT_STARTED`: chưa được phép triển khai Phase.
- `ACTIVE`: Terra được phép triển khai đúng Phase này.
- `READY_FOR_REVIEW`: Terra đã hoàn thành mọi `MUST` implementation của Phase, chạy các automated tests cần thiết, có evidence cho mọi MANUAL `HARD-GATE`, cập nhật code/docs/`PLAN.md` và hoàn tất Git handoff trong phạm vi môi trường/quyền cho phép. Nếu không có quyền push/PR, Terra ghi chính xác commands còn lại cho người dùng. MANUAL `FINAL-GATE` có thể còn `Pending` và phải được liệt kê trong Phase Completion Summary.
- `COMPLETED`: reviewer đã approve, PR đã merge vào integration branch, acceptance criteria bắt buộc đạt và evidence thật đã được ghi. Riêng Phase 3, toàn bộ mandatory `FINAL-GATE`, Section 8 E2E, full-load và release tests phải đạt trước `COMPLETED`. Chỉ human hoặc một agent ở phiên sau xác minh được Git/PR/test evidence thật mới được cập nhật trạng thái này.

Quy tắc vận hành:

- Khi coding xong, Terra chỉ chuyển `ACTIVE → READY_FOR_REVIEW`, cập nhật Phase Completion Summary và dừng. Terra không được tự ghi reviewer approved, PR merged, merge commit hoặc `COMPLETED`.
- Sau human review + merge, cập nhật Phase hiện tại thành `COMPLETED`; chỉ lúc đó mới chuyển Phase kế tiếp từ `NOT_STARTED` sang `ACTIVE`.
- Nếu bắt đầu phiên mới và PR trước đã merge, agent được cập nhật lifecycle dựa trên `git`/PR evidence thật; không suy đoán từ checklist hay lời mô tả.
- Mỗi thời điểm chỉ có tối đa một Phase `ACTIVE`; Phase kế tiếp vẫn `NOT_STARTED` khi Phase trước đang `READY_FOR_REVIEW`.
- Phase có thể vào `READY_FOR_REVIEW` với MANUAL `FINAL-GATE` còn lại nếu dependency/credential thật chưa sẵn sàng, nhưng phải ghi rõ trong summary. Với Phase 3, mọi mandatory `FINAL-GATE` tuyệt đối block `COMPLETED` và final release.
- Hạ tầng dùng chung không làm thay đổi owner requirement. Minh xây dispatcher dùng cho CB2/CB3/YC3 nhưng không sở hữu CB3; Thùy nối buzzer/persistence vào YC6 nhưng Minh vẫn là owner YC6.

### Priority model, manual gates và Simple Implementation Rule

Thứ tự ưu tiên của dự án:

`CORRECT → COMPLETE → TESTABLE → DEMOABLE → SECURE ENOUGH → MAINTAINABLE → HARDENING`

- `MUST`: bắt buộc để đúng thuyết minh/frozen contract, an toàn, chạy demo hoặc đạt acceptance. Mọi `MUST` implementation và automated/HARD-GATE verification của Phase phải hoàn tất trước `READY_FOR_REVIEW`; các test/acceptance được ghi rõ là `FINAL-GATE` theo completion gate bên dưới.
- `SHOULD`: engineering quality có ích nếu không làm chậm committed scope. Có thể defer và phải ghi trong Phase Completion Summary.
- `OPTIONAL`: production hardening/enhancement. Không được block Phase, acceptance hoặc final project acceptance; chỉ làm sau khi mọi `MUST` đã hoàn thành và còn thời gian.
- `MANUAL — HARD-GATE`: correctness/safety/dependency test bắt buộc có evidence trước Phase có thể rời `ACTIVE`.
- `MANUAL — FINAL-GATE`: có thể còn pending ở `READY_FOR_REVIEW` do phần cứng, credential hoặc downstream chưa sẵn sàng, nhưng bắt buộc pass trước final release và trước Phase 3 `COMPLETED`. Không dùng nhãn này để né test có thể và cần chạy ngay.

> **Simple Implementation Rule:** Khi có nhiều cách đúng, chọn implementation đơn giản nhất đáp ứng committed requirements và frozen contracts. Không xây abstraction, framework, service, table, queue, retry system hoặc security mechanism phức tạp hơn mức project thực sự cần.

Áp dụng KISS/YAGNI và separation of concerns vừa đủ: không giant Node-RED Function node, không god class, không premature optimization. Tuy nhiên không được “đơn giản hóa” bằng cách bỏ authentication, authorization, RLS, ACK, timeout, duplicate protection cơ bản, validation, basic failure handling hoặc secret protection.

Hardening review để Terra không biến ý tưởng tốt thành blocker:

| Cơ chế | Priority | MUST path đơn giản |
|---|---|---|
| MQTT authentication | `MUST` | Broker có username/password; credential không ở Dashboard/Git |
| TLS qua Internet | `MUST` khi broker remote | Xác minh certificate; local isolated development không bắt buộc TLS |
| TLS cho local development | `OPTIONAL` | Chỉ làm nếu môi trường đã hỗ trợ và không làm chậm scope |
| MQTT topic ACL nâng cao | `OPTIONAL` | Authentication + Node-RED authorization là đường bắt buộc; ACL là defense-in-depth |
| Schema migrations | `MUST` ở mức script có thứ tự, chạy lặp/rebuild dev được | Migration framework phức tạp, rollback automation và query-plan tuning là `SHOULD/OPTIONAL` |
| `boot_id`/sequence telemetry | `SHOULD` | Core state + timestamp + stale handling phải chạy; boot UUID không block |
| Duplicate cache | `MUST` ở mức bounded recent-ID cache đơn giản | LRU tinh vi, persistence qua reboot và distributed cache là `OPTIONAL` |
| Persistence failure | `MUST` ghi lỗi rõ, không crash/loop vô hạn | Bounded retry nhỏ là `SHOULD`; dead-letter queue/infrastructure là `OPTIONAL` |
| Locker provisioning | `MUST` ownership server-side + không claim lại | Provisioning service, concurrent stress/race framework là `OPTIONAL`; dùng constraint/conditional update đơn giản |
| Secret checking | `MUST` kiểm tra working tree/diff và không commit secret | Exhaustive history scanning/automation là `SHOULD/OPTIONAL`, trừ khi có incident thật |
| Dependency/license work | `MUST` pin dependency cần dùng | License/dependency automation, bot update và CI policy nâng cao là `OPTIONAL` |
| Gemini grounding | `MUST` Node-RED tính facts, context có cấu trúc, no-data/failure rõ | Numeric-token validator/phân tích output tinh vi là `OPTIONAL` |
| CI/CD, observability, scalability | `OPTIONAL` | Local documented build/test/deploy và log lỗi cơ bản là đủ cho committed scope |

### Mâu thuẫn, diễn giải và quyết định ưu tiên

1. **Lịch dự án:** Master Project Plan giả định dự án bắt đầu 20/07/2026 và đang giữa Tuần 3, nhưng repository không có commit/source và prompt xác nhận greenfield. Quyết định: dùng ba Phase tuần tự và evidence gates của kế hoạch này; lịch 5 tuần chỉ là bối cảnh lịch sử, không phải bằng chứng hoàn thành.
2. **Phân công:** Master Project Plan mô tả một số việc là trách nhiệm chung. Bản thuyết minh và prompt khóa owner theo CB/YC. Quyết định: vẫn review/tích hợp chéo, nhưng không chuyển owner chính.
3. **Command payload:** hai PDF nêu tối thiểu `command_id`, `locker_id`, `action`, `issued_at`; prompt yêu cầu thêm `requested_by`. Quyết định: shared contract bắt buộc đủ cả năm trường.
4. **YC6 dependency:** Master mô tả YC6 như một luồng hoàn chỉnh trong cùng lịch tuần. Prompt tách rõ logic YC6 ở Phase 2, actual buzzer và event persistence ở Phase 3. Quyết định: Phase 2 phát `ALARM_ON` và normalized event `UNAUTHORIZED_OPEN` qua interface đã khóa; Phase 3 hiện thực CB3/YC4 và nối thật.
5. **YC8 dependency:** Minh sở hữu YC8 nhưng history thực phụ thuộc YC4 của Thùy. Quyết định: Phase 2 hoàn thành classifier, state-cache route, history adapter contract, structured grounding và failure path; Phase 3 nối adapter vào schema/query thật và chạy integration test.
6. **Quên mật khẩu:** wireframe thuyết minh có liên kết “Quên mật khẩu”, nhưng danh sách phạm vi YC9 chỉ cam kết register/login/logout/session/JWT/ownership/RLS. Quyết định: password recovery là **OPTIONAL**, không được làm chậm acceptance của YC9 trừ khi nhóm/giảng viên xác nhận bổ sung.
7. **Dashboard directory:** Dashboard chạy bằng FlowFuse Dashboard trong Node-RED. Thư mục `dashboard/` chỉ lưu wireframe, asset và tài liệu UI; source-of-truth flow runtime nằm trong `node-red/`.

### Open questions phải được đóng bằng evidence, không được suy đoán âm thầm

| Câu hỏi | Default đề xuất để triển khai | Người/Phase phải xác nhận | Ảnh hưởng nếu chưa đóng |
|---|---|---|---|
| ESP32 DevKit V1 Type-C thực tế dùng pin label/board profile nào? | Dùng candidate pin map ở Section 4, kiểm tra trực tiếp board trước khi nối tải | Huy / Phase 1 | Chặn wiring và firmware hardware |
| Góc `LOCK`/`UNLOCK` và hình học chốt? | Cấu hình, không hard-code rải rác; hiệu chuẩn không tải rồi có tải | Huy / Phase 1 | Chặn acceptance CB2 |
| Buzzer module active-high/active-low, dòng tải và có cần MOSFET? | Cấu hình polarity; dùng MOSFET nếu dòng/điện áp module yêu cầu | Thùy / Phase 3, Huy review nguồn | Chặn CB3 và tích hợp YC6 |
| WS2812B có bao nhiêu pixel và dòng cực đại? | Đo strip thật; giới hạn brightness để 5 V/3 A vẫn có margin | Huy / Phase 1 | Chặn full-load acceptance |
| MQTT Broker/FlowFuse deployment, TLS và credential được cấp ở đâu? | Broker có authentication; TLS bắt buộc nếu đi qua Internet | Nhóm, Huy khóa config / Phase 1 | Chặn MQTT integration thật |
| Locker được pre-provision/claim bằng mã như thế nào? | `LOCKER-001` được tạo server-side ở trạng thái chưa claim; claim một lần qua backend/RPC đã xác thực bằng một thao tác có điều kiện/constraint đơn giản. Chỉ cần cơ chế phức tạp hơn nếu test thật chứng minh có race cần xử lý | Minh / Phase 2 | Chặn ownership end-to-end |
| Telegram chat ID được liên kết với locker/user thế nào? | Lưu trong notification settings có RLS; xác nhận bằng thao tác bot có kiểm soát | Minh / Phase 2, Thùy tích hợp Phase 3 | Chặn Telegram test thật |
| Giờ báo cáo/email auth dùng cấu hình nào? | `21:00`, `Asia/Ho_Chi_Minh`; Gmail App Password hoặc OAuth chỉ ở backend | Thùy / Phase 3 | Chặn YC7 MANUAL test |
| Gemini model/quota nào được phép dùng? | Tên model là environment variable, không hard-code; kiểm tra model khả dụng khi triển khai | Minh / Phase 2 | Chặn Gemini API MANUAL test |
| Git remote và integration branch đã tồn tại chưa? | Dùng `develop` làm integration branch sau khi bootstrap; không giả lập remote/PR | Huy / Phase 1 | Chặn push/PR, không chặn local implementation |

## 2. Proposed Technology Stack

Đây là stack **đề xuất** vì hai PDF không khóa phiên bản thư viện/tool cụ thể. Không ghi “latest” trong manifest. Phase 1 phải pin các phiên bản tương thích đã build/test và ghi chúng trong `platformio.ini`, Node-RED package metadata và deployment guide.

| Lớp | Công nghệ đề xuất | Lý do/ranh giới |
|---|---|---|
| Firmware toolchain | PlatformIO + ESP32 Arduino Framework + C++ | Phù hợp ESP32 DevKit, dependency pinning và build lặp lại được |
| MQTT firmware | PubSubClient | Nhẹ, phổ biến; phải kiểm tra giới hạn QoS publish và dựa vào ACK timeout/state reconciliation thay vì tự retry actuator |
| JSON firmware | ArduinoJson | Parse/validate payload có schema rõ, tránh thao tác chuỗi rời rạc |
| Wi-Fi provisioning | WiFiManager | Captive portal cục bộ cho YC12; Wi-Fi password chỉ lưu trên ESP32/NVS |
| Servo | ESP32Servo | PWM tương thích ESP32; góc và thời gian chuyển động cấu hình được |
| DHT22 | Adafruit DHT sensor library + Adafruit Unified Sensor nếu dependency yêu cầu | Chu kỳ đọc có kiểm soát, phát hiện `NaN` |
| OLED | Adafruit SSD1306 + Adafruit GFX | SSD1306 0.96 inch I2C, hỗ trợ thông báo lỗi cục bộ |
| WS2812B | Adafruit NeoPixel (ưu tiên một thư viện duy nhất) | API đơn giản cho ON/OFF; FastLED chỉ là phương án thay thế nếu có lý do được ghi lại |
| Backend/orchestration | Node-RED | Auth/ownership gate, MQTT dispatcher, pending/ACK, cache, persistence, notifications, chatbot routing |
| UI | FlowFuse Dashboard | Dashboard web/mobile trong hệ Node-RED; không publish MQTT trực tiếp |
| MQTT Broker | Eclipse Mosquitto cho local/dev hoặc broker managed tương đương | Authentication bắt buộc; TLS khi qua Internet; topic ACL nếu broker hỗ trợ |
| Auth/database | Supabase Auth + PostgreSQL + PostgREST/RPC + Row Level Security | Session/JWT, ownership, event history, aggregation và RLS |
| Telegram | Telegram Bot API qua Node-RED HTTP request | Cảnh báo tức thời YC6, rate-limit/dedupe ở Node-RED |
| Email | Gmail SMTP/Email node | Báo cáo hằng ngày YC7; credential chỉ ở backend |
| Chatbot | Gemini API qua HTTPS | Chỉ diễn đạt structured facts do Node-RED cung cấp; không là nguồn dữ liệu |
| Test | PlatformIO test/native parser tests, Node-RED flow tests, Supabase/RLS integration tests, MANUAL hardware/service tests | Tách semantic automated tests khỏi phần cần board/account thật |
| Documentation | Markdown + ảnh/video/log evidence | Traceability requirement → module → test → evidence |

Quy tắc dependency:

- Chỉ dùng một thư viện cho cùng một trách nhiệm; không đồng thời dùng Adafruit NeoPixel và FastLED.
- Không nâng dependency giữa Phase nếu không có lỗi/nhu cầu cụ thể và regression evidence.
- Production dependency mới **MUST** có lý do cụ thể, phiên bản pin và manifest/lockfile được cập nhật bằng tool chính thức. License/risk review cơ bản là **SHOULD**; license/dependency automation nâng cao là **OPTIONAL**.
- FlowFuse/Supabase/Gemini/Telegram/Gmail là dịch vụ biến động; Phase tương ứng phải xác minh API/node đang khả dụng bằng tài liệu chính thức tại thời điểm triển khai, không dựa vào tên endpoint nhớ từ trước.

## 3. Target Repository Structure

Cây dưới đây là **mục tiêu cho quá trình triển khai**, không phải cấu trúc đã được tạo ở baseline:

```text
smart-privacy-locker/
├── PLAN.md
├── README.md
├── .gitignore
├── .env.example
├── firmware/
├── node-red/
├── supabase/
├── dashboard/
├── hardware/
├── tests/
└── docs/
```

| Đường dẫn | Mục đích |
|---|---|
| `PLAN.md` | Trạng thái Phase, checklist, acceptance, evidence index, commit/PR handoff; là tài liệu điều phối chính |
| `README.md` | Tổng quan, quick start không chứa secret, trạng thái triển khai thật và liên kết tài liệu |
| `.gitignore` | Loại `.env`, secret header, Node-RED credential runtime, PlatformIO build, log, cache, evidence nhạy cảm |
| `.env.example` | Chỉ tên biến và placeholder vô hại; không chứa credential hoạt động |
| `firmware/` | PlatformIO project, module ESP32, config example, unit/contract tests và firmware README |
| `node-red/` | Export flow/subflow, package metadata, environment example, test helper/fixtures không nhạy cảm và deployment README |
| `supabase/` | Migration/schema/RLS/RPC/test được tạo ở Phase 2/3; không đặt service-role key hoặc dump dữ liệu thật |
| `dashboard/` | Wireframe, asset và UI behavior/spec; FlowFuse flow runtime vẫn ở `node-red/` |
| `hardware/` | Pin map, wiring diagram, power budget, BOM, enclosure/assembly guide và ảnh evidence |
| `tests/` | Test plan, traceability matrix, fixtures, test results/evidence index; file lớn/nhạy cảm theo chính sách nhóm |
| `docs/` | Requirements, architecture, MQTT/event contract, auth model, database design, user/deployment/troubleshooting/demo guide |

Không tạo cấu trúc “cho đủ”. Mỗi Phase chỉ tạo đường dẫn có deliverable thực, và không commit build output, cache, local credentials, Node-RED encrypted credentials gắn với máy cá nhân hoặc dữ liệu người dùng thật.

## 4. Architecture and Shared Contracts

### Sơ đồ hệ thống và trust boundaries

```text
Người dùng
   │ HTTPS / authenticated Dashboard messages
   ▼
FlowFuse Dashboard
   │  Supabase access token theo frozen Auth Transport Contract; không có MQTT credential
   ▼
Node-RED Backend
   ├── validate session/JWT + ownership + device/broker readiness
   ├── pending command / ACK / timeout / live-state cache
   ├── Supabase Auth, Database, RLS
   ├── Telegram Bot API
   ├── Gmail SMTP/Email node
   └── Gemini API (structured context only)
   │ authenticated MQTT
   ▼
MQTT Broker
   │ command / ACK / state / telemetry / availability
   ▼
ESP32
   ├── MC-38
   ├── Servo SG90
   ├── Active Buzzer
   ├── WS2812B
   └── DHT22 ──local only──► OLED SSD1306
```

Dashboard không được biết MQTT username/password và không được publish thẳng xuống ESP32. Node-RED là policy enforcement point; Supabase RLS là lớp bảo vệ dữ liệu độc lập, không thay thế ownership check trước command.

### Contract freeze và thay đổi contract

- Huy tạo bản `docs/mqtt-contract.md` đầu tiên trong Phase 1 và chốt với Minh trước khi các firmware module phụ thuộc được merge.
- Đầu Phase 2, Minh khóa thêm normalized event, **Supabase Auth Transport Contract** và history-adapter contract với Thùy trước khi triển khai protected command/history/chatbot/settings flows hoặc YC6/YC8/YC4 integration.
- Mỗi contract có `schema_version` số nguyên, ví dụ `1`. Thay đổi additive tương thích giữ version; thay đổi breaking phải tăng version, cập nhật producer, consumer, fixtures, tests và migration note trong cùng PR.
- Không đổi topic, enum, field type, timeout semantics hoặc event counting rule một phía.

### MQTT topics

Base topic đề xuất: `locker/{locker_id}`. `locker_id` trong topic và payload phải khớp tuyệt đối.

| Topic | Publisher | Subscriber | Retained | Mục đích |
|---|---|---|---|---|
| `locker/{locker_id}/command` | Node-RED | ESP32 | Không | `LOCK`, `UNLOCK`, `ALARM_ON`, `ALARM_OFF`, `LED_ON`, `LED_OFF`, `GET_STATE` |
| `locker/{locker_id}/ack` | ESP32 | Node-RED | Không | ACK cho từng command, kể cả lỗi có thể định danh |
| `locker/{locker_id}/state` | ESP32 | Node-RED | Có | Full current state để bootstrap/reconcile sau reconnect |
| `locker/{locker_id}/telemetry/door` | ESP32 | Node-RED | Không | Stable door transition sau debounce; không replay event cũ |
| `locker/{locker_id}/availability` | ESP32/LWT | Node-RED | Có | `ONLINE` lúc connect, LWT `OFFLINE` khi disconnect bất thường |

Quy tắc MQTT:

- Command topic không retained để ESP32 không thực thi lệnh cũ sau reboot.
- Node-RED publish command với QoS được broker/client hỗ trợ cao nhất theo cấu hình đã test; firmware phải chịu được delivery trùng.
- Nếu dùng PubSubClient, phải ghi rõ QoS publish thực tế. Không tuyên bố QoS 1 cho ACK/state nếu library chỉ publish QoS 0.
- Availability LWT đặt retained; Node-RED dùng thời điểm nhận broker làm `observed_at` cho offline, vì timestamp đóng gói trong LWT được tạo từ lúc connect.
- ESP32 dùng client ID duy nhất theo locker/device. Reconnect **MUST** có khoảng chờ tăng dần và giới hạn hợp lý để không busy-loop/reset vô hạn; exponential backoff chính xác hoặc jitter là **SHOULD**, không được làm chậm committed scope nếu một state machine retry đơn giản đã đáp ứng.
- Sau mỗi MQTT reconnect thành công: publish `ONLINE`, publish full state, rồi mới nhận command bình thường.
- MQTT session cho device ưu tiên clean session và command không queued qua downtime; sau recovery Node-RED dùng `GET_STATE`, không replay actuator command.

### Command payload

```json
{
  "schema_version": 1,
  "command_id": "550e8400-e29b-41d4-a716-446655440000",
  "locker_id": "LOCKER-001",
  "action": "UNLOCK",
  "issued_at": "2026-08-07T08:00:00.000Z",
  "requested_by": "user-uuid"
}
```

Validation bắt buộc:

- Đủ năm field tối thiểu; đúng type; `command_id` là UUID hợp lệ. `requested_by` là user UUID do Node-RED lấy từ session cho lệnh Dashboard, hoặc service principal ổn định như `system:unauthorized-detector` cho automation YC6; UI không được tự khai giá trị này.
- `locker_id` khớp topic và compile/runtime configuration của thiết bị.
- `action` thuộc allowlist: `LOCK`, `UNLOCK`, `ALARM_ON`, `ALARM_OFF`, `LED_ON`, `LED_OFF`, `GET_STATE`.
- `issued_at` là ISO 8601 UTC. Nếu thiết bị đã sync thời gian, từ chối command quá cũ hơn `COMMAND_MAX_AGE_SECONDS`; nếu chưa sync, dựa vào non-retained topic/clean session và Node-RED timeout, đồng thời ghi diagnostic.
- ESP32 không tự đánh giá quyền user; nó chỉ thực thi command đến từ topic/broker credential được bảo vệ. Quyền được kiểm tra ở Node-RED trước publish.

### ACK payload

```json
{
  "schema_version": 1,
  "command_id": "550e8400-e29b-41d4-a716-446655440000",
  "locker_id": "LOCKER-001",
  "action": "UNLOCK",
  "result": "success",
  "device_state": {
    "door": "CLOSED",
    "lock": "UNLOCKED",
    "alarm": "INACTIVE",
    "led": "OFF"
  },
  "error": null,
  "duplicate": false,
  "timestamp": "2026-08-07T08:00:01.000Z"
}
```

Ví dụ correlated error ACK khi command parse được `command_id` nhưng lỗi ở validation khác:

```json
{
  "schema_version": 1,
  "command_id": "550e8400-e29b-41d4-a716-446655440000",
  "locker_id": "LOCKER-001",
  "action": "UNLOCK",
  "result": "error",
  "device_state": {
    "door": "CLOSED",
    "lock": "LOCKED",
    "alarm": "INACTIVE",
    "led": "OFF"
  },
  "error": {
    "code": "STALE_COMMAND",
    "message": "Command is outside the accepted age window"
  },
  "duplicate": false,
  "timestamp": "2026-08-07T08:00:01.000Z"
}
```

- `result`: `success` hoặc `error`.
- `device_state` luôn là object full state với enum hợp lệ; trạng thái chưa xác định dùng `UNKNOWN`, không dùng chuỗi rỗng.
- `error` là `null` khi thành công; khi lỗi là object có `code` ổn định và `message` an toàn, ví dụ `MISSING_FIELD`, `INVALID_ACTION`, `LOCKER_MISMATCH`, `STALE_COMMAND`, `ACTUATION_FAILED`. `INVALID_JSON` chỉ được dùng trong ACK khi payload vẫn parse đủ để lấy một `command_id` hợp lệ; nếu không thì chỉ là diagnostic nội bộ/không tương quan.
- **Normal ACK luôn là response tương quan với command có `command_id` hợp lệ.** Nếu JSON malformed đến mức không lấy được `command_id`, firmware không publish normal correlated ACK và tuyệt đối không bịa `command_id:null`. Firmware **MAY** ghi serial diagnostic hoặc publish một uncorrelated diagnostic đơn giản nếu thật sự hữu ích; Node-RED không match diagnostic đó với pending command, không cập nhật success và để request liên quan timeout/reconcile theo contract.
- Nếu lấy được `command_id` hợp lệ nhưng command lỗi ở field/action/locker/time khác, firmware publish ACK `result:error` giữ nguyên `command_id` để Node-RED correlate.
- Command trùng không tác động actuator lần hai. Firmware phát lại cached ACK, giữ `result/device_state/error` gốc và đặt `duplicate: true`.
- Node-RED chỉ accept ACK khi `command_id`, `locker_id`, expected action/state và schema hợp lệ, đồng thời command còn trong pending store. ACK sai hoặc đến muộn được ghi diagnostic, không đổi UI thành success.

### Full state payload

```json
{
  "schema_version": 1,
  "locker_id": "LOCKER-001",
  "door": "CLOSED",
  "lock": "LOCKED",
  "alarm": "INACTIVE",
  "led": "OFF",
  "wifi_connected": true,
  "mqtt_connected": true,
  "timestamp": "2026-08-07T08:00:01.000Z"
}
```

Enum chuẩn:

- Door: `OPEN`, `CLOSED`, `UNKNOWN`.
- Lock: `LOCKED`, `UNLOCKED`, `UNKNOWN`.
- Alarm: `ACTIVE`, `INACTIVE`, `UNKNOWN`.
- LED: `ON`, `OFF`, `UNKNOWN`.
- Availability: `ONLINE`, `OFFLINE`.

### Cold boot và Servo safe-state policy

- Sau cold boot: `lock=UNKNOWN`, `alarm=INACTIVE`, `led=OFF`; door giữ `UNKNOWN` cho đến khi MC-38 có stable debounce sample rồi mới chuyển `OPEN`/`CLOSED`.
- Servo SG90 **không tự di chuyển chỉ vì ESP32 boot/reboot**. Không phát xung “safe initialization”, không replay last command và không khôi phục mù vị trí từ NVS.
- SG90 không có position feedback, vì vậy firmware không được giả vị trí cơ khí sau restart. `lock` chỉ chuyển sang `LOCKED` hoặc `UNLOCKED` sau khi controller thực sự thực hiện command `LOCK`/`UNLOCK` hợp lệ và tạo ACK/full state tương ứng; trước đó vẫn là `UNKNOWN`.
- Dashboard phải trình bày lock `UNKNOWN` là **chưa xác nhận**, không ánh xạ hoặc tô trạng thái như `LOCKED`/`UNLOCKED` và không dùng last-known state như current truth.
- YC6 tiếp tục xử lý lock `UNKNOWN` theo fail-safe hiện có: door `OPEN` khi lock chưa xác nhận không được coi là authorized.

Full-state JSON phía trên là ví dụ runtime sau một command đã được xác nhận, không phải cold-boot payload mặc định.

State được publish sau boot/reconnect, sau state transition và sau command. Retained state là last-known state, không tự chứng minh device online; availability và stale timer mới quyết định độ tươi. `boot_id`/sequence có thể được thêm nhất quán như **SHOULD**, nhưng không phải điều kiện bắt buộc của contract v1 hoặc acceptance.

### Door telemetry

```json
{
  "schema_version": 1,
  "locker_id": "LOCKER-001",
  "previous_state": "CLOSED",
  "state": "OPEN",
  "timestamp": "2026-08-07T08:01:00.000Z",
  "time_synced": true
}
```

- Chỉ publish sau stable debounce và khi state thay đổi; boot publish initial state qua full state, telemetry transition chỉ phát khi có edge thật.
- `boot_id` và `sequence` là field **SHOULD** nếu nhóm triển khai được đơn giản và nhất quán để hỗ trợ chẩn đoán duplicate/reorder; core path không phụ thuộc vào chúng.
- Nếu chưa sync NTP, giữ field `timestamp` nhưng dùng `null`, đặt `time_synced:false`; Node-RED đóng dấu `received_at` UTC và không bịa device time.
- Với MC-38 hai dây và một digital input pull-up/pull-down thông thường, firmware chỉ ánh xạ **stable electrical state** sang `OPEN` hoặc `CLOSED`; nó không thể chắc chắn phân biệt cửa đang mở hợp lệ với dây sensor bị đứt/hở. Vì vậy không được yêu cầu hoặc tuyên bố `wire disconnected → UNKNOWN`.
- Door `UNKNOWN` chỉ dùng khi live state không đáng tin: sensor chưa initialize, boot chưa có stable sample, device Offline, state cache stale, payload thiếu/không hợp lệ, hoặc lỗi đọc nội bộ mà phần cứng/library thực sự phát hiện. Dashboard/cache có thể suy ra `UNKNOWN` do Offline/stale mà không sửa retained payload gốc. **Broken-wire detection requires additional supervised circuitry and is outside current project scope.**

### Availability/Last Will and Testament (LWT) payload

Availability dùng MQTT **Last Will and Testament (LWT)**. Payload tối thiểu là JSON retained có `schema_version`, `locker_id`, `status` và `sent_at`; `boot_id` là **SHOULD**, không bắt buộc. ESP32 publish `ONLINE` sau MQTT connect. LWT chứa `OFFLINE`; `sent_at` trong LWT chỉ là lúc LWT được đăng ký, vì vậy Node-RED phải thêm `observed_at` khi broker phát LWT và dùng `observed_at` để lưu event/display. Graceful disconnect nên publish `OFFLINE` trước khi ngắt nếu có thể.

### Pending command, timeout và duplicate protection

- Node-RED sinh UUID v4 server-side; Dashboard không tự đặt `command_id`.
- Dispatcher có hai caller class rõ ràng: `authenticated_user` cho Dashboard và `trusted_internal_automation` cho detector YC6. Chỉ entrypoint nội bộ không public mới được dùng automation; action allowlist ban đầu chỉ cho `ALARM_ON`/`GET_STATE`, gắn `requested_by=system:unauthorized-detector`, vẫn phải kiểm tra locker, MQTT/device readiness, conflict và audit. Không tạo HTTP/UI “bypass auth”.
- Pending store key là `command_id`, có `locker_id`, user ID, action, actuator domain, issued time, deadline và request correlation của Dashboard.
- Actuator domain: lock (`LOCK/UNLOCK`), alarm (`ALARM_ON/OFF`), LED (`LED_ON/OFF`). Không cho hai command xung đột cùng locker/domain đồng thời; các control tương ứng bị disable.
- Timeout mặc định đề xuất `5.000 ms`, cấu hình bằng environment. Khi timeout: không báo success, ghi `COMMAND_TIMEOUT`, giải phóng pending, hiển thị lỗi và gửi một `GET_STATE` để reconcile nếu connection còn tốt.
- Không tự động retry `LOCK`, `UNLOCK`, alarm hoặc LED sau timeout; actuator có thể đã tác động nhưng ACK bị mất. Chỉ reconcile state hoặc yêu cầu người dùng thao tác lại sau khi biết state.
- Node-RED và firmware **MUST** giữ một bounded recent-command cache đơn giản đủ cho demo để nhận command/ACK trùng và tái phát ACK gốc khi phù hợp. Array/ring buffer kích thước cấu hình nhỏ là đủ; LRU phức tạp, persistence qua reboot hoặc distributed cache là **OPTIONAL** và không block Phase.
- ACK đến sau timeout không đổi request cũ thành success; state hợp lệ vẫn có thể cập nhật cache như telemetry riêng và UI phải ghi rõ reconciliation, không giả thành công cho command đã timeout.

### Node-RED restart recovery policy

- Khi Node-RED khởi động/restart, **MUST** clear toàn bộ pending commands và authorized-unlock windows trong runtime; không restore hoặc replay actuator command cũ.
- Live-state cache sau restart bắt đầu empty/stale. Controls phải disabled và không được dùng retained last-known state như bằng chứng rằng device đang fresh.
- Node-RED reconnect MQTT, chờ availability cùng retained full state hợp lệ; gửi `GET_STATE` nếu state còn thiếu/stale. Chỉ enable controls sau khi MQTT Broker, ESP32 availability và state freshness đều được xác nhận theo Dashboard state rules.
- ACK cũ đến sau restart không có pending entry tương ứng nên bị drop/ghi diagnostic an toàn; nó không được biến command cũ thành success. State hợp lệ trong ACK chỉ có thể được dùng cho reconciliation theo validation/freshness policy, không khôi phục request cũ.
- Authorized-unlock window trước restart không được restore; lần mở cửa tiếp theo chỉ authorized nếu có một valid `UNLOCK` ACK mới tạo window mới.
- Không tạo persistent queue/database cho pending command hoặc unlock window chỉ để xử lý restart. Runtime state đơn giản + retained full state/`GET_STATE` reconciliation là contract bắt buộc.

### Authorized unlock window và unauthorized-open rule

- Window mặc định **30 giây**, cấu hình bằng `AUTHORIZED_UNLOCK_WINDOW_SECONDS`.
- Chỉ tạo window sau ACK `success` cho `UNLOCK`, đúng locker/pending command. Request vừa publish hoặc ACK sai không mở window.
- Window gắn với locker và command ID, chỉ được tiêu thụ bởi stable transition sang `OPEN` đầu tiên.
- Stable door `OPEN` trong window và lock state xác nhận `UNLOCKED` → event cửa có `authorized=true`, sau đó consume window.
- Door `OPEN` khi lock `LOCKED`/`UNKNOWN`, hoặc ngoài/không có window → `authorized=false`, phát normalized event `UNAUTHORIZED_OPEN`, yêu cầu `ALARM_ON`, cập nhật latest alert và gửi Telegram.
- ACK `LOCK` thành công, window hết hạn, Node-RED restart hoặc ownership/device reset phải đóng window. Sau restart áp dụng fail-safe: không khôi phục window không có evidence.
- Chỉ cảnh báo trên stable transition/episode. Duplicate telemetry hoặc door vẫn `OPEN` không gửi lặp; transition về `CLOSED` mới reset episode. Telegram có dedupe/rate-limit theo locker + episode/event ID.

### Normalized event types và persistence contract

Canonical event types:

`DOOR_OPENED`, `DOOR_CLOSED`, `DOOR_UNKNOWN`, `LOCK_COMMAND`, `UNLOCK_COMMAND`, `LOCK_STATE_CHANGED`, `ALARM_STARTED`, `ALARM_STOPPED`, `LED_TURNED_ON`, `LED_TURNED_OFF`, `DEVICE_ONLINE`, `DEVICE_OFFLINE`, `UNAUTHORIZED_OPEN`, `COMMAND_REJECTED`, `COMMAND_TIMEOUT`, `TELEGRAM_NOTIFICATION`, `DAILY_EMAIL_REPORT`.

Mỗi normalized event phải có:

- `event_id` UUID để dedupe insert.
- `schema_version`, `locker_id`, `event_type`.
- `device`: `door`, `lock`, `alarm`, `led`, `system` hoặc `notification`.
- `action` nullable; `source`: `sensor`, `dashboard`, `system`, `automation`.
- `result`: `observed`, `success`, `failure`, `rejected` hoặc `timeout`.
- `authorized`: boolean bắt buộc cho `DOOR_OPENED`/`UNAUTHORIZED_OPEN`, `null` cho event không áp dụng.
- `command_id` bắt buộc cho command/ACK-derived event, nullable cho telemetry.
- `device_state`, `error`, metadata tối thiểu không chứa secret/JWT.
- `occurred_at` UTC và `recorded_at` server-side. Nếu device time không tin cậy, `occurred_at` dùng Node-RED receive time và metadata ghi `device_time_unsynced=true`.

Counting rule bắt buộc để chart/report/chatbot không đếm khác nhau:

- “Số lần mở tủ” = số event `DOOR_OPENED` đã dedupe trong khoảng thời gian.
- “Số cảnh báo” = số event `UNAUTHORIZED_OPEN` đã dedupe trong khoảng thời gian.
- Một lần mở trái phép tạo cả `DOOR_OPENED authorized=false` và `UNAUTHORIZED_OPEN`; nó tính một lần mở và một cảnh báo, không tạo hai cảnh báo.

### Database entities đề xuất

Không tạo SQL ở baseline; Phase 2/3 hiện thực bằng versioned migrations.

| Entity | Trường/ý nghĩa tối thiểu | Owner triển khai |
|---|---|---|
| `profiles` | `user_id` liên kết Auth, full name, created time | Minh / Phase 2 |
| `lockers` | UUID, unique `locker_code`, `owner_id`, display name, claim state/time | Minh / Phase 2 |
| `device_events` | event ID, locker FK, type, device/action/source/result/authorized/command ID, state/error/metadata, occurred/recorded timestamps | Thùy / Phase 3 |
| `notification_settings` | locker FK, Telegram enabled/chat ID, email enabled/address, report time, timezone | Thùy / Phase 3; Minh cung cấp ownership contract |
| `notification_deliveries` | channel, locker, report/event key, status, attempted/sent time, bounded error; unique dedupe key | Thùy / Phase 3 |

RLS/ownership rules:

- User chỉ đọc/update profile của chính mình theo policy phù hợp.
- User chỉ đọc locker có `owner_id = auth.uid()`; không được tự sửa `owner_id` từ frontend.
- Claim locker là thao tác server-side/RPC đã xác thực, atomic, chỉ cho locker chưa claim; code sai/đã claim bị từ chối.
- Event/history/settings/deliveries chỉ đọc khi user sở hữu locker liên quan; write event từ Node-RED backend sau auth/ownership hoặc bằng service-role bảo vệ tuyệt đối.
- Frontend chỉ có Supabase URL + publishable/anon key. Service-role key chỉ nằm ở Node-RED environment/secret store.
- Node-RED validate access token với Supabase Auth, lấy user ID đáng tin cậy, rồi kiểm tra ownership trước mọi command/history/chatbot/settings request. `locker_id` do client gửi chỉ là selector không đáng tin và luôn phải ownership-check trước side effect.

### Supabase Auth Transport Contract

- Browser/FlowFuse Dashboard thực hiện Supabase sign-up/sign-in và nhận authenticated session; protected request sang Node-RED phải mang **Supabase access token hiện hành**, không tự tạo token hoặc identity thứ hai.
- Transport mặc định cần freeze ở đầu Phase 2 là HTTP `Authorization: Bearer <access_token>` nếu implementation FlowFuse Dashboard thực tế hỗ trợ phù hợp. Phase 2 phải xác minh bằng request thật và ghi rõ route, header, refresh/expiry behavior cùng CORS cần thiết trong `docs/auth-ownership.md` **trước** khi xây toàn bộ protected command/history/chatbot/settings flows.
- Nếu FlowFuse Dashboard cần `ui-template`/`fetch` hoặc cơ chế tương đương để gắn `Authorization` header, chọn cách đơn giản nhất và tài liệu hóa. Chỉ dùng một canonical auth transport; không vận hành song song Bearer + custom token/cookie/session mechanism nếu không có constraint thực tế được ghi bằng evidence.
- Node-RED validate access token với Supabase trước side effect; `user_id` luôn lấy từ verified token, tuyệt đối không tin `user_id` do browser gửi. Mọi `locker_id` trong request phải qua ownership check cho user đã verify.
- Supabase service-role key chỉ ở Node-RED/backend secret store, không được gửi ra browser. Không log full JWT, không lưu JWT trong event metadata và không đưa JWT vào Gemini context.
- Không thêm backend framework/service mới chỉ để vận chuyển hoặc validate token; dùng FlowFuse/Node-RED + Supabase theo implementation đơn giản nhất đáp ứng contract này.

### Timestamp và timezone

- Truyền và lưu chuẩn UTC ISO 8601 có hậu tố `Z`; database dùng `timestamptz`.
- `Asia/Ho_Chi_Minh` là timezone hiển thị/report mặc định, nhưng phải lưu theo từng notification setting.
- Chart 7 ngày = ngày hiện tại và 6 ngày lịch trước; chart 30 ngày = ngày hiện tại và 29 ngày lịch trước, tính boundary theo timezone người dùng rồi chuyển UTC khi query.
- Daily report mặc định tổng hợp ngày lịch trước `[00:00, 24:00)` theo timezone đã cấu hình.
- Không dùng local timezone của máy Node-RED một cách ngầm định; DST/timezone conversion phải nằm ở một utility/subflow dùng chung.

### Environment variables và secret boundaries

Tên biến đề xuất; `.env.example` chỉ để placeholder:

- Device/deployment: `LOCKER_ID`, `MQTT_HOST`, `MQTT_PORT`, `MQTT_USERNAME`, `MQTT_PASSWORD`, `MQTT_TLS`, `MQTT_CA_CERT_PATH`.
- Runtime: `COMMAND_TIMEOUT_MS`, `COMMAND_MAX_AGE_SECONDS`, `AUTHORIZED_UNLOCK_WINDOW_SECONDS`, `DEVICE_STALE_AFTER_SECONDS`, `DASHBOARD_BASE_URL`.
- Supabase: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
- Telegram: `TELEGRAM_BOT_TOKEN`.
- Email: `GMAIL_SMTP_HOST`, `GMAIL_SMTP_PORT`, `GMAIL_SMTP_USER`, `GMAIL_APP_PASSWORD`, `EMAIL_FROM`.
- Gemini: `GEMINI_API_KEY`, `GEMINI_MODEL`.
- Node-RED: `NODE_RED_CREDENTIAL_SECRET`, `REPORT_TIMEZONE`.

Wi-Fi SSID/password không thuộc `.env`: nhập qua captive portal, lưu trong ESP32/NVS và không publish/log/đưa lên Cloud. MQTT credential firmware được provision bằng file local bị ignore hoặc cơ chế runtime đã tài liệu hóa; không hard-code trong source hay `platformio.ini` được commit.

### Dashboard state rules

Control chỉ enable khi đồng thời:

1. User đã đăng nhập.
2. Session/JWT còn hiệu lực.
3. Ownership đúng locker.
4. Node-RED đang connected với MQTT Broker.
5. ESP32 `ONLINE` và state chưa stale.
6. Không có command xung đột đang pending.

UI rules:

- Click control chuyển đúng domain sang `PENDING`, disable control xung đột và hiển thị spinner/command ID rút gọn.
- Chỉ hiển thị success sau ACK hợp lệ. Publish thành công vào broker không phải device success.
- Timeout/error/rejected phải hiện lý do có kiểm soát và không đổi state mong muốn thành state thực.
- `MQTT Disconnected` và `ESP32 Offline` là hai trạng thái riêng; cả hai disable control.
- Khi Offline/stale: door hiển thị `UNKNOWN`; actuator có thể hiện last-known kèm nhãn stale nhưng không được trình bày như current truth.
- Lock `UNKNOWN` phải hiển thị nhãn chưa xác nhận và không được trình bày như `LOCKED`/`UNLOCKED`; chỉ ACK/state từ command `LOCK`/`UNLOCK` thực sự được controller thực hiện mới xác nhận lock state.
- State cache **MUST** lưu value, source, device timestamp, Node-RED observed time và stale flag theo locker; `boot_id` là **SHOULD** nếu firmware đã cung cấp nhất quán.
- Session hết hạn: xóa state UI nhạy cảm, disable control, yêu cầu đăng nhập lại; không âm thầm dùng service credential thay user.
- User không sở hữu locker nhận `403`/thông báo phù hợp; request không được publish MQTT.
- Recent events, chart, chatbot và notification settings đều lọc theo locker ownership.

### Candidate pin map cần Phase 1 xác nhận trên board thật

| Chức năng | Candidate GPIO | Ghi chú |
|---|---:|---|
| MC-38 | GPIO 27 | `INPUT_PULLUP` nếu wiring phù hợp; xác nhận logic đảo |
| Servo SG90 signal | GPIO 18 | PWM; servo lấy 5 V từ rail nguồn, không từ GPIO/3.3 V |
| Active Buzzer control | GPIO 26 | Phase 3 xác nhận polarity/MOSFET; GPIO không cấp dòng tải |
| DHT22 data | GPIO 4 | Pull-up 10 kΩ nếu module chưa có |
| WS2812B data | GPIO 25 | Điện trở nối tiếp 330–470 Ω; level shifter nếu tín hiệu 3.3 V không ổn định |
| OLED SDA | GPIO 21 | I2C mặc định đề xuất |
| OLED SCL | GPIO 22 | I2C mặc định đề xuất |

Tránh dùng GPIO boot-strapping hoặc input-only nếu không có lý do/kiểm thử. Pin map chỉ được xem là khóa sau khi Phase 1 đo board, kiểm tra boot, test từng module và cập nhật `hardware/pin-map.md` + `docs/mqtt-contract.md` nếu state mapping bị ảnh hưởng.

## 5. Phase 1 — Thái Quang Huy

### Phase Goal

**Status: ACTIVE. Owner: Thái Quang Huy — 24127177. Reviewer: Nguyễn Văn Minh.**

Khởi tạo nền tảng repository và firmware ESP32; khóa pin map/MQTT contract; triển khai firmware foundation, CB2, YC1, YC3, YC12 đủ để Minh thêm CB1 và xây Node-RED orchestration ở Phase 2. Phase 1 không tuyên bố CB2/YC3 end-to-end qua Dashboard đã hoàn thành khi auth/dispatcher/final Dashboard chưa tồn tại.

### Minimum Required Completion Path

Để Phase 1 chuyển từ `ACTIVE` sang `READY_FOR_REVIEW`, Terra phải ưu tiên và hoàn tất các `MUST`: repository/toolchain build được; pin map và power/wiring thật; Wi-Fi + MQTT reconnect/LWT/full state; frozen command/ACK/state contract; parser/validation/dedupe đơn giản; CB2; YC1 local-only; YC3; YC12; toàn bộ MANUAL `HARD-GATE` của Phase 1; build/test/evidence thật; Git handoff. Không làm `OPTIONAL` trước critical path này.

### Dependencies

- Hai PDF nguồn và Sections 1–4 của `PLAN.md`.
- ESP32 DevKit V1 Type-C, MC-38 để reserved pin integration, SG90, DHT22, OLED SSD1306, WS2812B, nguồn 5 V/3 A, dây/đầu nối và linh kiện bảo vệ thực tế.
- MQTT Broker development endpoint/credential hoặc broker local có cấu hình tương đương; không commit credential.
- Minh phải review MQTT topics/payload/error semantics trước contract freeze.
- Git remote/permissions nếu muốn hoàn tất push/PR; thiếu remote không được giả evidence.

### Deliverables

- Repository baseline (`README.md`, `.gitignore`, `.env.example`) và target directories cần thiết cho Phase 1.
- PlatformIO firmware project có module boundaries, config example và build/test command được tài liệu hóa.
- Wi-Fi provisioning, MQTT connect/reconnect/LWT/availability, full-state publish, command parser, state manager, duplicate protection và ACK publisher.
- CB2 Servo SG90 controller + cấu hình góc + firmware command/ACK/state.
- YC1 DHT22 → OLED local display + error state, không publish temperature/humidity lên Dashboard.
- YC3 WS2812B ON/OFF + firmware command/ACK/state.
- YC12 WiFiManager captive portal, reset/configuration guide và reconnect Internet/MQTT.
- Pin map, wiring/power guide, MQTT contract v1, firmware README, test case/evidence index.

### Files and Directories to Create or Modify

Đây là danh sách dự kiến cho lúc triển khai, không phải file đã tồn tại:

| Đường dẫn | Nội dung |
|---|---|
| `README.md`, `.gitignore`, `.env.example` | Baseline repo, secret/build ignore, placeholder config |
| `firmware/platformio.ini` | Board/framework/dependency versions đã pin; không chứa secret |
| `firmware/include/app_config.example.h`, `firmware/include/pin_map.h`, `firmware/include/secrets.example.h` | Cấu hình public/candidate pins/secret template vô hại |
| `firmware/src/main.cpp` | Non-blocking orchestration loop và module wiring |
| `firmware/src/wifi_provisioning.*`, `mqtt_client.*` | WiFiManager, connection/backoff, subscriptions, LWT |
| `firmware/src/state_manager.*`, `command_handler.*`, `ack_publisher.*` | State, JSON validation, dedupe, ACK/full state |
| `firmware/src/lock_controller.*` | Servo CB2 |
| `firmware/src/environment_monitor.*`, `display_controller.*` | DHT22/OLED YC1 |
| `firmware/src/led_controller.*` | WS2812B YC3 |
| `firmware/test/` | Parser/state/dedupe tests chạy không cần hardware khi khả thi |
| `hardware/pin-map.md`, `hardware/wiring-diagram/`, `hardware/assembly-guide.md` | Pin, wiring, common ground, nguồn, ảnh kết nối |
| `docs/requirements.md`, `docs/architecture.md`, `docs/mqtt-contract.md` | Baseline requirement/architecture/shared contract |
| `tests/test-plan.md`, `tests/evidence/phase-1/` | Test spec và evidence thật, không chứa secret |
| `PLAN.md` | Chỉ cập nhật trạng thái/evidence/commit/PR thực |

### Implementation Checklist

- [ ] **[MUST]** Khởi tạo repository baseline và cấu trúc tối thiểu cần cho Phase 1.
  - File/module dự kiến: `README.md`, `.gitignore`, `.env.example`, các thư mục cần dùng trong bảng trên.
  - Kết quả phải đạt: người mới hiểu dự án, toolchain và secret policy; build/cache/local config bị ignore đúng.
  - Cách kiểm tra: review tree, `git status`, ignore checks với file placeholder local và secret scan diff.
  - Điều kiện được tick: chỉ các file có nội dung thật được tạo, không có source ngoài scope/secret/build artifact và Minh review baseline.

- [ ] **[MUST]** Chọn, pin và tài liệu hóa PlatformIO/ESP32 Arduino toolchain cùng firmware architecture.
  - File/module dự kiến: `firmware/platformio.ini`, `firmware/README.md`, module headers/sources.
  - Kết quả phải đạt: clean build tái lập được; mỗi module có một trách nhiệm; loop không bị chặn bởi thao tác thiết bị/network.
  - Cách kiểm tra: chạy clean build và parser/unit tests trên môi trường được ghi lại; review dependency versions.
  - Điều kiện được tick: build thật exit 0, không warning nghiêm trọng bị bỏ qua, command/build output và phiên bản đã ghi evidence.

- [ ] **[MUST]** Chốt pin map, wiring, power budget và nguyên tắc nguồn trên phần cứng thật.
  - File/module dự kiến: `firmware/include/pin_map.h`, `hardware/pin-map.md`, wiring diagram, assembly guide.
  - Kết quả phải đạt: pin không xung đột/ảnh hưởng boot; common ground; servo/LED/buzzer không lấy dòng từ GPIO; protection parts được ghi rõ.
  - Cách kiểm tra: continuity/polarity check, boot test từng module, đo rail không tải/có tải, review theo candidate map Section 4.
  - Điều kiện được tick: pin map được Huy và Minh ký review bằng evidence, không còn pin TBD ảnh hưởng Phase 2.

- [ ] **[MUST]** Khóa MQTT topics, payload, enum, error và timeout contract v1 với Minh.
  - File/module dự kiến: `docs/mqtt-contract.md`, fixtures trong `firmware/test/`.
  - Kết quả phải đạt: contract chứa command/ACK/state/door/availability, QoS/retained thực tế, schema version và sample hợp lệ/lỗi.
  - Cách kiểm tra: review producer/consumer matrix, validate fixtures, walkthrough valid/invalid/duplicate/reconnect cases với Minh.
  - Điều kiện được tick: Minh approve contract, không còn field/type/topic TBD và contract version được ghi.

- [ ] **[MUST]** Xây Wi-Fi foundation và YC12 WiFiManager captive portal.
  - File/module dự kiến: `wifi_provisioning.*`, config example, user setup section.
  - Kết quả phải đạt: dùng Wi-Fi đã lưu; khi không kết nối được thì mở AP/portal; lưu Wi-Fi mới; có bounded portal/reconnect behavior và cách reset cấu hình.
  - Cách kiểm tra: MANUAL bằng điện thoại với Wi-Fi cũ sai/không có, nhập Wi-Fi mới, restart và kiểm tra NVS/reconnect mà không lộ password.
  - Điều kiện được tick: captive portal/reconnect/reset đều có video/log đã che secret và ESP32 không cần nạp lại firmware.

- [ ] **[MUST]** Xây MQTT connect/reconnect, subscription, LWT/availability và full-state recovery.
  - File/module dự kiến: `mqtt_client.*`, `state_manager.*`, `main.cpp`.
  - Kết quả phải đạt: unique client ID; backoff có giới hạn; command non-retained; LWT retained; publish `ONLINE` và full state sau reconnect.
  - Cách kiểm tra: MANUAL ngắt broker/Wi-Fi/restart ESP32, quan sát broker/Node-RED debug client và timestamp.
  - Điều kiện được tick: recovery lặp lại được, không busy-loop/reset vô hạn, LWT và full state đúng contract có evidence.

- [ ] **[MUST]** Xây command parser, action validation, duplicate cache và ACK publisher.
  - File/module dự kiến: `command_handler.*`, `ack_publisher.*`, `state_manager.*`, parser tests.
  - Kết quả phải đạt: validate JSON/field/locker/action/time; invalid payload không actuation; duplicate không actuation lần hai; ACK lỗi rõ. Malformed JSON không lấy được `command_id` không tạo normal ACK; payload lấy được `command_id` nhưng lỗi field/action khác tạo correlated error ACK.
  - Cách kiểm tra: automated fixtures cho valid action, missing field, malformed JSON có/không lấy được `command_id`, invalid action/locker, stale và duplicate command; assert không có correlated ACK giả.
  - Điều kiện được tick: tất cả test đã chạy thật và có result artifact; không có broad fallback/silent ignore ngoài trường hợp contract quy định.

- [ ] **[MUST]** Bảo đảm scheduler/loop firmware non-blocking và state nhất quán.
  - File/module dự kiến: `main.cpp`, `state_manager.*`, các controller.
  - Kết quả phải đạt: MQTT loop/reconnect, sensor polling, display và actuator state machine cùng chạy; không dùng delay dài trong callback.
  - Cách kiểm tra: code review, timing log có kiểm soát, chạy đồng thời reconnect/sensor/LED/servo.
  - Điều kiện được tick: không có blocking path làm mất MQTT keepalive và state transition có nguồn duy nhất.

- [ ] **[MUST]** Triển khai CB2 Servo SG90 với cấu hình `LOCK`/`UNLOCK` an toàn.
  - File/module dự kiến: `lock_controller.*`, config angles/timing, state/ACK integration.
  - Kết quả phải đạt: góc tập trung trong config; callback chỉ queue action; controller chuyển động hữu hạn; cold boot giữ `lock=UNKNOWN` và không di chuyển servo; chỉ command hợp lệ đã thực thi mới publish ACK/full state `LOCKED`/`UNLOCKED`.
  - Cách kiểm tra: automated controller boot/state test nếu khả thi; MANUAL cold reboot quan sát không có servo motion, rồi test servo không tải, có tải, chốt thật và command trùng.
  - Điều kiện được tick: reboot không tự di chuyển/giả vị trí; LOCK/UNLOCK lặp lại ổn định, không kẹt/quá góc/reset; ACK/state khớp và có ảnh/video/current evidence.

- [ ] **[MUST]** Triển khai YC1 DHT22 acquisition và OLED SSD1306 local display.
  - File/module dự kiến: `environment_monitor.*`, `display_controller.*`.
  - Kết quả phải đạt: chu kỳ đọc phù hợp DHT22; hiển thị nhiệt độ/độ ẩm; `NaN`/sensor missing hiển thị lỗi; firmware tiếp tục chạy.
  - Cách kiểm tra: MANUAL với sensor bình thường, tháo data/sensor lỗi, theo dõi OLED và MQTT connection.
  - Điều kiện được tick: display/read/error evidence đầy đủ và không có temperature/humidity topic/card Dashboard được tạo.

- [ ] **[MUST]** Triển khai YC3 WS2812B `LED_ON`/`LED_OFF`, ACK và state.
  - File/module dự kiến: `led_controller.*`, command/state integration.
  - Kết quả phải đạt: ON/OFF không block; brightness/current limit cấu hình; duplicate command không render lại không cần thiết; state chính xác.
  - Cách kiểm tra: parser/controller tests và MANUAL LED, nguồn LED, servo + LED đồng thời.
  - Điều kiện được tick: LED đúng trạng thái qua command contract, ACK/state đúng, không reset/overheat và power evidence đạt.

- [ ] **[MUST]** Tích hợp firmware foundation và kiểm tra recovery/state reconciliation.
  - File/module dự kiến: toàn bộ `firmware/src/`, integration fixtures, firmware README.
  - Kết quả phải đạt: cold boot áp dụng safe-state policy mà không di chuyển servo; boot → Wi-Fi → MQTT → running; GET_STATE; full state sau reconnect; invalid/duplicate command không làm hỏng loop.
  - Cách kiểm tra: scripted broker messages khi khả thi và MANUAL restart/mất mạng/khôi phục nhiều vòng.
  - Điều kiện được tick: các path thành công/lỗi/recovery có evidence, không có debug secret hoặc temporary instrumentation trong diff.

- [ ] **[MUST]** Hoàn thiện tài liệu Phase 1, review chéo và evidence index.
  - File/module dự kiến: firmware/hardware docs, `tests/test-plan.md`, `tests/evidence/phase-1/`, `PLAN.md`.
  - Kết quả phải đạt: người khác có thể build, wire, flash, reset Wi-Fi và chạy test; evidence liên kết với Test ID.
  - Cách kiểm tra: Minh thực hiện review/reproduction theo README, final diff audit và secret scan.
  - Điều kiện được tick: acceptance đạt, mọi MANUAL test bắt buộc có evidence thật hoặc Phase không được đóng; review comments được giải quyết.

### Tests

Không ghi `PASS` trước khi chạy. Test dùng board/linh kiện/broker/điện thoại thật là `MANUAL`.

| Test ID | Kịch bản | Bước thực hiện | Kết quả mong đợi | Loại | Evidence cần lưu |
|---|---|---|---|---|---|
| P1-A01 | Clean firmware build | Checkout sạch; cài toolchain đúng README; chạy clean/build | Build exit 0 cho đúng board profile; không cần secret thật | Automated | Command, tool versions, full build log |
| P1-A02 | Valid command parser | Feed từng action hợp lệ và required fields | Parse đúng; locker/action/UUID được validate; queue đúng domain | Automated | Test report + fixtures |
| P1-A03 | Invalid JSON/missing field/action | Feed malformed JSON không lấy được ID, rồi payload lấy được valid `command_id` nhưng lỗi field/action | Không actuation; case không có ID không phát normal ACK; case có ID phát correlated `result:error` | Automated | Test report + assertion no-ACK/captured error ACK |
| P1-A04 | Duplicate command | Feed cùng `command_id` hai lần | Actuator handler gọi một lần; cached ACK phát lại với `duplicate:true` | Automated | Assertion/log không chứa secret |
| P1-M01 | Servo không tải | Cấp nguồn đúng; gửi UNLOCK/LOCK nhiều vòng | Góc đúng, không rung/kẹt/reset; ACK/state đúng | MANUAL — HARD-GATE | Video, angle config, current/voltage note |
| P1-M02 | Servo có tải/cơ cấu chốt | Lắp linkage; đóng/mở chốt lặp lại | Khóa/mở cơ khí tin cậy, không vượt travel/quá nhiệt | MANUAL — HARD-GATE | Video, ảnh cơ khí, defect log nếu có |
| P1-M03 | Servo power transient | Quan sát 5 V và ESP32 khi servo khởi động/đảo chiều | Không brownout/MQTT drop; rail trong giới hạn đã chốt | MANUAL — HARD-GATE | Meter/scope photo hoặc đo điện áp + serial/broker log |
| P1-M04 | DHT22 thành công + OLED | Kết nối sensor; chạy qua nhiều chu kỳ | OLED hiển thị nhiệt độ/độ ẩm hợp lý, cập nhật đúng chu kỳ | MANUAL — HARD-GATE | Ảnh OLED + serial diagnostic |
| P1-M05 | DHT22 lỗi/NaN | Tháo hoặc gây lỗi sensor an toàn | OLED hiển thị lỗi; firmware/MQTT không treo; không publish YC1 lên Dashboard | MANUAL — HARD-GATE | Video/ảnh + broker topic capture |
| P1-M06 | LED ON/OFF và nguồn | Gửi LED_ON/OFF, test brightness đã chốt | LED đúng; ACK/state đúng; data/power ổn định | MANUAL — HARD-GATE | Video, current/voltage note |
| P1-M07 | Servo + LED | Chạy servo khi LED đang ON | ESP32/OLED/MQTT ổn định, không flicker/reset bất thường | MANUAL — HARD-GATE | Video + broker/serial log |
| P1-M08 | WiFiManager bằng điện thoại | Xóa config theo hướng dẫn; boot; kết nối AP; nhập Wi-Fi mới | Portal mở; credential lưu cục bộ; Internet/MQTT reconnect không reflash | MANUAL — HARD-GATE | Screen recording đã che SSID/password + broker log |
| P1-M09 | MQTT reconnect/LWT | Ngắt Wi-Fi/broker đột ngột rồi khôi phục | LWT `OFFLINE`; backoff; `ONLINE` + full state sau reconnect | MANUAL — HARD-GATE | Timestamped broker log |
| P1-M10 | ESP32 restart/GET_STATE | Đưa lock về trạng thái đã biết, restart board, quan sát servo; sau online gửi GET_STATE rồi gửi command mới | Restart không di chuyển servo/replay command; cold-boot state là lock UNKNOWN, alarm INACTIVE, LED OFF, door UNKNOWN đến stable sample; chỉ command mới xác nhận LOCKED/UNLOCKED | MANUAL — HARD-GATE | Video servo + broker transcript + serial boot log |
| P1-M11 | Full-state retained semantics | Reconnect subscriber mới sau device online | Nhận retained full state và availability; telemetry door cũ không replay như event | MANUAL — HARD-GATE | Broker subscription capture |

### Acceptance Criteria

Mọi mục trong phần này là `MUST`. `SHOULD`/`OPTIONAL` còn defer không được làm thất bại acceptance nếu Minimum Required Completion Path đã đạt và được ghi trong summary.

- [ ] Repository/toolchain baseline có thể được Minh tái tạo từ tài liệu trên checkout sạch.
- [ ] Pin map, power/wiring guide và MQTT contract v1 đã được Minh review và không còn TBD chặn Phase 2.
- [ ] Firmware clean build và automated parser/state/dedupe tests đã chạy thật, evidence được liên kết.
- [ ] Wi-Fi/MQTT reconnect, LWT, availability và full-state-after-reconnect hoạt động trên board thật.
- [ ] Invalid JSON/action/missing field/locker mismatch không gây actuation; chỉ command có `command_id` hợp lệ mới nhận correlated error ACK, malformed JSON không có ID sẽ timeout/reconcile.
- [ ] CB2 servo LOCK/UNLOCK, ACK/state, duplicate protection, cold-boot no-motion/lock UNKNOWN policy và kiểm thử cơ khí/nguồn bắt buộc đạt.
- [ ] YC1 DHT22/OLED success/error đạt và không có telemetry/card Dashboard ngoài phạm vi.
- [ ] YC3 LED ON/OFF, ACK/state và test nguồn Servo + LED đạt.
- [ ] YC12 captive portal, lưu Wi-Fi, reset configuration và MQTT reconnect đạt bằng điện thoại thật.
- [ ] Không có secret, build output, cache, debug token hoặc kết quả test giả trong diff.
- [ ] Handoff đủ để Minh thêm DoorSensor và Node-RED mà không đổi contract một phía.

### Git Checklist

- [ ] **Terra/owner:** Pull integration branch mới nhất; nếu `develop`/remote chưa tồn tại thì ghi đúng hiện trạng bootstrap, không giả lập remote.
- [ ] **Terra/owner:** Xác nhận Phase 1 đang `ACTIVE`, owner đúng và tạo branch, đề xuất `phase/1-huy-firmware-foundation`.
- [ ] **Terra/owner:** Bảo toàn hai PDF nguồn và mọi user work; không reformat/move ngoài scope.
- [ ] **Terra/owner:** Không có secret trong diff; chạy secret scan phù hợp và kiểm tra file ignore.
- [ ] **Terra/owner:** Build/test phù hợp đã chạy; mọi MANUAL `HARD-GATE` có evidence thật; không ghi PASS giả.
- [ ] **Terra/owner:** `PLAN.md` chỉ cập nhật checklist/status/evidence thực; final diff đã review về scope, artifact, debug output và contract drift.
- [ ] **Terra/owner:** Commit đã tạo với message có Phase/requirement phù hợp; ghi hash thật vào Phase Completion Summary.
- [ ] **Terra/owner, nếu có quyền:** Branch đã push. Nếu không có quyền/remote, để `Pending`, ghi blocker và exact push command cho người dùng; không bịa trạng thái.
- [ ] **Terra/owner, nếu có quyền:** Pull Request đã tạo vào integration branch. Nếu không thể tạo, để `Pending` và ghi exact command/thao tác cần thiết; không bịa URL.
- [ ] **Terra/owner:** Khi mọi `MUST` implementation, automated tests cần thiết và MANUAL `HARD-GATE` đã đạt, evidence/code/docs/Git handoff đủ, chuyển Phase `ACTIVE → READY_FOR_REVIEW`, cập nhật summary rồi dừng; không bắt đầu Phase 2.
- [ ] **Human/reviewer:** Nguyễn Văn Minh đã review; owner/Terra không tự ghi approved.
- [ ] **Owner + reviewer:** Review comments và checks thật đã hoàn tất.
- [ ] **Human/maintainer:** PR đã merge vào integration branch; Terra không tự tick nếu không có Git/PR evidence thật.
- [ ] **Human hoặc phiên agent sau có evidence:** Commit/PR/merge commit thật được ghi vào `PLAN.md`; Phase 1 chuyển `COMPLETED`, Phase 2 chuyển `ACTIVE` và Phase 3 giữ `NOT_STARTED`.

### Handoff

- Người nhận tiếp theo: **Nguyễn Văn Minh — 24127205**.
- Phase tiếp theo: **Phase 2 — CB1, YC6, YC8, YC9 và Node-RED orchestration**.
- Contract phải đọc: Sections 4; `docs/mqtt-contract.md`; pin map; firmware README; command/ACK/error/duplicate/time và cold-boot/Servo safe-state contracts.
- Những phần đã hoàn thành: khi handoff phải liệt kê đúng checklist/evidence thực; baseline hiện chưa có implementation nào hoàn thành.
- Những phần còn MANUAL: mọi Phase 1 `HARD-GATE` phải có evidence trước `READY_FOR_REVIEW`; các full-system case phụ thuộc Node-RED/Supabase/Dashboard được ghi `FINAL-GATE` cho Phase 3, không bị trình bày là đã pass.
- Dependency được mở khóa sau acceptance: firmware buildable; CB2/YC1/YC3/YC12 firmware; MQTT/LWT/state/ACK foundation; pin map; contract v1.
- Dependency vẫn dành cho Phase 3: actual buzzer, event persistence, chart, email và final Dashboard.
- Khi coding/evidence Phase 1 đủ: đặt Phase 1 `READY_FOR_REVIEW`, Phase 2 vẫn `NOT_STARTED`, chuyển handoff cho Minh review và dừng.
- Chỉ sau review approve + PR merge có evidence thật: đặt Phase 1 `COMPLETED`, Phase 2 `ACTIVE`, giữ Phase 3 `NOT_STARTED`.

### Phase Completion Summary

- Status: ACTIVE — automated implementation evidence recorded; Phase cannot leave ACTIVE until every P1-M01–P1-M11 HARD-GATE and required review evidence exists.
- Implementation: Repository baseline; PlatformIO ESP32 Arduino firmware foundation; WiFiManager; MQTT v1 parser/validation/dedupe/ACK/state/LWT/reconnect; CB2 SG90 state machine with cold-boot no-motion; YC1 local DHT22/OLED error display; YC3 WS2812B control; wiring/power/test/docs created. CB1/YC6/YC8/YC9/CB3/YC4/YC5/YC7 were not implemented.
- Automated tests: PASS — P1-A01 clean `esp32dev` build (PlatformIO Core 6.1.18, `espressif32@6.10.0`) and P1-A02/P1-A03/P1-A04 native contract suite 7/7. Evidence: `tests/evidence/phase-1/automated-results.md`.
- Manual HARD-GATE tests: Pending — P1-M01 through P1-M11. No ESP32 serial device, hardware, phone session, or local MQTT broker was available; exact procedures/evidence are in `tests/test-plan.md`.
- Manual FINAL-GATE tests remaining: Section 8 end-to-end/final-system tests remain Phase 3 FINAL-GATE; they have not been executed or claimed.
- Known issues: PlatformIO Core 6.1.18 fails from the current Windows path containing Vietnamese characters; documented ASCII-path build workaround was used. Default Arduino partition build uses 83.7% flash (16.3% remaining). MQTT contract v1/pin map are pending Minh review and physical as-built verification.
- Deferred SHOULD/OPTIONAL items: `boot_id`/sequence telemetry; optional local TLS and broker ACL; conditional WS2812B level shifter/extra bulk capacitance pending physical measurements. No optional scope was used to replace a MUST.
- Branch: `phase/1-huy-firmware-foundation` (local; `origin` has no remote branch heads).
- Commit: `a520372` — `feat(phase-1): add ESP32 firmware foundation` (implementation, automated evidence, and current ACTIVE blocker record).
- PR: Pending — remote reports no branch heads; no PR created or claimed.
- Reviewer: Pending — Nguyễn Văn Minh must review the MQTT contract, baseline, pin map, and handoff.
- Merge commit: Pending — owner/Terra did not approve or merge.
- Next phase: Phase 2 remains NOT_STARTED; do not activate until Phase 1 is reviewed, merged, and marked COMPLETED with real evidence.

## 6. Phase 2 — Nguyễn Văn Minh

### Phase Goal

**Status: NOT_STARTED. Owner: Nguyễn Văn Minh — 24127205. Reviewer: Mai Phương Thùy.**

Chỉ chuyển Phase này sang `ACTIVE` sau khi Phase 1 `COMPLETED`. Triển khai CB1; nền tảng Node-RED authentication/authorization/command orchestration; YC9; logic YC6 và Telegram; YC8 routing/grounding. Tạo interface rõ để Thùy nối actual buzzer và event persistence ở Phase 3, không nhận ownership CB3 hoặc YC4.

### Minimum Required Completion Path

Để Phase 2 chuyển từ `ACTIVE` sang `READY_FOR_REVIEW`, Terra phải hoàn tất các `MUST`: CB1 với debounce và semantics `UNKNOWN` khả thi; Supabase Auth/session/ownership/RLS và frozen auth transport; Node-RED validation + secure dispatcher; pending/ACK/timeout/dedupe/restart recovery; live-state cache; authorized window + unauthorized detector; `UNAUTHORIZED_OPEN`/`ALARM_ON` interface; Telegram path; YC8 live/history adapter contract và grounded failure behavior; MANUAL `HARD-GATE`; regression/evidence/Git handoff. Actual CB3, YC4 persistence và history backend thật vẫn thuộc Phase 3. Không làm `OPTIONAL` trước critical path này.

### Dependencies

- Phase 1 đã merge, handoff có evidence, MQTT contract v1 và pin map đã khóa.
- Firmware build được; Wi-Fi/MQTT/LWT/state/ACK parser foundation hoạt động trên ESP32.
- Supabase development project và hai test account riêng; credential thật chỉ ở local/backend secret store.
- MQTT Broker/Node-RED development environment; Telegram bot và Gemini credential cho MANUAL tests khi được cấp.
- Thùy review normalized event/history adapter contract trước khi Phase 2 merge.
- Phase 2 không được giả actual buzzer ACK hoặc Supabase event persistence là production-complete; các dependency Phase 3 phải được ghi rõ.

### Deliverables

- Firmware `DoorSensor` cho MC-38: logic OPEN/CLOSED và boot/untrusted-state `UNKNOWN`, debounce, transition telemetry, timestamp; sequence/boot ID là `SHOULD`.
- Node-RED modular foundation: MQTT connection, payload validation, availability/state cache, authenticated command dispatcher, pending map, ACK matching, timeout, dedupe và disabled-control state.
- YC9: Supabase Auth register/login/logout/session/JWT; frozen browser → Node-RED access-token transport; profile/locker ownership/claim; RLS; Node-RED token + ownership middleware; test User A/B.
- CB1 Dashboard state `OPEN/CLOSED/UNKNOWN` và updated time.
- YC6: authorized-unlock window, `UNAUTHORIZED_OPEN` event contract, `ALARM_ON` request, latest alert, Telegram delivery/rate-limit/failure handling.
- YC8: question classification, live-state path, history adapter, structured Gemini context do Node-RED tính facts, no-data/failure response. Sophisticated numeric-token validator là `OPTIONAL`.
- Contract và handoff cho Phase 3: normalized event, alarm integration, event persistence input, history query output, notification status.

### Files and Directories to Create or Modify

| Đường dẫn | Nội dung dự kiến |
|---|---|
| `firmware/src/door_sensor.*`, `firmware/include/pin_map.h`, `firmware/src/main.cpp` | MC-38 integration, debounce, telemetry/state |
| `firmware/test/door_sensor/` | Debounce/state-transition tests không cần hardware khi khả thi |
| `node-red/flows.json`, `node-red/package.json`, `node-red/README.md` | Export nguồn FlowFuse/Node-RED, dependency và deploy guide |
| `node-red/test/`, `node-red/fixtures/` | Auth/dispatcher/ACK/YC6/chatbot contract tests, dữ liệu giả chỉ trong test |
| `supabase/migrations/` | Profiles, lockers, claim/ownership và RLS migrations của YC9 |
| `supabase/tests/` | Auth/RLS/ownership test scripts hoặc hướng dẫn integration test |
| `dashboard/README.md`, `dashboard/wireframes/` | Auth, connection/door/basic control and chatbot behavior spec |
| `docs/auth-ownership.md` | Token lifecycle, frozen browser → Node-RED transport, FlowFuse request implementation, claim flow và policy boundaries |
| `docs/event-contract.md`, `docs/chatbot-grounding.md` | Phase 3 interfaces và Gemini rules |
| `tests/evidence/phase-2/`, `tests/test-plan.md` | Test evidence/index cập nhật |
| `PLAN.md` | Status, evidence, handoff, commit/PR thực |

Node-RED flow phải được tổ chức thành tab/subflow có trách nhiệm rõ: authentication/authorization, command dispatcher, ACK processor, telemetry/cache, unauthorized detector, Telegram, history adapter và chatbot. Không đặt toàn bộ logic trong một Function node lớn.

### Implementation Checklist

- [ ] **[MUST]** Re-audit Phase 1 handoff và khóa contract bổ sung với Thùy.
  - File/module dự kiến: `docs/mqtt-contract.md`, `docs/event-contract.md`, fixtures dùng chung.
  - Kết quả phải đạt: Phase 2 không phá payload v1; normalized event, history request/response và alarm request có schema rõ.
  - Cách kiểm tra: producer/consumer walkthrough Huy–Minh–Thùy; contract fixture validation; review change log.
  - Điều kiện được tick: mọi thay đổi contract được version hóa/approve; Thùy xác nhận đủ dữ liệu để làm YC4/YC5/YC7.

- [ ] **[MUST]** Triển khai firmware CB1 cho MC-38 với stable debounce và semantics `UNKNOWN` khả thi.
  - File/module dự kiến: `door_sensor.*`, state manager integration, door tests.
  - Kết quả phải đạt: xác định logic điện thật; ánh xạ stable electrical state sang OPEN/CLOSED; debounce cấu hình hợp lý; chỉ publish stable change; boot trước stable sample là UNKNOWN; không flood event. Không tuyên bố phát hiện dây đứt bằng digital input thường.
  - Cách kiểm tra: automated debounce/boot-state tests và MANUAL reed switch đóng/mở liên tục. Test UNKNOWN bằng boot trước stable sample và Node-RED Offline/stale/invalid-payload scenarios, không dùng tháo dây làm bằng chứng broken-wire detection.
  - Điều kiện được tick: OPEN/CLOSED đúng trên board; UNKNOWN đúng các untrusted-state cases trong Section 4; telemetry/cache/Dashboard đúng contract và evidence đầy đủ.

- [ ] **[MUST]** Xây Node-RED MQTT ingress/egress và payload validation.
  - File/module dự kiến: MQTT/config tab, validation subflows, fixtures.
  - Kết quả phải đạt: subscribe đúng locker topics; reject schema/type/locker/enum sai; không để invalid payload cập nhật cache/UI/persistence.
  - Cách kiểm tra: automated inject valid/invalid ACK/state/door/availability và broker integration test.
  - Điều kiện được tick: validation branches có test/evidence và error log không lộ payload nhạy cảm.

- [ ] **[MUST]** Xây live-state cache và availability/staleness handling.
  - File/module dự kiến: telemetry/cache subflow, context schema, Dashboard state adapter.
  - Kết quả phải đạt: cache theo locker gồm state/source/timestamps/stale; phân biệt MQTT disconnected và device offline. Sau Node-RED restart cache bắt đầu empty/stale, controls disabled cho đến khi MQTT + availability + full state fresh; chỉ lưu boot ID/sequence nếu firmware cung cấp nhất quán (`SHOULD`).
  - Cách kiểm tra: inject retained state, LWT, invalid/missing state, late/duplicate message; restart Node-RED và assert cache stale/controls disabled, MQTT reconnect, retained state/GET_STATE reconciliation rồi mới enable.
  - Điều kiện được tick: stale/offline/restart đưa live state về untrusted, control gates nhận trạng thái đúng và không dùng retained state như bằng chứng online trước freshness confirmation.

- [ ] **[MUST]** Cấu hình Supabase development project và triển khai YC9 Auth register/login/logout/session lifecycle.
  - File/module dự kiến: project/auth settings được tài liệu hóa, Dashboard auth view, Node-RED auth endpoints/subflow, `docs/auth-ownership.md`.
  - Kết quả phải đạt: project URL/redirect/config được nạp qua environment; browser nhận Supabase authenticated session; signup/signin/signout thật; token không log; expiry/refresh behavior rõ; logout xóa session UI. FlowFuse transport thực tế được xác minh và freeze trước protected flows.
  - Cách kiểm tra: MANUAL bằng test account, redirect allowlist, expiry/revocation, browser reload; inspect network để xác nhận canonical `Authorization: Bearer <access_token>` hoặc alternative đã document; inspect log và frontend bundle/config.
  - Điều kiện được tick: register/login/logout/session hoạt động; auth transport duy nhất được ghi trong `docs/auth-ownership.md`; expired token bị từ chối; service-role key không ở frontend.

- [ ] **[MUST]** Triển khai profiles, lockers, one-time claim/ownership và RLS của YC9.
  - File/module dự kiến: versioned Supabase migrations/tests, claim backend/RPC, ownership docs.
  - Kết quả phải đạt: locker pre-provisioned chỉ được claim một lần bằng conditional update/constraint hoặc RPC đơn giản đã xác thực; owner không tự sửa; User A không đọc/claim/control Locker B.
  - Cách kiểm tra: MANUAL/Integration bằng hai account, direct REST query, claim locker chưa có owner, double claim locker đã có owner và unauthenticated cases. Concurrent stress/race harness nâng cao là `OPTIONAL`.
  - Điều kiện được tick: RLS deny đúng ở database, claim thứ hai bị từ chối, frontend dùng anon/publishable key và evidence không chứa PII/secret.

- [ ] **[MUST]** Xây Node-RED authentication middleware và ownership gate cho mọi route/message nhạy cảm.
  - File/module dự kiến: auth/authorization subflows dùng lại cho command, history, chatbot và settings; `docs/auth-ownership.md`.
  - Kết quả phải đạt: middleware chỉ nhận canonical frozen transport; token được Supabase xác minh; user ID lấy từ verified token; client-supplied user ID bị bỏ qua; locker ID luôn ownership-check; deny trước side effect; full JWT không vào log/Gemini.
  - Cách kiểm tra: automated matrix cho missing/malformed/expired Bearer token, spoofed `user_id`, User A–Locker B và valid owner; MANUAL FlowFuse request; broker capture xác nhận deny không publish.
  - Điều kiện được tick: unauthenticated nhận 401, wrong owner 403, session expired disable UI, không có bypass hoặc auth mechanism song song và transport khớp tài liệu.

- [ ] **[MUST]** Xây command dispatcher, command ID generation và pending-command store.
  - File/module dự kiến: command dispatcher subflow, pending context, Dashboard response adapter.
  - Kết quả phải đạt: user request kiểm tra auth/ownership/MQTT/device/stale/conflict; trusted YC6 automation chỉ đi qua internal allowlisted entrypoint; sinh UUID/timestamp/requested_by; publish đúng topic; lưu deadline.
  - Cách kiểm tra: automated matrix cho từng user gate, attempt gọi automation entrypoint từ ngoài, internal ALARM_ON, concurrent domains và conflicting actions; inspect broker output.
  - Điều kiện được tick: chỉ user/internal request đủ điều kiện được publish, không có public auth bypass, mỗi request có command ID duy nhất và control pending đúng domain.

- [ ] **[MUST]** Xây ACK processor, matching, timeout, duplicate/late ACK handling và reconciliation.
  - File/module dự kiến: ACK subflow, timeout scheduler, completed-command cache.
  - Kết quả phải đạt: match ID/locker/action/schema; cancel đúng timer; wrong/late ACK không báo success; timeout ghi event interface và GET_STATE một lần. Restart clear pending, không restore/replay command; ACK cũ sau restart không thể báo success.
  - Cách kiểm tra: automated valid ACK, wrong ID, wrong locker/state, duplicate, late ACK, no ACK; restart với command pending rồi feed ACK cũ và kiểm tra GET_STATE/state reconciliation.
  - Điều kiện được tick: Dashboard chỉ success sau valid ACK của pending runtime hiện tại; restart không resurrect request; không auto-retry actuator; timeout/reconcile có evidence.

- [ ] **[MUST]** Hoàn thiện CB1 Dashboard và shared disabled-control behavior.
  - File/module dự kiến: FlowFuse Dashboard state widgets, connection/door view, UI state adapter.
  - Kết quả phải đạt: hiển thị ESP32/MQTT riêng, door OPEN/CLOSED/UNKNOWN và update time; lock UNKNOWN có nhãn chưa xác nhận; control disable đúng sáu điều kiện Section 4, bao gồm recovery sau Node-RED restart.
  - Cách kiểm tra: MANUAL desktop/mobile và automated state-model inputs khi khả thi.
  - Điều kiện được tick: UI không hiển thị stale data như live, không success trước ACK và CB1 end-to-end có evidence.

- [ ] **[MUST]** Triển khai authorized-unlock window và unauthorized-open detector của YC6.
  - File/module dự kiến: security detector subflow, per-locker window/episode state, test fixtures.
  - Kết quả phải đạt: window chỉ mở bởi valid UNLOCK ACK; consume/expire/cancel đúng; Node-RED restart clear window và không restore; door locked/lock UNKNOWN/outside window tạo authorized=false một lần.
  - Cách kiểm tra: automated timeline gồm boundary, duplicate telemetry, restart sau valid UNLOCK ACK rồi OPEN, lock ACK và multiple lockers.
  - Điều kiện được tick: classification deterministic theo Section 4 và không có repeated alert trong cùng door-open episode.

- [ ] **[MUST]** Phát `UNAUTHORIZED_OPEN` interface và `ALARM_ON` request mà không nhận ownership CB3/YC4.
  - File/module dự kiến: event emitter/dispatcher adapter, `docs/event-contract.md`.
  - Kết quả phải đạt: event đủ source/result/authorized/state/time; alarm đi qua cùng dispatcher/pending/ACK contract; có hook cho Phase 3.
  - Cách kiểm tra: automated contract consumer/harness xác nhận event và command output; không tuyên bố buzzer/persistence thật.
  - Điều kiện được tick: Thùy review/accept interface, Phase 2 evidence ghi rõ CB3/YC4 integration vẫn pending Phase 3.

- [ ] **[MUST]** Triển khai Telegram notification, dedupe/rate-limit và failure handling cho YC6.
  - File/module dự kiến: Telegram subflow, notification status adapter, settings lookup interface.
  - Kết quả phải đạt: message có locker code, local display time, door/lock state, Dashboard link; token không log; lỗi không làm crash detector.
  - Cách kiểm tra: MANUAL bot thật cho success/invalid token/network failure; automated duplicate episode/rate-limit tests.
  - Điều kiện được tick: một cảnh báo/episode theo policy, delivery status hiện rõ, failure có evidence và không làm mất normalized event.

- [ ] **[MUST]** Triển khai YC8 classifier, live-state/history routing và Gemini grounding.
  - File/module dự kiến: chatbot subflows, history adapter, prompt/context builder, `docs/chatbot-grounding.md`.
  - Kết quả phải đạt: câu live lấy cache; câu history dùng adapter Supabase; Node-RED tính facts/counts; context không có JWT/secret; Gemini chỉ diễn đạt.
  - Cách kiểm tra: automated route/context snapshots, verify Node-RED facts/counts xuất hiện đúng trong structured context, missing-data/provider-error fixtures; MANUAL Gemini live credential. Numeric-token validator tinh vi chỉ là `OPTIONAL`.
  - Điều kiện được tick: live query thật đạt; history adapter contract đạt; no-data/failure trả lời kiểm soát; prompt buộc Gemini chỉ diễn đạt facts, không tự tạo số liệu. Không cần blocker là một validator phức tạp.

- [ ] **[MUST]** Hoàn thiện Phase 2 documentation, regression, review và handoff Phase 3.
  - File/module dự kiến: Node-RED/Supabase/dashboard docs, test evidence/index, `PLAN.md`.
  - Kết quả phải đạt: Thùy có thể nối buzzer, event persistence, chart/email/final Dashboard mà không sửa ngầm contract.
  - Cách kiểm tra: Thùy review/reproduce key tests, final diff/secret/generated-flow audit và Phase 1 regression.
  - Điều kiện được tick: acceptance/evidence đạt; pending MANUAL/Phase 3 dependencies được liệt kê trung thực; review comments xử lý.

### Tests

| Test ID | Kịch bản | Bước thực hiện | Kết quả mong đợi | Loại | Evidence cần lưu |
|---|---|---|---|---|---|
| P2-A01 | Door debounce timeline | Feed bounce sequences quanh threshold | Một stable transition, không event giả; boundary xác định | Automated | Test report + input timeline |
| P2-M01 | MC-38 OPEN/CLOSED | Tác động reed switch/nam châm thật | Stable electrical states ánh xạ đúng; telemetry, cache và Dashboard đúng state/time | MANUAL — HARD-GATE | Video + broker/Dashboard capture |
| P2-M02 | MC-38 debounce và UNKNOWN khả thi | Toggle nhanh; boot trước stable sample; tạo Offline/stale hoặc inject invalid/missing state payload | Debounce lọc bounce; OPEN/CLOSED từ input ổn định; cache/Dashboard dùng UNKNOWN khi live state không đáng tin | MANUAL — HARD-GATE | Video/log + cache/UI capture; ghi rõ không test broken-wire detection |
| P2-A02 | Invalid MQTT payload | Inject malformed JSON/schema/enum/locker | Reject; cache/UI/event interface không đổi | Automated | Flow test output |
| P2-A03 | Auth transport/ownership command gates | Gửi canonical Bearer token valid/missing/malformed/expired, spoof `user_id`, wrong owner, offline và MQTT down | Node-RED dùng verified token identity; 401/403/unavailable phù hợp; không publish khi deny; không auth bypass/song song | Automated | Request fixtures + broker spy + redacted log assertion |
| P2-M03 | Register/login/logout/session + FlowFuse transport | Dùng Supabase test account thật; inspect request protected từ Dashboard qua login/refresh/logout | Browser session và frozen token transport đúng tài liệu; logout/expiry disable control; full JWT không log | MANUAL — HARD-GATE | Screen/network capture đã redact PII/token |
| P2-M04 | User A đọc/điều khiển Locker B | Hai account/locker thật, thử UI và API trực tiếp | RLS/read deny; command gate deny; MQTT không có command | MANUAL — HARD-GATE | Sanitized request/result + broker capture |
| P2-M05 | Locker one-time/double claim | Claim locker chưa có owner, sau đó claim lại cùng code bằng user khác | Chỉ owner đầu tiên thành công; owner ID không sửa từ client | MANUAL — HARD-GATE | Sanitized DB/API evidence |
| P2-A04 | Command dispatcher valid | Request hợp lệ với live device | UUID sinh server-side; pending lưu; payload đủ năm field | Automated | Captured command + assertions |
| P2-A05 | Pending conflict | Gửi LOCK và UNLOCK cùng locker/domain khi pending | Command sau bị reject/disabled; domain khác theo policy không bị sai | Automated | Flow test output |
| P2-A06 | Valid ACK | Feed ACK khớp pending | Timer cancel; state/cache/UI success; event output đúng | Automated | ACK fixture + result snapshot |
| P2-A07 | ACK + Node-RED restart recovery | Feed wrong/duplicate/late ACK; restart khi pending, feed ACK cũ, then inject MQTT/availability/full-state recovery | Restart clear pending, cache empty/stale và controls disabled; ACK cũ không resurrect request; chỉ fresh state/reconciliation mới re-enable; diagnostic/dedupe đúng | Automated | Flow test report + state-gate assertions |
| P2-A08 | Timeout | Không feed ACK đến hết deadline | Timeout; không auto-retry actuator; GET_STATE một lần; UI error | Automated | Virtual-clock/timestamped output |
| P2-A09 | Authorized window + restart | Case A: UNLOCK ACK rồi OPEN trước deadline; Case B: UNLOCK ACK, restart Node-RED rồi OPEN | A tạo `DOOR_OPENED authorized=true` và consume window; B không restore window, phân loại unauthorized theo fail-safe | Automated | Timeline + normalized events + restart assertions |
| P2-A10 | Unauthorized OPEN | OPEN khi LOCKED/ngoài window | `authorized=false`; một `UNAUTHORIZED_OPEN`; ALARM_ON request | Automated | Event + command capture |
| P2-A11 | Alert duplicate/rate-limit | Replay same sequence/keep OPEN | Không tạo Telegram/alarm request lặp trong episode | Automated | Invocation counts |
| P2-M06 | Telegram thành công | Dùng bot/chat ID thật, gây unauthorized event an toàn | Một message đúng locker/time/states/link | MANUAL — FINAL-GATE | Screenshot đã che chat ID nếu cần + delivery log |
| P2-M07 | Telegram thất bại | Dùng controlled invalid credential/network case | Detector/event vẫn hoạt động; status failure rõ; không crash/retry vô hạn | MANUAL — FINAL-GATE | Sanitized error/status log |
| P2-A12 | Chatbot live/missing/error route | Feed live cache, empty cache, provider error | Structured facts đúng; no-data/error deterministic | Automated | Context snapshots không secret |
| P2-A13 | Chatbot history contract | Feed history adapter response với counts/events | Structured context chứa đúng facts/counts; instruction không cho model tự tính hoặc tạo số | Automated | Adapter fixture + deterministic context assertions |
| P2-M08 | Gemini live API | Hỏi state thật qua Dashboard | Câu trả lời bám cache; không lộ token/JWT; failure UI kiểm soát | MANUAL — FINAL-GATE | Sanitized UI/API evidence |

### Acceptance Criteria

Mọi mục trong phần này là `MUST`. External-service `FINAL-GATE` có thể còn `Pending` khi Phase 2 handoff nếu credential/dependency thật chưa sẵn sàng, nhưng implementation/contract test tương ứng phải đạt và test thật bắt buộc hoàn tất trước final release. `SHOULD`/`OPTIONAL` không block acceptance.

- [ ] Phase 1 regression còn đạt và shared contract không bị đổi một phía.
- [ ] CB1 đọc/debounce/publish OPEN/CLOSED end-to-end; UNKNOWN dùng đúng cho boot/uninitialized/Offline/stale/invalid state, không tuyên bố phát hiện dây đứt ngoài khả năng phần cứng.
- [ ] Node-RED validate mọi MQTT ingress trước cache/UI/event side effect.
- [ ] YC9 register/login/logout/session/JWT, frozen Supabase access-token transport, ownership/claim và RLS hoạt động với hai user; verified token là nguồn user ID duy nhất; service-role key không ở frontend.
- [ ] Command dispatcher kiểm tra auth/ownership cho user request; internal YC6 entrypoint không public, allowlisted/audited; cả hai kiểm tra MQTT, device freshness và pending conflict trước publish.
- [ ] ACK matching, wrong ID, timeout, duplicate/late ACK và GET_STATE reconciliation đạt; Node-RED restart clear pending/cache freshness và ACK cũ không tạo success.
- [ ] Authorized window đúng 30 giây mặc định/cấu hình; Node-RED restart không restore window; unauthorized event phát một lần/episode.
- [ ] YC6 phát đúng `UNAUTHORIZED_OPEN` và `ALARM_ON` interface; Telegram adapter, payload, dedupe/rate-limit và controlled failure có automated/integration evidence. P2-M06/P2-M07 với dịch vụ thật có thể còn `FINAL-GATE` nhưng phải hoàn tất trước final release.
- [ ] Tài liệu nói rõ actual buzzer CB3 và Supabase persistence YC4 chưa được Phase 2 tuyên bố hoàn tất.
- [ ] YC8 live route, history adapter contract, structured context do Node-RED tính facts, no-data và controlled Gemini failure đạt; model được giới hạn ở diễn đạt dữ liệu, không phụ thuộc numeric validator tinh vi. P2-M08 dùng Gemini thật có thể còn `FINAL-GATE` nhưng phải hoàn tất trước final release.
- [ ] Thùy review event/history/alarm interfaces và có đủ dependency để bắt đầu Phase 3.
- [ ] Không có secret, production mock data, token/JWT trong log/evidence hoặc implementation result giả.

### Git Checklist

- [ ] **Terra/owner:** Pull integration branch mới nhất; xác minh bằng Git evidence rằng Phase 1 `COMPLETED`, Phase 2 `ACTIVE` và handoff contract có thật.
- [ ] **Terra/owner:** Xác nhận owner Nguyễn Văn Minh và tạo branch, đề xuất `phase/2-minh-security-orchestration`.
- [ ] **Terra/owner:** Không có secret trong diff; kiểm tra Node-RED credentials/export và Supabase config đặc biệt kỹ.
- [ ] **Terra/owner:** Build/test phù hợp đã chạy; firmware regression + Node-RED/Auth/RLS/dispatcher/YC6/YC8 contract tests được ghi đúng.
- [ ] **Terra/owner:** MANUAL `HARD-GATE` dùng account/board thật có evidence đã che token, PII và credential; `FINAL-GATE` còn lại được ghi `Pending`, không giả PASS.
- [ ] **Terra/owner:** `PLAN.md` cập nhật tối thiểu; final diff không nhận ownership CB3/YC4 và không đổi frozen contract thiếu version/review.
- [ ] **Terra/owner:** Commit đã tạo; hash thật được ghi vào Phase Completion Summary.
- [ ] **Terra/owner, nếu có quyền:** Branch đã push; nếu không, để `Pending`, ghi blocker và exact push command.
- [ ] **Terra/owner, nếu có quyền:** Pull Request đã tạo; nếu không, để `Pending` và ghi exact command/thao tác cần thiết.
- [ ] **Terra/owner:** Khi mọi `MUST` implementation, automated tests cần thiết và MANUAL `HARD-GATE` đạt, evidence/code/docs/Git handoff đủ, chuyển Phase `ACTIVE → READY_FOR_REVIEW`, cập nhật summary rồi dừng; không bắt đầu Phase 3.
- [ ] **Human/reviewer:** Mai Phương Thùy đã review; owner/Terra không tự ghi approved.
- [ ] **Owner + reviewer:** Review comments/checks thật đã hoàn tất.
- [ ] **Human/maintainer:** PR đã merge; Terra không tự tick nếu không có Git/PR evidence thật.
- [ ] **Human hoặc phiên agent sau có evidence:** Commit/PR/merge commit thật được ghi vào `PLAN.md`; Phase 2 chuyển `COMPLETED`, Phase 3 chuyển `ACTIVE`.

### Handoff

- Người nhận tiếp theo: **Mai Phương Thùy — 24127249**.
- Phase tiếp theo: **Phase 3 — CB3, YC4, YC5, YC7 và final integration**.
- Contract phải đọc: MQTT v1; normalized event; alarm request/ACK; Supabase Auth Transport + ownership; Node-RED restart recovery; state cache; history adapter; timezone/counting; Telegram status.
- Những phần đã hoàn thành: khi handoff liệt kê đúng evidence cho CB1/YC9/dispatcher/YC6 logic/YC8 routing; baseline hiện chưa có implementation.
- Những phần còn MANUAL: liệt kê `FINAL-GATE` Telegram/Gemini nếu credential chưa có; actual CB3 buzzer, YC4 insert/RLS, actual history route, chart/email/full load/final demo thuộc Phase 3. Không dùng pending external credential để giả integration đã pass.
- Dependency được mở khóa: door telemetry; secure dispatcher; pending/ACK/timeout; cache; auth/RLS; unauthorized event + ALARM_ON; Telegram; chatbot context adapter.
- Dependency Phase 3 phải hoàn thiện: CB3 firmware/hardware, event schema/persistence, history query thật, YC6 full integration, YC5, YC7, final Dashboard/docs/regression.
- Khi coding/evidence Phase 2 đủ: đặt Phase 2 `READY_FOR_REVIEW`, Phase 3 vẫn `NOT_STARTED`, chuyển handoff cho Thùy review và dừng.
- Chỉ sau review approve + PR merge có evidence thật: đặt Phase 2 `COMPLETED`, Phase 3 `ACTIVE`; không đổi owner YC6/YC8 sang Thùy.

### Phase Completion Summary

- Status: Pending
- Implementation: Pending
- Automated tests: Pending
- Manual HARD-GATE tests: Pending
- Manual FINAL-GATE tests remaining: Pending
- Known issues: Pending
- Deferred SHOULD/OPTIONAL items: Pending
- Branch: Pending
- Commit: Pending
- PR: Pending
- Reviewer: Pending
- Merge commit: Pending
- Next phase: Pending

## 7. Phase 3 — Mai Phương Thùy

### Phase Goal

**Status: NOT_STARTED. Owner: Mai Phương Thùy — 24127249. Reviewer: Thái Quang Huy.**

Chỉ chuyển Phase này sang `ACTIVE` sau khi Phase 2 `COMPLETED`. Triển khai CB3, YC4, YC5, YC7; nối actual buzzer và Supabase persistence vào YC6; nối history thật vào YC8; hoàn thiện Dashboard, full-system integration, regression, tài liệu, demo và release checklist. Không nhận ownership YC6/YC8 từ Minh.

### Minimum Required Completion Path

Để Phase 3 chuyển từ `ACTIVE` sang `READY_FOR_REVIEW`, Terra phải hoàn tất mọi `MUST` implementation: CB3; YC4 schema/persistence/history/RLS; YC5 chart 7/30; YC7 settings/scheduler/report/dedupe; nối full YC6 với buzzer + persistence; nối full YC8 history backend; final Dashboard; automated tests cần thiết; mọi MANUAL `HARD-GATE`; evidence/code/docs và Git handoff. Không làm `OPTIONAL` trước committed scope; Phase 3 không có Phase 4 để đẩy core implementation sang.

MANUAL `FINAL-GATE`, Section 8 E2E, full-load và release tests có thể còn `Pending` tại `READY_FOR_REVIEW` nếu được ghi trung thực trong Phase Completion Summary. Chúng tuyệt đối block `READY_FOR_REVIEW → COMPLETED` và final release; chỉ sau human approval, PR merge, toàn bộ mandatory final tests cùng final acceptance đạt mới được đặt Phase 3 `COMPLETED`.

### Dependencies

- Phase 1 và Phase 2 đã merge với acceptance/evidence thực; Phase 3 được đặt `ACTIVE`.
- MQTT/event/auth/history/time/counting contracts đã khóa và Thùy đã review ở Phase 2.
- Active Buzzer module, MOSFET/protection/power wiring thật; Huy review power/pin implications.
- Supabase project/schema YC9, Node-RED secure dispatcher/cache, test users/lockers.
- Telegram/Gmail/Gemini/MQTT/Supabase credentials cho MANUAL tests ở secret store; không commit.
- Dashboard endpoint và report recipients/test mailbox đã xác nhận.

### Deliverables

- CB3 Active Buzzer firmware/hardware, configurable polarity, `ALARM_ON/OFF`, ACK/full state và Dashboard Test/Stop Alarm.
- YC4 versioned event schema, RLS/indexes, Node-RED persistence pipeline, recent/history queries và explicit failure behavior.
- YC5 aggregation/chart 7/30 ngày, empty/loading/error state và timezone-correct boundaries.
- YC7 notification settings, scheduler, daily aggregation, Gmail delivery, delivery log và duplicate-send prevention.
- YC6 hoàn chỉnh: actual alarm ACK/state + persisted unauthorized event + Telegram/latest alert.
- YC8 history adapter nối Supabase thật và regression grounding.
- Final FlowFuse Dashboard cho auth, availability, all states/controls/pending/error/history/chart/chatbot/settings.
- Full test plan/results/evidence, user guide, deployment guide, troubleshooting, demo script và release checklist.

### Files and Directories to Create or Modify

| Đường dẫn | Nội dung dự kiến |
|---|---|
| `firmware/src/alarm_controller.*`, `firmware/src/main.cpp`, config/pin files | CB3 buzzer, polarity, state/ACK integration |
| `firmware/test/alarm_controller/` | Controller/dedupe/state tests khi không cần hardware |
| `supabase/migrations/` | Device events, notification settings/deliveries, indexes, RLS, query/RPC migrations |
| `supabase/tests/` | RLS, aggregation, dedupe/idempotency/timezone tests |
| `node-red/flows.json`, `node-red/README.md`, `node-red/test/` | Persistence/history/chart/email/final integration flows/tests |
| `dashboard/README.md`, `dashboard/assets/` | Final UI behavior/assets; không chứa mock production data |
| `hardware/wiring-diagram/`, `hardware/assembly-guide.md` | Buzzer/MOSFET/full-load wiring và assembly final |
| `tests/test-plan.md`, `tests/test-cases.*`, `tests/evidence/phase-3/`, `tests/traceability.md` | System/security/reliability/regression evidence |
| `docs/database-design.md`, `docs/user-guide.md`, `docs/deployment-guide.md`, `docs/troubleshooting.md`, `docs/demo-script.md` | Tài liệu cuối |
| `README.md`, `PLAN.md` | Quick start/status/release evidence thực |

### Implementation Checklist

- [ ] **[MUST]** Re-audit handoff, contract và unresolved hardware/service questions trước khi chỉnh integration.
  - File/module dự kiến: `PLAN.md`, contract docs, risk/open-question log.
  - Kết quả phải đạt: Phase 3 biết rõ schema/topic/counting/timezone/pending semantics; không sửa interface âm thầm.
  - Cách kiểm tra: walkthrough với Huy/Minh và chạy Phase 1/2 smoke/regression baseline.
  - Điều kiện được tick: dependency thật sẵn sàng, blocker được ghi, contract change nếu có được version hóa/approve.

- [ ] **[MUST]** Xác nhận Active Buzzer polarity, driver/MOSFET và power wiring an toàn.
  - File/module dự kiến: pin/config, wiring diagram, power guide.
  - Kết quả phải đạt: active-high/low cấu hình; safe default INACTIVE khi boot; GPIO không cấp dòng tải; common ground/protection đúng.
  - Cách kiểm tra: MANUAL đo logic/điện áp/dòng, boot/restart, disconnected control và buzzer duration an toàn.
  - Điều kiện được tick: Huy review wiring, không alarm ngoài ý muốn khi boot, hardware evidence đầy đủ.

- [ ] **[MUST]** Triển khai CB3 `ALARM_ON`/`ALARM_OFF`, non-blocking control, ACK và state.
  - File/module dự kiến: `alarm_controller.*`, command/state/ACK integration, tests.
  - Kết quả phải đạt: command hợp lệ điều khiển đúng; duplicate không toggle lại; invalid không actuation; full state phản ánh ACTIVE/INACTIVE.
  - Cách kiểm tra: automated controller/duplicate tests và MANUAL MQTT command/hardware.
  - Điều kiện được tick: CB3 firmware/hardware lặp lại ổn định, không treo/reset và ACK/state đúng contract.

- [ ] **[MUST]** Hoàn thiện Dashboard Test Alarm/Stop Alarm qua secure dispatcher.
  - File/module dự kiến: FlowFuse control widgets/state adapter, existing dispatcher/ACK flows.
  - Kết quả phải đạt: control auth/ownership/online/pending gates; processing; success chỉ sau ACK; timeout/error rõ.
  - Cách kiểm tra: MANUAL valid/unauthorized/offline/timeout/duplicate scenarios và broker capture.
  - Điều kiện được tick: CB3 end-to-end đạt, không có Dashboard → MQTT direct path.

- [ ] **[MUST]** Thiết kế và migrate YC4 event schema/index/idempotency/RLS.
  - File/module dự kiến: versioned Supabase migrations, database design, RLS tests.
  - Kết quả phải đạt: lưu đầy đủ event contract; event ID/unique rule chống insert trùng; indexes hỗ trợ locker/time/type query; RLS owner-only.
  - Cách kiểm tra: apply các migration có thứ tự trên dev sạch, schema diff, two-user RLS tests, duplicate insert và query thực tế. Migration framework/rollback automation/query-plan tuning nâng cao là `SHOULD/OPTIONAL`.
  - Điều kiện được tick: setup schema dev tái lập được bằng các script đơn giản, policy tests đạt, không dùng production dump/secret và Huy review design.

- [ ] **[MUST]** Xây Node-RED YC4 event persistence pipeline và failure handling.
  - File/module dự kiến: event persistence subflow, error/status output và tests; không cần dead-letter infrastructure.
  - Kết quả phải đạt: insert door/lock/alarm/LED/unauthorized/device/timeout events; idempotent theo event ID; lỗi được log/surface an toàn và không crash/loop. Bounded retry nhỏ cho transient error là `SHOULD`; dead-letter queue/service và retry framework nâng cao là `OPTIONAL`.
  - Cách kiểm tra: automated event matrix, duplicate, 4xx validation failure, 5xx/network failure và recovery; MANUAL Supabase thật.
  - Điều kiện được tick: success lưu đúng; failure không bị nuốt/loop vô hạn; UI/diagnostic phản ánh persistence health và evidence có thật.

- [ ] **[MUST]** Hoàn thiện recent events và history query có ownership/RLS.
  - File/module dự kiến: Supabase query/RPC migration, Node-RED history subflow, Dashboard recent/history views.
  - Kết quả phải đạt: recent list newest-first có bounded limit; filter locker/time/type; không cross-owner; empty/loading/error rõ. Pagination đầy đủ là `SHOULD` nếu không cần cho demo dataset.
  - Cách kiểm tra: seeded test data qua test setup, User A/B, boundary timestamps, no-data và Supabase failure.
  - Điều kiện được tick: query trả đúng dữ liệu thật, UI không leak Locker B và test cleanup được kiểm soát.

- [ ] **[MUST]** Triển khai YC5 aggregation và chart 7/30 ngày theo counting/timezone contract.
  - File/module dự kiến: aggregation query/RPC, chart subflow/widgets, tests.
  - Kết quả phải đạt: DOOR_OPENED và UNAUTHORIZED_OPEN counts đúng; đủ bucket ngày kể cả zero; filter 7/30; local timezone boundaries.
  - Cách kiểm tra: deterministic dataset quanh midnight/UTC boundary, empty/multiple-event days, compare expected counts.
  - Điều kiện được tick: chart/query/chatbot/report dùng cùng counting utility/contract và 7/30 MANUAL UI evidence đạt.

- [ ] **[MUST]** Triển khai notification settings với ownership/RLS.
  - File/module dự kiến: settings table/policies, settings API/subflow, Dashboard settings.
  - Kết quả phải đạt: Telegram/email enable, chat ID/email/report time/timezone được validate; chỉ owner đọc/sửa; secret token không nằm trong row/frontend.
  - Cách kiểm tra: User A/B, invalid time/timezone/address, session expiry và reload.
  - Điều kiện được tick: settings persist đúng, RLS deny cross-owner và UI không hiển thị credential backend.

- [ ] **[MUST]** Triển khai YC7 scheduler, daily aggregation và email rendering.
  - File/module dự kiến: scheduler/report aggregator/email subflows, email template/docs.
  - Kết quả phải đạt: đúng report period local ngày trước; số lần mở/cảnh báo/latest activity từ data; email nêu khoảng thời gian/timezone.
  - Cách kiểm tra: virtual/injected schedule automated test với deterministic events và email transport adapter; MANUAL Gmail test mailbox được theo dõi riêng ở P3-M06 `FINAL-GATE`.
  - Điều kiện được tick cho implementation handoff: subject/body/recipient/counts, owner scope và controlled provider-failure path đạt bằng automated/integration evidence; P3-M06 có thể còn `Pending` nhưng block `COMPLETED`.

- [ ] **[MUST]** Chống gửi email trùng và lưu delivery log idempotent.
  - File/module dự kiến: notification delivery migration, dedupe/scheduler subflow, tests.
  - Kết quả phải đạt: unique dedupe key đơn giản theo locker + local report date + channel; trigger lặp/restart chỉ tạo một send intent/success. Distributed scheduler coordination là `OPTIONAL`.
  - Cách kiểm tra: fire scheduler hai lần, restart Node-RED giữa các bước, provider success/failure và retry policy hữu hạn nếu có.
  - Điều kiện được tick: không gửi trùng, log status/time/error đúng và retry không biến lỗi permanent thành loop.

- [ ] **[MUST]** Nối YC6 với actual buzzer và event persistence mà giữ Minh là owner YC6.
  - File/module dự kiến: unauthorized detector adapters, dispatcher, persistence, latest alert, Dashboard.
  - Kết quả phải đạt: unauthorized transition → one event → ALARM_ON → valid ACK/ACTIVE → Telegram/latest alert; persistence failure không ngăn cảnh báo vật lý.
  - Cách kiểm tra: deterministic/injected integration cho buzzer ACK/timeout, Telegram/Supabase success/failure và dedupe episode; MANUAL full scenario P3-M07/P3-M08 là `FINAL-GATE`.
  - Điều kiện được tick cho implementation handoff: adapters/wiring logic và automated/integration matrix có evidence, `authorized=false` mapping đúng, không duplicate alarm/alert; P3-M07/P3-M08 có thể còn `Pending` nhưng block `COMPLETED`.

- [ ] **[MUST]** Nối YC8 history adapter vào Supabase thật và regression grounding.
  - File/module dự kiến: history adapter, chatbot tests, Dashboard chatbot.
  - Kết quả phải đạt: live từ cache, history/counts từ query; context có provenance/time range; Gemini không nhận secret/JWT hoặc tự tính facts.
  - Cách kiểm tra: automated assertions cho query result, structured facts/provenance/time range, prompt boundary, no-data/provider error; MANUAL live Gemini P3-M09 là `FINAL-GATE`. Sophisticated numeric validator là `OPTIONAL`.
  - Điều kiện được tick cho implementation handoff: history query/context/owner filter và deterministic no-data/error behavior đạt; P3-M09 có thể còn `Pending` nhưng block `COMPLETED`; không cần output-validation framework phức tạp.

- [ ] **[MUST]** Hoàn thiện toàn bộ FlowFuse Dashboard và responsive/interaction states.
  - File/module dự kiến: all Dashboard tabs/widgets, dashboard docs/assets.
  - Kết quả phải đạt: Online/Offline, OPEN/CLOSED/UNKNOWN, LOCKED/UNLOCKED, ACTIVE/INACTIVE, LED ON/OFF, pending/timeout/error, recent/history/chart/chatbot/settings.
  - Cách kiểm tra: state-model/integration checks cho auth expiry, wrong owner, broker/device offline và every control path; MANUAL desktop + phone P3-M10 là `FINAL-GATE`.
  - Điều kiện được tick cho implementation handoff: UI bám wireframe/phạm vi, không có YC1 card/mock data, disabled controls đúng và accessibility cơ bản đủ dùng theo review khả dụng; P3-M10 có thể còn `Pending` nhưng block `COMPLETED`.

- [ ] **[MUST]** Hoàn thiện full-system test plan/harness, chạy automated/HARD-GATE và quản lý FINAL-GATE execution.
  - File/module dự kiến: `tests/` plan/cases/evidence, defect log, firmware/flow regression.
  - Kết quả phải đạt để vào `READY_FOR_REVIEW`: test plan/harness hoàn chỉnh, automated tests và MANUAL `HARD-GATE` đạt, mọi `FINAL-GATE` chưa chạy được liệt kê `Pending` với bước/evidence/blocker cụ thể. Trước `COMPLETED`: toàn bộ Section 8/full-load/release tests đạt, Critical/High = 0; Medium có workaround/decision rõ.
  - Cách kiểm tra: trước review, audit automated/HARD-GATE output và danh sách FINAL-GATE pending; trước completion, chạy test session với hardware/accounts thật, fault injection có kiểm soát và final evidence audit.
  - Điều kiện được tick cho implementation handoff: plan/harness + automated/HARD-GATE + pending record đầy đủ, không ghi giả. Các test row/acceptance `FINAL-GATE` vẫn để unticked cho đến khi chạy thật và tiếp tục block `COMPLETED`; defects được triage và affected regression rerun.

- [ ] **[MUST]** Hoàn thiện user/deployment/troubleshooting/demo documents và release checklist.
  - File/module dự kiến: docs cuối, README, test traceability, `PLAN.md`.
  - Kết quả phải đạt: người khác deploy/use/demo/recover được; secret provisioning và backup/export được mô tả an toàn.
  - Cách kiểm tra: trước handoff, self/cross-check docs với implementation và final diff; Huy reviewer/reproduction cùng rehearsal P3-M12 diễn ra ở review/`FINAL-GATE`.
  - Điều kiện được tick cho implementation handoff: docs/traceability/release checklist đã hoàn chỉnh, liên kết evidence hiện có và ghi rõ final evidence còn `Pending`; reviewer/PR/rehearsal không được ghi hoàn tất trước bằng chứng thật và vẫn block `COMPLETED` khi bắt buộc.

### Tests

| Test ID | Kịch bản | Bước thực hiện | Kết quả mong đợi | Loại | Evidence cần lưu |
|---|---|---|---|---|---|
| P3-A01 | Alarm controller valid/duplicate/invalid | Feed ALARM_ON/OFF, duplicate ID, invalid action | State/ACK đúng; duplicate không actuation; invalid an toàn | Automated | Test report + ACK fixtures |
| P3-M01 | Buzzer active polarity/boot | Boot/restart, bật/tắt qua command | Boot INACTIVE; ON/OFF đúng; không treo/reset | MANUAL — HARD-GATE | Video + wiring/voltage note |
| P3-M02 | Dashboard Test/Stop Alarm | Login owner, thao tác control | Pending → ACK success → ACTIVE/INACTIVE; không direct MQTT | MANUAL — HARD-GATE | UI + broker + hardware video |
| P3-A02 | Event persistence matrix | Feed mọi canonical event type | Mapping đầy đủ; required fields; idempotent insert | Automated | DB assertions/test report |
| P3-M03 | Supabase insert thành công | Chạy door/lock/alarm/LED/unauthorized thật | Rows đúng locker/source/result/authorized/command/time | MANUAL — HARD-GATE | Sanitized query export/screenshot |
| P3-A03 | Supabase duplicate/failure | Insert same event ID; inject 4xx/5xx/network | Một row; lỗi được surface, không crash/loop; retry transient hữu hạn nếu có | Automated | Invocation/row counts + error log |
| P3-M04 | RLS event history | User A/B query UI/API | A không đọc B; unauthenticated bị deny | MANUAL — HARD-GATE | Sanitized request/result |
| P3-A04 | Chart aggregation 7/30 | Deterministic events tại boundary/multiple/zero days | Đủ buckets, counts đúng contract | Automated | Dataset + expected/actual report |
| P3-M05 | Dashboard chart/empty/timezone | Chọn 7/30, no-data và local midnight data | UI/count/boundary/empty state đúng | MANUAL — HARD-GATE | Screenshots + source query |
| P3-A05 | Daily report aggregation | Feed previous-day data/timezone | Counts/latest/period đúng và owner-scoped | Automated | Rendered sanitized email + assertions |
| P3-M06 | Gmail send success/failure | Gửi test report rồi dùng controlled failure | Success log đúng; failure rõ; không crash/loop | MANUAL — FINAL-GATE | Test mailbox screenshot + sanitized delivery log |
| P3-A06 | Duplicate email prevention | Trigger cùng locker/report date hai lần và qua restart | Chỉ một send; unique delivery key giữ idempotency | Automated | Send spy + DB delivery rows |
| P3-M07 | YC6 full success | LOCKED rồi tạo stable unauthorized OPEN | One event authorized=false; buzzer ACTIVE; Telegram; Dashboard alert | MANUAL — FINAL-GATE | Synchronized video/UI/broker/DB/Telegram evidence |
| P3-M08 | YC6 dependency failures | Lần lượt gây Supabase/Telegram/buzzer ACK failure an toàn | Các nhánh độc lập, lỗi rõ, không duplicate/infinite retry | MANUAL — FINAL-GATE | Failure matrix evidence |
| P3-M09 | YC8 live/history/no-data/error | Hỏi bốn loại câu với data thật | Grounded answer hoặc controlled no-data/error; no secret | MANUAL — FINAL-GATE | Sanitized question/context/source/answer |
| P3-M10 | Final Dashboard responsive/state gates | Desktop/phone; offline/expired/wrong owner/pending | State/controls/loading/error đúng toàn bộ | MANUAL — FINAL-GATE | Screen recording |
| P3-M11 | Full electrical load | Servo chuyển động + LED max allowed + buzzer ON + OLED/DHT + MQTT | Rail ổn định; ESP32 không reset; devices tiếp tục đúng | MANUAL — FINAL-GATE | Voltage/current + video + broker log |
| P3-M12 | Full demo regression | Chạy Section 11 từ đầu đến cuối | Mọi requirement demo được theo cùng build/deploy | MANUAL — FINAL-GATE | Timestamped rehearsal video + checklist |

### Acceptance Criteria

Mọi mục trong phần này là `MUST`; mọi `FINAL-GATE` phải có evidence thật trước final release/`COMPLETED`. `SHOULD`/`OPTIONAL` không block acceptance và phải được ghi rõ nếu defer.

- [ ] CB3 hardware/firmware/Dashboard Test/Stop Alarm, ACK/state/timeout đạt và safe boot INACTIVE.
- [ ] YC4 lưu đầy đủ door/lock/alarm/LED/unauthorized/source/result/authorized/command/time; idempotency và RLS đạt.
- [ ] Recent/history query đúng owner, có bounded limit/filter và empty/error behavior rõ; pagination đầy đủ là `SHOULD`, không block demo dataset.
- [ ] YC5 chart 7/30, zero buckets, counting rule và Asia/Ho_Chi_Minh boundary đạt.
- [ ] YC7 settings/schedule/aggregation/Gmail/delivery log/duplicate prevention đạt success và failure tests.
- [ ] YC6 actual buzzer + persistence + Telegram + latest alert hoạt động, không duplicate episode; Minh vẫn là owner.
- [ ] YC8 live/history thật, no-data/API error và grounded structured-context behavior đạt; Gemini không được tự tạo số liệu; Minh vẫn là owner.
- [ ] Final Dashboard có đủ states/controls/history/chart/chatbot/settings và disable đúng mọi gate.
- [ ] Full-load hardware không reset/mất MQTT; WiFi/MQTT/restart recovery regression đạt.
- [ ] Security tests unauthenticated/expired/User A–Locker B/RLS/secret scan đạt; Critical và High defect = 0.
- [ ] User/deployment/troubleshooting/demo/release docs khớp hệ thống thật; traceability 12 requirement đầy đủ.
- [ ] Không còn production mock data, debug secret, generated local credential, kết quả test giả hoặc requirement bị đánh dấu hoàn tất thiếu evidence.

### Git Checklist

- [ ] **Terra/owner:** Pull integration branch mới nhất; xác minh bằng Git evidence rằng Phase 2 `COMPLETED`, Phase 3 `ACTIVE` và handoff contract có thật.
- [ ] **Terra/owner:** Xác nhận owner Mai Phương Thùy và tạo branch, đề xuất `phase/3-thuy-data-dashboard-release`.
- [ ] **Terra/owner:** Không có secret trong diff; kiểm tra Supabase/Gmail/Telegram/Gemini/MQTT/Node-RED credentials và evidence.
- [ ] **Terra/owner:** Build/test phù hợp đã chạy: firmware, Node-RED, migrations/RLS, aggregation và regression; MANUAL `HARD-GATE` có evidence thật.
- [ ] **Terra/owner:** Mọi MANUAL `FINAL-GATE` đã chạy nếu hardware/account/credential có sẵn; mục chưa thể chạy giữ `Pending` với blocker chính xác và vẫn block final release, không giả PASS.
- [ ] **Terra/owner:** `PLAN.md` cập nhật tối thiểu; final diff đã kiểm tra scope, contract, generated flows/migrations, debug/mock data và docs consistency.
- [ ] **Terra/owner:** Commit đã tạo; hash thật được ghi vào Phase Completion Summary.
- [ ] **Terra/owner, nếu có quyền:** Branch đã push; nếu không, để `Pending`, ghi blocker và exact push command.
- [ ] **Terra/owner, nếu có quyền:** Pull Request đã tạo; nếu không, để `Pending` và ghi exact command/thao tác cần thiết.
- [ ] **Terra/owner:** Khi mọi `MUST` implementation, automated tests cần thiết và MANUAL `HARD-GATE` đạt, evidence/code/docs/Git handoff đủ, chuyển Phase `ACTIVE → READY_FOR_REVIEW`, cập nhật summary rồi dừng. `FINAL-GATE` còn pending phải được nêu rõ và vẫn chặn release/`COMPLETED`.
- [ ] **Human/reviewer:** Thái Quang Huy đã review; owner/Terra không tự ghi approved.
- [ ] **Human/domain owner:** Nguyễn Văn Minh đã xác nhận integration YC6/YC8 không đổi owner/semantics.
- [ ] **Owner + reviewers:** Review comments/checks thật đã hoàn tất; toàn bộ `FINAL-GATE` bắt buộc có evidence.
- [ ] **Human/maintainer:** PR đã merge; Terra không tự tick nếu không có Git/PR evidence thật.
- [ ] **Human hoặc phiên agent sau có evidence:** Commit/PR/merge commit thật được ghi vào `PLAN.md`; chỉ chuyển Phase 3 `COMPLETED` khi acceptance + full E2E/final gates đều đạt.

### Handoff

- Người nhận tiếp theo: **Cả nhóm và giảng viên/người đánh giá**.
- Phase tiếp theo: **Không có Phase 4; chuyển sang release/demo chỉ khi Phase 3 acceptance đạt**.
- Contract phải đọc: architecture/MQTT/event/auth/database/time/counting/deployment docs đã khóa và traceability matrix.
- Những phần đã hoàn thành: khi handoff liệt kê chính xác 12 requirements có evidence, release commit/PR/deployment version; baseline hiện chưa có implementation.
- Những phần còn MANUAL: phân biệt `HARD-GATE`/`FINAL-GATE`, ghi rõ mọi credential/hardware/demo rehearsal chưa chạy; không gắn release-ready hoặc `COMPLETED` nếu còn final test bắt buộc chưa đạt.
- Dependency được mở khóa: full demo, grading handoff, reproducible deployment và maintenance/troubleshooting.
- Release record: chỉ ghi tag/version, commit, PR, deployment URL và evidence link sau khi chúng tồn tại; không tạo giá trị giả.
- Khi `MUST` implementation + automated/HARD-GATE evidence + code/docs/Git handoff đã đủ: đặt Phase 3 `READY_FOR_REVIEW` và dừng; `FINAL-GATE` được phép còn `Pending`, không tự approve/merge/đặt `COMPLETED`.
- Sau review approve + PR merge + mọi acceptance/`FINAL-GATE` có evidence thật: human hoặc phiên agent sau có Git evidence mới đặt Phase 3 `COMPLETED`. Không có Phase 4.

### Phase Completion Summary

- Status: Pending
- Implementation: Pending
- Automated tests: Pending
- Manual HARD-GATE tests: Pending
- Manual FINAL-GATE tests remaining: Pending
- Known issues: Pending
- Deferred SHOULD/OPTIONAL items: Pending
- Branch: Pending
- Commit: Pending
- PR: Pending
- Reviewer: Pending
- Merge commit: Pending
- Next phase: Pending

## 8. End-to-End Test Checklist

Quy tắc dùng bảng:

- Mỗi dòng chỉ được tick sau khi chạy đúng build/deployment được ghi, expected result đạt và evidence có thể truy vết.
- `Automated` phải có command/test runner output thật. `MANUAL` phải có bước, người chạy, thời gian, cấu hình và ảnh/video/log đã che secret.
- Hardware hoặc account/service thật luôn là `MANUAL`, dù có script hỗ trợ.
- Mọi test có phần `MANUAL` trong Section 8 là `FINAL-GATE`: có thể được ghi pending rõ ràng ở handoff nếu môi trường thật chưa sẵn sàng, nhưng toàn bộ phải pass trước final release và Phase 3 `COMPLETED`.
- Không đổi expected result để hợp thức hóa behavior lỗi. Defect phải được ghi riêng và regression test lại sau fix.

| Test ID | Kịch bản | Bước thực hiện | Kết quả mong đợi | Loại | Evidence cần lưu |
|---|---|---|---|---|---|
| [ ] E2E-01 | Door CLOSED | Khởi động hệ thống; đưa nam châm MC-38 vào vị trí cửa đóng; chờ hết debounce | Firmware/state/telemetry và Dashboard hiển thị `CLOSED` với update time đúng | MANUAL — FINAL-GATE | Video phần cứng + broker + Dashboard cùng timestamp |
| [ ] E2E-02 | Door OPEN | Từ CLOSED, tách nam châm/cửa thật | Chỉ một stable transition `OPEN`; recent event đúng | MANUAL — FINAL-GATE | Video + telemetry/event evidence |
| [ ] E2E-03 | Door debounce | Rung/toggle MC-38 nhanh quanh ngưỡng nhiều lần | Không flood telemetry/event/cảnh báo; chỉ stable state được publish | MANUAL — FINAL-GATE | Slow-motion/video + message count |
| [ ] E2E-04 | Door UNKNOWN | Quan sát boot trước stable sample; tạo device Offline/cache stale; inject state payload thiếu/không hợp lệ | Cache/Dashboard dùng `UNKNOWN` khi live state không đáng tin; không suy từ retained data và không tuyên bố tháo dây là broken-wire detection | MANUAL — FINAL-GATE | Boot/LWT/cache/UI capture + scope note về supervised circuit |
| [ ] E2E-05 | Servo UNLOCK | Owner login; device online; nhấn Unlock | Pending; một command; servo mở; valid ACK; UI `UNLOCKED` | MANUAL — FINAL-GATE | UI/broker/servo video + ACK |
| [ ] E2E-06 | Servo LOCK và cơ khí | Đóng cửa đúng; nhấn Lock; lặp nhiều vòng có tải | Chốt khóa đúng, không kẹt/quá góc/reset; ACK `LOCKED` | MANUAL — FINAL-GATE | Video + angle/current/defect note |
| [ ] E2E-07 | Buzzer ON/OFF | Nhấn Test Alarm rồi Stop Alarm | `ALARM_ON/OFF` qua Node-RED; buzzer/ACK/UI `ACTIVE/INACTIVE` đúng | MANUAL — FINAL-GATE | Hardware/UI/broker video |
| [ ] E2E-08 | LED ON/OFF | Nhấn/toggle LED On rồi Off | WS2812B, ACK và Dashboard `ON/OFF` đúng; không reset | MANUAL — FINAL-GATE | Video + state/ACK capture |
| [ ] E2E-09 | DHT22 thành công | Chạy nhiều chu kỳ với sensor thật | Giá trị hợp lý cập nhật trên OLED, không có card/telemetry Dashboard YC1 | MANUAL — FINAL-GATE | OLED photo/video + topic inventory |
| [ ] E2E-10 | DHT22 lỗi | Tháo/gây lỗi sensor an toàn | OLED báo lỗi; loop/MQTT/controls khác tiếp tục | MANUAL — FINAL-GATE | Video + broker/serial diagnostic |
| [ ] E2E-11 | OLED boot/update/error | Boot, đọc DHT bình thường rồi gây lỗi/khôi phục | OLED init, value và error/recovery rendering đúng, không flicker bất thường | MANUAL — FINAL-GATE | Video toàn chuỗi |
| [ ] E2E-12 | WiFiManager captive portal | Xóa saved Wi-Fi theo guide; boot; dùng điện thoại nối AP | Portal cục bộ xuất hiện; không cần reflash; không lộ credential cloud | MANUAL — FINAL-GATE | Screen recording đã che credential |
| [ ] E2E-13 | Lưu Wi-Fi mới | Nhập SSID/password test; lưu và restart | ESP32 nối Internet/MQTT lại; credential chỉ ở device | MANUAL — FINAL-GATE | Broker online log + sanitized phone video |
| [ ] E2E-14 | MQTT reconnect | Ngắt broker/network rồi khôi phục | Retry interval bounded/tăng dần; không reset loop; tự reconnect | MANUAL — FINAL-GATE | Timestamped serial/broker log |
| [ ] E2E-15 | ESP32 restart/safe boot | Đưa lock về state đã biết, restart ESP32 và quan sát servo/state đến khi gửi command mới | Servo không tự di chuyển/replay; lock UNKNOWN, alarm INACTIVE, LED OFF, door UNKNOWN đến stable sample; availability/full state reconnect đúng; chỉ command LOCK/UNLOCK mới xác nhận lock | MANUAL — FINAL-GATE | Synchronized servo video + boot/broker/UI log |
| [ ] E2E-16 | Availability/LWT | Cắt nguồn/network bất thường rồi graceful reconnect | Retained `OFFLINE` LWT, sau đó `ONLINE`; Dashboard đổi status đúng | MANUAL — FINAL-GATE | Broker/FlowFuse timestamp capture |
| [ ] E2E-17 | Full state sau reconnect | Sau reconnect, subscribe/quan sát state topic | Full state retained được publish; cache/UI reconcile; door event cũ không replay | MANUAL — FINAL-GATE | Full JSON đã sanitize + cache/UI capture |
| [ ] E2E-18 | Valid ACK | Tạo pending command và feed/nhận ACK khớp hoàn toàn | Timer hủy; đúng domain success; state/event cập nhật một lần | Automated | Test runner + command/ACK fixtures |
| [ ] E2E-19 | Wrong command_id | Pending A nhưng nhận ACK ID B/unknown | Không success/cancel A; ACK được diagnostic/dropped an toàn | Automated | Assertions + diagnostic output |
| [ ] E2E-20 | Command timeout | Không gửi ACK đến deadline | UI timeout; event timeout; không auto-retry actuator; GET_STATE một lần | Automated | Virtual clock/output trace |
| [ ] E2E-21 | Duplicate command | Deliver cùng command ID hai lần tới firmware/flow | Actuator một lần; cached ACK/dedupe insert; không double event | Automated + MANUAL — FINAL-GATE | Unit report và hardware message/action count |
| [ ] E2E-22 | Invalid JSON | Gửi malformed payload không lấy được ID, rồi payload lấy được valid ID nhưng lỗi field | Không actuation/cache mutation; case không ID không có normal ACK và pending timeout/reconcile; case có ID nhận correlated error ACK | Automated | Fixtures + assertions cho no-ACK/error-ACK |
| [ ] E2E-23 | Invalid action | Gửi action ngoài allowlist với ID hợp lệ | Firmware không actuation; ACK error `INVALID_ACTION`; UI không success | Automated | Captured ACK/test output |
| [ ] E2E-24 | User chưa đăng nhập | Mở Dashboard/control endpoint không có token | Control disabled/401; không publish MQTT | MANUAL — FINAL-GATE | UI/network + broker capture |
| [ ] E2E-25 | JWT hết hạn | Dùng session hết hạn/revoked, thử command/history | Yêu cầu đăng nhập lại; 401; không side effect/data leak | MANUAL — FINAL-GATE | Sanitized response/UI/broker evidence |
| [ ] E2E-26 | User A điều khiển Locker B | Login A, sửa/request locker B | 403/disabled; không command topic B | MANUAL — FINAL-GATE | Sanitized API/UI + broker capture |
| [ ] E2E-27 | RLS User A đọc Locker B | Query lockers/events/settings B bằng JWT A và unauthenticated | Zero/deny theo policy; service role không ở client | MANUAL — FINAL-GATE | Sanitized Supabase responses/policy test |
| [ ] E2E-28 | Mở cửa hợp lệ | Valid UNLOCK ACK; OPEN stable trong window, lock xác nhận UNLOCKED | `DOOR_OPENED authorized=true`; không buzzer/Telegram; window consume | MANUAL — FINAL-GATE | Synchronized ACK/door/event/UI log |
| [ ] E2E-29 | Mở cửa trái phép | Lock state LOCKED hoặc window hết; tạo OPEN stable | `authorized=false`; one `UNAUTHORIZED_OPEN`; buzzer; Telegram; latest alert | MANUAL — FINAL-GATE | Video + DB + Telegram + broker/UI evidence |
| [ ] E2E-30 | Telegram thành công | Cấu hình bot/chat test; trigger unauthorized | Một message đúng locker/time/door/lock/link; delivery success | MANUAL — FINAL-GATE | Screenshot đã che ID + delivery log |
| [ ] E2E-31 | Telegram thất bại | Controlled invalid token/chat/network, trigger event | Event/buzzer vẫn xử lý; failure rõ; no infinite retry/duplicate storm | MANUAL — FINAL-GATE | Sanitized error + event/buzzer evidence |
| [ ] E2E-32 | Supabase thành công | Thực hiện door, lock, buzzer, LED và unauthorized flows | Rows đủ fields/source/result/auth/command/time, đúng owner | MANUAL — FINAL-GATE | Sanitized query export/screenshots |
| [ ] E2E-33 | Supabase thất bại | Chặn endpoint/credential test sai có kiểm soát | Real-time control/cảnh báo không crash; lỗi được surface; không retry vô hạn; UI lỗi phù hợp | MANUAL — FINAL-GATE | Failure/recovery logs |
| [ ] E2E-34 | Chart 7 ngày | Tạo deterministic data; chọn 7 ngày | 7 local calendar buckets; open/alert counts đúng; zero days hiển thị | MANUAL — FINAL-GATE | Source rows/query result/chart screenshot |
| [ ] E2E-35 | Chart 30 ngày | Chọn 30 ngày với data boundary | 30 local calendar buckets và totals đúng | MANUAL — FINAL-GATE | Source/expected/actual evidence |
| [ ] E2E-36 | Timezone correctness | Tạo event trước/sau local midnight, query chart/report | Bucket/report period theo configured timezone, DB vẫn UTC | Automated + MANUAL — FINAL-GATE | Dataset + query assertions + UI/email |
| [ ] E2E-37 | Daily email | Trigger scheduler/test hook cho deterministic ngày trước | Một email đúng owner/period/timezone/open/alert/latest activity | MANUAL — FINAL-GATE | Test mailbox + sanitized delivery/data evidence |
| [ ] E2E-38 | Chống email trùng | Trigger scheduler hai lần/restart quanh cùng report date | Chỉ một send; delivery unique key/log đúng | Automated + MANUAL — FINAL-GATE | Send count + delivery rows + mailbox |
| [ ] E2E-39 | Gemini live query | Hỏi lock/door/alarm current state | Node-RED lấy cache và Gemini chỉ diễn đạt exact facts/provenance | MANUAL — FINAL-GATE | Sanitized context + source state + answer |
| [ ] E2E-40 | Gemini history query | Hỏi count/recent alert với deterministic Supabase data | Node-RED query/tính; answer giữ đúng số/time range | MANUAL — FINAL-GATE | Source query/context/answer |
| [ ] E2E-41 | Gemini thiếu dữ liệu | Xóa/không có data trong scope rồi hỏi | Trả lời không đủ dữ liệu; không bịa số/event | Automated + MANUAL — FINAL-GATE | Context/answer + assertion |
| [ ] E2E-42 | Gemini API lỗi | Controlled invalid key/quota/network response | UI lỗi kiểm soát hoặc deterministic facts fallback; không leak secret | MANUAL — FINAL-GATE | Sanitized provider/UI logs |
| [ ] E2E-43 | Controls khi Offline | Device LWT offline hoặc MQTT disconnected | Controls disabled, lý do đúng; door UNKNOWN; không publish | MANUAL — FINAL-GATE | UI + broker capture |
| [ ] E2E-44 | Servo + LED + buzzer full load | OLED/DHT/MQTT chạy; LED max allowed; buzzer ON; actuate servo | 5 V ổn định, không brownout/reset/MQTT loss/unsafe heat | MANUAL — FINAL-GATE | Voltage/current, video, serial/broker log |
| [ ] E2E-45 | Full demo regression | Chạy toàn bộ Section 11 trên release candidate từ login đến recovery | 12 requirements demo bằng data thật, không mock/secret, không Critical/High defect | MANUAL — FINAL-GATE | Full rehearsal video + signed checklist/build ID |

## 9. Manual Hardware Checklist

Mọi mục trong section này là **MANUAL**, chưa được thực hiện ở baseline và mang nhãn gate cụ thể. `SHOULD/OPTIONAL` không block Phase; nếu một mục conditional trở thành cần thiết để loại bỏ lỗi điện/an toàn đã quan sát, nó trở thành `MUST` cho test bị ảnh hưởng.

- [ ] **[MUST | HARD-GATE Phase 1]** Đối chiếu board ESP32 thực với PlatformIO board profile, pin labels, USB serial và điện áp chân.
- [ ] **[OPTIONAL]** Ghi serial/model/ảnh từng linh kiện dùng chính; phân biệt linh kiện dự phòng khỏi linh kiện đang test.
- [ ] **[MUST | HARD-GATE Phase 1]** Xác minh candidate pin map trên board thật; không dùng nhầm boot-strapping/input-only pin.
- [ ] **[MUST | HARD-GATE Phase 2]** Xác minh MC-38 logic điện, `INPUT_PULLUP`/điện trở, vị trí reed trên khung và nam châm trên cánh cửa; không tuyên bố digital input thường phát hiện dây đứt.
- [ ] **[MUST | HARD-GATE Phase 2]** Xác minh khoảng cách MC-38 ở trạng thái đóng/mở và dây không bị kéo/kẹp khi cửa chuyển động.
- [ ] **[MUST | HARD-GATE Phase 1]** Servo SG90 lấy 5 V trực tiếp từ rail đủ dòng, signal riêng, common ground; tuyệt đối không lấy dòng servo từ GPIO/3.3 V.
- [ ] **[MUST | HARD-GATE Phase 1]** Hiệu chuẩn góc LOCK/UNLOCK không tải; ghi giới hạn an toàn trước khi lắp linkage.
- [ ] **[MUST | HARD-GATE Phase 1]** Lắp chốt có giới hạn cơ khí/khe hở; không để servo stall kéo dài ở hai đầu hành trình.
- [ ] **[MUST | HARD-GATE Phase 1]** Test servo có tải lặp lại khi cửa căn chỉnh đúng; ghi lỗi cơ khí, nhiệt và dòng.
- [ ] **[MUST | HARD-GATE Phase 3]** Xác minh Active Buzzer active-high/active-low, voltage/current và safe boot state.
- [ ] **[MUST khi phần cứng yêu cầu | HARD-GATE Phase 3]** Dùng MOSFET/driver đúng nếu buzzer cần 5 V/dòng vượt GPIO; xác minh gate/control/common ground và linh kiện bảo vệ phù hợp module.
- [ ] **[MUST | HARD-GATE Phase 1]** Xác minh DHT22 chạy ở điện áp module phù hợp; lắp pull-up 10 kΩ nếu module chưa tích hợp; đặt sensor trong khoang chứa.
- [ ] **[MUST | HARD-GATE Phase 1]** Xác minh OLED SSD1306 địa chỉ I2C, điện áp, SDA/SCL và vị trí quan sát ở mặt trước khoang kỹ thuật.
- [ ] **[MUST | HARD-GATE Phase 1]** Đo số pixel WS2812B thực, current worst case và đặt brightness limit phù hợp nguồn.
- [ ] **[MUST | HARD-GATE Phase 1]** Lắp điện trở 330–470 Ω nối tiếp data WS2812B và tụ 470–1000 µF gần đầu nguồn strip.
- [ ] **[SHOULD, conditional]** Kiểm tra level shifter 3.3 V → 5 V nếu WS2812B không ổn định với ESP32 logic; chỉ thêm khi test chứng minh cần.
- [ ] **[MUST | HARD-GATE Phase 1]** Xác minh nguồn DC 5 V/3 A đúng cực, công suất và chất lượng; jack/công tắc/terminal không lỏng hoặc quá nhiệt.
- [ ] **[MUST | HARD-GATE Phase 1]** Tất cả thiết bị dùng common ground; tách đường nguồn tải (servo/LED/buzzer) khỏi logic, chỉ nối ground theo thiết kế.
- [ ] **[MUST | HARD-GATE Phase 1]** Dùng dây đủ tiết diện cho tải; mối nối cách điện, có strain relief và không để dây trần chạm vỏ/linh kiện.
- [ ] **[SHOULD, conditional]** Đặt tụ decoupling/bulk gần servo/LED theo kết quả đo, không thêm linh kiện ngẫu nhiên thiếu sơ đồ; nếu thiếu tụ gây brownout thì fix này trở thành `MUST`.
- [ ] **[MUST | FINAL-GATE]** Đo rail 5 V và theo dõi brownout khi boot, Servo + LED, rồi Servo + LED + Buzzer full load.
- [ ] **[MUST | FINAL-GATE]** Xác nhận ESP32, OLED, MQTT và DHT22 vẫn ổn định trong full-load test.
- [ ] **[MUST | FINAL-GATE]** Kiểm tra nhiệt độ/âm lượng/thời lượng buzzer và LED trong giới hạn demo an toàn.
- [ ] **[MUST | FINAL-GATE]** Kiểm tra jack nguồn, công tắc và phương án ngắt nguồn khẩn cấp dễ tiếp cận.
- [ ] **[MUST | FINAL-GATE]** Cố định ESP32, breadboard/PCB, MOSFET, servo, buzzer và connectors trên khay; không để linh kiện rơi vào khoang chứa.
- [ ] **[SHOULD]** Nắp khoang kỹ thuật tháo được để bảo trì nhưng được cố định chắc khi vận hành.
- [ ] **[MUST | FINAL-GATE]** Dây được đi sát vách, có quản lý dây và tấm che; không cản cửa, chốt hoặc vật dụng.
- [ ] **[MUST | FINAL-GATE]** Đối chiếu kích thước danh nghĩa tổng thể 300 × 250 × 220 mm, khoang chứa 260 × 170 × 190 mm và vỏ 10 mm; ghi rõ sai số/gia công thực.
- [ ] **[MUST | HARD-GATE Phase 1]** Test WiFiManager/reset configuration bằng điện thoại thật, không quay/lưu password trong evidence.
- [ ] **[MUST | HARD-GATE Phase 1]** Test restart/mất Wi-Fi/mất MQTT/cắt nguồn và recovery theo các test case Phase 1, không chỉ một lần thuận lợi.
- [ ] **[SHOULD]** Dán nhãn dây/connector, GPIO và polarity để thành viên khác lắp lại không suy đoán.
- [ ] **[MUST | FINAL-GATE]** Cập nhật wiring diagram/pin map/power budget theo “as-built”, không để tài liệu chỉ phản ánh thiết kế ban đầu.
- [ ] **[MUST | FINAL-GATE]** Lưu ảnh/video/đo điện áp theo Test ID; evidence không chứa token, Wi-Fi password, email cá nhân hoặc nội dung nhạy cảm.

## 10. Environment and Credential Checklist

### Ma trận cấu hình

| Cấu hình | Consumer | Secret? | Nơi được phép lưu | Không được phép |
|---|---|---:|---|---|
| `LOCKER_ID` | Firmware, Node-RED, Supabase mapping | Không | Config/env public phù hợp | Hard-code khác nhau giữa producer/consumer |
| MQTT host/port/TLS | Firmware, Node-RED | Host thường không; credential có | Environment/ignored device config/secret store | Dashboard frontend, committed `platformio.ini` password |
| MQTT username/password | Firmware, Node-RED | Có | Device provisioning/local ignored file; Node-RED secrets | Git, log, screenshot, Dashboard |
| Supabase URL + anon/publishable key | Dashboard/Node-RED | Không phải service secret nhưng vẫn là config | `.env.example` tên biến; deploy env | Nhầm với service-role key |
| Supabase service-role key | Node-RED only | Có, đặc quyền cao | Backend secret store/environment | Browser, FlowFuse UI payload, Git/evidence |
| Supabase JWT/session | Browser session và request tới Node-RED | Có, ngắn hạn | Session storage/runtime theo thiết kế | Log, Gemini context, DB event metadata |
| Telegram bot token | Node-RED only | Có | Backend secret store | DB settings row, Dashboard, Git |
| Telegram chat ID | Node-RED/Supabase settings | Nhạy cảm | Owner-protected row/RLS | Public log/evidence không che |
| Gmail App Password/OAuth | Node-RED only | Có | Backend secret/credential store | Flow export plaintext, Git, screenshot |
| Email recipient | Owner-protected settings | PII | Supabase RLS row | Cross-locker query/log công khai |
| Gemini API key | Node-RED only | Có | Backend secret store | Dashboard, Gemini prompt/context, Git |
| Gemini model | Node-RED | Không | Environment | Hard-code rải rác trong flow |
| Wi-Fi SSID/password | ESP32/WiFiManager | Password có | Captive portal → ESP32 NVS | Dashboard, Node-RED, MQTT, Cloud, Git |
| `NODE_RED_CREDENTIAL_SECRET` | Node-RED runtime | Có | Deployment secret | Repository hoặc chia sẻ qua chat/evidence |

### Checklist

- [ ] **[MUST | Phase 1]** Tạo `.env.example` chỉ với tên biến/placeholder rõ như `replace_me`; không dùng credential thật hoặc chuỗi giống secret có thể hoạt động.
- [ ] **[MUST | Phase 1]** `.gitignore` bao phủ `.env`, local secret headers, PlatformIO `.pio`, Node-RED local credential/runtime files, log/cache và service exports nhạy cảm.
- [ ] **[MUST | Phase 2]** Tách frontend-safe Supabase anon/publishable key khỏi service-role key; tìm kiếm toàn repository để xác nhận service-role không xuất hiện ở dashboard.
- [ ] **[MUST khi dùng credential node | Phase 2]** Cấu hình Node-RED credential encryption secret qua deployment environment trước khi lưu credential node.
- [ ] **[MUST | Phase 1]** MQTT broker bật authentication; TLS/certificate được xác minh nếu traffic qua Internet; local isolated development không bắt buộc TLS; không tắt certificate verification ở remote để “chạy được”.
- [ ] **[OPTIONAL]** MQTT ACL giới hạn device theo topic locker nếu broker hỗ trợ và còn thời gian; đây là defense-in-depth, không thay auth/ownership gate.
- [ ] **[MUST | Phase 1]** MQTT command topic không retained; kiểm tra retained inventory trước demo để không có command cũ.
- [ ] **[MUST | Phase 1]** Provision MQTT credential firmware bằng cơ chế bị ignore/runtime; tài liệu hóa cách thay/rotate mà không ghi value.
- [ ] **[MUST | Phase 2]** Supabase project URL/keys được nạp từ environment; service-role chỉ ở backend và được rotate nếu từng lộ.
- [ ] **[MUST | HARD-GATE Phase 2]** Tạo tối thiểu User A/User B và Locker A/Locker B cho security test; không dùng tài khoản cá nhân chính trong evidence.
- [ ] **[MUST | Phase 2]** Locker claim code/test data được quản lý riêng; owner ID không thể update từ frontend.
- [ ] **[MUST | FINAL-GATE]** Telegram bot token/chat ID được kiểm thử ở môi trường test; screenshot che thông tin không cần thiết.
- [ ] **[MUST | FINAL-GATE]** Gmail credential/test mailbox được cấu hình; không dùng email production/lớp học nếu chưa được phép.
- [ ] **[MUST | FINAL-GATE]** Gemini API key/model/quota được xác minh; không gửi JWT, email, token, service key hoặc raw PII trong context.
- [ ] **[MUST | Phase 3]** Notification recipient/time/timezone có validation và RLS; default timezone `Asia/Ho_Chi_Minh` được ghi rõ.
- [ ] **[MUST | HARD-GATE Phase 1]** Wi-Fi password chỉ nhập qua portal cục bộ và không xuất hiện trong serial log, MQTT, Dashboard, video hoặc docs.
- [ ] **[MUST]** Logging ở trust boundaries redact `Authorization`, cookies, API keys, passwords, SMTP auth, bot tokens và full JWT.
- [ ] **[MUST]** Test fixtures dùng ID/email giả rõ ràng; không sao chép production dumps vào repository.
- [ ] **[MUST]** Trước mỗi PR/release, scan working tree/staged diff và các file sẽ commit để bảo đảm không có secret; false positive chỉ suppress bằng lý do hẹp được review.
- [ ] **[SHOULD]** Scan toàn Git history trước final release nếu tooling sẵn có; **MUST** thực hiện điều tra/history cleanup phù hợp khi có incident thật. Không xây exhaustive secret-history pipeline chỉ để block đồ án.
- [ ] **[SHOULD]** Kiểm tra quota/free-tier Supabase, FlowFuse, broker, Telegram, Gmail và Gemini; core failure behavior vẫn phải rõ thay vì giả luôn khả dụng.
- [ ] **[MUST]** Ghi deployment-specific values ngoài Git theo phương thức nhóm thống nhất; backup credential không đặt trong repository/USB demo không mã hóa.
- [ ] **[MUST khi có incident]** Nếu phát hiện secret đã commit/log: dừng dùng secret, rotate/revoke trước, làm sạch nơi công khai theo quy trình được phép và ghi incident không chứa value.

## 11. Final Demo Script

Demo phải chạy trên một release candidate/build ID đã ghi, dùng dữ liệu thật của test accounts, không sửa flow/firmware giữa chừng để che lỗi. Ưu tiên 10–15 phút; WiFiManager có thể đặt cuối vì làm mất kết nối chủ động.

### Chuẩn bị trước demo

1. Xác nhận nguồn 5 V/3 A, wiring/as-built, điện thoại/laptop, Internet/hotspot dự phòng và emergency power-off.
2. Xác nhận ESP32 firmware version/build ID, Node-RED deploy version, Supabase migration version và release commit khớp test evidence.
3. Đặt cửa `CLOSED`, khóa `LOCKED`, alarm `INACTIVE`, LED `OFF`; xóa pending command; không sửa DB history để giả kết quả.
4. Xác nhận test User A owns Locker A; User B/Locker B có sẵn cho negative test; session/token không xuất hiện trên màn chiếu.
5. Xác nhận Telegram test chat, Gmail test inbox và Gemini quota; chuẩn bị failure-safe message nếu dịch vụ ngoài không khả dụng.
6. Chuẩn bị video dự phòng, screenshots Telegram/email, sanitized DB export, MQTT/Node-RED logs, USB/cáp/firmware binary/flow export theo chính sách secret.

### Trình tự demo chính

1. **Giới thiệu và kiến trúc**
   - Cho xem mô hình vật lý, khoang chứa/khoang kỹ thuật và nêu 12 requirement.
   - Trình bày luồng bắt buộc Dashboard → Node-RED → MQTT → ESP32; chỉ DHT22 → ESP32 → OLED là cục bộ.

2. **YC9 Auth và ownership**
   - Đăng nhập User A; hiển thị Locker A.
   - Chứng minh chưa đăng nhập hoặc session không hợp lệ không điều khiển được.
   - Dùng negative test/sanitized evidence chứng minh User A không đọc/điều khiển Locker B và RLS chặn ở database.

3. **CB1 Door state**
   - Cho xem MQTT/ESP32 Online và door `CLOSED`.
   - Mở/đóng cửa, chỉ ra debounce, `OPEN/CLOSED`, timestamp và recent event.
   - Nếu thời lượng cho phép, trình bày `UNKNOWN` bằng evidence boot-before-stable-sample, Offline/stale hoặc invalid payload; không tháo dây để tuyên bố broken-wire detection.

4. **CB2 Lock/Unlock**
   - Nhấn `UNLOCK`; chỉ ra `PENDING`, command ID, servo chuyển động, ACK rồi Dashboard `UNLOCKED`.
   - Mở cửa trong authorized window; chỉ ra `authorized=true`, không có Telegram/buzzer.
   - Đóng cửa; nhấn `LOCK`; chờ ACK `LOCKED`; không dùng UI success trước ACK.

5. **YC3 LED, CB3 Buzzer và YC1 local OLED**
   - Bật/tắt LED qua Dashboard, chỉ ra pending/ACK/state.
   - Test Alarm/Stop Alarm, chỉ ra buzzer thật, ACK và ACTIVE/INACTIVE.
   - Cho xem nhiệt độ/độ ẩm trên OLED; nhắc rõ không đưa YC1 lên Dashboard.

6. **YC6 mở cửa trái phép**
   - Bảo đảm lock `LOCKED`, không có valid unlock window.
   - Tác động MC-38/mở cửa an toàn.
   - Cho thấy one `UNAUTHORIZED_OPEN`, `authorized=false`, buzzer ACTIVE, latest alert, Telegram và Supabase event.
   - Đóng cửa/Stop Alarm theo quy trình; chứng minh không gửi cảnh báo lặp trong cùng episode.

7. **YC4 History và YC5 Chart**
   - Mở recent/history, đối chiếu các event door/lock/alarm/LED/unauthorized vừa tạo.
   - Chọn 7 ngày rồi 30 ngày; nêu counting rule và timezone; chỉ ra empty/zero-day behavior nếu có data chuẩn bị hợp lệ.

8. **YC7 Daily email**
   - Cho xem notification setting, report time/timezone.
   - Mở email test đã gửi bởi scheduler/test hook hợp lệ: report period, số lần mở, số cảnh báo, hoạt động gần nhất.
   - Cho xem delivery log/dedupe evidence, không hiển thị SMTP credential.

9. **YC8 Chatbot**
   - Hỏi một câu live: “Tủ hiện đang khóa hay mở?” hoặc “Cửa tủ đang đóng hay mở?”.
   - Hỏi một câu history: “Trong 7 ngày qua có bao nhiêu lần mở tủ?” hoặc “Cảnh báo gần nhất xảy ra khi nào?”.
   - Đối chiếu answer với cache/query; nêu Gemini chỉ diễn đạt, Node-RED tính facts.

10. **YC12 WiFiManager và recovery**
    - Thực hiện cuối demo hoặc dùng video/profile riêng: xóa/mất saved Wi-Fi, kết nối AP bằng điện thoại, nhập Wi-Fi mới, ESP32 reconnect MQTT và publish full state.
    - Không chiếu SSID/password thật; chỉ ra LWT Offline/Online và controls disabled trong downtime.

11. **Kết thúc và traceability**
    - Tóm tắt 12 requirement, owner đúng ba Phase và recovery/security chính.
    - Nêu build/commit/release evidence thật; không tuyên bố test chưa chạy.

### Final release checklist

- [ ] Phase 1, Phase 2, Phase 3 đều `COMPLETED` bằng acceptance/evidence/merged PR thật.
- [ ] 12 requirement có traceability requirement → owner → module → test → evidence.
- [ ] Critical = 0 và High = 0; Medium có workaround/decision được chấp nhận.
- [ ] Firmware clean build, Node-RED deploy/export, Supabase migrations/RLS và relevant automated tests đã chạy trên release candidate.
- [ ] Full demo regression theo Test `E2E-45` đã chạy; không còn production mock data.
- [ ] Manual full-load, auth/RLS, external services và recovery tests có evidence.
- [ ] README/user/deployment/troubleshooting/demo docs khớp as-built system.
- [ ] Không có secret trong Git, flow export, firmware binary metadata, log, screenshot/video hoặc release package.
- [ ] PDF nguồn còn nguyên và không bị sửa.
- [ ] Release commit/PR/tag/version/deployment URLs được ghi bằng giá trị thật, không placeholder.
- [ ] Backup/recovery artifacts mở được và không chứa credential plaintext.
- [ ] Cả ba thành viên có thể giải thích phần mình và dependency tích hợp chéo.

## 12. Terra xHigh Execution Prompt

### Prompt mẫu

```text
Bạn đang thực thi Phase `<PHASE_NUMBER>` cho owner `<MEMBER_NAME>`.

1. Đọc toàn bộ PLAN.md và repository trước khi chỉnh file.
2. Xác minh Phase `<PHASE_NUMBER>` đang `ACTIVE`; nếu không, dừng và báo evidence trạng thái.
3. Xác minh owner là `<MEMBER_NAME>` và Phase trước (nếu có) đã `COMPLETED` bằng Git/PR/evidence thật.
4. Đọc implementation, tests, config, docs và diff hiện có; bảo toàn user work.
5. Ưu tiên hoàn thành tất cả `MUST` theo Minimum Required Completion Path trước.
6. Không làm `OPTIONAL` cho đến khi mọi `MUST` đã hoàn thành; `SHOULD` không được làm chậm committed scope.
7. Chỉ làm checklist của Phase hiện tại; không bắt đầu hoặc sửa implementation Phase khác.
8. Không đổi scope, owner hoặc frozen shared contract; thay đổi contract chỉ khi PLAN cho phép, có version/reviewer evidence thật.
9. Áp dụng Simple Implementation Rule: chọn implementation đơn giản nhất đủ yêu cầu, KISS/YAGNI, tách trách nhiệm vừa đủ; không giant Function node/god class/premature optimization.
10. Thực sự tạo/sửa source code, config, tests và docs thuộc Phase hiện tại; không thay bằng mô tả hoặc placeholder.
11. Chạy build/test thực tế có thể chạy và lưu command/output/evidence thật.
12. Thực hiện MANUAL test khi người dùng, phần cứng, account và credential hiện có cho phép; tuân thủ `HARD-GATE`/`FINAL-GATE`.
13. Không giả MANUAL evidence, không ghi PASS cho test chưa chạy và không suy đoán phần cứng hoạt động.
14. Không giả credential/secret/account/service; không commit hoặc log secret.
15. Chỉ tick checklist/test/acceptance khi có evidence truy vết được.
16. Cập nhật PLAN.md tối thiểu cho status, evidence, deferred items và handoff; không rewrite checklist của Phase khác.
17. Commit/push/tạo PR theo Git Checklist nếu môi trường, remote và quyền cho phép; chỉ ghi hash/URL thật.
18. Nếu không có quyền push/tạo PR, ghi blocker và exact commands người dùng cần chạy; không bịa trạng thái remote.
19. Khi toàn bộ `MUST` implementation, automated tests cần thiết và MANUAL `HARD-GATE` đã đạt, evidence/code/docs/Git handoff đủ nhưng còn chờ human review/merge, chuyển `ACTIVE → READY_FOR_REVIEW`, cập nhật Phase Completion Summary, không ghi `COMPLETED`, rồi dừng. Nếu HARD-GATE còn thiếu, giữ `ACTIVE` và ghi blocker.
20. Không tự review/approve/merge và không tự bắt đầu Phase tiếp theo.
```

### Bản điền sẵn — Phase 1

```text
Bạn đang thực thi Phase 1 cho owner Thái Quang Huy — 24127177; scope là repository/PlatformIO + shared firmware/MQTT foundation, CB2, YC1, YC3 và YC12.

1. Đọc toàn bộ PLAN.md và repository trước khi chỉnh file.
2. Xác minh Phase 1 đang `ACTIVE`; nếu không, dừng và báo evidence trạng thái.
3. Xác minh owner là Thái Quang Huy — 24127177; Phase 1 không có Phase trước và Phase 2/3 phải còn `NOT_STARTED`.
4. Đọc implementation, tests, config, docs và diff hiện có; bảo toàn user work kể cả repository đã không còn greenfield.
5. Ưu tiên hoàn thành tất cả `MUST` trong Minimum Required Completion Path Phase 1 trước.
6. Không làm `OPTIONAL` cho đến khi mọi `MUST` hoàn thành; `SHOULD` không được làm chậm CB2/YC1/YC3/YC12/foundation.
7. Chỉ làm Phase 1; không triển khai CB1/YC6/YC8/YC9/CB3/YC4/YC5/YC7. Minh chỉ review frozen MQTT contract.
8. Không đổi scope, owner hoặc frozen shared contract; không đơn phương thêm field/topic bắt buộc.
9. Chọn implementation đơn giản nhất đủ yêu cầu, KISS/YAGNI, module vừa đủ; không god class/framework/retry/cache phức tạp.
10. Thực sự tạo/sửa source code firmware, config, tests và docs của Phase 1; không thay bằng placeholder.
11. Chạy clean firmware build và mọi automated parser/state/dedupe test có thể chạy; lưu command/output thật.
12. Thực hiện MANUAL test nếu ESP32, linh kiện, điện thoại và broker hiện có; tuân thủ Phase 1 `HARD-GATE`.
13. Không giả MANUAL evidence hoặc ghi PASS cho board/servo/DHT/OLED/LED/WiFi/MQTT chưa test.
14. Không giả Wi-Fi/MQTT credential; không commit/log password hoặc secret.
15. Chỉ tick checklist/test/acceptance có evidence truy vết được.
16. Cập nhật PLAN.md tối thiểu cho Phase 1 status/evidence/deferred items/handoff; không rewrite Phase 2/3.
17. Commit/push/tạo PR theo Git Checklist nếu môi trường, remote và quyền cho phép; chỉ ghi hash/URL thật.
18. Nếu không có quyền push/tạo PR, ghi blocker và exact commands người dùng cần chạy; không bịa remote/PR.
19. Khi mọi `MUST` implementation, automated tests cần thiết và MANUAL `HARD-GATE` Phase 1 đạt, evidence/code/docs/Git handoff đủ nhưng chờ Minh review/merge, chuyển Phase 1 `ACTIVE → READY_FOR_REVIEW`, cập nhật summary, không ghi `COMPLETED`, rồi dừng. Nếu HARD-GATE thiếu, giữ `ACTIVE`.
20. Không tự review/approve/merge và không bắt đầu Phase 2.
```

### Bản điền sẵn — Phase 2

```text
Bạn đang thực thi Phase 2 cho owner Nguyễn Văn Minh — 24127205; scope là CB1, YC6 logic/Telegram/interface, YC8, YC9 và Node-RED auth/security/orchestration foundation.

1. Đọc toàn bộ PLAN.md và repository trước khi chỉnh file.
2. Xác minh Phase 2 đang `ACTIVE`; nếu không, dừng và báo evidence trạng thái.
3. Xác minh owner là Nguyễn Văn Minh — 24127205, Phase 1 đã `COMPLETED` bằng acceptance + merged-PR evidence thật và Phase 3 còn `NOT_STARTED`.
4. Đọc implementation, tests, config, docs, frozen contracts và diff hiện có; bảo toàn Phase 1/user work.
5. Ưu tiên hoàn thành tất cả `MUST` trong Minimum Required Completion Path Phase 2 trước.
6. Không làm `OPTIONAL` cho đến khi mọi `MUST` hoàn thành; `SHOULD` không được làm chậm CB1/YC6/YC8/YC9/orchestration.
7. Chỉ làm Phase 2; không triển khai actual CB3 buzzer hoặc YC4 persistence. Chỉ tạo contract/interface để Mai Phương Thùy nối ở Phase 3.
8. Không đổi scope, owner hoặc frozen contract; giữ Nguyễn Văn Minh là owner YC6/YC8 và không nhận owner CB3/YC4.
9. Chọn implementation đơn giản nhất đủ yêu cầu, KISS/YAGNI, subflow/module vừa đủ; không giant Function node, queue/LRU/retry/validator framework phức tạp.
10. Thực sự tạo/sửa firmware CB1, Node-RED, Supabase YC9, Dashboard phần Phase 2, tests và docs; không thay bằng placeholder.
11. Chạy firmware regression và automated tests cho debounce, auth/RLS, validation, dispatcher, ACK/timeout/dedupe, YC6 và YC8 contract; lưu output thật.
12. Thực hiện MANUAL test nếu board, test accounts, Telegram/Gemini credential có sẵn; tuân thủ `HARD-GATE`/`FINAL-GATE`.
13. Không giả MANUAL evidence, actual buzzer ACK, event persistence hoặc history backend thật.
14. Không giả credential/account/service; không commit/log JWT, service-role key, Telegram/Gemini secret hoặc PII.
15. Chỉ tick checklist/test/acceptance có evidence truy vết được.
16. Cập nhật PLAN.md tối thiểu cho Phase 2 status/evidence/deferred items/handoff; không rewrite Phase 1/3.
17. Commit/push/tạo PR theo Git Checklist nếu môi trường, remote và quyền cho phép; chỉ ghi hash/URL thật.
18. Nếu không có quyền push/tạo PR, ghi blocker và exact commands người dùng cần chạy; không bịa remote/PR.
19. Khi mọi `MUST` implementation, automated tests cần thiết và MANUAL `HARD-GATE` Phase 2 đạt, evidence/code/docs/Git handoff đủ nhưng chờ Thùy review/merge, chuyển Phase 2 `ACTIVE → READY_FOR_REVIEW`, cập nhật summary, không ghi `COMPLETED`, rồi dừng. Nếu HARD-GATE thiếu, giữ `ACTIVE`; FINAL-GATE pending phải ghi rõ và vẫn block final release.
20. Không tự review/approve/merge và không bắt đầu Phase 3.
```

### Bản điền sẵn — Phase 3

```text
Bạn đang thực thi Phase 3 cho owner Mai Phương Thùy — 24127249; scope là CB3, YC4, YC5, YC7, full YC6/YC8 integration, final Dashboard/testing/docs/release.

1. Đọc toàn bộ PLAN.md và repository trước khi chỉnh file.
2. Xác minh Phase 3 đang `ACTIVE`; nếu không, dừng và báo evidence trạng thái.
3. Xác minh owner là Mai Phương Thùy — 24127249 và Phase 2 đã `COMPLETED` bằng acceptance + merged-PR evidence thật.
4. Đọc implementation, tests, config, docs, frozen contracts và diff hiện có; bảo toàn Phase 1/2/user work.
5. Ưu tiên hoàn thành tất cả `MUST` trong Minimum Required Completion Path Phase 3 trước.
6. Không làm `OPTIONAL` cho đến khi mọi `MUST` hoàn thành; `SHOULD` không được làm chậm CB3/YC4/YC5/YC7/integration/release.
7. Chỉ làm Phase 3; không tạo Phase 4 hoặc rewrite implementation đã đạt của Phase trước ngoài phần tích hợp bắt buộc.
8. Không đổi scope, owner hoặc frozen contract; nối buzzer/persistence vào YC6 và history vào YC8 nhưng giữ Nguyễn Văn Minh là owner YC6/YC8.
9. Chọn implementation đơn giản nhất đủ yêu cầu, KISS/YAGNI, separation vừa đủ; không framework migration/dead-letter/retry/observability/scaling phức tạp.
10. Thực sự tạo/sửa firmware CB3, Supabase YC4/YC5/YC7, Node-RED, final Dashboard, tests và docs; không thay bằng placeholder.
11. Chạy firmware/Node-RED/Supabase/RLS/aggregation/email-dedupe/regression tests có thể chạy; lưu command/output thật.
12. Thực hiện MANUAL test nếu hardware, accounts và external credentials hiện có; tuân thủ `HARD-GATE`/`FINAL-GATE` và full E2E trước release.
13. Không giả MANUAL evidence, full-load result, Telegram/Gmail/Gemini delivery hoặc demo rehearsal.
14. Không giả credential/account/service/release tag; không commit/log service-role, MQTT, Telegram, Gmail, Gemini hoặc Wi-Fi secret.
15. Chỉ tick checklist/test/acceptance có evidence truy vết được.
16. Cập nhật PLAN.md tối thiểu cho Phase 3 status/evidence/deferred items/handoff; không rewrite checklist Phase 1/2.
17. Commit/push/tạo PR theo Git Checklist nếu môi trường, remote và quyền cho phép; chỉ ghi hash/URL/tag thật.
18. Nếu không có quyền push/tạo PR, ghi blocker và exact commands người dùng cần chạy; không bịa remote/PR/release.
19. Khi mọi `MUST` implementation, automated tests cần thiết và MANUAL `HARD-GATE` đạt, evidence/code/docs/Git handoff đủ nhưng còn chờ Huy review/merge, chuyển Phase 3 `ACTIVE → READY_FOR_REVIEW`, cập nhật summary, không ghi `COMPLETED`, rồi dừng. FINAL-GATE còn pending phải ghi rõ và vẫn block release/COMPLETED; nếu HARD-GATE thiếu, giữ `ACTIVE`.
20. Không tự review/approve/merge, không tự đặt Phase 3 `COMPLETED` và không bắt đầu Phase 4.
```

Baseline invariants trước lần thực thi đầu tiên: chỉ Phase 1 là `ACTIVE`; Phase 2/3 là `NOT_STARTED`; không implementation checkbox nào được tick; không test nào có kết quả; mọi Phase Completion Summary là `Pending`; không có commit/PR/release giả; CB3 và YC4 không thuộc Minh; YC6 phụ thuộc actual CB3 + YC4 ở Phase 3; YC1 vẫn là luồng local-only; mọi secret nằm ngoài Git.
