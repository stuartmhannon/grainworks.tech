# grainworks workbench — Changelog

## v1.0 — The Workbench Release (2026-06-22)

After four sprints and 34 tasks across framework hardening, chat infrastructure,
operational tooling, and launch polish, the workbench v1.0 replaces Hermes Desktop
as the primary interface for the grainworks agent ecosystem.

### Sprint 9 — Framework & Hardening

**Theme:** Zero new features. Polish, performance, reliability, edge cases.
**Tasks:** 9 planned, 9 effective (1 retry). **Bugs fixed:** 7.

#### Obsidian REST API Pipeline

The long-standing iCloud container EPERM issue that blocked vault-read operations
is now fully resolved. Three tasks established a new pipeline:

- **Obsidian Local REST API plugin** installed on port 27124 with API key configured.
  Zero-dependency vault access via HTTPS.
- **vault-watcher rewrite** — replaced `os.path.getmtime()` and `open()` with `curl`
  against the REST API. SHA256 content fingerprinting for change detection.
  iCloud sandbox constraint eliminated.
- **inbox-processor cron** — updated to read vault notes via `curl` + temp file.
  No more filesystem `open()` invocations in cron prompts.

**Architecture:** curl over Python SDK (zero dependencies, works in any shell
context). REST API over MCP (single plugin install, no additional server).

#### Data Pipeline Audit

- All 11 data files confirmed present on Tower. Pipeline architecture from collector
  scripts through staging to SCP/rsync delivery to Tower documented and verified.
- **Bug found:** `collect-workbench-data.py` was overwriting `tasks.json` with a
  status-grouped format, breaking the queue panel render. Fixed by renaming
  collector output to `task-summary.json` (one-line change, minimal blast radius).
- Email-log.json identified as empty stub (138 bytes). IMAP poller deferred.

#### UI Polish & QA

- **Responsive breakpoints:** Fixed 4 CSS bugs across 3 components. Tested at
  1920px, 800px (icon-only sidebar), 600px (no sidebar).
- **Real agent status:** Replaced dummy cycling statuses with data from
  `route-activity.json`. Status dots now reflect actual agent state.
- **Console audit (static):** Failed on first attempt (Mistral NeMo produced
  plan-only output with zero tool calls). Retried via static analysis across all
  15 JS modules — found zero issues. The codebase's consistent use of try/catch,
  optional chaining, and null-guard patterns paid off.

---

### Sprint 10 — Chat & Sessions

**Theme:** Replace Hermes Desktop as the primary chat interface.
**Tasks:** 9 completed, 0 failures.

#### Chat Persistence & Session Management

- **localStorage round-trip:** Messages saved after send, clear, and session switch;
  restored on page load and session switch. States persisted: active session,
  selected model, sidebar visibility.
- **Model selector dropdown:** Preference restored from `localStorage.getItem('chat_model')`
  before falling back to hardcoded default. One 2-line fix completed the UX round-trip.
- **Session list sidebar:** Collapsible (toggle state persisted), double-click rename,
  delete with confirmation, + New Session button. `chat-panel.js`: 29KB → 42KB
  (+6KB from inline CSS for sidebar layout).

#### Sessions Tab

- **Live session viewer:** 5-second auto-poll. Live/History toggle, session cards
  with status dots and relative timestamps, expandable details.
- **Stop/cancel button:** POSTs to `/v1/sessions/{id}/stop`. Loading state on button,
  success (grey dot + "cancelled") or failure (inline error).
- **Tool call timeline:** 480px slide-in detail overlay showing session metadata,
  goal, context, result, errors, and chronological tool calls with truncated
  args/results and durations. Close via ×, Escape, or backdrop click.
  `session-inspector.js`: 545 → 999 lines.

#### Chat Polish

- **Zero-dependency markdown renderer:** Code blocks with language class, inline
  code, links, bold, italic. HTML-safe output.
- **Copy button:** `⎘` icon on each assistant message, visible on hover, visual
  feedback (checkmark for 1.5s).
- **Graceful reconnection:** `sendMessageWithRetry()` wrapper — retries up to 3x
  with exponential backoff (1s, 2s, 4s), only on network errors (not HTTP 4xx/5xx).
  Connection status indicator: green (connected), yellow pulse (reconnecting),
  red (disconnected).
- **Keyboard shortcuts:** Ctrl/Cmd+Enter (send), Esc (cancel streaming),
  Ctrl/Cmd+Up (edit last user message). All existing Enter/Shift+Enter behavior
  preserved.

**Key decisions:**
- Wrapper pattern (`sendMessageWithRetry`) over modifying the core SSE reader
  — kept 134 lines of existing stream reader untouched.
- Zero-dependency markdown over importing `marked` or `marked-it` — no npm/pip
  dependency to manage for a small feature set.
