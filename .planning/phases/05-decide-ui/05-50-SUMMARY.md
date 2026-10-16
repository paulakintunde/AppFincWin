---
phase: 05-decide-ui
plan: 50
subsystem: ui
tags: [record, one-off, transaction-sheet]
requires: [05-31 copy, 05-34 one_off data layer]
provides: [One-off toggle in TransactionSheet (add and edit), one_off patch diff, One-off detail row]
key-files:
  modified:
    - src/features/record/entry/transactionForm.ts
    - src/features/record/entry/TransactionSheet.tsx
    - src/features/record/entry/listForm.ts
    - src/features/record/activity/detailRows.ts
    - src/features/record/entry/__tests__/transactionForm.test.ts
    - src/features/record/entry/__tests__/TransactionSheet.test.tsx
    - src/features/record/activity/__tests__/detailRows.test.ts
    - src/features/record/entry/__tests__/draftForm.test.ts
    - src/features/record/entry/__tests__/formDirty.test.ts
requirements-partial: [DCU-03, DCU-16]
metrics:
  tasks: 2
  completed: 2026-10-16
---

# Phase 5 Plan 50: Record one-off toggle Summary

One-off toggle (D-29) in the Record entry sheet, saved through the add input and a minimal one-key edit patch, plus a "One-off" row on the line detail.

## Commits
- d0a876a: feat(05-50): form state, sheet toggle, detail row, tests (both tasks in one commit, shared files)

## Deviations
- Fixture-only edits: `oneOff: false` added to `listForm.ts` (list items do not carry the flag, so list-mode entries never send it) and to the draftForm/formDirty test fixtures because `FormState.oneOff` is required.
- Repeats exclusion is enforced in the sheet (setting Repeats clears oneOff and hides the toggle) since `toAddInput` does not know repeats; transfer exclusion is in the form helpers.
- Detail test asserts the i18n key because that suite stubs `t` as identity.
- Drafts do not persist oneOff (restored drafts open with it off).

## Verification
Record jest 1269 pass; typecheck clean; lint 0 errors; depcruise clean. No engine edits; no migrations.

## Human/device items
None.

## Self-Check: PASSED
