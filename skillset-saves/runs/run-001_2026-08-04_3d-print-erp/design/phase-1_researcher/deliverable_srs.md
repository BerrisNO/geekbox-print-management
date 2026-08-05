---
type: deliverable
pipeline: design
phase: 1
skill: researcher
name: Software Requirements Specification — GeekBOX Print Management
version: 1
status: submitted
created: 2026-08-04T00:00:00Z
---

# SRS: GeekBOX Print Management
**Version**: 1.0
**Authors**: researcher (Supreme Team design pipeline, Phase 1)
**Status**: In Review
**Date**: 2026-08-04
**Reviewers**: gatekeeper-design (via commander)

---

## 1. Project Overview

### 1.1 Problem Statement
A solo 3D-printing operator runs one or more Bambu Lab printers and manages filament spools, purchases, and print jobs manually (spreadsheets, memory, vendor emails). There is no single system that tracks (a) what filament is on hand and how much remains on each spool, (b) what filament is on order and when it arrives, (c) what the printer is doing right now, and (d) what each print actually cost. The result is stock-outs mid-project, unknown per-print costs, and no linkage between the physical spool in an AMS slot and any inventory record.

### 1.2 Project Vision
A self-hosted, single-user web application — a lightweight ERP scoped to 3D printing — that manages the full filament lifecycle (order → inbound → goods reception → stock → consumption → depletion), shows a live printer dashboard fed by the Bambu Lab cloud (REST + MQTT), and computes cost-per-print from actual filament consumption plus optional energy/machine-time rates. Runs locally via Docker Compose with no cloud spend.

### 1.3 Success Metrics
| Metric | Target | Measurement Method |
|--------|--------|-------------------|
| Spool inventory accuracy | Remaining weight within ±5% of physical scale weight for tracked spools | Periodic manual scale check vs. system value |
| Inbound visibility | 100% of open POs show status and expected arrival on one screen | UI inspection of Inbound view |
| Live dashboard freshness | Printer status reflects reality within 10 s while MQTT connected | Compare dashboard vs. printer display during a print |
| Cost coverage | ≥ 95% of completed prints have a computed cost | Job history report: jobs with cost / total jobs |
| Reception throughput | Booking a received PO line into stock takes ≤ 2 minutes per spool batch | Timed walkthrough of goods-reception flow |

### 1.4 Scope Boundaries
**In scope (v1)**:
- Filament product catalog and per-spool inventory with remaining-weight tracking and low-stock alerts
- Purchase orders, inbound ("filament on the way") tracking, goods reception booking spools into stock
- Live Bambu printer dashboard (status, job progress, layers, time remaining, temperatures) and AMS slot → spool mapping
- Print-job history (Bambu task API and/or MQTT), per-job filament consumption deducting spool weight, cost-per-print
- Single-user credential login; self-hosted Docker Compose deployment

**Out of scope (v1)**:
- Multi-user accounts, RBAC, multi-tenancy
- Sales/order management, invoicing, customer management, e-commerce
- Slicer integration, G-code/3MF upload, print initiation or remote printer control (read-only telemetry only)
- Non-Bambu printer integrations (Klipper, OctoPrint, Prusa, etc.)
- Accounting-grade financials (ledgers, tax, depreciation)
- Mobile native apps (responsive web only)
- Cloud/SaaS deployment (Azure/Vercel explicitly not targeted)
- Automated vendor ordering / supplier API integration (POs are entered manually)

---

## 2. Stakeholder Registry

Single-owner project: one human fills the business-owner, end-user, and operator roles. Distinct concerns are still listed so downstream phases address each hat.

| ID | Role | Name/Team | Key Concerns | Communication Cadence |
|----|------|-----------|-------------|----------------------|
| S01 | Owner-Operator (business owner + end user) | leifmagne.berland@gmail.com | Accurate stock, inbound visibility, cost-per-print, low upkeep effort | Direct — sole user |
| S02 | Self-host Operator (same person, ops hat) | Same | One-command startup, survives host reboot, easy backup/restore, no cloud dependency beyond Bambu | Direct |
| S03 | Downstream design phases (planner/architect/designer/engineer) | Supreme Team pipeline | Testable requirements, stable domain model, explicit external-API risk | Gatekeeper reviews |
| S04 | External dependency: Bambu Lab Cloud | Vendor (no relationship) | Unofficial API may change or revoke access without notice | N/A — monitored via adapter health |

---

## 3. Functional Requirements

Requirement ID ranges: FR-0xx auth, FR-1xx filament inventory, FR-2xx procurement/inbound/reception, FR-3xx Bambu integration & dashboard, FR-4xx print jobs & costing.

### 3.1 Authentication & Session (FR-001 – FR-003)

### FR-001: Single-User Credential Login
**Priority**: MUST
**Description**: The system provides a login page for exactly one local account (username + password). Passwords are stored only as a strong adaptive hash (see NFR-SE-01).
**Rationale**: Protects the app (which holds Bambu cloud credentials/tokens) on the local network; user-confirmed constraint: single user, no RBAC.
**Acceptance Criteria**:
- AC-001.1: GIVEN the configured account WHEN correct credentials are submitted THEN a session is created and the user is redirected to the dashboard
- AC-001.2: GIVEN the login page WHEN incorrect credentials are submitted THEN login is rejected with a generic error (no username/password distinction)
- AC-001.3: GIVEN no account exists yet (first run) WHEN the app is opened THEN a one-time setup flow creates the single account
**Error Scenarios**:
- ES-001.1: WHEN 10 consecutive failed logins occur within 15 minutes THEN further attempts are throttled (≥ 30 s delay) and the event is logged
**Dependencies**: None

### FR-002: Session Management
**Priority**: MUST
**Description**: Authenticated state is held in an HTTP session cookie (HttpOnly, SameSite=Lax at minimum). Sessions expire after configurable inactivity (default 7 days, suitable for a trusted home LAN) and can be explicitly ended via logout.
**Acceptance Criteria**:
- AC-002.1: GIVEN an active session WHEN the user clicks Logout THEN the session is invalidated server-side and protected routes redirect to login
- AC-002.2: GIVEN an expired or missing session WHEN any protected route or API is requested THEN the system returns 401/redirects to login without leaking data
**Error Scenarios**:
- ES-002.1: WHEN a tampered or unknown session token is presented THEN it is treated as unauthenticated
**Dependencies**: FR-001

