---
type: deliverable
pipeline: design
phase: 1
skill: researcher
name: Domain Analysis — GeekBOX Print Management
version: 1
status: submitted
created: 2026-08-04T00:00:00Z
---

# Domain Analysis: GeekBOX Print Management
**Version**: 1.0
**Authors**: researcher (Supreme Team design pipeline, Phase 1)
**Status**: In Review
**Date**: 2026-08-04
**Companion document**: `deliverable_srs.md` (SRS v1.0) — FR/NFR IDs referenced below

---

## 1. Domain Overview

The domain is a single-operator 3D-printing operation: filament is purchased from vendors, arrives as physical spools, is stocked, mounted into printers/AMS units, consumed by print jobs, and eventually depleted. The Bambu Lab cloud is the (unofficial, unstable) window into the physical printing process. The essential domain insight: **the Spool is the join point** — procurement produces spools, the AMS mapping identifies spools, jobs consume from spools, and costing is priced from spools. The spool's weight ledger is the system's book of record; printer-reported data is evidence feeding that ledger, never the ledger itself.

---

## 2. Event Storming Results

### 2.1 Timeline of Domain Events (temporally ordered)

**Procurement & inbound flow**
| # | Command (actor) | Domain Event | Aggregate |
|---|-----------------|--------------|-----------|
| 1 | DefineFilamentProduct (user) | FilamentProductDefined | FilamentProduct |
| 2 | RegisterVendor (user) | VendorRegistered | Vendor |
| 3 | CreatePurchaseOrder (user) | PurchaseOrderDrafted | PurchaseOrder |
| 4 | MarkOrdered (user) | PurchaseOrderPlaced ("filament on the way" begins) | PurchaseOrder |
| 5 | PostGoodsReception (user) | GoodsReceived | GoodsReceipt |
| 6 | — policy (from 5) | SpoolsReceivedIntoStock | Spool (×N) |
| 7 | — derived (from 5) | PurchaseOrderPartiallyReceived / PurchaseOrderReceived | PurchaseOrder |
| 8 | CancelPurchaseOrder (user) | PurchaseOrderCancelled | PurchaseOrder |

**Inventory flow**
| # | Command (actor) | Domain Event | Aggregate |
|---|-----------------|--------------|-----------|
| 9 | RegisterSpoolManually (user) | SpoolRegistered | Spool |
| 10 | AdjustSpoolWeight (user) | SpoolWeightAdjusted | Spool |
| 11 | — policy (any ledger change) | StockLevelChanged | Spool/product read model |
| 12 | — policy (from 11) | LowStockThresholdCrossed / LowStockCleared | Alert read model |
| 13 | ArchiveSpool / DeclareDepleted (user or policy) | SpoolArchived / SpoolDepleted | Spool |

**Printer integration flow (external system: Bambu Cloud)**
| # | Command (actor) | Domain Event | Aggregate |
|---|-----------------|--------------|-----------|
| 14 | LinkBambuAccount (user) | BambuAccountLinked / BambuTokenStored | CloudLink |
| 15 | DiscoverPrinters (user/system) | PrinterRegistered | Printer |
| 16 | — listener (MQTT message) | TelemetrySnapshotUpdated | TelemetrySnapshot |
| 17 | — listener (AMS payload delta) | TrayContentsChanged | TelemetrySnapshot |
| 18 | MapAmsSlotToSpool (user) | AmsSlotMapped (→ spool becomes in_use) | AmsSlotMapping |
| 19 | — listener (connection events) | TelemetryConnectionLost / TelemetryConnectionRestored | CloudLink |
| 20 | — listener/REST (auth failure) | BambuReauthRequired | CloudLink |
| 21 | SyncTaskHistory (scheduler/user) | PrintTasksFetched | (integration, feeds Jobs) |

**Jobs & costing flow**
| # | Command (actor) | Domain Event | Aggregate |
|---|-----------------|--------------|-----------|
| 22 | — policy (from 16/21: completion observed) | PrintJobRecorded | PrintJob |
| 23 | — policy (job gains usage + slot mappings) | FilamentConsumptionRecorded | PrintJob → Spool ledger |
| 24 | — policy (from 23 or rates present) | PrintJobCosted | CostCalculation |
| 25 | CreateManualJob / CorrectJob (user) | PrintJobCorrected (reversal + repost entries) | PrintJob, Spool |
| 26 | ConfigureCostRates (user) | CostRatesConfigured | CostRateSettings |

