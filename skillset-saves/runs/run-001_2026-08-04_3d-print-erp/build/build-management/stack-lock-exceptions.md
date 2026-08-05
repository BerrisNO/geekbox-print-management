---
type: stack-lock-exceptions
pipeline: build
owner: build-management
run_id: run-001_2026-08-04_3d-print-erp
version: 1
status: approved
created: 2026-08-05T00:00:00Z
supersedes_gap: Handoff-3 carried "undocumented stack-lock deviation" blocker
---

# Frontend Stack-Lock Exceptions (SLE Register) — GeekBOX Print Management

This document formally records the two frontend stack-lock deviations that the
review pipeline (quality-review QR-004a/QR-004b, code-review, frontier, devex) and
gatekeeper-code flagged as **undocumented in build artifacts**, clearing admiral's
carried Handoff-3 traceability blocker. It mirrors the backend Deviation Register
(Dev-1/Dev-2/Dev-3) pattern in `design/phase-3_architect/deliverable_backend-stack-lock.md` §5.

Both exceptions are also disclosed as in-code comments at the point of relevance
(`apps/frontend/vite.config.ts`, top-of-file `STACK-LOCK EXCEPTION SLE-1/SLE-2`).

## Exception Register

| ID | Deviation from frontend stack-lock | Justification | Impact | Status |
|----|-----------------------------------|---------------|--------|--------|
| **SLE-1** | **Vite 6.4.3** instead of the locked **Vite 8.x (Rolldown)** (`deliverable_frontend-stack-lock.md` §1 / ADR-014) | Vite 8 / Rolldown is pre-GA and **not stably installable**; Vite 6 is the current stable release fully compatible with React 19. | **None (functional/runtime).** Build output is an equivalent static `dist/`; proxy semantics unchanged; bundle budget measured PASS (≈139 KB gz < 200 KB). Severity assessed **Minor/traceability** by gatekeeper-code (QR-004a Major reduced; disputed item resolved). | Approved / documented |
| **SLE-2** | **React Compiler NOT enabled** despite the lock's "React Compiler enabled" (no `babel-plugin-react-compiler` present) | The React Compiler is still experimental for React 19 production builds; enabling it on a solo-maintained app introduces avoidable build-tool risk. | **Load-bearing consequence:** the ~18 manual `useMemo`/`useCallback` memoizations in the codebase are now the runtime memoization mechanism and **must be preserved** — they are not redundant. Assessed **Major (quality)** by gatekeeper-code and correctly non-disputed. | Approved / documented |

## Decision rationale

- **SLE-1 (Vite):** A build-tool substitution forced by an upstream un-installable
  dependency has zero downstream quality impact; recording it as an accepted
  documented substitution (not a blocking deviation) is the coherent resolution
  that gatekeeper-code and code-chief recommended for Handoff-3 ratification.
- **SLE-2 (React Compiler):** Rather than enabling an experimental compiler late in
  the build (which would require re-verifying the whole render path), the manual
  memoizations are retained and this exception documents that they are intentional
  and load-bearing. A future re-enablement of the compiler is a bounded change
  (add the babel plugin, then the manual memoizations become redundant but harmless).

## Amendment path

Re-enabling React Compiler or upgrading to Vite 8 once Rolldown reaches GA are both
pre-authorized non-breaking amendments that do not reopen the lock; each must re-run
`pnpm -r build` + the bundle-budget check before merge.
