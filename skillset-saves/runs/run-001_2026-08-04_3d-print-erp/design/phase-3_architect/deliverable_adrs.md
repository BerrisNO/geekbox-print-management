---
type: deliverable
pipeline: design
phase: 3
skill: architect
name: Architecture Decision Records — GeekBOX Print Management
version: 2
status: revised
created: 2026-08-04T03:30:00Z
revised: 2026-08-04T22:30:00Z
---

# ADR COLLECTION: GeekBOX Print Management
**Format**: MADR v4.0 | **Decision-makers**: architect (solo-dev proxy) | **Date**: 2026-08-04
All ADRs status **Accepted** unless noted. Traceability: every ADR cites the FR/NFR/constraint/gate it discharges.

## Index

| ADR | Title | Discharges |
|-----|-------|-----------|
| ADR-001 | Modular monolith with hexagonal boundaries | Architecture style (Step 1) |
| ADR-002 | Backend stack: Node.js 22 + TypeScript + Fastify 5 | DG-1 stack lock |
| ADR-003 | Database: SQLite (WAL) + Drizzle ORM | DG-1 (P4, P6); Dev-1 |
| ADR-004 | MQTT listener topology: in-process supervised service | DG-4 |
| ADR-005 | Browser live-update transport: Server-Sent Events | DG-3 |
| ADR-006 | Bambu anti-corruption layer: ports & adapters with fallback adapters | C-07, NFR-MA-02/03 |
| ADR-007 | Auth: DB-backed session cookie + argon2id | C-03, NFR-SE-01/04/06/07; Dev-3 |
| ADR-008 | Telemetry retention: latest snapshot, additive history fallback | DG-6, Q-04 |
| ADR-009 | Spool ledger & idempotency design | FR-103/402/405, NFR-RE-03, RISK-005/007 |
| ADR-010 | Bambu token encryption at rest: AES-256-GCM | NFR-SE-02 |
| ADR-011 | External-spool virtual slot (GK-M1) + ES-107.1 resolution | GK-M1, DG-1 P5 |
| ADR-012 | Fallback provisions for pending user questions Q-01/Q-02/Q-05/Q-06 | DG-1 P7, MS-0 |
| ADR-013 | Right-sized observability: Pino + health endpoints, no OTel | Dev-2, plan §7 |

---

## ADR-001: Modular Monolith with Hexagonal Boundaries

### Context and Problem Statement
Five bounded contexts (3 core, 1 supporting ACL, 1 generic) must be delivered by one part-time developer as a self-hosted docker-compose app with an unstable external dependency and strong transactional invariants across contexts (reception atomically creates spools; consumption atomically writes the ledger).

### Decision Drivers
- C-05 solo dev; plan §3 thin vertical slices; NFR-PE-04 1 GB RAM cap
- Cross-context transactions must be strongly consistent (FR-205, FR-402, NFR-RE-03) — same DB, same transaction
- NFR-MA-02 demands one hard internal boundary (the Bambu ACL); NFR-RE-05 demands the core survives integration death
- C-02 prohibits serverless; deployment is one compose stack

### Considered Options
1. **Modular monolith** — one deployable, one module per bounded context, hexagonal ports/adapters at the edges (HTTP, DB, Bambu, SSE)
2. Microservices per context
3. Full Clean Architecture layering across the whole app
4. Event-driven CQRS with event store

### Decision Outcome
Chosen option: **Modular monolith with hexagonal boundaries**. Selection procedure per skill Step 1: dominant quality attributes are ledger reliability (strong consistency) and solo maintainability; microservices eliminated by team-size and strong-consistency conflicts (framework table: <5 devs, strong consistency ⇒ monolith); serverless eliminated by hard constraint C-02; full Clean Architecture ceremony and CQRS/event-store eliminated as over-engineering for a mostly-CRUD app whose one genuinely event-like structure (the spool ledger) is served by an append-only table, not an event store. Hexagonal discipline is applied **selectively where it pays**: the Bambu ACL (driven adapter behind `TelemetrySource`/`BambuCloudGateway` ports — the NFR-MA-02 statically-checkable seam), persistence (repository interfaces per module), and the SSE broadcaster. Domain modules communicate via direct in-process calls for commands and a typed in-process event bus for domain events (see `deliverable_api-contracts.md` Part B).

