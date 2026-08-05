---
type: deliverable
pipeline: design
phase: 3
skill: architect
name: API Contracts — GeekBOX Print Management
version: 2
status: revised
created: 2026-08-04T03:30:00Z
revised: 2026-08-04T22:30:00Z
---

# API CONTRACTS: GeekBOX Print Management
**Version**: 2.0 | **Authors**: architect (Phase 3, attempt 2) | **Date**: 2026-08-04

Three parts: **A** — OpenAPI 3.1 REST contract (62 operations across auth + all four functional areas + printer/AMS + integration + system). **B** — internal domain events (in-process bus). **C** — browser live-update channel (SSE) in AsyncAPI 3.0 style. The system exposes no public API in v1 (SRS §5.2); this contract is the internal UI↔backend API, session-authenticated per NFR-SE-06.

**Cross-cutting contract rules**
- **Auth**: every operation requires the session cookie except `POST /api/auth/setup`, `POST /api/auth/login`, `GET /api/health` (NFR-SE-06). 401 → RFC 7807 `problem+json`.
- **Errors**: RFC 7807 (`application/problem+json`) everywhere: `{type, title, status, detail, instance, code}` with domain codes (e.g., `PO_NOT_RECEIVABLE`, `IMPLAUSIBLE_WEIGHT`, `INTEGRATION_REAUTH_REQUIRED`).
- **Rate limits**: login throttled per FR-001 ES-001.1 (429 + `Retry-After` after 10 fails/15 min); no other limits (single user). Outbound Bambu polling limits are ACL-internal (A-05).
- **Versioning**: URL-stable v1 under `/api/`; breaking changes would introduce `/api/v2/` — not expected within scope.
- **Conventions**: UUID path ids; money in minor units (`*Minor`, integer); weights in grams (number); timestamps ISO 8601 in JSON (mapped from unix-ms storage); list endpoints support `?limit=&offset=` (default 50, max 500) plus documented filters; mutations return the full updated resource.
- **Response schemas (M2)**: every 200/201 body references a named component schema. Every listed property is **always present** in responses; nullability is expressed with JSON Schema type unions (`type: ["X", "null"]`). Each response schema's description cross-maps it to its `deliverable_data-model.md` table/section; per-field notes flag derived (computed) fields that have no stored column.
- **Currency**: `currencyCode` is display-only metadata; the stored default `'NOK'` is an **assumption pending Q-03** (Phase 4/user owner) and is editable at any time (see data-model §6).

---

## Part A — OpenAPI 3.1

