---
type: review-packet
version: 1.0.0
pipeline: design
phase: 2
skill: planner
run_id: run-001_2026-08-04_3d-print-erp
created: 2026-08-04T01:45:00Z
deliverable_count: 1
updated: 2026-08-04T02:15:00Z
revision: attempt 2 (addresses gatekeeper attempt-1 findings M1, M2, m1–m5)
---

## Deliverable Summary

One consolidated deliverable: `deliverable_project-plan.md` (Project Plan v2.0, revised — attempt 2) containing: executive summary; scope summary with carried-forward gatekeeper inputs; 6 delivery phases (D1 De-Risk & Foundation, D2 Inventory Core, D3 Printer Integration & Dashboard, D4 Procurement & Reception, D5 Jobs & Costing, D6 Hardening & v1.0); milestone map MS-0–MS-7 (effort ranges, no fixed dates — solo capacity, no deadline); risk register with 10 scored risks (1 Critical, 3 High, 5 Medium, 1 Low — per register labels), each with mitigation AND contingency; dependency graph with named critical path, explicit edge semantics, and D4 as schedule shock-absorber; right-sized rollout strategy (compose releases, backup-gated upgrades, ≤ 15 min rollback, exactly 2 feature flags); technology decision gates DG-1–DG-6 with owners, deadlines, prerequisites, and an escalation rule; resource assumptions; full FR/NFR/constraint traceability summary.

Key planning decisions:
1. **The Q-05 cloud-mode question (MS-0, with Q-01/Q-02/Q-06) is a design-time gate** — commander poses it immediately, at design Phase 3 entry at latest, with recorded answers as a DG-1 input (P7). **The Bambu spike (MS-1) is then the first build activity**, with an explicit go/no-go decision rule and pre-approved per-assumption fallbacks (bounded architect re-engagement, not pipeline restart).
2. **Integration (D3) ordered before procurement (D4)** per risk × value: highest-residual-risk core value earliest; D4 is off the critical path and reorderable as a shock absorber.
3. **Phases are independently deployable**: D2 already replaces the spreadsheet — value accrues even if the project pauses (solo-continuity mitigation, RISK-004).
4. **No stack chosen**: backend lock = DG-1 (architect, design Phase 3), frontend lock = DG-2 (designer, design Phase 4), each with concrete decide-by prerequisites; stack familiarity recorded as architect input, not a selection.
5. **Rollout right-sized**: no canary/blue-green/metrics stack for one user on one host — rejected explicitly; safety via tagged images, backup-before-upgrade (pulled forward to end of D2 as hard prerequisite), verified restore, smoke checklist.
6. **Feature flags minimal**: `consumption.autopost` (temporary preview flag protecting the ledger during D5, removed in D6) and `integration.enabled` (permanent kill switch doubling as the NFR-RE-05 test lever). Nothing else.

## Review Checklist

- [ ] Phase count 3–6 respected (6); each phase independently deployable and valuable; each has structured Duration/Goal/Deliverables/Requirements/Dependencies/Exit-criteria
- [ ] All 32 FRs mapped to exactly one primary phase; deferred AC fragments (AC-106.3, FR-102 reception path, FR-107 AMS transitions) explicitly tracked, not lost
- [ ] Q-05 front-loaded as MS-0 **design-time** gate (posed at design Phase 3 entry at latest; recorded answers are DG-1 input P7); spike (MS-1) at build start precedes all integration product code; MS-1 gates D1 completion and detailed D3 planning (scaffolding may run in parallel); go/no-go decision rule stated with escalation path
- [ ] GK-M1 scheduled with a concrete resolution owner (architect, FR-305 amendment), implementation phase (D3), verification milestone (MS-4), and DG-1 prerequisite (P5); minors m1–m5 assigned
- [ ] Risk register: every entry has Category, P×I score per matrix, mitigation AND contingency, owner, review cadence; A-01…A-05 treated as the top (Critical) risk; scores arithmetically consistent with P×I
- [ ] No technology stack selected anywhere in the plan; DG-1/DG-2 prerequisites are stack-agnostic capability requirements, not disguised choices
- [ ] Rollout strategy honors C-02 (compose-only, no cloud) and is right-sized (no enterprise ceremony); rollback trigger, procedure, and max time defined; rollout prerequisites stack-independent
- [ ] No optimistic-date gaming: no fixed calendar dates; ranges with declared buffer; sequence binding, dates not; slip-handling rule (surface, never absorb) present
- [ ] No MUST scope moved to later phases without flagging (check: all **29** MUST FRs land in D1–D5 — re-verified against the SRS per-FR priority sweep; the 3 SHOULDs FR-003/FR-108/FR-207 are scheduled in D1/D2/D4 and identified as pre-agreed descope candidates only in contingency, not silently deferred)
- [ ] Estimation rules applied: first-time external integration doubled (D3/D5), 20–25% buffer, no XL-sized unbroken items

## Cross-References

- Upstream (gatekeeper-design APPROVED, attempt 1, 84/100): `../phase-1_researcher/deliverable_srs.md`, `../phase-1_researcher/deliverable_domain-analysis.md`, `../phase-1_researcher/gatekeeper-verdict.md`
- Constraints honored: C-01–C-07 (SRS §7.1) — traceability in plan §10; user tech constraints/preferences carried forward verbatim from SRS §8 (Bambu API + MQTT mandated; Docker Compose self-host mandated; serverless/Vercel/Azure prohibited; single-user auth model; language/framework/DB explicitly open for architect/designer)
- Commander delegation directives honored: decision gates defined but stacks not chosen; thin vertical slices; early Bambu de-risking; no enterprise ceremony; local compose rollout; feature flags only where genuinely useful
- Stack locks: NONE created this phase (correct for Phase 2); DG-1/DG-2 define when and by whom locks occur
