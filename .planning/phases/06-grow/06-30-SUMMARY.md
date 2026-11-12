---
phase: 06-grow
plan: 30
subsystem: data
tags: [debts, rpc, offline-queue, cache, decide]
requires: [06-25, 06-26, 06-29]
provides:
  - transactions.debt_id read on the client (select, row type, export manifest)
  - cache version 6
  - recordDebtOneOff (src/db/debtPlan.ts) over record_debt_one_off
  - useRecordDebtOneOff, extraStartDate, oneOffDate (src/data/mutations/growDebts.ts)
affects: [06-35, 06-36, 06-37]
tech-stack:
  added: []
  patterns: [server-built undo step via RPC, paused-mutation defaults with client ids]
key-files:
  created:
    - src/data/mutations/__tests__/growDebtOneOff.test.tsx
    - src/features/decide/snapshot/v3/__tests__/debtOneOffCounted.test.ts
  modified:
    - src/db/rows.ts
    - src/db/transactions.ts
    - src/db/__tests__/columns06.test.ts
    - src/data/exportManifest.ts
    - src/data/__tests__/exportManifest.test.ts
    - src/data/cache/persister.ts
    - src/data/__tests__/persister.test.ts
    - scripts/cache-shape.lock.json
    - src/db/debtPlan.ts
    - src/db/__tests__/debtPlan.test.ts
    - src/data/keys.ts
    - src/data/mutations/growDebts.ts
decisions:
  - "TransactionRow.debt_id is optional (debt_id?: string | null), like goal_id, so existing literal fixtures stay valid; every select returns it"
  - "useRecordDebtOneOff makes no optimistic debt change: the balance moves only when the Expected line is marked paid"
  - "A one-off line reaches Decide's month as role 'spending' (no transfer, no series); counted once, not as 'debt_payment'"
metrics:
  completed: 2026-11-10
---

# Phase 6 Plan 30: One-off debt payment, client side

The client now reads `transactions.debt_id`. `useRecordDebtOneOff` records "Use $1,000 once" as one queued `record_debt_one_off` call with one server-built Undo. `extraStartDate` and `oneOffDate` are exported, so the payoff buttons can name the same start dates the writes use.

## What changed

**Task 1: read transactions.debt_id** (commit ab1deeae)
- `TRANSACTION_COLUMNS` now selects `debt_id`, placed after `goal_id`. It is select-only and not in either write-key list, because the column has no client grant.
- `TransactionRow.debt_id?: string | null` added.
- The export manifest lists `transactions.debt_id`.
- `CACHE_SCHEMA_VERSION` bumped from 5 to 6. The current value was read from `persister.ts` and the lock file, and the lock was rewritten with `check:cache-version -- --update`.
- Tests:
  - columns06: the column is in the select list and in neither write list.
  - exportManifest: the manifest lists `debt_id`.
  - persister: the version is 6, and a version 5 blob keeps its queued writes.

**Task 2: the hook, the date helpers and the counted-once test** (commit 9a8e5130)
- `recordDebtOneOff(client, { debtId, payment, undoStep })` in `src/db/debtPlan.ts`:
  - makes one `rpc('record_debt_one_off', { p_debt_id, p_payment, p_undo_step })` call;
  - maps `applied` to `{ transactionId, undoStepId }` and `already-applied` to `{ transactionId: null, undoStepId }`;
  - treats any other status, or a missing step id, as `DbError BAD_RESPONSE`;
  - throws `RangeError` before the call if the amount is not a positive whole number up to 1e13.
- `mutationKeys.recordDebtOneOff = ['debts', 'record-one-off']`. Its defaults are registered in `registerGrowDebtMutations`: write scope, retry, `guardSession` and `markSession`.
  - On success it calls `refreshDebtReads`, which refreshes debts, series, the transactions root, the undo log, balances, transaction months and search.
  - On failure it calls `parkFailure` with `{ labelKey: 'debtOneOffRecorded', fields: 1 }`. No amounts or names are stored.
- `useRecordDebtOneOff().record({ ownerId, debt, amount, paidFromAccountId, name })` returns `{ stepId }` straight away.
  - Ids: the payment id and the step id are created on the device once, so an offline replay sends the same ids and the server answers `already-applied`.
  - Undo label: `debtOneOffRecorded` with `label_params: { name: debt.name }`.
  - It throws `RangeError` before any write for any of these: an amount that is 0 or not a whole number, an amount above the balance (`payment-exceeds-balance`), a debt that is paid off or removed, no account, or a name that is blank or over 80 characters.
- `extraStartDate(debt, today)` returns `dueDateOf(today, due_day, 0)`, or `today` when the debt has no due day. `useSaveDebtPlan` now uses it instead of the inline rule.
- `oneOffDate(today?)` returns today's local date in the device time zone. The hook dates the line with it.
- `debtOneOffCounted.test.ts` checks the demo data with one pending, no-series, no-transfer line that has `debt_id` set:
  - the line reaches the current month exactly once, as a `spending` outflow of its amount;
  - the month gains exactly one line;
  - the debt's entry in `debts` and the series list are identical with and without the line, so the minimum is counted once.

## Checks

- Plan verify, Task 1: jest on columns06, viewColumns, transactions, exportManifest and persister passed (108 tests). `check:cache-version` OK at version 6. `typecheck` clean.
- Plan verify, Task 2: jest on debtPlan, growDebtOneOff, growSale, growDebts and debtOneOffCounted passed (39 tests). `typecheck` clean. `depcruise`: no violations (1039 modules).
- eslint on the changed files: 0 errors. One warning in the new test, for the `require()` of the failed-writes mock; growSale.test.tsx has the same warning.
- `jest --findRelatedTests` on the changed source files: 303 suites, 3845 tests passed.

## Deviations from Plan

1. **[Rule 3 - Blocking] `src/data/keys.ts` gained `recordDebtOneOff`.** The file is not in the plan's file list, but the hook needs its own mutation key for the write queue. It is one line, next to `recordDebtSale`. 06-32 may also touch `keys.ts`, so expect at most a trivial merge.
2. **[Plan wording] `TransactionRow.debt_id` is optional (`debt_id?: string | null`)**, not required. This is the same choice as `goal_id`: a required field would break the many existing literal transaction fixtures. Every server read selects it.
3. **[Rule 2] The hook also refuses a paid-off or removed debt** before any write. The server refuses these too, with 22023.
4. The counted-once test passed against the current builder with no change. The plan expected that, and it now guards the behaviour.

## For 06-35 / 06-36 / 06-37

- In Decide, the one-off line's role is `spending`, not `debt_payment`: it is a single line, not a transfer, and `buildV3Inputs` gives debt roles only to transfer legs into a credit or loan account. It is counted once and its money goes out. But it counts as spending in any category-based limit. With no category sent, the server leaves it uncategorised unless the debt has a payment series. Whether `spending` is the right role, or `debt_id` should map to `debt_payment`, is for the 06-37 gate or the owner. Decide's builder was not changed, as the plan required.
- `buildSnapshot`'s `SnapshotRow` type does not carry `debt_id`. The builder ignores the field, which is why the line counts once.

## Missing strings

None. `undo.debtOneOffRecorded` (named and unnamed) and `grow.debts.oneOffLineName` already exist in en.ts.

## Known Stubs

None.

## Self-Check: PASSED

All created files exist; commits ab1deeae and 9a8e5130 are on the branch.
