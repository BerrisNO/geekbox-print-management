---
type: deliverable
pipeline: design
phase: 5
skill: engineer
name: Implementation Specification — GeekBOX Print Management
version: 2
status: revised
created: 2026-08-05T00:00:00Z
revised: 2026-08-05T00:00:00Z
---

# Implementation Specification: GeekBOX Print Management
**Version**: 2.0 (revised — attempt 2; addresses gatekeeper-design M1 + m1/m2/m3)
**Author**: engineer (Supreme Team design pipeline, Phase 5 — final technical phase)
**Status**: Revised (pipeline mode — commander owns the gatekeeper cycle)
**Date**: 2026-08-05
**Upstream (all APPROVED/inherited)**: SRS v1 (32 FR / 28 NFR, C-01…C-07) · Domain Analysis v1 (5 bounded contexts) · Project Plan v2 (D1–D6, MS-0…MS-7, §7 rollout, DG-1…DG-6) · Architecture v2 (Arc42, §5.2 module map, §7 deployment) · ADRs 001–013 · API Contracts v2 (62 REST ops, 12 events, SSE) · Data Model v2 (18 core tables) · Backend Stack Lock v1 · Frontend Spec v2 + Frontend Stack Lock v2.

> **Scope of this document.** This spec is downstream-translation only: it turns approved design into an implementation-ready shape (repo layout, module build plan, env contract, testing, CI/CD, Docker, security, observability, code quality). It makes **no** architecture decisions and adds **no** technology not already locked. Where the engineer SKILL's generic templates (Step 5 staging deploy, Step 8 OpenTelemetry/Prometheus) conflict with this project's right-sizing, the **project's ADRs win** and the conflict is called out explicitly (see §1.3, §7, §8).

---

## 1. Inherited Stack Locks

### 1.1 Overlays selected upstream (inherited verbatim — NOT reopened)

| Half | Overlay file | Lock source |
|------|-------------|-------------|
| Backend | `C:\Users\leifm\.claude\skills\design\tech-stacks\node-typescript.md` | Backend Stack Lock v1 (discharges DG-1) |
| Frontend | `C:\Users\leifm\.claude\skills\design\tech-stacks\react-tanstack.md` | Frontend Stack Lock v2 (discharges DG-2/DG-3), Frontend ADR-014 |

### 1.2 Version tuples being implemented

**Backend** (Backend Stack Lock §2):

| Component | Locked value |
|-----------|--------------|
| Runtime | Node.js 22 LTS |
| Language | TypeScript 5.x, strict, ESM (`NodeNext`) |
| HTTP framework | Fastify 5.x |
| Validation | Zod v4 (HTTP boundary **and** ACL boundary) |
| ORM / migrations | Drizzle ORM + drizzle-kit |
| Database | SQLite 3.4x via **better-sqlite3 11.x**, WAL mode, `foreign_keys=ON` — *DEVIATION Dev-1 → ADR-003* |
| MQTT client | MQTT.js 5.x (`mqtt`) — mqtts:8883, username/password, custom-backoff reconnect hooks |
| Password hashing | node-argon2 (argon2id) — NFR-SE-01 |
| Token encryption | node:crypto AES-256-GCM, key from env/secret file — NFR-SE-02 → ADR-010 |
| Logging | Pino (structured JSON to stdout) |
| Observability | Pino + `GET /api/health` + FR-306 integration panel only — **NO OpenTelemetry** — *DEVIATION Dev-2 → ADR-013* |
| Auth model | DB-backed opaque session cookie (HttpOnly, SameSite=Lax, Secure-when-HTTPS) — *DEVIATION Dev-3 → ADR-007* |
| Test runner | Vitest; Fastify `inject()` for API tests; recorded-fixture ACL contract tests |
| Lint/format | Biome 2.x |
| Package manager | pnpm |
| Container | Multi-stage `node:22-alpine`, non-root, linux/amd64 |
| Live transport | SSE (native Fastify `Readable`) → ADR-005 |

**Frontend** (Frontend Stack Lock §Version Tuple):

| Component | Locked value |
|-----------|--------------|
| Build/tooling runtime | Node.js 22 LTS |
| Build tool | Vite 8.x (Rolldown) |
| UI library | React 19.x (React Compiler on) + react-dom 19.x |
| Language | TypeScript 5.x strict |
| Router | @tanstack/react-router 1.x — **pure SPA mode, no TanStack Start / no SSR** — *inherited deviation, ADR-014* |
| Server-state | @tanstack/react-query 5.x |
| Tables | @tanstack/react-table 8.x + @tanstack/react-virtual 3.x |
| Forms | @tanstack/react-form 1.x |
| Validation | zod 4.x (same major as backend) |
| Styling | tailwindcss 4.x + shadcn/ui (Radix) + CVA + tailwind-merge/clsx + lucide-react |
| Client UI store | zustand 5.x (global UI only) |
| SSE | native `EventSource` (no socket lib) |
| Lint/format | @biomejs/biome 2.x |
| Package manager | pnpm |

### 1.3 Inherited exceptions (carried, NOT reopened)

All four deviations below were approved upstream against a backing ADR. This spec implements them as given; it does **not** re-litigate or normalize them away.

