# Workbench v0.6–v0.10: The Factory Floor — Visual Pipeline & Control Room

## Vision
The workbench becomes the control room overlooking the entire operation. Every task, every cron, every agent session, every route decision — visible, trackable, and controllable from one place. The user never needs Hermes Desktop again.

## Summary of what ships

| Version | Feature | What it does | Lines (est) |
|---------|---------|-------------|-------------|
| v0.6 | **Live Pipeline Viz** | Animated DAG showing real-time task flow through the orchestrator. Edges light up green as a request moves from Classify → Route → Agent → Output. The heartbeat of the factory floor. | ~600 |
| v0.7 | **Cron Dashboard** | Visual grid of all 17 cron jobs. Green/red status dots. Last-run, next-run, one-click "Run Now". Filter by healthy/failing/never-run. | ~400 |
| v0.8 | **Agent Session Inspector** | Timeline view of every delegate_task execution. See what a subagent saw, what it did, what it returned. Time-travel through past sessions. | ~500 |
| v0.9 | **Skill Impact Map** | Heat map showing which skills are used most, which routes they feed, which are stale. Helps prune and prioritize. | ~350 |
| v0.10 | **Human-in-the-Loop Handoff** | When a task blocks on user approval, it surfaces visually with a "Waiting on you" badge. Approve, reject, or defer from the workbench. | ~450 |
| | **Total v0.6–v0.10** | | **~2,300 lines** |

## v0.6 — Live Pipeline Viz (~600 lines)

### What Jarvis has
Their pipeline viz shows stages: Classify → Route → Process → Human. Edges animate as a request passes through. You see the *actual path* every request takes.

### What we build

An animated SVG DAG overlay on the existing routes graph. Instead of a static topology, each route node gets:

- **Live status dot** — green (healthy), yellow (processing), red (error), grey (idle)
- **Animated edges** — when a task is in flight through a route, the edge pulses with a bright green traveling dot
- **Task counter badges** — each node shows the count of tasks currently in that stage (e.g., "3 in queue", "1 processing", "12 completed today")
- **Click to drill** — click a node to see the active tasks in that domain

### Data source
The 30s fast-sync cron already pushes `task-live.json` to Tower. We add a `route-activity.json` that maps current tasks → route domains. The JS calculates the animation positions.

### What ships
| File | Lines | Purpose |
|------|-------|---------|
| `js/pipeline-viz.js` | ~450 | Animated DAG overlay, live status dots, pulsing edges, task counter badges, click-to-drill |
| `css/style.css` | +80 | Animation keyframes, pulse gradients, status dot colors, drill-down panel |
| `index.html` | +10 | Pipeline view toggle on Workflows tab |

### Key technical decisions
- Use CSS animations for edge pulsing (no JS animation loop, GPU-composited)
- Poll `data/route-activity.json` every 5s (not 15s — pipeline needs faster refresh)
- Drill-down panel reuses existing project detail slide-in pattern
- Static routes.json is the skeleton; route-activity.json is the live flesh

## v0.7 — Cron Dashboard (~400 lines)

### What Jarvis has
They don't show crons explicitly, but a control room isn't complete without knowing what's scheduled and what's broken.

### What we build

A card grid of all 17 cron jobs:

```
┌──────────────────────────────────────────────────────────┐
│  ⚡ Cron Dashboard                             [▸ Run]  │
│                                                          │
│  ┌────────────────────┐  ┌────────────────────┐         │
│  │ ● task-executor    │  │ ● email-screener   │         │
│  │ every 5m           │  │ every 5m           │         │
│  │ Last: 20:09 ✅     │  │ Last: 20:11 ✅     │         │
│  │ Next: 20:14        │  │ Next: 20:16        │         │
│  │ [> Run Now]        │  │ [> Run Now]        │         │
│  └────────────────────┘  └────────────────────┘         │
│                                                          │
│  ┌────────────────────┐  ┌────────────────────┐         │
│  │ ● hermes-backup    │  │ ● nightly-dreams   │         │
│  │ 0 3 * * *          │  │ 0 0 * * *          │         │
│  │ Last: never ❌     │  │ Last: yesterday ❌  │         │
│  │ [> Run Now]        │  │ [> Run Now]        │         │
│  └────────────────────┘  └────────────────────┘         │
└──────────────────────────────────────────────────────────┘
```

