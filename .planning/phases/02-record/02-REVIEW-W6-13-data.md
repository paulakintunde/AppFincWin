---
phase: 02-record
area: A (data layer, db wrappers, SQL, pure helpers) - waves 6-13 + 02-31 walkthrough fixes
reviewed: 2026-10-07T00:00:00Z
depth: deep
diff_base: 22a506d
files_reviewed: 20
files_reviewed_list:
  - src/data/keys.ts
  - src/data/mutations/accounts.ts
  - src/data/mutations/categories.ts
  - src/data/mutations/index.ts
  - src/data/mutations/patches.ts
  - src/data/mutations/recurringSeries.ts
  - src/data/mutations/transactionCache.ts
  - src/data/mutations/transactions.ts
  - src/data/mutations/transfers.ts
  - src/data/mutations/undo.ts
  - src/data/queries/categories.ts
  - src/db/recurringSeries.ts
  - src/engine/money/regionCurrency.ts
  - src/features/record/useDeviceHomeCurrencyDefault.tsx
  - src/services/locale/deviceLocale.ts
  - src/features/auth/appHome.ts
  - supabase/migrations/20260926000400_recurring_materialisation.sql
  - supabase/migrations/20260926000500_undo_log.sql
  - supabase/tests/database/37_series_undo_anchor.test.sql
  - src/features/record/import/importPipeline.ts (toImportCommit only, read for the import-commit focus item; outside the listed file scope)
findings:
  critical: 0
  warning: 8
  info: 4
  total: 12
status: issues_found
---

# Phase 2: Code Review Report, waves 6-13 data layer (Area A)

**Reviewed:** 2026-10-07
**Depth:** deep (call chains traced into `src/db/*`, `src/engine/undo`, `src/engine/transfer`, the SQL RPCs and the UI callers `TransactionSheet.tsx` and `RemoveCategoryPrompt.tsx`)
**Files reviewed:** 20
**Status:** issues_found

## Summary

Most of the core invariants hold:
- Every `applyPatches` caller (bulk, merge, transfer edit and delete) sends `p_undo_step`.
- Step ids are minted once in the hook, before `mutate()`, and persist in the variables, so they stay stable across paused-mutation replays.
- `serialiseOps` enforces `expectedVersion`, and `resolveExpectedVersion` is applied consistently.
- The series RPCs record their own step server-side.
- The anchorIsNew SQL keeps `security definer` and `search_path = ''`, the household check, and replay-before-validation ordering. The grants were moved to the new signature, and no later migration references the old 4-argument signature.
- No amounts or payee text reach analytics or the failure reporter. `failedWrites` is encrypted locally, and its reporter gets only entity, kind and code.

The defects are in edge paths that the tests do not exercise:
- **Replay paths outside apply_patches.** A transfer add or delete replayed after its first attempt landed with the response lost either loses the undo step or records a false "changed elsewhere" failure. Two tests pin the wrong behaviour.
- **The 6000-op limit.** A category merge of exactly 6000 rows fails. A bulk delete can pass the 6000 check and then cross it after partner-leg expansion.
- **Category merge.** Recurring templates keep the archived source category.
- **Two "unknown is treated as zero or default" bugs.** An offline usage count of 0 auto-archives an in-use category. A failed money-prefs read looks like the USD default, so a real choice can be overwritten.
- **Server-side anchorIsNew trust.** The server trusts the flag without checking it, and can soft-delete an anchor that was never linked.