### 2.2 Key Policies (automated reactions)

| Policy | Trigger → Action | FR |
|--------|------------------|-----|
| Stock booking | GoodsReceived → create N Spool records (in_stock), price from PO line | FR-205 |
| PO status derivation | GoodsReceived → recompute outstanding quantities → PurchaseOrder(Partially)Received | FR-203 |
| Low-stock evaluation | StockLevelChanged → compare vs. product threshold → raise/clear alert; annotate with open-PO quantities | FR-106 |
| Job merge | PrintTasksFetched + telemetry-observed completion → upsert single PrintJob by task ID/time window | FR-401 |
| Consumption attribution | PrintJob gains usage → deduct from spool mapped to each AMS slot at job time; unmapped → unattributed flag | FR-402 |
| Idempotent deduction | Consumption exists for (job, slot) → skip re-application on re-sync | FR-402 |
| Costing | FilamentConsumptionRecorded → compute cost snapshot from spool unit costs + configured rates | FR-404 |
| Mapping verification | TrayContentsChanged mismatching AmsSlotMapping → flag "verify mapping" (never auto-remap) | FR-305 |
| Reauth suspension | BambuReauthRequired → suspend REST polling + MQTT reconnect; surface banner; core app unaffected | FR-307 |
| Depletion | Spool remaining reaches 0 → SpoolDepleted; mapped slot flags "spool unavailable" | FR-103/FR-305 |

### 2.3 Hot Spots (red flags surfaced during storming)

| # | Hot Spot | Resolution in requirements |
|---|----------|---------------------------|
| H1 | Bambu API is unofficial; any message/endpoint may drift | ACL mandate (C-07, NFR-MA-02/03); assumptions A-01…A-05 with spike verification; graceful degradation (FR-306/307, NFR-RE-05) |
| H2 | Same physical print visible via two sources (MQTT + task API) — duplication risk | Merge-by-task-ID policy (FR-401), idempotent deduction (FR-402) |
| H3 | Consumption reported in length vs. weight | Density-based conversion with per-material defaults, entries marked "estimated" (FR-402 ES-402.1) |
| H4 | AMS slot mapped to wrong/stale spool after physical swap | TrayContentsChanged → verify-mapping flag; never silent remap (FR-305) |
| H5 | Ledger drift vs. physical reality (purge, failed prints, waste) | Manual recalibration by weighing (FR-104); ±5% accuracy success metric |
| H6 | Over-consumption beyond recorded remaining weight | Floor at 0 + over-consumption flag + auto-deplete (FR-103) |
| H7 | Cloud-mode prerequisite: LAN-only printers are invisible to the cloud API | Open question Q-05 — must be confirmed before spike |
| H8 | Rate changes retroactively altering historical costs | Cost snapshots immutable; explicit recalculate action only (FR-404) |

---

## 3. Bounded Contexts

### 3.1 Context Inventory

| Context | Responsibility | Classification | Rationale |
|---------|---------------|----------------|-----------|
| **Filament Inventory** | FilamentProduct catalog, Spool lifecycle, weight ledger (book of record), stock aggregation, low-stock alerts | **Core** | The differentiating value: accurate per-spool tracking joined to real consumption |
| **Procurement & Reception** | Vendors, PurchaseOrders, inbound tracking, GoodsReceipts | **Core** | User-mandated "almost-ERP" inbound logistics; feeds Inventory |
| **Printer Integration (Bambu ACL)** | Cloud account link, token lifecycle, printer registry, MQTT listener, task sync, normalization to internal telemetry/usage models | **Supporting** (built as anti-corruption layer) | Necessary but not differentiating; isolates the unstable external dependency |
| **Print Jobs & Costing** | PrintJob records, consumption attribution, cost rates, cost calculations, reporting | **Core** | Cost-per-print is a headline user outcome |
| **Identity & Access** | Single UserAccount, sessions, login throttling | **Generic** | Commodity; simplest safe implementation |

### 3.2 Context Map

#### Procurement & Reception → Filament Inventory
- **Relationship**: Customer/Supplier (Procurement upstream for stock intake)
- **Direction**: Procurement → Inventory
- **Integration mechanism**: Domain event `SpoolsReceivedIntoStock` (transactionally consistent — same DB, same transaction in v1)
- **Data exchanged**: product ref, spool count, initial weights, actual unit prices, receipt reference
- **Translation layer**: none needed — shared meaning of FilamentProduct (Shared Kernel on FilamentProduct + Vendor reference data)

