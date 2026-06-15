---
title: "Building StatBar: A Native macOS System Monitor in One Day"
date: 2026-06-15
description: "A walkthrough of building a floating system monitor panel — from a blank terminal to a config-driven, MCP-controllable macOS app in a single session."
author: "Hermes Hannon"
draft: false
tags: ["macos", "swift", "system-monitor", "mcp", "hermes-agent"]
---

StatBar is a floating macOS system monitor built in about two and a half hours on June 15, 2026. It lives at the bottom-left corner of the screen: a 250px-wide translucent panel showing CPU, GPU, Memory, Network, Disk utilization, and running Ollama models, refreshing every two seconds. The entire thing compiles with `swiftc` — no Xcode project, no package manager, no dependencies beyond the macOS SDK.

## The Framework

The initial specification was straightforward but deliberate: a native floating panel (not a menu bar app or web-based dashboard), reading hardware counters directly through Mach and IOKit APIs, rendered in SwiftUI hosted on a borderless NSWindow. No Electron, no web views, no polling shell commands. CPU from two-sample `host_statistics` deltas, memory from `vm_statistics64`, GPU core utilization from the IOKit AGXAccelerator performance counters, network rates from `getifaddrs`, disk from filesystem attributes, and Ollama state from the local API. All collected on a background queue so the UI never freezes. Compiled with `swiftc -O -target arm64-apple-macosx26.0 -parse-as-library` — one file, one shell script, zero Xcode involvement.

## The Build Sequence

The first working version (v0.1.0) produced the panel with hardcoded positions and colors. From there the iteration was rapid and layered. The config system (v2.0) replaced every hardcoded value with a JSON file at `~/.config/statbar/config.json`, hot-reloaded via a `DispatchSource.makeFileSystemObjectSource` file watcher — change the file, the panel updates within one second, including window position, colors, opacity, and section ordering. Next came the MCP server (`statbar-mcp`): a pure Python stdlib JSON-RPC 2.0 server with four tools — get config, update config (partial deep-merge), reset to defaults, and check running status. This let Hermes move, recolor, reconfigure, or reorder the panel entirely through tool calls, with no file editing by hand. A code audit then caught a kernel memory leak (missing `deallocate()` on the CPU data path), a main-thread freeze from synchronous Ollama polling, and a trailing separator in the section layout. A Ponytail review pass stripped 98 lines of dead code, inlined redundant wrappers, and consolidated five JSON-RPC boilerplate sites into two helpers. The final v0.1.4 patch fixed CPU percentage formatting — one decimal place below 10%, integer above.

## Time and Cost

The entire build, from first compilation to v0.1.4, took approximately two and a half hours on a single day. The agent — running DeepSeek via Hermes — consumed about $0.40 in API tokens across roughly 1.5 sessions of iterative planning, code generation, debugging, and code review. The compiler, the macOS SDK, the Mach and IOKit APIs, and the Ollama runtime were all local and free. The MCP server is 345 lines of Python with zero dependencies. The Swift binary is 701 lines, no libraries beyond Foundation, AppKit, SwiftUI, and IOKit. Total project cost: $0.40.

## The Tool Stack

The development relied on a handful of platforms and techniques. Hermes Agent provided the interaction layer — planning, code generation, terminal execution, file editing, and tool orchestration. Swift and SwiftUI handled the native macOS rendering and event loop, with AppKit for the borderless window. Mach APIs (`host_statistics`, `vm_statistics64`) fed CPU and memory data. IOKit's `AGXAccelerator` performance counters reported GPU core utilization. `getifaddrs` provided interface byte counters with rate calculation. The Ollama `/api/ps` endpoint listed running models. The MCP server used pure Python's `json` and `os` modules — no PyPI dependencies. The Ponytail skill (based on DietrichGebert/ponytail) ran as a parallel subagent and delivered a code review pass that cut nearly a hundred lines without changing behavior. `CGWindowListCopyWindowInfo` from CoreGraphics verified live window state. The compile script is a 33-line bash file.

## What We Learned

Several lessons surfaced across the iterations. First: a config write returning success does not mean the change took effect. The MCP returned "written to file" while the window sat unmoved — the file watcher's first build only reapplied appearance properties, not the window frame. The second build used an atomic rename (write to temp file, rename to config), which orphaned the `DispatchSource` file descriptor pinned to the old inode. The fix was straightforward — direct write to the config file path and re-opening the file descriptor on each watch event — but the pattern generalizes beyond this project: always verify live state with a system API probe before reporting success. Second, `replace_all=True` with a short version string in `Info.plist` is dangerous: patching "0.1.3" also rewrote `LSMinimumSystemVersion` ("14.0" → "0.1.4"). Third, a generation counter guard — incrementing a counter before dispatching background work and checking it when the result returns — cleanly prevents stale async results from corrupting the UI after overlapping refresh cycles. And fourth, a native macOS app with real hardware counters, a hot-reloaded config system, and a language-model-controlled MCP interface can be built from scratch in a few hours for under a dollar.
