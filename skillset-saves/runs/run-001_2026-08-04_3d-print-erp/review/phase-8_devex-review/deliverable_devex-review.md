---
type: deliverable
pipeline: review
phase: 8
skill: devex-review
name: Developer Experience Audit
version: 1
status: draft
created: 2026-08-05T00:00:00Z
---

# DEVELOPER EXPERIENCE AUDIT REPORT

**Project:** GeekBOX Print Management (self-hosted 3D-printing filament ERP)
**Date:** 2026-08-05
**Auditor:** devex-review (Phase 8, review pipeline)
**Mode:** Pipeline (delegated by code-chief). READ-ONLY.

## Executive Summary

- **Overall DX Score: 6.8/10**
- **TTHW: 8–15 min (Docker path) — INFERRED, not live-measured** (no Docker, no Node 22, no native build toolchain on the audit host; live run blocked)
- **Verdict: Conditional Pass**

GeekBOX has an unusually mature developer surface for a single-user self-hosted app: a clear README with a variable-by-variable config table, a fail-fast Zod-validated config with actionable messages, a clean RFC 7807 error pipeline that never leaks stack traces in production, a documented restore drill, a kill-switch for the risky Bambu integration, and a complete multi-job CI. The primary DX weakness is **environment-expectation accuracy**: the README asserts Node 22 + Docker as the happy path but does not warn that the local (non-Docker) dev path hard-requires Node 22 *specifically* (not 24) and a C/C++ build toolchain for the `better-sqlite3` and `argon2` native modules. On a Node 24 host these fail before the developer reaches a running app, and `dependency-cruiser` 16.10 crashes on Node 24 — none of which the docs anticipate.

**Top 3 Issues:**
1. README understates hard local-dev prerequisites (Node 22 exact, native build toolchain) → new self-hoster on Node 24 hits opaque native-build failures with no doc pointer. (Major)
2. `pnpm-workspace.yaml` ships an unresolved template placeholder `allowBuilds` block with the literal value `set this to true or false`. (Minor–Major; confusing dead config, redundant with the correct `onlyBuiltDependencies` below it)
3. `.env.example` `DB_PATH` default (`/data/geekbox.sqlite`, a container path) conflicts with the README local-dev instruction to use `./data/dev.sqlite`; a developer who copies `.env` verbatim for local dev writes to a non-existent absolute path. (Minor)

## Scorecard

```
DX AUDIT SCORECARD
═══════════════════
Project:  GeekBOX Print Management
Date:     2026-08-05
Auditor:  devex-review

Dimension            Score   Evidence            Method
──────────────────   ─────   ─────────────────   ────────
Getting Started      6/10    README + scripts    INFERRED (capped — TTHW not live)
API/CLI/SDK          8/10    config/error src    INFERRED
Error Messages       8/10    error-handler.ts    INFERRED
Documentation        7/10    README/restore.md   INFERRED
Upgrade Path         6/10    restore.md, no CHANGELOG  INFERRED
Dev Environment      6/10    package.json, CI    INFERRED
Community            3/10    no CONTRIBUTING     INFERRED
DX Measurement       6/10    CI, budgets         INFERRED

TTHW (inferred):     8–15 minutes (Docker path)
Overall DX Score:    6.8/10

Evidence Method Legend:
  TESTED   = Directly tested via tools
  INFERRED = Evaluated from file inspection (no Docker/Node22 on host)
```

Overall = 6×.25 + 8×.20 + 8×.15 + 7×.15 + 6×.10 + 6×.10 + 3×.05 = **6.775 ≈ 6.8**.
Getting Started capped at 6 per SKILL.md rule 7/edge-case: TTHW is INFERRED, not live (Docker/Node 22 unavailable on host).

## TTHW Assessment (inferred walk-through)

Docker path (the documented production path, `README §Run with Docker`):

