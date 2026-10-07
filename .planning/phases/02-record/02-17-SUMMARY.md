---
phase: 02-record
plan: 17
subsystem: data-layer
tags: [categories, accounts, undo, write-queue, merge]
requires: [02-12, 02-14, 02-16]
provides: [registerCategoryMutations, useAddCategory, useEditCategory, useArchiveCategory, useMergeCategory, useCategoryUsage, account undo capture]
key-files:
  created:
    - src/data/mutations/categories.ts
    - src/data/mutations/__tests__/categories.test.tsx
    - src/data/mutations/__tests__/accountsUndo.test.tsx
  modified:
    - src/data/mutations/accounts.ts
    - src/data/mutations/index.ts
    - src/data/keys.ts
    - src/data/queries/categories.ts
requirements: [REC-07, REC-08, REC-11, REC-17]
metrics:
  tasks: 2
  completed: 2026-10-06
---

# Phase 2 Plan 17: Category mutations and account undo capture Summary

Category add/edit/archive/restore/merge run through the one write queue, each as a single undo step (merge is one atomic `apply_patches` carrying its `categoryMerged` step), and account add/edit now record undo steps and carry overdraft/credit limits with negative opening balances accepted.

## Tasks

| Task | Commit |
|------|--------|
| 1 Category mutations + usage query | 292e4ac (fix ce6e0a2) |
| 2 Account add/edit undo capture | 35d90dc |

## Behaviour

- Add/edit/archive/restore: single-row writes; step recorded via `recordUndoStepSafely` after the write succeeds. System categories throw TypeError before mutate; built-ins are editable.
- Merge: ids fetched at flush time, more than 6000 rows throws `DbError('merge-too-large')` which classifies as rejected (default branch) and is recorded as a failed write. Conflicts record a failed write and show a refusal toast. Source is archived optimistically.
- `useCategoryUsage` returns `{count, capped, isLoading}`.
- Accounts: `add(input, undo?)`, `edit(vars, undo?)`. Limits must be null or a non-negative safe integer (RangeError otherwise).

## Review follow-ups applied

- Item 2: merge sends `p_undo_step` with its `applyPatches` call.
- Item 3: every op carries a resolved positive `expectedVersion`.
- Item 6: merge items are unique by construction (source category plus distinct transaction ids).
- Item 14: `registerCategoryMutations` registered in `index.ts` after the 02-16/02-40 registrations, order untouched; `mergeCategory` key added.
- Item 7 style: `edit` on accounts returns false when no honest before-state exists (account not cached) and sends without a step.

## Deviations from Plan

1. **[Process] TDD order.** Task 1 code was written before its tests, so there was no RED run for it; its tests were only run GREEN (one test expectation was wrong: inverse ops expect the post-write version, fixed in the test). Task 2 had a genuine RED run (8 of 10 failing) before the GREEN code.
2. **[Rule 1] Hook signature.** `useEditAccount().edit` now returns `boolean` (was `void`) to follow the C-WR-05 convention. Existing callers ignore the return, so they still compile.
3. `useAddAccount`/`useEditAccount` take `{stepId, ownerId}` as the optional second parameter (plan said `Omit<UndoCapture,'labelKey'|'labelParams'>`, which is the same shape); the label is fixed per action.
4. Category hooks mint step ids themselves (`newStepId`) and return them (add returns `{id, stepId}`), matching the interface in the plan.

## Verification

`npx jest src/data` 309/309 passing (23 suites), `npm run typecheck`, `npm run depcruise` and eslint on touched files all clean.

## Known Stubs

None.

## Self-Check: PASSED
