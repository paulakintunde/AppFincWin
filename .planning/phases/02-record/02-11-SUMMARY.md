---
phase: 02-record
plan: 11
subsystem: database
tags: [supabase, typescript, postgrest, transactions, categories, recurring-series, undo, import, cache]

# Dependency graph
requires:
  - phase: 02-record
    provides: "02-01/02-05/02-06/02-07/02-32: engine types (statement/recurring/categorize/undo barrels), and the transactions_active view plus Record/import-provenance/account-limit columns"
provides:
  - "src/db/rows.ts: TransactionStatus, PaymentType/PAYMENT_TYPES, extended TransactionRow/NewTransaction/TransactionPatch, extended AccountRow/NewAccount/AccountPatch, ImportProfileRow, CategoryRow/NewCategory/CategoryPatch, RecurringSeriesRow, UndoLogRow"
  - "src/db/transactions.ts: ACTIVE_VIEW-based reads on every client path except fetchTransaction; fetchTransactionsSearch, fetchTransactionsInRange, fetchTransferCandidates, fetchHasRowsBefore, fetchTransferLegs, fetchCategorisedNames, fetchActiveIdsByCategory, insertTransactionsBatch"
  - "src/db/errors.ts: WriteEntity extended with categories/recurring_series/undo_log/import_profiles"
  - "src/data/keys.ts: every Phase 2 query and mutation key"
  - "src/data/cache/persister.ts: CACHE_SCHEMA_VERSION bumped to '2' (D-15 buster)"
affects: [02-08-recurring-series, 02-09-server-rpcs, 02-13, 02-14, 02-15, 02-17, 02-20, 02-24, 02-26, 02-27, 02-38]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Shared fetchAllPages<T> helper generalises WR-A12's paging loop across every unbounded ACTIVE_VIEW read (month, range, transfer candidates)"
    - "ACTIVE_VIEW (transactions_active) is the one mandatory client read path (D-30); fetchTransaction is the sole, documented exception (conflict lookups must see tombstones)"
    - "Insert payload builders skip undefined keys rather than sending explicit nulls, so an old caller never regresses a new optional column"

key-files:
  created: []
  modified:
    - src/db/rows.ts
    - src/db/transactions.ts
    - src/db/accounts.ts
    - src/db/errors.ts
    - src/data/keys.ts
    - src/data/cache/persister.ts
    - src/data/mutations/transactions.ts
    - src/data/mutations/accounts.ts
    - src/db/__tests__/fakeSupabase.ts
    - src/db/__tests__/transactions.test.ts
    - src/db/__tests__/accounts.test.ts
    - src/data/__tests__/offlineWrite.test.tsx
    - src/data/__tests__/persister.test.ts
    - src/data/mutations/__tests__/provisional.test.ts
    - src/data/mutations/__tests__/transactions.test.tsx

key-decisions:
  - "Extending TransactionRow/AccountRow with new required (non-optional) fields, per the plan's literal action text, meant every existing fixture and optimistic-row builder across the data layer needed the new fields too -- fixed inline (Rule 3) rather than treating it as a scope question, since the plan's own frontmatter already listed the whole-project `npm run typecheck` as this task's verify step"
  - "insertTransactionsBatch runs assertAllowedKeys on each raw NewTransaction-shaped input before building its payload, not on the already-filtered payload (which would trivially always pass) -- keeps the runtime guard meaningful for untrusted input from the import pipeline"

requirements-completed: [REC-01, REC-02, REC-03, REC-04, ACT-01, ACT-03, REC-09, REC-13, REC-14, REC-16, REC-17, REC-18]

# Metrics
duration: ~80min
completed: 2026-09-27
---

# Phase 02 Plan 11: Record Data Contracts Summary

**Extended TransactionRow/AccountRow with Record and statement-import-provenance fields, made `transactions_active` the mandatory client read path, added ACT-03 search/D-52 transfer-candidate/D-36 merge/D-17 chunked-import reads, and declared every Phase 2 query and mutation key in one registry.**

## Performance

- **Duration:** ~80 min active work across Task 1 and Task 2 (plus `npm ci` install time in the worktree)
- **Tasks:** 2 completed
- **Files modified:** 15 (8 production files, 7 test files across two tasks)

