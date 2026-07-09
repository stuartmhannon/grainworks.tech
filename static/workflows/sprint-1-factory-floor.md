# Sprint 1: The Factory Floor
## Live Queue View + Chat Tab + Mezzanine View

### Vision
The workbench is the mezzanine overlooking the factory floor. You lean on the railing and *watch* the work move. Every task enters, progresses, completes — you see it in real time. When you want to talk to the floor, you type in the chat — it goes to the queue, the executor picks it up, you watch it flow.

### What ships

Three interconnected features, shipping together:

**1. Queue Board (kanban) — replaces the `cat queue.json` workflow**
- Three columns: PENDING → IN PROGRESS → COMPLETED
- Each card shows: title, priority (color-coded), source, age
- Click a card to see full detail (goal, context, output)
- Drag PENDING cards to reorder priority
- "Add task" button at the top of PENDING column
- Auto-refreshes every 15s from synced data
- Latest COMPLETED slides into view with a brief flash animation

**2. Chat Tab — replaces Hermes Desktop for daily use**
- Persistent chat sessions in localStorage
- Message input with Enter to send
- Streaming SSE responses rendered incrementally
- Session list in sidebar (title from first message, message count)
- Model picker from `/v1/models` endpoint
- Quick actions: "queue: ..." auto-sends to task queue, "status" returns live system snapshot
- Connects through Tower nginx → Tailscale → Mac Hermes API (no CORS needed)

**3. Mezzanine View — factory floor live feed in the Projects tab header**
- Project tab header shows: active task count, pending count, executor last tick
- Status indicator shows whether the task executor is running, waiting, or idle
- Latest completed task appears as a toast/notification

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  workbench.camel-hoki.ts.net                                │
│                                                             │
│  Sidebar: [◈ Workflows] [⧉ Projects] [◐ Library]          │
│          [◉ Chat*] [◉ Agents] [▤ Logs] [✎ Builder]        │
│                                                             │
│  ┌─── Queue View (projects tab header) ──────────────────┐  │
│  │  PENDING      │  IN PROGRESS   │  COMPLETED           │  │
│  │  ┌──────────┐ │  ┌──────────┐  │  ┌───────────────┐   │  │
│  │  │ #3: fix  │ │  │ #1:      │  │  │ #2: weather   │   │  │
│  │  │ DRC      │ │  │ weather  │  │  │ 75°F, partly  │   │  │
│  │  │ ⚡high   │ │  │ ◉live    │  │  │ cloudy ✓      │   │  │
│  │  └──────────┘ │  └──────────┘  │  └───────────────┘   │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌─── Chat Tab ──────────────────────────────────────────┐  │
│  │                                                       │  │
│  │  [user] queue up: research GrainDrop JLCPCB pricing   │  │
│  │  [hermes] ✓ Task added to queue (#4). The executor    │  │
│  │           will pick it up within 5 minutes.           │  │
│  │                                                       │  │
│  │  ◐ Type a message... [Send]                           │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
       ▲                          ▲
       │ Tower nginx proxy        │ Tower nginx proxy
       ▼                          ▼
  ┌────────────────┐    ┌─────────────────────────┐
  │  data/*.json   │    │  Mac Hermes API         │
  │  (synced       │    │  /v1/chat/completions    │
  │   every hour)  │    │  /v1/models              │
  └────────────────┘    └─────────────────────────┘
```

### Data flow

**Queue View:**
1. `sync-workbench-data.sh` runs hourly → generates `data/tasks.json` (pending + in_progress snapshots)
2. For near-real-time, a no_agent cron runs every 30s on the Mac → SCPs a tiny `data/task-live.json` (just current task IDs and statuses)
3. Queue View JS polls `data/tasks.json` every 15s via `fetch` with cache-bust
4. When a task transitions pending→in_progress→completed, the card animates between columns

**Chat Tab:**
1. JS constructs a POST to `/v1/chat/completions` with the message history
2. Tower nginx proxies to Mac Hermes API at `100.66.56.29:8643`
3. SSE stream renders incrementally in the chat view
4. Messages stored in localStorage per session
5. When message contains "queue:" or "add task", JS also makes a background call to the sync script to update the task queue

### Files changed / created

| File | Action | Lines | Purpose |
|------|--------|-------|---------|
| `index.html` | Edit | +15 | Add Chat tab to sidebar + nav, add queue section to Projects tab |
| `css/style.css` | Edit | +200 | Kanban board styles, chat bubbles, queue cards, streaming indicator |
| `js/queue-panel.js` | **New** | ~300 | Kanban board: columns, cards, drag-reorder, add-task form, auto-refresh |
| `js/chat-panel.js` | **New** | ~350 | Chat sessions, SSE streaming, message history, model picker, quick actions |
| `js/projects-panel.js` | Edit | +50 | Header shows task counts + latest completed |
| `~/.hermes/scripts/collect-workbench-data.py` | Edit | +5 | Already has `collect_tasks()` — just needs to be wired |
| `~/.hermes/scripts/sync-workbench-data.sh` | Edit | +5 | Already syncs tasks.json — verify it's copying |

### Effort estimate

| Feature | Complexity | Est. lines | Key risk |
|---------|-----------|------------|----------|
| Queue Panel | Medium | ~300 | Drag-and-drop on vanilla JS is fiddly |
| Chat Panel | High | ~350 | SSE streaming rendering, auth, session management |
| Nginx proxy for API | Low | ~10 | Already verified working |
| CSS | Low | ~200 | Mostly terminal aesthetic variations |
| **Total** | | **~860 + integration** | Chat streaming reliability on Tailscale |

### Testing plan

1. **Queue panel**: Load workbench → verify PENDING column shows test task. Add task via form → verify it appears. Refresh → verify persistence.
2. **Chat tab**: Type "hello" → verify SSE stream renders. Check session persists after page reload. Check model picker populates.
3. **Chat → queue**: Type "queue up: test task from chat" → verify task appears in PENDING column (may take 5m for executor).
4. **Proxy**: `curl https://workbench.camel-hoki.ts.net/v1/models` returns model list.

### Gotchas to document after building

Each of these is unknown until we actually build. I will document:
- Does Tower nginx proxy handle SSE streaming correctly (no buffering, no timeout)?
- Does localStorage have enough quota for chat history?
- Does the vanilla JS drag-and-drop work reliably on mobile Safari (iPad)?
- How fast does the 30s live-sync cron actually propagate?

---

Approved? Then I execute: write the plan as tasks in the queue, build queue-panel.js first, then chat-panel.js, then integration.
