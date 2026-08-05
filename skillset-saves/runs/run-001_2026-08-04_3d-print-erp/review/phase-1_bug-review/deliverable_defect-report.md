---
type: deliverable
pipeline: review
phase: 1
skill: bug-review
name: Defect Report
version: 1
status: draft
created: 2026-08-05T00:00:00Z
---

## Bug Review Report

### Summary
- Total findings: 12 (Critical: 1, Major: 5, Minor: 6)
- Files reviewed (primary): `inventory/ledger/{ledger-write,invariants,repository}.ts`, `inventory/ams-mapping/service.ts`, `inventory/spool/service.ts`, `inventory/alerts/service.ts`, `integration/{normalizer,supervisor,task-sync}.ts`, `integration/bambu/{raw-schemas,mqtt-adapter}.ts`, `integration/bambu/fallback/rest-poll-telemetry.ts`, `procurement/reception/service.ts`, `procurement/po/service.ts`, `jobs/job/service.ts`, `jobs/costing/service.ts`, `identity/{service,session,throttle}.ts`, `http/{sse,session-gate}.ts`, `bus/event-bus.ts`, `container.ts`, `db/schema/inventory.ts`, `migrations/0000_baseline.sql`; frontend `sse/event-bridge.ts`, `api/client.ts`, `router.tsx`, `lib/freshness.ts`; tests `tests/integration/{ledger,reception}.test.ts`, `tests/contract/normalizer.contract.test.ts`.
- Risk assessment: **Medium** (one Critical ledger-integrity defect in the reverse-and-repost correction path when the original consumption was floored; the remainder are Major functional/robustness gaps). The single write path, exactly-once idempotency, DB constraints, and reception atomicity are otherwise sound.

---

### Findings

#### [BUG-001] Boundary Condition / Data Corruption — Reversal of a floored over-consumption entry inflates the spool balance above its true remaining weight
- **Severity:** Critical
- **Location:** `apps/backend/src/inventory/ledger/ledger-write.ts:214-222` (reversal delta), interacting with `apps/backend/src/inventory/ledger/ledger-write.ts:71-107` (floor-at-zero in `applyEntry`)
- **Description:** `applyEntry` floors the *balance* at zero but persists the full (un-floored) `deltaG` on the entry. When a consumption over-consumes (e.g. spool has 100 g, consumption of 250 g → `balanceAfterG = 0`, but `deltaG = -250`), a later `correctConsumption` reverses it with `deltaG: -live.deltaG` = `+250`. The reversal is applied to the current balance (0) giving `0 + 250 = 250`, which is positive and therefore *not* floored. The spool now reports 250 g remaining despite never having held more than 100 g — a fabricated-inventory (book-of-record corruption) defect.
- **Evidence:**
  - Over-consumption stored with full delta: `ledger-write.ts:72-74,84` — `const rawBalance = current.remainingNetWeightG + args.deltaG; const overConsumption = rawBalance < 0; const balanceAfterG = overConsumption ? 0 : rawBalance;` then `deltaG: args.deltaG` (the un-floored −250) is written.
  - Reversal blindly negates that delta: `ledger-write.ts:214-222` — `this.applyEntry({ spoolId: live.spoolId, type: 'reversal', deltaG: -live.deltaG, ... })`.
  - Reproduction: seed spool 100 g; `postConsumption(grams: 250)` → balance 0, `overConsumption=1`, entry `deltaG=-250`; `correctConsumption(newGrams: 10, sameSpool)` → reversal `deltaG=+250` → balance 250; corrected consumption `-10` → balance 240. True remaining should be 90.
  - The ledger property test only exercises `postConsumption` sequences and never reverses a floored entry (`tests/integration/ledger.test.ts:151-166`); the explicit reversal test uses a spool with ample balance (`ledger.test.ts:114-135, 137-149`), so this path is untested.
