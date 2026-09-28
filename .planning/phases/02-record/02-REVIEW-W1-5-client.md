---
phase: 02-record
scope: waves 1-5, area C (client data layer, state, UI primitives, copy, analytics)
reviewed: 2026-09-28T00:00:00Z
depth: deep
base: 6273bbc
files_reviewed: 38
files_reviewed_list:
  - jest.config.js
  - package.json
  - src/data/keys.ts
  - src/data/cache/persister.ts
  - src/data/mutations/accounts.ts
  - src/data/mutations/importFinalize.ts
  - src/data/mutations/index.ts
  - src/data/mutations/transactions.ts
  - src/data/mutations/undoCapture.ts
  - src/data/queries/activity.ts
  - src/data/queries/categories.ts
  - src/data/queries/homeAmount.ts
  - src/data/queries/recurringSeries.ts
  - src/data/queries/undoLog.ts
  - src/features/record/categoryName.ts
  - src/features/record/useRecordContext.ts
  - src/i18n/copyStatus.ts
  - src/i18n/locales/en.ts
  - src/services/analytics/catalogue.ts
  - src/services/analytics/__tests__/catalogue.typecheck.ts
  - src/state/undoToast.ts
  - src/theme/layout.ts
  - src/theme/tokens.ts
  - src/theme/typography.ts
  - src/ui/AmountDisplay.tsx
  - src/ui/CategoryGlyph.tsx
  - src/ui/Chip.tsx
  - src/ui/ConfirmSheet.tsx
  - src/ui/EmptyState.tsx
  - src/ui/Pill.tsx
  - src/ui/Row.tsx
  - src/ui/Sheet.tsx
  - src/ui/SheetHeader.tsx
  - src/ui/SwatchDot.tsx
  - src/ui/ToastView.tsx
  - src/data/__tests__/offlineWrite.test.tsx (tests, read for coverage)
  - src/data/mutations/__tests__/{transactions,importFinalize,undoCapture}.test.tsx (tests, read for coverage)
  - src/ui/__tests__/recordPrimitives.test.tsx (tests, read for coverage)
findings:
  critical: 2
  warning: 9
  info: 6
  total: 17
status: issues_found
---

# Phase 2: Code Review Report (waves 1-5, area C: client)

**Reviewed:** 2026-09-28
**Depth:** deep (call chains traced into `src/db/*`, `src/engine/undo`, `apply_patches` / `account_balances` SQL, TanStack Query v5 semantics, i18next 26 behaviour)
**Files Reviewed:** 38
**Status:** issues_found

## Summary

The core write-queue plumbing is sound. Every Phase 2 mutation that is actually used (`addTransaction`, `editTransaction`, `importChunk`, `importFinalize`, `recordUndoStep`, accounts) is registered through `setMutationDefaults` at module scope before the persister restores, and they all share `WRITE_SCOPE`. No registered key is a prefix of another. Chunk inserts are idempotent (`upsert ... ignoreDuplicates`). The undo step is recorded inside the forward `mutationFn` after the server write succeeds, and a duplicate step id resolves as success, so a replay does not record the step twice. Money in this layer stays in integer minor units, with BigInt for the pending sums. Analytics events carry only banded or enum values, so no PII leaks through them. I found no "advice", "recommendation" or "you should" copy.

The defects cluster in four places:

1. **The import finalize is all-or-nothing, and nothing guards it** (CR-01). A single conflict, or a chunk that failed earlier, silently drops every mark-paid statement line. The failed-write record keeps only counts, so the dropped lines cannot be recovered.
2. **Replay paths that are not idempotent.** A soft-delete replayed after a restart is misread as a conflict (WR-01). A finalize retried after a committed-but-lost response always conflicts (WR-02).
3. **Cache correctness.** An optimistic add, and the resolve-rate follow-up, write fabricated one-row or empty month lists into months that were never loaded (WR-03). Writes never invalidate balances, the month list or search (WR-04).
4. **Accessibility of the one undo affordance.** VoiceOver cannot reach the toast's Undo button on iOS (CR-02).

## Critical Issues

### CR-01: Import finalize fails as a whole on any conflict and silently loses mark-paid statement lines; chunk failures are not checked first

**File:** `src/data/mutations/importFinalize.ts:135-168, 196-208, 220-241`

**Issue:** `useImportCommit.commit` queues the chunk mutations and then the finalize mutation unconditionally, in the same scope. The finalize sends every link, mark-paid and limit op plus the undo step in one `apply_patches` call, and `apply_patches` refuses the whole batch on the first conflict. Two paths lead there:

- **A chunk failed earlier.** A chunk can be permanently rejected (`importChunk` `onError` handles `rejected`/`not-found`), or be parked after bounded 5xx retries ("parked as failed so the queue moves on", WR-A02). The scope then moves on and the finalize still runs. If any accepted link names an imported row from that chunk, `apply_patches` returns `conflict` with reason `not-found`, because the missing-row skip at `20260926000500_undo_log.sql:223` only covers `deleted_at`/`archived_at` = `$now` patches.
- **A household member edits something first.** They edit the stored transfer leg, a pending bill, or the account between preview and commit (the D-26 case the tests cover at `importFinalize.test.tsx:292`).

In both cases **none** of the following happen:
- no links are made
- no pending bill is marked paid
- no limit is set
- no undo step is recorded

Mark-paid lines are never inserted as rows (D-55: "a mark-paid match's row is never inserted"). So a statement line the user accepted as "this pays the pending X bill" disappears from the record entirely. `recordFailedWrite` stores `{ links, markPaid }` counts only, so the failed-writes list cannot restore it. The rows that were inserted are also left with no undo step, which breaks REC-13's "Imported N lines" undo.

**Failure scenario:** The user imports a 40-line statement, accepts 2 pay-matches and 1 transfer link, and taps Import. Meanwhile a partner marks one of those pending bills paid by hand on their phone (version 2 to 3). The finalize conflicts. 38 rows land with no undo step. The 2 pay-match lines exist nowhere, and the pending bill the user matched stays pending. The only trace is a "version conflict" entry carrying counts.

**Fix:**
- Make the finalize degrade instead of all-or-nothing.
  - Before `applyPatches`, confirm the chunk rows exist, for example with a `select id from transactions where import_batch_id = $batch`, or by tracking chunk outcomes in a module map keyed by `batchId`.
  - Drop link ops whose imported id is missing.
  - On a `VersionConflictError`, retry once without the conflicting item. At minimum, always record the insert-inverse undo step for the rows that did land.
- On a mark-paid conflict, insert the matched statement line as an ordinary paid row instead of dropping it. Record enough in `attempted` (ids plus the `NewTransaction` payloads) to re-offer it.
- Add tests for: a rejected chunk followed by the finalize; and a conflict on one `markPaid` item that still leaves the line recorded and an undo step written.

### CR-02: ToastView groups its children into one accessibility element, so VoiceOver cannot reach Undo or Dismiss on iOS

**File:** `src/ui/ToastView.tsx:28-33`

**Issue:** The container is `accessible` with `accessibilityRole="alert"`. On iOS, an `accessible` view becomes a single accessibility element and its descendants stop being individually focusable. The nested `Pressable`s for Undo and Dismiss therefore cannot be reached or activated with VoiceOver.

A second problem: `accessibilityLiveRegion` is Android-only, so on iOS the toast is not announced when it appears either.

This toast is the only undo affordance for deletes, bulk deletes and imports (D-31). The test at `recordPrimitives.test.tsx:220` asserts the role and live region, which pins the broken structure rather than catching it.

**Failure scenario:** A VoiceOver user deletes a transaction. The toast appears but nothing is announced. Swiping lands on one element reading the message, with no Undo action, and the toast times out after 6 s. The delete cannot be undone from the toast.

**Fix:** Do not make the container `accessible`. Make only the message `Text` the alert element, and announce on mount for iOS:

```tsx
<View style={...}>
  <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={...}>{message}</Text>
  {/* Undo / Dismiss Pressables remain separate focusable elements */}
</View>
// in the host or an effect: AccessibilityInfo.announceForAccessibility(message) on iOS
```

Also consider pausing the auto-dismiss while a screen reader is running (`AccessibilityInfo.isScreenReaderEnabled`), since 3.2 s and 6 s are short for Undo under WCAG 2.2.1.

## Warnings

### WR-01: A soft-delete replayed after a restart is misclassified as a conflict (timestamp format mismatch in acceptIfAlreadyApplied)

**File:** `src/data/mutations/transactions.ts:648` (sends `deleted_at: new Date().toISOString()`) with `src/data/mutations/cacheRows.ts:14`

**Issue:** WR-A13's replay safety depends on `acceptIfAlreadyApplied` matching `server[k] === patch[k]` exactly. The delete patch sends `"2026-09-28T10:00:00.123Z"`. PostgREST serialises `timestamptz` as `"2026-09-28T10:00:00.123+00:00"` and trims trailing fractional zeros. The strings never match.

