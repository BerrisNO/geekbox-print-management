---
type: deliverable
pipeline: review
phase: 3
skill: quality-review
name: Quality Review Report
version: 1
status: draft
created: 2026-08-05T00:00:00Z
---

# QUALITY REVIEW REPORT

**Target:** GeekBOX Print Management (3D-print ERP) — modular monolith. Backend (Node 22 / Fastify 5 / Drizzle+better-sqlite3), Frontend (React 19 / TanStack / Vite), shared package (Zod 4). Reviewed against design run-001 architecture, ADRs, and the three stack-lock documents.

**Scope note:** READ-ONLY assessment on disk. Typecheck was verified CLEAN by code-chief across all 3 packages. `biome check .` was re-run during this review and reproduces 11 errors + 6 warnings (all minor/FIXABLE). dependency-cruiser v16.10 cannot execute on the Node 24 host (crashes on an `R_OK` import); boundary rules were verified manually via import-graph grep across `apps/backend/src`. Metrics requiring SonarQube/coverage tooling are reported as gaps, not guessed.

## Quality Verdict: Conditional

The codebase is well-structured, idiomatic, and its load-bearing architectural invariants (Bambu ACL, single ledger write path, Fastify edge isolation) hold in practice. The Conditional (not Pass) verdict is driven by: (1) the CI lint gate would currently FAIL — `biome ci .` is non-fixing and the tree has 11 formatting/lint errors introduced by a post-build edit to `biome.json`; (2) two undocumented frontend stack-lock deviations (Vite, React Compiler); and (3) one architecture-enforcement rule that guards the wrong file (dead code), leaving a documented invariant enforced only by convention. None are correctness/security defects; all are maintainability/enforcement gaps.

---

## Standards Compliance

| Layer | Status | Tool / Method | Key Findings |
|-------|--------|---------------|--------------|
| 1 — Baseline Hygiene | **Fail (transient)** | Biome 2.2.0 (`check .`), tsc 5.9.2 | Typecheck CLEAN (all 3 packages). Biome reports **11 errors + 6 warnings**, all FIXABLE (format, `organizeImports`, `useConst`, `noUnusedImports`, one `useBiomeIgnoreFolder` on `biome.json:5`). CI runs `biome ci .` (non-fixing) → **the `lint-typecheck` job would fail on the current tree.** |
| 2 — Semantic Analysis | **Gap** | dependency-cruiser 16.10 (cannot run on host); no SonarQube/CodeQL | Boundary rules verified manually (see Architecture). No semantic-analysis engine wired beyond depcruise; acceptable for project size but state the gap. |
| 3 — AI-Assisted Review | **Pass (manual)** | This review | Code is intent-aligned; cross-file seams respected; no risky patterns found in changed surfaces. |

**Toolchain wiring (CI `.github/workflows/ci.yml`):** Strong. Four gated jobs — `lint-typecheck` (biome ci + `pnpm -r typecheck`), `test` (coverage + freshness + bundle-budget), `dep-check` (depcruise), `security-audit` (pnpm audit, advisory on PR / blocking on main), then `build-image` on main only. `tsconfig.base.json` is strict (`strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`, `noFallthroughCasesInSwitch`). This is a mature gate configuration; the only weakness is the current red state and the depcruise job's real-world executability (see below).

