#include <Arduino.h>
#include <Wire.h>
#include <ESP32Servo.h>
#include <DHT.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <Adafruit_NeoPixel.h>

namespace {

constexpr uint8_t SERVO_PIN = 18;
constexpr uint8_t DHT_PIN = 4;
constexpr uint8_t OLED_SDA_PIN = 21;
constexpr uint8_t OLED_SCL_PIN = 22;
constexpr uint8_t PIXEL_PIN = 25;
constexpr uint8_t BUZZER_PIN = 26;
constexpr uint8_t DOOR_PIN = 27;

constexpr uint8_t LOCK_ANGLE = 15;
constexpr uint8_t UNLOCK_ANGLE = 95;
constexpr uint8_t PIXEL_COUNT = 1;
constexpr uint8_t PIXEL_BRIGHTNESS = 32;
constexpr uint8_t OLED_ADDRESS = 0x3C;

constexpr uint32_t SERVO_SETTLE_MS = 550;
constexpr uint32_t DHT_READ_INTERVAL_MS = 2500;
constexpr uint32_t DISPLAY_REFRESH_MS = 200;
constexpr uint32_t DOOR_DEBOUNCE_MS = 50;

enum class LockState : uint8_t {
  LOCKED,
  UNLOCKED,
};

Servo lockServo;
DHT dht(DHT_PIN, DHT22);
Adafruit_SSD1306 display(128, 64, &Wire, -1);
Adafruit_NeoPixel pixel(PIXEL_COUNT, PIXEL_PIN, NEO_GRB + NEO_KHZ800);

LockState lockState = LockState::LOCKED;
bool displayReady = false;
bool pixelOn = false;
bool alarmOn = false;
bool doorClosed = true;
bool doorCandidateClosed = true;

float temperatureC = NAN;
float humidityPercent = NAN;

uint32_t doorCandidateSince = 0;
uint32_t nextDhtReadAt = 0;
uint32_t nextDisplayRefreshAt = 0;

const char* lockStateText() {
  return lockState == LockState::LOCKED ? "LOCKED" : "UNLOCKED";
}

const char* doorStateText() {
  return doorClosed ? "CLOSED" : "OPEN";
}

const char* onOffText(bool value) {
  return value ? "ON" : "OFF";
}

bool timeReached(uint32_t now, uint32_t target) {
  return static_cast<int32_t>(now - target) >= 0;
}

void renderDisplay() {
  if (!displayReady) {
    return;
  }

  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);
  display.setCursor(0, 0);
  display.println(F("SMART PRIVACY LOCKER"));

  display.print(F("T:"));
  if (isnan(temperatureC)) {
    display.print(F("--.-C"));
  } else {
    display.print(temperatureC, 1);
    display.print(F("C"));
  }
  display.print(F(" H:"));
  if (isnan(humidityPercent)) {
    display.println(F("--.-%"));
  } else {
    display.print(humidityPercent, 1);
    display.println(F("%"));
  }

  display.print(F("Door: "));
  display.println(doorStateText());
  display.print(F("Lock: "));
  display.println(lockStateText());
  display.print(F("LED: "));
  display.println(onOffText(pixelOn));
  display.print(F("Alarm: "));
  display.println(onOffText(alarmOn));
  display.display();
}

void printHelp() {
  Serial.println();
  Serial.println(F("=== SMART PRIVACY LOCKER - WOKWI ==="));
  Serial.println(F("L : khoa tu (servo 15 do)"));
  Serial.println(F("U : mo khoa (servo 95 do)"));
  Serial.println(F("1 : bat WS2812"));
  Serial.println(F("0 : tat WS2812"));
  Serial.println(F("A : bat bao dong"));
  Serial.println(F("a : tat bao dong"));
  Serial.println(F("S : in trang thai"));
  Serial.println(F("H : in lai huong dan"));
  Serial.println(F("Click cong tac MC-38 tren so do de OPEN/CLOSED."));
  Serial.println(F("DHT22 tren so do cho phep chinh nhiet do/do am."));
  Serial.println();
}

void printState() {
  Serial.print(F("STATE lock="));
  Serial.print(lockStateText());
  Serial.print(F(" door="));
  Serial.print(doorStateText());
  Serial.print(F(" led="));
  Serial.print(onOffText(pixelOn));
  Serial.print(F(" alarm="));
  Serial.print(onOffText(alarmOn));
  Serial.print(F(" temperature="));
  if (isnan(temperatureC)) {
    Serial.print(F("N/A"));
  } else {
    Serial.print(temperatureC, 1);
  }
  Serial.print(F(" humidity="));
  if (isnan(humidityPercent)) {
    Serial.println(F("N/A"));
  } else {
    Serial.println(humidityPercent, 1);
  }
}

