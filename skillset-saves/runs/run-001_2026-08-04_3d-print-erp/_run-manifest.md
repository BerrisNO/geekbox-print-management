---
type: run-manifest
run_id: run-001_2026-08-04_3d-print-erp
project_name: GeekBOX Print Management — 3D-Printing ERP
pipeline_mode: full
initiated: 2026-08-04T18:14:58Z
last_updated: 2026-08-05T19:55:56Z
admiral_state: DELIVERED
design_state: DELIVERED
build_state: DELIVERED
review_state: DELIVERED
azure_state: NOT_APPLICABLE
---

## User Request (Verbatim)
> You need to make me a webapplication that focuses on 3d printing, fillament management, inbound logistics (fillament on the way), goods reception and so on. almost a complete ERP system just for 3d printing. it has to connect to my printer through bambulab API - Base-URL `https://api.bambulab.com`

## Constraints
- **Printer integration**: Bambu Lab Cloud API (`https://api.bambulab.com`) + Bambu cloud MQTT broker for live printer/AMS telemetry (user-confirmed choice)
- **Users**: Single user (the owner) with simple login protection; no multi-user role management in v1
- **Deployment**: Self-hosted / local via Docker (user-confirmed) — enables an always-on MQTT listener process; NOT Vercel, NOT Azure (Stage 4 skipped as NOT_APPLICABLE)
- **V1 scope (all confirmed must-have)**:
  1. Filament inventory — spool catalog, stock levels, material/color/vendor, remaining-weight tracking, low-stock alerts
  2. Inbound logistics + goods reception — purchase orders, filament in transit, expected arrivals, reception workflow booking spools into stock
  3. Printer dashboard — live Bambu printer status, current job progress, AMS slot contents mapped to spool inventory
  4. Print jobs + costing — job history, filament consumption deducting spool stock, cost-per-print
- Timeline / budget / team: not specified; single-developer hobbyist-professional context
- Greenfield project — empty workspace

## Stage Status
| Stage | State | Gate Verdict | Revisions |
|-------|-------|-------------|-----------|
| Design | DELIVERED | APPROVED (Handoff 1) | 0/2 |
| Build | DELIVERED | APPROVED (Handoff 2) + remediation | 0/2 |
| Review | DELIVERED | APPROVED (Handoff 3, delivery-ready) | 0/2 |
| Azure | NOT_APPLICABLE | N/A | 0/2 |
