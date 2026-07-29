---
title: "Audio Lighting Sim v2"
date: 2026-07-28
draft: false
status: Live
project_tags: ["simulation", "audio", "lighting", "three.js", "ipad"]
summary: "Browser-based audio-lighting coverage simulator. Upload a floor plan, draw zones, place fixtures and speakers, get coverage heatmaps and BOMs."
---

Browser-based audio-lighting coverage simulator. Zero-server, zero-build, runs on any laptop or iPad on tradeshow wifi.

**Upload a floor plan** → calibrate scale → draw room zones → place fixtures and speakers (drag presets or upload real IES/GLL files) → toggle between light and sound coverage layers → export a hierarchical BOM or 3D GLTF for trades.

## Features

- **Floor plan + scale tool** — upload any image, click two points, enter real dimension
- **Zone polygon drawing** — define rooms with click-and-close boundaries, set room heights
- **Fixture/speaker placement** — built-in presets or upload real IES and GLL files
- **AFF/AAS mounting** — per-entity Above Finished Floor or Above Adjacent Surface
- **Layer toggle** — Light / Sound / Both coverage heatmaps with resolution and sensitivity sliders
- **Hierarchical BOM** — per-zone grouped bill of materials, CSV export
- **3D export** — GLTF extrusion with zone volumes and entities at correct mounting heights
- **Local storage** — save/load projects in the browser
- **Zero dependencies** — no build step, no server, no npm

## Tech

Pure ES modules. Three.js from CDN. Tested with 125 unit tests covering calibration math, point-in-polygon, AFF/AAS resolution, entity lifecycle, BOM generation, and state serialization.

[Launch the simulator](/static/audio-lighting-sim-v2/) &rarr;
