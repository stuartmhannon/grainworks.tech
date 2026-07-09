# Workbench Sprints 5–10: v0.9 → v1.0 Roadmap

**Goal:** Six sprints from current state (v0.8, 10 tabs, ~6,200 lines JS) to a v1.0 that you can use every day for a full week before the next update.

**Principle:** Each sprint ships something you can *use*, not just look at. The v1.0 target is a workbench that replaces Hermes Desktop for daily workflows — managing todo, acting on email, controlling Tower services, reviewing pipeline output, and starting new work from the browser.

---

## Sprint 5 — v0.9: The Personal Dashboard Day

**Theme:** The first thing you see when you open the workbench. No more landing on the DAG — land on a morning briefing that tells you what needs attention.

**Estimated lines:** ~1,400

### Features

**1. Morning Dashboard — new default landing view (~700 lines)**

Replaces the Workflows tab as the default landing page. A single-screen personal briefing at the top, showing:

- **Overview row** — current queue count (pending/in_progress/waiting), failing cron count, unread inbox items
- **Watchlist** — 3-5 cards of the most important things needing your attention today. Derived from:
  - Tasks with `waiting` status (need human approval)
  - Tasks with priority 4-5 in the queue
  - Cron jobs that failed in the last 24h
  - Ideas Reservoir items surfaced by the monthly harvest cron
- **Recent completions** — last 5 completed tasks with duration, in reverse chronological
- **Quick actions bar** — buttons: "New task", "Open chat", "View crons", "Manual sync"

**Data:** All fetched from existing data files (queue.json, cron-status.json, logs.json). No new backend.

**Dependencies:** None — pure frontend.

**2. Inbox tab (~400 lines)**

Replace the current empty "waiting" concept with a real inbox. New sidebar tab. Shows:

- Tasks awaiting human decision (approve/reject/edit/snooze)
- Items from the Ideas Reservoir that haven't been decided on this month
- Cron job failures that need acknowledgment
- Each item: title, source, age, 2-3 action buttons

**Data:** Queue.json for waiting tasks, cron-status.json for failures, ideas reservoir for undecided ideas.

**3. Layout rework — sticky sidebar, responsive tightening (~300 lines)**

The sidebar currently scrolls off when the viewport is short. Fix: sticky nav, compact footer, reduced chrome.

**Files created/modified:**
| File | Change |
|------|--------|
| `js/dashboard-panel.js` | NEW — ~700 lines |
| `js/inbox-panel.js` | NEW — ~400 lines |
| `index.html` | Update — add Dashboard + Inbox sidebar entries, make Dashboard default tab |
| `css/style.css` | +200 lines — dashboard cards, quick actions bar, inbox items, sticky layout |
| `sync-workbench-data.sh` | +2 lines — sync ideas reservoir index |

**Shippable outcome:** Open the workbench and see "3 tasks waiting, 2 crons failing, 1 idea to harvest" before you click anything.

---

## Sprint 6 — v0.10: Queue You Can Act From

**Theme:** The queue goes from "view the backlog" to "manage your day." Accept, defer, reassign, and batch.

**Estimated lines:** ~1,400

### Features

**1. Queue inline actions (~500 lines)**

Each queue card gets inline action buttons:
- **Claim / Start** — sets status to `in_progress`, assigns to a workstream
- **Defer to** — pick a time slot (today, tomorrow, this week) — sets task `status: deferred` with a `snooze_until` timestamp
- **Reassign to cron** — converts a one-shot task into a recurring cron job
- **Batch select** — checkbox mode: select multiple tasks, bulk-assign priority, bulk-defer, bulk-delete

**Backend:** Queue listener already handles POST/queue/. Add PATCH endpoint for status updates.

**2. Recurring task templates (~400 lines)**

The queue supports task templates — reusable task definitions you fire off with one click:
- "Weekly expense report" — generates task with goal="file expense report" and context pointing to the expense skill
- "UnRAID health check" — runs the tower audit
- "Sync contacts" — triggers stakeholder intel refresh
- Template editor: create from existing tasks or from scratch

**Data:** New file `data/task-templates.json` synced from Mac.

**3. Queue filters and saved views (~300 lines)**

- Status filters: Pending / In Progress / Waiting / Deferred / Completed
- Priority filters: 1-2 / 3 / 4-5
- Source filters: chat / agent / sprint-plan / cron / email
- Saved views: "Morning check" (priority 4-5), "Needs me" (waiting), "Plan this week" (deferred this week)
- Persisted to localStorage

