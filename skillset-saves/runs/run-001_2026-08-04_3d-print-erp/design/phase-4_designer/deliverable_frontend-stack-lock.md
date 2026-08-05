---
type: deliverable
pipeline: design
phase: 4
skill: designer
name: Frontend Stack Lock — GeekBOX Print Management
version: 2
status: revised
created: 2026-08-05T00:00:00Z
revised: 2026-08-05T00:00:00Z
---

# FRONTEND STACK LOCK: GeekBOX Print Management
**Version**: 2.0 (revised — attempt 2) | **Author**: designer (Phase 4) | **Date**: 2026-08-05
**Discharges**: DG-2 (frontend stack lock), DG-3 (transport fit confirmation), plan §2 m5 assignment, NFR-US-01/02/03

This document is **binding** for the `engineer`/`bob-the-builder` build phase. The overlay, the version tuple, and the styling stack below MUST NOT be substituted without an explicit approved exception raised to commander (per SKILL "Upstream stack lock conflicts" edge case). Full design detail lives in the companion `deliverable_frontend-spec.md`.

---

## 1. Locked Overlay

| Item | Lock | Source |
|------|------|--------|
| **Frontend overlay** | `C:\Users\leifm\.claude\skills\design\tech-stacks\react-tanstack.md` (React + TanStack Start / Router ecosystem) | Chosen per Frontend ADR-014 below |
| **Rendering pattern** | Single-Page Application (client-side rendering, no SSR/SSG) | Frontend Design Spec §1 |
| **Runtime mode** | TanStack **Router** in pure SPA mode (client-only; NO SSR server). Build emits a static `dist/` bundle. TanStack **Start**'s server features (server functions, SSR) are deliberately NOT used in v1 — the Fastify `app` is the only backend. | ADR-001, architecture §5.1 |

**Documented overlay deviation (on the record):** the `react-tanstack` overlay's headline runtime is TanStack **Start** (SSR-capable, server functions). This lock **adopts the react-tanstack ecosystem — Router, Query, Table, Form — but WITHOUT TanStack Start**: it runs Router-only as a client-side SPA on Vite 8, with no SSR runtime and no server functions. This is a deliberate, recorded deviation from the overlay's default SSR posture (analogous to the backend Dev-1/2/3 deviations), justified by architecture §5.1 (single `app` serves static assets; no second Node server) and the no-SEO/LAN scope (SRS §1.4). Start's server layer is retained only as a documented v2 seam (see ADR-014 Consequences).

### Version Tuple (locked)

| Dependency | Version | Role |
|-----------|---------|------|
| Node.js (build/tooling only) | **22 LTS** | Matches backend (ADR-002); build host runtime |
| Vite | **8.x** (Rolldown) | Build tool + dev server (overlay baseline) |
| React | **19.x** (React Compiler enabled) | UI library |
| react-dom | **19.x** | DOM renderer |
| TypeScript | **5.x** (strict) | Language — unifies with backend TS (ADR-002) |
| @tanstack/react-router | **1.x** | Type-safe routing, file-based tree, search-param URL state, auth guards |
| @tanstack/react-query | **5.x** | Server-state cache + SSE-triggered invalidation |
| @tanstack/react-table | **8.x** | Headless data grids (jobs / inventory / inbound / spool ledger) |
| @tanstack/react-form | **1.x** | Forms (PO, reception, product, spool, cost rates) — Standard Schema / Zod native |
| @tanstack/react-virtual | **3.x** | Row virtualization for large tables (10k jobs / 100k ledger — NFR-PE-01) |
| zod | **4.x** | Client validation — **same version as backend** (ADR-002); shared schema idioms |
| tailwindcss | **4.x** | Styling framework (CSS-first `@theme`, OKLCH tokens) |
| shadcn/ui | pinned components (copy-in, Radix-based) | Component primitives (accessible by default) |
| class-variance-authority | **latest** | Variant management |
| tailwind-merge + clsx | **latest** | `cn()` class composition |
| lucide-react | **latest** | Icon set |
| @biomejs/biome | **2.x** | Lint + format — **same toolchain as backend** |
| pnpm | (workspace) | Package manager — matches backend |

Peer/companion (no new runtime primitives, keep the surface small):
- `zustand` **5.x** — minimal client UI state (only where React Router state / component state is insufficient: e.g. global command palette, transient toast queue).
- Native `EventSource` (browser built-in) — SSE consumption. **No socket library** (aligns with ADR-005).
- No charting library in v1 (telemetry history deferred, ADR-008 / Q-04).

