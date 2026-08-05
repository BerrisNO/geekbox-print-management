---
type: review-package
pipeline: review
run_id: run-001_2026-08-04_3d-print-erp
owner: code-chief
status: DELIVERED
gatekeeper_verdict: Ready-with-Disputes
context_tier: 3
artifact_mode: reference
created: 2026-08-05T00:00:00Z
---

# CODE REVIEW PACKAGE: GeekBOX Print Management (3D-Print Filament ERP)

## Executive Summary
The built application is a well-engineered, security-conscious, self-hosted 3D-print filament ERP (Fastify 5 + better-sqlite3/Drizzle + React 19 SPA). All three packages typecheck clean, the Bambu anti-corruption layer and deny-by-default auth gate are correctly isolated, the data-freshness "m5" gate is the strongest part of the codebase, and the bundle budget is met (139 KB gz < 200 KB, measured). The review surfaced **one CRITICAL correctness defect** in the load-bearing spool-weight ledger — reversing a floored over-consumption inflates the book-of-record balance with phantom filament (BUG-001, weaponized as MR-004, both Proven) — which must be fixed before merge. Beyond that, findings are Major/Minor hardening and traceability items: a currently-RED lint CI gate, two undocumented stack-lock deviations (Vite 6 vs 8, React Compiler disabled), a cluster of frontend WCAG 2.2 keyboard/focus gaps, auth self-DoS + username enumeration, and CSRF/SSRF hardening for the single-user model. gatekeeper-code returned **Ready-with-Disputes** (1 disputed item: Vite deviation severity; zero Critical findings disputed). Overall merge-readiness: **CONDITIONAL PASS** — fix the one Critical + the RED lint gate, then merge; address the remaining Majors on a fast follow.

## Package Contents (all validated by gatekeeper-code, attempt 1)
1. Bug Review Report (Phase 1) — 1 Critical, 5 Major, 6 Minor — `phase-1_bug-review/deliverable_defect-report.md`
2. Code Review Assessment (Phase 2) — **Approve with Nits** — `phase-2_code-review/deliverable_code-review.md`
3. Quality Review Report (Phase 3) — **Conditional**; 6 Major — `phase-3_quality-review/deliverable_quality-review.md`
4. Security Review Report (Phase 4) — Medium risk; 2 Med, 3 Low, 2 Info — `phase-4_security-review/deliverable_security-review.md`
5. Adversarial Analysis (Phase 5, mr-robot) — 5 exploit chains; 4 Med, 3 Low, 2 Info — `phase-5_mr-robot/deliverable_adversarial-analysis.md`
6. Frontend Audit (Phase 6, frontier) — 6 Major, 13 Minor — `phase-6_frontier/deliverable_frontend-audit.md`
7. Visual QA (Phase 7, design-qa) — 1 Major, 4 Minor — `phase-7_design-qa/deliverable_design-qa.md`
8. Developer Experience Audit (Phase 8, devex-review) — 1 Major, 4 Minor — `phase-8_devex-review/deliverable_devex-review.md`
9. Review Execution Manifest — `code-chief/execution-manifest.md`
10. Gatekeeper-Code Verdict — `gatekeeper-code_verdict.md` (Ready-with-Disputes)

No phases skipped. Full canonical pipeline (Phases 1-5) + all optional phases (6-8) executed; all in scope.

## Cross-Skill Risk Summary (post gatekeeper severity reconciliation)

| Risk Dimension | Status | Critical | Major/High | Medium | Minor/Low |
|----------------|--------|----------|-----------|--------|-----------|
| Correctness (bug-review) | Medium | 1 | 5 | — | 6 |
| Merge-Ready (code-review) | Approve w/ Nits | 0 | 0 | — | 7 nits |
| Sustainability (quality-review) | Conditional | 0 | 6 | — | 0 |
| Security (security-review) | Medium | 0 | 0 | 2→ (SSRF/CSRF up to 2 Med after reconciliation) | 3 |
| Adversarial (mr-robot) | Medium | 0 | 0 | 4 | 3 + 2 Info |
| Frontend (frontier) | Conditional | 0 | 6 | — | 13 |
| Visual (design-qa) | Conditional | 0 | 1 | — | 4 |
| DevEx (devex-review) | Conditional Pass | 0 | 1 | — | 4 |

Aggregate (deduplicated, post-reconciliation): **1 Critical, ~18 Major/High, ~4 Medium, ~30 Minor/Low.**

## Top Findings (prioritized; blocking first)

