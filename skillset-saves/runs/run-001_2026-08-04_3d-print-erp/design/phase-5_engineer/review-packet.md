---
type: review-packet
pipeline: design
phase: 5
skill: engineer
version: 2
status: revised
created: 2026-08-05T00:00:00Z
revised: 2026-08-05T00:00:00Z
---

# Review Packet — Implementation Specification (Phase 5, engineer)

**Run**: run-001_2026-08-04_3d-print-erp · **Pipeline**: design · **Phase**: 5 (final technical) · **Mode**: PIPELINE (commander-delegated; engineer does NOT self-submit to gatekeeper) · **Date**: 2026-08-05 · **Attempt**: 2 (revised — see Change Summary)

---

## 1. Source skill
`engineer` — Implementation Specification & DevOps (SKILL Steps 1–10, Output Format §1–§9 + the requested Module Build Plan).

## 2. Deliverable produced
`deliverable_implementation-spec.md` (v1, status draft) — one consolidated Implementation Specification containing all 9 SKILL output sections PLUS the module-by-module Build Plan (D1–D6) that is the heart of the deliverable.

## 3. Approved upstream context used
- SRS v1 (32 FR / 28 NFR, C-01…C-07) — FR/NFR traceability targets.
- Domain Analysis v1 — 5 bounded contexts (module boundaries).
- Project Plan v2 — D1–D6 build order, MS-0…MS-7, §7 rollout, DG-1…DG-6, feature flags, RISK register.
- Architecture v2 (Arc42) — §5.2 module map (domain-first src/ + integration ACL), §7.1/§7.2 deployment (single `app`, no staging), §8 crosscutting, CI-enforced dependency rule.
- ADRs 001–013 (+ Frontend ADR-014) — every design decision anchored.
- API Contracts v2 — 62 REST operationIds (mapped to modules in §10), 12 domain events, SSE (5 message types).
- Data Model v2 — 18 core tables (+ printer_power_draw, cost_calculation; optional telemetry_history) mapped to owning modules; ledger rules (ADR-009).
- Backend Stack Lock v1 + Frontend Stack Lock v2 + Frontend Spec v2 — inherited verbatim.
- Overlays: `node-typescript.md`, `react-tanstack.md`.

## 4. Inherited Stack Locks summary

### Overlays (exact filenames)
- Backend: `C:\Users\leifm\.claude\skills\design\tech-stacks\node-typescript.md`
- Frontend: `C:\Users\leifm\.claude\skills\design\tech-stacks\react-tanstack.md`

### Version tuples implemented
- **Backend**: Node 22 LTS · TypeScript 5 strict ESM (NodeNext) · Fastify 5 · Zod v4 · Drizzle ORM + drizzle-kit · better-sqlite3 11.x (SQLite WAL, foreign_keys=ON) · MQTT.js 5 · node-argon2 (argon2id) · node:crypto AES-256-GCM · Pino · Vitest · Biome 2 · pnpm · node:22-alpine (non-root, linux/amd64) · SSE.
- **Frontend**: Node 22 (tooling) · Vite 8 (Rolldown) · React 19 (Compiler on) · TypeScript 5 strict · TanStack Router 1 / Query 5 / Table 8 / Form 1 / Virtual 3 · Zod 4 · Tailwind 4 · shadcn/ui (Radix) · CVA + tailwind-merge/clsx · lucide-react · zustand 5 · native EventSource · Biome 2 · pnpm.

### ADR-backed deviations (carried, NOT reopened)
| ID | Deviation | ADR |
|----|-----------|-----|
| Dev-1 | SQLite instead of overlay Postgres | ADR-003 |
| Dev-2 | No OpenTelemetry/Prometheus/Tempo stack | ADR-013 |
| Dev-3 | Session-cookie auth instead of passkeys/JWT | ADR-007 |
| FE-1 | react-tanstack **without TanStack Start** (pure SPA, static dist/) | ADR-014 |

No new deviations introduced. No stack-lock conflicts detected (one TS+Zod v4+Biome+pnpm toolchain; single `app` container serves both halves).

## 5. Right-sizing overrides of the engineer SKILL's generic templates (intentional, ADR-backed)
- **SKILL Step 8 OpenTelemetry/Prometheus/tracing → REMOVED.** Replaced with Pino JSON logs + `GET /api/health` + FR-306 integration panel (ADR-013, architecture §8.3, plan §7). Cited in spec §1.3 and §8.
- **SKILL Step 5 staging deploy job → REMOVED.** No staging (architecture §7.2, single-user self-host); release = backup→pull→up→smoke→24h observe (plan §7). Cited in spec §1.3 and §5.
- **SKILL Step 7 OWASP mapping → KEPT but ADAPTED.** A01 = deny-by-default session gate, not RBAC (C-03). Cited in spec §7.

