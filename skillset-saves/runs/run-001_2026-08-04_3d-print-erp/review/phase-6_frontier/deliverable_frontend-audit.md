---
type: deliverable
pipeline: review
phase: 6
skill: frontier
name: Frontend Audit Report
version: 1
status: draft
created: 2026-08-05T00:00:00Z
---

# FRONTEND AUDIT REPORT — GeekBOX Print Management

**Scope:** Full application (React 19 SPA), `apps/frontend/src` (65 files) + existing `dist/` build.
**Method:** Static source analysis + one *read-only* measured artifact (ran the repo's own `bundle-budget.mjs` against the committed `dist/`). No browser, Lighthouse, axe, or screen-reader runs were possible in this environment. **All performance and accessibility findings are code-inferred / static-analysis-based unless explicitly marked measured. No CWV numbers are fabricated (Iron-Law).**

## Technology Stack

- **Framework:** React 19.1.1 (client-side rendered SPA; no SSR/SSG)
- **Build tool:** Vite 6.4.3 (stack-lock specified Vite 8/Rolldown — documented deviation in `vite.config.ts:8-9`)
- **Router:** TanStack Router 1.132 (file-less, code-defined tree, `defaultPreload: 'intent'`, lazy route components)
- **Data:** TanStack Query 5.90 + custom `fetch` client; SSE bridge with poll fallback
- **Tables:** TanStack Table 8.21 + TanStack Virtual 3.13
- **Forms:** TanStack Form 1.19 + Zod 4
- **CSS:** Tailwind 4.1 (`@theme` tokens, OKLCH palette), shadcn-style hand-rolled UI
- **State:** Zustand 5 (`ui-store` — theme, nav, toasts, SSE-degraded flag)
- **Rendering strategy:** CSR SPA, static `dist/`, dev proxy `/api → :8080`
- **React Compiler:** NOT enabled (confirmed — no `babel-plugin-react-compiler` in `package.json`; manual `useMemo`/`useCallback` are load-bearing)

## Domain Scores

| Domain | Score | Critical | Major | Minor |
|--------|-------|----------|-------|-------|
| Performance | **Pass (static)** | 0 | 0 | 2 |
| Accessibility | **Conditional** | 0 | 3 | 4 |
| Frontend Security | **Conditional** | 0 | 2 | 2 |
| Component Architecture | **Conditional** | 0 | 1 | 2 |
| UI/UX Quality | **Pass** | 0 | 0 | 3 |

**Totals:** Critical 0 · Major 6 · Minor 13
**Overall verdict:** **Conditional** — no launch-blocking defects; a small cluster of WCAG 2.2 gaps and a missing CSP/error-boundary should be remediated before production.

---

## Findings by Domain

### Domain 1 — Performance (static analysis)

**Overall:** Strong. Route-level code splitting is real, virtualization is used for large lists, a single shared 1s clock drives all freshness ticks, and there is an enforced bundle budget.

**P-1 (Minor) — Initial JS carries table + form vendor chunks eagerly (measured graph).**
- **Evidence:** `dist/.vite/manifest.json` entry `index.html` has static `imports: ["tanstack-form...","tanstack-table..."]`. Running the repo's own gate (`node scripts/bundle-budget.mjs`) reports — **measured**:
  ```
  index-DyatOafV.js       107.5 KB gz
  tanstack-form-...js       13.0 KB gz
  tanstack-table-...js      18.6 KB gz
  Initial JS: 139.1 KB gz (budget 200 KB)  → PASS
  ```
- **Standard:** Performance budget best practice (SKILL Domain 1 — code splitting); the 139 KB < 200 KB claim is **confirmed**.
- **Impact:** ~31.6 KB gz of table/form code loads on first paint even on routes that need neither (e.g. `/login`, which imports neither table nor form-heavy DataTable). Not a budget breach, but the entry is ~29% larger than necessary for the auth/first-paint path. `manualChunks` in `vite.config.ts:37-45` groups these vendors but they remain in the entry's *static* import graph.
- **Fix:** Ensure `DataTable`/`SpoolLedgerTable` and TanStack Form are only reached through lazy route chunks (they largely are), and confirm no eagerly-loaded shell module imports them at module scope. Consider a `login`-only entry path.

**P-2 (Minor) — No `<img>`/media dimension or LCP concerns to audit, but no `prefers-reduced-motion` on the JS toast auto-dismiss / no route-transition perf guard.**
- **Evidence:** App is icon-driven (lucide SVGs, no raster hero images), so classic LCP/CLS image risks are absent — a genuine strength. `tailwind.css:181-190` correctly honors `prefers-reduced-motion` for CSS animations/transitions.
- **Standard:** CWV/CLS (SKILL Domain 1). **Cannot be measured here** — flagged as static-only.
- **Impact:** Low. Recommend a real Lighthouse/WebPageTest run before claiming CWV pass; this audit cannot certify LCP/INP/CLS numerically.

*Positive notes:* `DataTable` virtualizes via `@tanstack/react-virtual` (`DataTable.tsx:59-65`, enabled >50 rows in `SpoolLedgerTable.tsx:90`); `Skeleton` loaders match final dimensions to avoid CLS (`misc.tsx:5`); shared clock is one app-wide `setInterval` (`freshness.ts:82-100`), not one-timer-per-cell.

---

### Domain 2 — Accessibility (WCAG 2.2 AA) — PRIORITY DOMAIN

The build's cross-check reportedly fixed 12 a11y lint issues; the baseline is genuinely good (skip link, visible focus ring, semantic landmarks, icon+text badges, visible form labels, `role="status"` freshness, toast live region). Remaining gaps are structural, not cosmetic.

**A-1 (Major) — Form error text is not programmatically associated with its input (`aria-describedby` missing).**
- **Evidence:** `forms/FormField.tsx:19` renders children with only `{ id, 'aria-invalid' }`; the error is emitted as `<p id={`${id}-error`} role="alert">` at `FormField.tsx:34-38`, but **no input receives `aria-describedby={`${id}-error`}`**. Confirmed at every call site, e.g. `routes/Login.tsx:64-72` (`<Input id={id} aria-invalid={invalid} />` — no `aria-describedby`), `forms/SpoolForm.tsx`, `forms/ProductForm.tsx`, `routes/settings/Account.tsx`, `CostRates.tsx`, `Integration.tsx`.
- **Standard:** WCAG 2.2 **3.3.1 Error Identification (A)** / **1.3.1 Info & Relationships (A)**.
- **Impact:** Screen-reader users hear the field label and "invalid" but the corrective message is not announced as the field's description on focus — errors can be silently missed. Single-point fix in `FormField.tsx` (pass `aria-describedby` to the render-prop child) remediates all forms at once.

**A-2 (Major) — Modal `Dialog` and `Sheet` do not trap focus, move focus on open, or restore it on close.**
- **Evidence:** `components/ui/dialog.tsx:16` self-describes as "focus trap-**lite**". The effect (`dialog.tsx:26-38`) only wires Escape + scroll-lock; there is no `focus()` into the dialog on open, no Tab containment, and no focus restore to the trigger on close. `components/ui/sheet.tsx:26-36` is identical. Both correctly set `role="dialog"` + `aria-modal="true"` (`dialog.tsx:45-47`, `sheet.tsx:41`).
- **Standard:** WCAG 2.2 **2.4.3 Focus Order (A)**, **2.1.2 No Keyboard Trap (A)** (the inverse — focus is not *contained*), **2.4.11 Focus Not Obscured**. `aria-modal="true"` asserts a containment contract the code does not honor.
- **Impact:** Keyboard/AT users can Tab out of the modal to the (inert-looking but still focusable) page behind it, and on close focus is lost to `<body>`. Affects every confirm/edit flow (archive, unlink, over-delivery `ConfirmDialog`, AMS map-spool, row-edit sheets).
- **Fix:** Add focus-move-on-open, a focus-trap loop, and focus-restore; or adopt an inert/`<dialog>`-backed primitive.

**A-3 (Major) — `TabBar` (local tabs) lacks the WAI-ARIA tab keyboard pattern.**
- **Evidence:** `components/ui/tabs.tsx:44-64` sets `role="tablist"` + `role="tab"` + `aria-selected`, but has **no roving `tabIndex`** (unselected tabs stay tab-stops), **no Arrow-key handler**, and no associated `role="tabpanel"` on the content it controls (e.g. `routes/settings/Integration.tsx` consumer). Used for the Bambu link-method switcher.
- **Standard:** WCAG 2.2 **2.1.1 Keyboard (A)** / **4.1.2 Name, Role, Value (A)** (ARIA Authoring Practices Tabs pattern).
- **Impact:** Declares itself a tablist to AT but behaves like a row of buttons — arrow navigation and the single-tab-stop expectation are broken, confusing screen-reader users. (Note: `TabsNav` at `tabs.tsx:10-32` is route-driven and correctly uses `<nav>` + `aria-current`; treating it as navigation rather than tabs is acceptable.)

**A-4 (Minor) — Clickable table rows are not keyboard-operable.**
- **Evidence:** `components/data/DataTable.tsx:137-143` attaches `onClick={onRowClick}` to `<tr>` with `cursor-pointer` but no `role="button"`, `tabIndex={0}`, or key handler. Row-click navigation (spools, jobs, POs) is mouse-only.
- **Standard:** WCAG 2.2 **2.1.1 Keyboard (A)**.
- **Impact:** Keyboard users cannot open a detail record by activating the row. Mitigated where each row also contains a focusable link/action, but the row affordance itself is inaccessible.

**A-5 (Minor) — `Combobox` options are not directly keyboard-reachable / no `aria-activedescendant`.**
- **Evidence:** `components/ui/combobox.tsx:111-145` renders options as `<div role="option" tabIndex={-1}>`; arrow keys move a visual `active` index on the search `<input>` (`combobox.tsx:93-107`) but the input lacks `role="combobox"`, `aria-controls`, and `aria-activedescendant`, so AT is not told which option is active. Enter selects the active option (works), but SR announcement of the highlighted option is absent.
- **Standard:** WCAG 2.2 **4.1.2 Name, Role, Value (A)** (Combobox pattern).
- **Impact:** Functional for sighted keyboard users; degraded for screen-reader users on spool/product/vendor pickers.

**A-6 (Minor) — `NavBadge` uses `role="img"` for a count.**
- **Evidence:** `components/shell/AppShell.tsx:125-134` — `<span role="img" aria-label="{count} low-stock alerts">`. Acceptable, but `role="img"` on a live-updating number is unusual; a plain `aria-label`ed span or visually-hidden text is more idiomatic.
- **Standard:** WCAG 4.1.2 (advisory).
- **Impact:** Low; announced count is correct.

**A-7 (Minor) — Color contrast unverifiable statically; some tokens are borderline by inspection.**
- **Evidence:** `tailwind.css:113,138` primary is `teal-600` (light) / `teal-400` (dark); `muted-foreground` is `slate-500`/`slate-400`. OKLCH lightness values (e.g. `--color-slate-500: oklch(0.56 …)` as muted text on light surface) are plausibly near the 4.5:1 boundary for small text.
- **Standard:** WCAG 2.2 **1.4.3 Contrast (Minimum) (AA)** — **cannot be measured here**; flagged static.
- **Impact:** Requires a contrast-checker/axe pass on rendered pages before certifying AA. Do not claim contrast pass without measurement.

*Positive notes:* skip-link (`AppShell.tsx:49-54`), global `:focus-visible` 2px ring (`tailwind.css:170-173`), `<html lang="en">` (`index.html:2`), badges enforce icon+text not color-alone (`pills.tsx`, badge component), toast host is an `aria-live="polite"` `<output>` (`toaster.tsx:23-26`), `ErrorState`/form errors use `role="alert"`.

---

### Domain 3 — Frontend Security

**S-1 (Major) — No Content-Security-Policy (and no other security headers referenced anywhere).**
- **Evidence:** `apps/frontend/index.html` (and built `dist/index.html`) contain no CSP `<meta>` tag; there is no helmet/meta CSP, no `require-trusted-types-for`, and the app ships an **inline** theme bootstrap `<script>` (`index.html:8-16`) that would require a nonce/hash under any strict CSP. No server header config is present in the frontend package (headers, if any, live outside this scope and are not evidenced here).
- **Standard:** CSP Level 3 (SKILL Domain 3); `frontend-security.md` — "No CSP at all → Major"; inline script blocks `strict-dynamic`/nonce adoption.
- **Impact:** No defense-in-depth against DOM/HTML injection. Low *current* exploitability because the app has **zero** `dangerouslySetInnerHTML`/`innerHTML`/`eval`/`document.write` sinks (verified by repo-wide grep — only match is `localStorage.setItem('gbx-theme')` in `ui-store.ts:39`), so there is no first-party XSS sink today; but any future regression would be unmitigated, and the missing CSP is a production hardening gap.
- **Fix:** Serve a CSP with `default-src 'self'`, `object-src 'none'`, `base-uri 'self'`, `frame-ancestors 'none'`, and hash/nonce the inline theme script; add HSTS, `X-Content-Type-Options: nosniff`, `Referrer-Policy` at the server/edge.

**S-2 (Major) — Bundle chunks are emitted with `crossorigin` but no Subresource Integrity.**
- **Evidence:** `dist/index.html:17-20` — `<script type="module" crossorigin src="/assets/index-…js">` and `<link rel="modulepreload" crossorigin …>` have no `integrity` attribute (Vite does not emit SRI by default).
- **Standard:** `frontend-security.md` §SRI. Severity is context-dependent: assets are same-origin here, so SRI's value is lower than for CDN assets.
- **Impact:** If assets are ever served from a CDN/edge without SRI, tampering is undetectable. For same-origin static hosting the risk is Medium→Minor; downgrade-justified but worth noting.

**S-3 (Minor) — Auth token handling is correct; no secrets in client.**
- **Evidence:** `api/client.ts:73-83` uses `credentials: 'include'` with the HttpOnly `gbx_session` cookie (per comment ADR-007); **no token is read from or written to `localStorage`/`sessionStorage`** (grep confirms only theme is stored). 401 handling redirects to `/login` with a `redirect` param (`router.tsx:45-50`). This is the recommended pattern (`frontend-security.md` §Cookie Security).
- **Standard:** `frontend-security.md` — "Auth tokens not in localStorage" ✓.
- **Impact:** Positive finding; no action.

**S-4 (Minor) — SSE `onmessage` parses server frames without a schema guard; EventSource has no origin check.**
- **Evidence:** `sse/event-bridge.ts:95-102` — `JSON.parse(ev.data) as SseMessage` then `dispatch`. `EventSource` is same-origin (`/api/events`) so cross-origin injection is not possible, and malformed frames are caught, but there is no runtime (Zod) validation of the payload shape before it is written into the query cache via `setQueryData` (`event-bridge.ts:51`).
- **Standard:** DOM-XSS source-to-sink hygiene (`frontend-security.md`); data flows to render, not to an HTML sink, so severity is Minor.
- **Impact:** A compromised/buggy server frame could poison cache state (e.g. a malformed `TelemetrySnapshot`), surfacing as a render error rather than XSS. Recommend validating SSE payloads with the shared Zod schemas already in the repo.

---

### Domain 4 — Component Architecture

**C-1 (Major) — No React error boundary anywhere in the tree.**
- **Evidence:** No `componentDidCatch`, no `errorComponent` on any route (`router.tsx` defines none), and no `<ErrorBoundary>` component exists (grep-confirmed). `main.tsx:33-40` mounts `RouterProvider` with no fallback.
- **Standard:** SKILL Domain 4 — "error boundaries at route, feature, and critical component boundaries" (React best practice).
- **Impact:** TanStack Query async errors are handled well per-view (`ErrorState` + retry throughout), but any **render-time** exception (unexpected null, a throwing child) unmounts the whole SPA to a blank `#root` with no recovery path. Add a root error boundary and ideally per-route `errorComponent`s.

**C-2 (Minor) — Inline `.map()` option arrays passed to `Combobox` on every render.**
- **Evidence:** `routes/Reception.tsx`, `routes/ManualJob.tsx`, and `routes/JobDetail.tsx` pass `options={(spools.data ?? []).map(...)}` inline to `Combobox`. With React Compiler OFF this allocates a new array each render.
- **Standard:** SKILL Domain 4 — render efficiency / missing memoization where load-bearing.
- **Impact:** Low today (`Combobox` is not `React.memo`'d, lists are small), but it is exactly the class of manual-memo omission called out in the delegation given the compiler is disabled. Wrap in `useMemo` keyed on `spools.data`.

**C-3 (Minor) — `CostBreakdownPanel` conflates "not costed yet" with load error.**
- **Evidence:** `components/feature/CostBreakdownPanel.tsx` renders a null-cost branch as "not costed" without a distinct `isError` branch, so a failed cost load looks like an empty state.
- **Standard:** SKILL Domain 5 interaction states / Domain 4 error handling.
- **Impact:** Minor — a transient fetch failure is indistinguishable from legitimately-uncosted; add an explicit error branch.

*Positive notes:* TanStack Table column arrays **are** correctly `useMemo`'d across all six list routes (Inventory/Jobs/PurchaseOrders/Products/Vendors/Inbound + `SpoolLedgerTable.tsx:30`) — the compiler-off memoization risk was handled for the highest-cost case. State is well-colocated; global Zustand store is scoped to genuine UI-only concerns (`ui-store.ts`). Query-key factory (`query-keys.ts`) and centralized invalidation in `hooks.ts` are clean.

---

### Domain 5 — UI/UX Quality

**Loading / Error / Empty states — strong and consistent.** Every list route feeds `isLoading`/`isError`/`onRetry`/`empty` into `DataTable`; every detail route guards `isLoading` (Skeleton) and `isError`/`!data` (`ErrorState` + retry); `EmptyState` (`misc.tsx:81-102`) always offers a next action (NFR-US-03). Toasts are non-blocking with auto-dismiss (`ui-store.ts:62-67`).

**U-1 (Minor) — Two detail views miss an explicit error branch.**
- **Evidence:** `routes/SpoolDetail.tsx` guards `isLoading` but has no `spool.isError` branch; `JobDetail.tsx` attribute dialog calls `useSpools()` without surfacing its error. (Reported by route sweep; consistent with C-3.)
- **Impact:** Minor — a failed spool load may render a partial shell rather than a retryable error.

**U-2 (Minor) — Icon-only action affordance sizing.**
- **Evidence:** Table-cell icon buttons use `size="icon"` with `size-3`/`size-4` glyphs; visible labels/`aria-label` are present, but tap-target area on dense table rows may fall under the WCAG 2.2 **2.5.8 Target Size (24×24) (AA)** minimum on touch.
- **Impact:** Minor; verify rendered hit-area ≥24px. Inputs/primary buttons are `h-11` (44px) — good.

**U-3 (Minor) — Responsive strategy is sound but unverified at breakpoints.**
- **Evidence:** Off-canvas nav with backdrop (`AppShell.tsx:56-66`), `@container` cards (`PrinterCard.tsx:38,93`), `overflow-x-hidden` main, `md:` breakpoints throughout. Cannot be visually verified without a browser.
- **Impact:** Looks correct statically; confirm at 320/768/1024 before sign-off.

---

## Accessibility Status (summary)

**Conditional pass.** Foundations are solid (skip link, visible focus ring, `lang`, semantic landmarks, visible labels, live regions, icon+text status). Three Major structural gaps must be fixed for WCAG 2.2 AA: (A-1) `aria-describedby` on form errors, (A-2) real focus trap/restore in Dialog/Sheet, (A-3) TabBar keyboard/roving-tabindex pattern; plus keyboard-operable table rows (A-4) and combobox `aria-activedescendant` (A-5). Contrast (A-7) is **unverified** and must be measured with axe/contrast tooling before any AA claim — not certified here.

## Data-Freshness "m5 gate" Assessment

**Pass — this is the strongest part of the codebase.** The gate degrades gracefully and is well-tested.
- **Logic (`lib/freshness.ts:39-60`):** Two named boundaries (`freshMaxSec=10`, `staleMinSec=120`) with strict 5-state priority order (error > offline > fresh > aging > stale). Because `freshMaxSec < staleMinSec`, a >10s value can never resolve `fresh` — the exact regression the spec warns about. Unparseable `capturedAt` → `error` (defensive).
- **Component (`DataFreshness.tsx`):** Emits `role="status"`, `data-freshness`, `data-captured-at`; ticks via the shared 1s clock (`freshness.ts:82-100`) — one timer app-wide, not per-instance. `PrinterCard.tsx:70-75` dims the body when not `fresh` and never presents a stale value as live (null fields → "—").
- **SSE + poll fallback (`sse/event-bridge.ts`):** After 2 consecutive failures, flips `printer` + `integration.status` queries to a 10s `refetchInterval` poll, sets `sseDegraded` (drives a "live updates degraded — polling" banner), and reverts on `onopen`. Same query keys/payload — no divergent render path (matches ADR-005). Handles permanent `CLOSED` with manual reconnect.
- **Test (`tests/freshness.test.tsx`):** Frozen-clock coverage at 9/10/11/90/120/121s including the boundary and the "90s can NEVER be fresh" regression; verifies presence of a conforming `[data-freshness][data-captured-at]` `role="status"` descendant inside the live `PrinterCard` container. This is a genuine standing CI gate, not a smoke test.

## Bundle Budget Assessment

**Pass — claim verified (measured against committed `dist/`).** The repo's own gate reports **139.1 KB gz initial JS < 200 KB budget**. Manifest confirms 21 dynamic (lazy) route chunks and only 2 vendor chunks (`tanstack-form` 13.0 KB, `tanstack-table` 18.6 KB) in the entry's static graph alongside the 107.5 KB core. The `bundle-budget.mjs` script correctly walks only the static import graph and excludes dynamic imports. Only refinement: shrink the first-paint/auth path by keeping table+form purely on lazy routes (see P-1).

---

## Tool Recommendations

Before certifying Performance and Accessibility (this audit could not run them):
- **axe-core / Pa11y** against `/login`, `/`, `/inventory`, `/jobs/$id`, `/settings/integration` — confirm A-1..A-7 and measure contrast (A-7).
- **Manual keyboard traversal** — verify Dialog/Sheet focus trap (A-2), TabBar arrows (A-3), row activation (A-4), combobox (A-5).
- **Lighthouse / WebPageTest (mobile)** — obtain real LCP/INP/CLS; this report makes no numeric CWV claim.
- **NVDA/VoiceOver** — confirm error-message and combobox-option announcements.
- Re-run `npm run test:bundle-budget` in CI on every build (already wired).

---

## Pipeline Summary (Machine-Readable)

```
phase_id: 6
skill: frontier
status: COMPLETE
risk_assessment: Medium
domain_scores:
  performance: Pass
  accessibility: Conditional
  frontend_security: Conditional
  component_architecture: Conditional
  ui_ux_quality: Pass
finding_count:
  critical: 0
  major: 6
  minor: 13
verdict: Conditional
key_concerns:
  - "A-1 (Major, WCAG 3.3.1): form errors not linked to inputs via aria-describedby — FormField.tsx:19,34-38"
  - "A-2 (Major, WCAG 2.4.3/2.1.2): Dialog/Sheet claim aria-modal but have no focus trap/restore — dialog.tsx:16,26-38; sheet.tsx:26-36"
  - "S-1 (Major): no CSP or security headers; inline theme script would block nonce/strict-dynamic — index.html:8-16"
  - "C-1 (Major): no React error boundary anywhere — render exceptions blank the SPA — router.tsx / main.tsx:33-40"
  - "A-3 (Major, WCAG 2.1.1/4.1.2): TabBar declares role=tablist but lacks roving tabindex + arrow keys + tabpanel — tabs.tsx:44-64"
cross_references:
  - "apps/frontend/src/forms/FormField.tsx:19"
  - "apps/frontend/src/forms/FormField.tsx:34-38"
  - "apps/frontend/src/components/ui/dialog.tsx:16-38"
  - "apps/frontend/src/components/ui/sheet.tsx:26-36"
  - "apps/frontend/src/components/ui/tabs.tsx:44-64"
  - "apps/frontend/src/components/data/DataTable.tsx:137-143"
  - "apps/frontend/src/components/ui/combobox.tsx:111-145"
  - "apps/frontend/index.html:8-16"
  - "apps/frontend/dist/index.html:17-20"
  - "apps/frontend/src/router.tsx:45-50"
  - "apps/frontend/src/main.tsx:33-40"
  - "apps/frontend/src/sse/event-bridge.ts:95-102"
notes:
  - "All performance and accessibility findings are static/code-inferred. No CWV or contrast values were measured in this environment (Iron-Law). Bundle 139.1 KB and freshness tests are the only executed/measured artifacts."
  - "Known deviations confirmed: Vite 6.4.3 (spec locked 8/Rolldown); React Compiler NOT enabled."
```
