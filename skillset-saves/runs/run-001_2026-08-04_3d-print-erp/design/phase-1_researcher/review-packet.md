---
type: review-packet
version: 1.0.0
pipeline: design
phase: 1
skill: researcher
run_id: run-001_2026-08-04_3d-print-erp
created: 2026-08-04T00:00:00Z
deliverable_count: 2
---

## Deliverable Summary

Phase 1 (Requirements & Domain Analysis) for **GeekBOX Print Management** — a single-user, self-hosted (Docker Compose) web application acting as a lightweight ERP for 3D printing: filament inventory with per-spool weight ledgers, purchase orders / inbound logistics / goods reception, a live Bambu Lab printer dashboard (cloud REST + MQTT), and print-job costing.

**Deliverables (this directory):**
1. `deliverable_srs.md` — SRS v1.0: 28 functional requirements (FR-001…FR-003 auth; FR-101…FR-108 inventory; FR-201…FR-207 procurement/inbound/reception; FR-301…FR-308 Bambu integration/dashboard; FR-401…FR-406 jobs/costing), 26 NFRs across 7 ISO 25010 characteristics with measurable thresholds, external interface requirements for the unofficial Bambu Cloud API, constraints C-01…C-07, assumptions A-01…A-08, open questions Q-01…Q-06.
2. `deliverable_domain-analysis.md` — Event storming (26 command/event pairs, 10 policies, 8 hot spots), 5 bounded contexts with DDD context map (ACL over Bambu Cloud), 13 entities/aggregates with invariants, ubiquitous language glossary (26 terms), core/supporting/generic classification.

**Key decisions:**
- The Spool weight ledger (immutable, append-only) is the book of record; printer telemetry is evidence, never authority. Corrections are reversal+repost, never mutation.
- All Bambu Lab API facts are captured as explicit assumptions (A-01…A-05, source: community documentation / OpenBambuAPI, unverified) per commander instruction not to block on web verification. A mandatory anti-corruption layer (C-07, NFR-MA-02/03) plus token-expiry/reconnect/schema-drift requirements (FR-306, FR-307) contain the unstable dependency; NFR-RE-05 guarantees the core app functions with the integration down.
- Job dedup/merge by Bambu task ID and idempotent consumption deduction (FR-401/FR-402) resolve the dual-source (MQTT + task API) duplication hot spot.
- NFR thresholds deliberately right-sized for solo self-hosted use (e.g., 500 ms p95 at seeded hobbyist data volumes, container-restart recovery instead of enterprise uptime SLAs).
- No tech-stack overlay selected (per researcher charter); user-specified constraints recorded in SRS §8.

## Review Checklist

- [ ] All four user-confirmed v1 scope items fully covered by MUST requirements (scope 1 → FR-101…107; scope 2 → FR-201…206; scope 3 → FR-302…305; scope 4 → FR-308, FR-401…406) — no narrowing
- [ ] Every FR has ≥ 1 GIVEN/WHEN/THEN acceptance criterion and ≥ 1 error scenario; RFC 2119 priorities assigned
- [ ] Every NFR has a measurable threshold and measurement method; none contradict constraints C-01…C-07
- [ ] Unofficial-API risk handled as instructed: endpoints recorded as assumptions with source "community documentation (OpenBambuAPI)"; ACL mandated; token expiry, connection loss, schema drift each have explicit requirements
- [ ] Hard user tech constraints (Bambu cloud API base URL, Docker self-hosted, no serverless/Vercel/Azure, single-user session auth) captured verbatim in SRS §8 with no stack selection smuggled in
- [ ] Domain model consistency: every SRS §6 entity detailed in domain analysis §4; event/policy → FR cross-references resolve; ubiquitous language used consistently across both documents
- [ ] Bounded context relationships use named DDD patterns; Bambu types confined to the ACL
- [ ] Open questions are genuine gaps (not disguised assumptions); Q-05 (cloud-mode prerequisite) flagged as pre-spike blocker
- [ ] Out-of-scope list explicit (no remote printer control, no multi-user, no cloud deploy, no non-Bambu printers)

## Cross-References

- Original user request (verbatim) and intake constraints: commander delegation for run-001_2026-08-04_3d-print-erp (recorded in SRS §7.1 C-01…C-07)
- Bambu API facts: community documentation (OpenBambuAPI) — SRS §5.2 and §7.2 A-01…A-05; deliberately unverified per commander instruction, spike-verification mandated in SRS §10
- No upstream pipeline artifacts (greenfield, Phase 1); no stack locks exist yet
- Templates followed: researcher `references/requirements-template.md`, `references/domain-analysis.md`; evidence/trust handling per `references/evidence-standards.md` §Input Trust Boundaries
