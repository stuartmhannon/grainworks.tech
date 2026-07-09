---
title: "Organizational Orchestrator — Multi-Agent Routing System"
date: 2026-06-29T06:00:00-04:00
draft: false
description: "A multi-agent orchestration framework that routes requests across 19 domain-specialized agents with intent classification, context passing, and two-stage verification."
tags: [grainworks, agents, orchestration, hermes-agent]
---

An advanced master orchestrator for routing, delegating, and verifying tasks across organizational domains. Started as a keyword-matching router (V2.2) and evolved toward LLM-based intent classification (V2.5). Uses Hermes Agent's `delegate_task` API under the hood for subagent execution.

## Architecture

```
┌──────────────────────────────────────────────┐
│           OrganizationalOrchestrator          │
│  Intent Classification → Routing → Delegation │
├──────────────────────────────────────────────┤
│  Specialists (19 domains):                    │
│  Strategy | Finance | HR | Legal | Data      │
│  IT/Security | Procurement | Citizen Svcs    │
│  Auditor | Emergency | Urban Planner | Health│
│  Education | Social Services | Comms | Ops   │
│  Facilities | Research | Innovation           │
└──────────────────────────────────────────────┘
```

Each specialist has:
- **Keyword map** (e.g., "budget", "appropriation" → Finance)
- **System prompt** tailored to domain
- **Output format** (document, report, email, analysis)
- **Tool set** specific to their function

## The Evolution

| Version | Approach | What Changed |
|---------|----------|--------------|
| V1 | Fixed routing table | Every intent hard-coded to one agent |
| V2.2 | Keyword + priority matching | 19 specialists with aliases, keyword maps, fallback chain |
| V2.5 | LLM intent classification | Replace keyword matching with model-based routing |

The farm scenario that broke V2.2 keyword matching: "I need to deploy a new water sensor array on the north field" — this could route to IT (deploy), Facilities (sensors), or Urban Planning (land use). Keyword matching couldn't disambiguate. V2.5's LLM classification solved it.

## Key Files

- **`organizational_orchestrator_v2.2.yaml`** — Full 573-line agent directory with 19 specialist definitions, routing tables, and system prompts
- **`HERMES-DESKTOP AGENT DIRECTORY.yaml`** — Desktop-compatible version

## What Was Learned

- Keyword routing is brittle at domain boundaries
- 3+ specialists share common keywords — disambiguation needs semantic understanding
- Context passing between agents is harder than routing itself
- The two-stage review pattern (spec then quality) catches more than either alone
- 19 agents is the inflection point where manual routing breaks

## Status → **✅ Shipped (V2.2) / 🟡 Evolving (V2.5)**

V2.2 is operational. V2.5 intent classification is in development.