- **Suggested Fix:** When reversing, clamp the reversal delta to the amount that was actually deducted, not the requested delta. Persist an `applied_delta_g` (post-floor effective delta) on each entry and reverse *that*; or, in the reversal branch, compute the effective reversal so the balance cannot exceed the balance that existed *before* the reversed entry. Simplest correct rule: `reversalDelta = live.balanceBeforeG - currentBalance` reconstructed from the prior entry, or store `overConsumedG` and subtract it from the reversal.
- **Test Recommendation:** Add an integration test: seed 100 g, over-consume 250 g (assert `overConsumption=1`, balance 0), then `correctConsumption` to a smaller value on the same spool and assert the final balance never exceeds the pre-consumption balance and equals `100 − correctedGrams`. Extend the property test to interleave `correctConsumption` (including over-consumed originals) and assert `balanceMatchesLastEntry` **and** `balanceAfterG <= initialNetWeightG` for every entry.

---

#### [BUG-002] Logic / Missing Event — `LowStockCleared` is never published; low-stock alerts can never actively clear over SSE
- **Severity:** Major
- **Location:** `apps/backend/src/container.ts:84-104` (alert evaluator), `apps/backend/src/bus/event-bus.ts:19` (event defined), `apps/backend/src/http/sse.ts:55-65` (handler present but unreachable)
- **Description:** The alert evaluator re-publishes `LowStockThresholdCrossed` for every *currently active* alert on each `SpoolsReceivedIntoStock` / `FilamentConsumptionRecorded` event, but no code path ever publishes `LowStockCleared`. The SSE `case 'LowStockCleared'` (sse.ts:55) and the `DomainEvent` variant are dead. When the last active alert for a product resolves (stock replenished above threshold), the evaluator emits nothing for that product, so the browser receives no `lowStock` frame and never invalidates. The dashboard banner persists stale until an unrelated event happens to fire an invalidation.
- **Evidence:** `container.ts:90-99` publishes only `LowStockThresholdCrossed`; a full `src` grep for `LowStockCleared` returns only the type definition (`event-bus.ts:19`) and the SSE consumer (`sse.ts:55`) — never a `bus.publish({ type: 'LowStockCleared' ... })`. The evaluator's loop iterates `inventoryRead.alerts()` which returns *only active* alerts (`alerts/service.ts:106-130`), so cleared products are structurally absent.
- **Suggested Fix:** Make the evaluator edge-triggered: track the previously-active alert set (per product) and on each re-eval diff it against the current active set, publishing `LowStockCleared` for products that transitioned active→inactive and `LowStockThresholdCrossed` only for newly-active (or changed) products. This also removes redundant repeated Crossed spam.
- **Test Recommendation:** Unit-test the evaluator: drive a product below threshold (assert one Crossed), then receive stock above threshold and assert exactly one `LowStockCleared` for that product and no further Crossed.

---

#### [BUG-003] Logic / Redundant Firing — Low-stock re-eval republishes `LowStockThresholdCrossed` on every stock event, including stock-increasing receptions
- **Severity:** Major
- **Location:** `apps/backend/src/container.ts:84-104`
- **Description:** On any `SpoolsReceivedIntoStock` (stock *increase*) the evaluator loops all active alerts and re-publishes `LowStockThresholdCrossed` for each, with a fresh `activeSince` timestamp each time (`alerts/service.ts:126`). This produces duplicate/rebroadcast alerts and resets `activeSince` on every unrelated write, defeating "active since" semantics and generating SSE churn. Combined with BUG-002 (no clear), the alert stream is effectively "sticky-on, never-off, repeatedly-re-armed."
- **Evidence:** `container.ts:85` subscribes to both `SpoolsReceivedIntoStock` and `FilamentConsumptionRecorded`; `container.ts:90-99` unconditionally re-publishes for every active alert; `alerts/service.ts:126` sets `activeSince: new Date(nowMs()).toISOString()` on each computation (not persisted, so it is "now" every time).
- **Suggested Fix:** Fold into the edge-triggered evaluator from BUG-002 (only publish on transition). Persist or derive a stable `activeSince` rather than recomputing "now" each call.
- **Test Recommendation:** Assert that a reception that keeps a product above threshold produces **no** `LowStockThresholdCrossed`, and that a still-active product does not re-fire on unrelated writes.

