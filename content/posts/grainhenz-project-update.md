---
title: "Project Update: Grainhenz — The Two-Node Mesh"
date: 2026-07-08
draft: true
tags:
  - hardware
  - meshtastic
  - iot
  - grainhenz
  - project-update
description: "Two Adeept ESP32 LoRa V4 nodes, one yard and one desk, forming the first permanent Meshtastic mesh at grainworks."
---

Since the last update, the grainhenz project has moved from prototype to permanent installation.

## The Current State

Two nodes, both Adeept ESP32 LoRa V4 boards (Heltec V4 clones), form a functional Meshtastic mesh:

**Grainhenz00** — the yard node. This one is destined for permanent outdoor installation inside a solar motion-sensor light housing, powered from a 12V to 5V buck converter. It's currently on the test bench, charging, and connected to WiFi. When it goes live in the yard, it will be the primary outdoor relay node. Channel: Grainworks (primary).

**Grainhenz01** — the desk node. Connected to the Mac Mini via USB, running the Meshtastic bridge daemon. This is the gateway into the mesh. It listens on two channels: Grainworks (primary) and LongFast (secondary). All outgoing messages from the grainworks backend pass through this node. All mesh traffic enters through it.

## The Bridge

The Meshtastic bridge runs as a Python HTTP server on port 8647, connected to Grainhenz01's serial interface. It exposes four endpoints:

- `/health` — bridge status, node connectivity
- `/nodes` — visible mesh nodes with last-heard timestamps and SNR
- `/send` — send a text string over LoRa
- `/recent` — last N messages received from the mesh

The bridge uses the Meshtastic Python SDK directly (v2.7.10), communicating over the USB serial protocol. No MQTT, no cloud relay. The mesh traffic stays in the mesh.

## What's Working

- **Two-way LoRa messaging.** Messages sent from either node arrive at the other, confirmed by SNR readings and last-heard timestamps.
- **Bridge integration.** The grainworks backend can send messages into the mesh programmatically. Polling and auto-responder infrastructure is ready.
- **Channel separation.** Grainworks channel carries internal traffic; LongFast provides a fallback path to the wider Mesa network.

## What's Next

- **Grainhenz00 goes permanent.** The solar light housing is built, the LM2596 buck converter is staged. Once mounted, Grainhenz00 becomes a weatherproof 24/7 outdoor node.
- **Mesh autochannel.** Exploring Meshtastic's channel mapping for automated cross-mesh routing between Grainworks and LongFast.
- **Telemetry sensors.** The Heltec V4 has onboard environmental sensors. Once Grainhenz00 is permanently deployed, it can relay temperature, humidity, and pressure readings over the mesh.

The two-node mesh is live, and the bridge is the gateway. Next step: make Grainhenz00 an outdoor citizen.
