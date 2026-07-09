#!/usr/bin/env python3
"""
collect-workflows.py — Hermes Workflow Index Collector

Scans /Volumes/Mini_1Tb/Projects/ for YAML files containing Hermes orchestrator
definitions and produces a JSON index of workflow routes/domains for the
workbench dashboard at grainworks.tech.

Output: /Volumes/Mini_1Tb/Projects/grainworks.tech/static/workflows/data/workflows-index.json
"""

import json
import os
import sys
import time
from datetime import datetime, timezone

try:
    import yaml
except ImportError:
    print("ERROR: PyYAML is required. Install with: pip install pyyaml", file=sys.stderr)
    sys.exit(1)

# ── Configuration ──────────────────────────────────────────────────────────────
SCAN_ROOT = "/Volumes/Mini_1Tb/Projects"
OUTPUT_PATH = os.path.join(
    SCAN_ROOT,
    "grainworks.tech",
    "static",
    "workflows",
    "data",
    "workflows-index.json",
)
EXCLUDE_DIRS = {
    ".git",
    "__pycache__",
    "node_modules",
    ".venv",
    "venv",
    "env",
    ".env",
    ".next",
    "dist",
    "build",
    ".cache",
    ".trash",
    "Trash",
    ".Trash",
}


# ── Helpers ────────────────────────────────────────────────────────────────────


def is_hermes_orchestrator(data: dict) -> bool:
    """Heuristic: a YAML is a Hermes orchestrator if it has both
    agent_name/agent_id AND a specialists list."""
    if not isinstance(data, dict):
        return False
    has_agent = "agent_name" in data and "agent_id" in data
    has_specialists = "specialists" in data and isinstance(
        data.get("specialists"), list
    )
    return has_agent and has_specialists


def collect_workflow(file_path: str, data: dict) -> dict | None:
    """Extract a workflow record from a parsed Hermes orchestrator YAML."""
    try:
        stat = os.stat(file_path)
        last_modified = datetime.fromtimestamp(
            stat.st_mtime, tz=timezone.utc
        ).isoformat()
    except OSError:
        last_modified = None

    agents = data.get("specialists", [])
    specialists = []
    for agent in agents:
        if not isinstance(agent, dict):
            continue
        specialists.append(
            {
                "agent_id": agent.get("agent_id", ""),
                "name": agent.get("name", ""),
                "code": agent.get("code", ""),
                "priority": agent.get("priority", 99),
                "keywords": agent.get("keywords", []),
                "aliases": agent.get("aliases", []),
            }
        )

    return {
        "agent_name": data.get("agent_name", ""),
        "agent_id": data.get("agent_id", ""),
        "version": str(data.get("version", "")),
        "description": data.get("description", ""),
        "file_path": file_path,
        "last_modified": last_modified,
        "specialists": specialists,
    }


def collect_weather_workflow(file_path: str, data: dict) -> dict | None:
    """Collect workflow data from the weather data aggregator (different YAML structure)."""
    agent_info = data.get("agent", {})
    if not isinstance(agent_info, dict):
        return None
    if not agent_info.get("name"):
        return None

    try:
        stat = os.stat(file_path)
        last_modified = datetime.fromtimestamp(
            stat.st_mtime, tz=timezone.utc
        ).isoformat()
    except OSError:
        last_modified = None

    capabilities = data.get("capabilities", [])
    # Treat capabilities as keyword fingerprints for specialists
    specialists = [
        {
            "agent_id": f"weather.{cap}",
            "name": cap.replace("_", " ").title(),
            "code": cap.upper()[:8],
            "priority": 1,
            "keywords": [cap.replace("_", " ")],
            "aliases": [],
        }
        for cap in capabilities
    ]

    return {
        "agent_name": agent_info.get("name", ""),
        "agent_id": f"weather.{agent_info.get('name', 'aggregator').lower().replace(' ', '-')}",
        "version": str(agent_info.get("version", "")),
        "description": agent_info.get("description", ""),
        "file_path": file_path,
        "last_modified": last_modified,
        "specialists": specialists,
    }


# ── Main ───────────────────────────────────────────────────────────────────────


def main():
    scan_start = time.time()
    workflows = []
    files_scanned = 0
    errors = 0

    print(f"Scanning {SCAN_ROOT} for Hermes orchestrator YAML files...", file=sys.stderr)

    for root, dirs, files in os.walk(SCAN_ROOT):
        # Prune excluded dirs in-place
        dirs[:] = [d for d in dirs if d not in EXCLUDE_DIRS]

        for fn in files:
            if not fn.endswith((".yaml", ".yml")):
                continue

            file_path = os.path.join(root, fn)
            files_scanned += 1

            try:
                with open(file_path, "r", encoding="utf-8", errors="replace") as fh:
                    raw = fh.read()
                # Some files have \\n literal escapes instead of real newlines
                # inside comment lines, which breaks PyYAML. Normalise them.
                if "\\n" in raw:
                    raw = raw.replace("\\n", "\n")
                data = yaml.safe_load(raw)
            except Exception as exc:
                print(
                    f"  [SKIP] {file_path} — YAML parse error: {exc}",
                    file=sys.stderr,
                )
                errors += 1
                continue

            if not isinstance(data, dict):
                continue

            # Try standard Hermes orchestrator structure first
            if is_hermes_orchestrator(data):
                record = collect_workflow(file_path, data)
                if record:
                    workflows.append(record)
                    print(
                        f"  [WORKFLOW] {record['agent_name']} v{record['version']} "
                        f"({len(record['specialists'])} specialists) — {file_path}",
                        file=sys.stderr,
                    )
                continue

            # Try weather agent structure (agent: {name: ..., version: ...})
            agent_info = data.get("agent")
            if isinstance(agent_info, dict) and agent_info.get("name"):
                record = collect_weather_workflow(file_path, data)
                if record:
                    workflows.append(record)
                    print(
                        f"  [WORKFLOW] {record['agent_name']} v{record['version']} "
                        f"({len(record['specialists'])} specialists) — {file_path}",
                        file=sys.stderr,
                    )
                continue

    # Sort by agent_name for deterministic output
    workflows.sort(key=lambda w: (w["agent_name"], w["agent_id"]))

    output = {
        "workflows": workflows,
        "_meta": {
            "last_updated": datetime.now(timezone.utc).isoformat(),
            "source_count": files_scanned,
            "workflow_count": len(workflows),
        },
    }

    # Write output file
    os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
    with open(OUTPUT_PATH, "w", encoding="utf-8") as fh:
        json.dump(output, fh, indent=2, ensure_ascii=False)

    elapsed = time.time() - scan_start
    print(file=sys.stderr)
    print(f"─── Scan complete ───", file=sys.stderr)
    print(f"  Files scanned:   {files_scanned}", file=sys.stderr)
    print(f"  Workflows found: {len(workflows)}", file=sys.stderr)
    print(f"  Parse errors:    {errors}", file=sys.stderr)
    print(f"  Elapsed:         {elapsed:.2f}s", file=sys.stderr)
    print(f"  Output:          {OUTPUT_PATH}", file=sys.stderr)


if __name__ == "__main__":
    main()