---

## 2. Frontend ADR-014 — Lock React + TanStack (Router/Query/Table/Form) SPA over Vite

**Status**: Accepted · **Discharges**: DG-2, DG-3 · **Date**: 2026-08-05 · **Decision-maker**: designer (solo-dev proxy)

### Context and Problem Statement
DG-2 requires exactly one frontend overlay locked before D1 build start. The application is an authenticated, single-user, self-hosted, LAN-only data ERP: dense data tables (jobs/inventory/inbound/ledger), transactional forms (PO, reception, product, spool, cost rates), and one SSE-driven live dashboard that must reflect telemetry within 10 s (NFR-PE-02) with a 10 s-poll fallback (ADR-005). There is no SEO or public-content need (SRS §1.4). The backend is Node 22 / Fastify 5 / TypeScript / Zod v4 (ADR-002) and serves the SPA's static assets itself from the single `app` container (architecture §5.1, §5.3) — there is no second frontend service and no cloud host.

### Decision Drivers
- **One language, one validator across the whole system** — backend is TS + Zod v4 (ADR-002); the frontend should reuse the exact TS + Zod idiom to minimize solo-dev context switching (plan §9 explicitly weighs familiarity).
- **Static-asset output only** — the chosen stack must build to a plain `dist/` that Fastify serves; no Node SSR server is permitted alongside `app` (architecture §5.1 default assumption: "static assets served by `app`, no second service").
- **First-class data-table + form + server-cache primitives** — four data-heavy modules demand headless tables, form state, and a server-state cache with **SSE-triggered invalidation**.
- **SSE fit (DG-3 P2)** — the live-update transport is SSE (ADR-005); the stack must consume `EventSource` cleanly and turn events into cache invalidations without a bespoke real-time framework.
- **WCAG 2.2 AA + 360 px responsive achievable** (DG-2 P3; NFR-US-01/02) with a mature accessible component base.
- **Right-sizing** — one user, one host; reject anything that adds a runtime server, a build-vendor lock, or ceremony beyond need.

### Considered Options
1. **react-tanstack** (React 19 + TanStack Router/Query/Table/Form on Vite 8) — *chosen*
2. **vite-spa** (React 19 on Vite 8, React Router + TanStack Query, hand-rolled table/form)
3. **react-nextjs** (Next.js 15 App Router)
4. **svelte-sveltekit**, **vue-nuxt**, **angular**, **astro** (rejected at the family level)

### Decision Outcome
Chosen: **`react-tanstack`**, run in pure client-side SPA mode. It is the only candidate that supplies *all four* data primitives the modules need — **TanStack Query** (server-state cache with a clean `queryClient.invalidateQueries` path for SSE events), **TanStack Table** (headless grids for jobs/inventory/inbound/ledger + `@tanstack/react-virtual` for the 10k-job / 100k-ledger volumes in NFR-PE-01), **TanStack Router** (type-safe routes, a single `beforeLoad` session guard, and typed *search-param URL state* for table filters/pagination), and **TanStack Form** (Zod-v4-native validation, no adapter) — as one coherent, vendor-agnostic ecosystem on Vite 8. It builds to a static `dist/` that the Fastify `app` serves directly, requiring **no second container and no Node SSR runtime**, exactly matching architecture §5.1. It reuses the backend's TypeScript + Zod v4 + Biome + pnpm toolchain verbatim, so a solo developer maintains one idiom end-to-end.

### Reconciliation with binding upstream decisions
- **ADR-005 (SSE transport)**: A single app-level `EventSource('/api/events')` subscriber (session-cookie auth works unchanged — SSE is plain HTTP over the same origin as the Fastify `app`, so `gbx_session` is sent automatically) dispatches each of the 5 SSE message types to `queryClient.invalidateQueries` / `setQueryData`. TanStack Query is *built* for exactly this "external event invalidates cache" pattern. The ADR-005 degraded fallback (10 s poll of `getTelemetrySnapshot` + `getIntegrationStatus`) is implemented as the *same* query keys with `refetchInterval: 10_000` toggled on when the stream errors twice — no divergent code path, satisfying DG-3 P2.
- **Static-asset deployment (architecture §5.1)**: SPA mode only. TanStack Start's server functions/SSR are unused; `vite build` → `dist/` → copied into the `app` image and served by `@fastify/static`. The Vite dev proxy forwards `/api` to Fastify locally (overlay §Vite Configuration).
- **ADR-007 (session cookie `gbx_session`, HttpOnly, SameSite=Lax, no RBAC, single user)**: the Router `beforeLoad` guard calls `GET /api/auth/session`; 401 → redirect to `/login`. No token handling in JS (cookie is HttpOnly — JS never reads it), so no client-side auth storage surface.
- **Backend stack lock (Node 22 / TS / Zod v4 / Biome / pnpm)**: inherited verbatim for the frontend package.

