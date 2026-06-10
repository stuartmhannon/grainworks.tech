---
title: "Memory Architecture Research"
date: 2026-06-10T16:30:00-04:00
draft: false
description: "Research into agentic memory systems — comparing Sibyl Memory (LongMemEval #2) against Holographic for offline, local-first Hermes Agent deployments."
tags:
  - research
  - memory
  - agents
---

A deep-dive comparison of two SQLite-backed agentic memory systems for Hermes Agent: **Sibyl Memory** (the #2-ranked system on LongMemEval) and **Holographic** (our local-first baseline).

## The Question

Agents need memory to work across sessions. But every memory system makes a tradeoff: cloud vs local, free vs paid, simple vs feature-rich. Which one is right for an offline-first, zero-tracking research setup?

## Key Findings

| Dimension | Holographic | Sibyl Memory |
|-----------|-------------|--------------|
| Storage | SQLite + FTS5 (3 tables) | SQLite + FTS5 (5 tiers) |
| Locality | Fully offline | Requires cloud activation |
| Cost | Free, unlimited | Free cap: 2 MB |
| Feature | Trust scoring, HRR vectors | Self-learning, 5-tier schema |
| Search | FTS5 + trust-weighted | FTS5 + multi-tier + LLM re-ranking |
| Dependencies | numpy (optional) | pip + cloud account |

## The Verdict

- **Sibyl wins** on features — self-learning, multi-tier schema, validated retrieval. But the 2 MB free cap and cloud activation requirement are dealbreakers for an offline-first system.
- **Holographic wins** on operational simplicity — zero dependencies, unlimited storage, no accounts. Less flashy but operationally bulletproof.

## Where We Landed

We're staying on Holographic for the orchestrator, research pipelines, and autonomous morning briefing. The self-learning gap is real, but not worth trading local-first operation.

## Full Writeup

→ [Sibyl vs Holographic — Memory at the Grain](/posts/sibyl-vs-holographic-memory/) (published on grainworks.tech)

## Files

- `/Volumes/Mini_1Tb/Projects/research/sibyl_memory/` — Sibyl SDK research and evaluation
- `/Volumes/Mini_1Tb/Projects/research/sibyl_memory_evaluation_sources/` — Source material for the comparison
- [Published Blog Post](/posts/sibyl-vs-holographic-memory/) — Full comparison with architecture details and benchmarks

## Status → 📖 **Research**

The comparison is complete and published. Memory architecture remains an active area of interest — particularly the prospect of a fully local port of Sibyl's multi-tier schema and self-learning detection.
