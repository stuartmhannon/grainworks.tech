---
title: "Pocket Recorder — v0.5 Hardware Proto"
date: 2026-06-16T18:00:00-04:00
draft: false
status: "Prototype"
tags:
  - hardware
  - audio
  - esp32
  - proto
description: "A bare-PCB voice recorder with a slider switch. Slide on to record a meeting, slide off to stop. USB-C powered, WiFi sync to Hermes for transcription and note extraction."
---

**Status: Design written. Path A (dev board + modules) costs ~$25 and takes one evening to wire.**

A functional prototype of a minimalist voice recorder — one slider switch, no screen, no case, no battery. Set it on a table during a meeting, slide to record, slide off when done. Audio syncs over WiFi to Hermes Agent for transcription, classification, and routing.

This is v0.5 — the *working hardware proto* phase. Everything extraneous has been cut: enclosures, seals, batteries, gesture detection, graceful power-loss protection, BLE, OTA. Just the bare minimum that records audio and syncs it.

## Design Decisions

- **Slider switch over button** — ON records, OFF stops. No press-and-hold, no double-tap, no debounce. Anyone can use it.
- **USB-C powered** — always plugged in for v0.5. Battery comes in v1.
- **Bare PCB** — no case, no IP rating, no sealing. Proto only.
- **Hardcoded WiFi** — credentials set at flash time. Captive portal in v1.
- **16 kHz mono WAV** — Whisper-standard, 1.8 MB/min, 290 hours on 32GB SD.

## BOM (two paths)

- **Path A:** ESP32-S3 dev board + INMP441 breakout + SD module + slide switch = ~$25. One evening on a breadboard.
- **Path B:** Custom PCB at JLCPCB = $2 for 5 boards, ~2 weeks turnaround.

## Source Files

- **Design doc:** `pocket-recorder-design.md` (local)