**Finding QR-001 (Major) — CI lint gate currently red; biome.json edited post-build without re-formatting the tree.**
- **File / evidence:** `biome check .` → `Found 11 errors. Found 6 warnings.` Representative errors: `apps/backend/tests/integration/ledger.test.ts:4:8 lint/correctness/noUnusedImports`; `apps/backend/tests/unit/throttle.test.ts:6:5 lint/style/useConst` (×3); `biome.json:5:88 lint/suspicious/useBiomeIgnoreFolder`; formatter diffs in `.dependency-cruiser.cjs`, `apps/frontend/src/routes/Reception.tsx:149`, `biome.json:5`, and several test/config files.
- **Standard violated:** Universal Quality Gate (formatter+linter pass with zero violations); CI step `pnpm biome ci .` (`ci.yml:30`) is non-fixing and fails on any violation.
- **Impact:** The next push/PR to `main` fails the `lint-typecheck` job, blocking the entire downstream pipeline (`test`, `dep-check`, `security-audit`, `build-image` all `needs:` it). The `useBiomeIgnoreFolder` error on `biome.json:5` also means the `!**/dist` / `!**/migrations/**` ignore globs are written in a form Biome flags — `biome check .` still descended into `apps/frontend/dist` (154 files checked), so the ignore is not fully effective.
- **Fix:** Run `pnpm biome check --write .` (auto-fixes all 11+6), then rewrite the `files.includes` ignores using the folder-ignore syntax Biome expects (`!**/dist/**` etc.) so `dist/` is genuinely excluded. Re-run `biome ci .` to confirm green.

---

## Architecture Alignment

- **Drift Score: Low (7.5/10)** — boundaries and dependency direction are respected; the one deduction is an enforcement rule aimed at dead code (QR-002).
- **ADR Compliance:** Compliant on all load-bearing ADRs verified (ADR-001 layering, ADR-006 Bambu ACL, ADR-009 single ledger write path). No ADR contradictions found.

**Verified seams (manual import-graph analysis, since depcruise cannot run):**

| dependency-cruiser rule | Verdict | Evidence |
|---|---|---|
| `no-bambu-outside-integration` (ADR-006) | **HOLDS** | Every `bambu/` import originates inside `integration/`: `integration/normalizer.ts`, `integration/ports.ts`, `integration/linking/service.ts:16-19`. Zero imports of `integration/bambu/**` from outside `integration/`. `normalizer.ts` produces only internal types via tolerant Zod `safeParse` and never throws past the adapter (NFR-MA-03 honored). |
| `no-fastify-outside-http-and-routers` | **HOLDS** | All 11 `fastify` imports are in `app.ts`, `http/*`, or `*router.ts` (identity/inventory/jobs/procurement/integration routers). No domain service imports Fastify. |
| `only-ledger-uses-ledger-repository` (ADR-009) | **HOLDS vacuously — see QR-002** | Nothing imports `LedgerRepository`; the rule guards a file no one uses. The *actual* invariant (only `inventory/ledger` writes `spool_ledger_entry` + mutates `remaining_net_weight_g`) holds by convention: only `ledger-write.ts:79,102-103` writes those; `jobs/job/service.ts` only *reads* `spoolLedgerEntry` (select at :160-164); `spool/service.ts:99` and `ams-mapping/service.ts:218` update `spool` but only status/metadata fields, never `remainingNetWeightG`. |
| `no-circular` | **HOLDS** | No circular chains observed; `container.ts` is a clean composition root wiring all modules with a single `Db`+`EventBus`. |

**DI container (`container.ts`):** Clean composition root — the only file that knows all modules. Constructor-injection throughout; `LedgerWriter` is injected into `SpoolService`, `ReceptionService`, and `JobService` so every deduction source funnels through the one writer (ADR-009 §5 satisfied). One observation, not a finding: the inline alert-evaluator subscription (`container.ts:84-104`) couples the composition root to inventory-alert business logic and drives the N+1 in QR-004 (see Efficiency).

