---
phase: 02-record
plan: 40
subsystem: data
tags: [transfers, mutations, undo, tanstack-query, offline-queue]
requires: ["02-11", "02-13", "02-15", "02-37"]
provides:
  - useAddTransfer, useEditTransfer, useDeleteTransfer, registerTransferMutations
affects: [02-20, 02-22]
key-files:
  created:
    - src/data/mutations/transfers.ts
    - src/data/mutations/transactionCache.ts
    - src/data/mutations/__tests__/transfers.test.tsx
  modified:
    - src/data/mutations/transactions.ts
requirements: [REC-18]
metrics:
  completed: 2026-10-06
  tasks: 2
---

# Phase 2 Plan 40: Transfer mutations Summary

Create, edit and delete a transfer pair as one atomic, queued, version-checked write and one undo step (REC-18, D-50, D-51).

## What was built

- `useAddTransfer`: `buildTransferLegs`, then both legs in one `insertTransactionsBatch` upsert sharing one `transfer_id`, filed under the Transfer category, status paid. One `transferAdded` step via `recordUndoStepSafely`. Both legs are optimistic and pending in loaded months. Failures roll both back and record `transfer:<id>` with `{ transfer_id }` only.
- `useEditTransfer`: `transferEditPatches` gives per-leg changed keys. One `apply_patches` call carries both legs' ops and the `transferEdited` step as `p_undo_step`. Expected versions are chain-resolved at flush. Returns `null` when nothing changed.
- `useDeleteTransfer`: either leg may be passed. The pair is read with `fetchTransferLegs` at flush, then both legs are soft-deleted in one `apply_patches` call with a `transferDeleted` step. Both legs leave every loaded month optimistically.
- Conflict, not-found and rejection handling: refetch, one failed-write entry (`transfer:<id>`, `{ transfer_id, action }`), and a refusal toast when the server names who changed the row.
- Defaults are registered through one line in `registerTransactionMutations`.

## Review follow-ups applied

- #4: `transferEditPatches` result is `{ ok, patches } | { ok: false, error }`. An error, including `date-mismatch`, throws `TypeError` before anything is queued.
- #2: every `applyPatches` call sends `p_undo_step`.
- #3: every op carries a positive integer `expectedVersion`, chain-resolved with `resolveExpectedVersion`.
- #16 client side: edit and delete refuse legs that lack a `transfer_id` or whose two `transfer_id`s differ. Nothing in this module ever writes `transfer_id` onto an existing row. The trigger-side check remains open.

## Deviations from Plan

**1. [Rule 3 - Blocking] Shared cache helpers extracted to `transactionCache.ts`.** The plan lists `placeRowInMonth`, `patchMonthCacheIfLoaded` and `followUpIfRatePending` as "existing helpers", but they were private to `transactions.ts`. `transactions.ts` imports `transfers.ts` for registration, so importing them back would be a cycle that depcruise `no-circular` rejects. They moved unchanged (now exported) into `transactionCache.ts`. `transactions.ts` imports them from there. This was a mechanical move with no behaviour change, and the existing `src/data` suite stays green. It is the only edit to `transactions.ts` beyond the registration line. `transactionCache.ts` is not in the plan's `files_modified`.

**2. [Follow-up wins] Replayed add returns no rows.** `insertTransactionsBatch` uses `ignoreDuplicates`, so a replay of an add that already landed returns `[]`. No honest versions exist then, so no undo step is built and nothing throws. The original attempt's step stands.

**3. Edit and delete do not call `recordUndoStepSafely`.** `apply_patches` records the step itself in the same transaction (follow-up #2). Add still records separately because a plain insert has no `p_undo_step`.

**4. Delete treats a pair that is not exactly two live rows as a conflict.** It throws a `VersionConflictError` with a null server row and sends no RPC. The version-conflict check applies to the leg in hand. The partner leg uses the version fetched at flush, as the plan specifies.

**5. Refusal toast** is shown through `showToast({ kind: 'refusal', refusal })` only when the server returned a named conflict. No new i18n copy was added (UI plan 02-28 owns it).

**TDD note:** RED was confirmed first (module not found). Task 1's GREEN was checked with `-t useAddTransfer`. Task 2's tests were already in the committed RED file and passed once the hooks were written, so there was no separate RED run for Task 2.

## Verification

- `npx jest src/data`: 19 suites, 267 tests pass (15 new in transfers.test.tsx).
- `npm run typecheck`, `npm run depcruise` and eslint on the touched files: clean.
- Grep gates: 1 `insertTransactionsBatch(`, 2 `applyPatches(`, 1 `fetchTransferLegs(`, 0 `convertMinor|crossRate`, 0 `.delete()`, 3 transfer label keys.

## Known Stubs

None.

## Commits

- ea1b8a2 test(02-40): failing tests
- (feat) useAddTransfer plus transactionCache extraction
- 77def57 useEditTransfer and useDeleteTransfer

## Self-Check: PASSED
