---
type: deliverable
pipeline: review
phase: 7
skill: design-qa
name: Visual QA Report
version: 1
status: draft
created: 2026-08-05T00:00:00Z
---

# DESIGN-QA AUDIT REPORT — GeekBOX Print Management (Frontend)

> **Review basis:** SOURCE-ONLY. No running UI, screenshots, or rendered build were available.
> All findings are derived from static analysis of the styling source under
> `apps/frontend/src` (Tailwind 4 `@theme` tokens + CVA component variants + Tailwind
> utility classes). No rendered-pixel measurements, contrast ratios, or layout-break
> observations are asserted (Iron-Law). Where a rendered check is required to confirm a
> finding, it is marked **[needs rendered verification]**.
> Frontend typechecks clean (per delegation). Fixes were NOT applied (read-only review);
> mechanical fixes are listed as RECOMMENDATIONS only.

## Design System Status
- **Design tokens:** Found — mature two-tier token system in `apps/frontend/src/tailwind.css`
  (Tier 1 primitives §4.1: color ramps in OKLCH, type scale, radii, shadows, durations,
  easing, z-index scale; Tier 2 semantic aliases §4.2 via `@theme inline` + `--gbx-*` CSS
  vars with a full `.dark` override block).
- **Token adherence:** **HIGH.** Colors, radii, typography, and spacing are almost entirely
  token/utility-driven. No arbitrary hex colors in components (a single placeholder-text
  `"#1E90FF"` example string is content, not styling). No `!important`. No inline theme
  styles (the two `style={{}}` uses are legitimately dynamic — progress-bar width and a
  user-supplied swatch color).
- **Class composition:** Correct shadcn-standard `cn()` = `clsx` + `tailwind-merge`
  (`apps/frontend/src/lib/cn.ts`).

## Domain Scores

| Domain | Score | Issues Found |
|--------|-------|-------------|
| Visual Hierarchy | Pass | 0 |
| Typography | Pass | 0 |
| Spacing | Pass | 1 (minor) |
| Color | Pass | 0 |
| Interactive States | Warn | 2 (1 major, 1 minor) |
| Responsive | Pass | 1 (info) |
| AI Slop | Clean | 2 (minor/info) |

**Overall risk: LOW.** This is a coherent, disciplined, spec-aligned design system — the
opposite of AI slop. Findings are targeted polish items, not systemic defects.

---

## Findings (by severity)

### MAJOR

#### M1 — `active`/pressed state absent on every interactive element (spec §7.2 state 4 unmet)
- **Location:** `apps/frontend/src/components/ui/button.tsx:6-27` (and all interactive
  primitives: `tabs.tsx`, `misc.tsx` Switch/MenuItem, `combobox.tsx`, `AppShell.tsx` nav links).
- **Excerpt (button base):**
  ```
  'inline-flex ... transition-colors focus-visible:outline-none focus-visible:ring-2 ...
   disabled:pointer-events-none disabled:opacity-50 ...'
  ```
  Variants define `hover:` and `focus-visible:` but **no `active:`** anywhere in the tree.
- **Standard violated:** Design spec §7.2 10-state model, state 4 — *"active/pressed — one
  stop darker; 80 ms `--duration-instant`"* (required for **every** interactive element);
  design-qa Phase 7 Interactive-State audit ("Active/Pressed: tactile feedback (scale, color
  shift)").
- **Evidence:** `grep active:|:active|scale-|pressed` over `apps/frontend/src` → **0 matches.**
- **Impact:** No press feedback on buttons, nav items, tabs, menu items, or the switch. On a
  workshop/touch device (the stated use case, spec §11 "glove/workshop use"), taps feel
  unresponsive between press and the async result. This is a specified, un-implemented state
  across the entire interactive surface.
- **Recommended fix (mechanical):** Add an `active:` color step per variant, e.g. primary
  `active:bg-teal-800 dark:active:bg-teal-200`; secondary/outline/ghost
  `active:bg-secondary` / `active:bg-surface-muted`. Optionally `active:scale-[0.98]`.
  Consider promoting to a shared `buttonVariants` update so all consumers inherit it.

