---
type: deliverable
pipeline: design
phase: 3
skill: architect
name: Backend Stack Lock — GeekBOX Print Management
version: 1
status: submitted
created: 2026-08-04T03:30:00Z
---

# BACKEND STACK LOCK: GeekBOX Print Management
**Version**: 1.0
**Authors**: architect (Supreme Team design pipeline, Phase 3)
**Status**: Submitted (pipeline mode — commander owns gatekeeper cycle)
**Date**: 2026-08-04
**Gate discharged**: **DG-1** (Project Plan v2.0 §8) — all prerequisites P1–P7 addressed below

---

## 1. Selected Overlay

| Field | Value |
|-------|-------|
| **Overlay file** | `tech-stacks/node-typescript.md` (exactly one; locked) |
| **Overlay scope applied** | Backend runtime, HTTP framework, validation, ORM choice, testing, lint/build, container pattern |
| **Rejected overlays** | `bun-typescript.md`, `deno-typescript.md`, `python-fastapi.md`, `rust-axum.md`, `go-gin.md`, `dotnet-aspnet.md` — comparison in ADR-002 |

## 2. Version Tuple (canonical — downstream phases inherit verbatim)

| Component | Lock | Overlay conformance |
|-----------|------|---------------------|
| Runtime | **Node.js 22 LTS** | Per overlay |
| Language | **TypeScript 5.x**, strict mode, ESM (`NodeNext`), overlay tsconfig verbatim | Per overlay |
| HTTP framework | **Fastify 5.x** (overlay default) | Per overlay |
| Runtime validation | **Zod v4** at every external boundary (HTTP input + Bambu payloads at the ACL) | Per overlay |
| ORM / migrations | **Drizzle ORM + drizzle-kit** (overlay's listed SQL-first option) | Per overlay (option selected) |
| **Database** | **SQLite 3.4x via better-sqlite3 11.x, WAL mode, `foreign_keys=ON`** | **DEVIATION Dev-1 → ADR-003** |
| MQTT client | **MQTT.js 5.x** (`mqtt` package) — TLS mqtts:8883, username/password auth, reconnect hooks for custom backoff | Addition (overlay silent on MQTT) → ADR-004/ADR-006 |
| Password hashing | **node-argon2 (argon2id)** — NFR-SE-01 | Addition (constraint-driven) → ADR-007 |
| Token encryption | **node:crypto AES-256-GCM**, key from env/secret file — NFR-SE-02 | Addition → ADR-010 |
| Logging | **Pino** (structured JSON) | Per overlay |
| Observability | **Pino + `/api/health` + in-app integration health panel only; NO OpenTelemetry stack** | **DEVIATION Dev-2 → ADR-013** |
| Session/auth model | **DB-backed opaque session cookie (HttpOnly, SameSite=Lax)** | **DEVIATION Dev-3 → ADR-007** (overlay suggests passkeys/JWT; user constraint C-03 mandates session cookie) |
| Test runner | **Vitest**; Fastify `inject()` for API tests; recorded-fixture contract tests for the ACL | Per overlay |
| Lint/format | **Biome 2.x** | Per overlay |
| Package manager | **pnpm** | Per overlay |
| Container | Multi-stage Docker, **node:22-alpine**, non-root user, linux/amd64 | Per overlay |
| Live-update transport | **SSE** (native `Readable` stream from Fastify) | Addition (DG-3) → ADR-005 |

## 3. Decision Drivers (ranked)

1. **Solo maintainability (C-05, plan §9 "no stack tourism")** — one language (TypeScript) across backend and the Phase-4 frontend lock eliminates a whole second toolchain; largest ecosystem for both halves.
2. **Long-running MQTT listener (C-02, FR-303/306)** — Node's event-loop model is a natural fit for an I/O-bound persistent listener; MQTT.js is the most battle-tested JS MQTT client (TLS, auth, reconnect events) and satisfies DG-1 P3.
3. **Right-sized footprint (NFR-PE-04 ≤ 1 GB)** — single Node process + embedded SQLite ≈ 150–300 MB steady state; one compose service holds all state in one volume (P4, P6).
4. **Transactional invariants (P4)** — better-sqlite3's synchronous transactions give trivially serialized, ACID reception/ledger postings (FR-103/FR-205, ES-206.1) with zero connection-pool complexity.
5. **Docker/linux-amd64 (P6)** — node:22-alpine standard OCI image, proven on Windows-hosted Docker Engine.

## 4. Constraints Inherited (from researcher/planner — restated, all honored)

- C-01 Bambu Cloud REST `https://api.bambulab.com` + MQTTS 8883 only; C-02 docker-compose self-hosted, NOT serverless/Vercel/Azure, persistent listener process; C-03 single user, hashed password + session cookie, no RBAC; C-04 greenfield; C-05 solo dev; C-06 zero cloud spend; C-07 mandatory ACL (NFR-MA-02/03).
- DG-1 prerequisites: P1 ✓ (approved SRS/DA consumed), P2 ✓ (plan v2.0 approved), P3 ✓ (MQTT.js: TLS 8883 + username/password + reconnect — verified at MS-1 spike against live broker), P4 ✓ (ADR-003 §validation), P5 ✓ (GK-M1 FR-305 amendment + ES-107.1 resolution in `deliverable_architecture.md` §8.9 and ADR-011), P6 ✓ (alpine image, ≤ 1 GB), P7 ✓ **with disclosure**: Q-01/Q-02/Q-05/Q-06 are PENDING-USER (escalated to admiral); this lock and the architecture are explicitly valid under every SRS §7.2 pre-approved fallback (ADR-012). No stack choice depends on any pending answer.

## 5. Deviation Register (each cross-linked to an ADR)

| ID | Deviation from overlay | Justification | ADR |
|----|------------------------|---------------|-----|
| Dev-1 | Database engine **SQLite** instead of the PostgreSQL shown in the overlay's persistence examples | Single user, single process, seed volumes trivially small (5k spools / 10k jobs / 100k ledger rows); one-file backup discharges NFR-RE-04; removes a whole compose service from the 1 GB budget | **ADR-003** |
| Dev-2 | **No OpenTelemetry/Prometheus/Tempo stack** (overlay §Observability) | Plan §7 explicitly rejects an observability stack as over-engineering for one user on one host; Pino JSON logs + health endpoint + FR-306 integration panel are the monitoring gates | **ADR-013** |
| Dev-3 | **Session-cookie auth** instead of overlay's passkeys/JWT guidance | User constraint C-03 mandates single local account, hashed password, session cookie — constraints outrank overlay defaults | **ADR-007** |

No other deviations. Everything not listed follows `node-typescript.md` verbatim.

## 6. Lock Statement

> The backend stack for GeekBOX Print Management is **LOCKED** to `tech-stacks/node-typescript.md` with the §2 version tuple and the three registered deviations. Downstream phases (designer, engineer, build pipeline) MUST inherit this lock. Amendments require commander (or user) approval per architect skill rules; the single pre-authorized amendment path is the MS-1 spike decision rule (plan §3 D1), which may activate the fallback adapters in ADR-006/ADR-012 without reopening this lock.