## Accomplishments
- `src/db/rows.ts`: `TransactionStatus`, `PaymentType`/`PAYMENT_TYPES` (D-37), extended `TransactionRow`/`NewTransaction`/`TransactionPatch` with Record fields (name, category_id, payment_type, status, deleted_at, import_batch_id, recurring_series_id, occurrence_date, updated_by) and D-45 statement-import provenance (raw_amount, raw_balance, external_id, import_format, transfer_id) kept insert-only via `TransactionPatch`'s shape; extended `AccountRow`/`NewAccount`/`AccountPatch` with `updated_by`/`overdraft_limit`/`credit_limit` (D-48); added `ImportProfileRow`, `CategoryRow`/`NewCategory`/`CategoryPatch`, `RecurringSeriesRow`, `UndoLogRow` for later plans in this wave to build on
- `src/db/accounts.ts`: `overdraft_limit`/`credit_limit` added to insert/patch key lists and columns; `insertAccount` now skips undefined keys so an old caller never regresses the new optional columns
- `src/db/errors.ts`: `WriteEntity` extended with `categories`/`recurring_series`/`undo_log`/`import_profiles`
- `src/data/keys.ts`: every Phase 2 query key (`categories`, `recurringSeries`, `undoLog`, `transactionsSearch`, `transactionMonths`, `accountBalances`, `householdMembers`, `transferLegs`, `importProfile`) and mutation key (`addCategory`...`saveImportProfile`) declared once
- `src/data/cache/persister.ts`: `CACHE_SCHEMA_VERSION` bumped `'1' -> '2'` (D-15) since row shapes changed
- `src/db/transactions.ts`: `ACTIVE_VIEW` (`transactions_active`) is now the read path for `fetchTransactionsForMonth` and every new read function -- `fetchTransaction` is the one documented exception, since a conflict lookup must still see a soft-deleted row. WR-A12's paging loop is extracted into a shared `fetchAllPages<T>` helper reused by `fetchTransactionsForMonth`, `fetchTransactionsInRange` and `fetchTransferCandidates`. New reads: `fetchTransactionsSearch` (ACT-03, `escapeLikeTerm` guards LIKE/ILIKE metacharacters against T-02-11-03), `fetchTransactionsInRange`, `fetchTransferCandidates` (D-52), `fetchHasRowsBefore` (OFX reconciliation anchor), `fetchTransferLegs` (D-50/D-51, `TRANSFER_LEGS_MAX` = 200), `fetchCategorisedNames` (D-14 learning), `fetchActiveIdsByCategory` (D-36 merge, `MERGE_LIMIT` = 6000). New write: `insertTransactionsBatch` (D-17/MON-08, `IMPORT_CHUNK_MAX` = 500, one `upsert(..., { onConflict: 'id', ignoreDuplicates: true })` per chunk so a replayed import chunk returns only the rows that were genuinely new)
- `insertTransaction` now skips undefined keys (same pattern as `insertAccount`)

## Task Commits

1. **Task 1: Row types, errors, keys, cache buster** - `b9e2ed2` (feat) -- includes the Rule 3 fixes to `mutations/transactions.ts`, `mutations/accounts.ts` and five test fixtures that the newly-required `TransactionRow`/`AccountRow` fields broke
2. **Task 2: transactions.ts view reads, search, range, batch insert + tests** (TDD) -- `6b08859` (test, RED), `181aff8` (feat, GREEN)
3. **Deviation fix surfaced by full-suite verification** - `9016d13` (fix) -- `persister.test.ts`'s buster-mismatch test hardcoded `'2'`, which Task 1's `CACHE_SCHEMA_VERSION` bump made equal to the real value

## Files Created/Modified
- `src/db/rows.ts` - Record/import-provenance/account-limit types, `ImportProfileRow`, `CategoryRow`, `RecurringSeriesRow`, `UndoLogRow`
- `src/db/transactions.ts` - `ACTIVE_VIEW`, `fetchAllPages<T>`, search/range/transfer/merge/import reads, `insertTransactionsBatch`
- `src/db/accounts.ts` - limit columns in insert/patch keys and columns; `insertAccount` skips undefined
- `src/db/errors.ts` - `WriteEntity` extended
- `src/data/keys.ts` - Phase 2 query/mutation key registry
- `src/data/cache/persister.ts` - `CACHE_SCHEMA_VERSION` bump
- `src/data/mutations/transactions.ts` - optimistic-insert row carries the new Record/provenance fields (Rule 3)
- `src/data/mutations/accounts.ts` - optimistic-insert row carries `updated_by`/limits (Rule 3)
- `src/db/__tests__/fakeSupabase.ts` - `in`/`ilike`/`not`/`lte`/`neq`/`upsert` recording methods
- `src/db/__tests__/transactions.test.ts` - 54 tests total: existing suite plus new coverage for every function this plan added
- `src/db/__tests__/accounts.test.ts`, `src/data/__tests__/offlineWrite.test.tsx`, `src/data/mutations/__tests__/provisional.test.ts`, `src/data/mutations/__tests__/transactions.test.tsx` - fixtures extended with the newly-required row fields (Rule 3)
- `src/data/__tests__/persister.test.ts` - buster-mismatch fix (Rule 1)