---

#### [BUG-004] Error Handling / Resource — A throwing SSE client `write` aborts the broadcast loop for all other connected clients
- **Severity:** Major
- **Location:** `apps/backend/src/http/sse.ts:92-95` (`broadcast`) and `sse.ts:106-109` (`send` closure)
- **Description:** `broadcast` iterates `this.clients` and calls each `send` synchronously with no per-client try/catch. `send` calls `reply.raw.write(...)` on a raw Node socket. If one client's socket has been destroyed/errored between the `'close'` handler firing and this write (or write throws `ERR_STREAM_DESTROYED`), the exception propagates out of `broadcast`, aborting delivery to every subsequent client in the `Set` for that event, and (because `broadcast` is invoked from `onDomainEvent`, itself invoked from `EventBus.publish`) is only swallowed by the bus's catch — meaning the remaining subscribers of that *domain event* also do not run. Real-time updates silently stop for healthy clients.
- **Evidence:** `sse.ts:92-95` — `for (const send of this.clients) send(msg, id);` (no isolation). `sse.ts:106-108` — `reply.raw.write(...)` with no guard. Contrast with `EventBus.publish` (`event-bus.ts:69-77`) and the MQTT/REST adapters (`mqtt-adapter.ts:37-45`, `rest-poll-telemetry.ts:28-36`) which *do* isolate per-handler.
- **Suggested Fix:** Wrap each `send` call in try/catch inside `broadcast`; on write failure, remove that client from the set and clear its keep-alive. Also guard the `keepAlive` interval write (`sse.ts:111-113`).
- **Test Recommendation:** Register two fake clients, make the first's `send` throw, publish an event, and assert the second still receives the message and the throwing client is evicted.

---

#### [BUG-005] Test Meaningfulness — Reception crash-injection test cannot distinguish "rolled back" from "never written," weakening its NFR-RE-03 guarantee
- **Severity:** Major
- **Location:** `apps/backend/tests/integration/reception.test.ts:106-130`
- **Description:** The crash-injection test mocks `recordInitialInTx` to throw on the very first invocation (both branches throw; the `calls === 2` guard is dead because line 115 throws unconditionally). Because the mock throws before *any* spool's ledger entry is applied — actually before the first `recordInitialInTx` completes — the test proves the transaction rolls back a failure that occurs after the receipt insert and first spool insert. That is a valid rollback assertion, but the comment/intent ("failure *mid-posting*, calls===2") is not what executes: the injected failure is at the first ledger write, not partway through multiple spools. The test would still pass even if the writer failed to insert *any* spool at all (e.g. if spool insertion were reordered after the throw), so it does not actually pin down that partial multi-spool writes roll back.
- **Evidence:** `reception.test.ts:111-116` — the mock body throws unconditionally: `if (calls === 2) throw ...; throw new Error('simulated crash mid-transaction');` The second `throw` makes `calls === 2` unreachable, so the "mid-transaction after N spools" scenario the test name promises is never exercised. Assertions (`reception.test.ts:125-128`) check zero receipts/spools and PO still `ordered` — correct outcomes, but for a first-write failure only.
- **Suggested Fix:** Remove the dead first `throw`; let `calls === 2` be the injection point so the failure occurs after spool #1 + its ledger entry have been written inside the tx. Then the zero-rows assertions genuinely prove multi-write rollback. Add an assertion that `goodsReceiptLine` and `spoolLedgerEntry` are also empty (currently only `goodsReceipt` and `spool` are checked).
- **Test Recommendation:** As above; also add a variant that injects the failure during the PO-status update step to cover the final mutation in the transaction.

---

