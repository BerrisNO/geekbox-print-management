---
type: deliverable
pipeline: build
phase: 3
skill: security-builder
name: Security Audit — GeekBOX Print Management
version: 2
status: revised
created: 2026-08-05T03:40:00Z
---

# Phase 3 Security Audit — GeekBOX Print Management

Audited against the impl-spec §7 OWASP Top 10:2025 mapping + a dependency scan.

## OWASP control review (code-level) — all PASS
- **A01 Broken Access Control**: deny-by-default `onRequest` session gate; explicit
  allow-list {auth/setup, auth/login, health}; everything else 401. Backup route is
  session-gated (not allow-listed) per RISK-009. SSE `/api/events` under `/api/` → gated. No RBAC (C-03). PASS.
- **A02 Cryptographic Failures**: argon2id password hashing; AES-256-GCM token vault
  (iv‖tag‖ct, random 96-bit IV/write); account password never persisted; MQTTS
  `rejectUnauthorized:true`; cookie HttpOnly + SameSite=Lax + Secure-in-prod. PASS.
- **A03 Injection**: Zod at both HTTP and ACL boundaries; Drizzle parameterized queries
  only; the one raw SQL (`VACUUM INTO`) uses a server-config path (not user input) with
  quote-escaping. PASS.
- **A04 Insecure Design**: login throttle 10/15min→30s; append-only ledger; kill switch;
  ACL blast-radius containment. PASS.
- **A05 Security Misconfiguration**: single RFC7807 formatter never leaks stack traces;
  500s sanitized; helmet headers. PASS.
- **A06 Vulnerable Components**: see dependency remediation below.
- **A07 Auth Failures**: generic invalid-credentials error (no user enumeration);
  DB-backed sliding session; logout + password-change revoke server-side. PASS.
- **A08 Data Integrity**: append-only ledger; idempotency constraints; migrations at
  startup only. PASS.
- **A09 Logging Failures**: Pino redaction of password/token/cookie/authorization. PASS.
- **A10 SSRF**: only fixed Bambu hosts contacted; region is an allow-listed value, not a
  free URL; no user-supplied fetch. PASS.

## Dependency remediation (Phase 3 → Phase 1 loop) — 16 advisories fixed
Initial `pnpm audit`: 17 findings (1 critical, 6 high, 9 moderate, 1 low). Remediated by
version bumps:
- `fastify` 5.4.0 → 5.8.5 (HIGH: body schema validation bypass; content-type tab)
- `@fastify/static` 8.1.1 → 10.1.2 (HIGH: route-guard bypass via path traversal)
- `drizzle-orm` 0.44.2 → 0.45.2 (HIGH: SQL injection via improper escaping)
- `vite` 6.3.6 → 6.4.3 (HIGH: arbitrary file read / fs.deny bypass — dev server)
- `vitest` 3.2.4 → 3.2.6 (CRITICAL: UI server arbitrary file — dev only)
- `pino` 9.7.0 → 10.3.1 (align with fastify 5.8.5; resolves type conflict)
- `uuid` 11.1.0 → 11.1.1 (MODERATE: buffer bounds)

Post-remediation `pnpm audit`: **0 critical, 0 high**. Re-verified: backend + frontend
typecheck clean; all 41 runnable tests still green; lint clean.

## Accepted residual (documented waiver)
- 1 MODERATE: `esbuild <=0.24.2` reachable only via `drizzle-kit > @esbuild-kit/esm-loader`
  (a deprecated, DEV-ONLY transitive). Not in the production image (Dockerfile prod-prunes
  dev deps). Exploit requires a running esbuild dev server receiving crafted browser
  requests — never true in prod. Waiver per impl-spec §5.2 (audit-ignore + advisory
  GHSA-67mh-4wv8-2f99). Clears when drizzle-kit updates its bundled loader.
