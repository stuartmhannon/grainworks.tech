# Workbench v0.5+ Trajectory — Iteration Plan

## Current state (v0.4)
- 6 tabs: Workflows, Projects, **Library**, Agents, Logs, Builder
- Library: unified index over 7 knowledge sources (3,761 items)
- Builder: visual DAG editor with drag, connect, delete, export
- Library facets fixed in v0.4.1
- All tabs verified interactive, 0 JS errors

## Design principles for what comes next
- Every new tab must answer: "what does this replace from Hermes Desktop?"
- Data must be pre-collected (no live API calls from browser) unless v0.5 chat demands it
- Zero dependencies always
- Prefer adding value over perfecting; iterate

## v0.5 — Chat Interface (Hermes Desktop replacement)

The workbench needs a live chat with Hermes. This is the feature that lets Dad ditch Hermes Desktop entirely.

**Architecture:**
Browser → Tower nginx → Tailscale → Mac Hermes API (`/api/v1/chat/completions`)

The Mac API is already exposed on the tailnet via Caddy on port 8643. Tower can reach it at `100.66.56.29:8643`. The browser can POST directly to that URL from the tailnet — CORS can be configured on the Mac side.

**What ships:**
- Chat tab with message history (session-based)
- Message input, send, streaming response display
- Session management (list, switch, new)
- Model/provider picker
- Tool execution panel (optional, shows running tools)

## v0.6 — Cron Dashboard

Visual grid of all cron jobs. Data already partially available — the collector can SSH to Mac and run `hermes cron list`.

**What ships:**
- Cards per cron job: name, schedule, last-run time, status (ok/failed/never), next fire
- Filter by healthy/failing/never-run
- Trigger "run now" button (via HTTP to Hermes API)

## v0.7 — Skill Browser

Browse/search all skills from the workbench. Data already in the library index, but a dedicated tab with:
- Skill cards: name, category, description, author, file size
- Click to view full SKILL.md rendered
- Search/filter by category

## v0.8 — Agent Session Viewer

Live view of running and recent Hermes sessions. Data from Hermes API `/api/v1/sessions`.

## v0.9 — Notifications / Event Stream

Live feed of cron completions, gateway events, email pipeline triggers. Uses SSE from Hermes API.

## Implementation order

| Version | Focus | Effort | Dependency |
|---------|-------|--------|------------|
| v0.5 | Chat interface | Large | Hermes API CORS config |
| v0.6 | Cron dashboard | Small | Collector extension |
| v0.7 | Skill browser | Small | Already have data |
| v0.5.1 | Chat polish | Medium | User feedback |
| v0.6.1 | Cron actions | Small | Hermes API key |
| v0.8 | Sessions | Medium | Hermes API |
| v0.9 | Notifications | Medium | SSE |

Start with **v0.5 (Chat)** — that's the big value unlock. Then **v0.6 (Cron)** since it's small and immediately useful.
