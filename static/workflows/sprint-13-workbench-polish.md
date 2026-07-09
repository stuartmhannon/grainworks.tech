# Sprint 13 — Workbench Polish & UX Refinements

**Target:** Get the workbench stable and tight enough for Dad to green-light v1.0. No version tag until he says it's ready for daily use.

## Architecture

No new tabs. Focus on the 3 most-used surfaces (Chat, Queue, Dashboard) plus infrastructure hardening.

## Tasks

### Priority 4 — Critical

**Task 75 — Chat: graceful reconnection with status indicator**
File: `js/chat-panel.js`
Retry on network error 3x with exponential backoff (1s, 2s, 4s). Show status indicator in toolbar: ● connected (green), ⟳ reconnecting (yellow), ✕ disconnected (red). Use AbortController cleanup on navigation.

**Task 76 — Chat: keyboard shortcuts**
File: `js/chat-panel.js`
Ctrl+Enter / Cmd+Enter to send. Escape to cancel streaming. Ctrl+Up / Cmd+Up to edit last user message. Show shortcut hints in input placeholder.

### Priority 3 — High

**Task 77 — Queue: task detail overlay (was P2 #56, never queued)**
File: `js/queue-panel.js`
Click task card → slide-in overlay showing: title, goal, context, priority, source, created_at, status, completed_at. Editable fields: title, goal, priority. Save button PATCHes /api/queue/{id}. Reuse existing qp-detail-overlay CSS.

**Task 78 — Queue: copy button on output files**
File: `js/queue-panel.js`
Each completed task card gets a copy icon. Click copies the output file path/URL to clipboard. Small visual: "copied" toast.

### Priority 2 — Normal

**Task 79 — Chat: copy button + markdown polish**
File: `js/chat-panel.js`
Copy-to-clipboard icon on each assistant message. Improve markdown rendering: code blocks with syntax hint, inline code styling, link target attribution.

**Task 80 — Dashboard: data freshness indicators**
File: `js/dashboard-panel.js`
Each section shows "updated X ago" based on the data file's `_meta.last_sync` or `updated_at`. Stale data (>1h) gets a subtle warning.

**Task 81 — Performance: measure and report lazy-load wins**
Measure: initial JS bytes loaded (before vs after lazy-load), tab switch latency. Report in a quick doc.

### Priority 1 — Low

**Task 82 — Sprint 13 retrospective**
Document: what shipped, measureable improvements, known issues, next horizon (v2.0 ideas).

## Files Changed
- `js/chat-panel.js` — Reconnection, shortcuts, copy button
- `js/queue-panel.js` — Detail overlay, copy button
- `js/dashboard-panel.js` — Freshness indicators

## Model Strategy
- Chat + Queue changes: local Mistral NeMo (JS work, free)
- Architecture review: local Mistral NeMo
- Measurement/deployment: direct terminal work
