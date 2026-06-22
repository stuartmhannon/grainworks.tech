# Sprint 9 — Workbench Hardening + Obsidian Pipeline Fix

## Goals
1. Fix the Obsidian vault integration (iCloud sandbox breaking vault-watcher + inbox-processor)
2. Harden the workbench: clean up remaining UI bugs, standardize layout
3. Fix the data pipeline so all tabs have real data to render

## Tasks

| # | Title | Pri | Est |
|---|-------|-----|-----|
| 33 | Sprint 9 — Install Obsidian Local REST API plugin and wire into vault pipeline | 4 | 30m |
| 34 | Sprint 9 — Fix obsidian-watcher cron to use REST API instead of direct file reads | 4 | 30m |
| 35 | Sprint 9 — Fix obsidian-inbox-processor cron to read vault notes via REST API | 4 | 30m |
| 36 | Sprint 9 — Audit all workbench data files on Tower for missing/null sources | 3 | 15m |
| 37 | Sprint 9 — Add missing data collectors (cron-status, ideas-index) to sync pipeline | 3 | 20m |
| 38 | Sprint 9 — Queue kanban: verify renders in Projects tab with real tasks data | 2 | 10m |
| 39 | Sprint 9 — Agents tab: wire real agent status from orchestrator routes | 2 | 15m |
| 40 | Sprint 9 — Responsive: test sidebar collapse at 800px, verify all tabs usable | 2 | 10m |
| 41 | Sprint 9 — Console audit: open every tab, fix all JS errors, verify 0 warnings | 3 | 20m |
| 42 | Sprint 9 — Write retrospective and verify all 13 tabs in production | 1 | 15m |

## Files affected
- Workbench: `index.html`, `css/style.css`, `js/queue-panel.js`, `js/status-panel.js`, `js/chat-panel.js`, `js/dashboard-panel.js`
- Scripts: `~/.hermes/scripts/obsidian_watcher.py`, `~/.hermes/scripts/obsidian_midnight.py`
- Config: `~/.hermes/config.yaml` (obsidian-mcp server config)
- Tower: nginx config, data files at `/usr/share/nginx/html/data/`

## Architecture doc
- Obsidian fix: install "Local REST API" plugin in Obsidian (settings → community plugins → browse → "Local REST API"). After setup, curl `http://127.0.0.1:27124/vault/` to list/read notes. The REST API runs inside Obsidian which has the macOS sandbox entitlement.
- Alternative: create a small wrapper script that pipes file content through a privileged helper.
