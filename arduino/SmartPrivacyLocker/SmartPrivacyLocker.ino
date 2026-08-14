/*
 * Smart Privacy Locker - Arduino IDE entry point.
 *
 * setup() and loop() are implemented in main.cpp. The explicit library
 * includes below let Arduino's dependency scanner discover every external
 * library used by the recursively compiled C++ sources.
 *
 * Board Manager: http://boardsmanager/#esp32
 */

#include <Adafruit_GFX.h>
#include <Adafruit_NeoPixel.h>
#include <Adafruit_SSD1306.h>
#include <ArduinoJson.h>
#include <DHT.h>
#include <ESP32Servo.h>
#include <PubSubClient.h>
#include <WiFiManager.h>

// Do not add another setup() or loop() here.
