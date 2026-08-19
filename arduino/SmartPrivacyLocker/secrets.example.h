#pragma once

// Sao chép thành secrets.h rồi thay giá trị tại máy triển khai; Git bỏ qua file đó.
// Tài khoản Wi-Fi không nằm trong mã: WiFiManager nhận qua captive portal cục bộ
// và lưu vào NVS của ESP32.
namespace Secrets {
constexpr char MQTT_HOST[] = "replace_me";
constexpr char MQTT_USERNAME[] = "replace_me";
constexpr char MQTT_PASSWORD[] = "replace_me";

// Chỉ bắt buộc khi MQTT_USE_TLS=true. Điền CA dạng PEM trong secrets.h cục bộ;
// không dùng setInsecure() để bỏ kiểm tra chứng chỉ của broker từ xa.
constexpr char MQTT_CA_CERT[] = "replace_me";
}  // namespace Secrets