| ID | Deviation | Backing ADR | Engineer's handling here |
|----|-----------|-------------|--------------------------|
| Dev-1 | SQLite (not the overlay's Postgres examples) | ADR-003 | No `db` compose service; SQLite file in the named volume; drizzle-kit migrations at startup; `VACUUM INTO` backup (§4, §6, §7). |
| Dev-2 | **No OpenTelemetry/Prometheus/Tempo** stack | ADR-013 | **Overrides engineer SKILL Step 8.** §8 replaces the OTel template with Pino JSON + `/api/health` + FR-306 panel. |
| Dev-3 | Session-cookie auth (not passkeys/JWT) | ADR-007 | §7 security maps A01/A07 to deny-by-default session gate + argon2id + throttle — **no RBAC** (C-03). |
| FE-1 | react-tanstack **without TanStack Start** (SPA, static `dist/`) | ADR-014 | Frontend builds to static assets served by the single `app` container — **no second service, no Node SSR** (§2, §6). |

**Right-sizing overrides recorded (engineer SKILL vs. project reality):**
- SKILL Step 5 shows a **staging deploy job** → **removed** per architecture §7.2 ("No staging: single-user self-host") and plan §7. Release = backup → pull → up → smoke → 24 h observe.
- SKILL Step 8 shows **OpenTelemetry/Prometheus/tracing** → **removed** per ADR-013 / Dev-2. Observability is Pino logs + health endpoint + in-app integration panel.
- SKILL Step 7 OWASP mapping is **kept but adapted** to the real controls (§7): A01 is the deny-by-default session gate, not RBAC.

No new deviations are introduced by this spec. No stack-lock conflicts were found (backend and frontend locks are mutually consistent: one TS + Zod v4 + Biome + pnpm toolchain, one `app` container serves both halves).

---

## 2. Repository Structure

### 2.1 Shape decision — pnpm monorepo (justification)

**Chosen: a single pnpm-workspace monorepo** with `apps/backend` and `apps/frontend` plus a small shared package. Justification (brief, evidence-backed):
- The architecture serves **one container** that hosts both the Fastify API and the built SPA (`architecture §5.1`, Frontend ADR-014). A monorepo lets the Docker build produce the SPA `dist/` and copy it into the runtime image in one coherent build graph — no cross-repo version drift.
- Both halves share the **exact toolchain** (TypeScript 5 strict, Zod v4, Biome 2, pnpm) per both locks. A shared `packages/shared` package lets Zod schemas / DTO types be authored once and consumed by both API boundary and frontend forms (frontend spec §8: "Zod schemas mirror API input schemas"). This is the strongest single argument for the monorepo.
- Solo developer, one CI pipeline, one release artifact (C-05). Polyrepo would add coordination cost with zero benefit at this scale.
- The **NFR-MA-02 dependency rule** ("zero Bambu imports outside `integration/`") is enforced within the backend package; the monorepo does not weaken it (dependency-cruiser config scopes to `apps/backend/src`).

> Per the SKILL edge case "monorepo vs polyrepo not made": both were considered; monorepo recommended on the single-artifact + shared-schema grounds above. Commander/user may override, but polyrepo would require a published shared-schema package to preserve the one-validator invariant.

### 2.2 Top-level layout

```
geekbox-print-management/                 # repo root (pnpm workspace)
├── pnpm-workspace.yaml                    # packages: apps/*, packages/*
├── package.json                           # root scripts: lint, typecheck, test, build (delegates via -r)
├── pnpm-lock.yaml                         # committed; --frozen-lockfile in CI
├── biome.json                             # Biome 2 config (lint + format), shared
├── tsconfig.base.json                     # strict, ESM NodeNext base; per-package extends
├── .dependency-cruiser.cjs                # NFR-MA-02 static rule (see §5.5)
├── .env.example                           # env contract (§3) with placeholders
├── .gitignore                             # .env, node_modules, dist, coverage, *.sqlite
├── .github/workflows/ci.yml               # CI pipeline (§5)
├── Dockerfile                             # multi-stage: fe-build → be-build → runtime (§6)
├── docker-compose.yml                     # single `app` service + named volume (§6)
├── healthcheck.js                         # container HEALTHCHECK script (§6)
├── README.md                              # setup / backup-restore / re-link / limitations (NFR-MA-04, D6)
├── docs/
│   ├── architecture/                      # copies/links of arc42 + ADRs (decisions/)
│   ├── decisions/                         # ADR-001…014 (mirrored from design phase)
│   ├── api/                               # OpenAPI 3.1 (from api-contracts v2) + AsyncAPI (events)
│   └── release-notes/                     # per-tag notes (plan §7 communication plan)
├── scripts/
│   ├── backup.mjs                         # CLI backup (VACUUM INTO) — NFR-RE-04
│   ├── restore.md                         # documented restore procedure (D6 drill)
│   └── spike/                             # D1 THROWAWAY Bambu spike scripts (NOT product code)
├── fixtures/
│   └── bambu/                             # MS-1 recorded, redacted payloads → ACL contract-test corpus
│       ├── login.json  bind.json  report-*.json  tasks.json
├── packages/
│   └── shared/                            # cross-cutting, framework-free
│       ├── package.json
│       └── src/
│           ├── schemas/                   # Zod v4 schemas shared by API boundary + FE forms
│           ├── dto/                       # inferred DTO types (z.infer) — the wire contract
│           └── constants/                 # slotRef helpers (254:0), money minor-unit units, enums
├── apps/
│   ├── backend/                           # §2.3
│   └── frontend/                          # §2.4
```

### 2.3 Backend — `apps/backend/` (domain-first per architecture §5.2)

```
apps/backend/
├── package.json                           # fastify, drizzle-orm, better-sqlite3, mqtt, argon2, pino, zod
├── tsconfig.json                          # extends ../../tsconfig.base.json
├── drizzle.config.ts                      # drizzle-kit: schema glob, out=./migrations, dialect=sqlite
├── migrations/                            # generated SQL migrations (committed) — applied at startup
├── vitest.config.ts
└── src/
    ├── main.ts                            # entry: load+validate config → migrate → build app → listen → start supervisor
    ├── app.ts                             # Fastify factory: registers plugins, session gate, module routers, SSE, error handler, static
    ├── config.ts                          # Zod-validated env (§3); fail-fast; typed AppConfig
    ├── db/
    │   ├── client.ts                      # better-sqlite3 (WAL, foreign_keys=ON) + Drizzle instance (single writer)
    │   ├── schema/                        # Drizzle table defs — ONE file per table group, by owning module
    │   │   ├── identity.ts                # user_account, session
    │   │   ├── inventory.ts               # vendor, filament_product, spool, spool_ledger_entry, ams_slot_mapping
    │   │   ├── procurement.ts             # purchase_order, po_status_event, purchase_order_line, goods_receipt, goods_receipt_line
    │   │   ├── integration.ts             # cloud_link, printer, telemetry_snapshot
    │   │   └── jobs.ts                     # print_job, filament_usage, cost_rate_settings, printer_power_draw, cost_calculation
    │   └── migrate.ts                      # runs drizzle migrations at startup (idempotent)
    ├── http/                              # HTTP edge (nothing else imports Fastify — CI rule)
    │   ├── session-gate.ts                # global onRequest hook; deny-by-default allow-list {login,setup,health,assets} (NFR-SE-06)
    │   ├── error-handler.ts               # single RFC 7807 formatter; sanitizes upstream/Bambu → 502 (ES-301.1)
    │   ├── sse.ts                         # GET /api/events broadcaster; per-printer ≥1s throttle; Last-Event-ID
    │   ├── static.ts                      # @fastify/static → serves frontend dist/ (SPA fallback to index.html)
    │   ├── backup-route.ts                # GET /api/backup — session-gated (NOT allow-listed); downloadBackup; streams VACUUM INTO file (application/octet-stream) — RISK-009/NFR-RE-04
    │   └── plugins/                       # cors(off/none-public), rate-limit(login throttle), cookie, helmet-ish headers
    ├── shared/                            # backend cross-cutting (framework-light)
    │   ├── errors/                        # AppError hierarchy + domain `code` catalog (§ error handling)
    │   ├── money.ts  units.ts             # integer minor-units, g/mm↔g density conversion (ES-402.1)
    │   ├── ids.ts                         # slotRef parse/format ("254:0" external holder)
    │   └── logger.ts                      # Pino instance + redaction serializers (password/token/cookie)
    ├── bus/
    │   └── event-bus.ts                   # typed in-process event bus; POST-COMMIT dispatch only (12 events)
    ├── system/
    │   └── backup.ts                      # shared VACUUM INTO mechanism (timestamped file in BACKUP_DIR); called by http/backup-route.ts AND scripts/backup.mjs
    ├── identity/                          # generic subdomain
    │   ├── router.ts  schemas.ts  service.ts  repository.ts  models.ts
    │   └── password.ts  session.ts  throttle.ts     # argon2id, session issue/verify, 10/15min→≥30s (NFR-SE-07)
    ├── inventory/                         # CORE
    │   ├── catalog/                       # products + vendors: router/schemas/service/repository/models
    │   ├── spool/                         # spool lifecycle + status transitions
    │   ├── ledger/                        # ledger write path — THE ONLY writer of spool_ledger_entry (ADR-009)
    │   │   ├── ledger-write.ts            # single entry point: atomicity, floor-at-0, idempotency, reversal+repost
    │   │   ├── repository.ts              # append-only; no UPDATE/DELETE API surface
    │   │   └── invariants.ts              # exported predicates for property tests (live/reversed, balance==last)
    │   ├── ams-mapping/                   # slot↔spool incl. virtual external holder 254:0 (ADR-011)
    │   └── alerts/                        # low-stock evaluator + on-order annotation (subscribes StockLevelChanged)
    ├── procurement/                       # CORE
    │   ├── po/                            # PO CRUD + status derivation + po_status_event
    │   ├── reception/                     # atomic reception posting (receipt+spools+ledger+status+alert) — one tx
    │   └── inbound/                       # inbound overview read model (ETA sort, overdue, no-ETA last)
    ├── jobs/                              # CORE
    │   ├── job/                           # merger: upsert by bambu_task_id else (printer, ±10min) window
    │   ├── consumption/                   # attribution: slotRef→mapping→spool; autopost flag; unattributed capture
    │   └── costing/                       # immutable cost_calculation snapshots; recalc; cost rates
    └── integration/                       # SUPPORTING ACL — zero Bambu types leave this dir (C-07, NFR-MA-02)
        ├── ports.ts                       # BambuCloudGateway, TelemetrySource, TokenVault interfaces (ADR-006)
        ├── supervisor.ts                  # listener lifecycle: backoff(5s→5min+jitter), watchdog, kill switch, bounded drop-oldest queue
        ├── normalizer.ts                  # Zod-tolerant parse; unknown ignored, missing→"unknown"+log-once; drift counter (NFR-MA-03)
        ├── token-vault.ts                 # AES-256-GCM encrypt/decrypt (ADR-010)
        ├── task-sync.ts                   # scheduler ≥30min polling (A-05)
        ├── linking/                       # router/service: link, verify(code), manual-token, unlink, status, settings
        └── bambu/                         # ⛔ importable ONLY within integration/ (dependency-cruiser rule)
            ├── rest-adapter.ts            # BambuRestAdapter (login/bind/tasks — A-01/02/04)
            ├── mqtt-adapter.ts            # BambuMqttAdapter (device/{serial}/report — A-03)
            ├── fallback/
            │   ├── manual-token.ts        # ManualToken adapter (ADR-012)
            │   └── rest-poll-telemetry.ts # RestPollTelemetry fallback adapter (ADR-006/012)
            └── raw-schemas.ts             # Zod schemas for RAW Bambu payloads (never exported past normalizer)
```

Test tree mirrors `src/` under `apps/backend/tests/` (`unit/`, `integration/`, `contract/`, `property/`, `crash/`) — see §4.

### 2.4 Frontend — `apps/frontend/` (react-tanstack SPA per overlay + spec §9)

```
apps/frontend/
├── package.json                           # react, @tanstack/*, zod, tailwindcss, shadcn deps, biome
├── tsconfig.json  vite.config.ts          # Vite 8; dev proxy /api → backend; build → dist/
├── index.html  tailwind.css               # @import "tailwindcss"; @theme tokens (spec §4)
└── src/
    ├── main.tsx                           # React 19 root; QueryClientProvider; RouterProvider
    ├── router.tsx                         # TanStack Router; file-based tree; beforeLoad session guard (ADR-007)
    ├── routes/                            # file-based routes (spec §9 table) — each *Page is .lazy.tsx
    │   ├── login.tsx  setup.tsx           # AuthLayout, public
    │   ├── _app.tsx                        # guarded layout (AppShell); beforeLoad → GET /api/auth/session
    │   ├── _app/index.tsx                 # DashboardPage (FR-304/305/306/307/106)
    │   ├── _app/inventory.tsx  _app/inventory.spools.$spoolId.tsx
    │   ├── _app/catalog.products.tsx  _app/catalog.vendors.tsx
    │   ├── _app/inbound.tsx
    │   ├── _app/purchase-orders.tsx  _app/purchase-orders.$id.tsx  _app/purchase-orders.$id.receive.tsx
    │   ├── _app/jobs.tsx  _app/jobs.$id.tsx  _app/jobs.new.tsx
    │   ├── _app/settings.tsx              # SettingsLayout (tabbed)
    │   ├── _app/settings.account.tsx  settings.cost-rates.tsx  settings.integration.tsx  settings.low-stock.tsx  settings.backup.tsx
    │   └── $notFound.tsx                   # 404 / error boundary (template 17)
    ├── api/
    │   ├── client.ts                      # fetch wrapper (credentials:'include'); RFC 7807 → field errors
    │   ├── query-keys.ts                  # query-key factory (spec §8)
    │   └── hooks/                         # useSpools, useJobs, useTelemetry, useIntegrationStatus, mutations…
    ├── sse/
    │   └── event-bridge.ts                # single EventSource('/api/events'); dispatch 5 msg types → invalidate/setQueryData; 2-fail → refetchInterval 10s (ADR-005 fallback)
    ├── components/
    │   ├── ui/                            # shadcn primitives (Button, Input, Select, Combobox, Dialog, Sheet, Toast, Badge…)
    │   ├── data/                          # DataTable (react-table + virtual), DataFreshness (m5 atom), SpoolLedgerTable
    │   ├── shell/                         # AppShell, SideNav, TopBar, UserMenu, NavBadge, Banner
    │   └── feature/                       # PrinterCard, AmsSlotPanel+SlotTile, CostBreakdownPanel, LowStockAlertPanel, IntegrationHealthPanel, PrintersPanel+PrinterRow
    ├── forms/                             # TanStack Form + Zod (product, spool, PO, reception, manual-job, cost-rates, password)
    ├── lib/                               # cn(), Intl formatters (money/weight), freshness clock (one shared 1s interval)
    ├── stores/                            # zustand: theme, toast queue, nav-collapse (global UI only)
    └── tests/                             # component tests (RTL/Vitest); m5 freshness CI gate test
```

---

## 3. Environment Variable Contract

Validated with a **Zod v4 schema in `apps/backend/src/config.ts` at startup; fail fast** on missing/invalid (SKILL Step 3; ADR-013 §8.4). There is **no `DATABASE_URL`** — SQLite is a file path inside the volume (Dev-1/ADR-003).

### 3.1 Required

| Variable | Type | Example | Description |
|----------|------|---------|-------------|
| `SESSION_SECRET` | string (≥32 chars) | (generated) | Signs/derives session cookie material (ADR-007). |
| `TOKEN_ENCRYPTION_KEY` | 32-byte key (base64 or hex, validated to 32 B) | (generated) | AES-256-GCM key for the Bambu TokenVault (NFR-SE-02, ADR-010). |
| `NODE_ENV` | enum `development\|production\|test` | `production` | Runtime mode; disables verbose errors in prod (A05). |

### 3.2 Optional (with defaults)

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `PORT` | number | `8080` | LAN listen port (architecture §3.2). |
| `DB_PATH` | path | `/data/geekbox.sqlite` | SQLite file inside the named volume. |
| `BACKUP_DIR` | path | `/data/backups` | `VACUUM INTO` target (NFR-RE-04). |
| `LOG_LEVEL` | enum `error\|warn\|info\|debug` | `info` | Pino verbosity. |
| `MQTT_REGION` | string | (unset → DB setting) | Region override; **env overrides DB** for region (ADR-012, §8.4). |

### 3.3 Secrets handling (right-sized — single self-hosted host)

| Secret | Injection method | Rotation |
|--------|------------------|----------|
| `SESSION_SECRET` | `.env` / Docker secret file only; **never in image or logs** (NFR-SE-05) | On suspected compromise (invalidates sessions). |
| `TOKEN_ENCRYPTION_KEY` | `.env` / secret file; loaded to memory only | On host compromise; re-link Bambu after rotation. |

There is no cloud secrets manager (C-06, no external spend). `.env` is gitignored; `.env.example` ships placeholders. Pino redaction serializers strip `password`, `token`, `cookie`, `authorization` fields (NFR-SE-05, §8). A D6 image/secret scan gate verifies no secret is baked into a layer.

---

## 4. Testing Strategy

Coverage target: **≥80% on domain modules** (NFR-MA-01); the ledger write path and reception posting are the highest-rigor targets (RISK-005). All test types run in **Vitest** (backend and frontend), no staging e2e (right-sized — architecture §7.2).

| Level | Tool | Scope | Target / gate |
|-------|------|-------|---------------|
| **Unit (domain)** | Vitest | Pure services: ledger math, costing, merger, attribution, alert eval, normalizer | ≥80% line/branch on `inventory/`, `procurement/`, `jobs/`, `integration/normalizer` (CI coverage gate). |
| **Property** | Vitest + fast-check | Ledger invariants: `spool.remaining == balance_after` of newest entry; floor-at-0; **ADR-009 live/reversed invariant** (every non-live consumption entry reversed exactly once); idempotency `UNIQUE(job_id,slot_ref)` no-op on replay | Part of the domain suite; failing invariant fails CI. |
| **Crash-injection** | Vitest (fault-inject around tx boundaries) | Kill mid-transaction in **reception posting** (§6.3) and **consumption/ledger posting** (§6.4) → assert full rollback, zero partial writes | NFR-RE-03 — **D2/D4/D5 exit criterion**, wired as a CI job. |
| **Integration (API)** | Vitest + **Fastify `inject()`** | Router + Zod + service + real SQLite (temp file) per operation; RFC 7807 error shapes; session-gate 401 on non-allow-listed routes | Critical paths per module; unauth-probe suite (NFR-SE-06). |
| **Contract (ACL)** | Vitest against **MS-1 recorded fixtures** (`fixtures/bambu/`) | `normalizer` + adapters parse recorded login/bind/report/tasks payloads; drift detection (unknown field ignored, missing→"unknown") | NFR-MA-02/03 — required before any adapter change ships (plan §7 prereq 5). |
| **Frontend component** | Vitest + React Testing Library | Forms (validation, RFC 7807 field mapping), DataTable, PrinterCard, AmsSlotPanel, SpoolLedgerTable, UserMenu logout flow | Core-flow coverage; axe smoke in D6. |
| **m5 DataFreshness gate** | Vitest + RTL, frozen clock | (1) every live-value container has descendant `[data-freshness][data-captured-at]` with `role="status"`; (2) computed state correct at ages 9s/11s/90s/121s — a 90s value resolves `aging`/`stale`, **never `fresh`** | **Standing required CI merge gate** (frontend spec §12.5). |
| **NFR-MA-02 dep-check** | dependency-cruiser (+ Biome import rule) | Zero Bambu imports outside `integration/`; nothing imports Fastify outside `http/`; only `inventory/ledger` writes `spool_ledger_entry` | **Required CI merge gate** (C-07). |
| **Bundle-size budget** | rollup-plugin-visualizer / size assertion | Initial JS < 200 KB gzipped (frontend spec §13) | **Build-fail threshold** in CI. |
| **Performance (seeded)** | Vitest/bench + seed script | 5k spools / 10k jobs / 100k ledger vs NFR-PE-01 (500ms p95); MQTT replay vs NFR-PE-03; 24h soak vs NFR-PE-04 | **D6** phase gate (not per-PR). |

**No staging e2e / no Playwright cloud suite** — deliberately omitted per architecture §7.2 (single-user self-host); the release smoke checklist (§7 / plan §7) + 24 h observation fills that role.

---

## 5. CI/CD Pipeline

**Platform: GitHub Actions.** Self-hosted Compose release — **no staging job, no prod cloud-deploy job** (architecture §7.2 override of SKILL Step 5). The pipeline builds and publishes a **versioned** immutable image; the human runs the documented Compose release procedure (§7).

### 5.1 Pipeline stages (right-sized)

```yaml
# .github/workflows/ci.yml — conceptual shape
name: CI
on:
  push: { branches: [main] }
  pull_request: { branches: [main] }
permissions: { contents: read, packages: write }
concurrency: { group: ${{ github.workflow }}-${{ github.ref }}, cancel-in-progress: true }

jobs:
  lint-typecheck:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@<sha>
      - uses: pnpm/action-setup@<sha>
      - uses: actions/setup-node@<sha>        # node 22, cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm biome ci .                    # lint + format check (Biome 2)
      - run: pnpm -r typecheck                  # tsc --noEmit, strict, both packages

  test:
    needs: lint-typecheck
    runs-on: ubuntu-latest
    steps:
      - <checkout + pnpm install --frozen-lockfile>
      - run: pnpm -r test -- --coverage         # Vitest: unit + property + integration(inject) + crash + contract(fixtures)
      - run: pnpm --filter frontend test:freshness   # m5 DataFreshness required gate
      - run: pnpm --filter frontend test:bundle-budget  # <200KB gzipped build-fail

  dep-check:                                     # NFR-MA-02 / C-07 — required gate
    needs: lint-typecheck
    runs-on: ubuntu-latest
    steps:
      - <checkout + install>
      - run: pnpm --filter backend depcruise    # zero Bambu imports outside integration/; edge/ledger rules

  security-audit:                                # m3: advisory on PRs, blocking only on main/release
    needs: lint-typecheck
    runs-on: ubuntu-latest
    steps:
      # On PRs: run but do not block on a transient transitive advisory (|| true → surfaces as a warning
      # in the job log). Blocking is enforced on main/release only; a documented waiver (audit-ignore
      # file + PR note referencing the advisory ID) is the escape hatch when no fixed version yet exists.
      - run: pnpm audit --audit-level=high ${{ github.ref == 'refs/heads/main' && '' || '|| true' }}

  build-image:
    needs: [test, dep-check, security-audit]
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      - <checkout>
      - uses: docker/build-push-action@<sha>     # multi-stage; platform linux/amd64
        with:
          push: true
          tags: |
            ghcr.io/<owner>/geekbox-app:${{ github.sha }}
            ghcr.io/<owner>/geekbox-app:v${{ steps.version.outputs.tag }}   # semver on release tags; NEVER bare latest
      - run: pnpm dlx @cyclonedx/cyclonedx-npm --output-file sbom.json    # SBOM
      - uses: actions/upload-artifact@<sha>        # attach sbom.json to the run/release
```

### 5.2 Gates & rules
- **Merge-blocking gates**: `lint-typecheck`, `test` (incl. coverage ≥80% domain, m5 freshness, bundle budget), `dep-check` (NFR-MA-02). **`security-audit`** is advisory (non-blocking) on PRs and **blocking on `main`/release tags** (m3) — so a transient transitive advisory with no fix yet cannot wall off unrelated PRs; a documented waiver (audit-ignore entry + advisory ID) covers the residual case.
- **Image tagging**: `:{sha}` on every main build; `:v{semver}` on release tags. **Never bare `latest`** in the compose file (plan §7).
- **Security posture** (devops-patterns): pin third-party actions to full SHA; least-privilege `permissions:`; SBOM per image; GitHub secret scanning on.
- **No `deploy-staging` / `deploy-production` jobs** — replaced by the §7 manual Compose release procedure.

---

## 6. Docker / Containerization

**Single service** `app` (architecture §5.1/§7.1). The frontend build stage produces static assets copied into the runtime image; **no second container, no Node SSR** (FE-1/ADR-014). No `db` service (Dev-1). `mem_limit: 768m`, `restart: unless-stopped`, non-root, node healthcheck.

### 6.1 Dockerfile (multi-stage `node:22-alpine`, non-root)

```dockerfile
# Stage 1 — build the SPA (static dist/)
FROM node:22-alpine AS fe-build
WORKDIR /repo
RUN corepack enable
COPY pnpm-*.yaml package.json ./
COPY packages ./packages
COPY apps/frontend ./apps/frontend
RUN pnpm install --frozen-lockfile --filter frontend...
RUN pnpm --filter frontend build            # → apps/frontend/dist

# Stage 2 — build the backend (compile TS → dist), then produce a prod-only deploy tree
FROM node:22-alpine AS be-build
WORKDIR /repo
RUN corepack enable
COPY pnpm-*.yaml package.json ./
COPY packages ./packages
COPY apps/backend ./apps/backend
RUN pnpm install --frozen-lockfile --filter backend...
RUN pnpm --filter backend build             # → apps/backend/dist ; rebuilds better-sqlite3 native
# Prune dev dependencies into an isolated, prod-only node_modules (keeps compiled better-sqlite3 binding).
# `pnpm deploy --prod` runs the native rebuild inside this same alpine/musl stage, so the better-sqlite3
# binding stays musl-consistent with the runtime image (same base). No dev tooling (vitest/biome/tsc) ships.
RUN pnpm deploy --prod --filter backend --legacy /deploy

# Stage 3 — runtime (prod deps only, non-root)
FROM node:22-alpine AS runtime
WORKDIR /app
RUN addgroup -S app && adduser -S app -G app
ENV NODE_ENV=production
COPY --from=be-build /repo/apps/backend/dist ./dist
COPY --from=be-build /repo/apps/backend/migrations ./migrations
COPY --from=be-build /deploy/node_modules ./node_modules              # PROD-ONLY deps incl. compiled better-sqlite3 (dev deps pruned; musl-consistent w/ this alpine base)
COPY --from=fe-build /repo/apps/frontend/dist ./public                # served by @fastify/static
COPY healthcheck.js ./
USER app
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --retries=3 CMD ["node","healthcheck.js"]
CMD ["node","dist/main.js"]                  # startup: validate env → migrate → listen → start supervisor
```

`healthcheck.js` performs a local `GET http://127.0.0.1:${PORT}/api/health` and exits non-zero on non-200 (architecture §7.1). **Runtime image slimming (m2):** the runtime `node_modules` is the **prod-only** tree from `pnpm deploy --prod` — dev dependencies (Vitest, Biome, tsc, drizzle-kit, fast-check) are excluded, shrinking the image and attack surface; the native **better-sqlite3** binding is rebuilt inside the alpine `be-build` stage so it stays **musl-consistent** with the alpine runtime base.

### 6.2 docker-compose.yml (normative shape — architecture §7.1)

```yaml
services:
  app:
    image: ghcr.io/<owner>/geekbox-app:${TAG}   # versioned tag only, never bare latest
    restart: unless-stopped                      # NFR-RE-01
    ports: ["8080:8080"]                         # LAN only; no other inbound
    env_file: .env                               # SESSION_SECRET, TOKEN_ENCRYPTION_KEY, etc.
    volumes: ["gbx-data:/data"]                  # geekbox.sqlite + backups/  (NFR-PO-02)
    mem_limit: 768m                              # NFR-PE-04 with headroom under 1 GB
    healthcheck:
      test: ["CMD","node","healthcheck.js"]
      interval: 30s
      retries: 3
volumes:
  gbx-data: {}
```

A local **dev** compose/override may mount source and run `pnpm dev` (Vite dev server proxying `/api` to Fastify), but production is the single image above.

---

## 7. Security Controls (OWASP Top 10:2025 — adapted to real controls)

Mapping kept from SKILL Step 7 but adapted to this project's controls. **A01 is the deny-by-default session gate, not RBAC** (C-03 single user, no permission model).

| OWASP risk | Implementation control (this project) | Trace |
|-----------|----------------------------------------|-------|
| A01 Broken Access Control | Global `onRequest` **deny-by-default session gate** with explicit allow-list `{login, setup, health, assets}`; 401 otherwise; verified every request. No RBAC (C-03). | NFR-SE-06, ADR-007, `http/session-gate.ts` |
| A02 Cryptographic Failures | **argon2id** password hashing; **AES-256-GCM** token vault, key from env (never persisted plaintext); **TLS cert verification ON** for both Bambu REST (443) and MQTTS (8883); session cookie HttpOnly/SameSite=Lax/Secure-when-HTTPS. | NFR-SE-01/02/03/04, ADR-007/010, `token-vault.ts` |
| A03 Injection | **Zod v4 at both boundaries** (HTTP input + Bambu payloads at ACL); Drizzle parameterized queries only (no string SQL). | ADR-002/006, `schemas.ts`, `normalizer.ts` |
| A04 Insecure Design | Login **throttle 10/15min → ≥30 s delay**; ACL blast-radius containment; append-only ledger with reversal-only corrections; kill switch (`integration.enabled`). | NFR-SE-07, ADR-006/009, `throttle.ts` |
| A05 Security Misconfiguration | `NODE_ENV=production` disables verbose errors; single RFC 7807 formatter never leaks stack traces; conservative security headers; no debug endpoints. | §8.2, `error-handler.ts` |
| A06 Vulnerable Components | pnpm lockfile pinned; `pnpm audit` in CI; **SBOM** per image; actions pinned to SHA. | §5 |
| A07 Authentication Failures | DB-backed opaque session (sliding 7-day); generic auth errors (no user-enumeration, AC-001.2); brute-force throttle; first-run setup route self-disables. | ADR-007, NFR-SE-07 |
| A08 Data Integrity Failures | Immutable, append-only ledger; idempotent upserts (`UNIQUE(job_id,slot_ref)`, `UNIQUE(reverses_entry_id)`); CI SBOM + pinned deps; migrations at startup only. | ADR-009, data-model §ledger |
| A09 Logging Failures | Pino JSON to stdout; **redaction serializers** for password/token/cookie/authorization; no secrets in images/logs; drift log-once-per-field-per-session. | NFR-SE-05, ADR-013, `logger.ts` |
| A10 SSRF | The only outbound targets are the **fixed** Bambu hosts (`api.bambulab.com`, `{region}.mqtt.bambulab.com`); no user-supplied URL fetching, no webhooks, no redirects. Region is an allow-listed enum, not a free URL. | architecture §3.2 |

D6 security pass verifies: route-table auth audit + unauthenticated probes (NFR-SE-06), image/secret scan (NFR-SE-05), brute-force test (NFR-SE-07), token-at-rest inspection (NFR-SE-02).

---

## 8. Observability (right-sized — NO OpenTelemetry, per ADR-013 / Dev-2)

> **This section overrides engineer SKILL Step 8.** OpenTelemetry/Prometheus/Tempo/tracing/alerting-on-call are **NOT** used — deliberate right-sizing for one user on one host (ADR-013, plan §7 "a dedicated observability stack is explicitly rejected as over-engineering"). Reinstatement path is documented in ADR-013 if scope ever changes.

### 8.1 Logging
- **Format**: structured JSON to stdout (`docker logs`), Pino.
- **Levels**: error/warn/info/debug via `LOG_LEVEL`.
- **Redaction**: serializers strip `password`, `token`, `cookie`, `authorization` (NFR-SE-05).
- **Drift**: ACL logs unknown/missing fields **once per field per session** to avoid log spam (ES-303.1), with a drift counter surfaced in the health panel.

### 8.2 Health & monitoring surfaces (the three real gates)
1. **`GET /api/health`** — component detail (DB reachable, migrations applied, integration state); drives the container `HEALTHCHECK`.
2. **FR-306 in-app integration health panel** — user-facing monitor: link state, token age, REST/MQTT health, last message time, next retry, drift counter (frontend spec §7 `IntegrationHealthPanel`).
3. **Container health / restart counts** — `docker compose ps` / `stats` (plan §7 monitoring gates).

### 8.3 Error handling
- RFC 7807 on every error via the single global Fastify error handler; stable `code` per domain error; Bambu upstream failures → 502 with sanitized detail + raw server-side log (ES-301.1); SSE errors degrade to 10 s polling (ADR-005).

### 8.4 Configuration
- Zod-validated env at startup, fail fast (§3). Runtime settings (region, kill switch, sync interval, cost rates, thresholds) live in DB and are UI-editable; **env `MQTT_REGION` overrides DB** (ADR-012). Feature flags: exactly two — `consumption.autopost` (temporary, removed in D6) and `integration.enabled` (permanent kill switch).

---

## 9. Code Quality Tooling

| Tool | Purpose | Configuration |
|------|---------|---------------|
| **Biome 2.x** | Lint + format (both packages) | `biome.json` at root; `pnpm biome ci .` in CI; includes the import-boundary rule complementing dependency-cruiser. |
| **TypeScript 5 strict** | Type safety | `tsconfig.base.json` strict + ESM NodeNext; `tsc --noEmit` in CI; no `any` escape hatches in domain code. |
| **dependency-cruiser** | Architecture rules (NFR-MA-02/C-07) | `.dependency-cruiser.cjs`: forbid `integration/bambu/**` imports outside `integration/`; forbid Fastify import outside `http/`; forbid `spool_ledger_entry` writes outside `inventory/ledger`. Required CI gate. |
| **Conventional Commits** | Commit format (optional) | Recommended for readable release notes; **not enforced** (solo dev, right-sized — no commitlint/husky mandated). |
| **drizzle-kit** | Migration generation | `drizzle.config.ts`; migrations committed; applied at startup. |
| **rollup-plugin-visualizer** | Bundle budget | Frontend build; <200 KB initial gzipped is a build-fail gate. |

Versioning is **manual semver tags** driving image tags (plan §7); no semantic-release/changesets automation (single package artifact, solo dev — right-sized).

---

## 10. Module Build Plan (D1–D6) — the heart of this deliverable

Order is **binding** (plan §3/§6 critical path: MS-0 → MS-1 → D1 → D2 → D3 → D5 → D6; D4 is the off-critical-path shock-absorber). Each phase is independently shippable. Columns: **module → FRs → operationIds exposed → tables owned/touched → files/dirs to create**. Milestone exit criteria are cited per phase.

### D1 — De-Risk & Foundation  (→ MS-1 spike verdict + MS-2 foundation)
Dependencies: design pipeline complete (DG-1/DG-2 locked); MS-0 record present. Scaffolding may proceed in parallel with the spike.

| Module | FRs | operationIds | Tables owned/touched | Files/dirs |
|--------|-----|--------------|----------------------|-----------|
| **Bambu API spike** (throwaway) | evidence for A-01…A-05 | — (scripts, not product) | — | `scripts/spike/*`, output → `fixtures/bambu/*` |
| **Repo scaffold + CI + Docker + config** | — | — | — | root files (§2.2), `Dockerfile`, `docker-compose.yml`, `healthcheck.js`, `.github/workflows/ci.yml`, `apps/*/`, `packages/shared/`, `src/config.ts`, `src/main.ts`, `src/app.ts`, `db/client.ts`, `db/migrate.ts` |
| **identity/auth** | FR-001, FR-002, FR-003 | `firstRunSetup`, `login`, `logout`, `getSession`, `changePassword` | `user_account`, `session` | `identity/*`, `identity/password.ts` (argon2id), `identity/session.ts`, `identity/throttle.ts` |
| **HTTP edge foundation** | (cross-cutting) | `health` | — | `http/session-gate.ts`, `http/error-handler.ts`, `http/static.ts`, `http/plugins/*`, `GET /api/health` handler |
| **bus + migration baseline** | — | — | (baseline of all §2–§6 tables) | `bus/event-bus.ts`, `db/schema/*`, `migrations/0000_baseline.sql` |
| **frontend shell + auth routes** | FR-001/002/003 (UI) | consumes auth ops | — | `apps/frontend` scaffold, `router.tsx`, `routes/login.tsx`, `routes/setup.tsx`, `routes/_app.tsx`, `components/shell/*`, `components/ui/*`, `sse/event-bridge.ts` (stub), `components/data/DataFreshness.tsx` + m5 test |
**MS-2 exit**: clean-host `docker compose up -d` → login-protected empty app; CI green; migration baseline applied; MS-1 verdict + fixtures committed. **MS-1 decision rule**: any A-01…A-04 FAILED → architect re-engaged to activate the matching fallback adapter (ADR-006/012) before D3 detail planning.

### D2 — Inventory Core  (→ MS-3)
Dependencies: D1 (auth, DB, CI, bus). This is the book of record.

| Module | FRs | operationIds | Tables owned/touched | Files/dirs |
|--------|-----|--------------|----------------------|-----------|
| **inventory/catalog — vendors** | FR-201 | `listVendors`, `createVendor`, `getVendor`, `updateVendor`, `archiveVendor` | `vendor` | `inventory/catalog/` (vendor router/schemas/service/repository/models) |
| **inventory/catalog — products** | FR-101 | `listProducts`, `createProduct`, `getProduct`, `updateProduct`, `archiveProduct` | `filament_product` | `inventory/catalog/` (product) |
| **inventory/spool** | FR-102 (manual), FR-107 (partial) | `listSpools`, `registerSpool`, `getSpool`, `updateSpool`, `transitionSpoolStatus` | `spool` | `inventory/spool/*` |
| **inventory/ledger (write path)** | FR-103, FR-104 | `getSpoolLedger`, `adjustSpoolWeight` | `spool_ledger_entry` (**sole writer**), `spool` (denorm balance) | `inventory/ledger/ledger-write.ts`, `repository.ts`, `invariants.ts` |
| **inventory/alerts** | FR-106 (partial; AC-106.3→D4) | `getLowStockAlerts` (+ contributes low-stock block to `getInventorySummary`) | reads `spool`/`filament_product` | `inventory/alerts/*` (subscribes `StockLevelChanged`, emits `LowStockThresholdCrossed`/`LowStockCleared`) |
| **inventory/valuation** | FR-108, FR-105 | `getInventorySummary` (**sole owner**) | reads `spool` | within `inventory/*` service |
| **system/edge — backup** (sensitive) | NFR-RE-04 (RISK-009) | `downloadBackup` (GET /api/backup) | reads `geekbox.sqlite` → writes timestamped file in `BACKUP_DIR`; touches no domain table | `http/backup-route.ts` (owns the endpoint); `system/backup.ts` (shared `VACUUM INTO` mechanism, also called by `scripts/backup.mjs`) |
| **frontend inventory** | FR-101/102/103/104/105/106/107/108 | above | — | `routes/_app/inventory.tsx`, `inventory.spools.$spoolId.tsx`, `catalog.products.tsx`, `catalog.vendors.tsx`, `settings.low-stock.tsx`; `components/data/SpoolLedgerTable.tsx`, `feature/LowStockAlertPanel.tsx`; `forms/product`, `forms/spool` |
| **frontend settings.backup** | (UI for NFR-RE-04) | consumes `downloadBackup` | — | `routes/_app/settings.backup.tsx` (download action → `GET /api/backup`, `application/octet-stream`) |
**Events**: `StockLevelChanged`, `LowStockThresholdCrossed`, `LowStockCleared`. **MS-3 exit**: a real spool tracked registration→manual deduction→depletion; **ledger property + crash-injection tests pass** (NFR-RE-03, RISK-005). Backup/restore working by end of D2 (plan §7 prereq 3, pulled forward) — **both** the CLI one-liner (`scripts/backup.mjs`) and the browser-accessible `GET /api/backup` endpoint share the same `VACUUM INTO` mechanism (`system/backup.ts`).

> **`downloadBackup` placement rationale (D2, not D6).** The endpoint is placed in **D2** — not D6 — because plan §7 rollout prerequisite 3 requires backup/restore working **before the FIRST release that holds real data** (end of D2 at latest). Since D2 is the book of record and begins accumulating real spool/ledger data, the backup path must exist by end of D2. The endpoint is **sensitive** (streams the full database): it is a session-gated route (NOT on the deny-by-default allow-list, per RISK-009 / NFR-RE-04), implemented as `VACUUM INTO` to a timestamped file in `BACKUP_DIR`, then streamed to the client as `application/octet-stream`. The CLI script (`scripts/backup.mjs`) remains the documented one-liner and shares the same mechanism.

### D3 — Printer Integration & Live Dashboard  (→ MS-4, GK-M1 closed)
Dependencies: D2 (spools to map), MS-1 fixtures/params. This is the highest-residual-risk core value.

| Module | FRs | operationIds | Tables owned/touched | Files/dirs |
|--------|-----|--------------|----------------------|-----------|
| **integration/linking** | FR-301 | `getIntegrationStatus`, `linkBambuAccount`, `verifyLinkCode`, `linkWithManualToken`, `unlinkBambuAccount`, `getIntegrationSettings`, `updateIntegrationSettings` | `cloud_link` | `integration/linking/*`, `integration/token-vault.ts` |
| **integration/bambu adapters** | FR-303 | (internal) | reads `cloud_link` | `integration/bambu/rest-adapter.ts`, `mqtt-adapter.ts`, `raw-schemas.ts`, `fallback/manual-token.ts`, `fallback/rest-poll-telemetry.ts` |
| **integration/supervisor + normalizer** | FR-303, FR-306, FR-307 | (drives SSE) | `telemetry_snapshot` (UPSERT) | `integration/supervisor.ts`, `normalizer.ts`, `ports.ts` |
| **printers + AMS mapping** | FR-302, FR-305 (amended), FR-107 (AMS transitions) | `listPrinters`, `registerPrinterManually`, `refreshPrinters`, `updatePrinter`, `getTelemetrySnapshot`, `listSlots`, `mapSlot`, `unmapSlot`, `confirmMapping` | `printer`, `ams_slot_mapping` (incl. external `254:0`) | `integration/linking` (printers), `inventory/ams-mapping/*` |
| **SSE broadcaster (live)** | FR-304, FR-306, FR-307 | `eventStream` | reads `telemetry_snapshot` | `http/sse.ts` (throttled telemetry, integrationStatus, mappingVerify) |
| **frontend dashboard** | FR-304/305/306/307, FR-302 | above + SSE | — | `routes/_app/index.tsx` (Dashboard), `settings.integration.tsx`; `feature/PrinterCard.tsx`, `AmsSlotPanel.tsx`+`SlotTile`, `IntegrationHealthPanel.tsx`, `PrintersPanel.tsx`+`PrinterRow`, `shell/Banner.tsx`; wire `sse/event-bridge.ts` |
**Events**: `TelemetrySnapshotUpdated`, `TrayContentsChanged`, `MappingVerifyFlagged`, `IntegrationStateChanged`. **MS-4 exit**: real print live on dashboard ≤10 s; AMS + external holder `254:0` map to real spools (amended FR-305 ACs); kill-network + token-expiry drills pass (NFR-RE-02, FR-307); inventory/procurement verified functional with `integration.enabled=off` (NFR-RE-05); **`depcruise` zero-Bambu-imports gate passes** (C-07).

### D4 — Procurement, Inbound & Goods Reception  (→ MS-5)  *(off critical path — schedule shock-absorber)*
Dependencies: D2 (products, spools, alerts). Independent of D3.

| Module | FRs | operationIds | Tables owned/touched | Files/dirs |
|--------|-----|--------------|----------------------|-----------|
| **procurement/po** | FR-202, FR-203 | `listPurchaseOrders`, `createPurchaseOrder`, `getPurchaseOrder`, `updatePurchaseOrder`, `transitionPoStatus` | `purchase_order`, `purchase_order_line`, `po_status_event` | `procurement/po/*` |
| **procurement/inbound** | FR-204 | `getInboundOverview` | reads `purchase_order`(+lines) | `procurement/inbound/*` (read model) |
| **procurement/reception** | FR-205, FR-206, FR-207, FR-102 (reception path) | `listReceptions`, `postReception`, `getGoodsReceipt` | `goods_receipt`, `goods_receipt_line`; **same-tx**: `spool` (create), `spool_ledger_entry` (via ledger path), `purchase_order` status | `procurement/reception/*` (one atomic tx; calls `inventory/ledger`) |
| **alerts on-order annotation** | FR-106 (AC-106.3) | (in alerts) | reads `purchase_order` | extend `inventory/alerts` |
| **frontend procurement** | FR-201/202/203/204/205/206/207 | above | — | `routes/_app/inbound.tsx`, `purchase-orders.tsx`, `purchase-orders.$id.tsx`, `purchase-orders.$id.receive.tsx`; `forms/po`, `forms/reception` (16-multi-step-wizard) |
**Events**: `SpoolsReceivedIntoStock`, `StockLevelChanged`. **MS-5 exit**: PO→ordered→inbound→partial reception→spools in stock→auto-complete; **reception crash-injection test passes** (NFR-RE-03); reception ≤2 min.

### D5 — Print Jobs & Costing  (→ MS-6)
Dependencies: D2 (ledger), D3 (mappings, telemetry, task-sync auth), D4 (soft — actual prices). The headline outcome.

| Module | FRs | operationIds | Tables owned/touched | Files/dirs |
|--------|-----|--------------|----------------------|-----------|
| **integration/task-sync** | FR-308 | `syncTaskHistory` | reads `cloud_link` | `integration/task-sync.ts` (≥30 min scheduler) |
| **jobs/job (merger)** | FR-401, FR-406 | `listJobs` (summary block), `createManualJob`, `getJob`, `correctJob`, `exportJobsCsv` | `print_job` (upsert by `bambu_task_id` / time-window) | `jobs/job/*` |
| **jobs/consumption** | FR-402, FR-405 | `attributeUsage` | `filament_usage` (`UNIQUE(job_id,slot_ref)`); **via ledger path**: `spool_ledger_entry`, `spool` | `jobs/consumption/*` (autopost flag; unattributed capture; reverse-and-repost) |
| **jobs/costing** | FR-403, FR-404 | `recalculateJobCost`, `getCostRates`, `updateCostRates` | `cost_rate_settings`, `cost_calculation`, `printer_power_draw` | `jobs/costing/*` (immutable frozen-input snapshots) |
| **frontend jobs/costing** | FR-401/402/404/405/406, FR-403, FR-308 | above + SSE `jobUpdate` | — | `routes/_app/jobs.tsx`, `jobs.$id.tsx`, `jobs.new.tsx`, `settings.cost-rates.tsx`; `feature/CostBreakdownPanel.tsx`; `forms/manual-job`, `forms/cost-rates` |
**Events**: `PrintTasksFetched`, `PrintJobObservedComplete`, `FilamentConsumptionRecorded`, `PrintJobCosted`. **Feature flag** `consumption.autopost`: ships OFF (deductions shown "pending preview" via SSE) → ~1 week verified → ON → flag+preview code removed in D6 (plan §7, RISK-005/007). **MS-6 exit**: real print → job with attributed consumption deducted **exactly once** + stored cost snapshot; re-sync yields no duplicates/double-deductions (AC-308.2, AC-402.2); ≥95% of prints costed; autopost graduated.

### D6 — Hardening & v1.0 Release  (→ MS-7)
Dependencies: D1–D5. No new FRs.

| Activity | Tie | Files/dirs |
|----------|-----|-----------|
| Seeded perf run (5k/10k/100k) vs NFR-PE-01; MQTT replay vs NFR-PE-03; 24 h soak vs NFR-PE-04 | performance gates | `apps/backend/tests/perf/`, seed script under `scripts/` |
| Security pass: route auth audit + unauth probes, image/secret scan, brute-force, token-at-rest | NFR-SE-02/05/06/07 | CI security job hardening |
| Backup→wipe→restore drill; kill-container recovery | NFR-RE-01/04 | `scripts/restore.md` drill executed |
| a11y + responsive audit (axe + keyboard); cross-browser smoke | NFR-US-01/02, NFR-CO-01 | frontend test additions |
| README (setup/backup/re-link/limitations); v1.0 tag + release checklist | NFR-MA-04, plan §7 | `README.md`, `docs/release-notes/v1.0.md` |
| Remove `consumption.autopost` flag + preview code | plan §7 | across `jobs/consumption` + frontend |
**MS-7 exit**: every NFR row has a recorded measurement meeting threshold (or user-accepted documented deviation); restore drill succeeded on clean host; v1.0 images tagged and running as the daily instance.

### 10.1 Cross-phase dependency & event summary
- **Single ledger writer** (`inventory/ledger`) is created in D2 and **reused** by D4 (reception) and D5 (consumption) — never re-implemented (ADR-009, `depcruise` enforced).
- **Event bus** (D1) carries all 12 domain events post-commit; SSE broadcaster (D3) fans the 5 UI message types to the browser.
- **ACL boundary** (D3) is the only place Bambu types exist; task-sync (D5) and adapters live behind it (C-07).

---

## 11. Traceability Summary
- **Every FR → module → operationId → table → files** is enumerated in §10 (D1–D6). All 32 FRs land in D1–D5; NFRs designed-in per phase and verified in D6 (matches plan §10).
- **All 62 API operations are placed** — every operationId from API Contracts v2 is owned by exactly one module/phase in §10, including **`downloadBackup` (GET /api/backup)**, owned by the **system/edge backup module in D2** (VACUUM INTO → streamed `application/octet-stream`; sensitive per RISK-009 / NFR-RE-04; backs `settings.backup.tsx`). No contract operation is dropped or deferred.
- **Stack lineage**: §1 carries both overlays + all four inherited deviations verbatim; no new tech introduced (universal-frameworks Downstream Translation + Traceability).
- **ADR anchors**: SQLite/migrations (ADR-003), listener/ACL (ADR-004/006), SSE (ADR-005), auth/session (ADR-007), ledger/idempotency (ADR-009), token vault (ADR-010), external `254:0` + ES-107.1 (ADR-011), fallback provisions (ADR-012), right-sized observability (ADR-013), frontend SPA (ADR-014).
- **Right-sizing anchors**: no OTel (ADR-013/Dev-2), no staging (architecture §7.2), no cache layer (§8.5), no RBAC (C-03) — each cited at point of use (§1.3, §5, §7, §8).

---

## 12. Open Items / Exceptions for Gatekeeper Attention
1. **Monorepo recommendation** (§2.1) — a structural recommendation, not an upstream lock. If commander prefers polyrepo, the shared-schema package must be published to preserve the one-validator invariant. Flagged per SKILL edge case.
2. **MS-1 fallback contingency** — if the D1 spike FAILs A-01…A-04, ADR-006/012 fallback adapters activate; the D3 module rows (adapters) shift to fallback implementations. This is a pre-authorized amendment path (Backend Stack Lock §6), not a stack change.
3. **Q-01/Q-02/Q-05/Q-06 pending-user** — inherited as PENDING (Backend Stack Lock §4, ADR-012). This spec is valid under all SRS §7.2 fallbacks (manual token, manual serial via `registerPrinterManually`, REST-poll telemetry). No spec content depends on a pending answer.
4. **Right-sizing overrides of the engineer SKILL templates** (§1.3, §5, §8) are intentional and ADR-backed — gatekeeper should confirm they are correctly attributed (ADR-013, architecture §7.2) rather than treated as omissions.
