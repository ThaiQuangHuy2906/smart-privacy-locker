// Tab .ino chỉ khai báo các thư viện để Arduino IDE tự nhận dependency.
// setup() và loop() thật nằm trong main.cpp, nhờ vậy cùng một mã nguồn có thể
// build bằng cả Arduino IDE lẫn PlatformIO mà không tạo hai bản logic khác nhau.
#include <Adafruit_GFX.h>
#include <Adafruit_NeoPixel.h>
#include <Adafruit_SSD1306.h>
#include <ArduinoJson.h>
#include <DHT.h>
#include <ESP32Servo.h>
#include <PubSubClient.h>
#include <WiFiManager.h>
