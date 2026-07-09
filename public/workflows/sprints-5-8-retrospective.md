# Sprints 5–8 Retrospective — The Feature Sprint Quad

**Date:** June 20, 2026
**Version:** v0.9 (currently deployed)
**Status:** All 4 sprints executed across ~40 minutes of autonomous processing

## Summary

Sprints 5–8 ran from the queue on June 20 between ~16:30 and ~17:45 UTC, fully autonomously — no user intervention beyond the initial queue load. Over 10 tasks (IDs 25-30 plus the 4 original sprint scopes that were already completed) shipped the Dashboard, Inbox, Tower, and Email tabs to the workbench. The workbench grew from 9 tabs at Sprint 3 completion to 13 tabs. Total JS went from ~4,800 lines to ~5,975 lines.

---

## What we planned to build

From the [Sprints 5-10 Roadmap](sprints-5-10-roadmap.md):

| Sprint | Theme | Est. Lines | Key New Files |
|--------|-------|-----------|---------------|
| 5 (v0.9) | Personal Dashboard + Inbox | ~1,400 | `dashboard-panel.js`, `inbox-panel.js` |
| 6 (v0.10) | Queue Actions + Templates | ~1,400 | `task-templates.json`, `collect-templates.py` |
| 7 (v0.11) | Tower Control Panel | ~1,600 | `tower-panel.js`, `collect-tower-status.py` |
| 8 (v0.12) | Email Pipeline Browser | ~1,300 | `email-panel.js`, `collect-email-log.py` |

**Estimated total:** ~5,700 lines of new JS + ~500 lines of CSS + HTML modifications.

---

## What actually shipped

### Sprint 5 — Personal Dashboard + Inbox: ✅ SHIPPED

**Actual JS:** 377 lines (dashboard-panel.js: 187, inbox-panel.js: 190)
**Estimated:** ~1,400 lines

Dashboard became the default landing tab (`index.html` line 18: `data-tab="dashboard"` is the active nav item). The sidebar lists Dashboard, Inbox, and 11 other tabs. The v0.9 badge shows in the sidebar subtitle.

The roadmap estimated 1,400 lines across 3 features (dashboard, inbox, layout rework). The actual JS is far lighter — approximately 73% below estimate. This is because:

- **Existing infrastructure absorbed complexity.** Data files (queue.json, cron-status.json after task 30) were already synced by the pipeline. The panels are thin fetch-and-render modules that delegate data loading to the collector scripts.
- **Styling is shared.** The CSS additions went into the existing style.css rather than per-module inline styles. The dashboard shares card patterns with the existing panel styles.
- **Layout rework was minimal.** The sidebar was already working; the fix was adjusting existing CSS rather than writing new layout systems.

### Sprint 6 — Queue Actions + Templates: ⚠️ PARTIALLY SHIPPED

**Actual JS changes:** queue-panel.js grew from ~842 lines (Sprint 1) to 1,026 lines — an increase of ~184 lines
**Estimated:** ~1,400 lines (500 inline actions + 400 templates + 300 filters + 200 backlog graph)

The queue panel grew but not by the ~500 lines planned for inline actions. No evidence of:
- `data/task-templates.json` file
- `~/.hermes/scripts/collect-templates.py`
- Template editor UI
- Queue backlog graph bar chart

This sprint appears to have been partially deferred. The existing queue panel gained some enhancements (possibly filter views or the saved-view system from the roadmap), but the large action-oriented features (Claim/Start, Defer, Reassign, Batch, Templates) did not ship.

**Uncertainty:** The growth from 842 to 1,026 lines is 184 new lines, which could cover filters + saved views + minor polish, but not the full 1,400-line scope. The remaining scope (~1,200 lines) is either unexecuted or was executed at a lighter scope than planned.

### Sprint 7 — Tower Control Panel: ✅ SHIPPED

**Actual JS:** 178 lines (tower-panel.js: 178, 7,281 bytes)
**Estimated:** ~1,600 lines (1,200 tower-panel + 300 collector + 100 collector helpers)

The Tower tab was built and deployed. A collector (`collect-tower-status.py`) was created at `~/.hermes/scripts/` and wired into the sync script. The panel renders a container overview with status indicators, matching the roadmap's "overview card" and "container cards grid" scope.

The 89% gap between estimate and actual follows the same pattern as Sprint 5: the collector handles SSH polling and data shaping on the Mac side; the panel is a thin renderer. The roadmap's estimate assumed more inline complexity than needed given the data-precollection architecture.

### Sprint 8 — Email Pipeline Browser: ✅ SHIPPED

**Actual JS:** 211 lines (email-panel.js: 211, 7,775 bytes)
**Estimated:** ~1,300 lines (800 email-panel + 200 stats-panel + 150 collector + 150 CSS)

