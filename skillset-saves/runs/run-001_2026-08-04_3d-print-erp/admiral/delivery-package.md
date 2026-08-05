---
type: delivery-package
run_id: run-001_2026-08-04_3d-print-erp
project_name: GeekBOX Print Management — 3D-Printing ERP
pipeline_mode: full (design → build → review); Azure NOT_APPLICABLE
created: 2026-08-05T19:55:56Z
admiral_state: DELIVERED
---

# UNIFIED DELIVERY PACKAGE: GeekBOX Print Management

## Executive Summary
GeekBOX Print Management is a self-hosted, single-user web ERP purpose-built for a 3D-printing operation. It was designed, built, and reviewed end-to-end through the full Supreme Team pipeline. It delivers four modules — filament inventory, inbound logistics + goods reception, a live Bambu Lab printer dashboard, and print jobs + costing — as a modular-monolith Node.js/Fastify backend with embedded SQLite (WAL) and a React SPA, packaged as a single Docker Compose service. All Bambu Lab cloud access (unofficial API + MQTT telemetry) is isolated behind a CI-enforced anti-corruption layer with pre-designed fallback adapters and a kill switch, so the app runs fully with or without a printer connected. The append-only spool weight ledger is the book of record, with exactly-once consumption enforced at the database level. All three cross-pipeline gates passed; a CRITICAL ledger defect found by review was fixed and proven with a regression test executed on a provisioned Node 22 runtime.

## Context Status
- **Degradation tier**: Tier 3 (Context-Pressured) — by design; all artifacts persisted to disk and passed by reference between stages.
- **Artifact mode**: All referenced (reference mode).
- **Save status**: Active — full run persisted under `skillset-saves/runs/run-001_2026-08-04_3d-print-erp/`.
- **Skipped or external upstream stages**: None. Azure stage NOT_APPLICABLE (user chose self-hosted Docker).
- **Traceability status**: Verified (gatekeeper-admiral confirmed SRS↔architecture↔API↔data-model↔code at all three handoffs).
- **Reference-Mode Notice**: Inline summaries in this package are navigational; the authoritative artifacts are the on-disk files cited below.

## Package Contents & Locations
All paths relative to `skillset-saves/runs/run-001_2026-08-04_3d-print-erp/`.

1. **Design Package** — `design/commander/design-package.md`
   - SRS (32 FR / 28 NFR): `design/phase-1_researcher/deliverable_srs.md`; Domain analysis: `.../deliverable_domain-analysis.md`
   - Project plan (D1–D6, MS-0–7, risk register): `design/phase-2_planner/deliverable_project-plan.md`
   - Architecture (Arc42 + C4): `design/phase-3_architect/deliverable_architecture.md`; ADRs 001–014: `.../deliverable_adrs.md`
   - API contracts (OpenAPI 3.1, 62 ops / 48 schemas, AsyncAPI SSE): `.../deliverable_api-contracts.md`; Data model (20 tables): `.../deliverable_data-model.md`
   - Backend stack lock: `.../deliverable_backend-stack-lock.md`; Frontend spec + stack lock: `design/phase-4_designer/deliverable_frontend-spec.md`, `.../deliverable_frontend-stack-lock.md`
   - Implementation spec: `design/phase-5_engineer/deliverable_implementation-spec.md`; Stack-lock registry: `design/commander/stack-lock-registry.md`
2. **Build Package** — `build/build-management/build-package.md` (v2 with remediation section)
   - Production code (the actual application, in the WORKSPACE ROOT — see below), test suite, security audit (`build/phase-3_security-builder/`), completeness cert (`build/phase-4_cross-check/`), stack-lock exceptions (`build/build-management/stack-lock-exceptions.md`)
3. **Review Package** — `review/code-chief/review-package.md`
   - 8 specialist reports (bug, code, quality, security, adversarial/mr-robot, frontend/frontier, design-qa, devex): `review/phase-1..8_*/deliverable_*.md`; gatekeeper-code verdict: `review/gatekeeper-code_verdict.md`