```yaml
openapi: 3.1.0
info:
  title: GeekBOX Print Management API
  version: 1.0.0
  description: >-
    Internal session-authenticated REST API. Single user. Errors are RFC 7807.
    Bambu-facing traffic is NOT part of this contract (ACL-internal, ADR-006).
servers:
  - url: http://{host}:8080/api
    variables: { host: { default: localhost } }
security: [ { sessionCookie: [] } ]

tags:
  - { name: auth }
  - { name: vendors }
  - { name: products }
  - { name: spools }
  - { name: inventory }
  - { name: purchase-orders }
  - { name: receptions }
  - { name: integration }
  - { name: printers }
  - { name: jobs }
  - { name: settings }
  - { name: system }

paths:
  # ---------- auth (FR-001..003) ----------
  /auth/setup:
    post:
      tags: [auth]
      security: []
      operationId: firstRunSetup
      summary: One-time account creation (only while no account exists — AC-001.3)
      requestBody: { required: true, content: { application/json: { schema: { $ref: '#/components/schemas/Credentials' } } } }
      responses:
        '201':
          description: Account created, session started (Set-Cookie)
          content: { application/json: { schema: { $ref: '#/components/schemas/SessionInfo' } } }
        '409': { $ref: '#/components/responses/Problem' } # account already exists
  /auth/login:
    post:
      tags: [auth]
      security: []
      operationId: login
      requestBody: { required: true, content: { application/json: { schema: { $ref: '#/components/schemas/Credentials' } } } }
      responses:
        '204': { description: Session cookie set (AC-001.1) }
        '401': { description: Generic invalid-credentials problem (AC-001.2 — no username/password distinction) }
        '429': { description: Throttled (ES-001.1); Retry-After header }
  /auth/logout:
    post: { tags: [auth], operationId: logout, responses: { '204': { description: Session invalidated server-side (AC-002.1) } } }
  /auth/session:
    get:
      tags: [auth]
      operationId: getSession
      responses:
        '200':
          description: Current session
          content: { application/json: { schema: { $ref: '#/components/schemas/SessionInfo' } } }
        '401': { $ref: '#/components/responses/Problem' }
  /auth/password:
    put:
      tags: [auth]
      operationId: changePassword
      summary: Requires current password; invalidates all other sessions (FR-003)
      requestBody: { required: true, content: { application/json: { schema: { type: object, required: [currentPassword, newPassword], properties: { currentPassword: { type: string }, newPassword: { type: string, minLength: 8 } } } } } }
      responses: { '204': { description: Changed (AC-003.1) }, '403': { $ref: '#/components/responses/Problem' } }

  # ---------- vendors (FR-201) ----------
  /vendors:
    get:
      tags: [vendors]
      operationId: listVendors
      parameters: [ { $ref: '#/components/parameters/includeArchived' } ]
      responses:
        '200':
          description: Vendors
          content: { application/json: { schema: { type: array, items: { $ref: '#/components/schemas/Vendor' } } } }
    post:
      tags: [vendors]
      operationId: createVendor
      requestBody: { required: true, content: { application/json: { schema: { $ref: '#/components/schemas/VendorInput' } } } }
      responses:
        '201': { description: Created, content: { application/json: { schema: { $ref: '#/components/schemas/Vendor' } } } }
        '400': { $ref: '#/components/responses/Problem' }
  /vendors/{id}:
    get:
      tags: [vendors]
      operationId: getVendor
      responses:
        '200': { description: Vendor, content: { application/json: { schema: { $ref: '#/components/schemas/Vendor' } } } }
        '404': { $ref: '#/components/responses/Problem' }
    patch:
      tags: [vendors]
      operationId: updateVendor
      requestBody: { content: { application/json: { schema: { $ref: '#/components/schemas/VendorInput' } } } }
      responses:
        '200': { description: Updated, content: { application/json: { schema: { $ref: '#/components/schemas/Vendor' } } } }
  /vendors/{id}/archive:
    post:
      tags: [vendors]
      operationId: archiveVendor
      summary: Archive instead of delete when referenced (ES-201.1)
      responses:
        '200': { description: Archived vendor, content: { application/json: { schema: { $ref: '#/components/schemas/Vendor' } } } }

  # ---------- products (FR-101) ----------
  /products:
    get:
      tags: [products]
      operationId: listProducts
      parameters:
        - { name: material, in: query, schema: { $ref: '#/components/schemas/Material' } }
        - { name: vendorId, in: query, schema: { type: string, format: uuid } }
        - { $ref: '#/components/parameters/includeArchived' }
      responses:
        '200':
          description: Products
          content: { application/json: { schema: { type: array, items: { $ref: '#/components/schemas/FilamentProduct' } } } }
    post:
      tags: [products]
      operationId: createProduct
      requestBody: { required: true, content: { application/json: { schema: { $ref: '#/components/schemas/ProductInput' } } } }
      responses:
        '201': { description: Created, content: { application/json: { schema: { $ref: '#/components/schemas/FilamentProduct' } } } }
        '400': { description: Field-level validation problem (ES-101.1) }
  /products/{id}:
    get:
      tags: [products]
      operationId: getProduct
      responses:
        '200':
          description: Product + stock summary
          content: { application/json: { schema: { $ref: '#/components/schemas/ProductDetail' } } }
    patch:
      tags: [products]
      operationId: updateProduct
      summary: Historical spools/PO lines keep recorded prices (AC-101.2)
      requestBody: { content: { application/json: { schema: { $ref: '#/components/schemas/ProductInput' } } } }
      responses:
        '200': { description: Updated, content: { application/json: { schema: { $ref: '#/components/schemas/FilamentProduct' } } } }
  /products/{id}/archive:
    post:
      tags: [products]
      operationId: archiveProduct
      summary: Offered instead of hard delete when referenced (AC-101.3)
      responses:
        '200': { description: Archived product, content: { application/json: { schema: { $ref: '#/components/schemas/FilamentProduct' } } } }

  # ---------- spools (FR-102..104, FR-107) ----------
  /spools:
    get:
      tags: [spools]
      operationId: listSpools
      parameters:
        - { name: productId, in: query, schema: { type: string, format: uuid } }
        - { name: material, in: query, schema: { $ref: '#/components/schemas/Material' } }
        - { name: status, in: query, schema: { type: string, enum: [in_stock, in_use, depleted, archived] } }
        - { name: vendorId, in: query, schema: { type: string, format: uuid } }
      responses:
        '200':
          description: Spools incl. remaining %, valuation, location hint from mapping (FR-105)
          content: { application/json: { schema: { type: array, items: { $ref: '#/components/schemas/Spool' } } } }
    post:
      tags: [spools]
      operationId: registerSpool
      summary: Manual registration (AC-102.1); reception-sourced spools are created by postReception
      requestBody: { required: true, content: { application/json: { schema: { $ref: '#/components/schemas/SpoolInput' } } } }
      responses:
        '201': { description: Created, content: { application/json: { schema: { $ref: '#/components/schemas/Spool' } } } }
        '400': { description: Implausible weight (ES-102.1) }
  /spools/{id}:
    get:
      tags: [spools]
      operationId: getSpool
      responses:
        '200': { description: Spool detail incl. valuation, content: { application/json: { schema: { $ref: '#/components/schemas/Spool' } } } }
    patch:
      tags: [spools]
      operationId: updateSpool
      summary: Tare/price/notes only — weight changes go through adjust/ledger
      requestBody: { content: { application/json: { schema: { $ref: '#/components/schemas/SpoolPatch' } } } }
      responses:
        '200': { description: Updated, content: { application/json: { schema: { $ref: '#/components/schemas/Spool' } } } }
  /spools/{id}/ledger:
    get:
      tags: [spools]
      operationId: getSpoolLedger
      summary: Newest-first with running balance (AC-103.2)
      responses:
        '200':
          description: Ledger entries
          content: { application/json: { schema: { type: array, items: { $ref: '#/components/schemas/LedgerEntry' } } } }
  /spools/{id}/adjust:
    post:
      tags: [spools]
      operationId: adjustSpoolWeight
      summary: Recalibration (FR-104); gross entry subtracts tare (AC-104.1)
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              properties:
                grossWeightG: { type: number, description: Requires tare on spool; rejected if < tare (ES-104.1) }
                netWeightG: { type: number, description: Direct net entry (AC-104.2) }
                note: { type: string }
              oneOf: [ { required: [grossWeightG] }, { required: [netWeightG] } ]
      responses:
        '200': { description: Spool + created adjustment entry, content: { application/json: { schema: { $ref: '#/components/schemas/AdjustResult' } } } }
        '400': { $ref: '#/components/responses/Problem' }
  /spools/{id}/status:
    post:
      tags: [spools]
      operationId: transitionSpoolStatus
      summary: Lifecycle transitions (FR-107); archive-while-mapped = atomic unmap+archive after confirm (ES-107.1 per ADR-011)
      requestBody: { required: true, content: { application/json: { schema: { type: object, required: [status], properties: { status: { type: string, enum: [in_stock, in_use, depleted, archived] }, confirmUnmap: { type: boolean, default: false } } } } } }
      responses:
        '200': { description: Updated, content: { application/json: { schema: { $ref: '#/components/schemas/Spool' } } } }
        '409': { description: Mapped and confirmUnmap=false — confirmation required }

  # ---------- inventory views (FR-105/106/108) ----------
  /inventory/summary:
    get:
      tags: [inventory]
      operationId: getInventorySummary
      summary: Per-product aggregate — usable spool count, total remaining g, valuation w/ estimated flags (AC-105.1, FR-108)
      responses:
        '200':
          description: Per-product stock rows
          content: { application/json: { schema: { type: array, items: { $ref: '#/components/schemas/ProductStockRow' } } } }
        '500': { description: Error state with retry (ES-105.1) }
  /inventory/alerts:
    get:
      tags: [inventory]
      operationId: getLowStockAlerts
      summary: Active low-stock alerts incl. on-order qty + earliest ETA from open POs (AC-106.3)
      responses:
        '200':
          description: Active alerts
          content: { application/json: { schema: { type: array, items: { $ref: '#/components/schemas/LowStockAlert' } } } }

  # ---------- purchase orders & inbound (FR-202..204) ----------
  /purchase-orders:
    get:
      tags: [purchase-orders]
      operationId: listPurchaseOrders
      parameters: [ { name: status, in: query, schema: { type: string } } ]
      responses:
        '200':
          description: POs with lines and computed totals
          content: { application/json: { schema: { type: array, items: { $ref: '#/components/schemas/PurchaseOrder' } } } }
    post:
      tags: [purchase-orders]
      operationId: createPurchaseOrder
      requestBody: { required: true, content: { application/json: { schema: { $ref: '#/components/schemas/PurchaseOrderInput' } } } }
      responses:
        '201': { description: PO in draft (AC-202.1), content: { application/json: { schema: { $ref: '#/components/schemas/PurchaseOrder' } } } }
        '400': { description: Line validation (ES-202.2) }
  /purchase-orders/{id}:
    get:
      tags: [purchase-orders]
      operationId: getPurchaseOrder
      responses:
        '200':
          description: PO + lines + receipts + outstanding + status events
          content: { application/json: { schema: { $ref: '#/components/schemas/PurchaseOrderDetail' } } }
    patch:
      tags: [purchase-orders]
      operationId: updatePurchaseOrder
      summary: Draft = full edit; ordered = expectedArrival/notes only, lines locked (AC-202.3)
      requestBody: { content: { application/json: { schema: { $ref: '#/components/schemas/PurchaseOrderPatch' } } } }
      responses:
        '200': { description: Updated, content: { application/json: { schema: { $ref: '#/components/schemas/PurchaseOrder' } } } }
        '409': { description: Edit not allowed in current status }
  /purchase-orders/{id}/status:
    post:
      tags: [purchase-orders]
      operationId: transitionPoStatus
      summary: User transitions draft→ordered, draft/ordered→cancelled (FR-203); received states are derived, not settable
      requestBody: { required: true, content: { application/json: { schema: { type: object, required: [status], properties: { status: { type: string, enum: [ordered, cancelled] } } } } } }
      responses:
        '200': { description: PO + recorded status event, content: { application/json: { schema: { $ref: '#/components/schemas/PurchaseOrderDetail' } } } }
        '409': { description: 'Illegal transition (e.g., zero lines — ES-202.1)' }
  /inbound:
    get:
      tags: [purchase-orders]
      operationId: getInboundOverview
      summary: Ordered/partially_received POs sorted by ETA asc, overdue flagged, no-ETA last (FR-204)
      responses:
        '200':
          description: Inbound rows
          content: { application/json: { schema: { type: array, items: { $ref: '#/components/schemas/InboundRow' } } } }

  # ---------- receptions (FR-205..207) ----------
  /purchase-orders/{id}/receptions:
    get:
      tags: [receptions]
      operationId: listReceptions
      responses:
        '200':
          description: Receipts for this PO
          content: { application/json: { schema: { type: array, items: { $ref: '#/components/schemas/GoodsReceipt' } } } }
    post:
      tags: [receptions]
      operationId: postReception
      summary: Atomic posting — receipt + spools + PO status + alert re-eval in one transaction (FR-205, ES-205.2)
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [lines]
              properties:
                notes: { type: string }
                lines:
                  type: array
                  minItems: 1
                  items:
                    type: object
                    required: [poLineId, quantityReceived]
                    properties:
                      poLineId: { type: string, format: uuid }
                      quantityReceived: { type: integer, minimum: 1 }
                      quantityDamaged: { type: integer, minimum: 0, description: Damaged spools created archived with note (FR-207); > received rejected (ES-207.1) }
                      actualUnitPriceMinor: { type: integer, minimum: 0 }
                      confirmOverDelivery: { type: boolean, default: false, description: Must be true when received > outstanding (ES-205.1) }
                      discrepancyNote: { type: string }
      responses:
        '201':
          description: Receipt + created spool ids + updated PO status (AC-205.1/2)
          content: { application/json: { schema: { $ref: '#/components/schemas/ReceptionResult' } } }
        '409': { description: PO not receivable — draft/received/cancelled (ES-203.1) }
        '422': { description: Over-delivery unconfirmed / damaged > received }
  /goods-receipts/{id}:
    get:
      tags: [receptions]
      operationId: getGoodsReceipt
      responses:
        '200':
          description: Receipt + lines + created spools
          content: { application/json: { schema: { $ref: '#/components/schemas/GoodsReceiptDetail' } } }

  # ---------- integration (FR-301, FR-306, FR-307; ADR-012) ----------
  /integration/status:
    get:
      tags: [integration]
      operationId: getIntegrationStatus
      summary: Health panel — link state, token age, REST/MQTT health, last message, next retry, drift counter (FR-306)
      responses:
        '200': { description: Status, content: { application/json: { schema: { $ref: '#/components/schemas/IntegrationStatus' } } } }
  /integration/link:
    post:
      tags: [integration]
      operationId: linkBambuAccount
      summary: Email+password exchange; may return a verification-code challenge (FR-301, Q-06 provision)
      requestBody: { required: true, content: { application/json: { schema: { type: object, required: [email, password], properties: { email: { type: string, format: email }, password: { type: string } } } } } }
      responses:
        '200':
          description: Linked — token stored encrypted (AC-301.1)
          content: { application/json: { schema: { $ref: '#/components/schemas/IntegrationStatus' } } }
        '202':
          description: Code challenge — submit via /link/verify (AC-301.2)
          content: { application/json: { schema: { $ref: '#/components/schemas/LinkChallenge' } } }
        '502': { description: Sanitized upstream failure; raw logged; no partial token state (ES-301.1/301.2) }
    delete:
      tags: [integration]
      operationId: unlinkBambuAccount
      summary: Deletes stored tokens; stops MQTT/REST (AC-301.3)
      responses: { '204': { description: Unlinked } }
  /integration/link/verify:
    post:
      tags: [integration]
      operationId: verifyLinkCode
      requestBody: { required: true, content: { application/json: { schema: { type: object, required: [challengeId, code], properties: { challengeId: { type: string }, code: { type: string } } } } } }
      responses:
        '200': { description: Linked, content: { application/json: { schema: { $ref: '#/components/schemas/IntegrationStatus' } } } }
        '400': { $ref: '#/components/responses/Problem' }
  /integration/link/manual-token:
    post:
      tags: [integration]
      operationId: linkWithManualToken
      summary: A-01 fallback (ADR-012/Q-06) — user supplies uid + access token directly
      requestBody: { required: true, content: { application/json: { schema: { type: object, required: [bambuUid, accessToken], properties: { bambuUid: { type: string }, accessToken: { type: string, writeOnly: true }, refreshToken: { type: string, writeOnly: true } } } } } }
      responses:
        '200': { description: Linked (authMode=manual_token), content: { application/json: { schema: { $ref: '#/components/schemas/IntegrationStatus' } } } }
  /integration/settings:
    get:
      tags: [integration]
      operationId: getIntegrationSettings
      responses:
        '200': { description: Settings, content: { application/json: { schema: { $ref: '#/components/schemas/IntegrationSettings' } } } }
    patch:
      tags: [integration]
      operationId: updateIntegrationSettings
      summary: Kill switch + region config (ADR-012/Q-01/Q-05); listener reconnects on change
      requestBody: { content: { application/json: { schema: { type: object, properties: { enabled: { type: boolean }, mqttRegion: { type: string, description: us|eu|cn or full custom hostname }, taskSyncIntervalMin: { type: integer, minimum: 30 } } } } } }
      responses:
        '200': { description: Updated settings, content: { application/json: { schema: { $ref: '#/components/schemas/IntegrationSettings' } } } }

  # ---------- printers & AMS (FR-302, FR-304, FR-305 amended) ----------
  /printers:
    get:
      tags: [printers]
      operationId: listPrinters
      responses:
        '200':
          description: Printers incl. tracked, online, lastSeen
          content: { application/json: { schema: { type: array, items: { $ref: '#/components/schemas/Printer' } } } }
    post:
      tags: [printers]
      operationId: registerPrinterManually
      summary: Permanent manual-serial fallback (ADR-012/Q-02, A-02)
      requestBody: { required: true, content: { application/json: { schema: { type: object, required: [serial, name], properties: { serial: { type: string }, name: { type: string }, model: { type: string } } } } } }
      responses:
        '201': { description: Printer (registration=manual), content: { application/json: { schema: { $ref: '#/components/schemas/Printer' } } } }
        '409': { description: Serial exists }
  /printers/refresh:
    post:
      tags: [printers]
      operationId: refreshPrinters
      summary: Discovery via bind endpoint; upserts by serial (FR-302, AC-302.2)
      responses:
        '200':
          description: Updated printer list
          content: { application/json: { schema: { type: array, items: { $ref: '#/components/schemas/Printer' } } } }
        '502': { description: Sanitized upstream failure problem; an upstream 401 additionally triggers the token-expiry/reauth flow (ES-302.1) }
  /printers/{id}:
    patch:
      tags: [printers]
      operationId: updatePrinter
      summary: tracked flag / rename
      requestBody: { content: { application/json: { schema: { type: object, properties: { tracked: { type: boolean }, name: { type: string } } } } } }
      responses:
        '200': { description: Updated, content: { application/json: { schema: { $ref: '#/components/schemas/Printer' } } } }
  /printers/{id}/telemetry:
    get:
      tags: [printers]
      operationId: getTelemetrySnapshot
      summary: Latest normalized snapshot + capturedAt for staleness (FR-304; SSE fallback poll target per ADR-005)
      responses:
        '200': { description: Snapshot, content: { application/json: { schema: { $ref: '#/components/schemas/TelemetrySnapshot' } } } }
        '404': { description: No snapshot yet }
  /printers/{id}/slots:
    get:
      tags: [printers]
      operationId: listSlots
      summary: AMS units/slots + virtual external holder 254:0 (ADR-011), each with tray observation, mapping, verify flag, live spool data (AC-305.2, AC-305.4)
      responses:
        '200':
          description: Slot views
          content: { application/json: { schema: { type: array, items: { $ref: '#/components/schemas/SlotView' } } } }
  /printers/{id}/slots/{slotRef}/mapping:
    put:
      tags: [printers]
      operationId: mapSlot
      summary: Bind slot (or external holder) to a spool; sets spool in_use (AC-107.1); picker suggestions are a UI concern over listSpools
      parameters:
        - name: slotRef
          in: path
          required: true
          schema:
            type: string
            pattern: '^([0-3]|254):[0-3]$'
            description: 'unitIndex 0–3 (AMS) or 254 (external holder); slotIndex 0–3. When unitIndex=254 only slotIndex 0 exists — the server is authoritative and rejects 254:1..254:3 with 400 (ADR-011, data-model §3 CHECK).'
      requestBody: { required: true, content: { application/json: { schema: { type: object, required: [spoolId], properties: { spoolId: { type: string, format: uuid } } } } } }
      responses:
        '200': { description: Updated slot, content: { application/json: { schema: { $ref: '#/components/schemas/SlotView' } } } }
        '409': { description: Spool depleted/archived or already mapped elsewhere }
    delete:
      tags: [printers]
      operationId: unmapSlot
      summary: Unmap; spool returns to in_stock unless depleted
      responses: { '204': { description: Unmapped } }
  /printers/{id}/slots/{slotRef}/mapping/confirm:
    post:
      tags: [printers]
      operationId: confirmMapping
      summary: Clear verify-mapping flag after user review (AC-305.3)
      responses:
        '200': { description: Updated slot, content: { application/json: { schema: { $ref: '#/components/schemas/SlotView' } } } }

  # ---------- jobs & costing (FR-308, FR-401..406) ----------
  /jobs:
    get:
      tags: [jobs]
      operationId: listJobs
      summary: History with filters + summary block (count, success rate, total g, total cost, incomplete-cost count — FR-406)
      parameters:
        - { name: printerId, in: query, schema: { type: string, format: uuid } }
        - { name: outcome, in: query, schema: { type: string } }
        - { name: from, in: query, schema: { type: string, format: date } }
        - { name: to, in: query, schema: { type: string, format: date } }
        - { name: sort, in: query, schema: { type: string, enum: [date, cost], default: date } }
      responses:
        '200':
          description: Filtered jobs + aggregate summary
          content: { application/json: { schema: { $ref: '#/components/schemas/JobListResponse' } } }
    post:
      tags: [jobs]
      operationId: createManualJob
      summary: Manual job entry (FR-405); posts ledger entries via the single write path (ADR-009)
      requestBody: { required: true, content: { application/json: { schema: { $ref: '#/components/schemas/ManualJobInput' } } } }
      responses:
        '201': { description: Job + cost snapshot (AC-405.1), content: { application/json: { schema: { $ref: '#/components/schemas/PrintJobDetail' } } } }
  /jobs/{id}:
    get:
      tags: [jobs]
      operationId: getJob
      responses:
        '200':
          description: Job + usages + ledger links + cost breakdown
          content: { application/json: { schema: { $ref: '#/components/schemas/PrintJobDetail' } } }
    patch:
      tags: [jobs]
      operationId: correctJob
      summary: Corrections reverse-and-repost, never mutate ledger (AC-405.2, ADR-009 §1); archived-spool refs need confirm flag (ES-405.1)
      requestBody: { required: true, content: { application/json: { schema: { $ref: '#/components/schemas/JobCorrection' } } } }
      responses:
        '200': { description: Job recosted, content: { application/json: { schema: { $ref: '#/components/schemas/PrintJobDetail' } } } }
  /jobs/sync:
    post:
      tags: [jobs]
      operationId: syncTaskHistory
      summary: On-demand task sync; idempotent upsert by bambuTaskId (FR-308, AC-308.2)
      responses:
        '200': { description: Sync result, content: { application/json: { schema: { $ref: '#/components/schemas/SyncResult' } } } }
        '502': { description: Upstream unavailable/drift — surfaced on status panel, retried next cycle (ES-308.1) }
  /jobs/{id}/usages/{usageId}/attribute:
    post:
      tags: [jobs]
      operationId: attributeUsage
      summary: Assign unattributed usage to a spool — posts deduction under the (job, slotRef) guard (ES-402.2)
      requestBody: { required: true, content: { application/json: { schema: { type: object, required: [spoolId], properties: { spoolId: { type: string, format: uuid } } } } } }
      responses:
        '200': { description: Usage + posted entry, content: { application/json: { schema: { $ref: '#/components/schemas/AttributeResult' } } } }
        '409': { description: Already attributed (idempotency guard) }
  /jobs/{id}/recalculate:
    post:
      tags: [jobs]
      operationId: recalculateJobCost
      summary: Explicit re-cost with current rates; new snapshot supersedes (AC-404.2)
      responses:
        '200': { description: New cost snapshot, content: { application/json: { schema: { $ref: '#/components/schemas/CostBreakdown' } } } }
  /jobs/export.csv:
    get:
      tags: [jobs]
      operationId: exportJobsCsv
      summary: CSV of the filtered set, one row per job, displayed columns (AC-406.2)
      parameters:
        - { name: printerId, in: query, schema: { type: string, format: uuid } }
        - { name: outcome, in: query, schema: { type: string } }
        - { name: from, in: query, schema: { type: string, format: date } }
        - { name: to, in: query, schema: { type: string, format: date } }
        - { name: sort, in: query, schema: { type: string, enum: [date, cost], default: date } }
      responses:
        '200': { description: CSV attachment, content: { text/csv: { schema: { type: string } } } }

  # ---------- settings & system ----------
  /settings/cost-rates:
    get:
      tags: [settings]
      operationId: getCostRates
      responses:
        '200': { description: Rates + per-printer power draw, content: { application/json: { schema: { $ref: '#/components/schemas/CostRateSettings' } } } }
    put:
      tags: [settings]
      operationId: updateCostRates
      requestBody: { required: true, content: { application/json: { schema: { $ref: '#/components/schemas/CostRatesInput' } } } }
      responses:
        '200': { description: Updated, content: { application/json: { schema: { $ref: '#/components/schemas/CostRateSettings' } } } }
        '400': { description: Negative rate rejected (ES-403.1) }
  /backup:
    get:
      tags: [system]
      operationId: downloadBackup
      summary: Consistent single-file backup via VACUUM INTO (NFR-RE-04); marked sensitive (RISK-009)
      responses:
        '200': { description: SQLite backup file, content: { application/octet-stream: { schema: { type: string, format: binary } } } }
  /events:
    get:
      tags: [system]
      operationId: eventStream
      summary: SSE live-update channel (ADR-005) — see Part C for event catalog
      responses:
        '200': { description: text/event-stream }
  /health:
    get:
      tags: [system]
      security: []
      operationId: health
      summary: Liveness + component detail (DB writable, listener state, last MQTT age) — Docker healthcheck target (ADR-013)
      responses:
        '200': { description: Health, content: { application/json: { schema: { $ref: '#/components/schemas/HealthStatus' } } } }

components:
  securitySchemes:
    sessionCookie: { type: apiKey, in: cookie, name: gbx_session }
  parameters:
    includeArchived: { name: includeArchived, in: query, schema: { type: boolean, default: false } }
  responses:
    Problem:
      description: RFC 7807 problem
      content:
        application/problem+json:
          schema:
            type: object
            required: [title, status]
            properties:
              type: { type: string, format: uri, default: 'about:blank' }
              title: { type: string }
              status: { type: integer }
              detail: { type: string }
              instance: { type: string }
              code: { type: string, description: Stable domain error code }
  schemas:
    # ===== shared / inputs (11) =====
    Material: { type: string, enum: [PLA, PETG, ABS, TPU, ASA, PC, PA, SUPPORT, OTHER] }
    Credentials:
      type: object
      required: [username, password]
      properties: { username: { type: string, minLength: 1 }, password: { type: string, minLength: 8 } }
    VendorInput:
      type: object
      required: [name]
      properties: { name: { type: string }, url: { type: string, format: uri }, leadTimeDays: { type: integer, minimum: 0 }, notes: { type: string } }
    ProductInput:
      type: object
      required: [material, colorName, vendorId, diameterMm, nominalNetWeightG]
      properties:
        material: { $ref: '#/components/schemas/Material' }
        colorName: { type: string }
        colorHex: { type: string, pattern: '^#[0-9A-Fa-f]{6}$' }
        vendorId: { type: string, format: uuid }
        diameterMm: { type: number, enum: [1.75, 2.85], default: 1.75 }
        nominalNetWeightG: { type: integer, exclusiveMinimum: 0 }
        defaultPriceMinor: { type: integer, minimum: 0 }
        densityGCm3: { type: number, exclusiveMinimum: 0, description: Defaults per material if omitted }
        lowStockThresholdG: { type: integer, minimum: 0 }
        lowStockMinSpools: { type: integer, minimum: 0 }
        sku: { type: string }
        notes: { type: string }
    SpoolInput:
      type: object
      required: [productId, initialNetWeightG]
      properties:
        productId: { type: string, format: uuid }
        initialNetWeightG: { type: integer, exclusiveMinimum: 0, maximum: 20000 }
        tareWeightG: { type: integer, minimum: 0 }
        purchasePriceMinor: { type: integer, minimum: 0 }
        acquiredAt: { type: string, format: date }
        notes: { type: string }
    SpoolPatch:
      type: object
      properties: { tareWeightG: { type: integer, minimum: 0 }, purchasePriceMinor: { type: integer, minimum: 0 }, notes: { type: string } }
    PurchaseOrderInput:
      type: object
      required: [vendorId, orderDate, lines]
      properties:
        vendorId: { type: string, format: uuid }
        orderDate: { type: string, format: date }
        expectedArrival: { type: string, format: date }
        externalRef: { type: string }
        shippingCostMinor: { type: integer, minimum: 0 }
        notes: { type: string }
        lines:
          type: array
          minItems: 1
          items:
            type: object
            required: [productId, quantityOrdered, unitPriceMinor]
            properties:
              productId: { type: string, format: uuid }
              quantityOrdered: { type: integer, minimum: 1 }
              unitPriceMinor: { type: integer, minimum: 0 }
              expectedWeightOverrideG: { type: integer, exclusiveMinimum: 0 }
    PurchaseOrderPatch:
      type: object
      description: Server enforces status-dependent editability (AC-202.3)
      properties: { expectedArrival: { type: string, format: date }, notes: { type: string }, lines: { type: array, items: {} } }
    ManualJobInput:
      type: object
      required: [jobName, outcome]
      properties:
        printerId: { type: string, format: uuid }
        jobName: { type: string }
        startedAt: { type: string, format: date-time }
        endedAt: { type: string, format: date-time }
        durationMin: { type: number, minimum: 0 }
        outcome: { type: string, enum: [success, failed, cancelled, unknown] }
        usages:
          type: array
          items:
            type: object
            required: [usedG]
            properties: { spoolId: { type: string, format: uuid }, usedG: { type: number, exclusiveMinimum: 0 } }
    JobCorrection:
      type: object
      properties:
        durationMin: { type: number, minimum: 0 }
        outcome: { type: string, enum: [success, failed, cancelled, unknown] }
        usages: { type: array, items: { type: object, properties: { usageId: { type: string }, spoolId: { type: string }, usedG: { type: number }, confirmArchivedSpool: { type: boolean } } } }
    CostRatesInput:
      type: object
      properties:
        energyPricePerKwhMinor: { type: integer, minimum: 0 }
        machineRatePerHourMinor: { type: integer, minimum: 0 }
        currencyCode: { type: string, minLength: 3, maxLength: 3 }
        printerPowerDraw: { type: array, items: { type: object, required: [printerId, watts], properties: { printerId: { type: string, format: uuid }, watts: { type: number, exclusiveMinimum: 0 } } } }

    # ===== response / view schemas (M2) =====
    # Convention: every property listed is always present; nullable columns and
    # conditionally-absent values surface as type ["X", "null"], never as omitted keys.
    SessionInfo:
      type: object
      description: 'Session view (session table §2): username joined from user_account; expiresAt = session.expires_at'
      properties:
        username: { type: string }
        expiresAt: { type: string, format: date-time }
    Vendor:
      type: object
      description: 'Maps 1:1 to vendor (data-model §3)'
      properties:
        id: { type: string, format: uuid }
        name: { type: string }
        url: { type: ["string", "null"] }
        notes: { type: ["string", "null"] }
        leadTimeDays: { type: ["integer", "null"], description: vendor.lead_time_days }
        archived: { type: boolean }
    FilamentProduct:
      type: object
      description: 'Maps 1:1 to filament_product (data-model §3); vendorName joined for display'
      properties:
        id: { type: string, format: uuid }
        material: { $ref: '#/components/schemas/Material' }
        colorName: { type: string }
        colorHex: { type: ["string", "null"] }
        vendorId: { type: string, format: uuid }
        vendorName: { type: string, description: 'Derived: joined from vendor.name' }
        diameterMm: { type: number }
        nominalNetWeightG: { type: integer }
        defaultPriceMinor: { type: integer }
        densityGCm3: { type: number }
        lowStockThresholdG: { type: ["integer", "null"] }
        lowStockMinSpools: { type: ["integer", "null"] }
        sku: { type: ["string", "null"] }
        notes: { type: ["string", "null"] }
        archived: { type: boolean }
    ProductDetail:
      description: 'getProduct response: product + its aggregate stock row (FR-105/108)'
      allOf:
        - { $ref: '#/components/schemas/FilamentProduct' }
        - type: object
          properties:
            stock: { $ref: '#/components/schemas/ProductStockRow' }
    Spool:
      type: object
      description: 'Maps 1:1 to spool (data-model §3) + derived view fields flagged per-property'
      properties:
        id: { type: string, format: uuid }
        label: { type: string, description: 'spool.label — printable S-{seq} (AC-102.1)' }
        productId: { type: string, format: uuid }
        product:
          type: object
          description: 'Derived: denormalized join of filament_product + vendor for list rendering'
          properties:
            material: { $ref: '#/components/schemas/Material' }
            colorName: { type: string }
            colorHex: { type: ["string", "null"] }
            vendorId: { type: string, format: uuid }
            vendorName: { type: string }
            diameterMm: { type: number }
        initialNetWeightG: { type: integer, description: spool.initial_net_weight_g }
        remainingNetWeightG: { type: number, description: spool.remaining_net_weight_g — denormalized last ledger balance (ADR-009 §1) }
        remainingPct: { type: number, description: 'Derived: remainingNetWeightG / initialNetWeightG × 100 (FR-105)' }
        tareWeightG: { type: ["integer", "null"], description: spool.tare_weight_g (FR-104) }
        purchasePriceMinor: { type: ["integer", "null"], description: spool.purchase_price_minor; null ⇒ product default used for valuation }
        valuationMinor: { type: integer, description: 'Derived (FR-108): remaining-weight share of acquisition price' }
        valuationEstimated: { type: boolean, description: 'Derived: true when valued via product default price (ES-108.1)' }
        source: { type: string, enum: [goods_reception, manual] }
        goodsReceiptLineId: { type: ["string", "null"], description: spool.goods_receipt_line_id — reception traceability (AC-205.2) }
        status: { type: string, enum: [in_stock, in_use, depleted, archived] }
        mappedTo:
          type: ["object", "null"]
          description: 'Derived: location hint from ams_slot_mapping (FR-105); null when unmapped'
          properties:
            printerId: { type: string, format: uuid }
            printerName: { type: string }
            slotRef: { type: string, description: '"{unit}:{slot}"; external holder = "254:0" (ADR-011)' }
        acquiredAt: { type: string, format: date-time }
        notes: { type: ["string", "null"] }
    SpoolSummary:
      type: object
      description: 'Compact spool projection embedded in SlotView (spool + filament_product join)'
      properties:
        id: { type: string, format: uuid }
        label: { type: string }
        material: { $ref: '#/components/schemas/Material' }
        colorName: { type: string }
        colorHex: { type: ["string", "null"] }
        remainingNetWeightG: { type: number }
        remainingPct: { type: number }
        status: { type: string, enum: [in_stock, in_use, depleted, archived] }
    LedgerEntry:
      type: object
      description: 'Maps 1:1 to spool_ledger_entry (data-model §3, immutable append-only)'
      properties:
        id: { type: string, format: uuid }
        spoolId: { type: string, format: uuid }
        type: { type: string, enum: [initial, consumption, manual_adjustment, reversal] }
        deltaG: { type: number, description: spool_ledger_entry.delta_g — negative = deduction }
        balanceAfterG: { type: number }
        jobId: { type: ["string", "null"] }
        slotRef: { type: ["string", "null"], description: '"{unit}:{slot}", external = "254:0"' }
        reversesEntryId: { type: ["string", "null"], description: spool_ledger_entry.reverses_entry_id — set iff type=reversal; supersession link (ADR-009 §1) }
        estimated: { type: boolean }
        overConsumption: { type: boolean, description: spool_ledger_entry.over_consumption (AC-103.3) }
        note: { type: ["string", "null"] }
        createdAt: { type: string, format: date-time }
    AdjustResult:
      type: object
      description: adjustSpoolWeight response (FR-104)
      properties:
        spool: { $ref: '#/components/schemas/Spool' }
        entry: { $ref: '#/components/schemas/LedgerEntry' }
    PurchaseOrderLine:
      type: object
      description: 'Maps to purchase_order_line (data-model §4) + derived reception progress'
      properties:
        id: { type: string, format: uuid }
        productId: { type: string, format: uuid }
        product:
          type: object
          description: 'Derived: product display join'
          properties:
            material: { $ref: '#/components/schemas/Material' }
            colorName: { type: string }
            colorHex: { type: ["string", "null"] }
        quantityOrdered: { type: integer }
        unitPriceMinor: { type: integer }
        expectedWeightOverrideG: { type: ["integer", "null"] }
        quantityReceived: { type: integer, description: 'Derived: SUM(goods_receipt_line.quantity_received) — never stored (data-model §4)' }
        quantityOutstanding: { type: integer, description: 'Derived: max(0, quantityOrdered − quantityReceived)' }
    PoStatusEvent:
      type: object
      description: 'Maps 1:1 to po_status_event (data-model §4, FR-203)'
      properties:
        id: { type: string, format: uuid }
        fromStatus: { type: string }
        toStatus: { type: string }
        occurredAt: { type: string, format: date-time }
    PurchaseOrder:
      type: object
      description: 'Maps to purchase_order (data-model §4) + lines + computed totals'
      properties:
        id: { type: string, format: uuid }
        vendorId: { type: string, format: uuid }
        vendorName: { type: string, description: 'Derived: vendor.name join' }
        status: { type: string, enum: [draft, ordered, partially_received, received, cancelled] }
        orderDate: { type: string, format: date }
        expectedArrival: { type: ["string", "null"], format: date, description: purchase_order.expected_arrival; null = no ETA (ES-204.1) }
        externalRef: { type: ["string", "null"] }
        notes: { type: ["string", "null"] }
        shippingCostMinor: { type: ["integer", "null"] }
        lines: { type: array, items: { $ref: '#/components/schemas/PurchaseOrderLine' } }
        totals:
          type: object
          description: 'Derived aggregates over lines'
          properties:
            quantityOrdered: { type: integer }
            quantityReceived: { type: integer }
            goodsValueMinor: { type: integer, description: Σ quantityOrdered × unitPriceMinor }
        createdAt: { type: string, format: date-time }
        updatedAt: { type: string, format: date-time }
    PurchaseOrderDetail:
      description: 'getPurchaseOrder / transitionPoStatus response: PO + status history + receipts'
      allOf:
        - { $ref: '#/components/schemas/PurchaseOrder' }
        - type: object
          properties:
            statusEvents: { type: array, items: { $ref: '#/components/schemas/PoStatusEvent' } }
            receipts: { type: array, items: { $ref: '#/components/schemas/GoodsReceipt' } }
    InboundRow:
      type: object
      description: 'Derived view over purchase_order + lines (FR-204); no dedicated table — computed per request. Sorted ETA asc, no-ETA last (ES-204.1)'
      properties:
        purchaseOrderId: { type: string, format: uuid }
        vendorId: { type: string, format: uuid }
        vendorName: { type: string }
        status: { type: string, enum: [ordered, partially_received] }
        expectedArrival: { type: ["string", "null"], format: date }
        daysUntil: { type: ["integer", "null"], description: 'Derived: days from today to ETA; negative when overdue; null when no ETA' }
        overdue: { type: boolean, description: 'Derived: ETA in the past and not fully received' }
        outstandingLines:
          type: array
          items:
            type: object
            properties:
              poLineId: { type: string, format: uuid }
              productId: { type: string, format: uuid }
              material: { $ref: '#/components/schemas/Material' }
              colorName: { type: string }
              quantityOutstanding: { type: integer }
        totalOutstandingQty: { type: integer }
        outstandingValueMinor: { type: integer, description: 'Derived: Σ quantityOutstanding × unitPriceMinor' }
    GoodsReceiptLine:
      type: object
      description: 'Maps 1:1 to goods_receipt_line (data-model §4)'
      properties:
        id: { type: string, format: uuid }
        poLineId: { type: string, format: uuid }
        quantityReceived: { type: integer }
        quantityDamaged: { type: integer, description: goods_receipt_line.quantity_damaged (ES-207.1) }
        actualUnitPriceMinor: { type: ["integer", "null"], description: overrides PO line price for created spools }
        overDelivery: { type: boolean, description: confirmed over-delivery flag (ES-205.1) }
        discrepancyNote: { type: ["string", "null"] }
    GoodsReceipt:
      type: object
      description: 'Maps to goods_receipt + its lines (data-model §4)'
      properties:
        id: { type: string, format: uuid }
        purchaseOrderId: { type: string, format: uuid }
        receivedAt: { type: string, format: date-time }
        notes: { type: ["string", "null"] }
        lines: { type: array, items: { $ref: '#/components/schemas/GoodsReceiptLine' } }
    GoodsReceiptDetail:
      description: 'getGoodsReceipt response: receipt + spools created by it (spool.goods_receipt_line_id backlink)'
      allOf:
        - { $ref: '#/components/schemas/GoodsReceipt' }
        - type: object
          properties:
            createdSpools: { type: array, items: { $ref: '#/components/schemas/Spool' } }
    ReceptionResult:
      type: object
      description: 'postReception 201 body (AC-205.1/2) — outcome of the atomic reception transaction (data-model §4)'
      properties:
        receipt: { $ref: '#/components/schemas/GoodsReceipt' }
        createdSpoolIds: { type: array, items: { type: string, format: uuid } }
        purchaseOrderStatus: { type: string, enum: [ordered, partially_received, received], description: 'PO status as recomputed inside the transaction (FR-203)' }
    ProductStockRow:
      type: object
      description: 'Derived per-product aggregate (FR-105/108, AC-105.1) over spool rows; no stored table'
      properties:
        productId: { type: string, format: uuid }
        material: { $ref: '#/components/schemas/Material' }
        colorName: { type: string }
        colorHex: { type: ["string", "null"] }
        vendorId: { type: string, format: uuid }
        vendorName: { type: string }
        usableSpools: { type: integer, description: 'Derived: COUNT(spool WHERE status IN (in_stock, in_use))' }
        totalRemainingG: { type: number, description: 'Derived: Σ spool.remaining_net_weight_g over usable spools' }
        valuationMinor: { type: integer, description: 'Derived: Σ per-spool valuation (FR-108)' }
        valuationEstimated: { type: boolean, description: 'true when ANY contributing spool is default-priced (ES-108.1)' }
        lowStockActive: { type: boolean, description: 'Derived: threshold breach per FR-106 (see LowStockAlert)' }
    LowStockAlert:
      type: object
      description: 'Derived alert view (FR-106, AC-106.3): filament_product thresholds vs live stock + open-PO lookahead'
      properties:
        productId: { type: string, format: uuid }
        material: { $ref: '#/components/schemas/Material' }
        colorName: { type: string }
        thresholdG: { type: ["integer", "null"], description: filament_product.low_stock_threshold_g (opt-in) }
        minSpools: { type: ["integer", "null"], description: filament_product.low_stock_min_spools }
        currentRemainingG: { type: number }
        currentUsableSpools: { type: integer }
        onOrderQty: { type: integer, description: 'Derived: outstanding qty on ordered/partially_received POs for this product' }
        earliestEta: { type: ["string", "null"], format: date, description: 'Derived: MIN(expected_arrival) over those POs; null when none has an ETA' }
        activeSince: { type: string, format: date-time, description: 'When the threshold was crossed (LowStockThresholdCrossed event time)' }
    IntegrationStatus:
      type: object
      description: 'FR-306 health panel view over cloud_link (data-model §5) + supervisor runtime state (ADR-004/006)'
      properties:
        state: { type: string, enum: [unlinked, linked, reauth_required], description: cloud_link.state }
        enabled: { type: boolean, description: cloud_link.integration_enabled — permanent kill switch (ADR-012/Q-05) }
        authMode: { type: string, enum: [password, manual_token], description: cloud_link.auth_mode }
        bambuUid: { type: ["string", "null"], description: cloud_link.bambu_uid }
        mqttRegion: { type: string, description: cloud_link.mqtt_region — us|eu|cn or custom hostname (ADR-012/Q-01) }
        linkedAt: { type: ["string", "null"], format: date-time }
        tokenIssuedAt: { type: ["string", "null"], format: date-time, description: cloud_link.token_issued_at — token age derives from this }
        rest:
          type: object
          properties:
            lastSuccessAt: { type: ["string", "null"], format: date-time, description: cloud_link.last_rest_success_at }
            lastErrorClass: { type: ["string", "null"], description: cloud_link.last_error_class }
        mqtt:
          type: object
          properties:
            listenerState: { type: string, enum: [running, degraded, stopped, disabled], description: 'Supervisor runtime state (ADR-004); not persisted' }
            connectedSince: { type: ["string", "null"], format: date-time, description: cloud_link.mqtt_connected_since }
            lastMessageAt: { type: ["string", "null"], format: date-time, description: cloud_link.last_mqtt_message_at }
            nextRetryAt: { type: ["string", "null"], format: date-time, description: 'Supervisor backoff schedule (FR-306); null when connected/stopped' }
        driftCounter: { type: integer, description: 'ACL payload-parse-failure counter since start (ADR-006, ES-301.2); not persisted' }
    LinkChallenge:
      type: object
      description: linkBambuAccount 202 body (AC-301.2)
      properties:
        state: { type: string, const: code_required }
        challengeId: { type: string }
    IntegrationSettings:
      type: object
      description: 'Settings view over cloud_link config columns (data-model §5)'
      properties:
        enabled: { type: boolean }
        mqttRegion: { type: string }
        taskSyncIntervalMin: { type: integer }
    Printer:
      type: object
      description: 'Maps 1:1 to printer (data-model §5)'
      properties:
        id: { type: string, format: uuid }
        serial: { type: string, description: printer.serial (dev_id) }
        name: { type: string }
        model: { type: ["string", "null"], description: null for manual registrations lacking it (ADR-012/Q-02) }
        registration: { type: string, enum: [discovered, manual] }
        tracked: { type: boolean }
        online: { type: boolean, description: printer.online_flag }
        lastSeenAt: { type: ["string", "null"], format: date-time }
    TrayObservation:
      type: object
      description: 'Normalized tray observation (from telemetry_snapshot.ams_json slots — ADR-006 internal shape, never raw Bambu fields)'
      properties:
        trayType: { type: ["string", "null"] }
        trayColorHex: { type: ["string", "null"] }
        remainingPct: { type: ["number", "null"] }
    AmsUnit:
      type: object
      description: 'One AMS unit within TelemetrySnapshot.ams (ams_json units[])'
      properties:
        unitIndex: { type: integer }
        slots:
          type: array
          items:
            type: object
            properties:
              slotIndex: { type: integer }
              trayType: { type: ["string", "null"] }
              trayColorHex: { type: ["string", "null"] }
              remainingPct: { type: ["number", "null"] }
    TelemetrySnapshot:
      type: object
      description: 'JSON form of telemetry_snapshot (data-model §5, latest-per-printer per ADR-008). Identical shape on REST fallback and SSE telemetry messages (ADR-005). All model-specific fields nullable (NFR-CO-02/NFR-MA-03)'
      properties:
        printerId: { type: string, format: uuid }
        capturedAt: { type: string, format: date-time, description: telemetry_snapshot.captured_at — staleness derives from this (FR-304) }
        printerState: { type: string, enum: [idle, printing, paused, error, offline, unknown] }
        taskName: { type: ["string", "null"] }
        progressPct: { type: ["number", "null"] }
        currentLayer: { type: ["integer", "null"] }
        totalLayers: { type: ["integer", "null"] }
        remainingTimeMin: { type: ["number", "null"] }
        nozzleTempC: { type: ["number", "null"] }
        bedTempC: { type: ["number", "null"] }
        chamberTempC: { type: ["number", "null"], description: absent on some models (NFR-CO-02) }
        ams:
          type: ["object", "null"]
          description: 'telemetry_snapshot.ams_json (normalized internal v:1); null when never observed'
          properties:
            version: { type: integer, const: 1 }
            units: { type: array, items: { $ref: '#/components/schemas/AmsUnit' } }
    SlotView:
      type: object
      description: 'listSlots/mapSlot view (AC-305.2/305.4): join of ams_slot_mapping (data-model §3), telemetry ams_json observation, and spool. One row per physical slot + the virtual external holder 254:0 (ADR-011)'
      properties:
        printerId: { type: string, format: uuid }
        unitIndex: { type: integer, description: '0–3 (AMS) or 254 (virtual external holder)' }
        slotIndex: { type: integer, description: '0–3; always 0 when unitIndex=254' }
        slotRef: { type: string, description: 'Canonical "{unitIndex}:{slotIndex}" serialization' }
        external: { type: boolean, description: 'Derived: true iff slotRef = "254:0"' }
        observation:
          anyOf: [ { $ref: '#/components/schemas/TrayObservation' }, { type: "null" } ]
          description: 'Latest tray observation from telemetry; null when unobserved (external holder is typically user-declared only — ADR-011)'
        mapping:
          type: ["object", "null"]
          description: 'ams_slot_mapping row; null when slot is unmapped'
          properties:
            spoolId: { type: string, format: uuid }
            mappedAt: { type: string, format: date-time }
            verifyFlag: { type: boolean, description: ams_slot_mapping.verify_flag (AC-305.3) }
            verifyReason: { type: ["string", "null"], enum: [tray_mismatch, spool_unavailable, null], description: ams_slot_mapping.verify_reason (ES-305.1) }
        spool:
          anyOf: [ { $ref: '#/components/schemas/SpoolSummary' }, { type: "null" } ]
          description: 'Live data of the mapped spool; null when unmapped'
    FilamentUsage:
      type: object
      description: 'Maps 1:1 to filament_usage (data-model §6) — the FR-402 idempotency anchor'
      properties:
        id: { type: string, format: uuid }
        jobId: { type: string, format: uuid }
        slotRef: { type: string, description: '"{unit}:{slot}", external "254:0", manual entries "manual:{n}"' }
        spoolId: { type: ["string", "null"], description: filament_usage.spool_id — resolved at attribution }
        spoolLabel: { type: ["string", "null"], description: 'Derived: spool.label join for display' }
        usedG: { type: ["number", "null"] }
        usedMm: { type: ["number", "null"], description: length-reported; converted via density (ES-402.1) }
        estimated: { type: boolean }
        attributed: { type: boolean, description: filament_usage.attributed (ES-402.2) }
        ledgerEntryId: { type: ["string", "null"], description: 'filament_usage.ledger_entry_id — the LIVE consumption entry; repointed inside an FR-405 correction transaction (ADR-009 §1/§3)' }
    CostBreakdown:
      type: object
      description: 'Maps to cost_calculation (data-model §6) — immutable snapshot; the newest non-superseded row is the current cost (AC-404.2)'
      properties:
        id: { type: string, format: uuid }
        jobId: { type: string, format: uuid }
        calculatedAt: { type: string, format: date-time }
        filamentCostMinor: { type: integer }
        energyCostMinor: { type: ["integer", "null"], description: 'null = rate not configured (AC-403.2)' }
        machineCostMinor: { type: ["integer", "null"], description: 'null = rate not configured (AC-403.2)' }
        totalCostMinor: { type: integer }
        incomplete: { type: boolean, description: cost_calculation.incomplete (ES-404.1/ES-406.1) }
        superseded: { type: boolean }
        currencyCode: { type: string, description: 'Display-only, from cost_rate_settings; stored default NOK is an assumption pending Q-03' }
        inputs:
          type: object
          description: 'cost_calculation.inputs_snapshot_json — frozen calculation inputs (AC-404.2); full precision, rounding at display (AC-404.1)'
          properties:
            perSpool:
              type: array
              items:
                type: object
                properties:
                  spoolId: { type: string, format: uuid }
                  grams: { type: number }
                  unitCostPerGMinor: { type: number, description: 'minor units per gram; fractional precision preserved' }
                  estimated: { type: boolean, description: default-priced spool (ES-108.1) }
            energyPricePerKwhMinor: { type: ["integer", "null"] }
            machineRatePerHourMinor: { type: ["integer", "null"] }
            watts: { type: ["number", "null"], description: printer_power_draw.watts at calc time (AC-403.1) }
            durationMin: { type: ["number", "null"] }
    PrintJob:
      type: object
      description: 'listJobs item: maps to print_job (data-model §6) + derived usage/cost rollups'
      properties:
        id: { type: string, format: uuid }
        source: { type: string, enum: [task_sync, telemetry, manual] }
        bambuTaskId: { type: ["string", "null"], description: print_job.bambu_task_id — idempotent upsert key (FR-308) }
        printerId: { type: ["string", "null"] }
        printerName: { type: ["string", "null"], description: 'Derived: printer.name join' }
        jobName: { type: string }
        startedAt: { type: ["string", "null"], format: date-time }
        endedAt: { type: ["string", "null"], format: date-time }
        durationMin: { type: ["number", "null"] }
        outcome: { type: string, enum: [success, failed, cancelled, unknown] }
        usageStatus: { type: string, enum: [reported, estimated, unknown, manual], description: print_job.usage_status (ES-401.1) }
        totalUsedG: { type: number, description: 'Derived: Σ filament_usage.used_g for the job (0 when none)' }
        cost:
          type: ["object", "null"]
          description: 'Derived: newest non-superseded cost_calculation; null when never costed'
          properties:
            totalCostMinor: { type: integer }
            incomplete: { type: boolean }
        createdAt: { type: string, format: date-time }
        updatedAt: { type: string, format: date-time }
    PrintJobDetail:
      description: 'getJob/createManualJob/correctJob response: job + usages (with ledger links) + full cost breakdown'
      allOf:
        - { $ref: '#/components/schemas/PrintJob' }
        - type: object
          properties:
            usages: { type: array, items: { $ref: '#/components/schemas/FilamentUsage' } }
            costBreakdown:
              anyOf: [ { $ref: '#/components/schemas/CostBreakdown' }, { type: "null" } ]
              description: 'Newest non-superseded snapshot; null when never costed'
    JobsSummary:
      type: object
      description: 'listJobs summary block (FR-406) — computed over the FILTERED set, not the page'
      properties:
        count: { type: integer }
        successCount: { type: integer }
        successRatePct: { type: number }
        totalUsedG: { type: number }
        totalCostMinor: { type: integer, description: 'Σ current cost over jobs having one' }
        incompleteCostCount: { type: integer, description: 'jobs whose current cost is flagged incomplete (ES-406.1)' }
    JobListResponse:
      type: object
      description: listJobs 200 body
      properties:
        jobs: { type: array, items: { $ref: '#/components/schemas/PrintJob' } }
        summary: { $ref: '#/components/schemas/JobsSummary' }
    AttributeResult:
      type: object
      description: attributeUsage 200 body (ES-402.2)
      properties:
        usage: { $ref: '#/components/schemas/FilamentUsage' }
        entry: { $ref: '#/components/schemas/LedgerEntry' }
    SyncResult:
      type: object
      description: syncTaskHistory 200 body (FR-308)
      properties:
        fetched: { type: integer }
        created: { type: integer }
        merged: { type: integer }
    CostRateSettings:
      type: object
      description: 'Maps to cost_rate_settings + printer_power_draw (data-model §6). currencyCode default NOK is an assumption pending Q-03 (editable, display-only)'
      properties:
        energyPricePerKwhMinor: { type: ["integer", "null"] }
        machineRatePerHourMinor: { type: ["integer", "null"] }
        currencyCode: { type: string }
        printerPowerDraw:
          type: array
          items:
            type: object
            properties:
              printerId: { type: string, format: uuid }
              printerName: { type: string, description: 'Derived: printer.name join' }
              watts: { type: number }
    HealthStatus:
      type: object
      description: 'GET /health body (ADR-013) — unauthenticated liveness + component detail'
      properties:
        status: { type: string, enum: [ok, degraded] }
        components:
          type: object
          properties:
            db: { type: object, properties: { writable: { type: boolean } } }
            integration:
              type: object
              properties:
                listenerState: { type: string, enum: [running, degraded, stopped, disabled] }
                lastMqttMessageAgeSec: { type: ["number", "null"] }
```

