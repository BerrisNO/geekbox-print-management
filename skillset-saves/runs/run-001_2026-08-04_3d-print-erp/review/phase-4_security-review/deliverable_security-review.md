---
type: deliverable
pipeline: review
phase: 4
skill: security-review
name: Security Review Report
version: 1
status: draft
created: 2026-08-05T00:00:00Z
---

## Security Review Report

### Summary
- **Risk Tier:** High (authentication/session management, cryptographic token vault, CI/CD config, external MQTT/REST integration, first external dependencies — per SKILL.md Step 1 High-tier triggers)
- **Frameworks Applied:** NIST SSDF v1.1 (PW.7), OWASP ASVS 5.0 (V1–V7), OWASP Top 10:2025, OWASP API Security Top 10:2023, CWE Top 25:2025, STRIDE
- **Total Findings:** 7 (Critical: 0, High: 0, Medium: 2, Low: 3, Info: 2)
- **Supply Chain Status:** Clean (config/manifest review only — SCA scanner not executable in this environment; see Supply Chain Assessment)

The application demonstrates a security-conscious design: deny-by-default global session gate, argon2id password hashing, AES-256-GCM token vault, DB-backed opaque sessions with sliding expiry, HttpOnly cookies, parameterized ORM (Drizzle/better-sqlite3), tolerant Zod boundary for untrusted upstream payloads, non-root hardened Docker image, and a pinned lockfile with integrity hashes and constrained build scripts. No Critical or High findings were identified. The two Medium findings concern brute-force defense depth and a login timing oracle; both are attenuated by the single-user threat model but are real and cheap to fix.

Independent crypto verification of the token vault (called out in the delegation): the `iv(12) ‖ tag(16) ‖ ciphertext` layout is **CORRECT**. Encrypt writes `[iv, tag, ct]`; decrypt reads `subarray(0,12)`, `subarray(12,28)`, `subarray(28)`; `setAuthTag` is called before `final()`, so the GCM authentication tag is verified on every decrypt. IV is a fresh 12-byte `randomBytes` per encryption (no reuse), and the key is length-checked to 32 bytes at construction. No cryptographic defect found — the prior sub-agent's bug claim is **not reproducible** and is rejected.

---

### Findings

#### [SEC-001] [CWE-307] — Login endpoint has no server/edge rate limiting; only a single global in-memory throttle
- **Severity:** Medium (CVSS v4.0 ~5.3, AV:N/AC:L/PR:N/UI:N)
- **Location:** `apps/backend/src/app.ts:36-40`; `apps/backend/src/identity/router.ts:22-27`; `apps/backend/src/identity/throttle.ts:1-47`
- **Description:** `@fastify/rate-limit` is registered with `global: false` (app.ts:38) and **no route opts back in** — a repo-wide grep for a per-route `config: { rateLimit }` returns zero matches. The `POST /api/auth/login` handler therefore has no framework-level rate limit. The sole brute-force control is `LoginThrottle`, a single process-wide bucket: after `MAX_FAILS = 10` failures in a 15-minute window it imposes only a `DELAY_MS = 30s` cooldown, then admits one attempt per 30s thereafter (each new failure only advances `lastFailAt`). The counter is a **single global bucket** with no per-IP/per-account keying.
- **Evidence:**
  - `app.ts:38` `global: false, // login route opts in; single user otherwise` — but nothing opts in.
  - `identity/router.ts:22` `app.post('/api/auth/login', async (req, reply) => {` — registered with no `{ config: { rateLimit: … } }`.
  - `throttle.ts:8-9` `const MAX_FAILS = 10; const DELAY_MS = 30 * 1000;` — 30s friction, not lockout.
  - `service.ts:16` `private readonly throttle = new LoginThrottle();` — one shared bucket for the whole process.
- **Impact:** Sustained online password guessing at ~1 attempt/30s indefinitely after the initial burst. Also a self-DoS vector: because the bucket is global and un-keyed, an unauthenticated attacker can keep the legitimate single user throttled by generating failures. Argon2id verification cost is the only remaining brake.
- **Remediation:** Opt the login and setup routes into `@fastify/rate-limit` explicitly (e.g. `app.post('/api/auth/login', { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } }, …)`), keyed by source IP. Keep `LoginThrottle` as a secondary layer but consider an escalating (not fixed-30s) backoff. Given the deliberate single-user model this is Medium, not High.
- **Framework Reference:** OWASP Top 10:2025 A07 (Identification & Authentication Failures), OWASP API Security A4 (Unrestricted Resource Consumption), CWE-307, OWASP ASVS 5.0 V6.2 (anti-automation / brute-force).

