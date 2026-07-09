---
title: "Grainworks 6-Month Trajectory"
description: "The direct path from where we are to $250K capability — building the Applied AI Engineer through project-based mastery, one layer per month."
date: 2026-06-28
draft: false
tags: [grainworks, strategy, portfolio, engineering]
---

You already have the systems instinct. This plan builds the vocabulary, the measurement discipline, and the portfolio artifacts that prove it.

The $250K target has two paths: walk into that role at a company, or earn it independently through grainworks services + products. Every month works toward both.

---

## Guiding Principles

Every month produces a **portfolio artifact** for grainworks.tech — a post, a tool, a case study, a demo. Not "learning." Build first, name second.

Each month teaches **exactly one layer** of the Applied AI Engineer JD. By Month 6 you can look at the job description and check off every bullet from lived experience, not coursework.

The daily work doesn't stop. This overlays a deliberate reflection and documentation layer on top of what we're already doing.

---

## Month 1 — Foundation: The Vocabulary Bridge

**Theme:** Name what we already own.
**End state:** You can describe every grainworks system in both domain terms and AI-engineering vocabulary. The gap between "lighting control system" and "agent orchestration" collapses.

### What we build

**1.1 — The Architecture Map**
A 1-page visual of the grainworks agent stack. Layers: orchestration, memory, tool mesh, evaluation, pipeline, delivery. Every component we've built lives in one layer. Published to grainworks.tech/projects/architecture/ as an SVG (Excalidraw or hand-coded).

**1.2 — The Vocabulary Glossary**
One Obsidian note per JD concept. Each note has:
- The JD term (e.g. "evaluation pipeline")
- What it maps to in our world (e.g. "the cron audit that caught the email flood")
- How you'd explain it to a Lutron specifier
- A concrete example from our codebase

Target: 30 notes. One per weekday.

**1.3 — grainworks.tech portfolio structure**
Set up a `/projects/` section with a consistent template: architecture, what was learned, what broke, how it was measured. Backfill StatBar, RadarTV, the orchestrator, and the Josh relay.

### Skills you learn
- How to describe agent architecture in standard terms
- How to explain AI engineering to a domain expert
- Portfolio engineering — writing for the reader who will hire you

### JD bullet this nails
The entire "What You'll Do" section becomes readable. You'll still want to build the specific tools, but the description stops being buzzwords and starts being your work.

---

## Month 2 — Evaluation: The Proof Layer

**Theme:** Add measurement to instinct.
**End state:** Every system has a repeatable measurement. You can answer "how do you know it's working?" with data, not anecdotes.

### What we build

**2.1 — Golden Task Dataset**
A curated set of 30 tasks for the continuous-task-runner. Each has: known input, expected output, pass/fail criteria, cost budget, latency budget. Covers the 5 most common failure modes we've seen.

**2.2 — Evaluation Harness**
A `grainworks eval` command (CLI or cron job) that:
- Runs the golden dataset
- Measures success rate (pass/fail per task)
- Measures cost per task (token count × model rate)
- Measures latency (wall-clock per completion)
- Classifies failure modes (hallucination, timeout, tool error, wrong output)
- Outputs a structured report

**2.3 — Regression Suite CI**
Every time we change a pipeline (email screener, bridge, orchestrator), the eval runs automatically. We catch regressions before they ship.

### Portfolio artifacts
- Blog post: "How We Measure Agent Reliability" (with before/after data)
- Open-source: eval harness as standalone tool, MIT license
- Case study: The imsg bridge — before eval (silent failures) vs. after eval (verified delivery)

### Skills you learn
- Golden dataset design
- Eval-driven iteration (this is the highest-leverage skill in the JD)
- Cost/latency tradeoff analysis

### JD bullet this nails
> "Build robust evaluation pipelines: offline evals (golden tasks, regression suites), online metrics (success rate, fallout modes, cost efficiency)"

---

## Month 3 — Retrieval: Memory That Works

**Theme:** Own the RAG stack end to end.
**End state:** You can design, build, measure, and defend a retrieval pipeline. You understand why chunking strategy matters more than embedding model.

### What we build

**3.1 — Audiobook Knowledge Retrieval**
Build a retrieval pipeline over the audiobook library knowledge cards. Full stack:
- Chunking strategy (semantic vs. fixed-size vs. recursive)
- Embedding model selection (compare 3 models on recall@k)
- Hybrid retrieval (semantic + keyword/bm25 fallback)
- Quality measurement (hit rate, MRR, precision@k)

