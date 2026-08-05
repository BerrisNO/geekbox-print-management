---
type: review-packet
version: 2
status: revised
pipeline: design
phase: 3
skill: architect
run_id: run-001_2026-08-04_3d-print-erp
created: 2026-08-04T03:45:00Z
revised: 2026-08-04T22:30:00Z
deliverable_count: 5
---

## Deliverable Summary

Phase 3 (architect) produced five deliverables in this directory:

1. **`deliverable_architecture.md`** — Arc42 v9.0 document (all 12 sections) with C4 Level 1 (context), Level 2 (container), Level 3 (component) Mermaid diagrams; four runtime sequence diagrams (MQTT telemetry flow, token expiry/reauth, goods reception, consumption deduction) plus the linking flow; docker-compose deployment view with normative compose skeleton; quality tree mapping all 28 NFRs to tactics and their plan verification gates.
2. **`deliverable_adrs.md`** — 13 MADR v4.0 ADRs (ADR-001…013), all Accepted, covering: architecture style (modular monolith + selective hexagonal), backend stack, database (SQLite/Drizzle), MQTT listener topology (DG-4: in-process supervised), live-update transport (DG-3: SSE), ACL design with fallback adapters, auth, telemetry retention (DG-6: latest-snapshot + additive fallback), ledger/idempotency design, token encryption, external-spool virtual slot (GK-M1), pending-question fallback provisions (DG-1 P7), right-sized observability.
3. **`deliverable_api-contracts.md`** (v2) — OpenAPI 3.1 REST contract: **62 operations** across auth, inventory, procurement/inbound/reception, integration, printers/AMS, jobs/costing, settings, system (SSE, backup, health); RFC 7807 errors, session-cookie security scheme, rate-limit and versioning statements; **48 component schemas** (11 shared/input + **37 field-level response/view schemas** added in v2 per M2, each cross-mapped to data-model columns with nullability as JSON Schema type unions — incl. SlotView, IntegrationStatus, InboundRow, ProductStockRow, LowStockAlert, TelemetrySnapshot, JobsSummary, CostBreakdown, Spool, PrintJobDetail, ReceptionResult); every 200/201 body now `$ref`s a named schema. Plus Part B: **12 internal domain events** (in-process bus; 11 table rows — the two LowStock events share one) and Part C: AsyncAPI 3.0-style SSE channel with 5 message types.
4. **`deliverable_data-model.md`** (v2) — Mermaid ERD + full column-level definitions for 18 tables incl. spool weight ledger (append-only + **v2 correction-safe exactly-once rule**: no tuple-uniqueness on the ledger; `filament_usage.UNIQUE(job_id, slot_ref)` + UNIQUE `ledger_entry_id` linkage + `reverses_entry_id` supersession link with one-reversal-per-entry uniqueness), PO/reception, jobs/costing snapshots, AMS slot mapping **with external virtual slot 254:0**, telemetry snapshot (latest-only) + pre-designed DG-6 history fallback; indices for NFR-PE-01; retention/migration/backup strategy; `currency_code` NOK default disclosed as an assumption pending Q-03.
5. **`deliverable_backend-stack-lock.md`** — Locked overlay `tech-stacks/node-typescript.md`; full version tuple (Node 22 LTS, TS 5, Fastify 5, Zod v4, Drizzle + SQLite/better-sqlite3, MQTT.js 5, argon2id, Pino, Vitest, Biome, pnpm, node:22-alpine); **3 registered deviations, each ADR-linked** (Dev-1 SQLite → ADR-003; Dev-2 no OTel → ADR-013; Dev-3 session-cookie auth → ADR-007); DG-1 prerequisites P1–P7 dispositioned.

## Review Checklist (for gatekeeper-design)