#### [SEC-002] [CWE-208] — Login timing side channel enables username enumeration
- **Severity:** Medium (CVSS v4.0 ~3.7, AV:N/AC:H/PR:N/UI:N)
- **Location:** `apps/backend/src/identity/service.ts:53-59`
- **Description:** The login path only invokes argon2 verification when a matching user row exists: `const ok = user ? await verifyPassword(user.passwordHash, password) : false;`. When the supplied username does not exist, the expensive argon2id verification is **skipped entirely**, so the response returns in near-constant sub-millisecond time, whereas an existing username incurs tens of milliseconds of hashing. The inline comment claims timing is kept "uniform-ish," but the code does the opposite — there is no dummy-hash path.
- **Evidence:** `service.ts:54` comment `// Always run verify to keep timing uniform-ish; use a dummy hash when no user.` contradicted by `service.ts:55` `const ok = user ? await verifyPassword(user.passwordHash, password) : false;` — no dummy hash is ever computed.
- **Impact:** An attacker can distinguish a valid username from an invalid one by measuring response latency, defeating the generic "Invalid credentials" message (AC-001.2). Impact is limited because this is a single-user app with one account, so the enumeration space is trivial and the disclosure is low-value — hence Medium/low-Medium rather than High.
- **Remediation:** Compute a verification against a pre-generated dummy argon2id hash when no user is found so both branches perform equivalent work (constant-time-ish), e.g. `await verifyPassword(user?.passwordHash ?? DUMMY_HASH, password)` and only grant on a real match. This matches the code's own stated intent.
- **Framework Reference:** OWASP Top 10:2025 A07, CWE-208 (Observable Timing Discrepancy), CWE-203 (Observable Discrepancy), OWASP ASVS 5.0 V6.2.

#### [SEC-003] [CWE-1275] — SameSite=Lax cookie auth with no CSRF token and CSP disabled
- **Severity:** Low (CVSS v4.0 ~3.1)
- **Location:** `apps/backend/src/identity/router.ts:7-13`; `apps/backend/src/app.ts:33-35`
- **Description:** Session auth relies on the `gbx_session` cookie with `sameSite: 'lax'`, `httpOnly: true`, and `secure` only in production. There is no anti-CSRF token. State-changing endpoints (POST/PUT/PATCH/DELETE) are protected against classic CSRF primarily by (a) SameSite=Lax (cross-site non-GET requests do not carry the cookie) and (b) the JSON `Content-Type` the SPA sends. Separately, `@fastify/helmet` is registered with `contentSecurityPolicy: false` (app.ts:34), so there is no CSP defense-in-depth.
- **Evidence:**
  - `router.ts:9` `sameSite: 'lax' as const,`
  - `app.ts:34` `contentSecurityPolicy: false, // SPA served from same origin; CSP tuned separately if needed`
- **Impact:** SameSite=Lax leaves a narrow residual CSRF surface for top-level GET navigations, but no state-changing route in this app is a GET that mutates data (backup GET is read-only; SSE GET is read-only). Disabled CSP removes a mitigating layer if an XSS sink were ever introduced. No exploitable path exists today (frontend has no `innerHTML`/`dangerouslySetInnerHTML` sinks — verified). This is defense-in-depth, hence Low.
- **Remediation:** Enable a baseline CSP (`default-src 'self'`; script/style sources scoped to the bundle) now that the SPA is same-origin. Consider `SameSite=Strict` for the session cookie since the app is a same-origin SPA with no cross-site flows, and/or add an origin/referer check on state-changing routes.
- **Framework Reference:** OWASP Top 10:2025 A05 (Security Misconfiguration), A01 (via CSRF), CWE-352 (CSRF), CWE-1275 (Sensitive Cookie with Improper SameSite), OWASP ASVS 5.0 V3.4 / V13.

#### [SEC-004] [CWE-918] — Authenticated SSRF surface via user-controlled MQTT region/hostname
- **Severity:** Low (CVSS v4.0 ~2.7)
- **Location:** `apps/backend/src/integration/bambu/mqtt-adapter.ts:12-15`; `packages/shared/src/schemas/index.ts:164-168`
- **Description:** The `mqttRegion` integration setting is user-supplied and validated only as `z.string().min(1)` (schemas/index.ts:166). `brokerUrl` (mqtt-adapter.ts:12) treats any value containing a `.` as a full custom hostname and connects to `mqtts://<value>:8883`. An authenticated user can therefore steer the MQTT client to an arbitrary host, and the Bambu access token (used as the MQTT password) would be presented to that host.
- **Evidence:**
  - `mqtt-adapter.ts:13-14` `if (region.includes('.')) return \`mqtts://${region}:8883\`;`
  - `schemas/index.ts:166` `mqttRegion: z.string().min(1).optional(),`
  - `mqtt-adapter.ts:52-54` uses `password: this.config.accessToken` and `rejectUnauthorized: true` (TLS verification is ON — limits which hosts can complete a handshake).