#### [BUG-006] Logic / Status Corruption — Consuming a mapped (`in_use`) spool to zero silently leaves an `ams_slot_mapping` pointing at a `depleted` spool
- **Severity:** Major
- **Location:** `apps/backend/src/inventory/ledger/ledger-write.ts:98-105`
- **Description:** `applyEntry` transitions a spool to `depleted` whenever `balanceAfterG <= 0`, regardless of whether the spool is currently mapped to an AMS slot (`status === 'in_use'`). No unmap occurs. The result is a `depleted` spool still referenced by `ams_slot_mapping` (which uniquely reserves that spool, `db/schema/inventory.ts:141`). Subsequent `mapSlot` for a replacement spool on that slot works (it deletes the slot row first, `ams-mapping/service.ts:167-177`), but the depleted spool remains "mapped" per `spoolForSlot`/`toSpool.mappedTo`, and `unmapSlot` on it will set it back to... it won't (it guards depleted, `ams-mapping/service.ts:216`). The invariant "a spool is either usable-and-mapped or depleted-and-unmapped" is violated, and consumption attribution via `spoolForSlot` can still resolve to a depleted spool.
- **Evidence:** `ledger-write.ts:99` — `balanceAfterG <= 0 ? 'depleted' : ...` with no check for an existing mapping; there is no call to delete `amsSlotMapping` in `applyEntry`. `ams-mapping/service.ts:244-259` (`spoolForSlot`) returns the mapping's `spoolId` with no status filter. `spool/service.ts:216` (`unmapSlot`) skips the status reset for depleted spools, so a manual unmap leaves the mapping row until slot reuse.
- **Suggested Fix:** When `applyEntry` depletes a spool, atomically delete any `ams_slot_mapping` for that spool within the same transaction, and publish a mapping-changed event. Alternatively, document depleted-while-mapped as intentional and make `spoolForSlot`/attribution reject depleted spools.
- **Test Recommendation:** Map a spool (assert `in_use`), consume it to 0, and assert (a) status `depleted`, (b) no `ams_slot_mapping` row references it, (c) `spoolForSlot` returns null for that slot.

---

#### [BUG-007] Boundary Condition — MQTT telemetry `capturedAt` is stringified then re-parsed, dropping sub-second precision and risking a silent NaN persist
- **Severity:** Minor
- **Location:** `apps/backend/src/integration/normalizer.ts:114-115` and `apps/backend/src/integration/supervisor.ts:132`
- **Description:** The normalizer converts the ms timestamp to an ISO string (`new Date(capturedAtMs).toISOString()`), and the supervisor parses it straight back (`new Date(snap.capturedAt).getTime()`). This round-trip is lossless for valid inputs but is fragile: if any future code path supplies a non-ISO `capturedAt`, `getTime()` yields `NaN`, which is then written to the `captured_at INTEGER NOT NULL` column (`migrations/0000_baseline.sql:216`) as `NaN`/null with no guard, and freshness computation downstream treats it as `error`. The double conversion is also unnecessary work on the hot telemetry path.
- **Evidence:** `normalizer.ts:114` — `capturedAt: new Date(capturedAtMs).toISOString(),`; `supervisor.ts:132` — `const capturedAt = new Date(snap.capturedAt).getTime();` with no `Number.isFinite` check before the insert/update at `supervisor.ts:140-162`.
- **Suggested Fix:** Carry the numeric ms through the internal type (or validate `Number.isFinite(capturedAt)` in `ingestSnapshot` and fall back to `nowMs()`), avoiding the string round-trip.
- **Test Recommendation:** Feed an ingest with a malformed `capturedAt` and assert the persisted `captured_at` is a finite integer.

---