### FR-003: Credential Change
**Priority**: SHOULD
**Description**: The logged-in user can change the account password (current password required).
**Acceptance Criteria**:
- AC-003.1: GIVEN a logged-in user WHEN they submit current + new password THEN the hash is updated and all other sessions are invalidated
**Error Scenarios**:
- ES-003.1: WHEN the current password is wrong THEN no change occurs and the attempt is logged
**Dependencies**: FR-001

### 3.2 Filament Inventory (FR-101 – FR-108)

### FR-101: Filament Product Catalog
**Priority**: MUST
**Description**: CRUD for filament products — the purchasable/catalog-level definition: material type (PLA, PETG, ABS, TPU, ASA, PC, PA, support, other), color (name + hex), vendor/brand, diameter (1.75 mm default; 2.85 mm allowed), nominal net weight per spool (g), default purchase price, and optional notes/SKU.
**Rationale**: Spools, PO lines, and AMS mappings all reference a canonical product definition (user scope item 1).
**Acceptance Criteria**:
- AC-101.1: GIVEN valid product data WHEN the user saves a new product THEN it appears in the catalog and is selectable in spool registration and PO lines
- AC-101.2: GIVEN an existing product WHEN edited THEN historical spools/PO lines retain their recorded prices while new references use updated defaults
- AC-101.3: GIVEN a product referenced by spools or PO lines WHEN deletion is attempted THEN the system offers archive (hide from pickers) instead of hard delete
**Error Scenarios**:
- ES-101.1: WHEN required fields (material, color, vendor, diameter) are missing THEN save is rejected with field-level errors
**Dependencies**: None

### FR-102: Spool Registration
**Priority**: MUST
**Description**: Individual physical spools are tracked as instances of a product, each with: unique spool ID (system-generated, printable/label-friendly), product reference, initial net filament weight (g), tare (empty-spool) weight (g, optional), actual purchase price, source (goods reception, manual entry), acquisition date, and status (in_stock, in_use, depleted, archived).
**Acceptance Criteria**:
- AC-102.1: GIVEN a product WHEN the user registers a spool manually THEN a spool record is created with remaining weight = initial net weight and status in_stock
- AC-102.2: GIVEN goods reception of a PO line (FR-205) WHEN spools are booked in THEN one spool record per physical spool is created automatically with price from the PO line
**Error Scenarios**:
- ES-102.1: WHEN initial weight ≤ 0 or > 20,000 g THEN save is rejected as implausible
**Dependencies**: FR-101, FR-205

### FR-103: Per-Spool Remaining-Weight Tracking
**Priority**: MUST
**Description**: Each spool has a remaining net filament weight (g) that is reduced by print-job consumption (FR-402), adjustable manually (FR-104), and never negative. All changes are recorded as immutable consumption/adjustment entries (source, amount, timestamp, optional job reference) forming a per-spool ledger.
**Rationale**: The spool ledger is the linchpin joining inventory to costing; an audit trail prevents silent drift.
**Acceptance Criteria**:
- AC-103.1: GIVEN a spool with 800 g remaining WHEN a job consumes 42.5 g from it THEN remaining weight becomes 757.5 g and a ledger entry with the job reference is stored
- AC-103.2: GIVEN a spool WHEN its ledger is viewed THEN all deductions/adjustments are listed newest-first with source and running balance
- AC-103.3: GIVEN a deduction that would exceed remaining weight WHEN applied THEN remaining weight is floored at 0, the entry is flagged "over-consumption", and the spool is marked depleted
**Error Scenarios**:
- ES-103.1: WHEN a ledger write fails mid-deduction THEN neither the deduction nor the balance change is applied (atomicity)
**Dependencies**: FR-102, FR-402

### FR-104: Manual Weight Adjustment & Recalibration
**Priority**: MUST
**Description**: The user can set a spool's remaining weight to a measured value (e.g., after weighing gross weight; system subtracts tare if known) with an optional note. The delta is recorded as a manual-adjustment ledger entry.
**Acceptance Criteria**:
- AC-104.1: GIVEN a spool with tare 216 g WHEN the user enters gross weight 700 g THEN remaining net weight is set to 484 g and an adjustment entry records the delta
- AC-104.2: GIVEN no tare weight recorded WHEN adjusting THEN the user enters net remaining weight directly
**Error Scenarios**:
- ES-104.1: WHEN entered gross weight < tare weight THEN the adjustment is rejected as implausible
**Dependencies**: FR-103

### FR-105: Stock Level Views
**Priority**: MUST
**Description**: An inventory screen shows stock aggregated by product (spool count, total remaining weight) and drill-down to individual spools with status, remaining weight, remaining %, and location hint (e.g., "AMS slot 2", "shelf"). Filter by material, color, vendor, status.
**Acceptance Criteria**:
- AC-105.1: GIVEN 3 spools of a product with 1000/500/0 g remaining WHEN the inventory view loads THEN that product row shows 2 usable spools (depleted excluded) and 1500 g total remaining
- AC-105.2: GIVEN filters material=PLA, status=in_stock WHEN applied THEN only matching spools are listed
**Error Scenarios**:
- ES-105.1: WHEN inventory data cannot be loaded THEN an error state with retry is shown (no blank/partial silent render)
**Dependencies**: FR-102, FR-103

### FR-106: Low-Stock Alerts
**Priority**: MUST
**Description**: Each product may have a low-stock threshold, expressed as minimum total remaining weight (g) and/or minimum usable spool count. When stock falls to or below a threshold, the product enters low-stock state: highlighted in inventory, listed in a dashboard alert panel, and counted in a navigation badge. Alerts clear automatically when stock rises above threshold (goods reception or adjustment). On-order quantity from open POs is shown alongside the alert.
**Acceptance Criteria**:
- AC-106.1: GIVEN a product with threshold 500 g WHEN a deduction takes total remaining from 510 g to 480 g THEN the product is flagged low-stock and appears in the alert panel
- AC-106.2: GIVEN a low-stock product WHEN goods reception raises total remaining above threshold THEN the alert clears without user action
- AC-106.3: GIVEN a low-stock product with an open PO covering it WHEN the alert panel renders THEN the alert shows the on-order quantity and earliest expected arrival
**Error Scenarios**:
- ES-106.1: WHEN no threshold is set for a product THEN no alert is generated for it (opt-in per product)
**Dependencies**: FR-103, FR-105, FR-202

