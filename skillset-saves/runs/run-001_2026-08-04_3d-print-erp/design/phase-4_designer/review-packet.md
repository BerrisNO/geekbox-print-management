---
type: review-packet
pipeline: design
phase: 4
skill: designer
name: Review Packet — Designer Phase (GeekBOX Print Management)
version: 2
status: revised
created: 2026-08-05T00:00:00Z
revised: 2026-08-05T00:00:00Z
---

# Review Packet: Designer Phase

Deliverables for gatekeeper-design review (commander owns submission):
- `deliverable_frontend-spec.md` — Frontend Design Specification (all 13 sections)
- `deliverable_frontend-stack-lock.md` — overlay lock + version tuple + Frontend ADR-014
- this packet

## Deliverable Summary
A client-rendered SPA on the `react-tanstack` overlay (React 19 + TanStack Router/Query/Table/Form on Vite 8, Tailwind v4 + shadcn/ui), built to a static `dist/` that the Fastify `app` serves — no second container, no SSR. The spec covers all four V1 modules (inventory, procurement/reception, live SSE dashboard, jobs/costing) plus auth/setup and settings, with a three-tier OKLCH token system (light+dark), WCAG 2.2 AA, and a concrete inspectable freshness element that closes the m5/NFR-US-03 gap.

## Upstream Inputs Consumed
- **Researcher SRS v1**: 32 FR / 28 NFR; specifically NFR-US-01 (360/768/1280 responsive → §10), NFR-US-02 (WCAG 2.2 AA → §12), NFR-US-03 (data-state clarity + freshness → §12.5), no-SEO/LAN scope (§1), no-charts (Q-04/ADR-008 → excluded).
- **Planner Plan v2**: DG-2 prerequisites P1–P4 (all satisfied — stack-lock §3), m5 designer assignment (§12.5), D1–D6 build order (routes/modules map to it — spec Appendix A).
- **Architect Architecture v2 + ADRs v2**: modular monolith; §5.1 static-assets-served-by-`app` (reconciled in ADR-014); ADR-005 SSE `GET /api/events` + 10s poll fallback (spec §8.4); ADR-007 `gbx_session` cookie auth (route guard §9); ADR-011 external holder 254:0 (AmsSlotPanel §7.3); ADR-012 fallbacks (integration settings UI).
- **API Contracts v2**: 62 REST ops, 48 schemas, RFC 7807 errors, 5 SSE message types — UI bound to named schemas (SlotView, TelemetrySnapshot, IntegrationStatus, InboundRow, ProductStockRow, LowStockAlert, JobListResponse/JobsSummary, CostBreakdown, PrintJobDetail, Spool/LedgerEntry, etc.).
- **Backend Stack Lock**: Node 22 / Fastify 5 / TS / Zod v4 / Biome / pnpm — inherited verbatim by the frontend.

## Key Design Decisions
1. **SPA rendering + `react-tanstack` overlay** — only candidate supplying all four data primitives (SSE-invalidated server cache, headless virtualized tables, typed router+search-param URL state, Zod-native forms) as one ecosystem that builds to static `dist/`; unifies with the TS+Zod backend. Rejected Next.js (needs a 2nd Node server, breaks §5.1; C-02 forbids Vercel), vite-spa (leaves table/form/router hand-rolled), svelte/vue/angular/astro (idiom/category mismatch). — Frontend ADR-014.
2. **SSE→TanStack Query invalidation bridge** — one `EventSource('/api/events')`; 5 message types each mapped to `setQueryData`/`invalidateQueries`; 10s `refetchInterval` fallback on stream failure using the same query keys (no divergent path). — spec §8.4, discharges DG-3 P2.
3. **`<DataFreshness>` element as the m5 criterion** — every live value renders a `[data-freshness][data-captured-at]` `role="status"` element; thresholds fresh≤10s / stale>2min / offline / error; never shows stale-as-live. Automatable acceptance check. — spec §12.5, discharges DG-2 P4.
4. **Three-tier OKLCH tokens, "calm industrial instrument panel" aesthetic, dark as first-class** — status is a dedicated semantic palette always paired with icon+text (color never sole indicator). — spec §4/§5.
5. **External-spool holder 254:0 as a first-class SlotTile** (AC-305.4), reception form with over-delivery/damaged/discrepancy handling, reverse-and-repost job corrections surfaced in UI. — spec §7.