#### [BUG-008] Input Parsing — `normalizeColor` assumes trailing-alpha (`RRGGBBAA`) only; leading-alpha (`AABBGGRR`) inputs yield the wrong display color
- **Severity:** Minor
- **Location:** `apps/backend/src/integration/normalizer.ts:159-165`; raw shape comment `apps/backend/src/integration/bambu/raw-schemas.ts:67`
- **Description:** `normalizeColor` always keeps the first 6 hex chars (`hex.slice(0, 6)`), which is correct for `RRGGBBAA` (verified by the contract fixture) but the raw schema documents the field as `AABBGGRR or RRGGBBAA` (`raw-schemas.ts:67`). For an `AABBGGRR` payload the function returns `AABBGG` (alpha+blue+green), i.e. the wrong color, with no drift signal. This is a display-only defect and unverifiable against live Bambu firmware (inherent A-01..A-05 assumption), but it is a latent correctness gap the ACL was meant to normalize.
- **Evidence:** `normalizer.ts:163` — `if (hex.length >= 6) return \`#${hex.slice(0, 6).toUpperCase()}\`;` handles only one byte-order; contract test asserts only the `RRGGBBAA` case (`normalizer.contract.test.ts:51`).
- **Suggested Fix:** Decide the canonical Bambu byte order (the community-documented AMS `tray_color` is `RRGGBBAA`); update the schema comment to remove the ambiguous `AABBGGRR`, or, if both truly occur, key off payload length/marker. At minimum, add a fixture + test for the alpha-leading case so the behavior is pinned.
- **Test Recommendation:** Add a contract fixture with an alpha-leading color and assert the produced `#RRGGBB` (once the canonical order is confirmed).

---

#### [BUG-009] Concurrency (TOCTOU) — `AmsMappingService.mapSlot` checks spool-already-mapped outside the transaction
- **Severity:** Minor
- **Location:** `apps/backend/src/inventory/ams-mapping/service.ts:157-193`
- **Description:** The "spool already mapped elsewhere" check (`existingForSpool`) runs before `this.db.transaction(...)`. The insert then relies on the `ams_spool_uq` UNIQUE(spool_id) index to actually enforce single-mount. Under the current runtime this is safe because better-sqlite3 is synchronous and single-threaded, so no interleaving occurs — but the pre-transaction check is a classic TOCTOU shape. If the check fails to catch a case that the constraint does (e.g. two mappings created in quick succession from different request handlers were the runtime ever made concurrent), the constraint would raise a raw SQLite error surfaced as a 500 rather than the intended `SPOOL_ALREADY_MAPPED` 409.
- **Evidence:** `ams-mapping/service.ts:157-164` (check) precedes `ams-mapping/service.ts:166` (`this.db.transaction`). The delete-then-insert on the slot (`ams-mapping/service.ts:167-190`) does not re-verify the spool-level uniqueness.
- **Suggested Fix:** Move the `existingForSpool` check inside the transaction, and/or catch the UNIQUE(spool_id) violation and translate it to `ConflictError('SPOOL_ALREADY_MAPPED')`. Low priority given the single-threaded runtime.
- **Test Recommendation:** Attempt to map the same spool to two slots and assert a `SPOOL_ALREADY_MAPPED` conflict (not a raw DB error).

---

#### [BUG-010] Logic — `manualAdjust` to a negative net weight is silently floored to zero and depletes the spool, masking operator error
- **Severity:** Minor
- **Location:** `apps/backend/src/inventory/ledger/ledger-write.ts:255-267` and `apps/backend/src/inventory/spool/service.ts:113-145`
- **Description:** `SpoolService.adjust` guards the *gross-minus-tare* path against a negative net (`spool/service.ts:127-128`) but the direct `netWeightG` path (`spool/service.ts:129-130`) accepts any value including negatives. `manualAdjust` computes `delta = newNetWeightG - current` and passes it to `applyEntry`, which floors the resulting balance at 0 (`ledger-write.ts:73-74`) and marks `overConsumption`. So an operator who fat-fingers a negative recalibration gets a silently-depleted spool with an `over_consumption` flag on a *manual_adjustment* entry (a semantically odd combination), instead of a validation error.
- **Evidence:** `spool/service.ts:129-130` — `else if (args.netWeightG !== undefined) { newNet = args.netWeightG; }` (no `< 0` guard). `ledger-write.ts:257-263` computes and applies the delta with floor-at-zero.
- **Suggested Fix:** Reject `netWeightG < 0` in `SpoolService.adjust` (mirror the gross-path guard), and/or validate `newNetWeightG >= 0` in `manualAdjust`. Zod schema at the DTO boundary should also enforce non-negative.
- **Test Recommendation:** Call `adjust({ netWeightG: -5 })` and assert a `ValidationError`, not a depleted spool.

