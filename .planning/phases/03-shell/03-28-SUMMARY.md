---
phase: 03-shell
plan: 28
subsystem: record/entry
tags: [draft, entry-sheet, gap-closure]
requires: ["03-26"]
provides: ["draft restore keeps repeats, origin, received amount", "edit-mode guess gate", "keepForm merge"]
key-files:
  modified:
    - src/features/record/entry/draftForm.ts
    - src/features/record/entry/TransactionSheet.tsx
    - src/features/record/entry/useEntryList.ts
    - src/features/record/entry/__tests__/draftForm.test.ts
    - src/features/record/entry/__tests__/TransactionSheet.draft.test.tsx
    - src/features/record/entry/__tests__/TransactionSheet.suggest.test.tsx
    - src/features/record/entry/__tests__/useEntryList.test.tsx
metrics:
  completed: 2026-10-14
---

# Phase 3 Plan 28: Entry-sheet draft restore and edit guard Summary

Draft round trip now carries Repeats, validated currencies and status; restore re-applies direction invariants, marks a restored category as picked and a restored received amount as manual; untouched edits never guess a category; keepForm merges with an unresolved stored draft. Closes T-03-24-02 (OT-03), H1 b/c, H2, H4, L5.

## Commits
- 4678ee9: draftForm carries repeats and validates currency/toCurrency/status (Task 1)
- Task 2 commit (see git log): TransactionSheet restore + edit-guess gate, useEntryList keepForm merge

## Changes
- `toDraftForm(state, repeats)` / `fromDraftForm(form, ctx)` returning `{ patch, repeats }`; unfinished counts stored as never-ending; transfers store no repeat.
- `onRestoreForm`: skips when the live form has content (L5), applies `withDirection`, sets origin/amountInManual/repeats.
- Guess effect skips when mode is not new and the name is unchanged from opening (H2).
- `keepForm` merges with the stored draft while unresolved, respecting LIST_CAP_PER_TYPE.

## Deviations from Plan
- Test for H1c needed an EUR account and EUR currency option added to the draft test file mocks.
- The H2 test asserts no "Discard changes?" and no suggestion after a backdrop press; it does not assert the Save payload.
- Used an inline account-currency lookup in onRestoreForm because `FormContext.accountCurrency` is optional in its type.
- The pending-resume test in useEntryList was rewritten to the new merge behaviour (old no-op behaviour is intentionally replaced).

## Verification
tsc clean except the known environmental expo-blur error; eslint 0 errors; `jest src/features/record` 1092 passed; depcruise clean.

## Self-Check: PASSED