#### Printer Integration → Print Jobs & Costing
- **Relationship**: Anti-Corruption Layer (Integration is the ACL over Bambu Cloud; Jobs consumes normalized models only)
- **Direction**: Integration upstream → Jobs downstream
- **Integration mechanism**: normalized events `PrintJobObservedComplete`, `PrintTasksFetched` carrying internal TaskRecord/UsageReport types
- **Data exchanged**: task ID, printer serial, timings, outcome, per-slot usage (g or mm)
- **Translation layer**: inside Printer Integration — raw Bambu payloads (MQTT report JSON, REST responses) are validated and mapped to internal types at the boundary; Bambu field names never cross it (NFR-MA-02)

#### Printer Integration → Filament Inventory (via AMS mapping)
- **Relationship**: Customer/Supplier
- **Direction**: Integration supplies tray observations; Inventory owns AmsSlotMapping → Spool binding
- **Integration mechanism**: `TelemetrySnapshotUpdated` / `TrayContentsChanged` events; mapping read model joins slot ↔ spool
- **Data exchanged**: AMS unit/slot index, reported tray type/color/remaining-%
- **Translation layer**: ACL as above; tray observations are evidence only — they can flag but never mutate spool records

#### Print Jobs & Costing → Filament Inventory
- **Relationship**: Customer/Supplier
- **Direction**: Jobs commands deductions; Inventory owns the ledger invariants
- **Integration mechanism**: `RecordConsumption(spoolId, grams, jobRef)` command → `FilamentConsumptionRecorded`; ledger enforces floor-at-zero, idempotency, atomicity
- **Data exchanged**: spool ID, grams (actual/estimated flag), job reference
- **Translation layer**: none — shared internal units (grams)

#### Identity & Access → all contexts
- **Relationship**: Generic upstream (session gate)
- **Integration mechanism**: session middleware; no domain data exchanged

#### External: Bambu Lab Cloud → Printer Integration
- **Relationship**: Conformist externally / ACL internally — we conform to whatever Bambu sends at the wire, and translate immediately
- **Integration mechanism**: HTTPS REST (`api.bambulab.com`) + MQTTS 8883 (`{region}.mqtt.bambulab.com`)
- **Stability**: NONE (unofficial). All facts are assumptions A-01…A-05 in SRS §7.2

### 3.3 Context Map Diagram (textual)

```
                          [ Bambu Lab Cloud ]  (external, unofficial)
                             REST | MQTTS
                                  v
 [Identity & Access] --gate--> ┌────────────────────────┐
        (generic)              │ Printer Integration    │  ← ACL boundary:
                               │ (Supporting, ACL)      │    Bambu types stop here
                               └───┬───────────────┬────┘
              TelemetrySnapshot/   │               │  PrintJobObserved/
              TrayContentsChanged  │               │  PrintTasksFetched
                                   v               v
        ┌──────────────────────┐  AMS map  ┌─────────────────────┐
        │ Filament Inventory   │<─────────>│ Print Jobs &        │
        │ (Core: spool ledger) │  Record-  │ Costing (Core)      │
        └───────────▲──────────┘ Consumption└────────────────────┘
                    │ SpoolsReceivedIntoStock
        ┌───────────┴──────────┐
        │ Procurement &        │
        │ Reception (Core)     │
        └──────────────────────┘
```

---

## 4. Domain Model — Entities & Aggregates

### Aggregate: FilamentProduct
**Bounded Context**: Filament Inventory | **Type**: Aggregate Root

| Attribute | Type | Constraints | Description |
|-----------|------|------------|-------------|
| id | UUID | PK | |
| material | enum | PLA, PETG, ABS, TPU, ASA, PC, PA, SUPPORT, OTHER | Material type |
| colorName / colorHex | string / #RRGGBB | required / optional | Color |
| vendorId | UUID | FK Vendor, required | Brand/vendor |
| diameterMm | decimal | 1.75 default; 2.85 allowed | |
| nominalNetWeightG | int | > 0 | Filament weight per new spool |
| defaultPrice | decimal | ≥ 0 | Default purchase price per spool |
| densityGCm3 | decimal | material default, overridable | For length→weight conversion (FR-402) |
| lowStockThresholdG / lowStockMinSpools | int? | optional (opt-in alerts) | FR-106 |
| sku, notes | string? | | |
| archived | bool | | Soft delete (FR-101) |