| Step | Action | Est. Time | Friction | Evidence |
|------|--------|-----------|----------|----------|
| 1 | Install Docker + Compose (prerequisite) | — (assumed present) | Med — hidden if not installed | README:30 |
| 2 | `git clone` | 0:15 | Low | — |
| 3 | `cp .env.example .env` | 0:30 | Low | README:36-41 |
| 4 | Generate 2 secrets (`openssl rand ...`) + paste | 1:30 | Med — 2 manual secret gens, easy to skip | README:38-40, .env.example:6-9 |
| 5 | `docker compose up -d --build` | 3–8 min | Med — full multi-stage build incl. native `better-sqlite3` rebuild | Dockerfile:1-41 |
| 6 | Open `http://<host>:8080`, first-run account setup | 1:00 | Low — Setup.tsx guides account creation | README:61, Setup.tsx:15 |
| **Total** | | **~8–15 min** | **Overall 6/10** | build time dominates |

Local-dev path is materially riskier (see Finding DX-1): on a non-Node-22 host the `pnpm install` native builds (`better-sqlite3`, `argon2`) can fail before `pnpm --filter @geekbox/backend dev` ever runs, and the README gives no fallback or troubleshooting note.

## Findings by Dimension

### Getting Started (6/10)
- **DX-1 (Major)** — README `Prerequisites` (README.md:28-30) lists "Node.js 22 LTS and pnpm (via `corepack enable`)" and "Docker + Docker Compose", but does not warn that (a) the local path requires Node **22 specifically** — the backend depends on `better-sqlite3@11.10.0` and `argon2@0.44.0`, both native modules requiring python3/make/g++ (proven by Dockerfile:17 `apk add python3 make g++`), and (b) on Node 24 these native builds and `dependency-cruiser@16.10.0` (root package.json:22) fail. Impact: a self-hoster on the current common Node (24) following the "Local development" block (README:68-78) hits a native-compile failure with no doc pointer to the root cause. Fix: add an explicit "Local dev requires Node 22.x and a C/C++ build toolchain (python3, make, g++); use the Docker path to avoid native builds" note, and state that Node 24 is unsupported.
- **DX-2 (Minor)** — `.env.example:16` sets `DB_PATH=/data/geekbox.sqlite` (a container-absolute path), while README:78 tells local-dev users to set `DB_PATH=./data/dev.sqlite`. A developer copying `.env` for local use writes to `/data/...` which does not exist outside the container. Fix: comment in `.env.example` that `DB_PATH` is the container default and local dev should override it.

### API/CLI/SDK Ergonomics (8/10)
- Config surface is clean and self-documenting: `loadConfig` (config.ts:48-67) is a single typed entry, `.env.example` mirrors the README table 1:1. `scripts/backup.mjs` is a clear positional CLI (`node scripts/backup.mjs [dbPath] [backupDir]`) with sensible env-var fallbacks (backup.mjs:14-15). No public HTTP API by design (LAN-only, README:118). Minor: backup CLI help is comment-only (no `--help`).

### Error Messages (8/10)
- **Strength** — `config.ts:50-55` aggregates all Zod issues into a readable multi-line `Invalid environment configuration:` block; surfaced at startup by `main.ts:50-53` (`console.error('Fatal startup error:', err)`) → a misconfigured secret produces a Tier-1 actionable message, e.g. `SESSION_SECRET must be at least 32 characters` (config.ts:22) and `TOKEN_ENCRYPTION_KEY must decode to exactly 32 bytes (base64 or 64-char hex)` (config.ts:18). No stack trace for the config case (the Error message carries the guidance).
- **Strength** — RFC 7807 handler (error-handler.ts:10-58) never leaks stack traces in production, logs full detail server-side, returns sanitized `500 INTERNAL_ERROR`; Zod field maps returned as structured `errors` (error-handler.ts:13-27). Setup 409 mapped to human copy "An account already exists. Please sign in instead." (Setup.tsx:30-31).
- **DX-3 (Minor)** — `main.ts:51` still carries an ESLint-disable comment (`// eslint-disable-next-line no-console`) though the project lints with Biome, not ESLint — harmless but stale. Also, unlike the config-error case, a *generic* fatal startup error prints the raw Error object with stack; acceptable for an operator-run container but not Tier-1.

