---
title: "RadarTV — Raspberry Pi RF-to-Composite Video Broadcast"
date: 2026-06-29T06:00:00-04:00
draft: false
description: "A C-based composite video generator that reads aviation radar data and renders it as PAL/NTSC video output from a Raspberry Pi — direct RF to analog TV."
tags: [hardware, raspberry-pi, video, radar, c, embedded]
---

A composite video signal generator running on a Raspberry Pi. It reads live aviation radar data (from an RTL-SDR or similar receiver), renders a radar sweep display, and outputs the result as a PAL composite video signal — viewable on any analog TV or monitor with composite input.

## Architecture

```
RTL-SDR (1090 MHz ADS-B)
  → Pi reads aircraft positions
  → radartv.c renders radar sweep + blips in 640×480 framebuffer
  → GPIO composite output (PAL/NTSC via Pi's TV out)
  → Analog TV: real-time radar display
```

All rendering is done in C with direct framebuffer access. No GPU, no X11, no desktop. The composite output is generated via the Pi's native TV-out circuitry using `pwm_ir_tx` pin for video and `pcm_clk` for audio sync.

## Source Files

- **`radartv.c`** — ~800 lines of C: composite sync generation, radar sweep rendering, aircraft blip drawing, font rendering (font8x16.inc)
- **`radartv.conf`** — Configuration: center frequency, line mode (PAL/NTSC), test pattern
- **`compile.sh`** — GCC build with `-O2 -march=armv6`
- **`install.sh`** — Systemd service setup, auto-start on boot

## Features

- Real-time radar sweep with persistent trail (fading blips)
- Aircraft tags: callsign, altitude, speed, squawk
- Test pattern mode for display calibration
- Configurable: line standard, color burst, scan rate
- LCD/little display mode via `/dev/fb0` for direct HDMI
- Systemd service for headless operation

## The Hardware

- Raspberry Pi 3B+ (or any Pi with composite out)
- RTL-SDR dongle for ADS-B reception
- 3.5mm TRRS cable → composite video input
- 5V USB power

## What Was Learned

- Composite video timing to the microsecond: front porch, sync pulse, back porch, active video
- PAL color subcarrier generation (4.43361875 MHz — 283.75 cycles per line + 25 Hz offset)
- Pi's firmware-dictated TV-out configuration via `config.txt` (pwm_ir_tx, pcm_clk, tvservice)
- The difference between interlaced vs progressive scan and how to pick based on display
- Analog video is a solved problem but has zero documentation for modern software engineers

## Status → **✅ Shipped / Running**

Deployed as a systemd service on a Pi 3B+. Composite output to a 14" CRT in the workshop. Available as a reference for any Pi→composite video project.