### Why the rejected options lost
- **vite-spa (option 2)** — the closest runner-up and a perfectly valid SPA baseline. Rejected because it leaves table, form, and typed-router-search-params as hand-rolled work; `react-tanstack` is a strict superset that supplies those as first-class, test-covered libraries, which materially de-risks the four data-heavy modules for a solo dev at no deployment cost (both build to static `dist/` on the same Vite 8). This is a deliberate "use the batteries" choice, not scope creep — every added library maps to a concrete module need above.
- **react-nextjs (option 3)** — Next.js's value is SSR/SSG/ISR/Server Components and its managed-hosting story, *none* of which apply: no SEO, no public content, and a hard constraint (C-02) forbids Vercel/serverless. Self-hosting Next.js means running a **second Node server** (`output: 'standalone'`) beside Fastify — directly contradicting architecture §5.1's single-`app`-serves-static-assets model — or fighting the framework to force static export. Rejected as over-engineering that also breaks the deployment topology.
- **svelte-sveltekit / vue-nuxt** — both are competent SPA-capable frameworks, but both are meta-frameworks whose defaults lean SSR/adapter-based deployment, and neither shares the backend's exact TS+Zod ecosystem as cleanly as React+TanStack+Zod. For a solo dev, matching the backend language stack (ADR-002 driver) outweighs any per-framework ergonomic edge. Rejected on the one-language / familiarity driver.
- **angular** — heavyweight for a single-user LAN tool; larger baseline bundle and ceremony (NgModules/DI/RxJS) unjustified at this scale; does not reuse the Zod validation idiom. Rejected on right-sizing.
- **astro** — an islands/content framework; this is a fully authenticated interactive app with near-zero static content. The frontend-patterns decision tree routes "behind authentication, single team, moderate complexity → SPA", not Astro. Rejected as a category mismatch.

### Consequences
- **Good**: one TS+Zod+Biome+pnpm toolchain across front and back; SSE→cache-invalidation is idiomatic; typed routes/search-params eliminate a class of filter/pagination bugs; headless tables + virtualization meet NFR-PE-01 at 100k rows; static `dist/` served by `app` keeps the one-container topology (NFR-PE-04 RAM cap, NFR-PO-01).
- **Bad**: SPA means a JS bundle on first load and client-side a11y-of-routing responsibility — mitigated by route-level code splitting (bundle budget §13) and the accessibility route-announcement rules (§12). Acceptable: LAN-served, one user, no cold-start SEO cost.
- **Neutral**: TanStack Start's server capabilities sit unused as a documented v2 seam (if remote printer control ever enters scope, WebSocket + a server function layer could be revisited — mirrors ADR-005's own v2 note).

---

## 3. DG-2 Prerequisite Satisfaction (evidence, not assertion)

| Prereq | Requirement | How this lock satisfies it |
|--------|-------------|---------------------------|
| **P1** | DG-1 locked, API shape known | Backend lock + API contracts v2 (62 ops, 48 schemas) consumed; spec §7/§8 bind UI to named schemas |
| **P2** | Live views within 10 s via DG-3 transport | `EventSource('/api/events')` → TanStack Query invalidation; 10 s `refetchInterval` fallback on stream failure (ADR-005) — spec §8.4 |
| **P3** | WCAG 2.2 AA + 360 px responsive on core flows | shadcn/Radix accessible base; token contrast ≥ AA (spec §4/§5); breakpoints 360/768/1280 (spec §10); full §12 checklist |
| **P4** | m5 measurement criterion — freshness element inspectable | Defined concretely in spec §12.5: every live value renders a `<DataFreshness>` element carrying `data-freshness` + `data-captured-at`; inspectable/automatable acceptance criterion stated |

---

## 4. Handoff Note
Consume this lock together with `deliverable_frontend-spec.md` (all 13 sections). The engineer builds against API contracts v2 named schemas only; the frontend never imports Bambu-specific types (those live behind the backend ACL, NFR-MA-02 — the browser only ever sees normalized `TelemetrySnapshot`/`SlotView`/`IntegrationStatus`).