### BLOCKING
1. **[CRITICAL] BUG-001 / MR-004 — Ledger balance inflation via reverse-after-floor.**
   `apps/backend/src/inventory/ledger/ledger-write.ts:71-107` (applyEntry stores un-floored `deltaG` at line 82 while flooring `balanceAfterG` at 73-74) + `:214-222` (correctConsumption reverses `-live.deltaG`, the nominal not the applied/floored delta). `invariants.ts` has NO conservation invariant — `balancesFloorAtZero` only asserts `>=0`, so the property test cannot catch it.
   Impact: over-consume a spool to floored-zero, then correct the job → reversal adds back grams never physically present → book-of-record reports phantom filament (data corruption in the load-bearing subsystem). Cross-corroborated by bug-review, mr-robot (Proven, deterministic arithmetic), and quality-review. gatekeeper-code independently confirmed the arithmetic and the Critical severity.
   **Fix:** reverse the *effective* (post-floor) applied delta — store `appliedDeltaG`/`overConsumedG` on the entry and clamp the reversal so balance cannot exceed the pre-consumption balance. Add a conservation invariant to invariants.ts and a property-test case that reverses a floored entry.

2. **[MAJOR/TOOLING — pre-merge] QR-001 — CI lint gate is RED.**
   `biome check .` reports 11 errors + 6 warnings (all FIXABLE: formatting, unused imports in `tests/integration/*.test.ts`, `useConst` in `throttle.test.ts:6,16,41`, `useBiomeIgnoreFolder` at `biome.json:5`). CI runs non-fixing `biome ci .` (`ci.yml`), so the next push fails `lint-typecheck` and blocks the whole pipeline. `biome.json` was edited after the build (build claimed 0 errors).
   **Fix:** `biome check --write .` and correct the `!**/dist/**` ignore syntax.

### HIGH PRIORITY (fast-follow; strongly recommended before production)
3. **[MAJOR] Frontend WCAG 2.2 keyboard/focus cluster (frontier A-1/A-2/A-3).** `forms/FormField.tsx:19,34-38` (error text never wired via `aria-describedby`); `components/ui/dialog.tsx:16-38` + `sheet.tsx:26-36` ("focus-trap-lite" with no actual focus containment/restore); `components/ui/tabs.tsx:44-64` (tablist without roving tabindex/arrow-key nav). Impact: screen-reader + keyboard users blocked from AA. **Fix:** wire aria-describedby in FormField (cascades to all forms), add real focus trap+restore, add roving tabindex. Note: color contrast NOT measured — run axe before any AA claim.
4. **[MAJOR] No React error boundary (frontier C-1).** `router.tsx`/`main.tsx:33-40` — any render exception blanks the whole SPA. **Fix:** add root + per-route error components.
5. **[MEDIUM, reconciled up] MR-003 — Login self-DoS + username enumeration.** `identity/throttle.ts:8-9` is a single GLOBAL bucket (not keyed by IP/user), so 10 bad logins lock out the sole operator; `identity/service.ts:55` skips argon2 verify for unknown users (timing oracle, CWE-208/307). **Fix:** dummy-hash verify on no-user branch + per-IP `@fastify/rate-limit` config on login/setup routes (`app.ts:38` currently global:false with no opt-in).
6. **[MEDIUM, reconciled up] MR-001 — Authenticated SSRF → Bambu token exfil.** `integration/bambu/mqtt-adapter.ts:13` builds `mqtts://{mqttRegion}` from a bare `z.string().min(1)`; decrypted access token is sent as MQTT password to an attacker-controlled host (CWE-918). **Fix:** allow-list region to `{us,eu,cn}`.
7. **[MEDIUM] MR-002 — CSRF on state-changing `GET /api/backup`.** SameSite=Lax + CSP disabled (`app.ts:34`) + a GET that writes+streams the whole DB (CWE-352). **Fix:** make it POST, Origin-check mutating routes, SameSite=Strict, enable a CSP.
8. **[MAJOR] QR-002 — Single-ledger-write-path enforced only by convention.** `inventory/ledger/repository.ts` (`LedgerRepository`) has ZERO importers; `ledger-write.ts` writes `spool_ledger_entry` directly via drizzle, so the dependency-cruiser rule `only-ledger-uses-ledger-repository` guards a dead class and ADR-009's mechanical guarantee is vacuous. **Fix:** re-point the rule at the `spool_ledger_entry` schema import (or route writes through the repository).
9. **[MAJOR] QR-005 — Synchronous N+1 alert re-evaluation on every stock-change.** `inventory/alerts/service.ts:69-104` + `container.ts:84-104` run nested products×spools×vendors then POs×lines×receipts synchronously (better-sqlite3 blocks the event loop). **Fix:** bulk-load + scope re-eval to the affected productId.
10. **[MAJOR x2] Undocumented stack-lock deviations.** (a) Vite **6.4.3** vs locked **8.x** (`apps/frontend/package.json`) — *see Disputed Items; gatekeeper reconciled to Minor/traceability*. (b) **React Compiler NOT enabled** despite FSL lock "React Compiler enabled" — no `babel-plugin-react-compiler` present; makes ~18 manual useMemo/useCallback load-bearing. Both undocumented in build artifacts.
11. **[MAJOR] devex — README understates local-dev prerequisites.** `README.md:28-30` — needs Node **22 specifically** (not 24) + C/C++ toolchain for `better-sqlite3`/`argon2` (proven by `Dockerfile:17`); on Node 24 native builds + `dependency-cruiser@16.10` fail with no doc pointer. **Fix:** explicit Node-22-only + toolchain note, or direct devs to Docker.

