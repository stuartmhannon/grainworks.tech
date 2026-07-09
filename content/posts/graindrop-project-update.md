---
title: "Project Update: GrainDrop v0.5 — JLCPCB Ready"
date: 2026-07-08
draft: true
tags:
  - hardware
  - pcb
  - kicad
  - graindrop
  - project-update
description: "The first grainworks PCB design has cleared fabrication review. Gerbers, BOM, and CPL are exported and validated."
---

GrainDrop v0.5 — a pocket-sized ESP32-S3 audio recorder with a single SPDT slide switch — is ready for fabrication.

## The Design

The board is a 90×51mm two-layer design with the following architecture:

- **ESP32-S3-WROOM-1** as the main processor (16MB flash, 8MB PSRAM)
- **INMP441** MEMS microphone (I²S interface)
- **RT9080-33** LDO regulator for 3.3V rail
- **MicroSD slot** for on-device storage
- **USB-C** for power and programming (USB OTG direct)
- **SPDT slide switch** — the only control. Slide to record, slide to stop. No screen, no buttons, no menus.
- **Indicator LED** for power/status
- **GND copper pour** on the bottom layer with stitching vias

## The Routing

After several rounds of manual layout in KiCad, we discovered FreeRouting — a Java-based autorouter that reads Specctra DSN format. The workflow: export DSN from pcbnew, pipe through `java -jar freerouting.jar -de .dsn -do .ses`, then import the SES back. It routed 37 nets across the two-layer board in about 3 seconds. 0 unconnected items. 8 cosmetic DRC violations (silkscreen clearance and pad-over-courtyard — non-critical).

SES import has a quirk: it wipes all USB-C pad net assignments. They must be restored via .kicad_pcb direct edit before re-routing. Learning this cost a session. Noted for v0.6.

## Fabrication Package

- **Gerbers:** 9 files, 16KB zip, exported from KiCad at board origin
- **BOM:** 11 SMD components + 1 through-hole switch
- **CPL:** JLCPCB-standard placement file with coordinates and rotation
- **Board outline:** 90×51mm, 2.5mm radius corners, 4×M3 mounting holes at 4mm inset
- **Assembly:** JLCPCB basic assembly for all SMD parts

Total for 5 assembled boards: **$207.40** ($41.48/board).

## The One Blocker

The INMP441 MEMS microphone is out of stock at JLCPCB. This means either hand-soldering the mics on the assembled boards (they're 3×4mm DFN packages — fiddly but doable with hot air), or waiting for restock and placing a separate order.

## What v0.6 Would Change

- **Shrink the footprint.** The business-card shape was generous for the first board. A denser layout could fit the same components in half the area.
- **Consider MINI-1 module.** The ESP32-S3-MINI-1 is smaller but loses USB OTG pins — trading direct programming for form factor.
- **Revisit the mic.** The INMP441 works. The SensiBel SBM100B (optical MEMS) is a potential upgrade: 80 dBA SNR, 132 dB dynamic range, 146 dB SPL AOP, 10 Hz LF roll-off. Four times the performance. Also costs four times as much.

The design is published as open source under MIT license. All files — schematic generator, KiCad project, Gerbers, BOM, CPL — are available.

[grainworks.tech/projects/graindrop/](https://grainworks.tech/projects/graindrop/)