## 6. Key structural decisions in the deliverable
- **pnpm monorepo** (`apps/backend`, `apps/frontend`, `packages/shared`) — justified by single-container topology + shared Zod schema idiom + one CI/artifact (spec §2.1). Recommendation, not an upstream lock (flagged for gatekeeper).
- Domain-first backend `src/` mirroring architecture §5.2; `integration/bambu/**` ACL boundary enforced by dependency-cruiser (NFR-MA-02/C-07).
- Frontend static `dist/` served by `@fastify/static` from the same image (no second service, no SSR).

## 7. Notable ADR-backed / potentially-scrutinized items for the gatekeeper
1. **Monorepo vs polyrepo** (spec §2.1, §12.1) — structural recommendation; polyrepo would need a published shared-schema package.
2. **Right-sizing removals** (no OTel §8, no staging §5) — confirm they are correctly attributed to ADR-013 / architecture §7.2 and NOT treated as omissions.
3. **MS-1 fallback contingency** (spec §12.2) — D3 adapter rows shift to fallback adapters if the spike FAILs A-01…A-04; pre-authorized path (Backend Stack Lock §6), not a stack change.
4. **Q-01/Q-02/Q-05/Q-06 pending-user** (spec §12.3) — inherited PENDING; spec valid under all SRS §7.2 fallbacks; no content depends on a pending answer.
5. **Single ledger writer reuse** — verify the build plan reuses `inventory/ledger` across D2/D4/D5 rather than re-implementing (ADR-009); enforced by dependency-cruiser rule.

## 8. Anti-gaming self-check (universal-frameworks §Adversarial)
- **Existence**: every §10 row cites real operationIds (from API Contracts v2) and real table names (from Data Model v2) — no phantom endpoints.
- **Completeness**: all **62** operations grouped and assigned to a module/phase — including `downloadBackup` (GET /api/backup), now owned by the **system/edge backup module in D2** (corrected in attempt 2; see Change Summary M1); all 18 core tables assigned an owning module; all 32 FRs mapped; all 12 events placed; all 5 SSE message types wired.
- **Proportionality**: controls/testing/observability match the right-sized, ADR-backed reality — no reduction below approved locks was normalized silently (each removal cites its ADR).
- **Consistency**: no tech added beyond the locks; no architecture decision made; conflicts with the SKILL's generic templates are called out, not silently absorbed.

## 9. Handoff
Return deliverable + this packet to **commander** for the gatekeeper-design submission. Engineer does not self-submit (pipeline mode).

---

## Change Summary — Attempt 2 (Substantive Change Detection)

Gatekeeper-design returned **REVISE** on attempt 1 with 1 mandatory Major (M1) + 3 minors (m1/m2/m3). All other sections were **ACCEPTED** and were **left untouched** (stack-lock fidelity + 4 deviations, right-sizing attribution, single-write-path enforcement, repo structure, testing/CI/Docker aside from the two targeted m2/m3 edits). Below are the exact before/after excerpts.

### M1 (Major, mandatory) — `downloadBackup` was dropped; "all 62 operations placed" was false; `settings.backup.tsx` had no backing endpoint
**Resolution: OPTION (a)** — added a system/edge module that OWNS `downloadBackup`, placed in **D2**, wired the frontend page, and corrected the completeness claim. Contract surface kept fully intact (all 62 ops now placed).

**(a) New §10 D2 module row (added):**
> `| **system/edge — backup** (sensitive) | NFR-RE-04 (RISK-009) | `downloadBackup` (GET /api/backup) | reads `geekbox.sqlite` → writes timestamped file in `BACKUP_DIR`; touches no domain table | `http/backup-route.ts` (owns the endpoint); `system/backup.ts` (shared `VACUUM INTO` mechanism, also called by `scripts/backup.mjs`) |`

**(b) New D2 placement rationale (added):**
> "**`downloadBackup` placement rationale (D2, not D6).** … plan §7 rollout prerequisite 3 requires backup/restore working before the FIRST release that holds real data (end of D2 at latest) … sensitive (streams the full database): session-gated route (NOT on the deny-by-default allow-list, per RISK-009 / NFR-RE-04), implemented as `VACUUM INTO` to a timestamped file in `BACKUP_DIR`, then streamed … `application/octet-stream`."

**(c) Frontend wiring (added D2 row):**
> `| **frontend settings.backup** | (UI for NFR-RE-04) | consumes `downloadBackup` | — | `routes/_app/settings.backup.tsx` (download action → `GET /api/backup`, `application/octet-stream`) |`