### MINOR

#### m1 — z-index token scale (`--z-*`) defined but never used; raw `z-[…]` everywhere
- **Location:** tokens `apps/frontend/src/tailwind.css:68-76`; consumers
  `DataTable.tsx:92` (`z-[10]`), `AppShell.tsx:51,61,89,143` (`z-[700]/z-[290]/z-[300]/z-[200]`),
  `dialog.tsx:44,57` (`z-[400]/z-[401]`), `sheet.tsx:41` (`z-[400]`),
  `combobox.tsx:86` & `UserMenu.tsx:58` (`z-[500]`), `toaster.tsx:24` (`z-[600]`).
- **Excerpt:** tokens `--z-dropdown:100; --z-sticky:200; --z-overlay:300; --z-modal:400;
  --z-popover:500; --z-toast:600; --z-tooltip:700;` vs. usage `className="... z-[600] ..."`.
- **Standard violated:** SKILL.md Rule 5 (tokens are the single source of truth) + Tailwind-only
  guidance (flag arbitrary values that bypass the design system); frontend-patterns anti-pattern
  "z-index chaos → use a z-index scale (custom properties)".
- **Evidence:** `grep z-dropdown|z-sticky|z-overlay|z-modal|z-popover|z-toast|z-tooltip` →
  **only the definitions in tailwind.css match; zero consumers.** Values *mostly* mirror the
  scale numerically (200/300/400/500/600/700) but two diverge: `DataTable` sticky header is
  `z-[10]` (token `--z-sticky` = 200) and the mobile nav backdrop is `z-[290]` (no token
  value — an off-scale magic number).
- **Impact:** The layering contract lives in tokens but is enforced by hand-copied magic
  numbers, so it silently drifts (already: `z-[10]` header, `z-[290]` backdrop). A future
  reorder of the token scale will not propagate.
- **Recommended fix (mechanical):** Expose the z scale to utilities (Tailwind 4 auto-generates
  `z-<name>` from `--z-*` under `@theme`, so `z-modal`, `z-toast`, etc. are already available)
  and replace raw `z-[…]` with the named utilities; normalize the sticky header to `z-sticky`
  and the backdrop to `z-overlay`.

#### m2 — Motion duration/easing tokens unused; components rely on Tailwind default timing
- **Location:** tokens `apps/frontend/src/tailwind.css:61-66`; all transitions use bare
  `transition-colors`/`transition-transform`/`transition-all` (`button.tsx:7`, `input.tsx:12`,
  `select.tsx:14`, `tabs.tsx:20,54`, `AppShell.tsx:89,105`, `misc.tsx:65,72`, `PrinterCard.tsx:80`,
  `DataTable.tsx:141`).
- **Excerpt:** tokens `--duration-instant:80ms; --duration-fast:150ms; --duration-base:220ms;
  --ease-standard:cubic-bezier(0.2,0,0,1);` — no component references `duration-*` or `ease-*`.
- **Standard violated:** SKILL.md Rule 5 (tokens govern all values); spec §7.2 state 4
  prescribes `80 ms --duration-instant` for pressed feedback specifically.
- **Evidence:** `grep duration-|ease-standard|ease-emphasized` → only tailwind.css definitions;
  no component usage. All transitions therefore fall back to Tailwind's default 150 ms / default
  easing, which happens to equal `--duration-fast` but bypasses the token and ignores
  `--duration-instant`/`--duration-base`/`--ease-standard`.
- **Impact:** Motion timing is not centrally tunable and the spec's differentiated
  instant/base tempo is flattened to one hard-coded default. Low visible impact today; a
  consistency/maintainability gap. **[timing feel needs rendered verification]**
- **Recommended fix (mechanical):** Add `duration-fast ease-standard` (or `duration-instant`
  for the pressed step) to the shared transition utilities on interactive primitives.

