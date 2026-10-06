---
phase: 02-record
plan: 20
subsystem: ui
tags: [react-native, transaction-entry, transfers, undo, datetimepicker]
requires: [02-14, 02-15, 02-19, 02-37, 02-40]
provides:
  - TransactionSheet (expense, income, transfer; add, edit, delete)
  - pure form logic (transactionForm.ts)
  - Category/Account/Option pickers and DateField
affects: [02-21, 02-22]
tech-stack:
  added: ["@react-native-community/datetimepicker 9.1.0"]
key-files:
  created:
    - src/features/record/entry/transactionForm.ts
    - src/features/record/entry/TransactionSheet.tsx
    - src/features/record/entry/pickers/CategoryPicker.tsx
    - src/features/record/entry/pickers/AccountPicker.tsx
    - src/features/record/entry/pickers/OptionPicker.tsx
    - src/features/record/entry/pickers/DateField.tsx
    - src/features/record/entry/__tests__/transactionForm.test.ts
    - src/features/record/entry/__tests__/TransactionSheet.test.tsx
  modified:
    - package.json
    - package-lock.json
    - src/ui/AmountDisplay.tsx
requirements-completed: [REC-01, REC-02, REC-03, REC-04, ANL-05, REC-18]
duration: n/a
completed: 2026-10-06
---

# Phase 2 Plan 20: Transaction entry sheet Summary

One sheet adds, edits and deletes expenses, income and transfers, with strict region-aware amount parsing, a queued undo step and Undo toast on every write, and the consent-gated `transaction_added` event.

## Commits
- 38d57dc test: failing form-logic tests (RED)
- 687a66d feat: pure form logic and datetimepicker dependency (GREEN)
- 485cb4b test: failing sheet tests (RED)
- 6bc9fda feat: TransactionSheet and pickers, AmountDisplay inkDim tone (GREEN)
- 740fc1e test: failing transfer tests (RED)
- a16d558 feat: transfer type (new, edit-both, delete-both) (GREEN)

## Review follow-ups applied
- Item 13: the `Sheet` now carries `accessibilityLabel` equal to the live title; `AmountDisplay` gained a `dim` tone (inkDim, existing token). Contrast of inkDim `#5C5A50` was not measured numerically here.
- Item 4: edits use `useEditTransfer`, which already handles the `{ ok, patches } | { ok: false, error }` result.
- Item 7: a `null` step id never offers Undo: transfer edits with no change show no toast; plain edits pass `stepId: null` when `edit()` reports no step recorded. Delete of a plain row passes the hook's possibly-null step id straight through.
- Item 3/2: uses the 02-15/02-40 hooks, which supply the version and undo step.

## Deviations from Plan
- **[Rule 3] Datetimepicker config plugin not added** to `app.config.ts` (the install prints a suggestion). It only themes the native picker; the module autolinks. A new dev build is still required.
- **[Rule 1] Same-currency transfer edit:** a stale `amountInText` made a valid edit fail `transferAmountsMatch`. The pair state now leaves it empty when currencies match, and account changes drop it.
- **Extra pure helpers** `withAccount`, `withToAccount`, and an optional `FormContext.accountCurrency` so a preselected account brings its own currency.
- **Zero amounts are refused** in validation (the database rejects 0 anyway).
- The Transfer chip shows only in new mode; opening an existing transfer edits the pair (D-51).
- A new transfer's Add button is disabled until the system Transfer category has loaded (the hook would throw otherwise).
- RNTL 14 has async `render`/`fireEvent`; tests await both and use one render per test (known act() leak, as in recordPrimitives.test.tsx).

## Known Stubs
None. The recurring-controls slot is an intentional comment for 02-21.

## Notes for device testing
Native module added: a fresh development build is needed before the date picker works on device (record in 02-31 checkpoint).

## Verification
`npx jest src/features/record/entry src/ui` green (37 entry tests); `npm run typecheck`, `npm run depcruise`, `npx eslint` on touched paths clean.

## Self-Check: PASSED