Also added supporting structure in §2.3: `http/backup-route.ts` and `system/backup.ts` (shared VACUUM INTO mechanism, called by both the endpoint and `scripts/backup.mjs`).

**(d) Corrected completeness claim — §11 (spec):**
- BEFORE: `- **Every FR → module → operationId → table → files** is enumerated in §10 (D1–D6). All 32 FRs land in D1–D5; NFRs designed-in per phase and verified in D6 (matches plan §10).`
- AFTER: adds `- **All 62 API operations are placed** — every operationId from API Contracts v2 is owned by exactly one module/phase in §10, including **`downloadBackup` (GET /api/backup)**, owned by the **system/edge backup module in D2** … No contract operation is dropped or deferred.`

**(e) Corrected completeness claim — review-packet §8 (this file):**
- BEFORE: `- **Completeness**: all 62 operations grouped and assigned to a module/phase; …`
- AFTER: `- **Completeness**: all **62** operations grouped and assigned to a module/phase — including `downloadBackup` (GET /api/backup), now owned by the **system/edge backup module in D2** (corrected in attempt 2 …); …`

### m1 (minor) — complete the per-module FR→operationId trace for FR-105 and FR-406
**FR-105 (inventory summary):**
- BEFORE: `| **inventory/valuation** | FR-108 | (in `getInventorySummary`) | reads `spool` | within `inventory/*` service |`
- AFTER: `| **inventory/valuation** | FR-108, FR-105 | `getInventorySummary` | reads `spool` | within `inventory/*` service |`

**FR-406 (jobs summary block + CSV):**
- BEFORE: `| **jobs/job (merger)** | FR-401 | `listJobs`, `createManualJob`, `getJob`, `correctJob`, `exportJobsCsv` | … |`
- AFTER: `| **jobs/job (merger)** | FR-401, FR-406 | `listJobs` (summary block), `createManualJob`, `getJob`, `correctJob`, `exportJobsCsv` | … |`

### m2 (minor) — prune dev dependencies from the runtime Docker image (preserving better-sqlite3 musl binding)
- BEFORE (§6.1 be-build stage ended at `RUN pnpm --filter backend build`; runtime copied the full dev+prod tree): `COPY --from=be-build /repo/apps/backend/node_modules ./node_modules   # incl. compiled better-sqlite3`
- AFTER: be-build now adds `RUN pnpm deploy --prod --filter backend --legacy /deploy` (prod-only tree, native rebuild inside the same alpine/musl stage); runtime copies `COPY --from=be-build /deploy/node_modules ./node_modules   # PROD-ONLY deps incl. compiled better-sqlite3 (dev deps pruned; musl-consistent w/ this alpine base)`. One-line note added under the Dockerfile explaining the slimming + musl consistency.

### m3 (minor) — scope the CI `pnpm audit --audit-level=high` gate so a transient transitive advisory does not block unrelated PRs
- BEFORE (§5.1): `security-audit:` step was `- run: pnpm audit --audit-level=high` (unconditionally blocking on every PR).
- AFTER: `- run: pnpm audit --audit-level=high ${{ github.ref == 'refs/heads/main' && '' || '|| true' }}` — advisory on PRs, **blocking on main/release**, with a documented waiver path (audit-ignore + advisory ID). §5.2 gate list updated to state `security-audit` is advisory on PRs and blocking on main/release.

### Files modified (absolute paths)
- `C:\Users\leifm\Documents\Workspace\GeekBOX Print Management\skillset-saves\runs\run-001_2026-08-04_3d-print-erp\design\phase-5_engineer\deliverable_implementation-spec.md` (frontmatter → v2/revised + `revised:`; §2.3 backup route/module; §5.1/§5.2 audit scoping; §6.1 Dockerfile prune; §10 D2 backup rows + rationale, FR-105/FR-406 trace; §11 62-ops claim)
- `C:\Users\leifm\Documents\Workspace\GeekBOX Print Management\skillset-saves\runs\run-001_2026-08-04_3d-print-erp\design\phase-5_engineer\review-packet.md` (frontmatter added → v2/revised; §8 completeness claim corrected; this Change Summary section added)

### Accepted sections left untouched (not re-litigated)
§1 stack locks + 4 deviations + right-sizing attribution; §3 env contract; §4 testing strategy; §7 security controls; §8 observability; §9 code-quality tooling; §10 D1/D3/D4/D5/D6 phases (except the two m1 trace cells + the D2 backup additions); §12 open items. No new technology, no new deviation, no architecture decision introduced.