**4. Queue backlog graph (~200 lines)**

Small bar chart at the top of the Queue tab: tasks created vs tasks completed per day for the last 7 days. Trend arrow. Helps answer "am I keeping up?"

**Files created/modified:**
| File | Change |
|------|--------|
| `js/queue-panel.js` | +500 — inline actions, batch mode, templates, filters |
| `~/.hermes/listeners/queue-listener.py` | +30 — PATCH endpoint for status updates |
| `data/task-templates.json` | NEW — created by collector |
| `~/.hermes/scripts/collect-templates.py` | NEW — ~50 lines |
| `css/style.css` | +150 — action buttons, batch checkboxes, filter chips, bar chart |
| `index.html` | +5 — queue detail panel markup |

**Shippable outcome:** Open the queue, claim the next task with one click, defer something to tomorrow, mark a template and fire off weekly maintenance.

---

## Sprint 7 — v0.11: The Tower Control Panel

**Theme:** All Tower services visible and actionable from the workbench. No more SSH for routine ops.

**Estimated lines:** ~1,600

### Features

**1. Tower overview card (~200 lines)**

First thing in a new "Tower" tab or section:
- Array: total/used/free, parity status, cache pool status
- Docker: running/total containers, uptime
- System: CPU temp, RAM usage, uptime
- Quick actions: "Update all containers", "Clean unused images", "Verify parity"

**Data:** Collector polls Tower via SSH or UnRAID API and writes `data/tower-status.json`.

**2. Container cards grid (~500 lines)**

One card per running container (currently: sonarr, radarr, lidarr, sabnzbd, open-webui, photoprism, profilarr, audiobookshelf, plex, qbittorrent, etc):
- Name, image, status (green/yellow/red), port, uptime
- One-click: restart, logs, open web UI (new tab)
- Resource usage where available (CPU/RAM from docker stats)
- Batch: "Restart all" / "Update all" buttons

**3. Storage explorer (~400 lines)**

Tree view of the Tower filesystem, starting from `/mnt/user/`:
- Expand/collapse directories
- Size bar per folder (proportional to total)
- Click a share (TV, Movies, Audiobooks, Backups) to see:
  - Total size, file count
  - Largest files/folders
  - Last modified date
- Share utilization pie chart

**4. Notification stream (~400 lines)**

A live feed of Tower events:
- Plex scan completes
- SABnzbd download finishes
- Arr import completes
- Disk space crosses thresholds (80%, 90%, 95%)
- Parity check results

**Data source:** Arr MCP tools + UnRAID API + SABnzbd API. Collector script polls at a configurable interval.

**5. Arr health widget (~100 lines)**

Summary card showing: recent imports (last 24h), queue depth for each arr, download client status, indexer health.

**Files created/modified:**
| File | Change |
|------|--------|
| `js/tower-panel.js` | NEW — ~1,200 lines (overview, containers, storage, notifications) |
| `~/.hermes/scripts/collect-tower-status.py` | NEW — ~300 lines. Polls: UnRAID API, docker ps, docker stats, SAB API, arr APIs, df -h |
| `data/tower-status.json` | NEW — synced by collector |
| `sync-workbench-data.sh` | +5 lines |
| `css/style.css` | +150 lines |
| `index.html` | +15 lines — Tower sidebar entry |

**Key technical decision:** The collector runs on the Mac (has direct SSH access to Tower + API keys) and pushes structured JSON. The browser never talks directly to Tower — respects the data-precollection principle.

**Shippable outcome:** Open the Tower tab and see all 14+ containers, their health, free space, and recent activity — restart anything with one click.

---

## Sprint 8 — v0.12: Email Pipeline In The Browser

**Theme:** The email pipeline becomes reviewable and actionable from the workbench. See what crossed the inbox, what was forwarded, what was acted on.

**Estimated lines:** ~1,300

### Features

**1. Email log viewer (~500 lines)**

A reverse-chronological feed of all email pipeline actions:
- Emails from Stuart that were acted on (with summary of what was done)
- Emails forwarded to Stuart (non-Stuart sender, flagged as important)
- Emails that were archived without action (non-Stuart, classified as unimportant by phi4)
- Each entry: timestamp, sender, subject, action taken, response summary
- Search by sender, subject, date range
- Filter by action type (executed, forwarded, ignored)

