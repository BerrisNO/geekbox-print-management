---
type: deliverable
pipeline: build
phase: 2
skill: test-builder
name: Test Suite — GeekBOX Print Management
version: 1
status: submitted
created: 2026-08-05T03:10:00Z
---

# Phase 2 Test Suite Report

## Backend tests (apps/backend/tests/)
- **unit/units.test.ts** (7) — length→mass conversion (ES-402.1), money rounding/valuation. RUN: PASS.
- **unit/throttle.test.ts** (5) — login throttle 10/15min→30s, window reset (NFR-SE-07). RUN: PASS.
- **contract/normalizer.contract.test.ts** (6) — ACL boundary against MS-1 fixtures: bind/tasks/report normalization, drift tolerance, unknown-field stripping (NFR-MA-02/03). RUN: PASS. **Caught + fixed a real bug**: raw schema rejected null tray_type; made tolerant boundary `.nullish()`.
- **integration/schema-constraints.test.ts** (6) — migration applies; CHECK balance>=0, UNIQUE(reverses_entry_id), external slot 254:0-only, UNIQUE(job_id,slot_ref), UNIQUE(spool_id). RUN via node:sqlite: PASS.
- **integration/ledger.test.ts** — ADR-009 suite: initial/consumption/idempotent-replay/floor-at-zero/reverse-and-repost/same-spool-correction + fast-check property (balance==last entry, floor>=0, live/reversed invariant). Requires better-sqlite3 (CI/Docker). NOT run on this host (native build unavailable).
- **integration/reception.test.ts** — atomic posting, partial/over-delivery/damaged, + crash-injection rollback (NFR-RE-03). Requires better-sqlite3. NOT run on this host.

## Frontend tests (apps/frontend/src/tests/)
- **freshness.test.tsx** (14) — m5 DataFreshness standing CI gate: descendant [data-freshness][data-captured-at] role=status; correct state at 9s/11s/90s/121s (90s never fresh). RUN: PASS.
- **client.test.ts** (3) — API client RFC7807 → field-error mapping. RUN: PASS.

## Results summary
- RAN and PASSED here: 24 backend (unit+contract+schema) + 17 frontend = 41 tests.
- NOT run here (documented gap): ledger.test.ts + reception.test.ts (need better-sqlite3
  native binding — unavailable on Node 24 dev host with no C++ toolchain). They typecheck
  clean and are wired into `pnpm -r test`; they execute on node:22 CI / Docker.
- Exact commands: `pnpm -r test`; frontend gate `pnpm --filter @geekbox/frontend test:freshness`.
