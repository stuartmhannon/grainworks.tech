---
title: "Sibyl vs Holographic — Memory at the Grain"
date: 2026-06-08T20:00:00-04:00
draft: false
tags:
  - memory
  - agents
  - hermes
  - comparison
description: "Two SQLite-based agentic memory systems, one local slot. Here's what we found testing Sibyl Memory against our Holographic baseline."
---

We recently installed and audited **Sibyl Memory** — the #2-ranked system on LongMemEval (ICLR 2025), built by the autonomous agent SIBYL at Sibyl Labs LLC — and ran it side-by-side against **Holographic**, the local memory provider that's been our baseline since June.

Both are SQLite-backed agentic memory systems for Hermes Agent. Both are local-first. Both use FTS5 for search. Big numbers — LongMemEval, multi-tier architecture, self-learning features — but the interesting story is in the tradeoffs.

Here's what we found.

### What Each System Is

**Holographic** — a MemoryProvider plugin for Hermes Agent, originally by dusterbloom (Nous PR #2351). Built around Phase Holographic Reduced Representations (HRR): a vector symbolic architecture that encodes compositional structure into fixed-width phase vectors. Provides 9-action tool (`fact_store`) with entity resolution, trust scoring, and FTS5 search. numpy optional — without it, HRR falls back to keyword search. Zero cloud dependencies, zero accounts, zero costs.

**Sibyl Memory** — a standalone SDK (`sibyl-memory-client`) with five-tier hierarchical schema (HOT/WARM/COLD/REFERENCE/ARCHIVE). Claims 95.6% on LongMemEval (vs Holographic's unknown baseline, since Holographic wasn't benchmarked on it). Ships with a Learner module (self-detects patterns from journal events and proposes skills), a Linter, and pluggable summarizers (local-deterministic, BYOK LLM, or the Venice/x402 routing). Installs as a Hermes plugin via `sibyl-memory-hermes install-plugin`.

### Architecture Comparison

**Storage.** Both use SQLite with WAL mode and FTS5 indexes. Holographic has three tables: `facts`, `entities`, and `memory_banks` — the last for HRR compositional vectors. Sibyl has a richer schema: `entities` (WARM tier), `state_documents` (HOT), `reference_documents` (REFERENCE), `journal_events` (COLD), `archive_entities` (ARCHIVE), plus `skill_proposals` and `learning_runs` for the self-learning subsystem.

**Tiering.** Holographic doesn't tier — everything is a fact with a trust score (0.0-1.0) that degrades with time. Sibyl enforces five explicit tiers: journal for session context, entities for durable facts, state for current working data, reference for runbooks/skills, archive for cold storage. The tiering is architectural — each tier maps to a distinct Python method on the SDK.

**Search.** Both use FTS5. Holographic searches across facts + tags with trust-weighted ranking. Sibyl searches across all four searchable tiers (entity, state, reference, journal) with tier-tagged results and FTS5 snippet highlighting at the SDK level.

**API Surface.** Holographic exposes two tools: `fact_store` (9 actions) and `fact_feedback` — compact but dense. Sibyl exposes `sibyl_remember`, `sibyl_recall`, `sibyl_search`, `sibyl_list` through the Hermes plugin adapter — simpler per-call but more tools to choose from.

### The Dealbreaker

Sibyl requires **cloud activation**. After `pip install`, you run `sibyl init` which opens a browser flow to bind an account — email, wallet, or OAuth. Without activation, the SDK runs in free tier with a **2 MB cap** on database size. The free tier also gates the self-learning and memory linter features behind a paid subscription or stake.

Holographic requires nothing. Install the files, set `memory.provider: hermes-memory-store` in config.yaml, reset the session. Done. Unlimited database size. No accounts, no caps, no cloud roundtrips.

This is the architectural tension: Sibyl's richer feature set (self-learning, multi-tier, LongMemEval-validated retrieval) comes with a trust and cost model that requires an external server. The local SQLite database is real, but the *cap enforcement* and *feature gating* talk to sibyllabs.org.

### Practical Differences

**When Sibyl wins.** Any scenario where LongMemEval scores matter — benchmarks, academic evaluation, or comparison-driven procurement. The self-learning module genuinely detects usage patterns and proposes skills, which could be useful in long-running agent deployments. The five-tier schema is more deliberate than Holographic's flat fact table, and the `search_multi_record` two-stage retrieval is a meaningful improvement for workflow-oriented queries.

**When Holographic wins.** Every scenario where zero-dependency, fully-offline, never-call-home operation is the requirement. The HRR compositional retrieval (probe, reason, contradict) is architecturally interesting — it lets the agent ask "what facts connect entity A and entity B?" algebraically, not by keyword intersection. Trust scoring with feedback is a self-correcting memory surface that doesn't need an external server to calibrate.

**The orchestrator question.** Our orchestrator (V2.5, LLM-intent-routed across 19 domain agents) depends on memory for cross-session context — it needs to remember project state, contact enrichment status, and domain-specific conventions between delegation runs. For that workload, the self-learning feature would be genuinely useful (the orchestrator's patterns would be detected and abstracted into reusable skills), but the 2 MB free cap is too tight — we already exceed that with just 127 facts and 18 entities in Holographic's store, and an active orchestrator would generate orders of magnitude more.

### The Verdict

If you're building for a benchmark, need a validation badge, or want turnkey self-learning with a known evaluation score: **Sibyl is the answer.** The documentation is thorough, the SDK is well-structured, and the LongMemEval score is real.

If you're shipping a system that must work offline, must never phone home, and must not cap your memory at 2 MB: **stay on Holographic.** It's less flashy but operationally simpler — zero external dependencies, unlimited storage, trust-based fact management that improves with use rather than throttling it.

For our setup — the orchestrator, the research pipelines, the autonomous morning briefing — we're staying on Holographic. The self-learning gap is real and we'd like to fix it, but not by introducing cloud dependency into a system that was designed around local-first operation from day one.

**What we'd really like:** a local-only port of Sibyl's multi-tier schema and self-learning detection, without the cap gate or cloud activation. That would be the best of both worlds. If Sibyl Labs ever ships a truly self-contained tier, we'll be the first to test it.