**Finding QR-002 (Major) — Architecture-enforcement rule guards dead code; the ledger single-writer invariant is enforced only by convention.**
- **File:** `.dependency-cruiser.cjs:24-31` (`only-ledger-uses-ledger-repository`, targets `^src/inventory/ledger/repository\.ts$`) and `apps/backend/src/inventory/ledger/repository.ts` (entire file).
- **Code:** rule `to: { path: '^src/inventory/ledger/repository\\.ts$' }`; but `grep LedgerRepository apps/backend/src` returns only its own definition (`repository.ts:9`) — **zero importers**, and no test constructs it (tests use raw `db.insert`).
- **Standard violated:** ADR-009 (single ledger write path must be *enforced*, per NFR-MA-02); references/standards-enforcement.md §Dead code.
- **Impact:** (a) `LedgerRepository` (41 LOC, with `insert`/`isReversed`) is dead code — it can write `spool_ledger_entry` and is not covered by any test, yet the guard rule protects *it* rather than the table. (b) The real single-writer path is `LedgerWriter`, which writes `spoolLedgerEntry` **directly** (`ledger-write.ts:79`), not through the repository — so the depcruise rule does not actually constrain the code that matters. If a future module imported `spoolLedgerEntry` from `db/schema/inventory.ts` and inserted rows, the current rule would NOT catch it. The invariant holds today only because developers followed convention.
- **Fix:** Either (a) delete `repository.ts` and re-point the rule to forbid importing the `spool_ledger_entry` table symbol (`db/schema/inventory.ts`) from anywhere outside `src/inventory/ledger/`; or (b) refactor `LedgerWriter` to write *through* `LedgerRepository.insert()` so the existing rule becomes meaningful. Option (a) enforces the true ADR-009 invariant.