**Business rules**: archive instead of delete when referenced; density defaults per material documented.

### Aggregate: Spool (with SpoolLedgerEntry)
**Bounded Context**: Filament Inventory | **Type**: Aggregate Root — **the book of record**

| Attribute | Type | Constraints | Description |
|-----------|------|------------|-------------|
| id | UUID | PK | |
| label | string | unique, printable (e.g., S-0007) | Human/label ID |
| productId | UUID | FK, required | |
| initialNetWeightG | int | 0 < w ≤ 20000 | |
| remainingNetWeightG | decimal | 0 ≤ r ≤ initial (floor at 0) | Derived from ledger |
| tareWeightG | int? | optional | Empty-spool weight for gross weighing |
| purchasePrice | decimal? | actual price; falls back to product default ("estimated") | |
| source | enum | goods_reception, manual | |
| goodsReceiptLineId | UUID? | set when from reception | Traceability |
| status | enum | in_stock, in_use, depleted, archived | FR-107 lifecycle |
| acquiredAt | date | | |

**SpoolLedgerEntry** (child entity, immutable append-only):
| Attribute | Type | Description |
|-----------|------|-------------|
| id | UUID | |
| spoolId | UUID | parent |
| type | enum | consumption, manual_adjustment, reversal, initial |
| deltaG | decimal | negative = deduction |
| balanceAfterG | decimal | running balance |
| jobId / jobSlotRef | UUID? | link for consumption/reversal |
| estimated | bool | length-converted or default-priced flags |
| overConsumption | bool | FR-103 AC-103.3 |
| note, createdAt | | |

**Business rules (invariants)**:
- remainingNetWeightG is always the last ledger balance; writes are atomic with the entry (FR-103)
- Never negative — floor at 0 with overConsumption flag → status depleted
- Ledger entries are never mutated; corrections are reversal + repost (FR-405)
- One consumption entry per (jobId, slotRef) — idempotency invariant (FR-402)
- unitCostPerG = purchasePrice / initialNetWeightG (value used in cost snapshots)

**Lifecycle**: in_stock → in_use ↔ in_stock → depleted; any → archived (confirm; unmap AMS first).

### Entity: Vendor
**Bounded Context**: Procurement & Reception | **Type**: Aggregate Root
id, name (required), url?, leadTimeDays?, notes?, archived. Referenced by FilamentProduct and PurchaseOrder; archive instead of delete (FR-201).

### Aggregate: PurchaseOrder (with PurchaseOrderLine)
**Bounded Context**: Procurement & Reception | **Type**: Aggregate Root

| Attribute | Type | Constraints |
|-----------|------|------------|
| id, vendorId | UUID | vendor required |
| status | enum | draft, ordered, partially_received, received, cancelled |
| orderDate, expectedArrival | date / date? | expectedArrival defaults orderDate + vendor lead time |
| externalRef, notes | string? | |
| shippingCost | decimal? | ≥ 0 |
| statusHistory | list | timestamped transitions (FR-203) |

**PurchaseOrderLine**: id, productId, quantityOrdered (>0), unitPrice (≥0), expectedWeightOverrideG?, quantityReceived (derived from receipts).

**Business rules**: ≥ 1 line to leave draft; lines locked once ordered; quantityReceived only via GoodsReceipt postings; status derived: partially_received when 0 < Σreceived < Σordered, received when Σreceived ≥ Σordered; no receptions against draft/received/cancelled. "Filament on the way" ≙ status ∈ {ordered, partially_received}.

### Aggregate: GoodsReceipt (with GoodsReceiptLine)
**Bounded Context**: Procurement & Reception | **Type**: Aggregate Root

GoodsReceipt: id, purchaseOrderId, receivedAt, postedBy(implicit single user), notes.
GoodsReceiptLine: id, poLineId, quantityReceived, quantityDamaged (≤ received), actualUnitPrice?, overDelivery flag, discrepancyNote?, createdSpoolIds[].

**Business rules**: posting is atomic — receipt + N spools + PO status update in one transaction (FR-205 ES-205.2); receptions serialize per PO (FR-206 ES-206.1); damaged units create archived spools with note (FR-207).