void moveLock(LockState target) {
  if (!lockServo.attached()) {
    lockServo.attach(SERVO_PIN, 500, 2400);
  }

  const uint8_t targetAngle =
      target == LockState::LOCKED ? LOCK_ANGLE : UNLOCK_ANGLE;
  lockServo.write(targetAngle);
  delay(SERVO_SETTLE_MS);
  lockServo.detach();
  lockState = target;

  Serial.print(F("OK lock="));
  Serial.print(lockStateText());
  Serial.print(F(" angle="));
  Serial.println(targetAngle);
  renderDisplay();
}

void setPixel(bool enabled) {
  pixelOn = enabled;
  pixel.setPixelColor(0, enabled ? pixel.Color(0, 80, 255) : 0);
  pixel.show();
  Serial.print(F("OK led="));
  Serial.println(onOffText(pixelOn));
  renderDisplay();
}

void setAlarm(bool enabled) {
  alarmOn = enabled;
  // Match the selected three-pin module: LOW sounds, HIGH is inactive. The
  // custom Wokwi chip turns this steady control level into an audible tone.
  digitalWrite(BUZZER_PIN, enabled ? LOW : HIGH);
  Serial.print(F("OK alarm="));
  Serial.println(onOffText(alarmOn));
  renderDisplay();
}

void pollDoor(uint32_t now) {
  const bool rawClosed = digitalRead(DOOR_PIN) == LOW;
  if (rawClosed != doorCandidateClosed) {
    doorCandidateClosed = rawClosed;
    doorCandidateSince = now;
    return;
  }

  if (doorClosed != doorCandidateClosed &&
      now - doorCandidateSince >= DOOR_DEBOUNCE_MS) {
    doorClosed = doorCandidateClosed;
    Serial.print(F("EVENT door="));
    Serial.println(doorStateText());
    renderDisplay();
  }
}

void readEnvironment(uint32_t now) {
  if (!timeReached(now, nextDhtReadAt)) {
    return;
  }
  nextDhtReadAt = now + DHT_READ_INTERVAL_MS;

  const float newHumidity = dht.readHumidity();
  const float newTemperature = dht.readTemperature();
  if (isnan(newHumidity) || isnan(newTemperature)) {
    temperatureC = NAN;
    humidityPercent = NAN;
    Serial.println(F("WARN DHT22 read failed"));
  } else {
    temperatureC = newTemperature;
    humidityPercent = newHumidity;
  }
  renderDisplay();
}

void handleSerial() {
  while (Serial.available() > 0) {
    const char command = static_cast<char>(Serial.read());
    switch (command) {
      case 'L':
      case 'l':
        moveLock(LockState::LOCKED);
        break;
      case 'U':
      case 'u':
        moveLock(LockState::UNLOCKED);
        break;
      case '1':
        setPixel(true);
        break;
      case '0':
        setPixel(false);
        break;
      case 'A':
        setAlarm(true);
        break;
      case 'a':
        setAlarm(false);
        break;
      case 'S':
      case 's':
        printState();
        break;
      case 'H':
      case 'h':
      case '?':
        printHelp();
        break;
      case '\r':
      case '\n':
      case ' ':
      case '\t':
        break;
      default:
        Serial.print(F("ERR unknown command: "));
        Serial.println(command);
        Serial.println(F("Nhap H de xem huong dan."));
        break;
    }
  }
}

}  // namespace

void setup() {
  Serial.begin(115200);

  pinMode(DOOR_PIN, INPUT_PULLUP);
  // Preload the inactive latch before enabling output, exactly like the
  // production firmware's safe-boot path.
  digitalWrite(BUZZER_PIN, HIGH);
  pinMode(BUZZER_PIN, OUTPUT);

  doorClosed = digitalRead(DOOR_PIN) == LOW;
  doorCandidateClosed = doorClosed;
  doorCandidateSince = millis();

  Wire.begin(OLED_SDA_PIN, OLED_SCL_PIN);
  displayReady = display.begin(SSD1306_SWITCHCAPVCC, OLED_ADDRESS);
  if (!displayReady) {
    Serial.println(F("WARN OLED initialization failed"));
  }

  dht.begin();
  pixel.begin();
  pixel.setBrightness(PIXEL_BRIGHTNESS);
  setPixel(false);

  moveLock(LockState::LOCKED);
  nextDhtReadAt = millis() + 2000;
  nextDisplayRefreshAt = millis();

  renderDisplay();
  printHelp();
  printState();
}

void loop() {
  const uint32_t now = millis();
  handleSerial();
  pollDoor(now);
  readEnvironment(now);

  if (timeReached(now, nextDisplayRefreshAt)) {
    nextDisplayRefreshAt = now + DISPLAY_REFRESH_MS;
    renderDisplay();
  }

  delay(2);
}