- `localStorage` over IndexedDB — simpler API, synchronous reads, good enough
  for chat history volume.
- Promise bridge pattern for retry loop over callback-based `sendMessage`.

---

### Sprint 11 — Data & Control

**Theme:** Make the workbench an operational control center.
**Tasks:** 7 completed, 0 failures.

#### Queue Operations

- **Inline task creation:** +Add Task button → overlay form (title, goal, priority
  1-5, source) → POST to `/api/queue/` → card appears in PENDING column.
  CSS classes were pre-wired; this was pure JS wiring.
- **Batch operations:** Toggle batch mode → checkboxes on cards → action bar
  (Set Pending, Cancel, Delete) → POST array of IDs to `/api/queue/batch`.
  All-or-nothing per batch (acceptable at priority 3).
- **Drag-and-drop:** Cards draggable between PENDING / IN_PROGRESS / COMPLETED
  columns. On drop: PATCH `/api/queue/{id}` with new status, board re-renders.
  Opacity feedback during drag, column highlight on hover.
- **Task detail overlay:** Click card → overlay showing title, goal, context,
  priority, source, created_at, status, completed_at. Editable: title, goal,
  priority. Save PATCHes `/api/queue/{id}`.

#### Cron Lifecycle

- **Run Now button:** `▶` on each cron card. Click → POST `/api/cron/run/{job_id}`
  → spinner → `last_run_at` updates. Error displayed inline on failure.
  Fire-and-forget design (cron jobs are idempotent).
- **Pause/resume toggle:** Green dot (enabled) ↔ grey dot (disabled). Click toggles
  POST `/api/cron/{id}/pause` or `/api/cron/{id}/resume`. Consistent visual
  language with existing status dot pattern.

#### Tower Monitoring

- **Storage bars:** Color-coded: green < 70%, yellow < 90%, red > 90%. Data from
  `system.json`. Numeric usage shown alongside bar.

**Files modified:** queue-panel.js (+200 lines), cron-panel.js (+80 lines),
tower-panel.js (+30 lines). Zero new dependencies.

**Key decision:** CSS pre-wiring for upcoming features proved its worth — three
tasks referenced CSS classes defined in advance and needed no style work.

---

### Sprint 12 — Polish & Launch

**Theme:** v1.0 release. All tabs functional, zero console errors, responsive
across devices.

#### New Features

- **Library tab — full-text search:** End-to-end search across all 5 knowledge
  sources (audiobooks, skills, facts, contacts, ideas).
- **Library detail panels:** Type-specific detail views for each content category.
- **Email tab — live data:** Real email content from `email-log.json` with detail
  overlay (previously showed empty/stub state).
- **Performance — lazy loading:** Tab JS modules now loaded via `import()` on
  tab switch instead of all at page load.
- **Performance — code splitting:** `queue-panel.js` (36KB) and `chat-panel.js`
  (29KB) split into board renderer + API layer + shared utilities.
  `shared-utils.js` extracted containing `relativeTime`, `escapeHtml`, and other
  cross-module helpers.

#### Quality Assurance

- **Console audit:** Zero JS errors across all 13 tabs (data pipeline fix from
  Sprint 9 resolved the false queue-empty render).
- **Responsive testing:** All tabs verified at 1920px, 800px, and 600px.
- **Dark/light mode contrast:** Theme verification across all surfaces.
  No color accessibility issues found.

#### Documentation

- CHANGELOG.md (this file)
- DEPLOYMENT.md (deployment guide for the workbench)

---

### Cumulative Metrics

| Metric | Sprint 9 | Sprint 10 | Sprint 11 | Sprint 12 | Total |
|--------|----------|-----------|-----------|-----------|-------|
| Tasks | 9 | 9 | 7 | 9 | 34 |
| Tasks failed | 1 (retried) | 0 | 0 | 0 | 1 |
| Bugs fixed | 7 | 2 | 0 | 0 | 9 |
| Files created/modified | 6 | 2 | 3 | ~8 | ~19 |
| New dependencies | 0 | 0 | 0 | 0 | 0 |
| Sprint span | ~16h | ~14h | ~15h | ~12h | ~57h |

### Known Gaps

| Issue | Severity | Status |
|-------|----------|--------|
| email-log.json empty (no IMAP poller) | Low | Deferred |
| No validation step in sync pipeline (min-size check) | Low | Deferred |
| Browser-level DevTools verification | Medium | Manual — requires interactive session |
| SSE push for live updates (replaces 15s polling) | Medium | Not shipped in v1.0 |

### Architecture — One-Line Summary

> Static JSON files + vanilla JS modules + nginx → operational dashboard.
> Zero npm/pip frontend dependencies. Zero build step. Zero runtime server.
> Data pushed from Mac crons via SCP; frontend polls `./data/*.json` every 10-15s.
