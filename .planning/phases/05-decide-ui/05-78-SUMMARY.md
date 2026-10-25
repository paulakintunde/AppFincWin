---
phase: 05-decide-ui
plan: 78
subsystem: ui
tags: [decide, step3, refactor, D-74]
requires: [05-66, 05-69, 05-74, 05-75, 05-77]
provides:
  - Step 3 sections exist only as fold bodies (no CollapsibleSection wrappers)
  - SectionProps without expanded / onToggle
affects: [05-26]
key-files:
  modified:
    - src/features/decide/check/sections/sectionUi.tsx
    - src/features/decide/check/sections/MonthSection.tsx
    - src/features/decide/check/sections/LedgersSection.tsx
    - src/features/decide/check/sections/DayByDaySection.tsx
    - src/features/decide/check/sections/WhoPaysSection.tsx
    - src/features/decide/check/sections/LinesSection.tsx
    - src/features/decide/check/sections/SetbacksSection.tsx
    - src/features/decide/check/sections/ExpectedIncomeSection.tsx
    - src/features/decide/check/sections/OptionsSection.tsx
    - src/features/decide/check/sections/AssumptionsSection.tsx
    - src/features/decide/check/sections/WhatBreaksSection.tsx
    - src/features/decide/check/steps/step4/InvestingInsteadSection.tsx
decisions:
  - "SectionBodyProps removed outright (every reader now uses SectionProps); no alias kept"
  - "assumptionRows, EveryLineRows and all XxxBody exports kept (step3Folds and previews use them)"
requirements: [DCU-14, DCU-11]
metrics:
  tasks: 1
  completed: 2026-10-23
---

# Phase 5 Plan 78: Delete the step 3 section wrappers Summary

The ten transitional `XxxSection` wrappers (CollapsibleSection over a body) are deleted; each step 3 section now has one rendering path, its fold body in `step3Folds.tsx`. `SectionProps` is the body props shape, with no `expanded` or `onToggle`.

## Tasks

| Task | Commit | Notes |
|------|--------|-------|
| 1. Delete wrappers, narrow SectionProps, move tests onto bodies | 025d546d | grep of `src/` and `app/` showed nothing outside tests rendered a wrapper |

## Wrappers removed

Month, Ledgers, DayByDay, WhoPays, Lines, Setbacks, ExpectedIncome, Options, Assumptions, InvestingInstead. None kept.

## Tests

- householdScope, depthSections, setbacksOptions, tableSections and investingInstead now render `XxxBody` (`EveryLineRows` for Lines, which never had a body of its own).
- Removed assertions that only covered a wrapper's own chrome: section titles, the closed-fold summaries (month left, runway, "N assumptions", "N clear, M over"), and the four "collapsed when not expanded" tests. Titles and order are covered by CheckFlow.test.tsx.
- The assumption-count test now reads `assumptionRows(...).length` through a small `RowCount` component instead of the summary text.
- Investing tests drop the `open()` helper, since the body has no header to press.

## Verification

- `npx jest src/features/decide --silent`: 102 suites, 1449 tests pass.
- typecheck clean; lint 0 errors; depcruise clean.
- Acceptance greps: 0 wrapper exports in `src/features/decide`, 0 `CollapsibleSection` in `check/sections`, 0 `onToggle` in sectionUi.tsx.
- Engine and snapshot folders untouched, so coverage there is unchanged.

## Deviations from Plan

**1. [Rule 3 - Blocking] Dead wrapper-only code removed**
- `setbacksSummary` (SetbacksSection.tsx) and two imports in ExpectedIncomeSection.tsx were used only by the wrappers; removed so lint stays free of new warnings.
- `WhatBreaksBodyProps` and two comments updated to the narrowed `SectionProps`; `sectionBodies*.test.tsx` touched only for the `SectionBodyProps` rename.

Otherwise as written. No migrations, no Supabase calls.

## Device items

05-EXECUTION-NOTES "05-26 device checklist additions (Decide UX refresh)", entry 05-78: step 3 shows the same folds in the same order, with the same titles and previews as before.

## Known Stubs

None.

## Self-Check: PASSED