#### m3 — Orphaned `animate-in` utility on the dialog backdrop (no-op)
- **Location:** `apps/frontend/src/components/ui/dialog.tsx:52`.
- **Excerpt:** `className="absolute inset-0 bg-black/50 animate-in"`
- **Standard violated:** AI-slop checklist — "CSS has no orphaned rules / selectors that match
  nothing"; design-qa Phase 9 "Orphaned styles".
- **Evidence:** `apps/frontend/package.json` has **no** `tailwindcss-animate` / `tw-animate-css`
  dependency, and `tailwind.css` defines only `@keyframes gbx-pulse` (+ `.skeleton`). No
  `animate-in` / `fade-in` keyframe or utility exists in source. The class is a dead no-op
  (the backdrop appears instantly with no fade). Note: the sheet backdrop (`sheet.tsx:45`)
  correctly omits it, so the two overlay backdrops are also inconsistent with each other.
- **Impact:** Dead class implies an intended entrance animation that never runs; minor
  inconsistency and a maintenance trap (a reader assumes the backdrop animates).
- **Recommended fix (mechanical):** Either remove `animate-in`, or add a real fade keyframe
  (e.g. a `@keyframes gbx-fade-in` + utility) and apply it to both dialog and sheet backdrops
  for parity.

#### m4 — Card composition drift: `CardHeader` fixed `gap-1` requires per-use overrides
- **Location:** `apps/frontend/src/components/ui/card.tsx:12-13` vs. consumer
  `apps/frontend/src/components/feature/PrinterCard.tsx:39`.
- **Excerpt:** header primitive `'flex flex-col gap-1 p-4'`; PrinterCard must override with
  `className="flex-row items-start justify-between gap-2 space-y-0"` (the `space-y-0` reset
  targets a `space-y` the primitive doesn't even apply — a copy-paste vestige from a shadcn
  Card that used `space-y-1.5`).
- **Standard violated:** AI-slop checklist — "No copy-pasted identical components / vestigial
  classes"; frontend-patterns "component composition".
- **Impact:** Low — cosmetic. Signals a shadcn-derived primitive whose reset classes weren't
  pruned; the `space-y-0` override is inert against the current `flex flex-col gap-1` header.
- **Recommended fix (mechanical):** Drop the inert `space-y-0` from PrinterCard's header
  override; it has no effect on a `gap`-based flex column.

### INFO / OBSERVATIONS (no action required)

- **I1 — Small-button touch target below the workshop spec.** `button.tsx:19` `size sm = h-9`
  (36 px) and `input/select` at `h-11` (44 px). Spec §11 mandates *all* interactive elements
  ≥ 44×44 px ("glove/workshop use"). `sm` buttons (used e.g. in empty-state CTAs,
  `Dashboard.tsx:43`) render at 36 px tall. Compliant with WCAG 2.2 (24 px) but **below the
  project's own 44 px bar**. Consider reserving `sm` for non-touch-primary contexts or bumping
  to `h-10`/`h-11`. **[final tap-size needs rendered verification]**
- **I2 — No page-level max-width / content container.** `AppShell.tsx:71` main is
  `p-4 md:p-6` with no `max-w-*`; content spans full viewport width. Responsive checklist
  suggests a desktop max-width (1200–1440 px). For a data-dense single-user ERP this is a
  defensible choice (tables benefit from width), so logged as INFO not a finding. On ultra-wide
  monitors, line lengths in prose panels may grow long. **[needs rendered verification]**
- **I3 — Hierarchy & spacing are clean.** Heading order is correct and centralized:
  `PageHeader` emits the single `h1` (`PageHeader.tsx:13`, `text-2xl`), `CardTitle`/dialog/sheet
  emit `h2`/`h3` (`text-lg`). No skipped levels, no rogue heading sizes. `--text-3xl` is defined
  but unused (acceptable scale headroom, not slop). Spacing follows a consistent rhythm
  (page `gap-6` sections, `gap-4` card grids, `gap-1.5`/`gap-3` intra-component) with no
  off-scale magic px.
