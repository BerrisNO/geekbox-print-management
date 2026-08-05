---
type: design-package
version: 1.0.0
run_id: run-001_2026-08-04_3d-print-erp
owner: commander
pipeline: design
project_name: GeekBOX Print Management
created_at: 2026-08-05T03:15:00Z
context_tier: 3
artifact_mode: reference
design_state: DELIVERED
---

# DESIGN SPECIFICATION PACKAGE: GeekBOX Print Management

**Mode**: Tier-3 reference — full artifacts are on disk under this run's `design/` tree; this package summarizes and references them by path. Inline summaries are non-authoritative; open the referenced artifact for field-level detail.

## Executive Summary
GeekBOX Print Management is a self-hosted, single-user web ERP scoped to 3D printing, covering four V1 modules: (1) filament inventory with an immutable per-spool weight ledger, (2) inbound logistics + goods reception, (3) a live Bambu Lab printer dashboard, and (4) print jobs + cost-per-print. The architecture is a **modular monolith with selective hexagonal boundaries** (ADR-001): one Node.js 22 / Fastify 5 container serving a React SPA's static assets plus the REST API, SSE stream, in-process MQTT listener, task-sync scheduler, and alert evaluator, backed by embedded SQLite (WAL) — deployed as a single Docker Compose service with a named volume, under a 1 GB RAM budget. Every Bambu Lab cloud fact is unofficial/community-documented, so all Bambu access is isolated behind a CI-enforced **anti-corruption layer** (ADR-006): ports (`BambuCloudGateway`/`TelemetrySource`/`TokenVault`), primary REST+MQTT adapters, and pre-designed fallback adapters, with zero Bambu imports permitted outside `integration/`. The design was validated across five gatekeeper-design-gated phases; all are APPROVED. The book of record — the spool ledger — anchors exactly-once consumption at the DB level (ADR-009) while supporting reverse-and-repost corrections. The build proceeds in six dependency-ordered slices (D1–D6), each independently shippable, front-loading the single biggest risk (the unverified Bambu API) into a verification spike (MS-1) as the first build activity.

## Package Contents (by path — all under `skillset-saves/runs/run-001_2026-08-04_3d-print-erp/design/`)
| # | Deliverable | Path | Version | Gate |
|---|-------------|------|---------|------|
| 1 | Software Requirements Specification (SRS) | phase-1_researcher/deliverable_srs.md | 1 | APPROVED a1 |
| 2 | Domain Analysis | phase-1_researcher/deliverable_domain-analysis.md | 1 | APPROVED a1 |
| 3 | Project Plan | phase-2_planner/deliverable_project-plan.md | 2 | APPROVED a2 |
| 4 | Architecture Document (Arc42 + C4) | phase-3_architect/deliverable_architecture.md | 1 | APPROVED a2 |
| 5 | ADRs (ADR-001…013) | phase-3_architect/deliverable_adrs.md | 2 | APPROVED a2 |
| 6 | API Contracts (OpenAPI 3.1 + events + SSE) | phase-3_architect/deliverable_api-contracts.md | 2 | APPROVED a2 |
| 7 | Data Model | phase-3_architect/deliverable_data-model.md | 2 | APPROVED a2 |
| 8 | Backend Stack Lock | phase-3_architect/deliverable_backend-stack-lock.md | 1 | APPROVED a2 |
| 9 | Frontend Design Specification | phase-4_designer/deliverable_frontend-spec.md | 2 | APPROVED a2 |
| 10 | Frontend Stack Lock (+ ADR-014) | phase-4_designer/deliverable_frontend-stack-lock.md | 2 | APPROVED a2 |
| 11 | Implementation Specification | phase-5_engineer/deliverable_implementation-spec.md | 2 | APPROVED a2 |
| — | Stack-Lock Registry | commander/stack-lock-registry.md | 1 | — |
| — | Delegation Log | commander/delegation-log.md | 1 | — |
| — | Gatekeeper verdicts (per phase) | phase-{1..5}_*/gatekeeper-verdict.md | — | all APPROVED |