### Consequences
- Good: cross-context invariants ride single SQLite transactions; one image, one container, trivially inside 1 GB; module boundaries enforced by lint rule (import allow-list) give the seams without distribution cost.
- Good: MS-1 fallback rework (if any A-0x fails) is confined to one module's adapters, as RISK-001 mitigation requires.
- Bad: no independent scaling/deploy per context — irrelevant at 1 user; recorded as the accepted trade-off.
- Neutral: extraction seam documented (ADR-004) if the MQTT listener ever needs its own process.

### Pros and Cons of Options
- **Microservices** — Good: isolation. Bad: distributed transactions for reception/ledger, ≥3 services × RAM, ops burden fatal to RISK-004. Rejected.
- **Full Clean Architecture** — Good: testability. Bad: layer ceremony on ~20 CRUD endpoints; the framework table itself says "not for simple CRUD/MVP". Rejected in favor of selective hexagonal.
- **CQRS/Event sourcing** — Good: audit trails. Bad: the ledger already IS the audit trail; projections/replay machinery unjustified. Rejected.

---

## ADR-002: Backend Stack — Node.js 22 + TypeScript 5 + Fastify 5 (`node-typescript.md`)

### Context and Problem Statement
DG-1 requires exactly one backend overlay locked before build. Drivers: solo developer, persistent MQTT listener, docker-compose, 1 GB cap, modest perf (500 ms p95), and a frontend lock (Phase 4) that will almost certainly be a browser/TS framework.

### Decision Drivers
- One language across the whole system minimizes solo-dev context switching (plan §9 explicitly instructs weighing familiarity; TS is the safest single-language bet given the browser frontend is unavoidable)
- First-class MQTT client (DG-1 P3): MQTT.js supports mqtts:8883, username/password, TLS cert verification, reconnect events
- Async I/O model fits a listener + API server in one process (ADR-004)
- Fastify 5: schema-validated routes, hooks for session gate (NFR-SE-06), SSE-friendly reply streaming

### Considered Options
1. **node-typescript.md** (chosen)
2. python-fastapi.md — strong (paho-mqtt, HA precedent for Bambu), but second language vs. TS frontend; async SQLAlchemy + uvicorn adds moving parts
3. go-gin.md — smallest footprint, but different language from frontend; more boilerplate for a CRUD-heavy app; weaker schema-validation ergonomics
4. dotnet-aspnet.md — enterprise-grade, overlay itself targets "enterprise/compliance/Azure" — wrong fit signal; heavier image
5. rust-axum.md — perf we don't need at cost of solo-dev velocity we do need
6. bun-typescript.md / deno-typescript.md — younger runtimes; MQTT.js/better-sqlite3 compatibility risk is exactly the kind of avoidable platform risk a solo project shouldn't carry while already holding RISK-001

### Decision Outcome
Chosen option: **node-typescript.md** — the only overlay that simultaneously maximizes ecosystem maturity for the two riskiest components (MQTT client, SQLite driver) and unifies language with the future frontend. Version tuple and conformance table in `deliverable_backend-stack-lock.md` §2.

### Consequences
- Good: Zod v4 doubles as the ACL payload validator (NFR-MA-02 "validated at the boundary") and the HTTP input validator — one validation idiom everywhere.
- Good: Vitest + Fastify inject + recorded fixtures cover NFR-MA-01 without extra harnesses.
- Bad: single-threaded event loop — a pathological synchronous query blocks telemetry processing; mitigated by better-sqlite3's sub-ms queries at our volumes and NFR-PE-03 load test as exit gate.
- Neutral: overlay deviations Dev-1/Dev-2/Dev-3 recorded in stack lock §5.

---

## ADR-003: Database — SQLite (WAL) + Drizzle ORM (Deviation Dev-1)

### Context and Problem Statement
DG-1 P4: DB must support the transactional invariants (FR-103 ledger atomicity, FR-205 atomic reception, ES-206.1 serialized receptions) and NFR-PE-01 seed volumes (5,000 spools / 10,000 jobs / 100,000 ledger entries) in a single container with volume persistence. The overlay's examples assume PostgreSQL.