**Finding QR-003 (Major) — dependency-cruiser cannot execute on the runtime host; the architecture gate is unverifiable locally.**
- **File:** `ci.yml:50-63` (`dep-check` job) + `.dependency-cruiser.cjs`.
- **Evidence:** dependency-cruiser 16.10.0 crashes on an `R_OK` import under Node 24 (host); it cannot be run to confirm the four rules. CI pins Node 22 (`ci.yml:27`), where it is expected to run, but this could not be validated in this environment.
- **Standard violated:** Layer-2 semantic analysis must be executable to be a gate (references/standards-enforcement.md §Layer 1/2).
- **Impact:** The sole automated enforcer of the ADR-006/ADR-009 seams is a tool that no developer on a Node 24 machine can run locally, and which was not executed in this review. Boundary regressions would only surface in CI (Node 22), increasing feedback latency and the chance of local drift. Combined with QR-002, one of the four rules is also aimed at dead code even when the tool does run.
- **Fix:** Bump/replace dependency-cruiser to a Node-24-compatible release (or pin the depcruise job's Node to 22 explicitly and document the local-run limitation in README), and validate the rules run green before relying on them.

---

## Stack-Lock Adherence

Compared `package.json` versions against `stack-lock-registry.md`, `deliverable_backend-stack-lock.md`, and `deliverable_frontend-stack-lock.md`.

**Backend / shared — full compliance.** Fastify 5.8.5 (locked 5.x), better-sqlite3 11.10.0 (11.x), drizzle-orm 0.45.2, mqtt 5.13.1 (5.x), argon2 0.44.0, pino 10.3.1, zod 4.0.5 (4.x, same version FE↔BE↔shared ✓), typescript 5.9.2 (5.x), Node ≥22, pnpm 11.20.0, biome 2.2.0 (2.x). Documented deviations Dev-1/2/3 (SQLite over Postgres, no OTel, session-cookie auth) all match their ADRs. No undocumented backend deviations.

**Frontend — TanStack stack matches (react-router 1.132.41, react-query 5.90.2, react-table 8.21.3, react-form 1.19.3, react-virtual 3.13.12), React 19.1.1, Tailwind 4.1.13, zustand 5.0.8, zod 4.0.5. TanStack Start correctly absent (Router-only SPA, per FSL deviation). Two deviations below.**

| # | Package | Locked (stack-lock) | Shipped | Documented? | Severity |
|---|---------|---------------------|---------|-------------|----------|
| SL-D1 | **Vite** | **8.x (Rolldown)** — FSL §1, ADR-014 (registry SL-012 says only "Vite", unversioned) | **6.4.3** (`apps/frontend/package.json:46`) | **No** (in-code comment `vite.config.ts:8-9` notes it; not in an ADR/deviation log). Admiral tracking for Handoff 3. | Major |
| SL-D2 | **React Compiler** | **Enabled** — FSL locks "React 19.x (React Compiler enabled)" | **NOT enabled** | **No** | Major |

**Finding QR-004a (Major) — Vite stack-lock deviation (6.4.3 vs locked 8.x).**
- **File:** `apps/frontend/package.json:46` (`"vite": "6.4.3"`); comment at `vite.config.ts:8-9`.
- **Standard violated:** frontend stack-lock §1 / ADR-014 (Vite 8.x Rolldown).
- **Impact:** Vite 8/Rolldown is not stably installable (Rolldown pre-GA), so the deviation is defensible, but it is undocumented in the ADR/deviation ledger — traceability gap only. No functional impact; build output is equivalent static `dist/`. Must appear in quality findings (Admiral tracking for Handoff 3).
- **Fix:** Add a deviation entry (or amend ADR-014) recording "Vite 6.4.3 substituted; Vite 8/Rolldown deferred until GA-stable" with the trigger to revisit.

**Finding QR-004b (Major) — React Compiler not enabled despite frontend stack-lock.**
- **File:** `apps/frontend/vite.config.ts:11` — `react()` is configured with no `babel-plugin-react-compiler`; grep for `react-compiler|reactCompiler|babel-plugin-react-compiler` across `apps/frontend` returns **no matches**; the plugin is not in `devDependencies`.
- **Standard violated:** frontend stack-lock §1 ("React 19.x (React Compiler enabled)").
- **Impact:** The auto-memoization the design relied on is absent, so the manual `useMemo`/`useCallback` usage (18 occurrences across 9 files) is now load-bearing rather than a redundant optimization, and any component *without* manual memoization gets no compiler-provided memo. This is a silent, undocumented divergence from the locked performance model — the more consequential of the two frontend deviations because it changes runtime behavior, not just build tooling.
- **Fix:** Either enable React Compiler (add `babel-plugin-react-compiler` to the `react()` babel plugins and pin it) to honor the lock, or document a deviation explaining why it was dropped and confirm the manual memoization is sufficient.

---

## Efficiency Findings

**Finding QR-005 (Major) — N+1 (and N+M+K) query patterns in `InventoryReadService`, amplified by an event-bus hook on every stock mutation.**
- **File:** `apps/backend/src/inventory/alerts/service.ts` — `summary()` (16-19), `stockRow()` (27-42), `alerts()` (106-130), `onOrder()` (69-104); triggered from `container.ts:86-90`.
- **Code:** `summary()` → `products.map((p) => this.stockRow(p))`, and each `stockRow` runs a per-product `spool` query (`:28`) **and** a per-product `vendor` query (`:38-42`) → **2N queries** for N products. `alerts()` loops products (`:109`), runs a spool query per product (`:111`), and for each low-stock product calls `onOrder()` which queries **all** open POs (`:70-74`), then a `purchaseOrderLine` query **per PO** (`:78-82`), then a `goodsReceiptLine` query **per line** (`:85-89`) — nested N×POs×lines fan-out. better-sqlite3 is **synchronous**, so every one of these blocks the event loop.
- **Standard violated:** references/metrics-and-debt.md §Database Query Optimization (N+1); efficiency §Unnecessary Computation.
- **Impact:** `container.ts:84-104` invokes `inventoryRead.alerts()` on **every** `SpoolsReceivedIntoStock` and `FilamentConsumptionRecorded` event. So each filament-consumption event (i.e., each telemetry-driven deduction) synchronously runs the full products×spools×POs×lines×receipts scan on the main thread. On a small home-lab dataset this is negligible, but it scales quadratically with catalog+PO size and sits directly on the hot write path — the exact pattern the reference flags as "clearly suboptimal." `onOrder()` also re-queries all open POs once per low-stock product instead of once per pass.
- **Fix:** (1) Replace per-product `vendor` lookups with a single `vendor` fetch keyed into a Map; (2) replace per-product `spool` loops with one `spool` query grouped by `productId`; (3) hoist the open-PO / line / receipt queries out of the per-product loop into three bulk queries joined in memory; (4) debounce or scope the `container.ts` alert re-eval to the affected `productId` rather than recomputing all alerts on every stock event.

**Frontend efficiency:** No issues found. `DataTable.tsx` uses TanStack virtualization with stable `getRowId` keys and `overscan`; api/hooks layer uses react-query with correct `staleTime` and targeted `invalidateQueries`. No sync-in-loop or obvious re-render hazards (subject to QR-004b — memoization is now manual-only).

---

## Technical Debt Summary

| Metric | Value | Rating |
|--------|-------|--------|
| Cyclomatic complexity (max) | Not tooled; manual max in `ledger-write.ts` `correctConsumption` and `alerts.onOrder` ~10-12 | OK (≤15) |
| Code duplication | Not tooled (no jscpd/SonarQube). Manual: per-product stock aggregation logic duplicated between `summary/stockRow` and `alerts` (`service.ts:28-36` vs `111-113`) | Warning (localized) |
| Test coverage (critical paths) | Coverage gated in CI (`ci.yml:46`, threshold 80% per `vitest.config`) but not measured here; `LedgerRepository` (dead) is uncovered | Gap / Warning |
| TODO/FIXME/HACK density | **0** genuine markers in `src` (grep hits were UI `placeholder` attrs + test `vi.stubGlobal` — false positives) | OK — build's "no stubs / CLEAN" claim **verified** |
| Dead code | `LedgerRepository` (41 LOC, unused — QR-002) | Warning |

Semantic/quantitative metrics requiring SonarQube, jscpd, or a coverage run are reported as **gaps** rather than estimated, per evidence standards.

---

## Prioritized Recommendations

1. **Un-red the CI lint gate (QR-001):** `biome check --write .` then fix the `biome.json` ignore-folder syntax so `dist/` is actually excluded. Without this the whole pipeline is blocked on next push. *(Major, fast fix.)*
2. **Make the ledger seam actually enforced (QR-002):** delete or wire-in `LedgerRepository`, and re-point the depcruise rule to forbid the `spool_ledger_entry` table import outside `inventory/ledger/`. Restores real ADR-009 enforcement. *(Major.)*
3. **Fix the inventory N+1 on the hot path (QR-005):** bulk-load vendors/spools/POs and scope the `container.ts` alert re-eval to affected products. *(Major, correctness-adjacent under load.)*
4. **Document / resolve the two frontend stack-lock deviations (QR-004a Vite 6.4.3, QR-004b React Compiler off):** add deviation entries; enable React Compiler or record why it was dropped. *(Major, traceability + runtime model.)*
5. **Make the architecture gate runnable (QR-003):** upgrade dependency-cruiser to a Node-24-compatible version (or pin+document Node 22 for local runs) and verify all four rules pass. *(Major, tooling.)*

---
## Pipeline Summary (Machine-Readable)

phase_id: 3
skill: quality-review
status: COMPLETE
risk_assessment: Medium
quality_verdict: Conditional
drift_score: Low
finding_count:
  critical: 0
  major: 6
  minor: 0
key_concerns:
  - "QR-001: CI biome ci gate currently red (11 err/6 warn) — blocks whole pipeline; biome.json edited post-build, dist/ ignore ineffective"
  - "QR-002: only-ledger-uses-ledger-repository rule guards unused dead LedgerRepository; ADR-009 single-writer enforced only by convention"
  - "QR-004a/b: undocumented frontend stack-lock deviations — Vite 6.4.3 vs locked 8.x, and React Compiler not enabled despite lock"
cross_references:
  - "apps/backend/src/inventory/alerts/service.ts:69-104 (N+1, cross-ref efficiency/perf)"
  - "apps/backend/src/container.ts:84-104 (alert re-eval on hot write path)"
  - ".dependency-cruiser.cjs:24-31 (rule targets dead file)"
  - "apps/backend/src/inventory/ledger/repository.ts (dead code, uncovered writer of spool_ledger_entry)"
  - "apps/frontend/package.json:46 (Vite 6.4.3); apps/frontend/vite.config.ts:11 (React Compiler absent)"
  - "biome.json:5 (useBiomeIgnoreFolder; dist not excluded)"
---
