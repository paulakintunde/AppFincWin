---
phase: 08-household
plan: 15
subsystem: client-data
tags: [household, db, mutations, balances, offline-queue, cache, export]
requires: [08-04, 08-10, 08-11, 08-13, 08-14, 08-16]
provides:
  - src/db/transactionSplits.ts, src/db/settlements.ts, src/db/householdFormerMembers.ts (reads and one wrapper per 08-10, 08-11, 08-14 RPC)
  - registerHouseholdSharingMutations (five queued writes), useShareLine, useSetLineSplit, useMakeLinePrivate, useSetPaidBy, useSetMyLineCategory, splitUndoVars
  - online-only settle-up hooks (propose, confirm, record received, record paid, reject, cancel, undo, write off, ask, set payer account, leaver "I paid")
  - useHouseholdBalances, usePairLines, useSplitDefaults, useSettlements, useFormerMembers
  - HOUSEHOLD_REASON_KEYS and householdReasonKey (every server refusal has words)
affects: [08-17, 08-19, 08-20, 08-21, 08-22, 08-24, 08-25, 08-30]
key-files:
  created:
    - src/db/transactionSplits.ts
    - src/db/settlements.ts
    - src/db/householdFormerMembers.ts
    - src/data/mutations/householdSharing.ts
    - src/data/mutations/settlements.ts
    - src/data/queries/householdBalances.ts
    - src/i18n/locales/household/reasons.ts
  modified:
    - src/db/rows.ts, src/db/transactions.ts, src/db/accounts.ts, src/db/householdMembers.ts
    - src/data/keys.ts, src/data/exportManifest.ts, src/data/mutations/index.ts, src/data/queries/household.ts
    - src/data/cache/persister.ts, scripts/cache-shape.lock.json
    - src/features/household/useMemberLabel.ts, src/ui/failedWriteLabels.ts
    - src/i18n/locales/household/index.ts, src/i18n/locales/household/notices.ts
decisions:
  - CACHE_SCHEMA_VERSION 12 -> 13 (once, for this plan); the lock was refreshed after all column and key changes
  - A shared line's owed amount is the negated stored share (expenses are stored negative), the same sign hh_pair_owed uses
  - Settle-up hooks use networkMode 'always' so an offline call answers { ok: false, reason: 'offline' } instead of pausing
  - Household refusals park their reason code as the failed-write code, so the failed-writes list reads them in their own words
metrics:
  completed: 2026-11-15
---

# Phase 8 Plan 15: Client data layer for sharing and settling Summary

Typed reads and RPC wrappers for splits, settle-ups and former members; five sharing writes that wait in the offline queue and replay version-checked; settle-up calls that never queue; who-owes-who from the engine's `pairBalances` over stored splits and live settle-up lines; and words for every refusal the household RPCs can give.

## Commits

| Task | Commit | Result |
|------|--------|--------|
| 1 db modules, columns, former members, export manifest | 337f780b | db, features/household and exportManifest jest green, tsc clean |
| 2 mutations, balances query, refusal copy, cache bump | a36bf608 | targeted jest, tsc, eslint and `check:cache-version` green |

## What was built