### FR-107: Spool Lifecycle Management
**Priority**: MUST
**Description**: Spool status transitions: in_stock → in_use (mounted/AMS-mapped or manually set), in_use → in_stock (unmounted), any → depleted (remaining ≈ 0 or user-declared), any → archived (lost/discarded; requires confirmation). Depleted/archived spools are excluded from stock totals and pickers but retained for job-cost history.
**Acceptance Criteria**:
- AC-107.1: GIVEN a spool mapped to an AMS slot (FR-305) WHEN the mapping is created THEN spool status becomes in_use
- AC-107.2: GIVEN a depleted spool WHEN job history referencing it is viewed THEN spool details still resolve
**Error Scenarios**:
- ES-107.1: WHEN archiving a spool currently mapped to an AMS slot THEN the system requires unmapping first (or does it atomically after confirmation)
**Dependencies**: FR-102, FR-305

### FR-108: Inventory Valuation Snapshot
**Priority**: SHOULD
**Description**: The inventory view shows current stock value: for each usable spool, remaining weight × (actual purchase price / initial net weight), summed per product and overall.
**Acceptance Criteria**:
- AC-108.1: GIVEN a spool bought at 25.00 (currency-configurable) for 1000 g with 400 g remaining WHEN valuation renders THEN that spool contributes 10.00
**Error Scenarios**:
- ES-108.1: WHEN a spool lacks a purchase price THEN it is valued using the product default price and marked "estimated"
**Dependencies**: FR-102, FR-103

### 3.3 Procurement, Inbound Logistics & Goods Reception (FR-201 – FR-207)

### FR-201: Vendor Management
**Priority**: MUST
**Description**: CRUD for vendors: name, website/order URL, typical lead time (days, optional), notes. Vendors are referenced by products and purchase orders.
**Acceptance Criteria**:
- AC-201.1: GIVEN a vendor WHEN saved THEN it is selectable in product and PO forms
- AC-201.2: GIVEN a vendor with lead time 5 days WHEN a PO for that vendor is created THEN expected arrival defaults to order date + 5 days (editable)
**Error Scenarios**:
- ES-201.1: WHEN deleting a vendor referenced by POs or products THEN the system offers archive instead
**Dependencies**: None

### FR-202: Purchase Order Creation with Line Items
**Priority**: MUST
**Description**: The user creates POs with: vendor, order date, external order reference (optional), expected arrival date, shipping cost (optional), notes, and one or more line items. Each line: filament product, quantity (spool count), unit price, optional per-line expected weight override. PO totals (goods + shipping) are computed.
**Acceptance Criteria**:
- AC-202.1: GIVEN a vendor and ≥ 1 line item WHEN the PO is saved THEN it is created in status draft with computed totals
- AC-202.2: GIVEN a draft PO WHEN marked as ordered THEN status becomes ordered and it appears in the inbound view (FR-204)
- AC-202.3: GIVEN a draft PO WHEN edited THEN lines can be added/removed/changed; ordered POs allow editing expected arrival and notes only (lines locked; quantities reconciled at reception)
**Error Scenarios**:
- ES-202.1: WHEN a PO has zero line items THEN it cannot leave draft
- ES-202.2: WHEN quantity ≤ 0 or unit price < 0 THEN the line is rejected
**Dependencies**: FR-101, FR-201

### FR-203: PO Status Lifecycle ("Filament on the Way")
**Priority**: MUST
**Description**: PO statuses: draft → ordered → partially_received → received; draft/ordered → cancelled. "Ordered" and "partially_received" constitute "filament on the way". Status changes are user-triggered except partially_received/received, which are derived from goods-reception postings (FR-205). All transitions are timestamped.
**Acceptance Criteria**:
- AC-203.1: GIVEN an ordered PO WHEN a reception books some but not all lines/quantities THEN status becomes partially_received automatically
- AC-203.2: GIVEN an ordered PO WHEN all line quantities are received THEN status becomes received and it leaves the inbound view
- AC-203.3: GIVEN an ordered PO WHEN cancelled THEN no further receptions can be posted against it and it leaves the inbound view
**Error Scenarios**:
- ES-203.1: WHEN a reception is attempted against a draft, received, or cancelled PO THEN it is rejected with the PO's current status
**Dependencies**: FR-202, FR-205

### FR-204: Inbound Overview
**Priority**: MUST
**Description**: A single "Inbound" screen lists all POs in ordered/partially_received status with vendor, expected arrival date, days until/overdue indicator, line summary (products, outstanding quantities), and total value. Sorted by expected arrival ascending; overdue POs (expected arrival < today, not fully received) are visually flagged.
**Acceptance Criteria**:
- AC-204.1: GIVEN 2 ordered POs with expected arrivals tomorrow and next week WHEN the inbound view loads THEN both appear sorted by arrival date with correct outstanding quantities
- AC-204.2: GIVEN a PO expected 3 days ago and not fully received WHEN the view loads THEN it is flagged overdue
**Error Scenarios**:
- ES-204.1: WHEN a PO has no expected arrival date THEN it sorts last and shows "no ETA"
**Dependencies**: FR-202, FR-203

### FR-205: Goods-Reception Workflow
**Priority**: MUST
**Description**: From an inbound PO, the user starts a reception: the system lists outstanding quantities per line; the user enters received quantity per line (default = outstanding), optionally corrects actual unit price, and confirms. On confirmation the system atomically: creates one spool record per received spool (product, initial weight from product nominal or line override, price from line), posts a goods-receipt record (timestamp, lines, quantities), updates PO status per FR-203, and re-evaluates low-stock alerts (FR-106).
**Rationale**: Core scope item 2 — reception is the bridge from procurement to inventory.
**Acceptance Criteria**:
- AC-205.1: GIVEN an ordered PO line of 4 spools WHEN the user receives 4 THEN 4 spool records are created in_stock and the line shows 0 outstanding
- AC-205.2: GIVEN a reception is confirmed WHEN it completes THEN a goods-receipt record links the PO, lines, quantities, and created spool IDs
- AC-205.3: GIVEN a low-stock product covered by the reception WHEN stock rises above threshold THEN the alert clears (per AC-106.2)
**Error Scenarios**:
- ES-205.1: WHEN received quantity for a line exceeds outstanding quantity THEN the user must confirm an over-delivery flag before posting (recorded on the receipt)
- ES-205.2: WHEN spool creation fails mid-reception THEN the whole reception rolls back (no partial receipt records or orphan spools)
**Dependencies**: FR-102, FR-202, FR-203