**Failure scenario:** The user deletes a row and the app is killed while the request is in flight, after the server commits. On restart, `resumeRestoredMutations` replays the edit. The server row is now at version 2, so `updateTransaction` throws `VersionConflictError`, and `acceptIfAlreadyApplied` rethrows. The mutation settles as a `conflict`:
- `recordFailedWrite` surfaces a "changed elsewhere" failed write for the user's own successful delete
- the undo step is never recorded, so the delete cannot be undone

**Fix:** Send the server-side sentinel instead of a client clock value (`apply_patches` already understands `'$now'`), or compare timestamp-typed keys by instant:

```ts
const same = (a: unknown, b: unknown) =>
  a === b || (typeof a === 'string' && typeof b === 'string' && !Number.isNaN(Date.parse(a)) && Date.parse(a) === Date.parse(b));
```

Add a replay test in which the server row's `deleted_at` is in `+00:00` form.

### WR-02: A finalize retried after a committed-but-lost response always conflicts

**File:** `src/data/mutations/importFinalize.ts:152-167`

**Issue:** `apply_patches` makes only the undo-step insert idempotent (`on conflict (id) do nothing`). It never checks whether this step id has already been applied. The first attempt can commit (imported link rows become version 2, pending bills and stored legs are bumped) and then lose its response to a timeout or an app kill. The retry still sends `expectedVersion: 1` and the original stored versions, because `recordWrittenVersion` only runs on success. It conflicts every time.

**Failure scenario:** An import finalize completes on the server just as the network drops. The retry reports "version-conflict". `onError` records a failed write and invalidates, so the user sees a failed import that actually succeeded.

**Fix:** Check at the start of the finalize whether `undo_log` already holds `vars.stepId`. For example, try `insertUndoStep`-style detection first, or add an `apply_patches` precheck that returns `applied` when `p_undo_step.id` already exists for `auth.uid()`. Treat that as success.

### WR-03: The optimistic add and the resolve-rate follow-up fabricate month lists for months that were never loaded

**File:** `src/data/mutations/transactions.ts:317, 321, 166` (all via `patchMonthCache`, which does `old ?? []`)

**Issue:** The module's own comment at lines 107-108 names this bug: "a one-row list would pass for the whole month (status success, fresh dataUpdatedAt) and show wrong totals". Despite that:

- `addTransaction` `onMutate` and `onSuccess` use the unguarded `patchMonthCache`. A backdated add (for example `localDate` in last March, never browsed) creates a `['transactions', hh, '2026-03']` entry containing only that row, with status `success` and a fresh `dataUpdatedAt`.
- `followUpIfRatePending` does `rows.map(...)` on `old ?? []`. For any unloaded month, that writes `[]` with status `success`. It runs for every rate-pending import chunk row (line 515) and for cross-month edits (line 396). It runs *after* the `invalidateQueries`, so the fabricated entry is not refetched.

With `staleTime: 60_000`, opening that month within a minute shows one row, or an empty month, as if complete. Offline, it stays that way indefinitely and is persisted: `shouldDehydrateQuery` falls back to `dataUpdatedAt` when there is no server-fetch record.

**Failure scenario:** The user imports a 3-month foreign-currency statement. The rows come back `rate_pending` and resolve-rate succeeds. July and August were never opened, so they are now cached as `[]`. The user opens July and sees "Nothing in July yet." with zero totals.

**Fix:** Use `patchMonthCacheIfLoaded` in all three places. For the add, also invalidate the month when it was not loaded.

```ts
// followUpIfRatePending
patchMonthCacheIfLoaded(qc, householdId, month, (rows) => rows.map(...));
```

### WR-04: Transaction writes never invalidate account balances, the month switcher or search results

**File:** `src/data/mutations/transactions.ts:319-325, 388-397`; readers at `src/data/queries/activity.ts:189-198, 203-218, 273-281`

**Issue:** The keys comment says "any transaction invalidation refreshes them too". But the add, edit, delete, mark-paid and skip success handlers only patch month caches. Only the conflict path, import chunks and finalize invalidate `transactionsRoot`.

`focusManager` is tied to `AppState`, so it does not fire on tab changes. The Accounts tab (a mounted screen) therefore keeps the pre-write balance and standing (REC-08/REC-17, "Overdrawn by ...") until the app is backgrounded. Search still lists a deleted row, and delete's `placeRowInMonth` never touches the search cache. A first transaction in a new month does not appear in the switcher.

