---
title: "Josh.ai + Hermes Agent Relay"
date: 2026-06-15T12:30:00-04:00
draft: false
description: "A lightweight HTTP relay that bridges Josh.ai scenes to Hermes Agent — converts plain GET requests from Josh's httpget() Custom Command into authenticated POST calls for the Hermes webhook system."
---

A minimal Python relay that connects Josh.ai's scene system to Hermes Agent. Josh scenes can fire `httpget()` Custom Commands, which are plain HTTP GET requests with no auth headers and no POST body. This relay sits between them — it accepts the GET, wraps it as a signed POST with HMAC-SHA256, and forwards it to the Hermes webhook. It can also fire a response scene via the Josh External Scene API for confirmation feedback.

## Source Files

- [josh_relay.py](/projects/josh-relay/josh_relay.py) — 142-line asyncio Python relay, zero external dependencies
- [Integration Guide](/projects/josh-relay/hermes-agent-integration.txt) — setup instructions in Josh.ai FAQ format

## How It Works

```
Voice: "Ok Josh, ask hermes"
  → Scene fires httpget("http://[relay]:8645/hermes-request")
  → Relay converts GET → signed POST → Hermes webhook
  → Relay fires callback scene → confirmation (lights, chime, etc.)
```

## Quick Start

```bash
# Download the relay
curl -O https://grainworks.tech/projects/josh-relay/josh_relay.py

# Configure
export JOSH_WEBHOOK_URL="http://localhost:8644/webhooks/josh-trigger"
export JOSH_WEBHOOK_SECRET="your-webhook-secret"

# Start
python3 josh_relay.py
```

## Requirements

- Python 3.10+
- Hermes Agent with webhook platform enabled
- Josh Core or Josh One (Nimble DevSuite not required)

## Configuration

All configuration is via environment variables:

| Variable | Default | Description |
|---|---|---|
| `JOSH_WEBHOOK_URL` | `http://localhost:8644/webhooks/josh-trigger` | Hermes webhook endpoint |
| `JOSH_WEBHOOK_SECRET` | (required) | HMAC-SHA256 secret for webhook auth |
| `JOSH_RELAY_PORT` | `8645` | Port the relay listens on |
| `JOSH_RELAY_HOST` | `0.0.0.0` | Bind address |
| `JOSH_CALLBACK_URL` | (optional) | Josh External Scene API URL for response confirmation |
| `JOSH_RELAY_PID_FILE` | `/tmp/josh_relay.pid` | PID file path |
| `JOSH_RELAY_LOG_FILE` | `/tmp/josh_relay.log` | Log file path |

## Design Notes

The key architectural constraint is that Josh's `httpget()` Custom Command:

- Sends **GET only** (no POST, no PUT)
- Carries **no auth headers** (no API keys, no HMAC)
- Returns a **202 response immediately** — Josh does not process the response body

This means any service that expects authenticated POST (like Hermes Agent's webhook) needs a translation layer. The relay is that layer. The response scene callback is required because Josh itself won't do anything with the relay's response — you need a separate scene to provide audible or visual confirmation.

## Status → **✅ Shipped**

Built and tested June 15, 2026. Running under launchd for auto-start on macOS. Published to share the pattern with the Josh.ai and Hermes communities.

**[Read the integration guide →](/projects/josh-relay/hermes-agent-integration.txt)**