- **Columns.** `TRANSACTION_COLUMNS` gained `is_shared, paid_by, paid_by_former_key, household_amount, household_currency, household_rate_pending, split_rule, split_manual, is_settlement, settlement_id, copied_from, copy_share` (select-only, in neither write-key list). `ACCOUNT_COLUMNS` gained `is_shared` and `tombstone_of`; `is_shared` joins the insert and patch keys (08-01 grant). `fetchAccounts` skips tombstone accounts, so they never reach a list or picker; `fetchJointAccountIds` leaves them out of "joint" so lines on them still create owing.
- **RPC wrappers** (`transactionSplits.ts`, `settlements.ts`): one per RPC, argument names from the 20261122 migrations, newest body wins (`record_received`, `confirm_settlement` and `hh_pair_owed` as re-issued in 000800). Includes `proposeLeaverPayment(p_household, p_receiver, p_line_ids, p_expected_amount)` and `myDepartedBalances` whose rows carry `pending_settlement_id` and `pending_amount`. A refusal comes back as `{ ok: false, reason }` untouched; transport errors go through `toDbError`.
- **Queued writes** (`householdSharing.ts`): share, split, make private, paid by, own category. Each uses the categoryRules pattern, chains versions through `resolveExpectedVersion` / `recordWrittenVersion`, patches the month cache optimistically, then refreshes the month and balances. `version_conflict` becomes a `VersionConflictError` carrying `{ version, updated_by }` (the failed-write entry keeps `updated_by`, so the screen can say who changed it first); `not_found` becomes `NotFoundError`; every other reason is a `HouseholdRejectedError` whose `code` is the reason, never retried. `splitUndoVars` rebuilds the `set_line_split` call from the server's `before` for Undo.
- **Online-only settle-up** (`settlements.ts`): plain `useMutation` hooks with no registered default. Offline they resolve with `OFFLINE_RESULT` and send nothing; coming back online replays nothing (tested). Any server answer other than offline refreshes the household's transactions, settle-ups and notices.
- **Balances** (`householdBalances.ts`): `toBalanceLines` maps stored splits and live settlement lines into `SharedLineForBalance` (payer = `paid_by`, then `paid_by_former_key`, then `created_by`; member key = `member_id ?? former_member_key`; status from the live settle-up with the day-14 lazy lapse). `useHouseholdBalances` returns `{ pairs, owedToMe }` from `pairBalances` / `owedToMeTotal`; `usePairLines` returns the traced lines with signed contributions from the same cached read.
- **Former members**: `useFormerMembers`, and `useMemberLabel` now resolves a user id or former key through the former-member row: "Sam (left)", "Slate (left)" when the name is hidden, "Former member" once deleted or for a null id.
- **Export manifest**: `transaction_splits`, `transaction_member_categories`, `household_split_defaults`, `settlements`, `settlement_lines`, `household_former_members`, `member_departures` (column-only grant) and the new transaction and account columns. `settlement_nudges` is not listed and a test asserts it. The 101 export-tables guard stays green; 101 was not edited.
- **Refusal copy**: new `household.reasons.*` area plus a `HOUSEHOLD_REASON_KEYS` map in `failedWriteLabels.ts` that reuses 08-12 (`sharing.reasons`, `join.errors`), 08-16 (`members.reasons`) and settle keys where they exist. A test scans every `'reason', '<code>'` and HH001 message in the 20261122 migrations and fails on a code with no key. Added copy for the `settle_departed` notice (`settle_departed`, `_left`, `_removed`, `_deleted`; params name, amount, currency). `householdCopy.test.ts` stays green (no advice words, curly apostrophes).
- **Cache**: `CACHE_SCHEMA_VERSION` '12' -> '13', history line added, lock refreshed with `npm run check:cache-version -- --update`. Tests that pinned '12' updated (persister.test.ts, categoryIcon.test.tsx).

## Deviations from Plan

**1. [Rule 3] `queryKeys.pairLines` not added.** `usePairLines` selects from the same cached read as the balances (one fetch, one key), so a separate key would be dead. `householdBalances` sits under `['transactions', householdId, ...]` as asked.

**2. [Rule 3] Shared test and helper edits.** `fakeSupabase` gained `delete()` (needed to test the own-category delete). `columns05_2.test.ts` now reads the combined grant form `grant insert (...), update (...) on public.t`, which is how 20261122000100 grants `accounts.is_shared`; without that the patch-key mirror test could not see the grant. The 08-16 tests (`MemberSheet`, `WeightsSheet`) mock `useFormerMembers` now that `useMemberLabel` reads it.

**3. [Rule 3] `callRpc` exported from `householdMembers.ts`** so the new modules share one RPC caller instead of a third copy.

**4. Reasons that already had a key elsewhere.** The carry-in table said the member reasons had no key; 08-16 added most of them under `household.members.reasons`, so those are mapped, not duplicated. `all_zero` maps to `household.members.weights.lastHolder`; `invalid_weight` and `not_100` to `household.members.reasons.weights_invalid`.

**5. `version_conflict` and the name parameter.** The key is `household.sharing.reasons.stale_version` (`{{name}}`); the screen fills `name` from `updated_by` through `useMemberLabel`. The failed-writes sheet itself still shows its generic conflict line for a parked conflict, because it passes no parameters; the `updated_by` is stored in the entry's `attempted` for 08-19 to use.

**6. The `'changed'` reason in the migrations** is the refusal marker inside an `undo_log` row, not an RPC answer, so the coverage test skips it by name.

## Known limits

- A third member cannot see settle-up lines of a pair they are not in (RLS), so a line another pair has settled still reads as open to them until the server refuses with `lines_changed`. The server is the authority; the screen refreshes on that answer.
- Shared lines are read in full for the household (paged, 1000 per page). A household with a very long history reads every shared line on each balances refresh; if that becomes slow, a server-side balances RPC is the next step.

## Known Stubs

None.

## Verification

- `npx tsc --noEmit`: clean
- jest (targeted): src/db (all), householdSharing, settlements, src/data/queries/__tests__ (incl. householdBalances), exportManifest, failedWriteLabels, householdReasonKeys, FailedWritesSheet, householdCopy, src/features/household: 72 suites, 789 tests pass. `persister.test.ts` crashed a worker in the big batch (timeout kill) and passes alone (14 tests); `categoryIcon.test.tsx` passes alone (8).
- eslint on every touched file and folder: clean
- `npm run check:cache-version`: unchanged at version 13 after `--update`
- No full suite and no database runs, as agreed. Nothing under src/engine changed.

## Self-Check: PASSED (commits 337f780b, a36bf608; every created file present; householdSharing.ts has 5 setMutationDefaults, settlements.ts has 0, index.ts has 2 registerHouseholdSharingMutations)