**Failure scenario:** The user logs a 900.00 card spend. The Accounts screen still shows "Owing 100.00 of your 1,000.00 limit." rather than "over limit".

**Fix:** In each transaction `onSuccess`, and in `onError` for rollbacks, add:

```ts
void qc.invalidateQueries({ queryKey: queryKeys.accountBalances(hh) });
void qc.invalidateQueries({ queryKey: queryKeys.transactionMonths(hh) });
void qc.invalidateQueries({ queryKey: ['transactions', hh, 'search'] });
```

Do not await these. `WRITE_SCOPE` is held while `onSuccess` is awaited (the WR-A15 rationale).

### WR-05: A delete, mark-paid or skip whose row is not in the month cache silently gets no undo step, but still returns a stepId

**File:** `src/data/mutations/transactions.ts:610-619` with `637-700`

**Issue:** `useEditTransaction.edit` drops `undo` when the row is not in `transactionsMonth(vars.householdId, vars.month)`. `remove`, `markPaid` and `skip` still return a fresh `stepId`, which the caller hands to `showToast` as an undoable action. This is common for:
- deletes from cross-month search results (the month is not loaded)
- rows whose `local_date` month is not the cached key

For a delete the inverse does not need the cache at all: `before` is `{ deleted_at: null }`.

**Failure scenario:** The user searches "rent", deletes a hit from April, and taps Undo on the toast. It fails with `undo.notRecorded` ("That change can't be undone."), even though the inverse was trivially known.

**Fix:** Let the hooks pass an explicit `before`. For `remove`: `{ deleted_at: null }`. For skip: `{ status: row.status }`. For markPaid: `{ status, local_date, original_amount }` from the `row` argument. Have `edit` accept a caller-supplied `before`. Return `null` (not a stepId) when no step will be recorded, so the host never shows Undo for it.

### WR-06: Undo labels render the literal "{{name}}" for nameless rows

**File:** `src/data/mutations/transactions.ts:633-635`; `src/i18n/locales/en.ts:646, 649, 654`

**Issue:** `nameParams` returns `{}` when `row.name` is null. That covers Phase 1 rows, which predate the `name` column, plus transfers and some imports. The `undo.label.deleted`, `markedPaid` and `skipped` templates have no nameless variant. I verified against the pinned i18next 26.4.2: `t('Deleted · {{name}}', {})` returns `"Deleted · {{name}}"`, because `skipOnVariables` defaults to true. That raw placeholder text appears in the toast and on the History screen, which reads `label_params` from `undo_log`.

**Fix:** Add `deleted_unnamed: 'Deleted'` (and the matching mark-paid and skipped variants) and choose the key in `nameParams`. Alternatively, fall back to a translated noun: `labelParams: { name: row.name ?? t('undo.refusal.record.transactions') }`. The labelKey choice is the better fit, because `data/` never formats copy.

### WR-07: Bumping the cache buster discards the persisted offline write queue

**File:** `src/data/cache/persister.ts:22, 87-91`

**Issue:** `persistQueryClient` compares `buster` for the whole persisted client. On a mismatch it removes the blob, which contains the dehydrated **mutations** (`shouldDehydrateMutation: pending`) as well as the queries. Changing `CACHE_SCHEMA_VERSION` from `'1'` to `'2'` in this phase means any device upgrading with unsynced offline writes loses them, including their optimistic rows, with no failed-write record. That breaks SYN-02's "queued writes survive restart".

Severity is limited to Warning only because no build appears to have shipped yet. The mechanism will destroy data on the first post-launch shape change, including through an EAS Update OTA.

**Fix:** Persist mutations in a separate persister or key that has its own versioned migration, or never bump the query buster while mutations are pending. For example, on boot, read the old blob, pull out `mutations`, and re-hydrate them before discarding the queries. Add a test: a persisted blob with a pending mutation plus an old buster must still replay the mutation.

### WR-08: Row hides its value from screen readers when it is pressable

**File:** `src/ui/Row.tsx:44-48`

**Issue:** When `onPress` is set, the `Pressable` gets `accessibilityLabel={accessibilityLabel ?? label}`, which overrides the child text. The `value` (the selected category, account, date or payment type in every dense entry-sheet row) is therefore never announced. VoiceOver says "Category, button" with no current selection. UI-SPEC line 74 requires these rows to be labelled for a screen reader.

**Fix:** Default the label to include the value:

```tsx
accessibilityLabel={accessibilityLabel ?? (value ? `${label}, ${value}` : label)}
```

