---
title: "Tiny Hermes Robot"
date: 2026-06-10T16:00:00-04:00
draft: false
tags:
  - hardware
  - robot
  - esp32
  - iot
  - ai
description: "A 'dumb client' robot design — all intelligence lives on the Hermes backend. ESP32-S3, camera, motors, LoRa fallback."
---

**Status: Design spec complete. Prototype pending.**

The Tiny Hermes Robot is a deliberately simple robotic platform. All reasoning, vision processing, navigation, and personality live on the Hermes backend. The robot itself is just sensors, motors, and a display — an I/O shell with zero onboard intelligence.

## Architecture

```
  ┌─────────────────────┐
  │    HERMES BACKEND   │
  │  (Hermes Agent VM)  │
  │                     │
  │  • Vision (YOLO/CLIP)│
  │  • Path planning     │
  │  • Speech (STT/TTS)  │
  │  • Decision-making   │
  │  • Personality/LLM   │
  └──────┬──────────────┘
         │ WiFi / Tailscale
         │ WebSocket / MJPEG
  ┌──────┴──────────────┐
  │   ROBOT CLIENT      │  ← "Dumb" — no local AI
  │  (ESP32-S3)         │
  │                     │
  │  • Camera stream    │
  │  • Motor drive I²C  │
  │  • OLED display     │
  │  • I²S mic + amp    │
  │  • Battery monitor  │
  └─────────────────────┘
```

## Hardware BOM

| Component | Part | Cost |
|-----------|------|------|
| MCU | ESP32-S3-DevKitC-1 (16MB flash, 8MB PSRAM) | ~$15 |
| Camera | OV2640 (2MP) on FPC ribbon | ~$8 |
| Display | 0.96″ OLED 128×64, SSD1306 I²C | ~$4 |
| Motors | N20 micro metal gearmotor (100:1, ~150 RPM) ×2 | ~$12 |
| Driver | DRV8833 dual H-bridge (I²C via PCA9685) | ~$5 |
| Chassis | 3D-printed PLA (2 pieces) | ~$3 |
| Battery | 18650 Li-ion (3.7V 2600mAh) + TP4056 charger | ~$8 |
| Audio | INMP441 I²S mic + MAX98357A amp + speaker | ~$8 |
| LoRa (opt) | SX1262 + SMA antenna | ~$15 |
| **Total** | | **~$97** ($82 without LoRa) |

## Communication

**Primary (WiFi):** Robot streams MJPEG frames + JSON telemetry (battery, temp, RSSI, encoder position) over WebSocket. Hermes sends motor commands, display updates, and speech TTS back down the same connection.

**Fallback (LoRa — optional):** When WiFi is unavailable, the robot sends short status packets every 30s and receives waypoint commands. No video/audio — commands only, ~30 bytes/sec.

## Key Design Decisions

**Why ESP32-S3, not RPi?** Instant-on, 100mA active draw vs 500mA+. The robot should be usable for hours, not minutes. No Linux boot time, no SD card corruption risk.

**Why I²C motor driver?** Frees up GPIO pins. The PCA9685 PWM driver handles 16 channels on just two pins (SDA/SCL), leaving the rest for camera, display, audio, and sensors.

**Why MJPEG, not H.264?** The ESP32-S3 lacks a hardware H.264 encoder. Software encoding would consume most of the CPU. MJPEG at 640×480 is simple and well within the S3's ISP pipeline — the backend handles compression and analysis.

## Source Files

- **Design spec:** `hermes-robot-spec.md` (local)
- **RCduino baseline firmware:** `rc_car_basic/rc_car_basic.ino` (local)

## Next Steps

- Prototype the chassis (3D print)
- Assemble the ESP32-S3 dev board + motors + driver
- Write the Arduino firmware (WiFi, WebSocket, camera stream)
- Build the Hermes backend handler (vision, path planning, personality)