### LOWER PRIORITY (representative)
- design-qa M1 — no `active:`/pressed state on any interactive primitive (`button.tsx:6-27`) — violates frontend-spec §7.2. Plus unused `--z-*`/`--duration-*` token scales (drift).
- frontier — clickable table rows keyboard-inoperable (`DataTable.tsx:137-143`); combobox `aria-activedescendant` gap; no CSP/security headers (`index.html:8-16`).
- bug-review Major — `LowStockCleared` never published (`container.ts:84-104`); one throwing SSE client write aborts broadcast for all clients (`http/sse.ts:92-95`); mapped-spool-to-zero leaves stale `ams_slot_mapping` on depleted spool.
- devex — `pnpm-workspace.yaml:5-9` ships a literal "set this to true or false" placeholder block; `DB_PATH` .env.example vs README mismatch.
- security — SameSite=Lax w/o CSRF token + CSP disabled (SEC-003); sliding-only 7-day session, no absolute cap (SEC-005).
- mr-robot supply chain — CI actions pinned to mutable tags not SHAs (T1195.002); `packages: write` over-scoped in CI.

## Disputed Items (user/Admiral judgment required)
- **Vite 6.4.3 vs 8.x deviation severity.** quality-review rated Major (QR-004a); code-review/frontier/devex noted it as traceability. gatekeeper-code assessed the correct severity as **Minor/traceability** (zero functional impact; Vite 8 = Rolldown, not stably installable; disclosed in `vite.config.ts:8-9` code comment). Left **Disputed** because 4 skills rated it three ways and it crosses the Major/Minor line. This is the SAME item Admiral is already tracking for Handoff 3 — recommend ratifying as a documented, accepted substitution (Minor) rather than a blocking Major, but the *undocumented in build artifacts* aspect is legitimate and should be recorded.

## Recommended Actions (prioritized)
1. **BLOCKING:** Fix BUG-001/MR-004 ledger reverse-after-floor + add conservation invariant + property test. Re-run `pnpm -r test` on Node 22/Docker to prove it.
2. **BLOCKING (CI):** `biome check --write .` to clear the RED lint gate.
3. **Run the environment-gated tests on Node 22 / Docker** (`docker compose up --build`, `pnpm -r test`, `pnpm --filter @geekbox/backend depcruise`, `pnpm audit`) — this is the single biggest evidence gap; the ledger property + reception crash-injection tests have never executed. Do this FIRST at the start of remediation.
4. Fix the WCAG cluster (FormField aria-describedby, dialog/sheet focus trap+restore, tabs roving tabindex) + add React error boundary before production.
5. Harden auth (per-IP rate limit + dummy-hash verify), SSRF allow-list, CSRF (POST backup + Origin check + CSP).
6. Document both stack-lock deviations (Vite, React Compiler) in delivery artifacts.
7. Fix N+1 alert re-eval; re-point the ledger dependency-cruiser rule; SHA-pin CI actions.
8. Correct README Node-22/toolchain prerequisites; remove the pnpm-workspace placeholder block.

## Consistency Check (delivery-protocol Step 2)
- Bug and security findings do not contradict on shared paths — the ledger path (BUG-001) and auth/SSRF/CSRF paths (SEC/MR) are distinct and consistent.
- Quality architecture concerns (single-write-path enforcement QR-002) align with code-review's design assessment (both note ADR-009 holds by convention, not mechanically).
- Security and mr-robot agree on the reconciled severities (SSRF Medium, CSRF Medium) after gatekeeper reconciliation; token vault verified correct by both (no contradiction — the earlier "crypto bug" was a rejected false positive).
- Frontier frontend-security findings (no CSP) align with security-review SEC-003 (CSP disabled) — consistent.
