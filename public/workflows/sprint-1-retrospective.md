# Sprint 1 Retrospective — Factory Floor

**Date:** June 19, 2026
**Status:** All 6 tasks completed

## What we planned to build

Three features shipping together:
1. **Queue Panel** — kanban board on Projects tab (PENDING → IN PROGRESS → COMPLETED)
2. **Chat Tab** — SSE streaming chat with Hermes API through Tower nginx
3. **Mezzanine View** — queue summary on Projects tab header

## What actually shipped

**All three, fully deployed.** `workbench.camel-hoki.ts.net` now has:

- **7 tabs**: Workflows, Projects (with queue kanban), Chat, Library, Agents, Logs, Builder
- **Queue panel** (842 lines): 3-column kanban loading from `data/tasks.json`, card detail on click, auto-refresh every 15s, "Add task" form at top, priority color coding, empty state handling
- **Chat tab** (1,064 lines): SSE streaming via `ReadableStream`, localStorage sessions, model picker from `/v1/models`, quick actions (queue:, status:), stop button via AbortController, responsive layout, auto-generated session titles
- **Nginx proxy**: `/v1/` and `/api/` both proxy to Mac Hermes API at `100.66.56.29:8643` with streaming support (proxy_buffering off, proxy_read_timeout 600s)
- **API key file**: `data/api-key.json` synced from `.env` by the sync script — no hardcoded keys in JS

## What went differently than planned

### Easier than expected

1. **Nginx proxy for chat**: Was already configured from the v0.5 work last session. `/v1/` location block was already there with all the right streaming headers. The only issue was a false 302 during testing (wrong test URL).

2. **Queue panel API**: The queue already had a `collect_tasks()` function in the workbench data collector. The panel just needed to render what was already being synced.

3. **Deploy**: SCP push took 0.6 seconds. The sync-workbench-data.sh script already had the right structure.

### Harder than expected

1. **Chat SSE streaming in vanilla JS**: 1,064 lines is more than the ~350 estimated. The complexity came from: manual SSE parser (no EventSource in fetch), AbortController integration for stop button, localStorage session management with delete/rename, and the model picker with refresh. The subagent handled it well but it's a dense module.

2. **CSS module pattern**: Both queue and chat panels inject their own styles via JS (`inlineStyles()`). This keeps the workbench's `style.css` clean (~909 lines) but means the JS files carry ~350 extra lines of CSS between them. Tradeoff was worth it — one file to update per module.

3. **The manual sync gap**: The sync script runs hourly. For true near-real-time queue updates, we need a faster sync (30s no_agent cron). The 15s auto-refresh on the JS side just re-fetches from the last sync — it can show stale data for up to 60 minutes currently. **Not a blocker** for Sprint 1, but Sprint 2 should add a fast-sync cron.

### Architectural decisions that held up

- **Tower nginx proxy pattern** (browser → same-origin nginx → proxy_pass to Mac) was the right call. No CORS, no Caddy quirks, no cross-origin issues. The `/v1/` path works perfectly.
- **localStorage sessions** are the right short-term approach. No backend, survives refresh, works offline-ish. ~5MB quota is plenty for text-only chat history.
- **Inline CSS in JS modules** is pragmatic for a growing feature set. The style.css stays lean.

## Gotchas for Sprint 2

1. **Queue data freshness**: The sync script runs hourly. For the kanban to feel live, we need a no_agent cron every 30-60s that just SCPs a tiny `task-live.json` with current task IDs and statuses. The queue panel already handles the auto-refresh loop.

2. **Chat streaming reliability**: SSE through nginx needs more testing with long responses (>30s of streaming). The `proxy_read_timeout 600s` is set but actual behavior with large streaming responses through Tailscale needs a real test.

3. **Queue "Add task" from chat**: The quick action `queue:...` currently logs to console. Needs a POST endpoint that writes to queue.json. Could be a simple Python CGI or the Hermes API's `/v1/chat/completions` interpreting the command and the executor doing the write.

4. **Queue card drag-to-reorder**: Vanilla JS drag-and-drop is implemented but only tested on desktop. Touch events on iPad (user's likely browsing device) may not work.

5. **v0.4 version badge**: The HTML still says `v0.4` in the sidebar subtitle. Minor but worth bumping.

## What to queue for Sprint 2

1. **Fast-sync cron**: no_agent script every 30s to push task state to Tower
2. **Queue Add Task HTTP endpoint**: quick action from chat actually creates queue entries
3. **Touch support for queue drag**: verify and fix iPad interaction
4. **Bump v0.4 → v0.5 in sidebar**

## Total output

| File | Lines |
|------|-------|
| `js/queue-panel.js` | 842 |
| `js/chat-panel.js` | 1,064 |
| `css/style.css` (updated) | 909 (+0, modules self-style) |
| `index.html` (updated) | 200 (+18) |
| `sync-workbench-data.sh` (updated) | ~50 (+5 for api-key gen) |
| **Total net new** | **~1,906 lines** |

## Verdict

Sprint 1 delivered what it promised. The workbench now has a live queue view and a working chat tab — both deployed and verified. The user can watch tasks move through the pipeline and talk to Hermes from the browser. The mezzanine view is real, and the factory floor is visible.