- [ ] **ADR-001 selection procedure** follows skill Step 1 (rank attributes → eliminate on hard constraints → compare → record rejected options) — verify no style conflicts with C-02 (serverless prohibited) or C-05.
- [ ] **Backend Stack Lock**: exactly one overlay; version tuple complete; every deviation has an ADR; no stack element left implicit in ADRs alone.
- [ ] **GK-M1 discharged (DG-1 P5)**: amended FR-305 ACs (AC-305.4, AC-305.5) in ADR-011 and architecture §8.9; external holder present in data model (`ams_slot_mapping.unit_index=254`), API (`slotRef "254:0"` in mapSlot/listSlots), and runtime view 6.4. ES-107.1 resolved to ONE behavior (atomic unmap-then-archive).
- [ ] **DG gates closed**: DG-1 (stack lock), DG-3 (SSE, ADR-005 — designer confirms fit at DG-2), DG-4 (in-process listener, ADR-004), DG-6 (latest-snapshot + additive fallback, ADR-008). DG-5 satisfied structurally (region is config).
- [ ] **DG-1 P7 handled honestly**: Q-01/Q-02/Q-05/Q-06 remain PENDING-USER (escalated to admiral); ADR-012 table shows the architecture is valid under every SRS §7.2 fallback — verify each provision is a real architectural element (kill switch, config-not-code region, manual printer endpoint, two-step link + manual-token endpoint), not prose.
- [ ] **NFR-MA-02**: zero-Bambu-imports rule is CI-enforceable as specified (dependency rule on `integration/bambu/**`); Bambu types never appear in Part A/B/C contracts.
- [ ] **Ledger invariants** (ADR-009 v2 vs SRS FR-103/402/405): atomicity, floor-at-zero, append-only, single write path; exactly-once anchored by `filament_usage.UNIQUE(job_id, slot_ref)` + UNIQUE `ledger_entry_id` + `UNIQUE(reverses_entry_id) WHERE NOT NULL`; **no tuple-uniqueness on the ledger** so same-spool reverse-and-repost (FR-405) executes without collision — rule identical in ADR-009 §1/§3 and data-model §3/§6.
- [ ] **API coverage**: every MUST FR maps to at least one operation/event; spot-check FR-204 (inbound), FR-207 (damaged), ES-402.2 (attribute endpoint), FR-406 CSV export.
- [ ] **Right-sizing**: no microservices, no OTel, no staging, no cache layers, two feature flags only — consistent with plan §7 and commander's no-enterprise-bloat instruction.
- [ ] **Minors swept**: m1–m4 opportunistic fixes present (m2/m4 in data-model §1; m3 via ES-107.1 resolution); planner n1 noted (ADR-009 §5); n2 was housekeeping in planner packet (N/A here).

## Cross-References

- Upstream (approved): `../phase-1_researcher/deliverable_srs.md` (SRS v1.0), `../phase-1_researcher/deliverable_domain-analysis.md`, `../phase-2_planner/deliverable_project-plan.md` (v2.0), verdicts in both phase directories.
- Constraints honored: C-01…C-07 verbatim (architecture §2); assumptions A-01…A-08 carried with MS-1 spike as first build activity (unchanged).
- Stack locks: Backend lock recorded here (DG-1); frontend lock deliberately deferred to Phase 4 designer (DG-2) per plan §8 — this packet asserts no frontend framework was smuggled in (SPA hosting noted as an assumption for the designer, not a lock).
- Escalations outstanding (owned by commander/admiral, NOT blocking per ADR-012): MS-0 answers to Q-01/Q-02/Q-05/Q-06.

## Change Summary — Attempt 2 (Substantive Change Detection Evidence)

Re-review scope honored: only `deliverable_data-model.md` §3/§6, `deliverable_adrs.md` ADR-009 (+ADR-010 for m5), and `deliverable_api-contracts.md` Part A components/affected response bodies + Part B count were modified. `deliverable_architecture.md`, `deliverable_backend-stack-lock.md`, ADR-001–008/011–013, and all discharged obligations are untouched.

### M1 — Ledger backstop vs reverse-and-repost: RESOLVED (backstop dropped; supersession link added)

**Before** (data-model §3, v1):
> **Partial idempotency index**: `UNIQUE (spool_id, job_id, slot_ref, type) WHERE type='consumption' AND job_id IS NOT NULL` — DB-level backstop for FR-402 exactly-once (primary guard on filament_usage, §6).

**After** (data-model §3, v2 — mirrored normatively in ADR-009 §1/§3):
> **Exactly-once & correction rule (v2 …):** the ledger carries **no uniqueness constraint over (spool_id, job_id, slot_ref, type)** — the v1 partial backstop index is REMOVED … FR-402 exactly-once is anchored at DB level by three constraints: (a) `filament_usage.UNIQUE(job_id, slot_ref)` …; (b) `filament_usage.ledger_entry_id` UNIQUE FK …; (c) `UNIQUE(reverses_entry_id) WHERE NOT NULL` — an entry can be reversed at most once … **Correction transaction (FR-405 AC-405.2, one SQLite transaction):** insert `reversal` (delta = −original.delta_g, `reverses_entry_id` = original.id) → insert corrected `consumption` entry (same spool permitted) → repoint `filament_usage.ledger_entry_id` → update denormalized balance.