- **Impact:** Limited. Requires an authenticated session (deny-by-default gate enforces this), targets only port 8883 over TLS with `rejectUnauthorized: true` (so the destination must present a valid cert), and the leaked secret is the third-party Bambu token, not an internal credential. It is a self-inflicted risk in a single-user, self-hosted deployment rather than a multi-tenant SSRF pivot. Still worth constraining.
- **Remediation:** Constrain `mqttRegion` to an allow-list (`us|eu|cn`) or, if custom hostnames must be supported, validate against an allow-list of Bambu domains (e.g. `*.mqtt.bambulab.com`) and reject private/loopback/link-local targets.
- **Framework Reference:** OWASP API Security A7 (SSRF), OWASP Top 10:2025 A10 (SSRF), CWE-918, OWASP ASVS 5.0 V12 (SSRF protection).

#### [SEC-005] [CWE-613] — Session TTL is sliding-only; no absolute lifetime cap
- **Severity:** Low (CVSS v4.0 ~2.3)
- **Location:** `apps/backend/src/identity/session.ts:8, 35-61`
- **Description:** Sessions use a sliding 7-day inactivity window (`SESSION_TTL_MS`) that is refreshed on every `validate()` call. There is no absolute maximum session lifetime, so an active session token can be kept alive indefinitely by continued use. Session token generation (32 random bytes, hashed with SHA-256 at rest) and fixation handling (a fresh token is issued at login/setup, and `revokeAllExcept` invalidates other sessions on password change) are otherwise sound.
- **Evidence:** `session.ts:8` `const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // sliding 7-day inactivity`; `session.ts:54-59` slides `expiresAt = now + SESSION_TTL_MS` on each validate with no absolute-cap check against `createdAt`.
- **Impact:** A stolen-but-actively-used token never expires on its own. Low impact given HttpOnly/Secure cookies and password-change revocation, but ASVS L2 expects an absolute timeout in addition to idle timeout.
- **Remediation:** Add an absolute cap by comparing `now - session.createdAt` against a maximum (e.g. 30 days) in `validate()` and forcing re-authentication past it.
- **Framework Reference:** CWE-613 (Insufficient Session Expiration), OWASP ASVS 5.0 V7.3 (session timeout), OWASP Top 10:2025 A07.

#### [SEC-006] [CWE-311] — INFO: Bambu account password forwarded to unverified upstream over TLS; no local persistence (as designed)
- **Severity:** Info
- **Location:** `apps/backend/src/integration/bambu/rest-adapter.ts:20-28`; `apps/backend/src/integration/linking/service.ts:127-142`
- **Description:** During account linking, the user's Bambu email/password are POSTed to `https://api.bambulab.com` (rest-adapter.ts:21). The credentials are not persisted locally — only the returned access/refresh tokens are stored, encrypted via the AES-256-GCM vault (service.ts:200-201). This is inherent to the integration and is the correct handling (transient use, TLS in transit, tokens-at-rest encrypted). The upstream endpoints are community-documented and unverified (noted as inherent risk in the delegation). Recorded as INFO for completeness; the tolerant normalizer (`normalizer.ts`) correctly treats all upstream responses as untrusted and never throws past the ACL (OWASP API A10 — Unsafe Consumption of APIs is handled).
- **Evidence:** `rest-adapter.ts:24` `body: JSON.stringify({ account: email, password }),`; `linking/service.ts:200` `accessTokenEnc: this.deps.vault.encrypt(accessToken),`.
- **Impact:** None beyond the inherent trust placed in the Bambu cloud API. No remediation required.
- **Framework Reference:** OWASP API Security A10, CWE-311 (informational), NIST SSDF PW.4.