### Decision Drivers
- Exactly one user; with ADR-004 (in-process listener) there is exactly **one process** touching the DB — SQLite's sweet spot
- NFR-RE-04 backup/restore as ONE command: `VACUUM INTO` produces a consistent single-file backup; restore = file copy
- NFR-PE-04: dropping the Postgres container saves ~150–250 MB of the 1 GB budget
- NFR-PE-01: 100k-row ledger with proper indices is microseconds-scale in SQLite; 500 ms p95 has orders-of-magnitude headroom

### Considered Options
1. **SQLite via better-sqlite3, WAL mode, Drizzle ORM** (chosen)
2. PostgreSQL 16 container + Drizzle/Prisma
3. Prisma + SQLite

### Decision Outcome
Chosen option: **SQLite + Drizzle**. Configuration locked: WAL journal mode, `synchronous=NORMAL`, `foreign_keys=ON`, `busy_timeout=5000`; all writes through better-sqlite3 transactions (synchronous ⇒ inherently serialized, which *implements* ES-206.1 rather than merely permitting it). Drizzle over Prisma: SQL-first migrations reviewable by a solo dev, no query-engine binary in the image.

### Validation against P4 (evidence, not assertion)
- Atomicity: better-sqlite3 `db.transaction()` is BEGIN…COMMIT with automatic rollback on throw — FR-205 ES-205.2 and FR-103 ES-103.1 map 1:1.
- Serialization: single writer connection in a single process; concurrent reception posts (ES-206.1) queue on the event loop and execute sequentially by construction.
- Volumes: 100k ledger rows ≈ tens of MB; covered indices defined in `deliverable_data-model.md` §4.
- Crash durability: WAL + NORMAL survives process kill (fsync on checkpoint); NFR-RE-03 crash-injection test remains the proof gate in D2/D4.

### Consequences
- Good: zero-config persistence in one named volume (NFR-PO-02); backup endpoint is `VACUUM INTO` + stream (NFR-RE-04).
- Bad: if the listener is ever extracted to a second process (ADR-004 seam), WAL supports multi-process but write serialization must be revisited — recorded as the seam's known cost.
- Bad: fewer online-migration comforts than Postgres — acceptable: migrations run at startup during single-user downtime (plan §7 release step 4).
- Neutral: engine swap to Postgres via Drizzle is a bounded change if v2 ever needs it (documented scaling seam per skill edge-case rule).

---

## ADR-004: MQTT Listener Topology — In-Process Supervised Service (DG-4)

### Context and Problem Statement
DG-4: the persistent MQTT listener (FR-303/306) can live in-process with the API server or as a separate compose sidecar. It must satisfy NFR-RE-01 (restart recovery < 60 s), NFR-PE-04 (RAM cap), and keep the core app alive if the listener dies (NFR-RE-05).

### Decision Drivers
- One process ⇒ SQLite single-writer simplicity (ADR-003) and shared in-process event bus ⇒ SSE without any broker
- Sidecar ⇒ stronger crash isolation but needs cross-process data path (shared DB in WAL multi-process mode or IPC/HTTP), a second Node runtime's RAM, and doubled config/secrets surface
- RISK-008 (long-run instability) needs containment either way

### Considered Options
1. **In-process supervised background service** (chosen)
2. Separate compose service (sidecar) sharing the SQLite volume
3. Sidecar + Postgres (pairs with rejected ADR-003 option 2)

### Decision Outcome
Chosen option: **in-process supervised service**. The listener runs as a module (`integration/telemetry/`) started after Fastify boot, wrapped in a supervisor with these hard rules:
- **Total error containment**: every MQTT event handler and the connect loop are wrapped; no listener error may propagate to the process level. An irrecoverable internal fault transitions the integration to `degraded` state (FR-306 AC-306.2 surface) — it never crashes the web app. This, plus the permanent `integration.enabled` kill switch (plan §7), is how NFR-RE-05 is met by construction and by test.
- **Backoff ownership**: MQTT.js auto-reconnect is disabled; the supervisor owns reconnect scheduling (5 s → ×2 → max 5 min, full jitter) per FR-306, stopping on auth failure to hand over to the FR-307 reauth flow (ES-306.1).
- **Bounded ingestion**: a fixed-size (drop-oldest) queue between socket and normalizer; safe because the model is latest-snapshot (ADR-008) — discharges NFR-PE-03/RISK-008.
- **Watchdog**: supervisor heartbeat feeds `/api/health` detail and the FR-306 status panel (`lastMqttMessageAt`, `connectedSince`, next-retry time).
Whole-process crashes (OOM, native fault) are healed by the compose restart policy within NFR-RE-01's 60 s.

