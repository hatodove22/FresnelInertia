#pragma once

#include <cstddef>
#include <cstdint>
#include <deque>
#include <vector>

constexpr int OUTPUT = 1;
constexpr int HIGH = 1;
constexpr int LOW = 0;
constexpr int SERIAL_8N1 = 0;

extern uint32_t test_clock_ms;
extern uint32_t test_delay_calls;

inline uint32_t millis() { return test_clock_ms; }
inline void delay(uint32_t ms) { ++test_delay_calls; test_clock_ms += ms; }
inline void delayMicroseconds(uint32_t) { ++test_delay_calls; }
inline void pinMode(int, int) {}
inline void digitalWrite(int, int) {}

class HardwareSerial {
 public:
  std::deque<uint8_t> rx;
  std::vector<std::vector<uint8_t>> writes;
  unsigned flush_calls = 0;
  bool confirm_torque_off = false;
  int tx_capacity = 256;

  int available() const { return static_cast<int>(rx.size()); }
  int availableForWrite() const { return tx_capacity; }
  int read() {
    if (rx.empty()) return -1;
    const int value = rx.front();
    rx.pop_front();
    return value;
  }
  std::size_t write(const uint8_t* bytes, std::size_t length);
  void flush() { ++flush_calls; }
  void end() {}
  void begin(uint32_t, int, int, int) {}
  void setRxBufferSize(std::size_t) {}
};

extern HardwareSerial Serial1;
