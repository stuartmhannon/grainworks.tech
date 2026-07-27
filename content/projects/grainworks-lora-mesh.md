---
title: "Grainworks LoRa Mesh"
date: 2026-06-10T16:00:00-04:00
draft: false
status: "Design"
tags:
  - hardware
  - lora
  - meshtastic
  - kicad
  - iot
description: "A two-component Meshtastic-based system for off-grid rural property coverage — Grain Tag (personal) and Grain Hub (home base)."
---

**Status: v1 reference designs complete. Schematics generated via KiCad Python S-expression builders.**

A two-component LoRa mesh network for rural property coverage. The Grain Seed Connection — the link between a personal mobile node and a stationary home base — provides off-grid messaging, position tracking, and WiFi bridging across properties where cellular coverage is unreliable.

## Components

### Grain Tag (Personal)
Mobile pocket device running Meshtastic for off-grid messaging and position tracking.

**v1 spec:** Heltec Wireless Tracker V1.1 (ESP32-S3 + SX1262 + GPS)
- 90 × 55 × 12mm, card-sized
- 603048 LiPo pouch (30-40hr battery)
- USB-C rechargeable, PCB antenna
- ~$25-30 DIY BOM

**v2 (planned):** Custom KiCad PCB with bare ESP32-S3 + SX1262 for a smaller, more power-efficient footprint.

### Grain Hub (Home Base)
Solar-powered outdoor node with WiFi bridging back to the internet.

**Option A (recommended):** RAK4631 (nRF52840) + RAK2305 WiFi module
- Modular WisBlock ecosystem — industrial-grade reliability
- 18650 × 2 or 26650 battery pack
- 5W solar panel, NEMA 4X enclosure
- High-gain external antenna (N-type)
- ~26 days autonomy in full shade

**Option B:** Heltec T114 + ESP32-C3 WiFi bridge
**Option C:** Same Tracker board design as Grain Tag

## Repository Structure

```
grain-tag/           — Heltec Tracker breakout schematics / v2 custom PCB
grain-hub/           — RAK4631 + solar + WiFi hub schematics
kicad_linter.py      — Schematic linter
references/          — RF reference docs, datasheets, routing patterns
```

Schematics are generated from Python S-expression builders for precision and repeatability. Each component directory has a `gen.py` that produces the `.kicad_sch` file.

## The Grain Seed Connection

The conceptual link between the personal Grain Tag and the home Grain Hub represents the core of the mesh: a reliable, low-bandwidth channel between a person in the field and their infrastructure. Messages, GPS coordinates, and sensor data flow over LoRa at 915 MHz, with the Hub bridging back to the internet via WiFi when available.

This is the same LoRa fallback channel used by the Tiny Hermes Robot — creating a unified off-grid communication layer across projects.

## Source Files

- **Repo:** `grainworks-lora/` (local)
- **README:** Full project README (local)
- **Grain Tag schematic:** `grain-tag/grain-tag.kicad_sch` (14KB)
- **Generator:** `grain-tag/gen.py`
- **References:** RF routing patterns, GX16 connector wiring, KiCad S-expression format

## Next Steps

- Place the JLCPCB order for Grain Tag v2 PCB
- Write Meshtastic node config scripts
- Build and test the Grain Hub solar enclosure
- Range test between Tag and Hub at various distances