**Data source:** The email-screener cron logs its decisions. A collector writes `data/email-log.json`.

**2. Email thread detail panel (~300 lines)**

Click an email log entry to see:
- Full email body
- Classification result (what phi4 determined)
- Agent's response (if acted on)
- Duration (time from discovery to completion)

**3. Smart inbox composer (~300 lines)**

A mini email composer within the workbench:
- To: Stuart (stuartmhannon@gmail.com) — default
- Subject, body, send
- "Send and queue" — sends the email and creates a follow-up task in the queue
- "Quick forward" — enters a URL or message ID and forwards with a note

**4. Email stats panel (~200 lines)**

Daily/weekly summary:
- Emails received, acted on, forwarded, ignored
- Average response time
- Most common sender domains
- "Days since last manual check" counter (to remind Stuart to review email log)

**Files created/modified:**
| File | Change |
|------|--------|
| `js/email-panel.js` | NEW — ~800 lines (log viewer + detail + composer) |
| `js/stats-panel.js` | +200 lines — email stats section |
| `~/.hermes/scripts/collect-email-log.py` | NEW — ~150 lines. Reads email-screener output from session archive or dedicated log |
| `data/email-log.json` | NEW — synced |
| `sync-workbench-data.sh` | +5 lines |
| `css/style.css` | +150 lines |
| `index.html` | +15 lines — Email tab sidebar entry |

**Shippable outcome:** Open the Email tab and see what Hermes did with every message today. Forward something to Stuart with one click. Review the week's email summary.

---

## Sprint 9 — v0.13: v1.0 Hardening

**Theme:** No new features. Polish, performance, reliability, edge cases. The week-before-release stabilization sprint.

**Estimated lines:** ~500 (mostly CSS and logging)

### Tasks

**1. Offline/cache behavior (~2h)**
- What happens when data files are stale? Degrade gracefully with a "last synced X ago" banner
- What happens when the Hermes API is unreachable from Chat? Show a clear error, cache last session in localStorage
- Service worker for basic offline support (optional — localStorage may be sufficient)

**2. Error boundaries everywhere (~2h)**
- Every JS module wrapped in try/catch at the top level
- Each tab shows a meaningful empty state, not a broken white box
- Console errors are captured and displayed in the Logs tab
- Network failures show retry buttons where appropriate

**3. Loading states and transitions (~1h)**
- Skeleton loading screens for slow data files
- Smooth tab transitions (100ms fade)
- Status indicator changes from "offline" to the actual version + connection state

**4. Keyboard shortcuts (~2h)**
- `Ctrl+1-9` — switch tabs
- `Ctrl+Enter` — send chat message
- `Ctrl+K` — quick search (fuzzy search across all data in the current tab)
- `/` — focus search/filter input
- Documented in a quick-reference modal (`?` key to open)

**5. Data freshness indicators (~1h)**
- Every data-driven section shows "updated X seconds/minutes ago"
- The sync status in the footer shows last-full-sync vs last-fast-sync timestamps
- Manual "Sync now" button that triggers the collector via SSH

**6. Mobile audit (~1h)**
- All tabs tested at 768px and 1024px breakpoints
- Tab bar wraps to two rows
- Queue kanban collapses to a single-column list
- Touch events work for drag, tap, swipe

**7. Performance audit (~1h)**
- JS bundle sizes (current total ~50KB minified — should stay under 80KB)
- DOM node count per tab (keep under 500)
- setInterval cleanup on tab switch (no orphan pollers)
- Memory leak check: navigate between all tabs, confirm no runaway listeners

**8. Accessibility baseline (~30min)**
- All interactive elements have focus states
- Tab order follows visual order
- Color isn't the only indicator (status dots have text labels)
- aria-labels on icon-only buttons

**9. Error log persistence (~1h)**
- Last 100 errors stored in localStorage
- Accessible from a small "errors" link in the footer
- Copy-to-clipboard for bug reports

**Files created/modified:**
| File | Change |
|------|--------|
| `index.html` | +30 — keyboard shortcut modal, error log panel, meta tags |
| `css/style.css` | +200 — loading skeletons, transitions, mobile breakpoints, focus styles |
| `js/*.js` | all touched — error boundaries, loading states, cleanup |
| `sw.js` | NEW — optional service worker for cache-first data |

**Shippable outcome:** A workbench that doesn't break, shows what it's doing, and recovers gracefully from every failure state tested.

---

## Sprint 10 — v1.0: Five Days of Real Use