#### [SEC-007] [CWE-522] — INFO: `.env.example` ships placeholder secrets; ensure operational key generation
- **Severity:** Info
- **Location:** `.env.example` (SESSION_SECRET / TOKEN_ENCRYPTION_KEY lines)
- **Description:** `.env.example` contains obvious placeholder values (`change-me-…`) with correct generation guidance (`openssl rand -base64 32`). `config.ts` validates `SESSION_SECRET` (min 32 chars) and `TOKEN_ENCRYPTION_KEY` (must decode to exactly 32 bytes) via Zod and fails fast on invalid input. `.env` is gitignored (`.gitignore:7`) and not present in the repo — no committed secret detected. The residual risk is purely operational: an operator who ships the placeholder would be blocked by the 32-byte/32-char validators, but a low-entropy real value would pass length checks.
- **Evidence:** `config.ts:22` `SESSION_SECRET: z.string().min(32, …)`; `config.ts:6-19` 32-byte key validator; no `.env` in tree; `.gitignore:7 .env`.
- **Impact:** None in-repo. Operational recommendation only.
- **Remediation:** Document/automate key generation in deploy runbook; consider entropy checks beyond length for `SESSION_SECRET`.
- **Framework Reference:** CWE-522 (informational), CWE-798 (not triggered — no hardcoded creds), NIST SSDF PW.9, OWASP ASVS 5.0 V14.

---

### Threat Model Assessment (STRIDE — updated)
- **Spoofing:** Deny-by-default session gate (`http/session-gate.ts:23-50`) rejects every `/api/*` route not on a 3-entry allow-list unless a valid session cookie is present. Allow-list is exact method+path match (no prefix/wildcard bypass). SPA static assets are public by design. Setup route self-guards via `accountExists()`. Mitigation present; residual = SEC-001/SEC-002 (brute-force/enumeration).
- **Tampering:** Writes go through Drizzle parameterized queries; the only raw SQL is `SELECT 1`, a fixed `SELECT last_mqtt_message_at`, and `VACUUM INTO` with a server-generated timestamp path (quote-escaped). No user input reaches SQL string concatenation — SQL injection not reachable.
- **Repudiation:** Auth events flow through the throttle/service; structured pino logging present. Audit completeness not deeply assessed (out of High-risk scope focus).
- **Information Disclosure:** RFC 7807 error handler (`http/error-handler.ts`) returns sanitized problem+json, logs full detail server-side, never leaks stack traces (A05 handled). Tokens encrypted at rest (vault). Residual = SEC-002 timing oracle, SEC-006 upstream password transit (inherent).
- **Denial of Service:** MQTT supervisor implements total error containment, bounded exponential backoff with jitter (5s→×2→max 5min), and a kill switch (`supervisor.ts`). Global `@fastify/rate-limit` is `global:false` — see SEC-001 (login self-DoS). `mem_limit: 768m` in compose. SSE has 25s keep-alive and cleans up on close.
- **Elevation of Privilege:** No RBAC by design (single-user, documented C-03). The single trust boundary is authenticated vs unauthenticated, enforced centrally by the gate. No horizontal/vertical escalation surface (one account, no object-level multi-tenancy). API BOLA (API1) not applicable — single owner of all objects.

Threat model delta: **Updated** — new auth, crypto, and external-integration data flows reviewed; mitigations traced to code.

### Supply Chain Assessment
- **SCA execution:** NOT executed. `pnpm` is not installed as a standalone binary in this environment and no offline lockfile audit could be run. Per SKILL.md Edge Cases, this is recorded as a **tooling gap**; findings below are from config/manifest inspection, not a scan. No scan results are fabricated (Iron-Law honored).
- **Lockfile integrity:** `pnpm-lock.yaml` is `lockfileVersion: '9.0'`; all **559** package resolutions carry `integrity: sha512-…` hashes (559 resolutions / 559 integrity entries — 1:1). Strong tamper-evidence.
- **Build-script containment:** `pnpm-workspace.yaml` sets `onlyBuiltDependencies: [argon2, better-sqlite3, esbuild, @tailwindcss/oxide]` — only these four vetted native packages may run install scripts; all other postinstall/preinstall scripts are blocked by default (mitigates malicious-install-script supply-chain attacks). No app/package `package.json` defines pre/postinstall hooks (grep clean).
- **Dependency currency (spot-check, plausibility of the "16 advisories → 0 high/critical" claim):** Versions are current and non-obviously-vulnerable: `fastify@5.8.5`, `@fastify/helmet@13.0.1`, `@fastify/rate-limit@10.2.2`, `@fastify/cookie@11.0.2`, `@fastify/static@10.1.2`, `argon2@0.44.0`, `better-sqlite3@11.10.0`, `drizzle-orm@0.45.2`, `mqtt@5.13.1`, `zod@4.0.5`, `pino@10.3.1`, `uuid@11.1.1`. These are recent releases consistent with a remediation pass; the builder's "0 high/critical, 1 dev-only moderate waived" claim is **plausible** on this evidence but **not independently verified by a scan**. Treat as Tool Output pending a real `pnpm audit` in CI.
- **CI SCA gate:** `.github/workflows/ci.yml` includes a `security-audit` job running `pnpm audit --audit-level=high`, advisory on PRs and **blocking on `main`**. Good. Recommend also pinning that behavior and adding SBOM generation.
- **Provenance / pinning:** CI uses tag-pinned actions (`actions/checkout@v4`, `pnpm/action-setup@v4`, `actions/setup-node@v4`, `docker/build-push-action@v6`). Tag pins (not SHA pins) are acceptable but SHA-pinning is the stronger control (INFO). `permissions:` is scoped (`contents: read`, `packages: write`).
- **Verdict:** Clean on manifest/config review; residual = the un-run SCA scan (tooling gap) and tag- vs SHA-pinned actions (INFO).

