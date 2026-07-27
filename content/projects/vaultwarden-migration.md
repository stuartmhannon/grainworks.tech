---
title: "Vaultwarden Migration & Security Assessment"
date: 2026-06-10T16:00:00-04:00
draft: false
status: "Complete"
tags:
  - security
  - vaultwarden
  - rust
  - docker
  - infrastructure
description: "Evaluating, migrating, and hardening a self-hosted Vaultwarden instance — including alternative password management strategies."
---

**Status: Migration from old instance complete. Security assessment under review.**

A thorough evaluation of the self-hosted Vaultwarden setup, including migration to a new server, comprehensive security assessment, replacement analysis, and alternative password management strategies.

## What Was Done

1. **Cloned the production database** from the UnRAID tower to the local Mini for redundancy
2. **Performed a security assessment** covering container hardening, backup strategy, TLS configuration, and access controls
3. **Evaluated beyond-Bitwarden alternatives** — what would it take to move away from Vaultwarden entirely? Including Passkey-first approaches, age-encrypted password stores (hermes-pass), and hardware-backed solutions
4. **Maintained a mirror** at `vaultwarden-mirror/` (local) for development and testing

## Source Files

- **Main repo:** `vaultwarden/` (local)
- **Mirror (dev):** `vaultwarden-mirror/` (local)
- **Security assessment:** `vaultwarden-replacement-security-assessment.md`
- **Replacement plan:** `vaultwarden-replacement-plan.md`
- **Beyond-Bitwarden analysis:** `vaultwarden-replacement-beyond-bitwarden.md`

## Key Findings

- Current Vaultwarden deployment is stable but has hardening gaps
- Age-encrypted password stores (hermes-pass) offer a compelling alternative for CLI-centric workflows
- Passkey-first approaches are still maturing — Vaultwarden remains the better choice for shared/secrets management in the near term
- Hook scripts on the mirror enable custom pre/post-backup processing