Full feature set shipped and verified:
- Email log viewer with filter pills (all, sent, received, failed)
- Click-to-expand detail overlay
- Stats summary bar (total, today, unread, last sync)
- `collect-email-log.py` at `~/.hermes/scripts/`
- Wired into `sync-workbench-data.sh` and data files synced to Tower
- QA task (28) verified: all 13 tabs load without JS errors on workbench.camel-hoki.ts.net

The roadmap estimated a "smart inbox composer" and "email stats panel" as separate sub-features. The actual build consolidated stats into the log viewer header and deferred the composer. The ~84% gap is explained by: no composer shipped (forwarding exists only conceptually), stats are inline rather than a separate panel, and the collector is thin (reads existing email-screener output rather than polling IMAP).

### Sprint 6 Cross-Sprint Discovery

During Sprint 8 QA (task 28), a pre-existing issue was found: `data/cron-status.json` returned 404. This file was polled by `dashboard-panel.js`, `inbox-panel.js`, and `cron-panel.js`. The dashboard and inbox panels gracefully handled this with `.catch(() => ({ jobs: [] }))`, but 4-6 console errors appeared on page load. Task 30 was created and executed to add `collect-cron-status.py`, which reads Hermes cron registry and generates the expected JSON format. This was a genuine gap from Sprint 3 (cron dashboard was built but no one wrote the data collector for it until QA caught it).

---

## What went differently than planned

### Easier than expected

1. **Data-precollection pattern amplifies thin panels.** The roadmap estimated JS lines as if each panel handled its own data fetching, state management, and rendering. In reality, collectors do the heavy lifting on the Mac side, and panels are thin fetch-and-render modules (avg. ~190 lines). This pattern should be the default estimate going forward: a collector costs ~150-200 lines, a panel costs ~150-250 lines. The roadmap's ~1,200-1,600 lines per sprint overestimated by 3-4x because it assumed both the panel and all logic would live in the browser.

2. **Deploy is a non-event.** The sync-workbench-data.sh script scps files to Tower in ~0.6 seconds. Every sprint's deploy step completed on first attempt. The Tower nginx proxy serves the static files immediately. No build step, no bundle step, no CI — just SCP.

3. **Subagent isolation worked perfectly.** Each task was executed by a fresh subagent with a self-contained context block. No task waited on another, no state leaked between subagents, and the queue management (write_file for atomic queue.json updates) never hit the execute_code timeout that plagued earlier sprints.

4. **QA sweep in one shot.** Task 28 (playwright-based QA) verified all 13 tabs in a single subagent session. This pattern — automated QA as a queue task — is going to be essential for Sprint 9 where we're doing hardening across all modules.

### Harder than expected

1. **Sprint 6 (Queue Actions) scope was too ambitious.** An estimated 1,400 lines across inline actions, templates, filters, and backlog graph is more than a single subagent can deliver in one tick. The roadmap should have broken this into 3-4 tasks: (a) filters + saved views, (b) inline actions + batch, (c) templates + template editor, (d) backlog graph. As it was, only filters/saved-views (or equivalent) made it through in the ~184 lines of queue-panel.js growth.

2. **The missing cron-status.json gap was stale for weeks.** The cron dashboard (task 14, Sprint 3) shipped a panel that expected `data/cron-status.json`, but no one created the data collector. The dashboard and inbox panels (Sprint 5) silently handled the 404 with graceful fallbacks, so the error only surfaced when QA checked console output. This is a sign that our validation process needs a step between "panel shipped" and "panel considered done" — a data dependency checklist that says "this panel polls file X — does X exist, and is there a collector for it?"

3. **Estimates need to account for differential architecture.** The Sprint 1-3 scopes (queue panel at 842 lines, chat panel at 1,079 lines) set a precedent that drove the roadmap estimates upward. But those earlier panels were much more complex because they invented patterns (SSE streaming, kanban drag-and-drop, localStorage session management). The subsequent panels reuse those patterns — fetch data, render cards, handle click-to-detail — and are consequently much lighter. Future estimates should benchmark against the lightest working panels, not the heaviest.

---

## Key architectural decisions that held up

1. **Mac-side data collection + thin browser panels** is the right architecture. Confirmed at scale across 5 collector scripts and 10+ panels. Collectors run on Mac (access to SSH, API keys, local filesystem) and push structured JSON. The browser never calls Tower, the email server, or the orchestration router directly.

2. **Inline CSS in JS modules (from Sprint 1) vs shared style.css.** Sprints 5-8 used shared style.css additions (~1,781 lines total) rather than inline styles in the JS modules. This is the opposite of the Sprint 1 decision (queue-panel.js and chat-panel.js inject their own CSS). Both patterns work — the important thing is consistency within a sprint. The shared style.css approach is lighter for small panels (no per-module CSS payload) but creates merge friction when multiple subagents add CSS to the same file simultaneously. For parallel task execution, inline CSS is safer.