### Consequences
- Good: zero IPC, zero shared-DB contention, minimal RAM; SSE fan-out is a direct in-process subscription.
- Bad: a hard process fault takes API + listener down together for the restart window — accepted at single-user scale (NFR-RE-01 tolerates < 60 s recovery).
- Neutral: **extraction seam**: the listener touches the rest of the app only via the `TelemetrySource` port and repository interfaces; if D6 soak falsifies stability (RISK-008 trigger), extraction to a sidecar is a packaging change plus WAL multi-process config, not a redesign. Escalation path recorded per plan §5 RISK-008 contingency.

---

## ADR-005: Browser Live-Update Transport — Server-Sent Events (DG-3)

### Context and Problem Statement
DG-3: dashboard must reflect telemetry within 10 s (NFR-PE-02) without manual reload (FR-304). Candidates: SSE, WebSocket, short-poll. Rule from the plan: "simplest mechanism that passes wins."

### Considered Options
1. **SSE** (chosen) 2. WebSocket 3. Short-poll (5 s)

### Decision Outcome
Chosen option: **SSE** (`GET /api/events`). The data flow is strictly server→browser (read-only telemetry, alert, and job notifications — v1 has no browser-initiated live commands, SRS §1.4 excludes remote control). SSE gives: plain HTTP (session cookie auth works unchanged — NFR-SE-06 without a WS auth sidecar), built-in `EventSource` auto-reconnect with `Last-Event-ID`, and trivial Fastify implementation. Event catalog and payloads: `deliverable_api-contracts.md` Part C. Degraded fallback: the dashboard falls back to 10 s polling of `GET /api/printers/{id}/telemetry` if `EventSource` errors persist — same data shape, designer (Phase 4 / DG-2 P2) confirms fit.

### Consequences
- Good: meets 10 s freshness with second-scale latency; no new auth surface; no socket library.
- Bad: one long-lived connection per open tab; irrelevant at single-user load.
- Bad: no client→server channel — if v2 adds remote control (currently out of scope), WebSocket would be revisited; recorded as a v2 seam, not a v1 cost.

---

## ADR-006: Bambu ACL — Ports & Adapters with Fallback Adapters (C-07 / NFR-MA-02)

### Context and Problem Statement
Every Bambu fact is unverified community documentation (A-01…A-05). C-07/NFR-MA-02 mandate an anti-corruption layer with **zero Bambu imports outside the adapter**; NFR-MA-03 mandates schema-drift tolerance; the MS-1 decision rule requires pre-designed fallbacks that can be activated without redesign.

### Decision Outcome
The `integration/` module is the ACL. Structure (enforced by a Biome/dependency-cruiser rule failing CI on any `integration/bambu/**` import from outside `integration/` — the NFR-MA-02 static check):

**Ports (internal interfaces — the only things the rest of the app sees):**
- `BambuCloudGateway` (driven): `login(credentials) → LinkResult | CodeChallenge`, `verifyCode(code)`, `listDevices() → PrinterDescriptor[]`, `fetchTasks(since) → TaskRecord[]`
- `TelemetrySource` (driven): `start()`, `stop()`, emits normalized `TelemetrySnapshotUpdated` / `TrayContentsChanged` / `PrintJobObservedComplete` / connection events
- `TokenVault` (driven): encrypted token persistence (ADR-010)

**Primary adapters:** `BambuRestAdapter` (api.bambulab.com, endpoints per SRS §5.2) and `BambuMqttAdapter` (mqtts `{region}.mqtt.bambulab.com:8883`, user `u_{uid}`, password = access token, topic `device/{serial}/report`, full-status push request on connect where supported).