- **Status dots**: green (ok), red (error), grey (never run), yellow (stale >24h)
- **Filter bar**: All / Healthy / Failing / Never-run
- **Run Now button**: Sends a POST to /api/cron/run/{job_id} at Tower
- **Detail on click**: Full prompt preview, last output, error logs

### Data source
The collector already gathers cron state in `logs.json`. A new `~/.hermes/scripts/collect-crons.py` script runs every 5min and dumps `hermes cron list` output into a structured JSON file.

| File | Lines | Purpose |
|------|-------|---------|
| `js/cron-panel.js` | ~300 | Card grid, status dots, filter, Run Now button, detail overlay |
| `~/.hermes/scripts/collect-crons.py` | ~80 | Script that runs `hermes cron list` and formats as JSON |
| `sync-workbench-data.sh` | +5 | Include crons.json in sync |
| `css/style.css` | +40 | Cron card styles, status dots, filter bar |

## v0.8 — Agent Session Inspector (~500 lines)

### What Jarvis has
They show what an agent *did* — the step-by-step execution trace. This is the closest thing to "seeing the AI think."

### What we build

A timeline view of every `delegate_task` execution, showing:

```
┌──────────────────────────────────────────────────────────┐
│  ◐ Session Inspector                         [Live ▼]  │
│                                                          │
│  ┌─ 20:09:23 ─────────────────────────────────────────┐ │
│  │  Task #7: Fast-sync cron                           │ │
│  │  ├─ step 1: Read queue.json                  ✅    │ │
│  │  ├─ step 2: Generate task-live.json           ✅    │ │
│  │  ├─ step 3: SCP to Tower                     ✅    │ │
│  │  └─ register cron job                        ✅    │ │
│  │  Duration: 12.4s                                   │ │
│  └────────────────────────────────────────────────────┘ │
│                                                          │
│  ┌─ 20:04:11 ─────────────────────────────────────────┐ │
│  │  Task #6: Write Sprint 1 retrospective              │ │
│  │  ├─ step 1: Read sprint-1-factory-floor.md    ✅    │ │
│  │  ├─ step 2: Read actual code shipped           ✅    │ │
│  │  ├─ step 3: Write retrospective               ✅    │ │
│  │  └─ step 4: Save to sprint-1-retro.md         ✅    │ │
│  │  Duration: 8.1s                                     │ │
│  └────────────────────────────────────────────────────┘ │
```

- **Live/History toggle**: Live shows currently executing tasks, History shows last 50
- **Expandable steps**: Click a step to see the subagent's full input/output
- **Duration bar**: Visual progress indicator for in-flight tasks
- **Search/filter**: By task ID, title, source, status

### Data source
Task outputs already saved to `~/.hermes/tasks/outputs/<id>-<slug>.md`. The session data comes from the Hermes API or from structured task output files. The collector can parse the outputs directory and build a sessions index.

| File | Lines | Purpose |
|------|-------|---------|
| `js/session-panel.js` | ~350 | Timeline view, expandable steps, live/history toggle, search |
| `~/.hermes/scripts/collect-sessions.py` | ~100 | Parse outputs/ directory, build sessions index |
| `css/style.css` | +50 | Timeline, step expand, duration bars |

## v0.9 — Skill Impact Map (~350 lines)

### What it does
A heat map showing which skills are used most, which are stale, which routes each feeds. Helps answer "should I prune this?" and "what's my most valuable skill?"

### Architecture

A 2D grid:

