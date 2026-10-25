---
phase: 05-decide-ui
plan: 126
subsystem: decide-ui
tags: [housing-line, D-103, R18.4, DebtHousingSwitch]
requires: [05-121, 05-122, 05-124, 05-125, 05-131, 05-133]
provides: [sixth Lines row, housing editor with loan switches, DebtHousingSwitch, of-6 count, Housing rows in Every line and Assumptions]
key-files:
  created:
    - src/features/decide/home/DebtHousingSwitch.tsx
    - src/features/decide/home/housingShare.ts
    - src/features/decide/home/__tests__/DebtHousingSwitch.test.tsx
    - src/features/decide/check/sections/__tests__/AssumptionsSection.test.tsx
  modified:
    - src/features/decide/home/LinesCard.tsx
    - src/features/decide/home/LimitEditorSheet.tsx
    - src/features/decide/home/homeRowsModel.ts
    - src/features/decide/home/DecideHomeScreen.tsx
    - src/features/decide/check/sections/LinesSection.tsx
    - src/features/decide/check/sections/AssumptionsSection.tsx
    - src/ui/ToggleRow.tsx
requirements: [DCU-38]
completed: 2026-10-24
---

# Phase 5 Plan 126: Housing line UI Summary

The housing line is visible, editable and fed by the right loans: a sixth Lines row (third), a housing editor that shows housingMonthly and its share of money in plus a "Loans counted as housing" section of `This is for housing` switches, and "of 6 set by you" everywhere the count shows.

## Commits
- 3e8a0d9d: sixth Lines row, housing editor, DebtHousingSwitch (Task 1)
- d6cf7594: of 6 count, Every-line and Assumptions rows (Task 2)

## What was built
- **LinesCard**: KEYS order reserve, dsr, housing, unsecured, investing, saving; housing default = `percentText(limits.housingLine)` (28% from the engine) with the default tag; fold preview uses `previewSix`. It derives `{monthly, incomeBasis}` from the source it already receives (`snapshot.housingMonthly`, `prepareContext().money.incomeBasis`) and passes `housing` to the editor.
- **LimitEditorSheet** (housing mode): info line "Your housing costs come to {{amount}} a month, {{pct}} of money in." (falls back to the desc line when no money comes in), then `LoansCountedAsHousing`. Pct comes from `housingShare.ts` (bigint half-up).
- **DebtHousingSwitch.tsx**: `DebtHousingSwitch` (name wraps, no clamp; payment meta; `ToggleRow` labelled "This is for housing", spoken "This is for housing, {{name}}", hint, switch role, checked state, 44+ high; calls `useSetDebtHousing(debt, next, ownerId)` and shows the "Housing setting changed" Undo toast) and `LoansCountedAsHousing` (label-600 header, helper, live non-card debts from `useDebts`, empty line). The switch sits under the name at every width, so rule S needs no second layout.
- **Count**: `linesSetCount` counts `housing_line`; `DecideHomeScreen` uses `linesSetSix`; the Lines screen sub-copy has no count (05-131 noted this), so only the home row and fold preview switched. No other user of `linesSet`/`linesFold.preview` remains outside the catalogue (grep clean).
- **Every line** gets "Housing costs" · "{{pct}} of money in" with margin and the `housingLine` ⓘ for property checks only; **Assumptions** gets "Housing costs today" · "{{amount}} a month" for property checks only.

## Verification
- `npx jest src/features/decide`: 128 suites, 1778 tests pass (all named D-103 tests present, including the nine in the plan).
- `npm run typecheck`: clean. `npx eslint src/features/decide src/ui`: 0 errors (56 pre-existing warnings). `npm run depcruise`: no violations.
- The D-76 decideTextFit allowlists are untouched and pass (no `numberOfLines` added).

## Deviations from Plan
- **[Rule 3] `src/ui/ToggleRow.tsx`** gained an optional `accessibilityLabel` prop (spoken label differs from the visible "This is for housing"). Additive; other callers unchanged.
- **[Rule 3] `useDecideHomeViewModel.ts` not edited.** LinesCard already receives `source`, so it computes housingMonthly and the income basis itself; this keeps the Lines card and the Lines screen on one path without a new VM field.
- **[Rule 3] `LinesScreen.tsx` not edited**: its sub-copy has no count and it already passes the same source.
- **[Rule 1] Test fixtures** updated for the new sixth line: `homeRowsModel.test.ts` and `DecideHomeScreen.test.tsx` (`housing_line: null`, "of 6"), `homeDepth.test.tsx` (default-tag count 5, mocks for the debts hook, queries and record context), `LinesAndMonth.test.tsx` (six rows, mocks). `DecideHomeScreen.test.tsx` is outside the plan's file list; the edit is two lines.
- `AssumptionsSection.test.tsx` is new (the plan listed it as existing); the Every-line test sits in `sectionBodies.test.tsx` as planned.
- The "Undo restores it" test asserts the toast carries the undo step id and the label key; the undo replay itself is covered in the 05-122 debts mutation suite.

## Notes / decisions
- Debt payment amounts use the home-currency formatter as passed in; a loan stamped in another currency would show its raw minor units in the home currency. Not handled (loans from checks are converted to home currency by Go ahead).
- With `incomeBasis` 0 the editor info line falls back to the generic description rather than printing a share.

## Device item
05-EXECUTION-NOTES "05-26 device checklist additions (Money concepts R18)", entry 05-126 (already present). No requirement ticked.

## Known Stubs
None.

## Self-Check: PASSED
Commits 3e8a0d9d and d6cf7594 exist; DebtHousingSwitch.tsx, housingShare.ts and both new test files exist; ROADMAP diff is the single 05-126 tick.