### Docker Hardening
- Multi-stage build; runtime stage runs as non-root (`adduser -S app`, `USER app`), `NODE_ENV=production`, prod-only pruned `node_modules`, native binding rebuilt on the matching musl base, and a `HEALTHCHECK`. `docker-compose.yml` sets `restart: unless-stopped`, `mem_limit: 768m`, and a named data volume. Solid hardening. INFO: consider `read_only: true` root FS with tmpfs, `cap_drop: [ALL]`, and `no-new-privileges` in compose for defense-in-depth.

### Tooling Gaps
1. **SCA not executed** — no `pnpm audit` / lockfile scan could be run in this review environment. CI does run it; recommend surfacing the audit artifact into the review package so it is not re-derived.
2. **No SAST/CodeQL/Semgrep gate** in `ci.yml` — only Biome lint, typecheck, tests, dep-cruiser, and `pnpm audit`. Add a SAST job for JS/TS.
3. **No SBOM generation** (CycloneDX/SPDX) in CI — recommended for supply-chain provenance.
4. **GitHub Actions are tag-pinned, not SHA-pinned** — hardening opportunity.

### Checklist Coverage
Applied (High-tier full checklist): Input Validation (Zod at every boundary + tolerant ACL) — covered; Output Encoding / XSS (no `innerHTML`/`dangerouslySetInnerHTML` sinks; JSON responses; problem+json errors) — covered; Authentication (argon2id, generic errors, throttle) — covered, findings SEC-001/002; Session Management (opaque 32-byte tokens, SHA-256 at rest, fixation handling, revocation) — covered, finding SEC-005; Access Control (deny-by-default gate, no RBAC by design) — covered; Error Handling (RFC 7807, no leakage) — covered; Cryptography (AES-256-GCM vault independently verified correct; key handling) — covered; Logging (pino, no token logging observed) — covered; Supply Chain — covered (config-level, scan gap noted); SSRF — covered, finding SEC-004; SQL Injection (parameterized) — covered.
Not applicable: AI-Specific Threats (no AI/ML components in the codebase).
Estimated coverage: ~95% (excludes AI section as N/A and the un-runnable SCA scan).

---
## Pipeline Summary (Machine-Readable)

phase_id: 4
skill: security-review
status: COMPLETE
risk_assessment: High
finding_count:
  critical: 0
  high: 0
  medium: 2
  low: 3
checklist_coverage: 95%
verdict: Medium Risk
supply_chain_status: Clean
threat_model_delta: Updated
key_concerns:
  - "SEC-001 (Medium, CWE-307): login route has no rate limit; only a single global 30s in-memory throttle — brute-force + self-DoS (app.ts:38, identity/router.ts:22, throttle.ts)."
  - "SEC-002 (Medium, CWE-208): login skips argon2 verify when user absent → timing oracle for username enumeration (identity/service.ts:55)."
  - "SEC-003/004/005 (Low): CSP disabled + no CSRF token with SameSite=Lax (app.ts:34); authenticated MQTT-hostname SSRF (mqtt-adapter.ts:13); sliding-only session TTL with no absolute cap (session.ts:8)."
cross_references:
  - "apps/backend/src/app.ts:36-40"
  - "apps/backend/src/identity/router.ts:22"
  - "apps/backend/src/identity/service.ts:53-59"
  - "apps/backend/src/identity/throttle.ts:8-9"
  - "apps/backend/src/integration/token-vault.ts:13-28"
  - "apps/backend/src/integration/bambu/mqtt-adapter.ts:12-15"
  - "apps/backend/src/identity/session.ts:8"
  - ".github/workflows/ci.yml (security-audit job)"
---