4. **Gatekeeper-Admiral Validation Records**
   - Handoff 1 (Design→Build) APPROVED: `design/gatekeeper-admiral_handoff-1.md`
   - Handoff 2 (Build→Review) APPROVED: `build/gatekeeper-admiral_handoff-2.md`
   - Handoff 3 (Review→Delivery) APPROVED: `review/gatekeeper-admiral_handoff-3.md`
5. **Admiral run records**: `admiral/intake.md`, `_run-manifest.md`, `_state.md`, `_audit-trail.md`

### The Application (workspace root — this is the runnable product)
```
apps/backend      Fastify 5 API + SSE + MQTT listener + auth + Bambu ACL (56 src files)
apps/frontend     React 19 SPA (Vite, TanStack, Tailwind + shadcn) (65 src files)
packages/shared   Zod schemas shared across boundaries (22 files)
migrations/        SQLite schema (20 tables), incl. applied_delta_g ledger column
fixtures/bambu     Realistic Bambu API/MQTT fixtures for contract tests
Dockerfile, docker-compose.yml   Single-service self-hosted deployment
.github/workflows/ci.yml         CI gates (lint, typecheck, test, dependency-cruiser)
.dependency-cruiser.cjs          Enforces: zero Bambu imports outside integration/; single ledger writer
biome.json, tsconfig.base.json, .env.example, README.md
```
Total: 161 application source files. `.env.example` keys: SESSION_SECRET, TOKEN_ENCRYPTION_KEY, NODE_ENV, PORT, DB_PATH, BACKUP_DIR, LOG_LEVEL.

## Cross-Pipeline Consistency Check
| From | To | Verification | Status |
|------|----|-------------|--------|
| SRS functional requirements | Architecture data model | Same entities/bounded contexts, no orphaned requirements | PASS |
| SRS API requirements | API contracts | Every required endpoint exists with complete schemas (M2 fix) | PASS |
| API contracts | Implemented route handlers | 62 operationIds ↔ 62 wired ops (173 route registrations) | PASS |
| Architecture ERD | DB models / Drizzle | 20 tables match; ledger + applied_delta_g present | PASS |
| Architecture ADRs | Stack locks | Consistent; deviations documented (SLE-1/2, backend Dev-1/2/3) | PASS |
| Stack locks | Dependency files | Match except Vite (documented exception SLE-1) | PASS |
| Frontend component specs | Implemented components | All four module UIs + auth/settings present | PASS |
| Implementation spec repo structure | Actual layout | pnpm workspace layout matches spec | PASS |
| Security requirements | Security controls | argon2id, AES-256-GCM vault, session cookie, throttle, CSP, Origin/CSRF | PASS |
| Security controls | Security review findings | mr-robot/security findings remediated (throttle, enumeration, SSRF, CSRF) | PASS |
| Review findings (critical/high) | Resolution status | CRITICAL ledger fixed & tested; majors fixed or documented fast-follow | PASS |
| Azure alignment checks | — | Azure stage not executed | N/A |
| Docker runtime boot | — | Not executed on pipeline host (no Docker); operator smoke step | UNVERIFIED (advisory) |

## Cross-Pipeline Traceability (sample high-priority traces)
- **FR-402 exactly-once consumption** → ADR-009 (append-only ledger, reverse-and-repost) → `apps/backend/src/inventory/ledger/ledger-write.ts` + migration 3 constraints [filament_usage UNIQUE(job_id,slot_ref); ledger_entry_id UNIQUE FK; UNIQUE(reverses_entry_id) WHERE NOT NULL] → BUG-001/MR-004 (CRITICAL, found by review) → FIXED (applied-delta reversal + conservation invariant + property test, verified on Node 22). Trace intact.
- **FR-305 external-spool AMS mapping** → ADR-011 (virtual slot 254:0) → `apps/backend/src/inventory/ams-mapping/service.ts` + DB CHECK → bug-review covered. PASS.
- **NFR-MA-02 Bambu isolation** → ADR-006 (anti-corruption layer) → `apps/backend/src/integration/bambu/*` + `.dependency-cruiser.cjs no-bambu-outside-integration` → security-review + code-review confirmed zero leaked imports. PASS.

