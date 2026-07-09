---
title: "Agent Stack Architecture — Six Layers of grainworks"
date: 2026-06-29T06:00:00-04:00
draft: false
description: "A 1-page visual architecture map of the grainworks agent stack: orchestration, memory, tool mesh, evaluation, pipelines, and delivery. Every component we've built lives in one layer."
tags: [grainworks, architecture, agents, portfolio]
---

A 1-page visual architecture of everything we've built — organized into six layers from the reasoning core to the user-facing delivery surface. Every component lives in exactly one layer with defined data flow between them.

**[View the architecture diagram →](/projects/architecture/)**

## The Six Layers

### Layer 1 — Orchestration
The brains. Hermes Agent routes, reasons, and delegates. The Organizational Orchestrator (V2.4/2.5) classifies intent and routes to 19 domain subagents. The skill system (60+ skills) and MCP gateway keep the reasoning at the center.

### Layer 2 — Memory
Persistent context that survives across sessions. ContextVault (Swift CLI) intercepts and indexes prompts. The session DB and fact store (SQLite + FTS5) underpin `session_search` for cross-session recall.

### Layer 3 — Tool Mesh
Every MCP server we've built or connected: StatBar (macOS monitor), Josh Relay (voice bridge), the Arr suite (Radarr/Sonarr/Lidarr/Prowlarr), Unraid (server management), Chipotle (ordering), Porkbun (DNS/domains), MyAnonamouse (torrents), Google Workspace, Linear, Notion, and more.

### Layer 4 — Evaluation
Quality measurement. The golden task dataset (30 curated eval tasks), the eval CLI for pass/fail/cost/latency analysis, and the regression CI suite that catches regressions before they ship. This layer is Month 2's primary build target.

### Layer 5 — Pipelines
Automated processing driven by the cron fleet: email screener (classify → action), Obsidian inbox (raw notes → structured notes), morning briefing (daily aggregate → delivery), workflow store (DAG indexing, route activity).

### Layer 6 — Delivery
How work reaches the user. grainworks.tech (Hugo SSG for the portfolio), the Workbench SPA (v0.9, 10+ panels), iMessage bridge (verified delivery), email delivery via Gmail API, and RSS/Telegram for cron output.

## What the Map Shows

Data flows upward: orchestration consults memory, invokes tools, runs evaluations, feeds pipelines, and delivers results. Each layer has a defined responsibility and explicit interface to adjacent layers.

**Status → 🟢 Published**

Interactive SVG diagram at [/projects/architecture/](/projects/architecture/) — open in any browser, works offline.