### FR-206: Partial Receipts
**Priority**: MUST
**Description**: Multiple receptions may be posted against one PO over time until all lines are fully received. Each reception is a separate goods-receipt record; outstanding quantities decrease cumulatively.
**Acceptance Criteria**:
- AC-206.1: GIVEN a line of 6 spools with 2 already received WHEN a second reception of 4 is posted THEN outstanding becomes 0 and the PO becomes received
**Error Scenarios**:
- ES-206.1: WHEN two receptions are submitted concurrently for the same PO THEN postings serialize; the second sees updated outstanding quantities (no double-booking)
**Dependencies**: FR-205

### FR-207: Reception Discrepancy Notes
**Priority**: SHOULD
**Description**: During reception the user can record per-line discrepancies: short delivery, damaged spools (received but marked damaged → spool created with status archived and note), wrong item (free-text note; no spool created for that unit).
**Acceptance Criteria**:
- AC-207.1: GIVEN a line where 1 of 3 spools arrived damaged WHEN reception is posted with 3 received / 1 damaged THEN 2 usable spools and 1 archived spool with a damage note are created, and the receipt records the discrepancy
**Error Scenarios**:
- ES-207.1: WHEN damaged count exceeds received count THEN posting is rejected
**Dependencies**: FR-205

### 3.4 Bambu Lab Integration & Printer Dashboard (FR-301 – FR-308)

> All Bambu Lab endpoints and protocols in this section are **community-documented, unofficial** (source: OpenBambuAPI community documentation — see §7.2 A-01). All access MUST go through a dedicated integration adapter (anti-corruption layer) per FR-301/NFR-MA-02, so schema drift or endpoint changes are contained in one module.

### FR-301: Bambu Cloud Account Linking
**Priority**: MUST
**Description**: The user links their Bambu Lab cloud account: the system authenticates against `https://api.bambulab.com/v1/user-service/user/login` with email + password, supporting the verification-code step when Bambu requires it (request code → user enters code → token issued). The obtained access token (and refresh token if provided) is stored encrypted at rest and never displayed. Linking status (linked/unlinked, token age, last successful call) is visible in settings.
**Acceptance Criteria**:
- AC-301.1: GIVEN valid Bambu credentials WHEN linking is submitted THEN an access token is obtained, stored encrypted, and status shows linked
- AC-301.2: GIVEN Bambu responds requiring a verification code WHEN the user submits the emailed code THEN login completes and the token is stored
- AC-301.3: GIVEN a linked account WHEN the user unlinks THEN stored tokens are deleted and MQTT/REST access stops
**Error Scenarios**:
- ES-301.1: WHEN Bambu login fails (wrong credentials, API change, network) THEN the raw error is logged, a sanitized message is shown, and no partial token state is stored
- ES-301.2: WHEN the login response schema does not match the adapter's expectation THEN the adapter reports "integration schema mismatch" rather than crashing (schema-drift containment)
**Dependencies**: None (external: Bambu Cloud REST)

### FR-302: Printer Discovery & Registration
**Priority**: MUST
**Description**: After linking, the system fetches the user's bound devices from `GET /v1/iot-service/api/user/bind` and stores each printer: device serial (dev_id), name, model, online flag. The user can refresh the list and choose which printers to track (default: all).
**Acceptance Criteria**:
- AC-302.1: GIVEN a linked account with one bound printer WHEN discovery runs THEN the printer appears with serial, name, and model
- AC-302.2: GIVEN a new printer bound in the Bambu app WHEN the user clicks refresh THEN the new device is added
**Error Scenarios**:
- ES-302.1: WHEN the bind endpoint returns 401 THEN the token-expiry flow (FR-307) is triggered
**Dependencies**: FR-301

### FR-303: Live Telemetry Ingestion (MQTT)
**Priority**: MUST
**Description**: A persistent background listener service connects to Bambu cloud MQTT over TLS (mqtts, port 8883, e.g. `us.mqtt.bambulab.com`; region-configurable) using username `u_{uid}`, password = access token, and subscribes to `device/{serial}/report` for each tracked printer. Incoming reports are normalized by the adapter into internal telemetry snapshots: printer state (idle/printing/paused/error/offline), current task name, progress %, current layer / total layers, remaining time, nozzle/bed/chamber temperatures, and AMS tray data (tray type, color, remaining % where reported). The latest snapshot per printer is persisted; the listener requests a full status push on connect where supported.
**Acceptance Criteria**:
- AC-303.1: GIVEN a linked account and tracked printer WHEN the listener starts THEN it connects, subscribes to `device/{serial}/report`, and stores the first snapshot within 60 s of the printer reporting
- AC-303.2: GIVEN an active print WHEN report messages arrive THEN progress, layer, remaining time, and temperatures update in the stored snapshot
- AC-303.3: GIVEN a report containing AMS tray data WHEN normalized THEN tray index, filament type, and color are stored per slot
**Error Scenarios**:
- ES-303.1: WHEN unknown/extra fields appear in a report THEN they are ignored without failing normalization; missing expected fields mark the affected values "unknown" and log once per field per session (schema-drift tolerance)
- ES-303.2: WHEN the MQTT connection drops THEN reconnection follows FR-306
**Dependencies**: FR-301, FR-302 (external: Bambu cloud MQTT)

### FR-304: Printer Dashboard
**Priority**: MUST
**Description**: The dashboard shows, per tracked printer: connection/printer state, current job name, progress % (bar), current layer / total layers, estimated time remaining, nozzle/bed(/chamber) temperatures, and the AMS panel (FR-305). Data updates automatically without manual page reload (push or short-interval refresh per NFR-PE-02). Data age is shown; stale data (no telemetry > 2 min while connected) is visually flagged.
**Acceptance Criteria**:
- AC-304.1: GIVEN a printing printer WHEN the dashboard is open THEN progress, layer, time remaining, and temperatures update within 10 s of telemetry arrival
- AC-304.2: GIVEN a printer offline or telemetry stale WHEN the dashboard renders THEN the printer card shows offline/stale state with last-seen timestamp instead of stale values presented as live
**Error Scenarios**:
- ES-304.1: WHEN the telemetry listener is down THEN the dashboard shows an integration-degraded banner with last-known data, not an error page
**Dependencies**: FR-303