## Decisions Made
- Followed the plan's literal type shapes and key lists throughout; the two decisions worth recording are in the frontmatter `key-decisions` (fixing the required-field ripple inline rather than treating it as a scope question, and where `assertAllowedKeys` runs inside `insertTransactionsBatch`).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Extending TransactionRow/AccountRow with required fields broke five other files' typecheck**
- **Found during:** Task 1, first `npm run typecheck` after extending `rows.ts`
- **Issue:** The plan's literal action text adds the new Record fields to `TransactionRow`/`AccountRow` as required (non-optional), matching the DB columns' `not null` defaults. Every place in the codebase that already builds a full `TransactionRow`/`AccountRow` object -- the two optimistic-mutation builders in `mutations/transactions.ts`/`mutations/accounts.ts`, and five test fixtures (`offlineWrite.test.tsx`, `provisional.test.ts` x2, `mutations/transactions.test.tsx` x2, `db/__tests__/accounts.test.ts`, `db/__tests__/transactions.test.ts`) -- was now missing the new required properties, which is exactly what a whole-project `npm run typecheck` (this task's stated verify command) caught.
- **Fix:** Added the new fields to the two optimistic-row builders (mirroring what the real insert would default them to: `status: 'paid'` per D-01, everything else `null`/the caller's own value), and added matching defaults to every affected test fixture.
- **Files modified:** `src/data/mutations/transactions.ts`, `src/data/mutations/accounts.ts`, `src/data/__tests__/offlineWrite.test.tsx`, `src/data/mutations/__tests__/provisional.test.ts`, `src/data/mutations/__tests__/transactions.test.tsx`, `src/db/__tests__/accounts.test.ts`, `src/db/__tests__/transactions.test.ts`
- **Verification:** `npm run typecheck` passes clean; `npx jest src/db src/data` (265 tests) passes.
- **Committed in:** `b9e2ed2` (Task 1 commit)

**2. [Rule 1 - Bug] persister.test.ts's buster-mismatch test collided with the new CACHE_SCHEMA_VERSION**
- **Found during:** post-Task-2 full-suite verification (`npx jest src/db src/data`)
- **Issue:** `"restores nothing when the buster does not match"` saved with the default buster (`CACHE_SCHEMA_VERSION`) and restored with a hardcoded literal `'2'` to prove a mismatch. Once Task 1 bumped `CACHE_SCHEMA_VERSION` to `'2'`, the two busters became equal, so the test silently stopped proving a mismatch (it still passed, for the wrong reason, until the restored data assertion caught it).
- **Fix:** Restore buster is now `` `not-${CACHE_SCHEMA_VERSION}` `` -- guaranteed different from whatever the constant currently is, rather than a literal that can collide again on the next bump.
- **Files modified:** `src/data/__tests__/persister.test.ts`
- **Verification:** `npx jest src/data/__tests__/persister.test.ts` -- 9/9 pass, including the corrected case.
- **Committed in:** `9016d13`

---

**Total deviations:** 2 auto-fixed (1 blocking type-ripple, 1 test bug surfaced by a prior task's own change)
**Impact on plan:** Both fixes were mechanical consequences of the plan's own literal type extensions and verify commands (whole-project typecheck, full `src/db src/data` suite). No scope creep, no design change.

## TDD Gate Compliance

Task 2 (`tdd="true"`) followed the RED/GREEN gate sequence: `6b08859` (`test(02-11): ...`) precedes `181aff8` (`feat(02-11): ...`) in git log. No REFACTOR commit was needed -- the implementation matched the plan's literal shape on the first pass with no follow-up cleanup.

## Issues Encountered

None beyond the two deviations documented above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Every Phase 2 row type, read function and query/mutation key this wave's other plans (02-08 recurring series, 02-09 server RPCs, and the later contracts/hooks/mutations/UI plans) depend on now exists and typechecks against the schema plan 02-07 shipped.
- `transactions_active` is proven as the one mandatory read path across 8 distinct query functions; `fetchTransaction`'s deliberate exception is documented and tested.
- `insertTransactionsBatch`'s chunk/upsert shape is ready for the import pipeline (02-26/02-27) to call directly.
- Nothing has been pushed to production; this plan touches only TypeScript/tests, no migrations.

---
*Phase: 02-record*
*Completed: 2026-09-27*

## Self-Check: PASSED

All 15 modified files plus this SUMMARY.md verified present on disk; all 4 task commits (`b9e2ed2`, `6b08859`, `181aff8`, `9016d13`) verified present in `git log`.