None of these rises to BLOCKER. None corrupts money values. All of them are recoverable through undo, restore or the You screen. Several break stated Phase 2 invariants (D-24, D-29, D-36, and the 02-31 rule that a user's choice is never overwritten), so they should be fixed before Phase 3 builds on them.

## Warnings

### WR-01: Transfer add replay loses the undo step permanently

**File:** `src/data/mutations/transfers.ts:321-337`

**Issue:** The undo step is recorded in a separate call, only after `insertTransactionsBatch` returns. On a replay, `ignoreDuplicates` returns `[]`, and the code skips recording on the assumption that "the original attempt's own step stands". But the original step was never written when the first attempt's response was lost, because recording happens after the response.

**Failure scenario:**
1. The user adds a transfer on a flaky network.
2. The upsert commits, but the response is dropped (status 0, so it counts as transient and is retried).
3. The retry upserts, gets 0 rows, and records no step.

The transfer exists, but the toast's Undo shows "not recorded" and History has no entry. This breaks D-50's "one undo step covering both legs". `insertTransaction` for single rows avoids this by re-fetching the existing row (CR-A03 / `acceptIfAlreadyApplied`).

The test `transfers.test.tsx:277` ("records no undo step ... when a replayed insert returns no rows") locks in the bug.

**Fix:** When `rows.length === 0`, re-fetch both legs by id, which is the same pattern as `insertTransaction`'s duplicate path. If both exist with version 1, record the step. `insertUndoStep` already treats a duplicate step id as success, so recording twice is safe.
```ts
let legs = rows;
if (legs.length === 0) legs = await fetchTransactionsByIds(client, vars.householdId, vars.rows.map((r) => r.id));
if (legs.length === 2 && legs.every((l) => l.version === 1)) { /* buildStep + recordUndoStepSafely */ }
```
Change test 277 to expect the step to be recorded.

### WR-02: Transfer delete replay reports a false "changed elsewhere" conflict

**File:** `src/data/mutations/transfers.ts:261-267`

**Issue:** `fetchTransferLegs` reads `transactions_active`, which excludes deleted rows (`src/db/transactions.ts:352-356`). If the delete landed and its response was lost, the replay finds 0 live legs and throws `VersionConflictError` before `applyPatches` is called. The server's D-WR-03 replay key (the step id) is therefore never consulted.

**Failure scenario:** The delete succeeds server-side, the response drops, and the retry fetches `[]`. `settleTransferFailure` then:
- records a `version-conflict` failed write for `transfer:<id>`;
- refetches;
- shows the user a "couldn't save, changed elsewhere" entry for a delete that actually worked.

The undo step was recorded and still works, so the History and failed-writes views now contradict each other.

`transfers.test.tsx:483` pins only the "not a pair, so refuse" branch, not the replay.

**Fix:** When the pair is not two live rows, send the call anyway so the server can answer `already-applied`. For example, call `applyPatches` with the leg in hand (`expectedVersion` = resolved base) plus the step. If the step id exists, the server returns `already-applied`; otherwise it refuses with a real conflict. Alternatively, check `undoStepExists(stepId)` first (follow-up #15) and return success when it exists.

### WR-03: Category merge of exactly 6000 rows always fails (off-by-one)

**Files:** `src/data/mutations/categories.ts:197-218`, `src/db/transactions.ts:384`, `src/data/queries/categories.ts:83-84`

**Issue:** The guard is `rows.length > MERGE_LIMIT` (6000), but the op list is `rows` plus 1 category op. With 6000 rows that is 6001 ops:
- `buildStep` throws `RangeError` (`MAX_UNDO_OPS = 6000`, `src/engine/undo/inverse.ts:216`), which classifies as `rejected` with code `''`;
- the server's `n > 6000` check would also reject it.

`useCategoryUsage` reports 6000 as not capped, so the UI offers a merge that can never succeed.

**Failure scenario:** A category with exactly 6000 active lines, or anywhere from 5,999 to 6,000 once concurrent adds are counted, shows "Merge". The merge queues, fails at flush, and leaves a failed-writes entry with an empty code. The optimistic archive is then refetched away.

`categories.test.tsx:244` tests only 6001.

**Fix:** Use `if (rows.length > MERGE_LIMIT - 1)`, or keep a separate `MERGE_ROWS_MAX = 5999` so that rows + 1 ≤ 6000. Apply the same bound in `useCategoryUsage` (`capped: total > MERGE_ROWS_MAX`), and add a test at exactly 6000 rows.

### WR-04: Bulk delete checks the 6000 limit before partner-leg expansion

**File:** `src/data/mutations/patches.ts:184, 255-258`

**Issue:** `apply()` checks `items.length > BULK_MAX` on the selection. `partnerDeleteItems` then adds up to one more op per unpaired transfer leg at flush time. Nothing re-checks the size, so `buildStep` throws a `RangeError` (rejected, code `''`) once the total passes 6000.

**Failure scenario:** The user selects 4,000 rows, 2,500 of which are single transfer legs whose partners are in other months. `apply()` accepts, but at flush there are 6,500 ops. The whole delete is parked as a rejected failed write with no explanation. The optimistic removal is reverted by the refetch, after the user has already been shown "Deleted 4000 lines".

**Fix:** In `useBulkDelete`, count `expandTransferIds.length` toward the limit (selection + unpaired legs ≤ 6000) and refuse up front. In the mutationFn, check `items.length > BULK_MAX` after expansion and throw a `DbError(..., 'bulk-too-large')` so the failed write carries a meaningful code.

### WR-05: Category merge leaves recurring series templates on the archived source

**File:** `src/data/mutations/categories.ts:200-215`

**Issue:** The merge moves only active `transactions` rows. `recurring_series.category_id` is never patched. `materialise_series` copies `s.category_id` into each new occurrence (`20260926000400_recurring_materialisation.sql:104-110`).

**Failure scenario:** The user merges "Streaming" into "Subscriptions". Netflix's series still points to "Streaming", so next month's generated pending row is filed under an archived category. That category is hidden from pickers and from category totals, so the bill silently drops out of "Subscriptions". This defeats D-36's "merge its transactions into another category".

**Fix:** In the mutationFn, also fetch the live `recurring_series` rows in the household where `category_id = source`. Add ops `{entity:'recurring_series', id, expectedVersion: version, before:{category_id: source}, patch:{category_id: target}}` to the same atomic `apply_patches` call; `category_id` is already in the allowlist. Count these ops against the 6000 limit (WR-03).

### WR-06: Offline or failed usage read auto-archives an in-use category without offering merge

**Files:** `src/data/queries/categories.ts:83-84`; consumer `src/features/record/categories/RemoveCategoryPrompt.tsx:48-63`

**Issue:** `count` is `query.data ?? 0`, and the hook exposes only `isLoading`. In TanStack v5, `isLoading` is `isPending && isFetching`. So it is false in both of these cases:
- **Offline:** the fetch is paused (`fetchStatus: 'paused'`).
- **Fetch error:** after retries the status is `error`.

In both cases the hook returns `{count: 0, capped: false, isLoading: false}`, and `RemoveCategoryPrompt` treats that as "settled unused" and auto-archives.

**Failure scenario:** The user is offline, opens Categories, and taps remove on "Groceries" (hundreds of lines). The category is archived immediately and the merge choice D-36 requires is never shown. The user's lines stay on a now-hidden category. It is recoverable through undo or restore, but the user never chose it.

**Fix:**
- Return `count: query.data ?? null` and `status: query.status`.
- Treat the count as settled only when `query.isSuccess`. When `isError` or the fetch is paused, show the merge-or-archive choice, or an "unavailable offline" note.
- Optionally nest the key under `queryKeys.categories(ownerId)` or the transactions root so merges and imports invalidate it (see IN-01).

### WR-07: Home-currency default can overwrite a real choice when the profile read fails, and the write is unconditional

**Files:** `src/features/record/useDeviceHomeCurrencyDefault.tsx:36, 43-65`; `src/data/queries/moneyPrefs.ts:27`

**Issue:**
- **Error fallback looks like the default.** `useMoneyPrefs` returns `DEFAULT_MONEY_PREFS` (`home_currency: 'USD'`) whenever `query.data` is undefined, including after a fetch error, with `loading: false`. The hook's `ready` gate checks `!prefsLoading` but not success. A failed profile read is therefore indistinguishable from "still on the server default".
- **The write is unconditional.** `setHomeCurrency(target)` is a plain patch, with no expected value on the server.

**Failure scenario:**
1. The user picked EUR on device A, before or without creating an account.
2. They sign in on device B (Canadian locale).
3. The profile query fails after its retries (5xx or timeout), while the accounts query succeeds with `[]`.
4. The hook sees `home_currency === 'USD'` and no accounts, writes CAD over the user's EUR, and sets the once-only flag.

The same happens if EUR was chosen on device A between device B's read and its write. This breaks the 02-31 invariant "an explicit non-USD choice is never overwritten".

The test file mocks `useMoneyPrefs` as `{prefs, loading}` and has no prefs-error case (it does have an accounts-error case).

**Fix:**
- Expose `isSuccess`/`isError` from `useMoneyPrefs`, and require a successful, fetched-after-mount prefs read in `ready`. Do not set the flag when prefs errored.
- Make the write conditional on the server, for example a small RPC or PostgREST filter: `update profiles set home_currency = $target where id = auth.uid() and home_currency = 'USD'`. A concurrent explicit choice then always wins.
- Add a test for the prefs-error case.

### WR-08: `create_recurring_series` trusts `p_anchor_is_new` and records `anchor_created` even when the anchor was not linked

**File:** `supabase/migrations/20260926000400_recurring_materialisation.sql:263-284, 303-306` (inverse in `20260926000500_undo_log.sql:587-604`)

**Issue:**
- **Dedup case.** The link CTE dedupes candidates `distinct on (local_date) order by local_date, id`. If `p_link_transaction_ids` contains another row on the anchor's date with a smaller uuid, that row is linked and the anchor is not. `v_anchor_created` is still set from `p_anchor_transaction_id`, so the recorded undo step soft-deletes a row the action never linked or created. That contradicts the stated guarantee in test 37's header ("the flag cannot be used to soft-delete a row it did not link"); test 37 only covers the no-anchor case.
- **Unverified flag.** Nothing verifies that the anchor is new. Any caller can pass `true` for a years-old row, and the series' undo then deletes that row. This is within the caller's own household, so it is not a privilege escalation, but the server is the trust boundary for undo semantics. The D-24 amendment says making an existing entry repeat must leave the entry alone.

**Fix:**
```sql
if coalesce(p_anchor_is_new, false) then
  -- only an anchor this call actually linked, and only one that was untouched before it
  if v_anchor_txn.version <> 1 or v_anchor_txn.created_by is distinct from (select auth.uid()) then
    raise exception 'anchor % is not new', p_anchor_transaction_id using errcode = '22023';
  end if;
  select jsonb_build_object('id', t.id, 'version', t.version) into v_anchor_created
    from public.transactions t
   where t.id = p_anchor_transaction_id
     and exists (select 1 from jsonb_array_elements(v_linked) l where (l ->> 'id')::uuid = t.id);
end if;
```
Add pgTAP cases for a non-new anchor and for the anchor dedup collision.

Note on the version check: `TransactionSheet` only queues `add` immediately before `createSeries`. `followUpIfRatePending` restamps under `system_restamp`, which does not bump the version, so `version = 1` holds for a genuine new anchor. This should be confirmed with the pgTAP case.

## Info

### IN-01: `useCategoryUsage` key sits outside every invalidated prefix

**File:** `src/data/queries/categories.ts:79`

The key `['categories','usage',householdId,categoryId]` is not under `queryKeys.categories(ownerId)` (`['categories', ownerId]`) or the transactions root, so merges, imports, bulk deletes and undo never invalidate it. A remount refetches it (staleTime 0), but a persisted copy can be shown stale first. Move the key into `queryKeys` under `transactionsRoot(householdId)`, for example `['transactions', householdId, 'category-usage', categoryId]`.

### IN-02: Region map leaves several euro users on USD

**File:** `src/engine/money/regionCurrency.ts:88-100`

The 21 EU eurozone members are correct as of 2026, including BG and HR. Non-EU states that use the euro are missing: ME, XK, AD, MC, SM and VA. Common regions such as RU, LI (CHF) and BA are also missing. Users in these regions keep USD, which is a silent wrong default but not data loss. Consider adding them, filtered by the offered currencies as today.

### IN-03: Transfer delete accepts the partner's current version, so a concurrent partner edit is deleted silently

**File:** `src/data/mutations/transfers.ts:268-275`

Only the leg in hand carries the user's observed version. The partner's `expectedVersion` is whatever is live at flush, so an edit to the partner by another member or device after the user looked is deleted without a D-26-style refusal. This is defensible because the user asked to delete the pair, but it differs from `useEditTransfer`, which checks both legs' observed versions. If this is intended, document it. Otherwise pass both legs' versions when the UI has both.

### IN-04 (outside listed scope, uncertain): Import pay-match patches `original_amount` without comparing currency

**File:** `src/features/record/import/importPipeline.ts:496-506`

`markPaid.patch` sets `original_amount: c.amount` on the pending row but never `original_currency`, and `ExistingInfo` has no currency to compare against. If a mapped currency column (D-12) gives a line in a currency other than the pending occurrence's, the occurrence would be marked paid with a foreign-currency minor-unit amount under its own currency. Whether `matchPendingPayments`' candidate set already filters by currency was not verified. Add `original_currency` to `ExistingInfo` and refuse the pay-match (fall back to an ordinary insert) on a mismatch.

## Checked and clean

- `undo.ts`: refusal is an outcome, not a throw. Failed-write records hold only ids. Undo and rollback share `WRITE_SCOPE`.
- `patches.ts`: dedup happens before both the size check and `planBulkPatch`. `recordWrittenVersion` uses the original and resolved bases.
- `accounts.ts`: undo capture runs after server success, and the replay path re-records with the same step id, which is idempotent. `before` is read from the cache only for patched keys. The limit validation uses `Number.isSafeInteger`, so there are no floats.
- `recurringSeries.ts` (data and db): the step id is minted once, `p_anchor_is_new` is sent only when true, and `already-applied` records nothing.
- SQL: the series replay check runs before the flag validation, so a replay returns `already-applied` without re-running anything. `series_change_inverse` emits one op per row (the anchor is excluded from the unlinks) and is unchanged when the flag is false. The grants were updated, and both migrations were edited before the 02-31 production push (see `02-31-SUMMARY.md`), so the in-place edit never diverged from what production applied.
- `appHome.ts`, `getDeviceRegion`: precedence is override > device region > time zone, with no IP lookup.
- PII: series failed writes carry name, freq and anchor_date but no amount. Transfer failed writes carry ids only. Category failed writes carry the user's category name, which is the D-19 "attempted value" exception, stored encrypted on the device.

---

_Reviewed: 2026-10-07_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
