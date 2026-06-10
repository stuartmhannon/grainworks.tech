---
title: "Tiny Hermes Robot"
date: 2026-06-10T16:20:00-04:00
draft: false
description: "An ESP32-S3 dumb-client robot: zero onboard intelligence, all reasoning on the Hermes backend. ~$82 WiFi, ~$97 with LoRa."
---

A small, open-hardware robot designed around a radical premise: **zero intelligence onboard.** Every decision — vision processing, path planning, speech, personality — lives on the Hermes Agent backend. The robot is just sensors, motors, and a display connected over WiFi.

## Architecture

```
┌─────────────────────────┐
│    HERMES BACKEND       │
│  (Hermes Agent VM)      │
│  • Vision (YOLO/CLIP)   │
│  • Path planning         │
│  • Speech (STT/TTS)     │
│  • Decision-making      │
│  • Personality/LLM      │
└──────┬──────────────────┘
       │ WiFi / Tailscale
       │ WebSocket / MJPEG
┌──────┴──────────────────┐
│   ROBOT CLIENT          │  ← "Dumb" — no local AI
│  (ESP32-S3)             │
│  • Camera stream        │
│  • Motor drive I²C      │
│  • OLED display         │
│  • I²S mic + amp        │
│  • Battery monitor      │
└─────────────────────────┘
```

## BOM (Bill of Materials)

| Component | Part | Cost |
|-----------|------|------|
| MCU | ESP32-S3-DevKitC-1 (16MB flash, 8MB PSRAM) | ~$15 |
| Camera | OV2640 2MP on FPC ribbon | ~$8 |
| Display | 0.96" OLED 128×64, SSD1306 I²C | ~$4 |
| Motors | N20 micro metal gearmotor (100:1, ~150 RPM) × 2 | ~$12 |
| Driver | DRV8833 dual H-bridge via PCA9685 | ~$5 |
| Wheels | 42mm silicone wheel + ball caster × 3 | ~$8 |
| Chassis | 3D-printed PLA (2-piece) | ~$3 |
| Battery | 18650 Li-ion 2600mAh + TP4056 charger | ~$8 |
| Regulator | MCP1700-3.3V LDO | ~$2 |
| Audio | INMP441 I²S mic + MAX98357A amp + speaker | ~$8 |
| LoRa (opt) | SX1262 module + SMA antenna | ~$15 |
| Passives + PCB | Resistors, caps, custom 2-layer board | ~$9 |
| **Total** | | **~$82 ($97 w/ LoRa)** |

## Variants

| Variant | Comms | Camera | Cost | Range |
|---------|-------|--------|------|-------|
| WiFi | WiFi + Tailscale | OV2640 MJPEG | ~$82 | ~30m |
| LoRa Control | WiFi + LoRa | OV2640 MJPEG | ~$97 | 2km control |
| LoRa Only | LoRa SX1262 | None (telemetry only) | ~$55 | ~2km |
| Cellular | RPi Zero 2W + 4G HAT | Pi Camera | ~$160 | Anywhere |

## Communication

- **Primary:** WebSocket over WiFi (Tailscale for cross-network reachability)
- **Camera:** MJPEG frames as WebSocket binary messages (640×480 JPEG ~20KB)
- **Telemetry:** JSON every 500ms (battery, temp, RSSI, encoder counts)
- **Commands:** JSON drive/display/audio/stop commands from Hermes backend
- **Fallback:** LoRa for waypoint/telemetry-only when WiFi is down

## Files

- [Full Design Spec](/Volumes/Mini_1Tb/Projects/hermes-robot-spec.md) — Complete architecture, BOM, firmware outline, and design decisions
- Firmware: Arduino/ESP-IDF project (in progress)
- Backend: Hermes robot driver Python service (in progress)
- Chassis: 3D-printable STL files (to be designed)

## Status → **Design / Prototyping**

The spec is complete. Next steps:
1. Build firmware (ESP32-S3, OV2640)
2. Build Hermes backend Python service
3. 3D-print chassis and assemble
4. Indoor test with Tailscale
5. Add LoRa module for outdoor range
6. Field test