### FR-305: AMS Slot ↔ Spool Inventory Mapping
**Priority**: MUST
**Description**: The AMS panel shows each AMS unit and slot with reported tray contents (type, color, remaining % if available). The user maps each slot to a specific spool record from inventory (picker filtered to plausible matches by material/color, overridable). Mappings persist across prints until changed. Mapped slots display live spool data (remaining weight from inventory ledger); consumption deduction (FR-402) targets the mapped spool. When telemetry indicates a tray change (type/color mismatch vs. mapping), the mapping is flagged for review, not silently changed.
**Rationale**: Core scope item 3 — this join between physical AMS state and inventory records is what makes consumption tracking automatic.
**Acceptance Criteria**:
- AC-305.1: GIVEN an AMS slot reporting PLA / red WHEN the user opens the mapping picker THEN in-stock/in-use PLA spools are suggested first, with an option to pick any spool
- AC-305.2: GIVEN a mapped slot WHEN the dashboard renders THEN the slot shows the spool ID, product, and remaining weight from inventory
- AC-305.3: GIVEN a mapped slot WHEN telemetry later reports a different filament type or color THEN the slot is flagged "verify mapping" until the user confirms or remaps
**Error Scenarios**:
- ES-305.1: WHEN a mapped spool is depleted or archived THEN the slot flags "mapped spool unavailable" and consumption falls back to unattributed (FR-402 ES-402.2)
**Dependencies**: FR-102, FR-107, FR-303

### FR-306: Connection Resilience & Reconnect
**Priority**: MUST
**Description**: The MQTT listener automatically reconnects after connection loss using exponential backoff (initial 5 s, doubling to max 5 min, with jitter), refreshing credentials from stored tokens on each attempt. Integration health (REST reachability, MQTT connected/disconnected since, last message time) is visible on a status panel. Telemetry gaps never corrupt stored data — the last snapshot is retained and marked stale.
**Acceptance Criteria**:
- AC-306.1: GIVEN a dropped MQTT connection WHEN the network recovers THEN the listener reconnects and resumes snapshots without app restart
- AC-306.2: GIVEN repeated failures for > 15 min THEN the dashboard shows integration-degraded state and the status panel shows the last error class and next retry time
**Error Scenarios**:
- ES-306.1: WHEN reconnect fails due to authentication (not network) THEN backoff stops and the token-expiry flow (FR-307) is triggered instead of hammering login
**Dependencies**: FR-303

### FR-307: Token Expiry & Re-Authentication Handling
**Priority**: MUST
**Description**: When the Bambu access token is rejected (REST 401 or MQTT auth failure), the system attempts a token refresh if a refresh mechanism is available; otherwise it marks the integration "re-authentication required", surfaces a prominent prompt (dashboard banner + settings), and suspends REST polling and MQTT reconnect attempts until the user re-links (FR-301). Inventory and procurement features remain fully functional throughout.
**Acceptance Criteria**:
- AC-307.1: GIVEN an expired token WHEN detected THEN the integration state becomes reauth-required and a banner links to the re-link flow
- AC-307.2: GIVEN the user re-links successfully WHEN the new token is stored THEN MQTT and REST access resume automatically
- AC-307.3: GIVEN reauth-required state WHEN the user works with inventory/POs THEN no functionality outside the printer integration is degraded
**Error Scenarios**:
- ES-307.1: WHEN re-login fails repeatedly THEN each attempt's sanitized error is shown; no credential lockout behavior is triggered by the app itself
**Dependencies**: FR-301, FR-306

### FR-308: Print Task History Sync
**Priority**: MUST
**Description**: The system periodically (default every 30 min, and on demand) fetches print/task history from `GET /v1/user-service/my/tasks` and upserts print-job records (FR-401) keyed by Bambu task ID: job name, printer serial, start/end time, duration, status (success/failed/cancelled), and reported filament usage (weight and/or length per material where provided). Sync is idempotent — re-fetching never duplicates jobs or re-applies consumption.
**Acceptance Criteria**:
- AC-308.1: GIVEN a completed print WHEN the next sync runs THEN a job record exists with the task's metadata and reported filament usage
- AC-308.2: GIVEN a job already synced WHEN sync runs again THEN no duplicate record and no double consumption deduction occurs
**Error Scenarios**:
- ES-308.1: WHEN the tasks endpoint is unavailable or its schema drifts THEN sync logs the failure, surfaces it on the integration status panel, and retries next cycle (jobs can still be created from MQTT job-completion events or manually per FR-405)
**Dependencies**: FR-301, FR-302, FR-401

### 3.5 Print Jobs & Costing (FR-401 – FR-406)

### FR-401: Print Job Records
**Priority**: MUST
**Description**: Print jobs are stored with: source (task-sync, telemetry, manual), Bambu task ID (nullable), printer, job/file name, start/end time, duration, outcome (success/failed/cancelled/unknown), filament usage per material/slot (g), and links to consumption ledger entries and cost calculation. Jobs from telemetry (a print observed via MQTT reaching completion) and task sync (FR-308) are merged by task ID/time window rather than duplicated.
**Acceptance Criteria**:
- AC-401.1: GIVEN a completed print observed by both MQTT and task sync WHEN both sources have processed it THEN exactly one job record exists containing the union of their data
- AC-401.2: GIVEN a failed print WHEN recorded THEN outcome is failed and any reported partial filament usage is stored
**Error Scenarios**:
- ES-401.1: WHEN a job's filament usage is unreported by all sources THEN the job is stored with usage "unknown" and flagged for manual completion (FR-405)
**Dependencies**: FR-303, FR-308

### FR-402: Filament Consumption Deduction
**Priority**: MUST
**Description**: When a job record gains filament usage data, the system deducts the used weight from the mapped spool(s): usage attributed per AMS slot is deducted from the spool mapped to that slot at job time (FR-305); single-spool (external spool) usage is deducted from the spool the user has designated for the external holder. Each deduction is one ledger entry (FR-103) linked to the job. Deduction is applied exactly once per job (idempotency guard on job + slot).
**Acceptance Criteria**:
- AC-402.1: GIVEN a job that used 42.5 g from AMS slot 1 mapped to spool S-0007 WHEN consumption is applied THEN S-0007's remaining weight decreases by 42.5 g with a job-linked ledger entry
- AC-402.2: GIVEN consumption already applied for a job WHEN the job is re-synced THEN no additional deduction occurs
**Error Scenarios**:
- ES-402.1: WHEN usage is reported in length (mm) only THEN the system converts to grams using material density and diameter (documented defaults per material, overridable per product) and marks the entry "estimated"
- ES-402.2: WHEN a slot has no spool mapping at job time THEN the usage is recorded as unattributed consumption, flagged on the job, and the user can assign it to a spool later (assignment then creates the ledger entry)
**Dependencies**: FR-103, FR-305, FR-401