---

#### [BUG-011] Robustness — Frontend SSE bridge never resets `consecutiveFailures` on manual reconnect, and can enter permanent polling after a single reconnect cycle
- **Severity:** Minor
- **Location:** `apps/frontend/src/sse/event-bridge.ts:104-117`
- **Description:** `onerror` increments `consecutiveFailures` and, once `>= 2`, flips to polling. When the browser marks the source `CLOSED`, the code manually closes and re-`connect()`s after 10s but does **not** reset `consecutiveFailures`. Only a successful `onopen` resets it (`event-bridge.ts:91`). If the reconnect's first event is another transient `onerror` before `onopen`, the counter keeps climbing and polling stays enabled. This is self-healing on the next successful open, so impact is limited to occasional unnecessary polling, but the counter management is incorrect.
- **Evidence:** `event-bridge.ts:105` increments unconditionally; `event-bridge.ts:111-115` re-connects without resetting the counter; reset happens only at `event-bridge.ts:90-93` (`onopen`).
- **Suggested Fix:** Reset `consecutiveFailures = 0` when scheduling a manual reconnect, or track failures per connection attempt rather than globally.
- **Test Recommendation:** Simulate error→CLOSED→reconnect→open and assert polling is disabled and the counter is 0 after open.

---

#### [BUG-012] Error Handling — Mid-session 401 responses are not intercepted globally; expiry mid-page surfaces as a generic error instead of a login redirect
- **Severity:** Minor
- **Location:** `apps/frontend/src/api/client.ts:87-89` (throws `ApiError`), `apps/frontend/src/router.tsx:38-51` (only route-load 401 handling)
- **Description:** 401 handling exists only in `requireSession` at route `beforeLoad` (`router.tsx:46-48`). Once a page is mounted, a session that expires (sliding TTL lapses, `session.ts:54`) causes in-flight queries/mutations to throw `ApiError(status 401)` that no global handler catches; the user sees an error boundary/toast rather than being redirected to `/login`. Correctness of auth enforcement is intact (the server still denies), but the UX contract "expired session → login" is only half-implemented.
- **Evidence:** `client.ts:87-89` throws for any non-ok; no query/mutation `onError` global default keys on `status === 401`; `router.tsx` handles 401 only during navigation.
- **Suggested Fix:** Add a global TanStack Query cache `onError` (or an `api` interceptor) that, on `ApiError.status === 401`, clears the session query and redirects to `/login`.
- **Test Recommendation:** Mock a 401 from a mounted-page query and assert redirection to `/login`.

---

### Detection Gaps
- **Property-based coverage of corrections.** The ledger property test (`ledger.test.ts:151-166`) only sequences `postConsumption`. Extend fast-check to interleave `correctConsumption`, `manualAdjust`, and over-consumption, asserting `balanceMatchesLastEntry`, `balancesFloorAtZero`, `liveReversedInvariant`, **and** a new invariant `0 <= balanceAfterG <= initialNetWeightG` (would catch BUG-001). Recommended tool: fast-check (already a dependency).
- **Mutation testing (Stryker)** on `ledger-write.ts` and `container.ts` alert evaluator would expose the untested reversal-of-floored branch (BUG-001) and the missing `LowStockCleared` branch (BUG-002) as surviving mutants.
- **Static/dep-cruiser confirmation** that `LedgerWriter` is the sole mutator of `spool.remaining_net_weight_g` is asserted in comments (ADR-009) but not verified in this review scope — recommend a dependency-cruiser rule check in CI (NFR-MA-02) is actually wired.
- **Native-binding tests unexecuted:** the ledger, reception, and schema-constraint integration tests require better-sqlite3 on Node 22 and were not run here (per delegation). Findings BUG-001/005/006/010 are derived from code tracing; they should be confirmed by running the augmented tests on CI. No test results are fabricated.
- **Live Bambu behavior (BUG-008)** is inherently unverifiable without credentials; the ACL isolation itself is sound (raw types never leave the normalizer; all three adapters isolate handler exceptions; `safeParse` never throws).