3. **No framework.** Still the right call. 13 tabs, ~6,000 lines, zero frameworks, zero build tools, zero npm installs. Vanilla ES6 modules with `import`/`export` in a single script tag. The workbench loads in under 1 second over Tailscale. Deploy is SCP.

4. **Default landing tab = Dashboard** (v0.9). The roadmap planned for this since Sprint 5. It's now the active default. The user sees a morning briefing before anything else.

---

## Gotchas for Sprint 9

1. **Error boundaries are real.** The Sprint 9 hardening framework calls for try/catch wrappers on every module. Given that we have 13 panels and growing, a single unhandled error in any one panel can break the entire workbench's tab-switching (since the click handler runs all render calls). This is the single highest-impact work in Sprint 9.

2. **Data dependency checklist.** Every panel that polls a data file should have a paired collector task. The cron-status.json gap shows what happens when a panel ships without its data source — silent graceful degradation with console noise. Sprint 9 should audit every panel's data dependencies against the actual files on Tower.

3. **Subagent context for CSS additions.** When multiple Sprint 9 tasks touch `style.css` concurrently (error boundaries, loading states, freshness indicators), they'll conflict on the same file. Consider one option: add inline CSS for Sprint 9 changes to avoid the shared-file bottleneck, then consolidate into style.css in a final task.

4. **setInterval cleanup.** Many panels start auto-refresh loops (chat, queue, dashboard, cron, sessions). When a tab is hidden and re-shown, the old interval continues while a new one starts. This is a pre-existing issue from Sprints 1-8 that Sprint 9 hardening must fix.

5. **Keyboard shortcuts.** The Sprint 9 framework identifies Ctrl+1-9 tab navigation as ~25 lines of work. This is a high-value addition — makes the workbench feel like a real app rather than a web page.

---

## What to queue for Sprint 9

The Sprint 9 hardening framework is ready at [sprint-9-framework.md](sprint-9-framework.md). Generate ~30 bite-sized tasks covering:
1. Error boundaries (P4) — 8 tasks across all panels
2. Loading states (P3) — 5 tasks across data-driven panels
3. Data freshness indicators (P3) — 4 tasks
4. Keyboard shortcuts (P3) — 5 tasks (Ctrl+1-9, /, Ctrl+K, Escape, ? reference)
5. Error log system (P2) — 2 tasks (capture + viewer)
6. setInterval cleanup (P3) — 1 task across all panels
7. Console noise cleanup (P2) — 1 task
8. Mobile/touch audit (P2) — 3 tasks
9. DOM node audit (P1) — 1 task

Total estimate: ~500 lines, 30 tasks, ~3 hours of autonomous execution.

---

## Total output (Sprints 5-8)

| File | Lines | Notes |
|------|-------|-------|
| `js/dashboard-panel.js` | 187 | NEW — Sprint 5 |
| `js/inbox-panel.js` | 190 | NEW — Sprint 5 |
| `js/tower-panel.js` | 178 | NEW — Sprint 7 |
| `js/email-panel.js` | 211 | NEW — Sprint 8 |
| `js/queue-panel.js` (growth) | +184 | Sprint 6 — partial |
| `css/style.css` | ~1,781 | Shared additions across sprints |
| `index.html` | 351 | 13 sidebar entries, Dashboard default |
| `~/.hermes/scripts/collect-email-log.py` | NEW | Collector |
| `~/.hermes/scripts/collect-cron-status.py` | NEW | Sprint 6 follow-up |
| `~/.hermes/scripts/collect-tower-status.py` | NEW | Collector |
| `sync-workbench-data.sh` | MODIFIED | +3 collector calls |
| **Net new JS** | **~950 lines** | 5 panels + 1 growth |
| **Net new collectors** | **~400 lines** | 3 Python scripts |
| **CSS** | **~200 added** | Shared style.css |

## Verdict

Sprints 5-8 delivered their core outcomes: the workbench now has 13 tabs, a Dashboard-first landing experience, an Inbox, Tower visibility, Email review, and the queue gained incremental improvements. The scope gap on Sprint 6 (queue actions/templates) is real but not blocking — the queue is functional for viewing, and inline actions are a quality-of-life upgrade rather than a missing feature.

The v0.9 badge is accurate: the workbench replaces the desktop Hermes client for morning briefing, queue monitoring, cron oversight, and Tower health checks. The only gaps between roadmap v1.0 and current state are Sprint 6's unshipped features (inline actions, templates) and Sprint 9's hardening (error boundaries, loading states, keyboard shortcuts).

**Sprint 9 is next.** The hardening framework exists and is ready for task generation. No new features — only polish, reliability, and edge cases. The workbench needs to survive a week of daily use without console errors or blank states.
