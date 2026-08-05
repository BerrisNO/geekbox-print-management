---
type: gatekeeper-verdict
pipeline: build
phase: remediation
gatekeeper: gatekeeper-build
verdict: APPROVED
attempt: 1
scope: REMEDIATION_LOOP (code-chief review defects)
critical_fixed: 1
major_fixed: 8
minor_fixed: 4
critical_remaining: 0
timestamp: 2026-08-05T00:00:00Z
---

# Gatekeeper-Build Verdict — Remediation Loop: APPROVED

Validates the remediation of the code-chief review package (Ready-with-Disputes:
1 Critical, ~18 Major/High). Unlike the original build, this pass executed the
environment-gated backend runtime tests for real (portable Node 22 + rebuilt
`better-sqlite3` ABI v127), so the load-bearing correctness claims are evidence-backed,
not asserted.

## Challenge 1 — Existence & Accuracy: the CRITICAL ledger fix (BUG-001/MR-004)
- **Verified by reading the code**: `ledger-write.ts` `applyEntry` now computes
  `appliedDeltaG = balanceAfterG - previousBalance` and persists it; `correctConsumption`
  reverses `-live.appliedDeltaG` (was `-live.deltaG`). New `applied_delta_g` column added to
  schema + baseline migration. New `filamentConserved` invariant in `invariants.ts`.
- **Verified by running the test that would have caught it**: the new
  `reversing an over-consumption restores the exact pre-consumption balance` test **FAILS on
  the pre-fix code (expected 100, got 250 — phantom 150g)** and **PASSES after the fix**.
  Plus a mixed-floor case and a 60-run property test (`reverse-after-floor never inflates`).
  This is direct before/after evidence, not a narrative — no Phantom Resolution.
- **Root-cause, not symptom**: the reconstruction is robust to `nowMs()` millisecond
  timestamp collisions (an earlier createdAt-ordered attempt was rejected during
  remediation when the property test surfaced `initial=8` failing — the applied-delta is now
  a persisted column, not a derived quantity).
- **ADR-009 conformance**: ADR-009 §1's normative "delta_g = −original.delta_g" is the exact
  wording that produced the bug when combined with floor-at-zero; the fix conserves total
  filament (the ADR's stated intent) — flagged for design-ledger note that the normative text
  should read "reverse the applied delta".

## Challenge 2 — QR-002 single-writer is now MECHANICAL, not vacuous
Dead `repository.ts` deleted; `LedgerWriter` is the only `insert(spoolLedgerEntry)` /
`update(spool.remaining)` site (grep-verified). depcruise rule `single-ledger-writer` points
at the real writer and forbids value-imports outside the ledger module + DI container;
services converted to `import type`. **depcruise: 0 violations (77 modules).** Reception +
jobs both reach the ledger only via the injected instance.

## Challenge 3 — Security fixes verified in code + tests
- Throttle keyed per-IP (2 new tests prove one key's lockout does not affect another).
- Login runs an argon2 verify on both branches (dummy hash on unknown-user) — constant-time-ish;
  generic error identical on both paths.
- MQTT host allow-list at the sink AND the schema (6 tests incl. userinfo/scheme/port/suffix
  bypass attempts).
- Backup GET→POST; Origin-check hook on state-changing methods; strict CSP enabled.

## Challenge 4 — Frontend a11y verified by behavior tests
7 new jsdom tests prove: aria-describedby wiring (hint+error), aria-required, dialog focus
enters+restores + Esc, roving tabindex, arrow/Home/End navigation. Error boundary added at
root + per-route.

## Verification evidence (all GREEN on Node 22.23.2)
biome ci 0 · tsc×3 = 0/0/0 · vitest backend 47/47 · vitest frontend 24/24 · depcruise 0 ·
builds shared/backend/frontend all pass · bundle 139.6 KB gz < 200 · pnpm audit high = pass.

## Runtime verification note
Backend + frontend both build. Full `docker compose up` runtime boot NOT executed (Docker
absent on host) — carried as the one residual runtime-verification gap; the backend DB layer
is exercised by 47 real tests against the actual migration on better-sqlite3, and the frontend
production build + m5 freshness gate pass.

## Verdict
**APPROVED.** Zero Critical remaining; all six mandatory fixes resolved with code + test
evidence; the one Critical is provably fixed (failing→passing regression). Residual items
(QR-005 perf N+1, BUG-006/010 minor correctness, axe contrast, docker boot) are documented
fast-follows, none Critical. Ready to return to admiral for re-review / Handoff 3.
