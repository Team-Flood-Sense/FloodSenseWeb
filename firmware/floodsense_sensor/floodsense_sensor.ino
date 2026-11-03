// FloodSense water-level sensor -> Supabase -> website.
// Works on ESP32 and ESP8266 (NodeMCU / Wemos D1 mini). Copy secrets.example.h to secrets.h first.
//
// Wiring for an ultrasonic sensor (HC-SR04, JSN-SR04T, A02YYUW is NOT supported):
//   VCC -> 5V   GND -> GND   TRIG -> TRIG_PIN   ECHO -> ECHO_PIN
// HC-SR04's ECHO outputs 5V; put a voltage divider (1k + 2k) between ECHO and the board's pin.
//
// The sensor is mounted above the water looking down, so:
//   water level = MOUNT_HEIGHT_CM - measured distance

#include "secrets.h"

#if defined(ESP8266)
  #include <ESP8266WiFi.h>
  #include <ESP8266HTTPClient.h>
  #include <WiFiClientSecure.h>
  #define TRIG_PIN D5
  #define ECHO_PIN D6
#else
  #include <WiFi.h>
  #include <HTTPClient.h>
  #include <WiFiClientSecure.h>
  #define TRIG_PIN 4
  #define ECHO_PIN 21
#endif

// Distance from the sensor face down to the bottom (dry level), in cm.
#define MOUNT_HEIGHT_CM 50.0
// Set to 1 to send fake rising/falling readings and test the website without a sensor attached.
#define SIMULATE_READINGS 0
#define SEND_EVERY_MS 10000

float readDistanceCm() {
  float samples[5];
  int n = 0;
  for (int i = 0; i < 5; i++) {
    digitalWrite(TRIG_PIN, LOW);
    delayMicroseconds(2);
    digitalWrite(TRIG_PIN, HIGH);
    delayMicroseconds(10);
    digitalWrite(TRIG_PIN, LOW);
    unsigned long us = pulseIn(ECHO_PIN, HIGH, 30000UL);  // 30 ms timeout ~ 5 m
    if (us > 0) samples[n++] = us * 0.0343f / 2.0f;
    delay(60);
  }
  if (n == 0) return -1;  // no echo
  // median of what we got
  for (int i = 0; i < n; i++)
    for (int j = i + 1; j < n; j++)
      if (samples[j] < samples[i]) { float t = samples[i]; samples[i] = samples[j]; samples[j] = t; }
  return samples[n / 2];
}

float nextReading(bool &ok) {
  ok = true;
#if SIMULATE_READINGS
  // Triangle wave 0..80 cm over ~2 minutes, so you see it cross the warning level (30 cm).
  float phase = (millis() % 120000UL) / 120000.0f;
  return (phase < 0.5f ? phase * 2.0f : (1.0f - phase) * 2.0f) * 80.0f;
#else
  float d = readDistanceCm();
  if (d < 0) { ok = false; return 0; }
  Serial.printf("distance %.1f cm\n", d);
  float level = MOUNT_HEIGHT_CM - d;
  return level < 0 ? 0 : level;
#endif
}

void connectWifi() {
  if (WiFi.status() == WL_CONNECTED) return;
  Serial.printf("Connecting to %s", WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < 20000) {
    delay(500);
    Serial.print(".");
  }
  Serial.println(WiFi.status() == WL_CONNECTED ? " connected" : " FAILED (will retry)");
}

void sendReading(float value) {
  WiFiClientSecure client;
  client.setInsecure();  // skips certificate checking; fine for testing, pin the cert for production
  HTTPClient http;
  String url = String(SUPABASE_URL) + "/rest/v1/rpc/report_sensor_reading";
  if (!http.begin(client, url)) { Serial.println("http.begin failed"); return; }
  http.addHeader("Content-Type", "application/json");
  http.addHeader("apikey", SUPABASE_PUBLISHABLE_KEY);
  String body = String("{\"p_key\":\"") + DEVICE_KEY + "\",\"p_sensor_id\":\"" + SENSOR_ID +
                "\",\"p_value\":" + String(value, 1) + "}";
  int code = http.POST(body);
  Serial.printf("sent %.1f cm -> HTTP %d\n", value, code);
  if (code >= 400 || code < 0) Serial.println(http.getString());
  http.end();
}

void setup() {
  Serial.begin(115200);
  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);
  connectWifi();
}

void loop() {
  connectWifi();
  if (WiFi.status() == WL_CONNECTED) {
    bool ok;
    float v = nextReading(ok);
    if (ok) sendReading(v);
    else Serial.println("no echo from the ultrasonic sensor - check wiring");
  }
  delay(SEND_EVERY_MS);
}
