---
phase: 03-shell
plan: 24
subsystem: record/entry
tags: [entry-sheet, draft, dismissal, D-25, D-27, D-33]
requires: [03-05, 03-16, 03-18]
provides: [form-aware device draft, edit Discard changes? guard]
affects: [src/features/record/entry]
key-files:
  created:
    - src/features/record/entry/draftForm.ts
    - src/features/record/entry/formDirty.ts
    - src/features/record/entry/__tests__/draftForm.test.ts
    - src/features/record/entry/__tests__/formDirty.test.ts
    - src/features/record/entry/__tests__/TransactionSheet.draft.test.tsx
  modified:
    - src/features/record/entry/useEntryDraft.ts
    - src/features/record/entry/useEntryList.ts
    - src/features/record/entry/TransactionSheet.tsx
    - src/features/record/entry/__tests__/useEntryDraft.test.ts
    - src/features/record/entry/__tests__/useEntryList.test.tsx
requirements: [NAV-04]
metrics:
  tasks: 2
  completed: 2026-10-14
---

# Phase 3 Plan 24: Entry-sheet draft and edit guard Summary

New entries keep the half-typed form and list as one device draft on drag, back or backdrop dismissal (no prompt); edits of existing entries ask "Discard changes?" only when the form or repeats differ from how they opened; Cancel is unchanged.

## Commits
- 669dc19: draftForm/formDirty, form-aware useEntryDraft and useEntryList (keepForm, onRestoreForm, resumeCount counts form)
- 206679f: TransactionSheet wiring (onAccidentalDismiss for new, dirty prop for edit) and TransactionSheet.draft tests

## Decisions
- `loadEntryDraft` now returns `{ items, form }`; key name stays `entry-draft:v1:` (payload v2 only).
- Debounced list saves write form null; keepForm is a no-op while a resume answer is pending.
- Restored category ids are checked against non-archived loaded categories; payment types against the union of PAYMENT_TYPES; unknown ids become null (T-03-24-01).
- Edit dirtiness compares form (ignoring statusTouched) plus repeats, snapshotted with useState at mount (a ref read in render fails the react-hooks/refs lint).

## Deviations
- [Rule 1] Existing useEntryDraft test called `mockRestore()` on spies of the jest AsyncStorage mock, which breaks the mock for later tests; removed those calls (the rejections are `Once`).

## Verification
`npx jest src/features/record`: 71 suites, 1055 tests pass. eslint clean on changed files. `tsc` only reports the known environmental expo-blur error in TabBar.tsx.

## Self-Check: PASSED
