---
type: stack-lock-registry
version: 1.0.0
run_id: run-001_2026-08-04_3d-print-erp
owner: commander
created_at: 2026-08-04T00:00:00Z
last_updated: 2026-08-05T00:10:00Z
---

# Stack-Lock Registry — GeekBOX Print Management

## User Constraints / Preferences (from intake, admiral-confirmed)
- Printer integration via Bambu Lab Cloud API (`https://api.bambulab.com`) + Bambu cloud MQTT (mqtts :8883) — UNOFFICIAL API, must be isolated behind an adapter/anti-corruption layer
- Deployment: self-hosted local via Docker (docker-compose); long-running server process available (persistent MQTT listener intended); NOT serverless, NOT Vercel, NOT Azure
- Single user: one account, hashed-password credential login, session cookie; no RBAC/multi-tenancy in v1
- Solo owner-operator; favor modular monolith; ONE backend stack + ONE frontend stack from tech-stacks overlays
- Greenfield workspace

## Locks

| Lock ID | Phase | Skill | Decision | Rationale | Locked By |
|---------|-------|-------|----------|-----------|-----------|
| SL-001 | 3 | architect | Backend overlay `tech-stacks/node-typescript.md` | One language across stack; best MQTT/SQLite ecosystem for the two riskiest components (ADR-002) | architect (Phase 3 APPROVED attempt 2) |
| SL-002 | 3 | architect | Node.js 22 LTS + TypeScript 5.x (strict, ESM NodeNext) | Long-running MQTT listener fits event loop; unify language with frontend (ADR-002) | architect |
| SL-003 | 3 | architect | Fastify 5.x (HTTP + SSE) | Schema-validated routes, onRequest session gate, native SSE streaming (ADR-002/005) | architect |
| SL-004 | 3 | architect | Zod v4 (HTTP + ACL boundary validation) | One validation idiom at both external boundaries (ADR-002/006) | architect |
| SL-005 | 3 | architect | SQLite (WAL) via better-sqlite3 11.x + Drizzle ORM/drizzle-kit | Single user/process ⇒ SQLite sweet spot; one-file backup (NFR-RE-04); saves ~200 MB RAM. DEVIATION Dev-1 (overlay shows Postgres) → ADR-003 | architect |
| SL-006 | 3 | architect | MQTT.js 5.x (mqtts:8883, supervisor-owned backoff) | Most battle-tested JS MQTT client; TLS/auth/reconnect (ADR-004/006) | architect |
| SL-007 | 3 | architect | node-argon2 (argon2id) + DB-backed opaque session cookie (HttpOnly, SameSite=Lax) | Constraint C-03 mandates single-account hashed-password + session cookie. DEVIATION Dev-3 (overlay suggests passkeys/JWT) → ADR-007 | architect |
| SL-008 | 3 | architect | node:crypto AES-256-GCM token vault (key from env/secret file) | Encrypt Bambu tokens at rest; portable in headless container (ADR-010) | architect |
| SL-009 | 3 | architect | Pino JSON logs + `/api/health` + FR-306 panel; NO OpenTelemetry/Prometheus/Tempo | Right-sized for one user/one host. DEVIATION Dev-2 (overlay prescribes OTel) → ADR-013 | architect |
| SL-010 | 3 | architect | Vitest + Fastify inject + recorded-fixture ACL contract tests; Biome 2.x; pnpm; node:22-alpine multi-stage | Per overlay | architect |
| SL-011 | 3 | architect | SSE (`GET /api/events`) for browser live updates | Read-only telemetry server→browser; session-cookie auth unchanged; native EventSource reconnect (ADR-005) | architect |
| SL-012 | 4 | designer | Frontend overlay `tech-stacks/react-tanstack.md` (React 19 + TanStack Start/Router/Query/Table/Form, Vite, Tailwind v4 + shadcn/ui) | Authenticated single-user data-app SPA; unifies TypeScript with backend; TanStack Query fits SSE-invalidation + REST; TanStack Table for data grids (Frontend ADR-014) | designer (Phase 4 APPROVED attempt 1) |

## Exceptions
None recorded. Both overlays chosen without user-specified framework; each justified by ADR (backend ADR-002, frontend ADR-014). No downstream override of any upstream lock.

## Inherited Stack Locks (Phase 5)
Resolved. Engineer (Phase 5) inherited SL-001…SL-012 verbatim with zero substitutions; implementation spec's "Inherited Stack Locks" record confirms the full version tuple (Node 22 LTS / TS 5 strict ESM / Fastify 5 / Zod 4 / better-sqlite3 11.x + Drizzle / MQTT.js 5 / argon2id / AES-256-GCM / Pino / Vitest / Biome 2 / pnpm / node:22-alpine backend; React 19 / TanStack Start+Router+Query+Table+Form / Vite / Tailwind v4 / shadcn/ui frontend) and the three backend deviations (Dev-1/2/3). No exceptions requested.