## Gatekeeper-Design Outcomes
| Phase | Skill | Final verdict | Attempts | Notes |
|-------|-------|---------------|----------|-------|
| 1 | researcher | APPROVED | 1 | 84/100; GK-M1 (external-spool FR gap) carried forward |
| 2 | planner | APPROVED | 2 | a1 REVISE (MUST/SHOULD count, MS-0 timing) → a2 fixed |
| 3 | architect | APPROVED | 2 | a1 REVISE (M1 ledger index contradiction, M2 no response schemas) → a2 fixed; 1 non-blocking nit |
| 4 | designer | APPROVED | 2 | a1 REVISE (M1 no logout UI, M2 no FR-302 UI, M3 ambiguous freshness contract) → a2 fixed; 1 nit |
| 5 | engineer | APPROVED | 2 | a1 REVISE (M1 downloadBackup dropped + false 62-ops claim + unbacked backup page) → a2 fixed |

## Stack Locks (see commander/stack-lock-registry.md for the full table SL-001…SL-012)
- **User constraints**: Bambu Cloud REST + MQTT (unofficial → mandatory ACL); self-hosted Docker Compose (NOT serverless/Vercel/Azure); single user, hashed-password + session cookie, no RBAC; solo dev; zero cloud spend; greenfield.
- **Backend overlay**: `tech-stacks/node-typescript.md`. Version tuple: Node.js 22 LTS · TypeScript 5.x strict ESM (NodeNext) · Fastify 5.x · Zod v4 (HTTP + ACL boundary) · better-sqlite3 11.x + Drizzle ORM/drizzle-kit (SQLite WAL, foreign_keys=ON) · MQTT.js 5.x · node-argon2 (argon2id) · node:crypto AES-256-GCM · Pino · Vitest · Biome 2.x · pnpm · node:22-alpine. Live-update transport: **SSE**.
- **Frontend overlay**: `tech-stacks/react-tanstack.md`, **pure SPA** (no TanStack Start/SSR). Version tuple: React 19 (Compiler) · Vite 8 (Rolldown) · TanStack Router/Query/Table v8/Form v1/virtual v3 · Zod 4 · Tailwind CSS v4 + shadcn/ui (Radix) · CVA + tailwind-merge · lucide-react · zustand 5 · Biome 2 · pnpm. Built to static `dist/` served by the Fastify `app` container (no second service).
- **Deviations (all ADR-backed, carried through to engineer verbatim)**: Dev-1 SQLite instead of overlay Postgres (ADR-003); Dev-2 no OpenTelemetry/Prometheus/Tempo — Pino + /api/health + FR-306 panel (ADR-013); Dev-3 session-cookie auth instead of overlay passkeys/JWT (ADR-007); FE-1 react-tanstack ecosystem without TanStack Start (client SPA on Vite, ADR-014).
- **Exceptions**: none beyond the above ADR-justified deviations. No downstream lock override.

## Architecture Style & Key Decisions
- **Style**: Modular monolith, selective hexagonal seams where they pay (Bambu ACL, persistence repositories, SSE broadcaster). Domain modules = bounded contexts: `identity/`, `inventory/`, `procurement/`, `jobs/`, `integration/` (ACL); typed in-process event bus (post-commit); direct same-transaction calls for transactional flows (reception→stock, consumption→ledger). Dependency rule CI-enforced (only `inventory/ledger` writes `spool_ledger_entry`; `integration/bambu/**` importable only within `integration/`).
- **Key ADRs**: ADR-001 modular monolith · ADR-003 SQLite+Drizzle (single-writer serialization implements ES-206.1) · ADR-004 in-process supervised MQTT listener (DG-4; extraction seam documented) · ADR-005 SSE + 10s-poll fallback (DG-3) · ADR-006 Bambu ACL with fallback adapters (C-07/NFR-MA-02/03) · ADR-007 argon2id + session cookie · ADR-008 latest-snapshot telemetry + additive history fallback (DG-6/Q-04) · ADR-009 ledger & idempotency (append-only, reverse-and-repost, exactly-once via three DB constraints) · ADR-010 AES-256-GCM token vault (NFR-SE-02) · ADR-011 external-spool virtual slot 254:0 (GK-M1) + ES-107.1 resolution · ADR-012 pending-question fallback provisions (DG-1 P7) · ADR-013 right-sized observability · ADR-014 frontend react-tanstack pure-SPA lock.
- **Bambu ACL approach**: Ports `BambuCloudGateway`/`TelemetrySource`/`TokenVault`; primary `BambuRestAdapter` (api.bambulab.com) + `BambuMqttAdapter` (mqtts:8883, `device/{serial}/report`); pre-designed fallback adapters `ManualTokenAdapter` (A-01 fail), manual printer registration (A-02), `RestPollTelemetryAdapter` (A-03), manual/MQTT-only usage capture (A-04); Zod-tolerant boundary parsing (unknown ignored, missing→"unknown", drift counter); MS-1 recorded fixtures = permanent contract-test corpus; CI static dependency check enforces zero Bambu imports outside the adapter.

