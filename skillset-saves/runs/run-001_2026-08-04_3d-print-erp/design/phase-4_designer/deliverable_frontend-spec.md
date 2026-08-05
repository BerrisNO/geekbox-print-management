---
type: deliverable
pipeline: design
phase: 4
skill: designer
name: Frontend Design Specification — GeekBOX Print Management
version: 2
status: revised
created: 2026-08-05T00:00:00Z
revised: 2026-08-05T00:00:00Z
---

# Frontend Design Specification: GeekBOX Print Management
**Version**: 2.0 (revised — attempt 2) | **Author**: designer (Phase 4) | **Date**: 2026-08-05
**Upstream**: SRS v1 (32 FR / 28 NFR), Project Plan v2 (DG-2, m5), Architecture v2 + ADRs v2 + API Contracts v2, Backend Stack Lock (Node 22 / Fastify 5 / TS / Zod 4 / SSE).
**Companion**: `deliverable_frontend-stack-lock.md` (overlay lock, version tuple, Frontend ADR-014).

Scope discipline: this spec covers UI for the **32 FRs only**. No features beyond scope; no charts (telemetry history deferred, ADR-008 / Q-04); right-sized for one user on a LAN. All UI reads/writes go through API Contracts v2 named schemas; the browser never sees Bambu-specific types (NFR-MA-02 — normalized `TelemetrySnapshot`/`SlotView`/`IntegrationStatus` only).

---

## 1. Architecture Pattern

**Pattern: Single-Page Application (client-side rendering).**

This is an authenticated, single-user, self-hosted, LAN-only data application with live-updating views and explicitly **no SEO or public-content requirement** (SRS §1.4). The frontend-patterns decision tree routes "behind authentication → single team, moderate complexity → SPA (CSR)"; SSR/SSG/ISR/Islands add server or build machinery whose only payoffs (crawlability, first-paint-without-JS, CDN caching) are irrelevant here and would violate the single-`app`-container deployment (architecture §5.1) and C-02 (no serverless). The app loads once, then routes, fetches, and live-updates entirely in the browser against the Fastify REST API + SSE stream; the Fastify `app` serves the static SPA bundle it was built into.

---

## 2. Tech-Stack Lock

Locked in the companion `deliverable_frontend-stack-lock.md` — summarized here.