### FR-403: Cost Rate Configuration
**Priority**: MUST
**Description**: Settings hold optional costing rates: energy price (per kWh) + average printer power draw (W, per printer model, default per printer), machine-time rate (per hour, e.g., depreciation/maintenance), and default currency (display-only; single currency v1). All rates optional — costing works with filament cost alone.
**Acceptance Criteria**:
- AC-403.1: GIVEN energy price 0.35/kWh and printer draw 120 W WHEN a 5 h job is costed THEN energy cost = 0.21 (0.12 kW × 5 h × 0.35)
- AC-403.2: GIVEN no rates configured WHEN a job is costed THEN cost = filament cost only, with energy/machine lines shown as "not configured"
**Error Scenarios**:
- ES-403.1: WHEN a negative rate is entered THEN it is rejected
**Dependencies**: None

### FR-404: Cost-Per-Print Calculation
**Priority**: MUST
**Description**: For each job with usage data the system computes and stores: filament cost = Σ per-spool (used g × spool unit cost, where unit cost = actual purchase price / initial net weight); energy cost = duration × power draw × energy price (if configured); machine cost = duration × machine-time rate (if configured); total = sum. The stored calculation snapshots inputs (rates, unit costs) so later rate changes do not silently alter past job costs; the user can trigger recalculation explicitly.
**Acceptance Criteria**:
- AC-404.1: GIVEN a job using 42.5 g from a spool with unit cost 0.025/g WHEN costed THEN filament cost = 1.06 (rounded at display, full precision stored)
- AC-404.2: GIVEN rates changed after a job was costed WHEN the job is viewed THEN its stored cost is unchanged and shows the rates used; a "recalculate" action re-costs with current rates
**Error Scenarios**:
- ES-404.1: WHEN usage is unattributed (no spool) THEN filament cost for that portion uses the product default price if the product is known, else it is excluded and the cost is flagged "incomplete"
**Dependencies**: FR-402, FR-403

### FR-405: Manual Job Entry & Correction
**Priority**: MUST
**Description**: The user can create a job manually (for prints predating the app or missed by sync) and edit any job's filament usage, spool attribution, duration, and outcome. Edits that change usage/attribution reverse the prior ledger entries and post corrected ones (full audit trail; no in-place mutation of ledger entries).
**Acceptance Criteria**:
- AC-405.1: GIVEN a job flagged usage-unknown WHEN the user enters 30 g against spool S-0003 THEN the deduction ledger entry is created and the job is costed
- AC-405.2: GIVEN a job with 42.5 g attributed to S-0007 WHEN corrected to 40 g on S-0008 THEN S-0007 receives a +42.5 g reversal entry, S-0008 a −40 g entry, and the cost is recalculated
**Error Scenarios**:
- ES-405.1: WHEN a correction references an archived spool THEN the user must confirm (allowed for historical accuracy)
**Dependencies**: FR-103, FR-401, FR-402, FR-404

### FR-406: Job History & Cost Reporting
**Priority**: MUST
**Description**: A job history view lists jobs with date, printer, name, outcome, filament used (g), and total cost; filterable by printer, outcome, and date range; sortable by date and cost. Summary figures for the filtered set: job count, success rate, total filament used, total cost. Export of the filtered set to CSV.
**Acceptance Criteria**:
- AC-406.1: GIVEN 10 jobs in June WHEN filtered to June THEN the list shows those 10 with correct totals
- AC-406.2: GIVEN a filtered list WHEN CSV export is triggered THEN a CSV with one row per job and the displayed columns downloads
**Error Scenarios**:
- ES-406.1: WHEN a job has incomplete cost THEN totals include it with its partial cost and the summary is annotated "n jobs with incomplete cost"
**Dependencies**: FR-401, FR-404

---

## 4. Non-Functional Requirements (ISO 25010 Mapping)

Right-sized for a single-user, self-hosted LAN application — thresholds are deliberately modest where enterprise targets would be over-engineering.

### 4.1 Performance Efficiency
| ID | Requirement | Threshold | Measurement |
|----|-------------|-----------|-------------|
| NFR-PE-01 | Interactive page/API response (inventory, PO, jobs) | < 500 ms p95 with 5,000 spools, 10,000 jobs, 100,000 ledger entries seeded | Seeded-data timing test |
| NFR-PE-02 | Dashboard telemetry freshness | Displayed values ≤ 10 s behind received MQTT message while connected | Timestamp comparison in integration test |
| NFR-PE-03 | MQTT message processing | Listener sustains ≥ 10 messages/s per printer without unbounded queue growth | Load test with replayed report messages |
| NFR-PE-04 | Host resource footprint | Steady-state ≤ 1 GB RAM total across compose services (excl. OS) | Container stats after 24 h run |

### 4.2 Reliability
| ID | Requirement | Threshold | Measurement |
|----|-------------|-----------|-------------|
| NFR-RE-01 | Service availability (local) | App auto-starts with Docker daemon and recovers from container crash via restart policy; recovery < 60 s | Kill-container test |
| NFR-RE-02 | Telemetry reconnect | MQTT reconnect succeeds within 5 min of network restoration (per FR-306 backoff) | Network-cut test |
| NFR-RE-03 | Data durability | All inventory/PO/job writes transactional; zero partial writes after forced kill during reception/consumption posting | Crash-injection test around FR-205/FR-402 |
| NFR-RE-04 | Backup/restore | Single documented command (or endpoint) produces a restorable full backup; restore verified | Backup → wipe → restore drill |
| NFR-RE-05 | Degraded-integration operation | 100% of inventory, procurement, and costing features function with Bambu integration down | Feature walkthrough with integration disabled |

### 4.3 Security
| ID | Requirement | Threshold | Measurement |
|----|-------------|-----------|-------------|
| NFR-SE-01 | Password storage | Argon2id or bcrypt (cost ≥ 12); never reversible | Code review + hash inspection |
| NFR-SE-02 | Bambu credentials/tokens at rest | Access/refresh tokens encrypted at rest (e.g., AES-256-GCM with key from env/secret file); Bambu account password never persisted after login exchange | Code review + DB inspection |
| NFR-SE-03 | Transport to Bambu | TLS for all REST calls and MQTT (mqtts:8883) with certificate verification enabled | Config review + connection test |
| NFR-SE-04 | Session cookies | HttpOnly, SameSite=Lax minimum; Secure flag when served over HTTPS | Header inspection |
| NFR-SE-05 | Secrets handling | No secrets in image layers, code, or logs; supplied via env/secret files per Docker practice | Image scan + log review |
| NFR-SE-06 | Auth enforcement | 100% of non-login routes/APIs require a valid session | Route-table audit + unauthenticated probe test |
| NFR-SE-07 | Login throttling | Per FR-001 ES-001.1 (≥ 30 s delay after 10 failures/15 min) | Automated brute-force test |