## API Surface Summary (see phase-3_architect/deliverable_api-contracts.md)
- **62 REST operations** (OpenAPI 3.1), session-cookie authenticated, RFC 7807 errors: auth 5, vendors 5, products 5, spools 7, inventory 2, purchase-orders 6 (incl. inbound), receptions 3, integration 7, printers 9, jobs 8, settings 2, system 3 (backup, events/SSE, health).
- **48 component schemas** (11 shared/input + 37 field-level response/view), all 200/201 bodies $ref a named schema; view aggregates fully specified: SlotView, IntegrationStatus, InboundRow, ProductStockRow, LowStockAlert, TelemetrySnapshot, JobsSummary/JobListResponse, CostBreakdown/PrintJobDetail, plus core entities.
- **12 internal domain events** (in-process typed bus) + **5 SSE message types** (telemetry, integrationStatus, lowStock, mappingVerify, jobUpdate) driving the live dashboard, with a 10s-poll degraded fallback on identical payloads.
- **18–20 data-model tables** (SQLite): identity (2), inventory (5 incl. spool_ledger_entry, ams_slot_mapping), procurement (5), integration (3), jobs/costing (5 incl. filament_usage, cost_calculation, printer_power_draw).

## Module Build Order (D1–D6 — see phase-5_engineer/deliverable_implementation-spec.md §10; and plan §3)
1. **D1 Foundation** — Bambu API verification spike (MS-1) + fixtures; repo scaffold; CI; Docker Compose skeleton; DB migration baseline; **identity/auth** (FR-001–003), HTTP edge (routers+Zod, session gate, SSE broadcaster shell), typed event bus, frontend app shell. Modules: identity, http-edge, event-bus, config/db.
2. **D2 Inventory Core** — vendors + product catalog (FR-201, FR-101), spool + lifecycle (FR-102/107), **ledger single-writer** (FR-103/104), stock views + valuation (FR-105/108), low-stock alerts (FR-106 except AC-106.3), **backup endpoint** (downloadBackup, GET /api/backup — placed here per rollout prereq). Modules: inventory/{catalog,spool,ledger,alerts}, system/backup.
3. **D3 Printer Integration & Dashboard** — account linking + encrypted tokens (FR-301), discovery/tracking/manual registration (FR-302), MQTT listener supervisor + normalizer (FR-303), live dashboard + staleness (FR-304), AMS + external-spool 254:0 mapping (FR-305 amended, GK-M1 closed), reconnect/health (FR-306), reauth flow (FR-307). Modules: integration/{supervisor,bambu adapters+fallbacks,normalizer,TokenVault,task-sync}, inventory/mapping, dashboard UI.
4. **D4 Procurement, Inbound & Reception** — PO creation (FR-202), status lifecycle (FR-203), inbound overview (FR-204), atomic goods reception (FR-205/206), discrepancy/damaged handling (FR-207), on-order alert annotation (FR-106 AC-106.3), reception-sourced spool path (FR-102 remainder). Off critical path — schedule shock-absorber. Modules: procurement/{po,reception,inbound}.
5. **D5 Jobs & Costing** — task-sync (FR-308), job merger (FR-401), consumption attribution behind `consumption.autopost` preview flag (FR-402), cost rates (FR-403), cost snapshots (FR-404), manual entry + reverse-and-repost corrections (FR-405), history + summaries + CSV export (FR-406). Modules: jobs/{merger,consumption,costing}.
6. **D6 Hardening & v1.0** — perf/soak (NFR-PE), security pass (NFR-SE), backup→restore drill (NFR-RE-04), a11y + responsive + cross-browser (NFR-US/CO), README (NFR-MA-04), v1.0 tag. No new FRs.