Chosen resolution = gatekeeper's option 1 (drop the backstop) hardened with a supersession discriminator (`reverses_entry_id`, new nullable FK column + partial unique index on `spool_ledger_entry`). **Invariant**: a consumption entry is *live* iff referenced by `filament_usage.ledger_entry_id` (UNIQUE); every non-live consumption entry is reversed exactly once. Acceptance check: a same-spool 42.5 g→40 g correction inserts reversal + repost with an identical (spool, job, slot, type) tuple — nothing constrains that tuple, so no violation; double-deduction remains impossible via (a)+(b), double-reversal via (c). ADR-009 §1, §3, and data-model §3/§6 now state one identical rule.

### M2 — Response schemas: RESOLVED (37 field-level response/view schemas added)

**Before** (api-contracts v1, representative):
> `/printers/{id}/slots: … responses: { '200': { description: SlotView[] } }` — components.schemas contained 11 input schemas + Problem only; SlotView, IntegrationStatus, InboundRow, ProductStockRow, LowStockAlert, TelemetrySnapshot, listJobs summary, cost breakdown had **no field-level definition anywhere**.

**After** (api-contracts v2, same path):
> `'200': { description: Slot views, content: { application/json: { schema: { type: array, items: { $ref: '#/components/schemas/SlotView' } } } } }` — with `SlotView` fully defined (printerId, unitIndex, slotIndex, slotRef, external, observation: TrayObservation|null, mapping{spoolId, mappedAt, verifyFlag, verifyReason|null}|null, spool: SpoolSummary|null), each property cross-mapped to `ams_slot_mapping` / `telemetry_snapshot.ams_json` / `spool` columns.

All six gatekeeper-named aggregates plus JobsSummary, CostBreakdown (job detail cost breakdown incl. `inputs_snapshot_json` shape), and core entity responses (Spool, PrintJobDetail with usages+cost, ReceptionResult, plus Vendor/FilamentProduct/PurchaseOrder(+Detail)/GoodsReceipt(+Detail)/LedgerEntry/FilamentUsage/Printer/SessionInfo/HealthStatus/etc.) are now named component schemas with per-field type + nullability (`type: ["X","null"]` unions; convention: all listed properties always present). Every 200/201 response body `$ref`s a schema — DG-2 P1 is satisfiable from the contract alone.

### Minors (batched in the same pass)

- **m1** — OpenAPI validity: both `tags: [auth]; security: []` inlines split onto separate lines (plus the same-class `tags: [system]; security: []` on /health); both `type: array; minItems: 1` fixed to proper block form; invalid response key `'401-upstream mapped'` removed (folded into the `'502'` response description on refreshPrinters); `parameters: [ same filters as listJobs ]` replaced with the five explicit filter parameters on exportJobsCsv. Same-class defects in the Part C sketch (unquoted `enum[...]`/`date?` shorthand) also quoted for validity. Both YAML blocks now machine-parse cleanly (verified with a YAML parser: 62 operations, 48 component schemas, zero invalid response keys).
- **m2** — Part B now states **12 distinct events** (11 table rows; LowStock pair shares a row) in both the table footnote and the event-surface count; packet counts above corrected.
- **m3** — `mapSlot` slotRef pattern tightened to `^([0-3]|254):[0-3]$` with the slot-0 rule for 254 documented (server authoritative; 254:1..3 → 400) — matches the DB CHECK in data-model §3.
- **m4** — `currency_code DEFAULT 'NOK'` disclosed as an assumption pending Q-03 in data-model §6 and in the api-contracts conventions + CostRateSettings/CostBreakdown schemas.
- **m5** — ADR-010 gained a Considered Options section (rejected: OS keystore, libsodium sealed boxes, plaintext+file-perms, each with a one-line reason).

Files modified in attempt 2 (all bumped to frontmatter `version: 2`, `status: revised`): `deliverable_data-model.md`, `deliverable_adrs.md`, `deliverable_api-contracts.md`, `review-packet.md`.

## Submission Note

Pipeline mode: architect does NOT submit to gatekeeper-design; commander owns the review cycle. Deliverable frontmatter status is `revised` (version 2, attempt 2) on the four files touched by this revision; `deliverable_architecture.md` and `deliverable_backend-stack-lock.md` remain at version 1 `submitted` (outside re-review scope, settled by the attempt-1 verdict).
