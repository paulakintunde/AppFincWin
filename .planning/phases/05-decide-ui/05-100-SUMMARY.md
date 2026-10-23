---
phase: 05-decide-ui
plan: 100
subsystem: record
tags: [record, entry, currency, D-93]
requires: [05-87]
provides:
  - FormContext.homeCurrency; new expense or income lines default to the home currency
affects: []
key-files:
  modified:
    - src/features/record/entry/transactionForm.ts
    - src/features/record/entry/TransactionSheet.tsx
    - src/features/record/entry/__tests__/transactionForm.test.ts
    - src/features/record/entry/__tests__/listForm.test.ts
    - src/features/record/entry/__tests__/TransactionSheet.test.tsx
decisions:
  - "A new transfer keeps its from-account currency; only a new expense or income uses the home currency"
  - "Empty homeCurrency falls back to the account currency"
requirements: [REC-01, REC-02, MON-04]
metrics:
  tasks: 1
  completed: 2026-10-23
---

# Phase 5 Plan 100: New-line currency defaults to home Summary

A new expense or income line opens in the home currency (a USD-home user with a GBP account sees USD); edit, edit-transfer, prefill and clone keep their stored currency, and transfer legs keep account currencies.

## Tasks

| Task | Commit | Notes |
|------|--------|-------|
| 1. Home currency default for new lines | 2a6fac26 | `FormContext.homeCurrency`, `initialFormState`, `TransactionSheet` passes `rc.homeCurrency`; named D-93 tests added |

## Verification

- `npx jest src/features/record/entry`: 335 passed.
- eslint on `src/features/record/entry`: 0 errors (5 pre-existing warnings in tests).
- typecheck: no errors in `src/features/record`; remaining errors are `formatMoneyA11y` in `src/features/decide/check/steps/__tests__/helpers/stepProps.tsx` (05-96 D-94 work, out of scope).
- Whole `src/features/record` run also showed 6 Activity suites failing with `useSegments is not a function` (expo-router mock), unrelated to this plan.

## Deviations from Plan

**1. [Rule 3 - Blocking] Existing tests asserted the old default**
- `TransactionSheet.test.tsx` FX-note test relied on a new line taking the EUR account's currency; it now picks EUR through the Currency control. `transactionForm.test.ts` and `listForm.test.ts` contexts gained `homeCurrency`.

## Open point for the user

Choosing a different account in the sheet (`withAccount`) still sets the line currency to that account's currency, so picking an account after opening switches a new expense away from home. The plan limited the change to `initialFormState`; say if the account picker should also keep the currency for expense/income.

## Device items

05-EXECUTION-NOTES "05-26 device checklist additions (Decide UX refresh)", entry 05-100: with USD home and a GBP account, Add expense opens in USD; the currency control still changes it; editing a GBP line shows GBP.

## Known Stubs

None.

## Self-Check: PASSED