Critical path: MS-0 → MS-1 → D1 → D2 → D3 → D5 → D6 (D4 off-path). Two feature flags only: `consumption.autopost` (temporary, D5) and `integration.enabled` (permanent kill switch).

## Cross-Deliverable Consistency Check (commander)
- Requirements → Architecture: all 32 FRs traced to operations/flows (api-contracts Part A + arch §10); GK-M1 external-spool gap closed (ADR-011/FR-305 amendment).
- Backend Stack Lock → ADRs/API/deployment: consistent (SSE per ADR-005, SQLite per ADR-003, session cookie per ADR-007); deviations ADR-linked.
- Frontend Stack Lock → frontend spec/API consumption: react-tanstack pure SPA consumes the 62-op REST API + 5 SSE types; served as static dist by the app container (reconciled with arch §5.1).
- Inherited Stack Locks → engineer plan: recorded verbatim, zero substitution; right-sizing (no OTel/no staging) correctly ADR-013/§7.2-attributed; module build plan maps every FR→operationId→table→files with all 62 operations placed.
- Security (NFR-SE) → controls: argon2id, AES-256-GCM vault, TLS cert verify, session-cookie flags, Pino redaction, deny-by-default gate, login throttle, Zod boundaries, zero-Bambu-imports CI rule — all present.
- NFRs → verification: architecture §10 quality tree maps all 28 NFRs to tactics + plan D6 gates.

## PENDING-USER Items (escalated to admiral; design provides valid pre-approved fallbacks for ALL — see ADR-012)
| Q | Question | Owner | Pre-approved fallback (design remains valid) |
|---|----------|-------|----------------------------------------------|
| Q-01 | MQTT regional broker (us/eu/cn/custom) | User, at first link | Region is **config not code** (`cloud_link.mqtt_region`, UI + env override, default `us`); FR-303 mandates configurability regardless. |
| Q-02 | Printer count/models (X1/P1/A1, AMS count) | User (design ph4) | Discovery + **permanent manual serial registration** (POST /printers); model-specific fields nullable; dashboard renders N printers from data. |
| Q-03 | Preferred currency + energy price defaults | User (design ph4) | `currency_code` display-only, editable, default **NOK** disclosed as assumption; affects no calculation. Energy/machine rates optional (costing works on filament alone). |
| Q-05 | Are printers in Bambu **cloud mode** (prerequisite for C-01)? | User, before spike | `integration.enabled` permanent kill switch + full module isolation (NFR-RE-05 tested); if LAN-only, D3 descopes, manual jobs (FR-405) carry consumption — core app unaffected. |
| Q-06 | MFA/verification-code vs password login | User, at first link | Link flow is a two-step state machine (/link → /link/verify) **plus** `ManualTokenAdapter` escape hatch (/link/manual-token). Both paths designed. |

Q-04 (telemetry history for charts) was DECIDED at design time (ADR-008): latest-snapshot default with a pre-designed additive `telemetry_history` fallback if the user later opts into charts. Not pending.

**None of the pending answers can invalidate the architecture, the stack locks, or the module build plan** — each selects among already-built provisions (ADR-012, verified per fallback).

## Next Actions (when implementation begins)
1. Obtain Q-05 (cloud-mode) + Q-01/Q-02/Q-06/Q-03 answers from the user (MS-0 design-time gate; recorded as DG-1 input P7). None block the design; all block only their specific fallback selection.
2. Run the MS-1 Bambu API verification spike (D1) — first build activity; record per-assumption verdicts + redacted fixtures (the ACL contract-test corpus).
3. Begin D1 foundation build per the implementation spec module build plan.