**Operation count: 62** (auth 5, vendors 5, products 5, spools 7, inventory 2, purchase-orders 6 incl. inbound, receptions 3, integration 7, printers 9, jobs 8, settings 2, system 3). **Component schema count: 48** — 11 shared/input schemas + 37 response/view schemas (incl. all six gatekeeper-named aggregates: SlotView, IntegrationStatus, InboundRow, ProductStockRow, LowStockAlert, TelemetrySnapshot; plus JobsSummary, CostBreakdown, and core entity responses Spool, PrintJobDetail, ReceptionResult).

---

## Part B — Internal Domain Events (in-process typed bus)

Not a wire protocol: a typed in-process publish/subscribe (ADR-001). Handlers that must be transactional (reception→stock, consumption→ledger) are **direct same-transaction calls**; the bus carries after-commit notifications only (no outbox needed in-process — events are emitted post-commit).

| Event | Producer → Consumers | Payload (internal types only — NFR-MA-02) | FR |
|-------|----------------------|-------------------------------------------|-----|
| `SpoolsReceivedIntoStock` | Reception → Alerts, SSE | receiptId, spoolIds[], productIds[] | FR-205 |
| `StockLevelChanged` | Ledger write path → Alert evaluator | productId, totalRemainingG, usableSpools | FR-106 |
| `LowStockThresholdCrossed` / `LowStockCleared` | Alert evaluator → SSE | productId, threshold, current, onOrder | FR-106 |
| `TelemetrySnapshotUpdated` | ACL (MQTT/REST-poll adapter) → snapshot store, SSE | printerId, TelemetrySnapshot | FR-303 |
| `TrayContentsChanged` | ACL → Mapping verifier | printerId, slotRef, observed{type,colorHex} | FR-305 |
| `MappingVerifyFlagged` | Mapping verifier → SSE | printerId, slotRef, reason | AC-305.3 |
| `PrintJobObservedComplete` | ACL → Job merger | printerSerial, taskRef?, timings, usage? | FR-401 |
| `PrintTasksFetched` | ACL task sync → Job merger | TaskRecord[] (normalized) | FR-308 |
| `FilamentConsumptionRecorded` | Jobs → Inventory (same-tx call) + post-commit SSE | jobId, spoolId, slotRef, grams, estimated | FR-402 |
| `PrintJobCosted` | Costing → SSE | jobId, costCalculationId, totalMinor, incomplete | FR-404 |
| `IntegrationStateChanged` | ACL supervisor → SSE | state: connected/degraded/reauth_required/disabled, detail | FR-306/307 |