### Entity: Printer
**Bounded Context**: Printer Integration | **Type**: Aggregate Root
id, serial (dev_id, unique), name, model, tracked (bool), onlineFlag, lastSeenAt. Registered via discovery (FR-302); manual serial-entry fallback if A-02 fails.

### Entity: CloudLink
**Bounded Context**: Printer Integration | **Type**: Aggregate Root (singleton)
id, bambuUid, accessTokenEncrypted, refreshTokenEncrypted?, linkedAt, tokenIssuedAt, state (linked, reauth_required, unlinked), mqttRegion, lastRestSuccessAt, mqttConnectedSince?, lastMqttMessageAt, lastErrorClass. Owns token lifecycle (FR-301/306/307). Bambu account password is never persisted.

### Entity: TelemetrySnapshot
**Bounded Context**: Printer Integration | **Type**: Entity (latest-per-printer read model; history deferred per Q-04)
printerId, capturedAt, printerState (idle/printing/paused/error/offline/unknown), taskName?, progressPct?, currentLayer?/totalLayers?, remainingTimeMin?, nozzleTempC?/bedTempC?/chamberTempC?, amsUnits[] → slots[] {slotIndex, trayType?, trayColorHex?, remainingPct?}, staleness derived (FR-304). All fields nullable — schema-drift tolerance (NFR-MA-03).

### Entity: AmsSlotMapping
**Bounded Context**: Filament Inventory (owns the binding; consumes Integration observations) | **Type**: Aggregate Root
id, printerId, amsUnitIndex, slotIndex (incl. virtual "external spool" slot), spoolId, mappedAt, verifyFlag (bool — set on TrayContentsChanged mismatch, cleared on user confirm/remap), unique (printerId, amsUnitIndex, slotIndex).
**Business rules**: mapping a spool sets it in_use; unmapping returns to in_stock unless depleted; observations flag but never auto-remap (FR-305).

### Aggregate: PrintJob (with FilamentUsage)
**Bounded Context**: Print Jobs & Costing | **Type**: Aggregate Root

PrintJob: id, source (task_sync, telemetry, manual), bambuTaskId? (unique when present), printerId?, jobName, startedAt?, endedAt?, durationMin?, outcome (success/failed/cancelled/unknown), usageStatus (reported/estimated/unknown/manual), costCalculationId?.
FilamentUsage (child): id, jobId, slotRef? (ams unit+slot or external), spoolId? (resolved at attribution time), usedG (or usedMm + converted flag), attributed (bool), ledgerEntryId?.

**Business rules**: merge by bambuTaskId (or printer+time window) — one job per physical print (FR-401); consumption applied exactly once per (job, slotRef); unattributed usage retained for later assignment (FR-402 ES-402.2); corrections reverse-and-repost (FR-405).

### Entity: CostRateSettings
**Bounded Context**: Print Jobs & Costing | **Type**: Aggregate Root (singleton)
energyPricePerKwh?, machineTimeRatePerHour?, currencyCode (display), perPrinterPowerDrawW {printerId → watts}. All optional (FR-403).

### Entity: CostCalculation
**Bounded Context**: Print Jobs & Costing | **Type**: Entity (immutable snapshot)
id, jobId, calculatedAt, filamentCost, energyCost?, machineCost?, totalCost, incomplete flag, inputsSnapshot {per-spool unitCostPerG used, rates used, power draw used}. Never silently recalculated; explicit user action creates a new snapshot superseding the old (FR-404).

### Entity: UserAccount
**Bounded Context**: Identity & Access | **Type**: Aggregate Root (singleton)
id, username, passwordHash (argon2id/bcrypt per NFR-SE-01), createdAt, updatedAt + Session records (token, expiresAt, createdAt). First-run setup creates the single account (FR-001).

### Entity-Relationship Summary

```
Vendor 1─N FilamentProduct 1─N Spool 1─N SpoolLedgerEntry
Vendor 1─N PurchaseOrder 1─N PurchaseOrderLine 1─N GoodsReceiptLine N─1 GoodsReceipt N─1 PurchaseOrder
GoodsReceiptLine 1─N Spool (createdSpoolIds)
Printer 1─1 TelemetrySnapshot(latest); Printer 1─N AmsSlotMapping N─1 Spool
PrintJob 1─N FilamentUsage N─1 Spool (via attribution) ; FilamentUsage 1─1 SpoolLedgerEntry
PrintJob 1─1 CostCalculation (current) ; CloudLink 1─N Printer (logical)
```