## Stack Lock Summary
- **Backend**: `tech-stacks/node-typescript.md` — Node 22 LTS, TypeScript 5 (strict ESM), Fastify 5, Zod 4, better-sqlite3 11.x + Drizzle, MQTT.js 5, argon2id, AES-256-GCM, Pino, Vitest, Biome 2, pnpm.
- **Frontend**: `tech-stacks/react-tanstack.md` (pure SPA) — React 19, Vite 6 (see SLE-1), TanStack Router/Query/Table/Form, Tailwind v4 + shadcn/ui, Zod 4.
- **Exceptions (documented, approved)**: backend Dev-1 SQLite over Postgres (ADR-003), Dev-2 no OpenTelemetry (ADR-013), Dev-3 session-cookie auth (ADR-007); SLE-1 Vite 8→6 (Rolldown not stable-installable); SLE-2 React Compiler disabled (~18 manual memoizations load-bearing).

## Disputed Items
None outstanding. The one prior dispute (Vite deviation severity) was resolved: ratified as an accepted, documented Minor/traceability exception (SLE-1).

## Verification Results (executed on provisioned Node 22.23.2 during remediation)
- `biome ci .` → 0 errors / 0 warnings
- `tsc --noEmit` (shared, backend, frontend) → 0 / 0 / 0
- backend `vitest run` → **47/47 pass** (incl. new ledger conservation + property tests, reception crash-injection)
- frontend `vitest run` → **24/24 pass** (incl. m5 data-freshness gate, a11y tests)
- dependency-cruiser → **0 violations** (77 modules)
- builds (shared/backend/frontend) → pass; frontend bundle 139.6 KB gz (< 200 KB budget)
- `pnpm audit --audit-level=high` → pass (1 dev-only moderate, waived)
- NOT executed: `docker compose up --build` (no Docker on host) — operator smoke step.

## Recommended Next Actions
1. **First run (operator smoke test)**: from the workspace root, `docker compose up --build`, then open the app, complete the one-time account setup, and confirm the dashboard loads. This closes the one UNVERIFIED check (Docker runtime boot).
2. **Answer the deferred setup questions** (all have working fallbacks; answering just selects among them): MQTT region (Q-01, default `us`), your printer serial(s)/model(s) (Q-02, manual registration in Settings → Integration), currency + energy/machine rates (Q-03, default NOK), cloud vs LAN-only mode (Q-05, kill switch in Settings), and Bambu login/MFA flow (Q-06, two-step link or manual token).
3. **Verify the Bambu integration against your real account** (RISK-001): the cloud API is unofficial and was built to the documented community contract behind the ACL with a tolerant parser and fallbacks. Link your account in Settings → Integration; if a field name or the login flow differs, the fix swaps one adapter behind the unchanged port. Keep the kill switch handy.
4. **Fast-follow backlog (non-blocking, documented)**: QR-005 N+1 alert re-evaluation (perf), BUG-006 depleted-while-mapped stale AMS mapping, BUG-010 manualAdjust negative-net guard, and a full axe/color-contrast a11y audit before making a formal WCAG AA claim.
5. **Amend ADR-009 normative wording** (design-doc consistency nit) to say "reverse the applied delta" so the ADR text matches the corrected implementation.

## Pipeline Record
| Stage | Result | Gate |
|-------|--------|------|
| Design (commander, 5 phases) | All gatekeeper-design APPROVED | Handoff 1 APPROVED (0C/0M/2 advisory) |
| Build (build-management, 4 phases) | All gatekeeper-build APPROVED, cross-check CLEAN | Handoff 2 APPROVED (0C/1M carried→resolved/2m) |
| Review (code-chief, 8 specialists) | gatekeeper-code Ready-with-Disputes → remediated | Handoff 3 APPROVED (0C/0M, delivery-ready) |
| Remediation (build-management) | 6/6 mandatory fixes; CRITICAL ledger proven-fixed on Node 22 | folded into Handoff 3 |
| Azure | Not applicable (self-hosted Docker) | N/A |
