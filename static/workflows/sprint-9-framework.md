# Sprint 9 — v0.13: Hardening Framework

**Prerequisite:** Sprint 5-8 retrospective must be complete and reviewed via HIL before generating tasks.

## How to Use This Document

When the Sprint 5-8 retrospective is written and reviewed:

1. Read this framework + the retrospective
2. Use the retrospective's lessons to adjust priorities, scope, and task granularity
3. Generate 20-30 bite-sized tasks for the queue
4. Add them to queue.json with P4-P1 priorities
5. Send a summary via HIL email to stuartmhannon@gmail.com

## Sprint 9 Scope

**Theme:** Zero new features. Polish, performance, reliability, edge cases.
**Estimated lines:** ~500 (mostly CSS and JavaScript hardening)
**Version:** v0.13

## Areas of Work

### 1. Error Boundaries (~8 tasks)

Every JS module needs a top-level try/catch so a single module failure doesn't take down the whole workbench.

| Task | What | Lines |
|------|------|-------|
| Dashboard error boundary | Wrap renderDashboard in try/catch, show fallback | ~15 |
| Inbox error boundary | Wrap renderInbox + data fetch in try/catch | ~15 |
| Queue error boundary | Wrap renderQueue + buildBoard + fetches | ~15 |
| Tower error boundary | Wrap renderTower + loadTowerData | ~15 |
| Email error boundary | Wrap renderEmail + data fetch | ~15 |
| Chat error boundary | Wrap renderChat + SSE connection | ~20 |
| Session inspector boundary | Wrap renderSessionInspector | ~15 |
| Base module (index.html init) | Wrap each render call, catch + log to console | ~10 |

**Total: ~120 lines**

### 2. Loading States (~5 tasks)

Every data-driven component shows a skeleton or spinner while data loads, not a blank white box.

| Task | What | Lines |
|------|------|-------|
| Dashboard loading skeleton | Skeleton row + card placeholders while fetchTasks/fetchCron resolve | ~30 |
| Inbox loading state | "Loading inbox..." with spinner | ~15 |
| Tower loading state | "Connecting to Tower..." with spinner | ~15 |
| Cron dashboard loading state | "Loading cron jobs..." with spinner | ~15 |
| Session inspector loading state | "Loading sessions..." with spinner | ~15 |

**Total: ~90 lines**

### 3. Data Freshness Indicators (~4 tasks)

Every data section shows "updated X seconds/minutes ago."

| Task | What | Lines |
|------|------|-------|
| Dashboard freshness timestamps | Show age of last data fetch on overview row | ~20 |
| Queue data freshness | Show last-sync time in queue header | ~15 |
| Tower data freshness | Show "last updated X ago" on Tower tab | ~15 |
| Email data freshness | Show last-check time on Email tab | ~15 |

**Total: ~65 lines**

### 4. Keyboard Shortcuts (~5 tasks)

| Task | What | Lines |
|------|------|-------|
| Ctrl+1-9 tab navigation | Switch to tab by index | ~25 |
| / quick search | Focus first search/filter input on current tab | ~15 |
| Ctrl+K command palette | Quick fuzzy search across tabs | ~40 |
| Escape handler | Close any open overlay/detail panel | ~10 |
| Shortcut reference modal | `?` key opens quick-reference overlay | ~30 |

**Total: ~120 lines**

### 5. Mobile/Touch Audit (~3 tasks)

| Task | What | Lines |
|------|------|-------|
| Responsive pass at 768px | Verify all tabs at tablet width, fix overflow/overlap | ~30 CSS |
| Touch event audit | Verify queue drag, inbox buttons, builder canvas work on touch | ~15 JS |
| Narrow sidebar (600px) | Hide sidebar, full-width tabs, single-column grids | ~20 CSS |

**Total: ~65 lines**

### 6. Performance & Cleanup (~3 tasks)

| Task | What | Lines |
|------|------|-------|
| setInterval cleanup audit | Ensure every setInterval has a clearInterval on tab switch or module stop | ~20 |
| Console noise cleanup | Remove console.log debug statements from production modules | ~10 |
| DOM node count check | Verify no tab exceeds 500 DOM nodes, collapse large lists | ~15 |

**Total: ~45 lines**

### 7. Error Log (~2 tasks)

| Task | What | Lines |
|------|------|-------|
| Error capture system | window.onerror + send to localStorage, capped at 100 | ~25 |
| Error viewer | Small "errors (N)" link in footer, click to show log | ~20 |

**Total: ~45 lines**

## Task Generation Rule

Each task in the queue should be:

1. **Self-contained** — one subagent can complete it in one tick (5-15 min)
2. **Verifiable** — "no JS errors" or "click X, see Y" check
3. **Idempotent** — running it twice doesn't break anything
4. **Context-complete** — includes file paths, existing code patterns, and constraints

## Priority Assignment

| Priority | Meaning | Applies to |
|----------|---------|------------|
| P4 (critical) | Must do before v1.0 | Error boundaries, data freshness, setInterval cleanup |
| P3 (high) | Should do before v1.0 | Loading states, keyboard shortcuts, error log |
| P2 (normal) | Important but not blocking | Mobile audit, console cleanup |
| P1 (lowest) | Nice to have | DOM node audit, smooth transitions |

## Ordering

Tasks should be queued in this order:

1. Error boundaries (protects all other work)
2. Loading states (users see spinners, not blanks)
3. Data freshness indicators (users trust stale data less)
4. Keyboard shortcuts (power user efficiency)
5. Error log system
6. setInterval cleanup
7. Console noise cleanup
8. Mobile/touch audit
9. DOM node audit
10. Polish (smooth transitions, focus states)

## Output

After generating tasks:

1. Write tasks to queue.json
2. Send HIL email: "Sprint 9 — 30 tasks queued for hardening. ~500 lines across 10 areas. Ready to execute."
3. The task-runner picks them up automatically