- **I4 — Color & status semantics are exemplary.** Status is a dedicated semantic palette
  (`--color-status-*`) always rendered as **icon + text + color** (`badge.tsx:30-37`,
  `pills.tsx`, `DataFreshness.tsx`), never color alone (WCAG 1.4.1). Teal reserved for
  primary/active/focus per spec §4. Full `.dark` token overrides exist for every semantic
  alias (`tailwind.css:132-154`); components consume semantic utilities, so dark mode is
  systematic rather than per-component. Badge `success`/`warning` correctly reference the
  status vars via arbitrary-property syntax (`bg-[var(--color-status-fresh)]/15`) — token-backed,
  not raw hex.
- **I5 — Interactive-state coverage is otherwise strong.** Global `:focus-visible` ring
  (`tailwind.css:170-173`) plus per-component `focus-visible:ring-2` on button/input/select/
  combobox/switch/checkbox. Disabled = `opacity-50` + `cursor-not-allowed`
  (`input.tsx:14`, `select.tsx:16`, `misc.tsx`). Loading (Button spinner + `aria-busy`),
  skeletons (`misc.tsx`, `DataTable.tsx:67-75`), empty (`EmptyState`, always an action per
  NFR-US-03), and error (`ErrorState` with retry) states all present. Only the **pressed**
  state (M1) is missing.

---

## AI Slop Assessment: **CLEAN**

3-step methodology (SKILL.md Phase 9):
- **Pattern scan:** No Lorem ipsum / "placeholder"/"example.com" in views; no unsplash stock
  images; no gratuitous gradients (zero `linear-gradient`); no `!important`; no arbitrary hex.
  Only 2 low-grade signals: the orphaned `animate-in` (m3) and the vestigial `space-y-0` (m4).
- **Semantic coherence:** Clear primary/secondary/accent hierarchy; type scale serves
  readability (12–24 px, mono for numerics via `tabular-nums`); all buttons look like buttons
  via shared CVA; whitespace rhythm is intentional and consistent.
- **Confidence:** 0–1 meaningful signals → **Clean.** This reads as hand-authored,
  spec-driven work, not generated boilerplate.

---

## Recommendations Summary (for code-chief — NOT applied in this read-only review)

| # | Type | File:line | Change |
|---|------|-----------|--------|
| M1 | Mechanical | `button.tsx:10-16` (+ interactive primitives) | Add `active:` color step per variant (spec §7.2 state 4) |
| m1 | Mechanical | 8 files w/ `z-[…]` | Replace raw z-index with `--z-*`-backed utilities; fix `z-[10]`→sticky, `z-[290]`→overlay |
| m2 | Mechanical | interactive primitives | Add `duration-*`/`ease-standard` to transitions |
| m3 | Mechanical | `dialog.tsx:52` | Remove/replace orphaned `animate-in`; align dialog+sheet backdrops |
| m4 | Mechanical | `PrinterCard.tsx:39` | Drop inert `space-y-0` override |
| I1 | Subjective | `button.tsx:19` | Consider raising `sm` height toward 44 px for touch (spec §11) |

No structural (architecture) changes required. All items above are CSS-value / utility-class
changes within design-qa's mechanical remit — safe to apply in a follow-up write pass.

---

## Pipeline Summary (Machine-Readable)

phase_id: 7
skill: design-qa
status: COMPLETE
risk_assessment: Low
review_basis: source-only (no rendered surface available)
domain_scores:
  visual_hierarchy: Pass
  typography: Pass
  spacing: Pass
  color: Pass
  interactive_states: Warn
  responsive: Pass
  ai_slop: Clean
finding_count:
  critical: 0
  major: 1
  minor: 4
fixes_applied: 0
verdict: Conditional
verdict_rationale: >
  High token adherence, clean hierarchy/color/typography, systematic dark mode, and
  strong empty/error/loading/focus coverage. Conditional (not Pass) on the one MAJOR:
  the spec-required pressed/active state (§7.2 state 4) is unimplemented across the
  entire interactive surface. Minors are token-drift/orphan polish. All remediation is
  mechanical CSS; none blocks build. Source-only basis — timing feel, tap sizes, and
  contrast ratios flagged for rendered verification.
---