**Fallback adapters (pre-designed, activated by MS-1 verdicts or runtime config — see ADR-012):**
- `ManualTokenAdapter` (A-01 fail): user pastes uid + access token in settings; implements the same `BambuCloudGateway` auth surface minus login.
- Manual printer registration (A-02 fail): `POST /api/printers` with serial — no adapter needed; registry accepts manual rows.
- `RestPollTelemetryAdapter` (A-03 fail): implements `TelemetrySource` by polling task/status REST endpoints (≤ 1 req/min, A-05 conservatism); degrades dashboard to task-level freshness with honest staleness display (NFR-US-03).
- Manual/MQTT-only usage capture (A-04 fail): jobs flow already accepts telemetry-observed completions and FR-405 manual entry; no new component.

**Boundary validation (NFR-MA-03):** every inbound payload parses through Zod schemas with `.passthrough()`-style tolerance — unknown fields ignored; missing expected fields produce `unknown`-valued normalized fields and a once-per-field-per-session log (ES-303.1); parse failure of a whole payload increments a drift counter surfaced on the health panel and never throws past the adapter (ES-301.2). Recorded MS-1 fixtures are the permanent contract-test corpus (NFR-MA-01).

### Consequences
- Good: MS-1 FAILED verdicts swap one adapter behind an unchanged port — the plan's "bounded architecture amendment" is real, not aspirational.
- Good: Bambu field names provably never cross the boundary (CI-enforced).
- Bad: normalization mapping is hand-maintained against an undocumented schema — accepted; that is the cost C-07 already priced in, contained by fixtures.

---

## ADR-007: Auth — DB-Backed Session Cookie + argon2id (Deviation Dev-3)

### Context and Problem Statement
C-03 mandates: one local account, hashed password, session cookie, no RBAC. Overlay default (passkeys/JWT) is overridden by the user constraint.

### Decision Outcome
- Password: **argon2id** (node-argon2, defaults ≥ OWASP baseline) — NFR-SE-01.
- Session: opaque 256-bit random token in an **HttpOnly, SameSite=Lax** cookie (Secure auto-enabled when served over HTTPS), server-side `session` table row with sliding 7-day inactivity expiry (configurable) — FR-002, NFR-SE-04. Logout and password change delete rows server-side (AC-002.1, AC-003.1).
- Enforcement: a Fastify global `onRequest` hook rejects any route not on the explicit allow-list {login, setup, health, static assets} with 401 — NFR-SE-06 audited by route-table test.
- Throttling: fixed-window in-memory counter (10 fails / 15 min → ≥ 30 s delay, logged) — FR-001 ES-001.1 / NFR-SE-07; in-memory is acceptable (restart-reset) because it is anti-brute-force friction, not an account-lock ledger.
- First-run: setup route active only while `user_account` is empty (AC-001.3).

### Consequences
- Good: boring, proven, matches "Identity & Access = Generic, minimal custom code" (DA §6).
- Bad: no passkey UX — explicitly out of the user's requested scope.
- Neutral: sessions in DB survive restarts (NFR-RE-01 recovery keeps the user logged in).

---

## ADR-008: Telemetry Retention — Latest Snapshot Only, Additive History Fallback (DG-6)

### Context and Problem Statement
Q-04 (PENDING-USER, escalated): retain telemetry time-series for charts, or latest-snapshot only? DG-6 says architect proposes with the SRS default (latest-snapshot; charts deferred) and needs a fallback if the user answers "charts, please."

### Decision Outcome
**Proposal (default, implemented in v1): latest-snapshot only.** One `telemetry_snapshot` row per printer, UPSERTed on ingest (bounded storage forever, supports drop-oldest queue in ADR-004); durable job/usage records (FR-401) carry all long-term analytical value; dashboard staleness derives from `capturedAt` (FR-304).

**Fallback (if user opts for charts):** additive `telemetry_history` table (append-only, downsampled to 1 row/printer/minute, 30-day rolling purge job). Strictly additive migration: no existing table, port, or endpoint changes; ingest pipeline gains one tee. Fallback is pre-designed in `deliverable_data-model.md` §5 so DG-6 cannot destabilize the D1 migration baseline either way.