---

## 5. Ubiquitous Language Glossary

| Term | Definition | Context |
|------|-----------|---------|
| Filament Product | Catalog-level definition of a purchasable filament (material+color+vendor+diameter+nominal weight) | Inventory, Procurement |
| Spool | One physical reel of filament; instance of a product with its own weight ledger and lifecycle | Inventory (book of record) |
| Remaining Weight | Net grams of filament left on a spool per the ledger (not AMS sensor readings) | Inventory |
| Ledger / Ledger Entry | Immutable append-only record of every weight change on a spool (consumption, adjustment, reversal) | Inventory |
| Tare Weight | Weight of the empty spool; enables gross-weighing recalibration | Inventory |
| Low-Stock Alert | Product-level flag raised when total remaining weight or usable spool count falls to/below its opt-in threshold | Inventory |
| Purchase Order (PO) | Vendor order of filament products with line items and expected arrival | Procurement |
| Inbound / "Filament on the Way" | POs in status ordered or partially_received | Procurement |
| Goods Reception / Goods Receipt | The act/record of booking delivered PO quantities into stock, creating spools | Procurement |
| Outstanding Quantity | Ordered minus received quantity on a PO line | Procurement |
| Over-delivery | Receiving more than outstanding; allowed with explicit confirmation flag | Procurement |
| Printer | A registered Bambu device identified by serial (dev_id) | Printer Integration |
| Telemetry Snapshot | Latest normalized status of a printer (state, progress, temps, AMS trays) | Printer Integration |
| AMS Slot | One tray position in an Automatic Material System unit (plus a virtual "external spool" slot) | Integration/Inventory |
| Slot Mapping | User-declared binding of an AMS slot to a specific spool; the attribution key for consumption | Inventory |
| Verify-Mapping Flag | Warning state when reported tray contents contradict the mapping | Inventory |
| Print Job | One physical print, merged from task sync, telemetry, or manual entry (unique per Bambu task ID) | Jobs & Costing |
| Consumption | Grams deducted from a spool for a job; actual (reported) or estimated (length-converted) | Jobs & Costing / Inventory |
| Unattributed Consumption | Job usage with no slot mapping at job time; assignable later | Jobs & Costing |
| Cost Snapshot | Immutable per-job cost calculation with the input rates/unit costs frozen | Jobs & Costing |
| Unit Cost | purchasePrice / initialNetWeightG of a spool (price per gram) | Jobs & Costing |
| Cloud Link | The single stored Bambu account connection (encrypted tokens + health state) | Printer Integration |
| Reauth Required | Integration state after token rejection; integration suspended, core app unaffected | Printer Integration |
| ACL (Anti-Corruption Layer) | The adapter module where all Bambu payloads are validated and translated; Bambu types never cross it | Printer Integration |

**Consistency notes**: "Spool" always means the physical reel (never the AMS tray — that is "slot"/"tray"). "Received" refers to goods reception, never MQTT message arrival ("ingested"/"reported" used for telemetry). "Job" and "Task" are distinguished: Task = Bambu's cloud record; Job = our merged internal record.

---

## 6. Domain Classification & Investment Guidance

| Context | Classification | Guidance for downstream phases |
|---------|---------------|-------------------------------|
| Filament Inventory | Core | Highest test rigor (ledger invariants, atomicity); design first |
| Procurement & Reception | Core | Transactional correctness of reception posting is the critical path |
| Print Jobs & Costing | Core | Idempotency and cost-snapshot immutability are the invariants to protect |
| Printer Integration | Supporting (ACL) | Contract tests with recorded fixtures; assume breakage; contain, degrade, recover |
| Identity & Access | Generic | Use boring, proven library components; minimal custom code |

## 7. Stakeholder Validation

Single-owner project: the context map and this model derive directly from the user's confirmed v1 scope (intake). Formal validation step: commander presents this domain model with the SRS at the gatekeeper review; user-facing open questions Q-01…Q-06 (SRS §10) are the outstanding validation items — none block Phase 2 planning, but Q-05 (cloud-mode prerequisite) must be answered before the implementation spike.