### 4.4 Usability
| ID | Requirement | Threshold | Measurement |
|----|-------------|-----------|-------------|
| NFR-US-01 | Responsive layout | Core views usable at 360 px (phone), 768 px (tablet), 1280 px+ (desktop) widths | Viewport testing |
| NFR-US-02 | Accessibility baseline | WCAG 2.2 Level AA for color contrast, keyboard navigation, and form labeling on core flows | Automated audit (e.g., axe) + keyboard walkthrough |
| NFR-US-03 | Data-state clarity | Every live value shows freshness/staleness; every error state offers a next action | Design review checklist |

### 4.5 Maintainability
| ID | Requirement | Standard | Measurement |
|----|-------------|----------|-------------|
| NFR-MA-01 | Test coverage | ≥ 80% line coverage on domain logic (inventory ledger, reception, consumption, costing); adapter covered by contract tests with recorded fixtures | CI coverage report |
| NFR-MA-02 | Integration isolation (anti-corruption layer) | Zero imports of Bambu-specific types/endpoints outside the integration adapter module; all Bambu payloads validated at the boundary | Static dependency check / architecture test |
| NFR-MA-03 | Schema-drift containment | Unknown fields ignored, missing fields degrade to "unknown" values; adapter failures never crash core services | Fixture tests with mutated payloads |
| NFR-MA-04 | Documentation | README covers setup, backup/restore, re-linking Bambu account, and integration limitations | Review checklist |

### 4.6 Portability
| ID | Requirement | Standard | Measurement |
|----|-------------|----------|-------------|
| NFR-PO-01 | Containerized deployment | Full stack starts with `docker compose up -d` on a clean Docker host; OCI-compliant images | Clean-host install test |
| NFR-PO-02 | Data location | All persistent state in named volumes/bind mounts declared in compose file | Compose file review |
| NFR-PO-03 | No cloud dependency | No functionality (other than the Bambu integration itself) requires internet access | Offline feature walkthrough |

### 4.7 Compatibility
| ID | Requirement | Threshold | Measurement |
|----|-------------|-----------|-------------|
| NFR-CO-01 | Browser support | Last 2 versions of Chrome, Firefox, Edge, Safari | Cross-browser smoke test |
| NFR-CO-02 | Printer models | All Bambu models exposing the community report schema (X1/P1/A1 families); model-specific gaps degrade gracefully (missing chamber temp, etc.) | Fixture tests per model family where fixtures available |

---

## 5. External Interface Requirements

### 5.1 User Interfaces
Browser-based responsive web UI. Key screens: Login/first-run setup; Dashboard (printer cards + AMS panels + low-stock alert panel + integration health); Inventory (product aggregate + spool list + spool detail with ledger); Catalog (products, vendors); Purchase Orders (list, detail/edit, inbound overview); Goods Reception (per-PO reception form); Jobs (history list, job detail with cost breakdown); Settings (account, cost rates, Bambu link, thresholds, backup).

### 5.2 API Interfaces — Bambu Lab Cloud (consumed; UNOFFICIAL)
**Trust level**: External/Unknown (per evidence-standards §Input Trust Boundaries). **Source**: community documentation (OpenBambuAPI). **All facts below are assumptions A-01…A-05 (§7.2) and MUST be verified during implementation spike.**

| Interface | Detail |
|-----------|--------|
| Base URL | `https://api.bambulab.com` (user-specified constraint) |
| Login | `POST /v1/user-service/user/login` — email + password, or verification-code flow → access token |
| Device list | `GET /v1/iot-service/api/user/bind` — bound devices (dev_id/serial, name, model, online) |
| Task history | `GET /v1/user-service/my/tasks` — print/task history incl. reported filament usage |
| Live telemetry | MQTT over TLS, port 8883 (e.g., `us.mqtt.bambulab.com`; region-configurable); username `u_{uid}`, password = access token; subscribe `device/{serial}/report` |
| Auth lifecycle | Token expiry requires re-login (FR-307); no officially documented refresh contract — treat refresh as opportunistic |
| Stability contract | NONE. Mandatory anti-corruption layer (NFR-MA-02/03); all payloads validated at boundary; failures degrade to FR-306/FR-307 states |
| Rate limiting | Unknown — REST polling MUST be conservative (task sync default every 30 min; no endpoint polled more than once per minute) |

The system exposes no public API in v1 (internal UI-to-backend API only, session-authenticated per NFR-SE-06).

### 5.3 Data Interfaces
- **Database**: single embedded/containerized relational database (engine selection deferred to architect); all state in Docker volumes (NFR-PO-02)
- **CSV export**: job history export (FR-406)
- **Backup**: full-state backup artifact, restorable (NFR-RE-04)

### 5.4 Hardware/Infrastructure Interfaces
- Docker Engine + Docker Compose on the user's local machine/home server (Windows host present in workspace; images must be linux/amd64-compatible standard OCI)
- Outbound internet: HTTPS 443 to `api.bambulab.com`, MQTTS 8883 to Bambu regional broker — the only required external connectivity
- No inbound ports beyond the app's local web port (LAN only; no internet exposure required)

---

## 6. Domain Model (Summary)

Full detail in the companion deliverable `deliverable_domain-analysis.md`.

### 6.1 Bounded Contexts
| Context | Responsibility | Classification |
|---------|---------------|----------------|
| Filament Inventory | Products, spools, weight ledger, stock levels, low-stock alerts | Core |
| Procurement & Reception | Vendors, POs, inbound tracking, goods receipts | Core |
| Printer Integration (Bambu ACL) | Cloud auth, device registry, MQTT ingestion, task sync, normalized telemetry | Supporting (anti-corruption layer) |
| Print Jobs & Costing | Job records, consumption attribution, cost rates and calculations | Core |
| Identity & Access | Single-account auth, sessions | Generic |

