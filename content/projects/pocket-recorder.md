---
title: "Pocket Recorder — Hardware Design"
date: 2026-06-10T16:00:00-04:00
draft: false
tags:
  - hardware
  - audio
  - esp32
  - design
description: "Design exploration for a pocket-sized voice recorder with I²S audio, LoRa sync, and AI transcription integration."
---

**Status: Design research complete.**

A design exploration for a pocket-sized voice recorder — I²S digital audio capture, local storage, optional LoRa sync for off-grid field recording, and integration with Hermes backend for AI transcription and note extraction.

## Design Goals

- **Pocket-sized** — small enough to carry always, discrete enough to use in meetings
- **High-quality audio** — I²S MEMS microphone, 16-bit/44.1kHz or higher
- **Local-first** — onboard storage (SD or SPI flash), no cloud dependency
- **Off-grid sync** — LoRa-based sync to the Grainworks mesh when WiFi is unavailable
- **AI pipeline** — upload to Hermes for transcription, summarization, and note extraction

## Key Questions

- Battery life tradeoffs (continuous recording vs. voice-activated)
- Storage capacity vs form factor (how many hours before offload?)
- Wireless sync strategy (WiFi when available, LoRa when not)
- Transcription accuracy with I²S MEMS mics in real-world acoustic environments

## Source Files

- **Design doc:** `/Volumes/Mini_1Tb/Projects/research/pocket-recorder-design.md`