### Consequences
- Good: storage bounded; NFR-PE-04 protected; decision reversal is cheap by design.
- Bad: no historical charts in v1 default — matches SRS scope; deferred, not lost (job records remain).

---

## ADR-009: Spool Ledger & Idempotency Design (FR-103/402/405, RISK-005/007)

### Context and Problem Statement
The ledger is the book of record (DA §1). Required invariants: atomic entry+balance writes, floor-at-zero with over-consumption flag, immutable entries with reversal+repost corrections, exactly-once deduction per (job, slotRef), and dual-source job merge without double deduction.

### Decision Outcome
Mechanics (schema in `deliverable_data-model.md` §3):
1. **Append-only ledger with supersession links**: `spool_ledger_entry` has no UPDATE/DELETE path in the repository API; corrections insert `reversal` + new entries (FR-405 AC-405.2). A reversal carries `reverses_entry_id` → the entry it undoes (`UNIQUE WHERE NOT NULL` — an entry is reversed at most once). **Correction transaction (normative, one SQLite transaction):** (a) insert `reversal` with `delta_g = −original.delta_g` and `reverses_entry_id = original.id`; (b) insert the corrected `consumption` entry — **the same spool is permitted**, because the ledger deliberately has no uniqueness constraint over `(spool_id, job_id, slot_ref, type)` (see §3); (c) repoint `filament_usage.ledger_entry_id` to the new entry; (d) update the denormalized balance. Same-spool amount corrections (e.g., 42.5 g → 40 g) and reversal-then-reattribution back to the same spool are both executable without constraint violation — uniqueness rides entry *identity* plus usage linkage, never the (spool, job, slot) tuple. `spool.remaining_net_weight_g` is a denormalized copy of the last `balance_after_g`, written **in the same transaction** as the entry (FR-103 ES-103.1); a CHECK constraint keeps it ≥ 0.
2. **Floor-at-zero**: deduction clamps at 0, sets `over_consumption=1` on the entry, and transitions the spool to `depleted` in the same transaction (AC-103.3).
3. **Idempotency guard (exactly-once at DB level — v2, reconciles gatekeeper M1)**: three constraints anchor FR-402, all in `deliverable_data-model.md` §3/§6: (a) `filament_usage.UNIQUE(job_id, slot_ref)` — at most one usage row per job-slot; task re-sync upserts jobs by `UNIQUE(bambu_task_id)` (FR-308 AC-308.2, FR-401 merge) and usages into the existing row; (b) `filament_usage.ledger_entry_id` UNIQUE FK — each usage references exactly one **live** consumption entry, no two usages share one, and the write path posts a deduction only when it is NULL (or repoints it inside a §1 correction transaction); (c) `spool_ledger_entry.UNIQUE(reverses_entry_id) WHERE NOT NULL` — no double-reversal on replay. The v1 ledger-side backstop `UNIQUE(spool_id, job_id, slot_ref, type) WHERE type='consumption' AND job_id IS NOT NULL` is **removed**: it contradicted the FR-405 same-spool reverse-and-repost flow (the reposted entry duplicates the never-deleted original's tuple) and added nothing the three constraints above do not already guarantee. **Invariant (NFR-MA-01 suite, alongside "balance == last entry"):** a `consumption` entry with a job_id is live iff referenced by some `filament_usage.ledger_entry_id`; every non-live consumption entry is reversed exactly once. The guards are database constraints, not application memory — they survive restarts and re-syncs (RISK-007).
4. **Job merge**: upsert key = `bambu_task_id`; telemetry-observed completions without a task ID match on (printer, time-window ±10 min) and adopt the task ID when sync later supplies it (FR-401 AC-401.1).
5. **Manual consumption path (verdict n1 noted)**: under the RISK-002/A-04 contingency, manual consumption lands via FR-405 manual jobs (which post ledger entries through the same single code path) and FR-104 recalibration — there is exactly **one** ledger-write function; every source (auto attribution, later assignment, manual job, correction, reception has none) funnels through it.
6. **Unattributed usage**: usage rows with no mapping at job time persist with `attributed=0` and no ledger entry until assignment (ES-402.2); assignment then posts the entry idempotently under the same guard.

### Consequences
- Good: RISK-005/RISK-007 mitigations are structural (constraints + single write path), testable by property/crash-injection tests as D2/D5 exit criteria; `consumption.autopost` preview flag (plan §7) wraps only the final "post entry" call.
- Good (v2): corrections and reattributions are first-class — FR-405 reverse-and-repost on the same spool cannot collide with any constraint, while FR-402 exactly-once still holds purely at DB level (M1 resolved).
- Bad: denormalized balance requires the invariant test "balance == last entry" — cheap, included in NFR-MA-01 suite.
- Bad (v2): the live/reversed invariant is cross-table (usage linkage), so it is asserted by the NFR-MA-01 invariant test rather than a single SQL constraint — accepted; the three per-table constraints already exclude double-deduction and double-reversal.

---

## ADR-010: Bambu Token Encryption at Rest — AES-256-GCM (NFR-SE-02)

### Considered Options
1. **AES-256-GCM via node:crypto with env-provided key** (chosen); 2. OS keystore / keychain — rejected: not portable into a headless docker-compose container (C-02 topology); 3. libsodium sealed boxes — rejected: adds a native dependency for no threat-model gain over GCM here; 4. plaintext + file permissions — rejected: fails NFR-SE-02's DB/backup-leak scenario (RISK-009).

### Decision Outcome
Access/refresh tokens are encrypted with **AES-256-GCM** (node:crypto), random 96-bit IV per write, key from `TOKEN_ENCRYPTION_KEY` (32-byte, env/secret file, never in image or repo — NFR-SE-05); ciphertext+IV+tag stored in `cloud_link`. The Bambu account password is used transiently for the login exchange and never persisted (FR-301). Unlink deletes the row (AC-301.3). Key rotation: manual re-link (documented in README per NFR-MA-04) — right-sized for one user.

### Consequences
- Good: DB file or backup leakage does not expose usable tokens without the env key (RISK-009).
- Bad: losing the key forces a re-link — trivial recovery cost, accepted.

---

## ADR-011: External-Spool Virtual Slot + ES-107.1 Resolution (GK-M1, DG-1 P5)

### Context and Problem Statement
GK-M1 (Phase 1 Major, carried forward): FR-402's external-spool deduction path had no defining FR mechanism; FR-305 covered only physical AMS slots. A printer without an AMS depends entirely on this path. Additionally ES-107.1 left two mutually exclusive archive behaviors unresolved (minor m3).

### Decision Outcome
**Slot addressing scheme (canonical):** a slot reference is `(printerId, unitIndex, slotIndex)` serialized as `slotRef = "{unitIndex}:{slotIndex}"`. Physical AMS trays occupy `unitIndex 0–3`, `slotIndex 0–3`. **Every tracked printer additionally has exactly one virtual external-spool holder at the reserved address `unitIndex=254, slotIndex=0` (`slotRef "254:0"`, displayed as "External spool").** 254 mirrors the community-documented Bambu virtual-tray id, making telemetry correlation natural if reports reference it; the mapping table's `UNIQUE(printer_id, unit_index, slot_index)` (DA §4) covers it with no schema special-casing.

**Amended FR-305 (architectural amendment per commander instruction; ACs added):**
- **AC-305.4**: GIVEN a tracked printer WHEN the AMS/mapping panel renders THEN a virtual "External spool" holder appears for that printer (regardless of AMS presence) and can be mapped/unmapped to a spool exactly like an AMS slot, driving the same in_use/in_stock transitions (FR-107).
- **AC-305.5**: GIVEN a job whose usage is reported against the external/single-spool path WHEN consumption is attributed THEN it deducts from the spool mapped to that printer's external holder at job time; if unmapped, the usage is recorded unattributed per FR-402 ES-402.2.
This closes GK-M1 at the design level; implementation lands in D3 per plan (MS-4 exit criterion).

**ES-107.1 resolved to ONE behavior (m3):** archiving a spool currently mapped to any slot (AMS or external) presents a single confirmation; on confirm the system **atomically unmaps then archives in one transaction** (matching DA §4 "unmap AMS first", per planner's recommended option). No partial state is possible.

**Opportunistic minor fixes (m2, m4):** the data model deliverable lists `CloudLink` and `AmsSlotMapping` with explicit context ownership (AmsSlotMapping owned by Filament Inventory, consuming Integration observations), and documents the FR-102↔FR-205 dependency directionality (FR-205 depends on the Spool schema; reception-created spools are one *source* of FR-102 records).

### Consequences
- Good: AMS-less printers (e.g., A1 mini without AMS) are first-class; consumption attribution has a total mapping domain.
- Neutral: verify-mapping flag semantics apply to the external holder only when telemetry actually reports external-tray contents; otherwise it is user-declared only.

---

## ADR-012: Fallback Provisions for Pending User Questions (DG-1 P7 / MS-0)

### Context and Problem Statement
Commander escalated Q-05 (cloud mode), Q-01 (MQTT region), Q-02 (printer models), Q-06 (MFA/code login) to the admiral; answers are PENDING-USER. Per delegation, the architecture MUST remain valid under every SRS §7.2 pre-approved fallback, with explicit provisions.

### Decision Outcome
| Question | Architectural provision (built-in, not contingent) | Valid under fallback because |
|----------|---------------------------------------------------|------------------------------|
| **Q-05** cloud mode | Integration is one optional module behind the permanent `integration.enabled` runtime switch (plan §7); NFR-RE-05 is a tested guarantee, not a hope. If printers are LAN-only, the switch stays off and D3 descopes per RISK-002 contingency — zero changes to inventory/procurement/costing modules, manual jobs (FR-405) carry consumption (n1 noted in ADR-009 §5). | Core app has no compile-time or runtime dependency on the integration module (NFR-MA-02 static check enforces it). |
| **Q-01** MQTT region | Broker host is **config, not code**: `mqttRegion` (`us`/`eu`/`cn`/custom full hostname) stored in integration settings, editable in UI, env-overridable; listener reconnects on change. Default `us`, correctable at first link. | FR-303 mandates region-configurability regardless of the answer; no architectural element assumes a region. |
| **Q-02** printer models | Discovery (FR-302) plus **manual serial registration** (`POST /api/printers`) as a permanent endpoint, not a hidden fallback; normalization treats every model-specific field as nullable (NFR-CO-02 graceful gaps, e.g., missing chamber temp); dashboard renders N printers from data, no fixed layout count. | Model mix and count only affect fixtures and UI sizing (Phase 4), never structure. |
| **Q-06** MFA/code login | Link flow is a two-step state machine: `POST /integration/link` returns either `linked` or `code_required` → `POST /integration/link/verify` (FR-301 AC-301.2). **Plus** the `ManualTokenAdapter` escape hatch (`POST /integration/link/manual-token`) if the login flow is blocked entirely (A-01 fallback). | Both password-only and code paths are the same state machine; manual token bypasses it without touching any other module. |

### Consequences
- Good: MS-0 answers, whenever they arrive, select among already-built provisions; none can invalidate the architecture or the stack lock (verified per fallback above).
- Neutral: commander/admiral still owns obtaining the answers before the MS-1 spike (plan RISK-002); this ADR removes them from the architecture's critical path only.

---

## ADR-013: Right-Sized Observability — Pino + Health Endpoints, No OTel (Deviation Dev-2)

### Context and Problem Statement
The overlay prescribes OpenTelemetry + Prometheus + Tempo. Plan §7 explicitly rejects a metrics stack for one user on one host and defines the monitoring gates as: container health/restart counts, the in-app integration health panel (FR-306), and in-app staleness surfaces (NFR-US-03).

### Decision Outcome
Locked observability surface: **Pino structured JSON logs** (secret-redaction serializer per NFR-SE-05), **`GET /api/health`** (liveness + component detail: DB writable, listener state, last MQTT message age — feeds the Docker healthcheck and NFR-RE-01 restart policy), and the **FR-306 integration status panel** as the user-facing monitor. No OTel SDK, no Prometheus, no tracing backend.

### Consequences
- Good: honors the plan's anti-over-engineering ruling with an auditable deviation instead of silent drift; saves RAM and dependency surface.
- Bad: no distributed tracing — there is nothing distributed to trace.
- Neutral: if v2 ever multi-hosts, the overlay's OTel section is the reinstatement path.