You can also use `accessibilityValue={{ text: value }}`.

### WR-09: useImportCommit never stamps import_batch_id onto the rows it inserts

**File:** `src/data/mutations/importFinalize.ts:225-232`; `src/data/mutations/transactions.ts:476`

**Issue:** The optimistic row uses `tx.import_batch_id ?? vars.batchId`, but `insertTransactionsBatch` sends `vars.rows` unchanged. A caller that builds `NewTransaction`s without `import_batch_id` (it is optional in the type) gets rows that show the batch optimistically and then lose it once the server row lands. Batch provenance (REC-14, dedupe by batch, History) silently depends on the UI layer remembering to set it. No caller exists yet (the UI comes in later waves), so this is a latent trap.

**Fix:** In `commit`, stamp before enqueueing: `const rows = input.rows.map((r) => ({ ...r, import_batch_id: input.batchId }));`.

## Info

### IN-01: A finalize with nothing to do throws inside mutationFn and is recorded as a failed write

**File:** `src/data/mutations/importFinalize.ts:146-148`

`commit` with `rows: []` and no items (every line de-duplicated away) calls `buildStep` with empty ops. That throws `RangeError`, which `classifyWriteError` reports as `rejected`, and a spurious "import:batch" failed write is recorded. Guard with an early return in `commit` when both `rows` and the finalize items are empty.

### IN-02: A very large link set can push the finalize past the 6000-op limits

**File:** `src/data/mutations/importFinalize.ts:87-131, 152-158`

The forward ops are `2*links + markPaid + limit` and the undo ops are `inserted + links + markPaid + limit`. Both are bounded server-side at 6000 (`MAX_UNDO_OPS`), and the importer allows 5,000 rows. Over roughly 3,000 links, the finalize throws or is rejected *after* all chunks are inserted, which is the same fallout as CR-01. Unlikely in practice. Cap the accepted suggestions in the preview.

### IN-03: The importChunk onMutate does not cancel in-flight month fetches

**File:** `src/data/mutations/transactions.ts:434-498`

Unlike add and edit, there is no `cancelQueries`, so a month refetch already in flight can overwrite the optimistic import rows until the chunk's success invalidation. The effect is cosmetic flicker only.

### IN-04: `markPaid`'s `adjust.amount` is typed `number`, not `MinorUnits`

**File:** `src/data/mutations/transactions.ts:658, 666`

A UI passing a major-unit or fractional value would reach the `bigint` column and be rejected (22P02) into the failed-writes list. Type it as `MinorUnits` so the money brand is enforced at the boundary.

### IN-05: CategoryGlyph is only hidden from Android accessibility

**File:** `src/ui/CategoryGlyph.tsx:27-28`

`importantForAccessibility="no-hide-descendants"` is Android-only. On iOS, the inner `Text` is still announced ("G") when the glyph sits in a non-pressable container. Add `accessibilityElementsHidden`. Similarly, `Sheet`'s container `accessibilityLabel` (`Sheet.tsx:39`) has no effect without `accessible`, and `AmountDisplay` has no tone for the UI-SPEC transfer figure (`inkDim`), so callers will be tempted to hard-code it.

### IN-06: Unused mutation keys and test gaps

**File:** `src/data/keys.ts:43-57`; tests

- **Unregistered keys:** `addCategory`, `editCategory`, `bulkPatch`, `createSeries`, `editSeriesFrom`, `endSeries`, `undoStep`, `rollbackUndo`, `addTransfer`, `editTransfer`, `deleteTransfer` and `saveImportProfile` have no `setMutationDefaults` registration yet. Any `useMutation({ mutationKey })` built on them before registration lands would throw "No mutationFn found", and after a restart it would sit restored but never resume. Each needs to be added to `registerMutationDefaults` when its wave lands.
- **No test covers:**
  - a persisted edit or delete that carries `undo` replaying after a restart and producing exactly one undo step (WR-01 would have been caught)
  - a chunk rejection followed by the finalize (CR-01)
  - optimistic adds into unloaded months (WR-03)
- **Pinned wrong behaviour:** `transactions.test.tsx:697` asserts the silent undo drop that WR-05 describes.
- **Uncertain:** if the undo-apply mutation (not in scope yet) is queued while the forward write's `recordUndoStepSafely` falls back to the queue, the queued undo-record lands *after* the undo-apply in `WRITE_SCOPE`. The apply would then find no step. Worth a test when `undoStep` is registered.

---

_Reviewed: 2026-09-28_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