**12 distinct events** across 11 table rows (`LowStockThresholdCrossed` and `LowStockCleared` share a row: same producer, consumers, and payload shape).

## Part C — Browser Live-Update Channel (SSE) — AsyncAPI 3.0 style

```yaml
asyncapi: 3.0.0
info: { title: GeekBOX SSE Channel, version: 1.0.0 }
servers:
  app: { host: 'localhost:8080', protocol: 'sse', description: 'GET /api/events, session-cookie authenticated, EventSource auto-reconnect w/ Last-Event-ID' }
channels:
  events:
    address: /api/events
    messages:
      telemetry:
        summary: Latest snapshot for one printer (throttled to ≥1 s spacing per printer; NFR-PE-02 ≤10 s)
        payload: { printerId: uuid, snapshot: TelemetrySnapshot, capturedAt: date-time }
      integrationStatus:
        summary: Health/degradation banner driver (FR-304 ES-304.1, FR-307 banner)
        payload: { state: 'enum[connected, degraded, reauth_required, disabled]', detail: string, nextRetryAt: 'date-time?' }
      lowStock:
        summary: Alert panel + nav badge updates
        payload: { productId: uuid, active: boolean, currentG: number, thresholdG: number, onOrderQty: integer, earliestEta: 'date?' }
      mappingVerify:
        summary: Verify-mapping flags (AC-305.3, ES-305.1)
        payload: { printerId: uuid, slotRef: string, reason: 'enum[tray_mismatch, spool_unavailable]' }
      jobUpdate:
        summary: New/merged/costed jobs incl. pending-preview deductions under consumption.autopost=off (plan §7)
        payload: { jobId: uuid, kind: 'enum[created, merged, consumption_posted, consumption_pending, costed]' }
operations:
  onEvents: { action: receive, channel: { $ref: '#/channels/events' } }
```

**Event surface count**: 12 internal bus events, 5 SSE message types. SSE payload schemas reference the Part A component schemas (`TelemetrySnapshot` is byte-identical between REST and SSE). Degraded fallback: dashboard polls `getTelemetrySnapshot` + `getIntegrationStatus` every 10 s if the stream fails twice (ADR-005) — identical payload schemas, no divergent code path.