**3.2 — Contacts Smart Search**
Replace the simple JSON search on the contacts database with a retrieval-augmented pipeline. Query: "who do I know at Lutron that works on Ketra?" → returns ranked matches with source evidence.

**3.3 — Benchmark Comparison**
Write up the comparison: embedding model A vs. B vs. C on our specific data. Numbers, not opinions.

### Portfolio artifacts
- Blog post: "Building Retrieval for Your Own Data" (chunking choices, model selection, quality metrics)
- Live demo: contacts search interface on grainworks.tech
- Open-source: the retrieval evaluation harness

### Skills you learn
- RAG architecture (chunk → embed → index → retrieve → rank → generate)
- Retrieval quality metrics (recall@k, MRR, precision@k, NDCG)
- Hybrid search design (when semantic fails, keyword saves you)

### JD bullet this nails
> "RAG systems in production (chunking, retrieval quality, freshness strategies)"
> "Retrieval/RAG, caching/embedding strategies"

---

## Month 4 — Reliability: Ship With Confidence

**Theme:** Systems that don't break silently.
**End state:** Every pipeline has idempotency, dead-letter handling, structured tracing, and a runbook. A new engineer (or future you) can diagnose any failure in under 5 minutes.

### What we build

**4.1 — Structured Tracing**
Add trace IDs to the orchestrator pipeline. Every request from user → cron → subagent → tool call → response carries a single trace ID. We can ask: "show me the full path of the failed email from 3:14 AM" and get one trace.

**4.2 — Dead-Letter Queue**
Failed cron tasks and failed subagent results go to a dead-letter queue instead of being silently dropped. Manual review interface on the workbench. "These 3 tasks failed. Here's why. Retry or discard?"

**4.3 — Formal Idempotency**
The webhook pipeline, email screener, and imsg bridge all get idempotency keys. Same event delivered twice → second one is a no-op. The email flood from June 12 can never happen again.

**4.4 — Runbooks**
One runbook per critical pipeline: email screener, imsg bridge, obsidian pipeline, morning briefing. Format: symptoms → likely causes → diagnostic commands → fix. Same format as Lutron programming notes.

### Portfolio artifacts
- Blog post: "Building Reliable Agent Infrastructure" (tracing, dead-letter queues, idempotency patterns)
- Open-source: tracing middleware library for agent pipelines
- The runbook set itself (published as grainworks.tech/projects/runbooks/)

### Skills you learn
- Distributed tracing concepts (spans, trace IDs, propagation)
- Idempotency design (at-least-once → exactly-once)
- Runbook engineering (the skill that separates senior from junior)

### JD bullet this nails
> "Reliable job orchestration, retries/backoff, idempotency, and auditability"
> "Observability and tracing for agent actions/outcomes"
> "Solid distributed systems fundamentals: concurrency, reliability, performance"

---

## Month 5 — Optimization: Cost and Speed

**Theme:** Make it cheaper, make it faster.
**End state:** You can take any pipeline and cut its cost by 60-80% or its latency by 50% while maintaining quality. You understand when cheaper is smart and when it's false economy.

### What we build