```
         Media  Infra  Enrich  Strategy  Finance  Legal ...
         ─────────────────────────────────────────────────
queue     ████   ██     █      █        █       █
chat      ███    ████   ██     ██       █       ██
cron      ██     ██     █      ██       █       █
email     █      █      ███    █        ███     █
obsidian  ██     █      ██     █        █       █
```

Each cell is a heat square: deeper green = more interactions. Click a cell → see the actual invocations.

### Data source
Holographic fact store already tracks entity usage. The collector can query `fact_store` for skill→domain usage counts, or a lightweight Python script can parse cron job skill references + delegate_task logs.

| File | Lines | Purpose |
|------|-------|---------|
| `js/skills-panel.js` | ~250 | Heat map grid, color scale, click-to-detail |
| `~/.hermes/scripts/collect-skill-usage.py` | ~60 | Parse skill references, build usage matrix |
| `css/style.css` | +40 | Heat map cells, scale legend |

## v0.10 — Human-in-the-Loop Handoff (~450 lines)

### What Jarvis has
Their pipeline viz shows a "Human" stage where tasks pause for approval before continuing. A visual "waiting on you" indicator.

### What we build

A dedicated "Review Queue" tab (or section in the Projects tab) showing tasks that are blocked on user input:

```
┌──────────────────────────────────────────────────────────┐
│  ◐ Waiting on You (3)                        [Snooze ▼]│
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │  ⏳ #12: Approve GrainDrop JLCPCB order            │  │
│  │  Need to confirm $207.40 for 5 assembled boards    │  │
│  │  [✓ Approve]  [✕ Reject]  [✎ Edit]  [💤 Snooze]  │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │  ⏳ #9: Plan the music/economics research post      │  │
│  │  Ideas Reservoir promoted this — need scope         │  │
│  │  [✓ Approve]  [✕ Reject]  [✎ Edit]  [💤 Snooze]  │  │
│  └────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

- Tasks with status `waiting` appear here
- Approve → moves to pending (executor picks it up)
- Reject → marks cancelled
- Edit → opens a quick text input to modify the task
- Snooze → defers to next review cycle
- Badge count on the sidebar tab

### Task status flow
```
pending → in_progress → waiting (if needs approval)
                           ↓ approve
                        pending → in_progress → completed
```

The task executor cron already handles status transitions. The `waiting` status is defined in the continuous-task-runner skill but never used. This tab activates it.

| File | Lines | Purpose |
|------|-------|---------|
| `js/review-panel.js` | ~350 | Waiting tasks list, approve/reject/snooze buttons, badge count |
| `~/.hermes/scripts/collect-waiting.py` | ~40 | Filter queue.json for waiting tasks |
| `index.html` | +5 | Add Review tab to sidebar |
| `css/style.css` | +50 | Decision buttons, badge counter, snooze controls |

## Total effort

| Version | Feature | Lines | Key risk |
|---------|---------|-------|----------|
| v0.6 | Live Pipeline Viz | ~600 | Animation performance with many routes; polling interval load |
| v0.7 | Cron Dashboard | ~400 | Running "Run Now" from browser needs POST endpoint |
| v0.8 | Session Inspector | ~500 | Parsing subagent outputs into structured step-by-step timeline |
| v0.9 | Skill Impact Map | ~350 | Getting accurate usage data; heat map readability |
| v0.10 | Human-in-the-Loop Handoff | ~450 | Task status flow edge cases; snooze persistence |
| **Total** | | **~2,300** | |

## Implementation order

1. **v0.6 Pipeline Viz** — highest visual impact, closest to what Jarvis shows. The animated DAG is the signature feature.
2. **v0.7 Cron Dashboard** — most immediately useful for ops. "What's broken right now?"
3. **v0.8 Session Inspector** — deep insight into what agents actually do.
4. **v0.9 Skill Impact Map** — strategic pruning tool.
5. **v0.10 Human-in-the-Loop Handoff** — closes the loop on the approval gating we already designed.
