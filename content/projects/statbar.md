---
title: "StatBar — Native macOS System Monitor"
date: 2026-06-15T16:00:00-04:00
draft: false
description: "A native macOS floating system monitor — CPU, GPU, Memory, Network, Disk, and Ollama models, all config-driven with a Hermes MCP interface."
---

A floating macOS system monitor that lives in the corner of your screen. 250px-wide translucent panel showing CPU, GPU, Memory, Network, Disk utilization, and running Ollama models, refreshed every two seconds. All hardware counters read directly through Mach and IOKit APIs — no shell commands, no polling overhead.

## Source Files

The complete v0.1.4 source — compiled with `swiftc`, no Xcode required.

- [StatBar.swift](/projects/statbar/StatBar.swift) — 701 lines of Swift/SwiftUI, config-driven
- [statbar-mcp](/projects/statbar/statbar-mcp) — 345-line Python MCP server, zero dependencies
- [compile.sh](/projects/statbar/compile.sh) — build script, deploys binary and MCP server
- [Info.plist](/projects/statbar/Info.plist) — application bundle metadata

## Build & Run

```bash
cd /Volumes/Mini_1Tb/Projects/statbar
bash compile.sh
open StatBar.app
```

All configuration is MCP-only — the config file auto-creates on first launch with sensible defaults. Never hand-edit a JSON file.

## Features

- **6 hardware stats**: CPU (two-sample host_statistics delta), GPU (IOKit AGXAccelerator), Memory (vm_statistics64), Network (getifaddrs rate calc), Disk, Ollama models
- **Config-driven layout**: every parameter — position, colors, opacity, section ordering — is in `~/.config/statbar/config.json`, hot-reloaded via DispatchSource file watcher
- **MCP interface**: 4 tools (`statbar_get_config`, `statbar_update_config`, `statbar_reset_config`, `statbar_get_status`) via Hermes Agent
- **No Xcode**: compiled with `swiftc -O -target arm64-apple-macosx26.0 -parse-as-library`
- **Main-thread safe**: stat collection on `DispatchQueue.global(qos:.utility)` with generation counter guard against stale async results
- **Login Item**: auto-launches on boot

## Configuration (via MCP Only)

25 parameters across 6 groups: window geometry, appearance (colors, opacity, shadow), per-stat visibility, 7+ hex colors, section ordering, refresh interval (≥0.5s), and Ollama endpoint.

Move it, recolor it, reorder it, speed it up — all through `statbar_update_config` with partial JSON merges. Example:

```json
{"window": {"x": 1670}, "stats": {"cpu_color": "#FF9500"}}
```

Changes take effect within ~1 second via the file watcher.

## Dependencies

- macOS 14.0+ (Apple Silicon)
- Swift 6+ (self-hosted via Xcode Command Line Tools or full Xcode)
- Python 3.x (for MCP server — stdlib only)

## Status → **✅ Shipped**

Built from scratch in ~2.5 hours on June 15, 2026. Version 0.1.4 is running, verified, and logged as a login item. Clean build, zero warnings, publishable source — no personal info in the codebase.

**[Read the full build log →](/posts/statbar-build-log/)**
