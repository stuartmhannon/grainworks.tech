# Workbench v0.5 — Chat Interface (Hermes Desktop replacement)

## Architecture

```
Browser (Tower nginx)
  → fetch POST https://stuarts-mac-mini-1.camel-hoki.ts.net/v1/chat/completions
  → Authorization: Bearer <api_key>
  → stream: true (SSE)
  → Render streaming response in chat UI
```

The browser talks **directly** to the Mac Mini's Hermes API via Tailscale MagicDNS. No Tower-side relay needed — Dad is always on the tailnet.

## API

- **Base URL:** `https://stuarts-mac-mini-1.camel-hoki.ts.net/v1`
- **Chat:** `POST /v1/chat/completions` with `Authorization: Bearer <key>`
- **Models:** `GET /v1/models` with `Authorization: Bearer <key>`
- **Streaming:** SSE via `stream: true` in the request body
- **API Key:** `6h4JX3S1jylzdUHh1mRhBk5K9s8wCMzmlKb3FGdT9t0`

## Data model (client-side)

```javascript
let sessions = {
  current: 'session-id',
  list: [
    { id, title, created, messageCount }
  ]
};

let messages = [
  { role: 'user' | 'assistant', content: string, timestamp: number }
];
```

Messages are stored in `localStorage` per session. No backend persistence — the workbench is a UI, not a data store. Each session is a JSON blob in localStorage.

## UI Layout

```
┌──────────────────────────────────────────────────┐
│  ◐ chat  [New] [▼ session-1 ...]  [model ▼]    │
├──────────────────────────────────────────────────┤
│                                                  │
│  ┌──────────────────────────────────────────┐    │
│  │ user  │ hello                            │    │
│  │ ──────┼──────────────────────────────────│    │
│  │ hermes│ Ready when you are.              │    │
│  │       │                                  │    │
│  │       │ (streaming dots while waiting)   │    │
│  └──────────────────────────────────────────┘    │
│                                                  │
│  ┌──────────────────────────────────────────┐    │
│  │ ◐ Type a message...              [Send]  │    │
│  └──────────────────────────────────────────┘    │
└──────────────────────────────────────────────────┘
```

## Streaming (SSE)

The Hermes API returns SSE when `stream: true`. Each event is:
```
data: {"choices":[{"delta":{"content":"..."}}]}

data: [DONE]
```

The UI appends content incrementally as chunks arrive.

## Features in v0.5

1. **Chat view** — message list with user/assistant bubbles, streaming
2. **Message input** — textarea + Send button, Enter to send
3. **Session management** — localStorage-backed, new session button, session list
4. **Model picker** — fetch from `/v1/models`, show in dropdown
5. **Session title** — auto-generated from first user message (truncated)

## What v0.5 does NOT ship

- No tool execution display (v0.6)
- No notifications (v0.7)
- No file uploads or attachments
- No system prompt editor