## Risk Areas (for gatekeeper scrutiny)
- **Deployment-topology fit**: Next.js was rejected specifically to preserve the single-`app`-serves-static-assets model (§5.1). Gatekeeper should confirm the SPA-only build (no TanStack Start server) is unambiguous in the lock — it is stated, but it's the highest-consequence claim.
- **Overlay breadth vs right-sizing**: `react-tanstack` pulls in Query+Table+Form+Router+virtual+Zustand. Each is mapped to a concrete module need (stack-lock §1, spec §8), but a reviewer may probe whether this is heavier than a lone user warrants. Position: every library retires hand-rolled work on the four data-heavy modules; net risk-reduction for a solo dev.
- **m5 criterion strength**: the freshness criterion is inspectable/automatable and now uses a **two-boundary state contract** (`freshMaxSec=10` / `staleMinSec=120` → fresh/aging/stale/offline/error), so a >10s value can never resolve to `fresh`. The acceptance test is now named a **standing CI merge gate (alongside the §13 bundle-size budget)** that asserts the computed `data-freshness` state against `capturedAt` fixtures — not only a D6 audit item (attempt-2 minor m3). Residual: still depends on the engineer using `<DataFreshness>` uniformly; the CI gate is the enforcement.
- **Currency assumption (Q-03)**: NOK default is display-only and editable in settings (§10) — carried, not resolved; consistent with API contracts. Flag if gatekeeper expects resolution here.
- **SSE payload trust**: spec assumes SSE `telemetry` is byte-identical to the REST `TelemetrySnapshot` (per contracts Part C) — correct per upstream, but the whole live path rests on it.

## Validation Summary
- **Aesthetic direction**: documented and distinctive ("calm industrial instrument panel"; teal reserved for action, dedicated status palette).
- **Token system**: three-tier, OKLCH, light+dark, Tailwind v4 `@theme` + `:root`/`.dark`.
- **Accessibility**: WCAG 2.2 AA target confirmed; four-principle checklist + the inspectable m5 freshness criterion; accessible-auth (paste/autofill), color-never-sole-indicator, 44×44 targets.
- **Performance**: Core Web Vitals budgets set (LAN-tightened) + <200KB initial bundle + virtualization for NFR-PE-01 volumes; CI bundle-budget gate.
- **Templates**: 20 routes mapped to library templates (04/10/11/12/16/17); no invented templates; `05-analytics` deliberately excluded (ADR-008).
- **Components**: ~24 components inventoried; 10-state model specified for interactive elements; 6 key organisms spec'd in detail.
- **DG-2 prerequisites**: P1–P4 all satisfied with evidence (stack-lock §3).
- **Module coverage**: all four V1 modules + auth/setup + settings mapped FR-by-FR (spec Appendix A). **All 32 FRs now have an explicit UI home** — attempt 2 closed the three previously-missing/ambiguous cases: FR-002 logout (TopBar UserMenu + `/settings/account`), FR-302 printer discovery/refresh/tracked-selection/manual-registration (PrintersPanel in `/settings/integration`), and the DataFreshness two-boundary state contract for the m5/FR-304 live-vs-stale distinction.

---

## Change Summary — Attempt 2 (Substantive Change Detection)

