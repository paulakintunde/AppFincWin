---
phase: 05-decide-ui
plan: 42
subsystem: decide-ui
tags: [step3, sections, cash-path, depth]
requires: [05-16, 05-35, 05-37, 05-41]
provides: [DayByDaySection, ExpectedIncomeSection, depth rows in Lines/Setbacks/Assumptions]
affects: [05-30]
key-files:
  created:
    - src/features/decide/check/sections/DayByDaySection.tsx
    - src/features/decide/check/sections/ExpectedIncomeSection.tsx
    - src/features/decide/check/sections/__tests__/depthSections.test.tsx
  modified:
    - src/features/decide/check/sections/LinesSection.tsx
    - src/features/decide/check/sections/SetbacksSection.tsx
    - src/features/decide/check/sections/AssumptionsSection.tsx
    - src/features/decide/check/sections/sectionUi.tsx
    - src/features/decide/check/sections/__tests__/setbacksOptions.test.tsx
    - src/i18n/locales/en.ts
requirements-completed: [DCU-02, DCU-14, DCU-17, DCU-19]
duration: 40min
completed: 2026-10-16
---

# Phase 5 Plan 42: Step 3 depth sections Summary

Day by day (cash path chart plus D-59 fact and a recurring-series prompt), With the expected income, and the cushion/margin, runway-lost and extra Assumptions rows, all exported or extended for 05-30 to place.

## Tasks
1. DayByDaySection and ExpectedIncomeSection (7f9d71c). Neither imports Step3Verdict or CheckFlowScreen; both render nothing without a resolved logged verdict (or, for the raise, without `withExpectedIncome`).
2. Lines, Setbacks, Assumptions depth rows (dd374fe). `TableRow` gained an optional `extra` line (warn1) for margins.

## Decisions
- AssumptionsSection's new props (`stack`, `conversions`, `basisItems`, `formatDate`) are optional so 05-15 callers and tests stay valid; 05-30 passes them.
- Margin shown only when flagged on_edge or negative; the cash row uses the cash margin, else the cash_path margin (which reads the D-59 fact at margin 0).

## Deviations from Plan
- [Rule 3] Added `income.rowMonths_one/_other` and `income.rowNever` keys to `en.ts` (the payback figure row needed them).
- Updated the 05-16 setbacks test: the summary now reads 'Runway 0 months, 3 less because of this' because runway lost is positive (this plan's specified behaviour).
- Runway summary keeps 'Runway not limited' whenever the setbacks report has no runway, taking precedence over the lost-runway summary.

## Verification
`npx jest src/features/decide src/i18n --forceExit` 63 suites / 9285 tests green; typecheck clean; lint 0 errors.

## Known Stubs
None. Human/device items: none.

## Self-Check: PASSED