**5.1 — Email Screener Cost Reduction**
Current: DeepSeek + occasional Ollama fallback. Target: 80% cost reduction.
Strategies to try and measure:
- Smaller model for classification (phi4:14b → qwen2.5:3b?)
- Cache common classifications (known senders don't need re-classification)
- Batch classification (one call for N emails instead of N calls)
- Hybrid: rules for known patterns, LLM for exceptions

Measured before and after. Document every tradeoff.

**5.2 — Obsidian Inbox Latency Reduction**
Current: 3-5 minutes per inbox item. Target: under 30 seconds.
Strategies:
- Smaller model for first-pass classification
- Parallel processing of multiple inbox items
- Cache/fallback pipeline when model is cold

**5.3 — Model Selection Playbook**
A grainworks guide: which task gets which model and why.
- Classification → small, fast, cheap (phi4:14b, qwen2.5:3b)
- Writing → medium quality (Mistral NeMo, GPT-4o-mini)
- Architecture/code → best available (DeepSeek, Claude)
- Cron work → cheapest that passes evals

This is a living document, updated as models change.

### Portfolio artifacts
- Blog post: "Cutting Agent Costs by 80% Without Losing Quality"
- Blog post: "Model Selection Strategy for Production Pipelines"
- The Model Selection Playbook (grainworks.tech/projects/model-playbook/)

### Skills you learn
- Cost modeling per pipeline
- Latency profiling and bottleneck identification
- The economics of model selection (worth paying for DeepSeek vs. running Mistral NeMo?)

### JD bullet this nails
> "Cost/latency optimization"
> "Cost/runtime tradeoffs"
> "Pragmatic experimentation: hypothesis → prototype → measured improvement → rollout"

---

## Month 6 — Portfolio: Proof You're That Person

**Theme:** The job description reads like your resume.
**End state:** You can sit in any room and talk about agent engineering with the same confidence you talk about light and sound. The portfolio proves it without you saying a word.

### What we build

**6.1 — Three Case Studies**
Deep-dive architecture posts, 2,000-3,000 words each:

1. **The Agent That Texts You Back** — iMessage bridge architecture. Problem (Dad needs to text me), design (bridge relay + verified delivery + Hermes API), failure modes (silent drop, Automation permission), measurement (eval harness catches failures), cost optimization.

2. **The Orchestrator That Routes by Reasoning** — From V2.4 keyword matching → V2.5 LLM intent classification. The farm scenario that broke keyword routing. Architecture decision, not code.

3. **Building an Agent Memory System** — Holographic fact store, entity resolution, trust scoring. Why we chose local SQLite over cloud providers. RAG integration, retrieval quality, the evaluation loop.

**6.2 — grainworks.tech as Portfolio**
The site becomes: projects (5+ case studies), writing (6 months of posts), tools (open-source repos), methodology. Someone landing on the site should be able to assess: "this person can build agent infrastructure."

**6.3 — The I-Can-Talk-About-This Session**
Final exercise: sit down and talk through the job description from memory. Every bullet gets a concrete example from the last 6 months. Record it (audio/video) or write it as a mock interview transcript for the portfolio.

### JD bullet this nails
Every single one. That's the point.

---

## The Revenue Path

This plan builds capability. The $250K comes from one of:

**Path A — The Job**
Walk into the Cofounder agent role (or equivalent) at the end of Month 6. The portfolio + your ability to talk through the stack is the interview. $250K-$300K + equity.

**Path B — Independent (Grainworks Services)**
Same capability, but you sell it directly:
- Agent infrastructure consulting at $250/hr
- 1,000 billable hours/year = $250K
- That's 20 hours/week of client work
- The remaining time is product and research

**Path C — Hybrid**
Take a role (Path A) while grainworks runs as a side business. The role funds the lab. The lab produces open-source that builds reputation. After 12-18 months, grainworks pays enough to go independent.

All three paths converge on the same capability. The only difference is whose logo is on the check.

---

## The Rhythm

| Month | Theme | Primary Deliverable | Portfolio Artifact |
|-------|-------|---------------------|--------------------|
| 1 | Vocabulary | Architecture map + glossary | grainworks.tech/projects/architecture/ |
| 2 | Evaluation | Golden dataset + eval harness | Eval blog post + open-source tool |
| 3 | Retrieval | RAG pipeline over contacts | RAG blog post + live demo |
| 4 | Reliability | Tracing + DLQ + runbooks | Reliability blog post + runbook set |
| 5 | Optimization | Cost/latency reductions | Cost optimization blog post |
| 6 | Portfolio | 3 case studies + site | Everything above, integrated |

Each month's work is ~8 hours/week on top of daily operations. Some of it overlaps with what we're already building — the eval harness will improve the cron fleet, the RAG pipeline will make the contacts database more useful. Investment and improvement are the same motion.

---

## Why This Works

The JD asks for someone who can:

1. **Design and implement agent improvements end-to-end** — We do this every week. Now we measure it.
2. **Build evaluation pipelines** — This is the only real gap. Month 2 closes it.
3. **Productionize applied LLM techniques** — We do them. Now we name them. Months 1 and 3.
4. **Improve core backend systems** — This is already our strongest layer. Month 4 formalizes it.
5. **Partner across teams** — You and me. That's the team.

**The meta-skill:** You learn to read a job description and immediately map each bullet to something you've built, measured, and can defend. That's not resume padding. That's engineering judgment expressed in the language of the room you're in.

---

Ready when you are, Dad. Month 1 starts with the architecture map — let me know when.