- **Overlay**: `react-tanstack` (React 19 + TanStack Router/Query/Table/Form on Vite 8), **pure SPA mode** (no SSR / no TanStack Start server functions in v1).
- **Version tuple** (abridged): Node 22 (tooling) · Vite 8 · React 19 (React Compiler) · TypeScript 5 strict · @tanstack/react-router 1 · react-query 5 · react-table 8 · react-form 1 · react-virtual 3 · zod 4 (same as backend) · tailwindcss 4 · shadcn/ui (Radix) · CVA + tailwind-merge · lucide-react · Biome 2 · pnpm.
- **Rationale (Frontend ADR-014)**: only candidate supplying all four data primitives (server-cache with SSE invalidation, headless virtualized tables, typed router with search-param URL state, Zod-native forms) as one vendor-agnostic ecosystem; builds to static `dist/` served by Fastify (no second container); reuses the backend TS + Zod v4 + Biome + pnpm toolchain verbatim; reconciles with ADR-005 (SSE→cache invalidation), ADR-007 (`gbx_session` cookie guard), and architecture §5.1 (static assets). Rejected: vite-spa (leaves table/form/router-search hand-rolled), react-nextjs (SSR/managed-host value unused; needs a second Node server, breaks §5.1; C-02 forbids Vercel), svelte/vue/angular (don't match backend TS+Zod idiom; meta-frameworks lean SSR), astro (content/islands mismatch for a fully authenticated app).

---

## 3. Styling Stack

Per `styling-decision-matrix.md` §1 (React → "maximum control + best DX → shadcn/ui + Tailwind CSS v4") and §8 ("Admin Dashboard (React) → Tailwind v4 + shadcn/ui + blocks").

| Concern | Choice | Rationale |
|---------|--------|-----------|
| **Styling framework** | Tailwind CSS v4 (CSS-first `@theme`, OKLCH tokens) | Zero runtime, unlimited customization, native container queries for the responsive dashboard/table cards; tokens live in CSS (§4). |
| **Component library** | shadcn/ui (copy-in, built on Radix) | Accessible-by-default primitives (keyboard nav, ARIA, focus) → head-start on WCAG 2.2 AA (NFR-US-02); owned in-repo, no black-box dependency; theming via CSS variables aligns with the token system. |
| **Variant management** | class-variance-authority (CVA) + `cn()` (twMerge + clsx) | Standard shadcn variant idiom; keeps the 10-state component model (§7) declarative. |
| **Icons** | lucide-react | Tree-shakeable, consistent stroke set; covers status/printer/inventory/nav glyphs. |
| **Data grid** | @tanstack/react-table (headless) + @tanstack/react-virtual | Styled with Tailwind; virtualization for NFR-PE-01 volumes. |
| **Charts** | **None (v1)** | Telemetry history deferred (ADR-008/Q-04); no chart lib enters the bundle. |

Class order convention (matrix §6): Layout → Sizing → Spacing → Typography → Visual → Interaction → Overrides. Z-index uses the token scale (§4, matrix §7); never `!important`; `isolation: isolate` for local stacking (dashboard cards, popovers).

---

## 4. Design Token System

Three-tier, OKLCH, light + dark. Tier 1 primitives → Tier 2 semantic (theme-switchable) → Tier 3 component tokens (a few high-frequency). Delivered as Tailwind v4 `@theme` + `:root` / `.dark` custom properties.

### 4.1 Tier 1 — Primitives

```css
@import "tailwindcss";

@theme {
  /* Brand — "Signal Teal": calm, industrial, high legibility on data screens */
  --color-teal-50:  oklch(0.98 0.02 195);
  --color-teal-100: oklch(0.95 0.04 195);
  --color-teal-200: oklch(0.90 0.07 194);
  --color-teal-300: oklch(0.83 0.10 193);
  --color-teal-400: oklch(0.74 0.13 192);
  --color-teal-500: oklch(0.65 0.14 191);   /* brand anchor */
  --color-teal-600: oklch(0.56 0.13 191);
  --color-teal-700: oklch(0.47 0.11 191);
  --color-teal-800: oklch(0.39 0.09 192);
  --color-teal-900: oklch(0.31 0.06 193);

  /* Neutral (slate) — surfaces, text, borders */
  --color-slate-50:  oklch(0.985 0.002 250);
  --color-slate-100: oklch(0.968 0.004 250);
  --color-slate-200: oklch(0.928 0.006 250);
  --color-slate-300: oklch(0.872 0.008 250);
  --color-slate-400: oklch(0.708 0.012 250);
  --color-slate-500: oklch(0.560 0.014 250);
  --color-slate-600: oklch(0.446 0.014 252);
  --color-slate-700: oklch(0.372 0.014 253);
  --color-slate-800: oklch(0.279 0.012 255);
  --color-slate-900: oklch(0.208 0.010 258);
  --color-slate-950: oklch(0.145 0.008 260);

  /* Feedback (all chosen to clear WCAG AA on their paired foreground) */
  --color-success-500: oklch(0.62 0.15 150);
  --color-success-600: oklch(0.53 0.14 150);
  --color-warning-500: oklch(0.75 0.15 75);   /* low-stock / overdue / stale */
  --color-warning-600: oklch(0.66 0.15 70);
  --color-danger-500:  oklch(0.58 0.20 25);    /* errors / destructive / over-consumption */
  --color-danger-600:  oklch(0.50 0.19 25);
  --color-info-500:    oklch(0.60 0.13 245);

  /* Spacing — 8-point grid (4 px base step) */
  --space-1: 0.25rem; --space-2: 0.5rem;  --space-3: 0.75rem; --space-4: 1rem;
  --space-5: 1.25rem; --space-6: 1.5rem;  --space-8: 2rem;    --space-10: 2.5rem;
  --space-12: 3rem;   --space-16: 4rem;

  /* Type scale — Major Third (1.25), base 16 px */
  --font-sans: "Inter", system-ui, -apple-system, sans-serif;
  --font-mono: "JetBrains Mono", ui-monospace, monospace; /* weights, prices, IDs */
  --text-xs: 0.75rem;  --text-sm: 0.875rem; --text-base: 1rem;   --text-lg: 1.125rem;
  --text-xl: 1.25rem;  --text-2xl: 1.563rem; --text-3xl: 1.953rem;

  /* Radius */
  --radius-sm: 0.25rem; --radius-md: 0.5rem; --radius-lg: 0.75rem; --radius-full: 9999px;

  /* Shadow (restrained; dark UI leans on borders not shadows) */
  --shadow-sm: 0 1px 2px 0 oklch(0 0 0 / 0.06);
  --shadow-md: 0 4px 8px -2px oklch(0 0 0 / 0.10);
  --shadow-lg: 0 12px 24px -6px oklch(0 0 0 / 0.14);

  /* Motion tokens (see §11) */
  --duration-instant: 80ms; --duration-fast: 150ms; --duration-base: 220ms; --duration-slow: 320ms;
  --ease-standard: cubic-bezier(0.2, 0, 0, 1);
  --ease-emphasized: cubic-bezier(0.3, 0, 0, 1);

  /* Z-index scale */
  --z-base: 0; --z-above: 10; --z-dropdown: 100; --z-sticky: 200;
  --z-overlay: 300; --z-modal: 400; --z-popover: 500; --z-toast: 600; --z-tooltip: 700;
}
```

### 4.2 Tier 2 — Semantic (light default + dark override)

```css
:root {
  --color-background:        var(--color-slate-50);
  --color-surface:           oklch(1 0 0);            /* cards, tables, dialogs */
  --color-surface-muted:     var(--color-slate-100);
  --color-foreground:        var(--color-slate-900);
  --color-muted-foreground:  var(--color-slate-500);
  --color-primary:           var(--color-teal-600);
  --color-primary-foreground: oklch(1 0 0);
  --color-secondary:         var(--color-slate-200);
  --color-secondary-foreground: var(--color-slate-900);
  --color-border:            var(--color-slate-200);
  --color-input:             var(--color-slate-300);
  --color-ring:              var(--color-teal-600);
  --color-destructive:       var(--color-danger-600);
  --color-destructive-foreground: oklch(1 0 0);

  /* Domain-semantic status tokens (data-state clarity, NFR-US-03) */
  --color-status-fresh:   var(--color-success-500);   /* live data ≤ threshold */
  --color-status-stale:   var(--color-warning-600);   /* telemetry > 2 min (FR-304) */
  --color-status-offline: var(--color-slate-400);
  --color-status-error:   var(--color-danger-600);
  --color-status-low:     var(--color-warning-600);   /* low-stock (FR-106) */
  --color-status-overdue: var(--color-danger-600);    /* PO overdue (FR-204) */
  --color-status-verify:  var(--color-warning-500);   /* verify-mapping (FR-305) */
}

.dark {
  --color-background:        var(--color-slate-950);
  --color-surface:           var(--color-slate-900);
  --color-surface-muted:     var(--color-slate-800);
  --color-foreground:        var(--color-slate-100);
  --color-muted-foreground:  var(--color-slate-400);
  --color-primary:           var(--color-teal-400);    /* lighter stop in dark (per SKILL worked example) */
  --color-primary-foreground: var(--color-slate-950);
  --color-secondary:         var(--color-slate-800);
  --color-secondary-foreground: var(--color-slate-100);
  --color-border:            var(--color-slate-800);
  --color-input:             var(--color-slate-700);
  --color-ring:              var(--color-teal-400);
  --color-destructive:       var(--color-danger-500);

  --color-status-fresh:   var(--color-success-500);
  --color-status-stale:   var(--color-warning-500);
  --color-status-offline: var(--color-slate-500);
  --color-status-error:   var(--color-danger-500);
  --color-status-low:     var(--color-warning-500);
  --color-status-overdue: var(--color-danger-500);
  --color-status-verify:  var(--color-warning-500);
}
```

### 4.3 Tier 3 — Component tokens (high-frequency only; rest deferred to engineer)

```css
:root {
  --button-primary-bg:        var(--color-primary);
  --button-primary-bg-hover:  var(--color-teal-700);
  --button-primary-fg:        var(--color-primary-foreground);
  --input-border:             var(--color-input);
  --input-ring:               var(--color-ring);
  --card-bg:                  var(--color-surface);
  --card-border:              var(--color-border);
  --table-header-bg:          var(--color-surface-muted);
  --table-row-hover:          var(--color-slate-100);
  --freshness-fresh-fg:       var(--color-status-fresh);
  --freshness-stale-fg:       var(--color-status-stale);
}
.dark { --button-primary-bg-hover: var(--color-teal-300); --table-row-hover: var(--color-slate-800); }
```

Resolution example (primary button, per SKILL): `--color-teal-500` (primitive) → `--color-primary` (semantic, teal-600 light / teal-400 dark) → `--button-primary-bg` (component) → `<Button variant="primary">`. A brand change edits only Tier 1.

---

## 5. Visual Design Language

**Aesthetic direction — "Calm industrial instrument panel."** This is a tool a solo operator glances at many times a day and trusts as a book of record; the visual language is restrained, data-forward, and high-contrast, closer to a lab instrument than a consumer app. Chrome recedes; data and its *freshness/trust state* are the loudest thing on screen. Dark mode is a first-class peer (a workshop dashboard often lives on a wall-mounted or dim-room display), so both themes are designed, not one retrofitted.

- **Typography**: Inter for UI; JetBrains Mono for all numeric/identifier data (spool weights in g, remaining %, prices, spool labels `S-0007`, task IDs, slot refs `254:0`) so columns align and digits don't jitter as they live-update. One `<h1>` per page; heading scale from the Tier-1 modular ratio. Body text ≥ 14 px (`--text-sm`) minimum on data tables, 16 px default.
- **Color usage**: teal is reserved for primary actions, active nav, and focus — never for status. Status is a dedicated semantic palette (fresh/stale/offline/error/low/overdue/verify) and is **always paired with an icon and text label**, never color alone (WCAG 1.4.1 — §12). Every value resolves to a Tier-1 primitive; no ad-hoc hex.
- **Depth & composition**: flat surfaces separated by 1 px borders (`--color-border`) rather than heavy shadows; shadow reserved for true overlays (dialog, popover, toast). Generous negative space around the dashboard cards; dense but not cramped tables (row height 44 px = touch target + comfortable scanning).
- **Contrast floor**: body/foreground pairs ≥ 4.5:1; large text and UI component boundaries ≥ 3:1 (verified against the token pairs in §4). Status colors chosen at lightness stops that clear AA on their surface.
- **Data-state as a visual primitive**: the freshness indicator (§12.5) is a designed, reusable element, not an afterthought — it is the single most important recurring visual motif because trust in live data is the product's core promise (SRS success metric "dashboard freshness within 10 s").

---

## 6. Page Templates

Per `page-templates/00-selection-guide.md`, this is an **Internal Tool** ("`04-admin-dashboard` + `12-data-table`" primary, "`10-authentication`" secondary) with a settings surface (`11-settings`). No marketing/pricing/blog/docs templates (no public surface). App shell = persistent left nav + top bar (from `04-admin-dashboard`), content area swaps per route. The top bar carries the **UserMenu** (account + **Log out**, FR-002 — see §7.3) at its trailing edge on every guarded route.

| Route | Primary template | Secondary | Customizations (included / excluded) |
|-------|-----------------|-----------|--------------------------------------|
| `/login`, `/setup` | `10-authentication` | — | Single centered card. **Excluded**: social/OAuth, "sign up" (single account), password-reset link (no email; recovery is host-level). `/setup` shown only on first run (AC-001.3). |
| `/` (Dashboard) | `04-admin-dashboard` | — | App shell + dashboard grid of printer cards (FR-304), AMS/slot panel (FR-305), low-stock alert panel (FR-106), integration health panel (FR-306). **Excluded**: KPI charts, analytics widgets (`05-analytics` NOT used — no time-series, ADR-008). Degraded/reauth banners are dashboard-scoped chrome. |
| `/inventory` | `12-data-table` | `04` shell | Per-product stock table (FR-105) with filters (material/color/vendor/status) as URL state; valuation column (FR-108); low-stock row highlight. |
| `/inventory/spools/:spoolId` | `12-data-table` (detail) | — | Spool header (status, remaining g/%, valuation, mapping location) + **ledger sub-table** newest-first with running balance (FR-103); actions: adjust weight, transition status. |
| `/catalog/products`, `/catalog/vendors` | `12-data-table` | — | CRUD tables; row → drawer/dialog form. Archive-not-delete affordance (FR-101/201). |
| `/inbound` | `12-data-table` | `04` shell | Inbound overview (FR-204): ETA-sorted, overdue flag, outstanding-qty summary, no-ETA last. |
| `/purchase-orders`, `/purchase-orders/:id` | `12-data-table` (list) + detail | `16-multi-step-wizard` (creation) | PO list; detail = lines + status history + receipts; PO create/edit form; **reception form** launched from PO detail. |
| `/purchase-orders/:id/receive` | `16-multi-step-wizard` (single-step form) | — | Goods-reception form (FR-205): per-line received/damaged/price, over-delivery confirm, discrepancy notes. Wizard chosen for its confirm-before-commit + summary step pattern; collapses to one dense form at 360 px. |
| `/jobs` | `12-data-table` | `04` shell | Job history (FR-406): filters (printer/outcome/date) + sort (date/cost) as URL state; summary block; CSV export button. |
| `/jobs/:id` | `12-data-table` (detail) | — | Job header + per-slot usages (with ledger links) + cost breakdown (FR-404); actions: attribute usage, correct, recalculate. |
| `/jobs/new` | `16-multi-step-wizard` (single-step form) | — | Manual job entry (FR-405): job meta + usages. |
| `/settings/*` | `11-settings` | — | Tabbed: Account (password change FR-003 + **Log out** FR-002, redundant with the TopBar UserMenu), Cost Rates (FR-403), Bambu Integration incl. **Printers** sub-section (link/verify/manual-token/unlink/region/kill-switch FR-301/306/307 + printer discovery/refresh/tracked-selection/manual-registration FR-302), Low-stock defaults, Backup (FR downloadBackup). |
| `*` (not found), error, empty | `17-error-pages` | — | 404, route error boundary, and reusable empty-states for zero-data tables. |

Template combination (from selection guide "Internal Tool"): `10-authentication` → app shell (`04-admin-dashboard`) → data-table workspaces (`12`) + settings (`11`) + wizard forms (`16`) + error/empty (`17`). No template invented; all adapted from the library.

---

## 7. Component System

### 7.1 Inventory (Atomic Design level in parens)

| Component | Level | Category | Notes / key props |
|-----------|-------|----------|-------------------|
| Button | atom | action | `variant` (primary/secondary/outline/ghost/destructive/link), `size`, `loading`, `disabled` — 10-state model below |
| Input / NumberInput / Select / Combobox / Checkbox / Switch / DatePicker | atom | form | Radix/shadcn; NumberInput enforces g/price minor-unit formatting; Combobox powers spool/product/vendor pickers |
| Badge / StatusPill | atom | display | Status = icon + text + color token (never color alone); variants map to §4.2 status tokens |
| **DataFreshness** | atom | display | **The m5 element** (see §12.5): renders freshness/staleness for every live value; props `capturedAt`, `freshMaxSec` (default 10), `staleMinSec` (default 120), `connected` — computes a 5-value state (fresh/aging/stale/offline/error) |
| Card / StatCard | molecule | layout | Dashboard printer card, alert card |
| FormField (label+control+error+hint) | molecule | form | Wraps TanStack Form field; visible label always (WCAG 3.3.2) |
| DataTable | organism | data | TanStack Table + virtual; column sort/filter bound to URL search params; empty/error/loading slots |
| ConfirmDialog / AlertDialog | molecule | overlay | Destructive/irreversible actions (archive, over-delivery, archived-spool correction) |
| Sheet / Drawer | molecule | overlay | Row-detail edit forms on desktop; full-screen on mobile |
| Toast | molecule | feedback | Mutation success/error; SSE-driven notifications (job costed, low-stock crossed) |
| AppShell (SideNav + TopBar + NavBadge + UserMenu) | organism | nav | Persistent nav; NavBadge shows low-stock count (FR-106) + verify-mapping count; TopBar hosts the **UserMenu** (account/logout affordance, FR-002) |
| UserMenu (TopBar account menu) | molecule | nav | Dropdown at TopBar end; items: "Account settings" (→ `/settings/account`) and **"Log out"** (FR-002/AC-002.1) — wired to `POST /api/auth/logout`; on success clears the TanStack Query cache and redirects to `/login` |
| Banner | molecule | feedback | Integration-degraded (ES-304.1) and reauth-required (FR-307) dashboard banners |
| PrinterCard | organism | feature | State, job, progress bar, layers, time remaining, temps, DataFreshness — SSE-driven |
| AmsSlotPanel + SlotTile | organism | feature | Per-unit slots + **virtual external holder 254:0**; tray observation, mapping, verify flag, live spool data |
| SpoolLedgerTable | organism | data | Newest-first, running balance, entry-type badges (initial/consumption/adjustment/reversal), over-consumption flag |
| CostBreakdownPanel | organism | feature | Filament/energy/machine/total, "not configured" and "incomplete" states, currency display |
| LowStockAlertPanel | organism | feature | Alerts with on-order qty + earliest ETA |
| IntegrationHealthPanel | organism | feature | Link state, token age, REST/MQTT health, last message, next retry, drift counter |
| PrintersPanel + PrinterRow | organism | feature | **FR-302 home** (within `/settings/integration`): lists bound devices; **Refresh/Discover** action (`POST /printers/refresh`), per-printer **Tracked** toggle (`PATCH /printers/{id}`), and **Add printer by serial** manual-registration form (`POST /printers`, ADR-012 Q-02 fallback) |

### 7.2 Interactive component 10-state model (applied to every interactive element)

For **Button** (representative; the same 10 states are specified for Input, Select, DataTable row, SlotTile, NavItem):
1. **default** — `--button-primary-bg`, fg `--button-primary-fg`.
2. **hover** — `--button-primary-bg-hover`; cursor pointer.
3. **focus-visible** — 2 px `--color-ring` outline, offset 2 px (keyboard only; WCAG 2.4.7/2.4.11).
4. **active/pressed** — one stop darker; 80 ms `--duration-instant`.
5. **disabled** — opacity 0.5, `pointer-events:none`, `aria-disabled`.
6. **loading** — spinner replaces label, width preserved (no layout shift), `aria-busy`.
7. **error** (context) — destructive variant / field error text + `aria-invalid`.
8. **success** (context) — transient success affordance then settle.
9. **selected/active** (nav, row, slot) — `--color-primary` accent + `aria-current`/`aria-selected`.
10. **empty/skeleton** (data components) — skeleton matches final dimensions (no CLS).

### 7.3 Detailed specs — key components

- **DataFreshness (atom, load-bearing)**: inputs `capturedAt: string(date-time)`, **`freshMaxSec` (default 10, the NFR-PE-02 live boundary)**, **`staleMinSec` (default 120, the FR-304 stale line)**, `connected?: boolean`, `error?: boolean`. **Two named boundaries, never a single ambiguous threshold.** Computes `age = now − capturedAt` and resolves a **five-value state** in strict priority order:
  1. `error` — when `error` is set (load/parse failure);
  2. `offline` — when `connected === false` (printer/integration not connected);
  3. `fresh` — `age ≤ freshMaxSec` (≤10s → live);
  4. `aging` — `freshMaxSec < age ≤ staleMinSec` (10–120s → still connected but not within the live budget; de-emphasized "updated Ns ago", **never labeled or colored as `fresh`**);
  5. `stale` — `age > staleMinSec` (>120s → treated as not-live per FR-304).
  Because `fresh` requires `age ≤ freshMaxSec` and `freshMaxSec` (10) < `staleMinSec` (120), a value older than 10s can **never** resolve to `fresh` (closing the previous single-`thresholdSec` contradiction). Markup: `<span role="status" data-freshness={state} data-captured-at={capturedAt} title="Updated {relative}">` with an icon + relative-time text ("3s ago", "aging — 40s ago", "stale — 4m ago", "offline — last seen 12m ago"). Colors: `fresh`→`--color-status-fresh`, `aging`→`--color-muted-foreground` (neutral, not the fresh green), `stale`→`--color-status-stale`, `offline`→`--color-status-offline`, `error`→`--color-status-error`. Ticks every 1 s via a shared interval (one timer app-wide). **This is the concrete m5 inspectable element** (§12.5).
- **PrinterCard (organism)**: consumes `TelemetrySnapshot`. Header = printer name + `printerState` StatusPill + `DataFreshness(capturedAt, freshMaxSec=10, staleMinSec=120, connected)` — i.e. the default two-boundary contract, so a value >10s old renders `aging`/`stale` (dimmed, "updated Ns ago"), **never `fresh`** (fixes the prior `threshold=120` bug that would have rendered a 90s-old value as live). Body = job name, progress bar (`progressPct`), `currentLayer/totalLayers`, `remainingTimeMin`, temps (nozzle/bed/chamber; chamber hidden when null per NFR-CO-02). Null fields render "—", never a stale value as live (AC-304.2). `aging`/`stale`/`offline` → dimmed body + last-seen line.
- **AmsSlotPanel + SlotTile (organism)**: consumes `SlotView[]`. One SlotTile per physical slot **plus one for `254:0` external holder** (`external:true`, AC-305.4). Tile shows tray observation (type/color swatch from `trayColorHex`), mapping (spool label + live remaining g/% from `spool`), and a **verify badge** when `mapping.verifyFlag` (reason: tray_mismatch / spool_unavailable). Actions: Map (Combobox over `listSpools`, material/color-suggested first — AC-305.1), Unmap, Confirm-mapping. Depleted/archived mapped spool → "mapped spool unavailable" (ES-305.1).
- **SpoolLedgerTable (organism)**: consumes `LedgerEntry[]` newest-first with `balanceAfterG` running balance (AC-103.2); entry-type badge; `overConsumption` flag; `estimated` marker; reversal entries visually link to the entry they reverse (`reversesEntryId`).
- **Goods-Reception form (feature, on `16-multi-step-wizard`)**: one row per outstanding PO line — received qty (default = outstanding), damaged qty (creates archived spools — FR-207), actual unit price override, discrepancy note. Over-delivery (received > outstanding) requires an explicit `confirmOverDelivery` checkbox (ES-205.1); damaged > received blocked client-side (ES-207.1). Confirm step summarizes spools-to-create before POST.
- **CostBreakdownPanel (feature)**: consumes `CostBreakdown`. Lines: filament (always), energy + machine (or "not configured" when null — AC-403.2), total. `incomplete` → warning marker + explanation. Currency from `currencyCode` (display-only; §see §10 formatting). Shows the frozen `inputs` snapshot and a "Recalculate" action (AC-404.2).
- **UserMenu (molecule, TopBar) — FR-002 logout home**: a Radix dropdown anchored at the TopBar trailing edge, triggered by an account button (user glyph). Items: **"Account settings"** (navigates to `/settings/account`) and **"Log out"**. "Log out" fires a `useMutation` against `POST /api/auth/logout` (invalidates the `gbx_session` server-side, ADR-007); `onSuccess` runs `queryClient.clear()` (drops all cached data incl. `['auth','session']`) and performs a router navigation to `/login` — satisfying **AC-002.1** (server-side session invalidation + redirect to `/login`). Keyboard-operable (arrow/Enter/Esc), `aria-label`ed trigger; the logout item shows the 10-state `loading` affordance while the request is in flight. A failed logout surfaces an error toast and leaves the user authenticated (no client-only "fake" logout — the session is the server's truth).
- **PrintersPanel + PrinterRow (organism) — FR-302 printer discovery/tracking/registration home**: a **Printers** section within `/settings/integration` (below IntegrationHealthPanel). Reads the bound-device list via `GET /printers` into query key `['printers']`. Contents:
  - **Refresh / Discover** button → `useMutation` on `POST /printers/refresh` (**AC-302.2**); on success `invalidateQueries(['printers'])`. Shows the 10-state `loading` affordance and a last-refreshed `DataFreshness`-style timestamp; disabled while the integration is unlinked.
  - One **PrinterRow** per discovered device: serial, model, connection/online state (StatusPill, icon+text), and a **Tracked** `Switch` → `PATCH /printers/{id}` with the `tracked` flag (optimistic toggle, reverts on error). Only tracked printers surface on the dashboard (FR-304) — the row copy states this.
  - **Add printer by serial** form (TanStack Form + Zod) → `POST /printers`, the **ADR-012 Q-02 permanent manual-registration fallback** for devices discovery misses; validates serial format client-side, surfaces RFC 7807 field errors, and appends to `['printers']` on success.
  - Empty state ("no printers discovered — Refresh or add one by serial") and unlinked state (prompt to link Bambu first) both offer a next action (NFR-US-03).

---

## 8. State Management

Per SKILL §8 ("Complex — async, caching, sync → TanStack Query + lightweight client store").

| State category | Solution | Rationale / mapping |
|----------------|----------|---------------------|
| **Server state** (all fetched data) | **TanStack Query v5** with a query-key factory | Caching, dedup, background refetch, and the SSE-invalidation seam. One query key per API resource (e.g. `['spools', filters]`, `['printer', id, 'telemetry']`, `['inventory','alerts']`, `['jobs', filters]`). Mutations use `useMutation` with `onSuccess` invalidation + optimistic updates where safe (never on ledger-affecting writes — those await server truth). |
| **Live-update invalidation** | **SSE → queryClient** bridge (see §8.4) | The 5 SSE message types map to `invalidateQueries` / `setQueryData` calls — TanStack Query's native external-event pattern (ADR-005). |
| **Client UI state** (modals, drawers, selection, theme, toast queue, command palette) | Local `useState` first; **Zustand** only for genuinely global UI (theme, toast queue, nav-collapse) | Right-sized; no Redux (SKILL rule). |
| **Form state** | **TanStack Form** + Zod v4 validators | PO, reception, product, spool, cost-rates, manual job, password. Zod schemas mirror API input schemas (`ProductInput`, `SpoolInput`, `PurchaseOrderInput`, reception body, `ManualJobInput`, `CostRatesInput`) — same validator idiom as backend. |
| **URL state** (filters, pagination, sort, active tab) | **TanStack Router typed search params** | Inventory filters (material/color/vendor/status), jobs filters (printerId/outcome/from/to/sort), table pagination → shareable, back-button-correct, and typed. Maps 1:1 to REST query params. |

### 8.4 SSE live-update consumption (ADR-005) — the live dashboard core

One app-level `EventSource('/api/events')` opened after auth (cookie `gbx_session` sent automatically — plain HTTP, same origin). A single dispatcher maps each SSE message type to cache actions:

| SSE message (Part C) | Payload | UI target(s) | Cache action |
|----------------------|---------|--------------|--------------|
| `telemetry` | `{printerId, snapshot: TelemetrySnapshot, capturedAt}` | PrinterCard, AmsSlotPanel | `setQueryData(['printer', printerId, 'telemetry'], snapshot)` — byte-identical to REST shape, so no transform; DataFreshness recomputes from `capturedAt` |
| `integrationStatus` | `{state, detail, nextRetryAt?}` | IntegrationHealthPanel, **degraded banner** (ES-304.1), **reauth banner** (FR-307) | `setQueryData(['integration','status'])`; `state=reauth_required` → show reauth banner linking to settings; `degraded` → degraded banner with last-known data retained |
| `lowStock` | `{productId, active, currentG, thresholdG, onOrderQty, earliestEta}` | LowStockAlertPanel, NavBadge | `invalidateQueries(['inventory','alerts'])` + badge count update |
| `mappingVerify` | `{printerId, slotRef, reason}` | SlotTile verify badge, NavBadge | `invalidateQueries(['printer', printerId, 'slots'])` |
| `jobUpdate` | `{jobId, kind}` | Jobs table, Job detail, toast | `invalidateQueries(['jobs'])` + `['job', jobId]`; `kind=costed` → toast; `consumption_pending` → "pending preview" marker (plan §7 autopost flag) |

**Degraded fallback (ADR-005, DG-3 P2)**: a small SSE-connection hook tracks `EventSource` errors; after two consecutive failures it flips telemetry + integration-status queries to `refetchInterval: 10_000` (polling `GET /api/printers/{id}/telemetry` and `GET /api/integration/status`) and surfaces a subtle "live updates degraded — polling" indicator. When the stream recovers, polling is disabled. Same query keys, same payload schema, **no divergent render path** — satisfies NFR-PE-02 (≤10 s) either way.

---

## 9. Routing

Router: **TanStack Router**, file-based route tree, config-driven auth guard. Route-level code splitting via `.lazy.tsx` (every route lazy-loaded — §13). Transitions: native View Transitions API where supported, else instant (§11).

**Auth guard (ADR-007)**: a root `beforeLoad` (on an authenticated layout route group) calls the cached `['auth','session']` query (`GET /api/auth/session`); on 401 it redirects to `/login` preserving the intended path. `/login`, `/setup`, and the not-found route are outside the guarded group. The cookie is HttpOnly — the client never inspects it; auth state is derived solely from the session endpoint (NFR-SE-06 enforced server-side; the guard is UX, not the security boundary).

| Path | Component (lazy) | Layout | Auth | Module |
|------|------------------|--------|------|--------|
| `/login` | LoginPage | AuthLayout | public | Auth |
| `/setup` | SetupPage | AuthLayout | public (first-run only) | Auth |
| `/` | DashboardPage | AppShell | guarded | Dashboard (FR-304/305/306/307/106) |
| `/inventory` | InventoryPage | AppShell | guarded | Inventory (FR-105/106/108) |
| `/inventory/spools/:spoolId` | SpoolDetailPage | AppShell | guarded | Inventory (FR-102/103/104/107) |
| `/catalog/products` | ProductsPage | AppShell | guarded | Inventory (FR-101) |
| `/catalog/vendors` | VendorsPage | AppShell | guarded | Procurement (FR-201) |
| `/inbound` | InboundPage | AppShell | guarded | Procurement (FR-204) |
| `/purchase-orders` | PurchaseOrdersPage | AppShell | guarded | Procurement (FR-202/203) |
| `/purchase-orders/:id` | PurchaseOrderDetailPage | AppShell | guarded | Procurement (FR-202/203/205/206) |
| `/purchase-orders/:id/receive` | ReceptionPage | AppShell | guarded | Procurement (FR-205/206/207) |
| `/jobs` | JobsPage | AppShell | guarded | Jobs (FR-406) |
| `/jobs/:id` | JobDetailPage | AppShell | guarded | Jobs (FR-401/402/404/405) |
| `/jobs/new` | ManualJobPage | AppShell | guarded | Jobs (FR-405) |
| `/settings` (index → account) | SettingsLayout | AppShell | guarded | Settings |
| `/settings/account` | AccountSettings | AppShell/Settings | guarded | Auth (FR-002 logout, FR-003 password) |
| `/settings/cost-rates` | CostRatesSettings | AppShell/Settings | guarded | Costing (FR-403) |
| `/settings/integration` | IntegrationSettings (incl. PrintersPanel) | AppShell/Settings | guarded | Integration (FR-301/302/306/307) |
| `/settings/low-stock` | LowStockSettings | AppShell/Settings | guarded | Inventory (FR-106) |
| `/settings/backup` | BackupSettings | AppShell/Settings | guarded | System (backup) |
| `*` | NotFoundPage | AppShell | guarded | Error (`17`) |

All four V1 modules + auth/setup + settings covered. Code-splitting: each `*Page` is a lazy route; the DataTable/heavy TanStack deps load with their routes; shared shell + tokens in the initial chunk.

---

## 10. Responsive Strategy

Methodology: **mobile-first** (base styles → `min-width` up). Breakpoints confirmed against NFR-US-01's three named widths.

| Token | Min-width | Target device | NFR-US-01 |
|-------|-----------|---------------|-----------|
| (base) | 0 | phone portrait | **360 px** must be usable |
| `md` | 768px | tablet | **768 px** |
| `lg` | 1280px | desktop | **1280 px+** |
| `xl` | 1536px | wide (optional polish) | — |

Container queries (Tailwind v4 `@container`) used for dashboard cards and the AMS panel so tiles reflow to their column width, not the viewport.

### Element behavior matrix

| Element | 360 px (base) | 768 px (md) | 1280 px (lg) |
|---------|---------------|-------------|--------------|
| Side nav | Off-canvas drawer (hamburger) | Collapsed icon rail | Full labeled rail |
| Dashboard printer cards | 1 col, stacked | 2 col grid | 2–3 col (container-query) |
| AMS slot panel | Slots wrap 2-up, external holder last | 4-up | inline row per unit |
| Data tables (inventory/jobs/inbound) | **Card list fallback** (each row → stacked key/value card; priority columns only) | Horizontal-scroll table, frozen first col | Full table, all columns |
| Spool ledger | Card list | Table | Table |
| Forms (PO/reception/job/product) | Single column, full-width controls | Single column, wider | 2-col field groups where sensible |
| Reception wizard | One dense scroll form + sticky confirm bar | Same, wider | Line grid + summary side panel |
| Cost breakdown | Stacked lines | Stacked | Side panel next to job detail |
| Banners (degraded/reauth) | Full-width top, wraps | Full-width | Full-width |

- **Touch targets**: all interactive elements ≥ 44×44 px (exceeds WCAG 2.2 24×24 min; sized for glove/workshop use). Table row actions get an overflow menu on mobile to preserve target size.
- **Image strategy**: the app is near-imageless (data UI). The only "images" are CSS color swatches (filament color from `colorHex`/`trayColorHex`) — rendered as tokened `<span>` backgrounds, no image requests. Any future raster asset: AVIF/WebP, explicit `width`/`height`, `loading="lazy"`. Icons are inline SVG (lucide), no sprite fetch.
- **Number/currency formatting**: `Intl.NumberFormat` with `currencyCode` from `CostRateSettings` (display-only; default NOK is an assumption pending Q-03 — editable in settings). Weights formatted `g` with fixed decimals; monospace for alignment.

---

## 11. Motion & Animation

Motion budget concentrated on **state-change legibility**, not decoration — appropriate for an instrument panel. Uses the §4 motion tokens.

| Category | Where | Duration / easing | Tech |
|----------|-------|-------------------|------|
| Entry | Dialog/sheet/toast/popover appear | `--duration-base` / `--ease-emphasized` | CSS transition (Radix data-state) |
| Exit | Same, dismiss | `--duration-fast` / `--ease-standard` | CSS |
| State change | Progress bar advance, StatusPill/freshness color change, low-stock highlight | `--duration-base` / `--ease-standard` | CSS transition on width/color |
| Feedback | Button press, checkbox, row select | `--duration-instant` | CSS |
| Loading | Skeletons (pulse), spinners | 1.2 s loop | CSS |
| Route transition | Page swap | `--duration-base` cross-fade | View Transitions API (progressive; instant fallback) |
| Live value update | New telemetry value → brief 1-frame highlight so the eye catches the change | `--duration-fast` | CSS (subtle background flash) |

**Deliberately excluded**: parallax, scroll-driven animation, decorative motion, animated charts (no charts). Progress/telemetry changes animate the *transition* (e.g. progress width) but never obscure the current value.

**Reduced motion (non-negotiable, WCAG 2.3.3 / SKILL)**: under `@media (prefers-reduced-motion: reduce)` all non-essential animation is disabled — transitions become instant, the live-value highlight and skeleton pulse are removed, View Transitions are skipped. Essential state (freshness color, error) still changes, just without transition. Implemented once as a global CSS layer.

---

## 12. Accessibility

**Target: WCAG 2.2 Level AA** on all core flows (NFR-US-02), satisfying DG-2 P3. shadcn/Radix supplies accessible primitives; the requirements below are the project-specific obligations layered on top.

### 12.1 Perceivable
- Contrast ≥ 4.5:1 text / ≥ 3:1 large text & UI boundaries — verified against §4 token pairs in both themes.
- **Color never the sole indicator** (1.4.1): every status (fresh/stale/offline/error/low/overdue/verify, PO status, job outcome, spool status, ledger entry type) pairs color with an icon **and** a text label. Filament color swatches carry the color *name* as adjacent text and `title`.
- Semantic structure: one `<h1>` per page; landmark regions (`<nav>`, `<main>`, `<aside>` for panels); tables use `<th scope>`; skeleton loaders keep layout (no reflow-on-load confusion).
- Text resizable to 200% without loss (relative units throughout).

### 12.2 Operable
- Full keyboard access: every action (map/unmap slot, adjust weight, receive, correct job, export, link Bambu) reachable and operable by keyboard; no traps; Esc closes overlays; focus returns to trigger on close.
- Skip-to-content link; visible focus (`--color-ring`, 2 px, offset) — meets 2.4.7 and 2.4.11 (focus-not-obscured).
- Target size ≥ 24×24 (2.5.8) — we exceed at 44×44.
- Data tables: sortable headers are buttons with `aria-sort`; row actions keyboard-reachable; the Combobox spool picker is arrow-key navigable.
- No drag-only interactions (2.5.7) — slot mapping is a picker, not drag-drop.

### 12.3 Understandable
- Visible, persistent labels on every field (3.3.2); no placeholder-as-label.
- Descriptive, field-level errors from RFC 7807 problem responses mapped to the offending field (3.3.1/3.3.3); reception/PO/job forms show a summary + inline errors.
- Consistent nav and help placement; `<html lang="en">` (single locale, A-07).
- **Accessible authentication (2.2 new — 3.3.8)**: password field allows paste and password-manager autofill; no cognitive-function test.
- Every error state offers a **next action** (NFR-US-03 second clause): retry on failed loads (ES-105.1), re-link on reauth (FR-307), configure-rates prompt on "not configured" cost lines.

### 12.4 Robust
- Valid HTML; ARIA only where semantics are insufficient (Radix handles most).
- Live regions: SSE-driven changes announced without stealing focus — toast uses `role="status"` (polite); the degraded/reauth banners use `role="alert"` (assertive) once on state change; the low-stock nav badge updates an `aria-live="polite"` count.

### 12.5 m5 / NFR-US-03 — concrete inspectable freshness criterion (DG-2 P4)

**Criterion (binding, inspectable, automatable):** *Every rendered live value MUST be accompanied by a `<DataFreshness>` element (§7.3) that carries a `data-freshness` attribute (`fresh` | `aging` | `stale` | `offline` | `error`) and a `data-captured-at` ISO-8601 attribute, and exposes the freshness to assistive tech via `role="status"`.*

"Live value" = any value sourced from telemetry or an SSE-updated query: printer state, progress %, layers, remaining time, each temperature, each AMS/slot tray observation, mapped-spool live remaining weight, and the integration health timestamps.

- **Freshness thresholds (two named boundaries — see §7.3 DataFreshness contract, must stay in lockstep with it):** using `freshMaxSec = 10` (NFR-PE-02) and `staleMinSec = 120` (FR-304):
  - `fresh` when `now − capturedAt ≤ freshMaxSec` (≤10s → live);
  - `aging` when `freshMaxSec < age ≤ staleMinSec` (10–120s → connected but outside the live budget; de-emphasized, **not** presented as live);
  - `stale` when `age > staleMinSec` (>120s, FR-304);
  - `offline` when the printer/integration is not connected;
  - `error` on load failure.
  Because `freshMaxSec (10) < staleMinSec (120)`, a value older than 10s (e.g. a 90s-old telemetry reading) can **never** resolve to `fresh` — it is `aging` or `stale`. This removes the earlier single-`thresholdSec` ambiguity where a 120s default let 90s-old data read as `fresh`.
- **Never present stale as live** (AC-304.2): for `aging`/`stale`/`offline` the value area is visually de-emphasized and labeled with last-seen time; the raw last value is shown *as historical*, not as current.
- **Acceptance test (standing CI gate — not only a D6 audit item):** an automated RTL/DOM test, wired into CI as a **required merge gate alongside the §13 bundle-size budget**, that:
  1. asserts every live-value container has a descendant `[data-freshness][data-captured-at]` exposed as `role="status"` (presence);
  2. asserts the **computed state** is correct against controlled `capturedAt` fixtures — with a frozen clock it feeds a value at `age = 90s` (and boundary cases at 9s, 11s, 121s) and asserts `data-freshness` resolves to `aging`/`stale`, **never `fresh`** (state, not just presence). This is the check that would have caught the PrinterCard `threshold=120` regression.
  The exit condition is "zero live values without a conforming freshness element **and** zero live values whose computed `data-freshness` mis-resolves against its `capturedAt`." This makes the previously "soft" NFR-US-03 measurable and continuously enforced.

WCAG 2.2 AA checklist reference: full success-criteria list tracked in D6 accessibility audit (plan §Phase D6, NFR-US-01/02); automated axe pass + keyboard walkthrough on all core flows is the acceptance gate.

---

## 13. Performance

LAN-served, single user — budgets are comfortable but **still enforced** (no free pass; the seeded-volume NFR-PE-01 is the real pressure).

| Metric | Target | Measurement |
|--------|--------|-------------|
| LCP | < 2.0s (LAN; tighter than default 2.5s) | 75th pct, local |
| INP | < 200ms | 75th pct |
| CLS | < 0.1 | 75th pct |
| FCP | < 1.5s | 75th pct |
| TTI | < 3.0s | 75th pct |
| Initial JS bundle | **< 200KB gzipped** | shell + router + query core; route chunks lazy |
| Table interaction (10k jobs / 100k ledger) | < 200ms scroll/filter frame budget | virtualization; ties to NFR-PE-01 (500ms p95 API) |

**Enforcement rules**:
- Route-level code splitting — every `*Page` lazy (`.lazy.tsx`); TanStack Table + virtual load with their routes, not the shell.
- **Virtualize** all potentially large tables (jobs, ledger, spools) with `@tanstack/react-virtual` — never render 100k rows; page via `?limit=&offset=` (API default 50, max 500) mapped to URL state.
- Skeletons match final dimensions (no CLS); progress bars/live values have reserved space (no shift on update).
- Fonts: `font-display: swap`; preload Inter + JetBrains Mono; max 2 families (both already in scope).
- No third-party scripts; no analytics (LAN, one user); no chart lib.
- React Compiler on (overlay) — avoids manual memoization pitfalls in the always-updating dashboard.
- One shared 1 s interval drives all DataFreshness ticks (no per-component timers) — keeps the live dashboard cheap.
- Bundle analysis (`rollup-plugin-visualizer`) gate in CI; the 200KB initial budget is a build-fail threshold.

Validated against the visual system: type scale, motion durations, and token choices in §4/§5/§11 are all within these budgets (restrained motion, no heavy shadows, system-adjacent fonts, no images).

---

## Appendix A — FR → UI coverage (all four V1 modules)

**(1) Filament Inventory** — Catalog (`/catalog/products`, FR-101) + spool list (`/inventory`, FR-105) + spool detail with ledger (`/inventory/spools/:id`, FR-102/103/104/107) + low-stock alerts (dashboard panel + `/settings/low-stock`, FR-106) + valuation (inventory column, FR-108).
**(2) Inbound / Reception** — PO list/detail (`/purchase-orders`, FR-202/203), inbound overview (`/inbound`, FR-204), goods-reception form with damaged/over-delivery/discrepancy (`/purchase-orders/:id/receive`, FR-205/206/207), vendors (`/catalog/vendors`, FR-201).
**(3) Live Printer Dashboard** — SSE-driven printer cards (FR-304), AMS + external-spool 254:0 mapping (FR-305 incl. AC-305.4), staleness flagging (m5/NFR-US-03), integration health/degraded banner (FR-306, ES-304.1), reauth banner + settings link (FR-307), account linking/verify/manual-token/region/kill-switch (`/settings/integration`, FR-301), **printer discovery/refresh + tracked-printer selection + manual serial registration** (PrintersPanel in `/settings/integration`, FR-302 incl. AC-302.2 and the ADR-012 Q-02 manual fallback).

**(Auth & session)** — first-run setup + login (`/setup`, `/login`, FR-001), **logout** via TopBar UserMenu / `/settings/account` (FR-002, AC-002.1 — `POST /api/auth/logout` + redirect to `/login`), password change (`/settings/account`, FR-003).
**(4) Print Jobs & Costing** — history table w/ filters + CSV export (`/jobs`, FR-406), job detail w/ cost breakdown + attribute/correct/recalculate (`/jobs/:id`, FR-401/402/404/405), manual job entry (`/jobs/new`, FR-405), cost rates (`/settings/cost-rates`, FR-403), task-sync surfaced via SSE `jobUpdate` + on-demand sync action (FR-308).

## Appendix B — UI/UX quality self-validation (SKILL "UI/UX Quality Validation")
- **Nielsen heuristics**: visibility of system status (DataFreshness everywhere, integration health panel), match to real world (workshop vocabulary: spool, AMS, reception), user control (Unmap, Recalculate, reversible corrections), error prevention (over-delivery/archived-spool confirms), recognition over recall (pickers pre-filtered by material/color).
- **10-state coverage**: specified §7.2 for all interactive components.
- **Destructive-action confirmation levels**: ConfirmDialog for archive-while-mapped (ES-107.1), over-delivery (ES-205.1), archived-spool correction (ES-405.1), unlink Bambu (AC-301.3).
- **Empty/error states**: `17-error-pages` reusable empties for zero-data tables; every failed load offers retry (ES-105.1) — NFR-US-03 "next action" satisfied.
- **Responsive data-display fallback**: tables → card list at 360 px (§10).
- **Navigation hierarchy**: flat single-level nav (right-sized for the surface); badges for attention (low-stock, verify-mapping).
- **Feedback**: toast for mutations/SSE events; banners for integration degradation/reauth.
- **Documented exception**: `05-analytics` template and any charting are deliberately excluded (ADR-008 defers telemetry history; not a scope cut, an upstream decision).
