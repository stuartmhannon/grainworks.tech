---
title: "SOUL.md — Trait Analysis & Personality System"
date: 2026-06-10T16:00:00-04:00
draft: false
tags:
  - ai
  - personality
  - research
  - experimental
description: "An experimental framework for composing AI agent personas — trait vectors, archetype blending, and multi-agent personality systems."
---

**Status: Active development. 8+ reference souls, trait-8000 analysis engine.**

SOUL.md is an experimental framework for composing AI agent personalities. Instead of a single static persona, it defines agent souls as blends of trait vectors — letting them shift register, adopt archetypes, and compose new personalities from a library of reference souls.

## The Framework

```
SOUL.md/
├── souls/                    # Reference archetypes (persona SKILL.md files)
│   ├── jarvis/              # Calm, loyal guardian
│   ├── elizabethan-gentleman/ # Formal, witty
│   ├── eren-yeager/         # Intense, driven
│   ├── gojo/                # Playful, powerful
│   ├── niccolo-paganini/    # Artistic, eccentric
│   ├── rene-descartes/      # Philosophical, methodical
│   ├── senior-programmer/   # Technical, direct
│   ├── soldier-boy/         # Disciplined, loyal
│   └── rapper/              # Rhythmic, expressive
├── trait-8000/               # Trait analysis engine
├── assets/                   # Visual references
└── souls/                    # Full soul definitions
```

## The Trait-8000 Engine

A Python-based analysis system that:
- Extracts trait vectors from existing persona definitions
- Analyzes semantic overlap between archetypes
- Proposes blends for new composite souls
- Generates evaluation prompts for testing persona consistency

## Upcoming Work

- Multi-agent orchestration with distinct souls per agent
- Trait blending UI for composing new personalities
- Longitudinal consistency testing
- Integration with the Hermes orchestration framework

## Source Files

- **Repo:** `SOUL.md/` (local)
- **Trait engine:** `trait-8000/` — Python analysis pipeline
- **Reference souls:** Individual SKILL.md definitions with visual assets, trait breakdowns, and example interactions