Gatekeeper-design returned **REVISE** on attempt 1 with 3 mandatory Majors (M1–M3) + 3 minors (m1, m3, and a no-op note on m2/Q-03). All three Majors are fixed in place below. The **overlay lock (react-tanstack, pure SPA, no TanStack Start)** and the **SSE / degraded-fallback / static-asset-deployment reconciliations** were ACCEPTED on attempt 1 and were **left untouched** (not re-opened, not re-litigated).

### M1 — FR-002 (logout) now has a UI home
Added an explicit logout affordance wired to `POST /api/auth/logout` with post-logout redirect to `/login` (AC-002.1).

- **Before**: no logout control anywhere; AppShell inventory was `AppShell (SideNav + TopBar + NavBadge)`; §6 settings Account tab listed only "password change, FR-003"; §9 `/settings/account` module was "Auth (FR-003)"; Appendix A had no auth/session line.
- **After** (spec §7.1): `AppShell (SideNav + TopBar + NavBadge + UserMenu) … TopBar hosts the UserMenu (account/logout affordance, FR-002)` + new inventory row `UserMenu … "Log out" (FR-002/AC-002.1) — wired to POST /api/auth/logout; on success clears the TanStack Query cache and redirects to /login`.
- **After** (spec §7.3, new): `UserMenu (molecule, TopBar) — FR-002 logout home … "Log out" fires a useMutation against POST /api/auth/logout (invalidates the gbx_session server-side, ADR-007); onSuccess runs queryClient.clear() … and performs a router navigation to /login — satisfying AC-002.1`.
- **After** (spec §6 intro): `The top bar carries the UserMenu (account + Log out, FR-002 …) at its trailing edge on every guarded route`; settings row now `Account (password change FR-003 + Log out FR-002 …)`.
- **After** (spec §9): `/settings/account … Auth (FR-002 logout, FR-003 password)`.
- **After** (spec Appendix A, new): `(Auth & session) — … logout via TopBar UserMenu / /settings/account (FR-002, AC-002.1 — POST /api/auth/logout + redirect to /login) …`.

### M2 — FR-302 (printer discovery/refresh/tracked-selection/manual registration) now has a UI home
Added a **Printers** section within `/settings/integration`.

- **Before**: FR-302 (a MUST) had no UI home; §9 integration route was `Integration (FR-301/306/307)`; no component covered discovery/tracking/registration; Appendix A(3) omitted FR-302.
- **After** (spec §9): `/settings/integration | IntegrationSettings (incl. PrintersPanel) … Integration (FR-301/302/306/307)`.
- **After** (spec §7.1, new): `PrintersPanel + PrinterRow (organism, feature) — FR-302 home … Refresh/Discover (POST /printers/refresh), per-printer Tracked toggle (PATCH /printers/{id}), and Add printer by serial manual-registration form (POST /printers, ADR-012 Q-02 fallback)`.
- **After** (spec §7.3, new): full PrintersPanel spec — `Refresh / Discover button → POST /printers/refresh (AC-302.2)`, `Tracked Switch → PATCH /printers/{id}`, `Add printer by serial form → POST /printers, the ADR-012 Q-02 permanent manual-registration fallback`, plus empty/unlinked states.
- **After** (spec §6): integration settings tab now includes `Printers sub-section (… + printer discovery/refresh/tracked-selection/manual-registration FR-302)`.
- **After** (spec Appendix A(3)): `… printer discovery/refresh + tracked-printer selection + manual serial registration (PrintersPanel in /settings/integration, FR-302 incl. AC-302.2 and the ADR-012 Q-02 manual fallback)`.

### M3 — DataFreshness threshold contract disambiguated (two named boundaries, 3+2 states)
Replaced the single ambiguous `thresholdSec` (defaults 10 *and* 120) with two named boundaries; corrected the PrinterCard invocation; and upgraded the m5 acceptance check to assert computed state.