### Documentation (7/10)
- README is accurate and complete for the Docker path; secret-generation commands (README:38-40) match `.env.example` and config.ts validation exactly. `scripts/restore.md` is an excellent, copy-paste-complete restore drill including the critical `-wal`/`-shm` cleanup note (restore.md:24-26) and a rollback section. Bambu linking, manual-token fallback, and the kill-switch are documented (README:100-113).
- **DX-4 (Minor)** — README §Bambu says the integration "can be turned off entirely with the permanent kill switch (Settings → Integration → Enabled)" (README:104-105) — "permanent" + "turned off … Enabled" is mildly self-contradictory phrasing; clarify whether the kill-switch is reversible.
- Frontend Vite is 6.4.3 (frontend/package.json:46), deviating from the locked Vite 8; this is disclosed in a **code comment** (vite.config.ts:8-9) but not the README. Since the README says only "Vite" (no version), there is no user-facing contradiction, but the deviation lives only in a comment rather than a tracked decision log.

### Upgrade Path (6/10)
- No `CHANGELOG.md` and no `CONTRIBUTING.md` at repo root (confirmed absent). Migration story is sound: Drizzle migrations at `apps/backend/migrations/0000_baseline.sql`, applied idempotently at startup (main.ts:19-21, restore.md:27-29). README covers `TOKEN_ENCRYPTION_KEY` rotation via unlink/re-link (README:113). Fix: add a CHANGELOG for a self-host audience (breaking config changes matter most).

### Dev Environment (6/10)
- Scripts are discoverable and consistent (root package.json:10-19; per-app scripts present). CI (`ci.yml`) is multi-job and mirrors local commands (lint/typecheck/test/depcruise/audit/build-image) on Node 22 — reproducible *on Node 22*.
- **DX-5 (Minor–Major)** — `pnpm-workspace.yaml:5-9` contains a leftover scaffold placeholder:
  ```yaml
  allowBuilds:
    '@tailwindcss/oxide': set this to true or false
    argon2: set this to true or false
    better-sqlite3: set this to true or false
    esbuild: set this to true or false
  ```
  `allowBuilds` is not a real pnpm-workspace key (the correct mechanism, `onlyBuiltDependencies`, is present and correct at lines 11-15), so this block is inert but confusing dead config with literal instruction-text values a maintainer clearly meant to resolve. Fix: delete the `allowBuilds` block.
- `verifyDepsBeforeRun: false` (pnpm-workspace.yaml:17) is set, likely to sidestep the dep-verification friction; worth a one-line comment explaining why.

### Community (3/10)
- No CONTRIBUTING guide, no issue templates, no CHANGELOG. Acceptable for a single-user self-hosted project but scored against the general rubric. Not a blocker given project scope (single local account, no RBAC by design, README:118).

## Recommendations (prioritized)

1. **(Major) Fix environment expectations in README.** Add: "Local development requires Node **22.x** (not 24) and a C/C++ build toolchain (python3, make, g++) for native modules (`better-sqlite3`, `argon2`). `dependency-cruiser` does not run on Node 24. If you don't want native builds, use the Docker path." Prevents the most likely first-run failure for a new self-hoster.
2. **(Minor–Major) Remove the `allowBuilds` placeholder block** from `pnpm-workspace.yaml:5-9` — it is dead, misleading config redundant with `onlyBuiltDependencies`.
3. **(Minor) Reconcile `DB_PATH` between `.env.example` and README** — annotate `.env.example:16` that the default is the container path and local dev should override it.
4. **(Minor) Add a CHANGELOG.md** aimed at self-hosters (breaking config/secret changes, migration notes) to lift the Upgrade Path score.
5. **(Minor) Clarify the "permanent kill switch" wording** (README:104-105) and move the Vite-8→6 deviation from a code comment into a tracked note/ADR.

---
## Pipeline Summary (Machine-Readable)

phase_id: 8
skill: devex-review
status: COMPLETE
risk_assessment: Medium
overall_dx_score: 6.8/10
tthw_minutes: 8-15 (inferred, Docker path)
dimensions_tested: 0
dimensions_inferred: 8
finding_count:
  critical: 0
  major: 1
  minor: 4
verdict: Conditional
---