**Theme:** Release candidate. Deploy and use for 1 week. No new features — only fixes.

**Estimated lines:** 0 new code (variable fixes)

### Protocol

**Day 1 — Setup:** Replace Hermes Desktop with workbench as the default morning launch. Bookmark workbench.camel-hoki.ts.net. Move morning briefing to a workbench tab. The dashboard becomes the default tab you see when opened.

**User's daily workflow for the test week:**
1. Open workbench → morning dashboard shows what needs attention
2. Check Inbox → approve/reject/defer waiting items
3. Check Queue → claim next task, or create one via quick action
4. Use Chat → talk to Hermes from the workbench
5. Check Tower → verify services are healthy
6. Check Email → review what was processed
7. End of day → close workbench (data persists in queue.json and localStorage)

**Fix protocol:** Each bug/rough edge the user encounters during the week:
1. Named and logged to `data/v1.0-bugs.json`
2. Fixed immediately if <5 lines of change
3. Queued for v1.0.1 if more involved

**Definition of done (v1.0 shipped):**
- [ ] Dashboard is the default landing tab
- [ ] Inbox shows all waiting/handoff items accurately
- [ ] Queue actions (claim, defer, batch) work end-to-end
- [ ] Tower tab shows all services with accurate status
- [ ] Email log shows today's email pipeline activity
- [ ] Chat tab streams responses reliably (no blank responses, no ghost errors)
- [ ] All data files have freshness timestamps
- [ ] No tab shows a broken/unstyled state
- [ ] Keyboard shortcuts work (Ctrl+1-9, /, Ctrl+K)
- [ ] Mobile: all tabs usable on iPad at 1024px
- [ ] No JS console errors on normal usage
- [ ] Queue backlog graph shows at least 3 days of data

---

## Effort Summary

| Sprint | Version | Theme | Est. Lines | Key New Files |
|--------|---------|-------|-----------|---------------|
| 5 | v0.9 | Personal Dashboard + Inbox | ~1,400 | `dashboard-panel.js`, `inbox-panel.js` |
| 6 | v0.10 | Queue Actions + Templates | ~1,400 | `task-templates.json`, `collect-templates.py` |
| 7 | v0.11 | Tower Control Panel | ~1,600 | `tower-panel.js`, `collect-tower-status.py` |
| 8 | v0.12 | Email Pipeline Browser | ~1,300 | `email-panel.js`, `collect-email-log.py` |
| 9 | v0.13 | Hardening | ~500 | `sw.js` (optional) |
| 10 | v1.0 | 5 Days Real Use | 0 | bugs list |
| **Total** | | | **~6,200** | |

**Roughly the same amount of code as the current entire workbench** — adding another ~6,200 lines of JS across six sprints.

---

## Appendices

### A. Data file inventory (what the collector must produce)

| File | Contents | Source | Refresh |
|------|----------|--------|---------|
| `routes.json` | Orchestrator route topology | Mac collector | hourly |
| `cron-status.json` | All cron jobs + status | Mac `hermes cron list` | 5min |
| `task-live.json` | Queue ID/status/priority snapshot | Fast-sync | 30s |
| `email-log.json` | Email pipeline decisions | Mac email log | 5min |
| `tower-status.json` | Containers, storage, system | Mac → Tower SSH | 5min |
| `project-index.json` | Project scan data | Mac collector | hourly |
| `task-templates.json` | Reusable task definitions | Mac | hourly |

### B. Backend endpoints needed

| Endpoint | Purpose | Sprint |
|----------|---------|--------|
| `PATCH /api/queue/{id}` | Update task status | 6 |
| `POST /api/queue/` | Create task (exists) | 2 |
| `POST /api/cron/run/{id}` | Trigger cron run | exists (needs verified) |
| `PATCH /api/email/forward/{id}` | Forward email to Stuart | 8 |
| `POST /api/tower/restart/{container}` | Restart container | 7 |

### C. Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Tower collector SSH flakiness | Tower tab shows stale data | Graceful degradation with freshness badge |
| Email log format changes | Email tab breaks | Versioned log format with migration |
| Queue backlog graph empty on first deploy | Blank chart | Show "not enough data" state |
| iPad rendering differences | Touch/collapse issues | Dedicated browser test session in Sprint 9 |
| Workbench replaces Desktop too early | Missing Desktop-only features | Keep Desktop running in parallel; v1.0 is additive, not replacement |