- **Before** (spec §7.3): `DataFreshness … thresholdSec (default 10 for telemetry per NFR-PE-02; 120 for the FR-304 stale line) … renders state ∈ fresh|stale|offline|error`, and **PrinterCard**: `DataFreshness(capturedAt, threshold=120)` — so a 90s-old value resolved to `fresh` (stale rendered as live).
- **After** (spec §7.3): `DataFreshness … freshMaxSec (default 10 …), staleMinSec (default 120 …) … Two named boundaries, never a single ambiguous threshold … five-value state in strict priority order: error → offline → fresh (age ≤ freshMaxSec) → aging (freshMaxSec < age ≤ staleMinSec) → stale (age > staleMinSec) … a value older than 10s can never resolve to fresh`.
- **After** (spec §7.3 PrinterCard): `DataFreshness(capturedAt, freshMaxSec=10, staleMinSec=120, connected) … a value >10s old renders aging/stale …, never fresh (fixes the prior threshold=120 bug that would have rendered a 90s-old value as live)`.
- **After** (spec §7.1 inventory): props updated to `capturedAt, freshMaxSec (default 10), staleMinSec (default 120), connected — computes a 5-value state (fresh/aging/stale/offline/error)`.
- **Before** (spec §12.5 acceptance): `a DOM query for every live-value container asserts a descendant [data-freshness][data-captured-at] exists; an axe/RTL check asserts each is exposed as a status` — presence only.
- **After** (spec §12.5): thresholds restated with both boundaries and the `aging` band; acceptance test now **asserts the COMPUTED STATE** — `with a frozen clock it feeds a value at age = 90s (and boundary cases at 9s, 11s, 121s) and asserts data-freshness resolves to aging/stale, never fresh (state, not just presence)`; exit condition extended to "zero live values whose computed data-freshness mis-resolves against its capturedAt." §7.3 and §12.5 are now internally consistent (both cite freshMaxSec=10 / staleMinSec=120 and the five-value state set).

### Batched minors
- **m1 (stack lock)** — added an explicit recorded deviation sentence (stack-lock §1): *"the react-tanstack overlay's headline runtime is TanStack Start (SSR-capable) … This lock adopts the react-tanstack ecosystem — Router, Query, Table, Form — but WITHOUT TanStack Start: Router-only … on Vite 8 … a deliberate, recorded deviation from the overlay's default SSR posture (analogous to the backend Dev-1/2/3 deviations)."* On the record like the backend deviations.
- **m3 (m5 CI gate)** — the freshness acceptance check is now named a **standing CI merge gate alongside the §13 bundle-size budget** (spec §12.5), not only a D6 audit item.
- **m2 / Q-03 (currency)** — no change (correctly carried as a display-only editable NOK default; left as-is per gatekeeper note).

### Untouched (accepted on attempt 1 — deliberately not re-opened)
- Frontend overlay lock: `react-tanstack`, pure SPA, no TanStack Start / SSR (spec §1/§2, stack-lock §1/ADR-014). Unchanged except the additive m1 deviation-recording sentence.
- SSE→TanStack Query invalidation bridge, degraded 10s-poll fallback, and static-`dist/`-served-by-`app` deployment reconciliation (spec §8.4, stack-lock ADR-014 Reconciliation). Unchanged.

### Files modified
- `C:\Users\leifm\Documents\Workspace\GeekBOX Print Management\skillset-saves\runs\run-001_2026-08-04_3d-print-erp\design\phase-4_designer\deliverable_frontend-spec.md` (M1, M2, M3; version 2 / revised)
- `C:\Users\leifm\Documents\Workspace\GeekBOX Print Management\skillset-saves\runs\run-001_2026-08-04_3d-print-erp\design\phase-4_designer\deliverable_frontend-stack-lock.md` (minor m1; version 2 / revised)
- `C:\Users\leifm\Documents\Workspace\GeekBOX Print Management\skillset-saves\runs\run-001_2026-08-04_3d-print-erp\design\phase-4_designer\review-packet.md` (version bump; corrected 32-FR claim; m5 CI-gate note; this Change Summary)