### 6.2 Core Entities
FilamentProduct, Spool (aggregate root with SpoolLedgerEntry), Vendor, PurchaseOrder (root with PurchaseOrderLine), GoodsReceipt (root with GoodsReceiptLine), Printer, TelemetrySnapshot, AmsSlotMapping, PrintJob (root with FilamentUsage), CostRateSettings, CostCalculation, UserAccount. See domain analysis §3.

### 6.3 Domain Events
Key cross-context events: SpoolsReceivedIntoStock (Procurement → Inventory), StockLevelChanged / LowStockThresholdCrossed (Inventory), TelemetrySnapshotUpdated / TrayContentsChanged / PrintJobObservedComplete (Printer Integration → Jobs, Dashboard), FilamentConsumptionRecorded (Jobs → Inventory), PrintJobCosted (Jobs). See domain analysis §2.

---

## 7. Constraints and Assumptions

### 7.1 Constraints
| ID | Constraint | Source |
|----|-----------|--------|
| C-01 | Printer integration MUST use Bambu Lab Cloud API, base URL `https://api.bambulab.com`, plus Bambu cloud MQTT for live telemetry | User (verbatim request + intake) |
| C-02 | Deployment MUST be self-hosted local via Docker (docker-compose); NOT serverless, NOT Vercel, NOT Azure; a long-running process is available and the persistent MQTT listener is the intended telemetry architecture | User (intake) |
| C-03 | Single user: one account, simple credential login (hashed password, session cookie); no RBAC/multi-tenancy in v1 | User (intake) |
| C-04 | Greenfield — no existing systems, no migration | User (intake) |
| C-05 | Solo owner-operator team; solution complexity must remain maintainable by one person | User (intake) |
| C-06 | No cloud spend expected (self-hosted); no regulatory requirements identified | User (intake) |
| C-07 | The Bambu API is unofficial/undocumented; requirements mandate an adapter/anti-corruption layer and explicit design for token expiry, connection loss, and schema drift | Commander delegation (canonical) |

### 7.2 Assumptions
| ID | Assumption | Source | If invalidated |
|----|-----------|--------|----------------|
| A-01 | Login endpoint `POST /v1/user-service/user/login` accepts email+password or verification-code flow and returns an access token | Community documentation (OpenBambuAPI) — unverified | FR-301 flow redesigned; worst case, integration limited to manually supplied token |
| A-02 | `GET /v1/iot-service/api/user/bind` returns the bound device list with serials | Community documentation (OpenBambuAPI) — unverified | FR-302 needs alternate discovery (manual serial entry fallback) |
| A-03 | MQTT over TLS at port 8883 (regional brokers, e.g., us.mqtt.bambulab.com), username `u_{uid}`, password = access token, topic `device/{serial}/report` delivers status incl. AMS data | Community documentation (OpenBambuAPI) — unverified | FR-303–FR-306 rework; fallback to REST polling of task/status endpoints if any exist |
| A-04 | `GET /v1/user-service/my/tasks` returns per-task filament usage (weight and/or length) | Community documentation (OpenBambuAPI) — unverified | Consumption relies on MQTT-reported usage and/or manual entry (FR-405) |
| A-05 | Bambu tolerates a single well-behaved third-party client per account (conservative polling, one MQTT session) without account penalties | Community practice (Home Assistant integrations) — unverified | User accepts risk; integration is optional and app remains functional without it (NFR-RE-05) |
| A-06 | Printer reports AMS remaining-% only coarsely (if at all); authoritative remaining weight is the app's own ledger (job-usage deductions + manual calibration), not AMS sensors | Community documentation — unverified | If AMS reports reliable weights, they become an additional calibration input, not a replacement |
| A-07 | Single currency and single locale are sufficient for v1 | Inferred from single-user scope — unconfirmed | Add currency field to prices; no structural change |
| A-08 | Print volumes are hobbyist/small-business scale (≤ ~10 printers, ≤ ~100 jobs/week) — sizing basis for NFR-PE-01 | Inferred from solo operator — unconfirmed | Revisit performance thresholds; architecture unlikely to change |

---

## 8. Technology Constraints and Preferences (User-Specified Only)

Recorded verbatim from user intake; no stack overlay is selected in this phase.

- **Mandated integration**: Bambu Lab Cloud API at `https://api.bambulab.com` + Bambu cloud MQTT (C-01)
- **Mandated deployment**: self-hosted, local, Docker / docker-compose; long-running server process available and expected for the MQTT listener (C-02)
- **Prohibited**: serverless architectures, Vercel, Azure/cloud hosting for this system (C-02)
- **Mandated auth model**: single local account, hashed password, session cookie; no RBAC (C-03)
- **No user preference stated** for: language, framework, database engine, or UI library — these are open for planner/architect within the constraints above

## 9. Out-of-Scope Items
See §1.4. Explicitly reaffirmed: no print initiation/remote control, no slicer/file management, no sales/invoicing, no multi-user, no non-Bambu printers, no cloud deployment, no automated vendor ordering.

## 10. Open Questions

| ID | Question | Impact | Owner | Deadline |
|----|----------|--------|-------|----------|
| Q-01 | Which MQTT regional broker applies to the user's Bambu account (us./eu./cn.)? | FR-303 connection config — must be configurable; default region needed | User, at first link | Implementation of FR-301 |
| Q-02 | How many printers and which models (X1/P1/A1, AMS count) does the user own? | Fixture priorities for NFR-CO-02; dashboard layout sizing | User | Design phase 4 |
| Q-03 | Preferred currency and energy price for defaults? | FR-403 defaults; display formatting | User | Design phase 4 |
| Q-04 | Should telemetry history (time-series) be retained for charts, or is latest-snapshot enough for v1? | Storage design; assumed latest-snapshot + job records only (charts deferred) | User; architect proposes | Phase 3 |
| Q-05 | Does the user's account use Bambu cloud mode (required) rather than LAN-only mode on printers? Cloud mode is a prerequisite for C-01 | If printers are LAN-only, cloud API returns nothing; would need LAN MQTT variant (out of v1 scope) | User | Before implementation spike |
| Q-06 | Verification-code vs. password login: does the user's account require MFA/code login (affects FR-301 UX)? | FR-301 flow detail | User, at first link | Implementation of FR-301 |

Assumption-verification note: A-01…A-05 MUST be validated by a thin integration spike as the first implementation activity; requirements FR-306/FR-307 and NFR-MA-02/03 exist precisely to contain the blast radius if any assumption fails.