### Checklist Coverage
- **1. Input validation & parsing** — Applied. Findings: BUG-007, BUG-008, BUG-010. ACL tolerant boundary (`normalizer.ts`, `raw-schemas.ts`) verified: `safeParse` + drift counter, never throws.
- **2. Error handling & fail-closed** — Applied. Findings: BUG-004, BUG-012. Reception atomicity and transaction rollback verified sound; supervisor error containment (`supervisor.ts:124-127`) and bus isolation (`event-bus.ts:69-77`) verified.
- **3. Concurrency & shared state** — Applied. Finding: BUG-009 (TOCTOU, low impact under single-threaded better-sqlite3). Timers (supervisor retry, task-sync scheduler, SSE keep-alive, frontend shared clock) reviewed; no leaks that outlive their owners found (all cleared on stop/close).
- **4. Resource management** — Applied. SSE client-set eviction gap noted within BUG-004; MQTT `client.end(true)` and interval clears verified. No connection-pool concerns (single embedded SQLite handle).
- **5. Boundary conditions & integer arithmetic** — Applied. Findings: BUG-001 (floor/reversal), BUG-007. Money (`money.ts`) and unit conversion (`units.ts`) verified correct (guarded div-by-zero, clamped valuation ratio). Pagination/label counters (`reception nextLabel`, `spool nextLabel`) reviewed — safe absent a spool-delete path.
- **6. Null/optional handling** — Applied. No new nulls-deref findings; TS strict + Zod boundary and `?? null` defaults are consistently applied. `killSwitchOn()` returns false on absent `cloud_link` row (`supervisor.ts:43-46`) — fail-closed (disabled), which is safe.
- **7. Logging & observability** — Applied. Finding: BUG-002/003 degrade alert observability. Drift counter + once-per-field logging in the ACL is correct; no secrets logged (tokens are `blob`-encrypted, not logged).
- **8. Test meaningfulness & regression coverage** — Applied. Finding: BUG-005 (dead injection branch weakens the crash test). Contract tests (`normalizer.contract.test.ts`) are meaningful and assert no raw-field leakage. Gap: no test reverses a floored entry (feeds BUG-001) and no edge-triggered alert test (feeds BUG-002).
- **Coverage:** 8/8 categories applied = **100%**.

---
## Pipeline Summary (Machine-Readable)

phase_id: 1
skill: bug-review
status: COMPLETE
risk_assessment: Medium
finding_count:
  critical: 1
  major: 5
  minor: 6
checklist_coverage: 100%
verdict: Medium Risk
key_concerns:
  - "BUG-001 (Critical): reversal of a floored over-consumption entry inflates spool balance above true remaining weight — book-of-record corruption (ledger-write.ts:214-222 + 71-107)"
  - "BUG-002 (Major): LowStockCleared never published; low-stock SSE clear path is dead, banner never clears (container.ts:84-104)"
  - "BUG-004 (Major): one throwing SSE client write aborts broadcast to all other clients (sse.ts:92-95,106-109)"
cross_references:
  - apps/backend/src/inventory/ledger/ledger-write.ts:214-222
  - apps/backend/src/inventory/ledger/ledger-write.ts:71-107
  - apps/backend/src/container.ts:84-104
  - apps/backend/src/http/sse.ts:92-95
  - apps/backend/src/inventory/ams-mapping/service.ts:157-193
  - apps/backend/tests/integration/reception.test.ts:106-130
  - apps/backend/src/integration/normalizer.ts:159-165
---
