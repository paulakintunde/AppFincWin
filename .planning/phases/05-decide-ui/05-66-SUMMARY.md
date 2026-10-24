---
phase: 05-decide-ui
plan: 66
subsystem: ui
tags: [decide, fold-bodies, a11y, D-74, D-76, R1]
requires: [05-54, 05-55, 05-59, 05-65]
provides:
  - DayByDayBody, OptionsBody, SetbacksBody, ExpectedIncomeBody, WhoPaysBody (wrappers kept until 05-78)
affects: [05-74, 05-78]
key-files:
  created:
    - src/features/decide/check/__tests__/sectionBodies2.test.tsx
  modified:
    - src/features/decide/check/sections/DayByDaySection.tsx
    - src/features/decide/check/sections/OptionsSection.tsx
    - src/features/decide/check/sections/SetbacksSection.tsx
    - src/features/decide/check/sections/ExpectedIncomeSection.tsx
    - src/features/decide/check/sections/WhoPaysSection.tsx
    - src/features/decide/check/sections/__tests__/depthSections.test.tsx
decisions:
  - "Section wrappers compute their own closed-fold summary and render the body inside CollapsibleSection"
  - "OptionsSection wrapper no longer uses the dark CollapsibleSection; the ink tile lives in the body (radius 16 literal, as InfoSheet does)"
metrics:
  tasks: 2
  completed: 2026-10-23
requirements: [DCU-14, DCU-19, DCU-11, DCU-27]
---

# Phase 5 Plan 66: Cash path, setbacks, options, expected income and who pays bodies Summary

The five remaining step 3 sections are now fold-ready bodies. Without a pay series the cash path body reads "Day-by-day cash needs your pay as a recurring series." with the link "Recurring series in Record" (same openEntry money-in target); options render inside an inner ink tile (radius 16); setbacks, expected income and who pays carry no clamps.

## Tasks

| Task | Commit | Notes |
|------|--------|-------|
| 1. DayByDayBody, OptionsBody | 45a2867e | Wrapper summary for the unavailable state is "No recurring pay series yet" |
| 2. SetbacksBody, ExpectedIncomeBody, WhoPaysBody | 19be5b66 | sectionBodies2 tests incl. D-76 no-clamp render at fontScale 2 |

## Verification

- `npx jest src/features/decide/check/__tests__/sectionBodies2.test.tsx`: 3 passed. `setbacksOptions.test.tsx` and the other section tests pass unchanged.
- `npm run typecheck`: clean. eslint on `src/features/decide/check`: 0 errors (6 pre-existing warnings in other files).
- Full `src/features/decide/check` run: 10 failures in `tableSections.test.tsx`, `depthSections.test.tsx` (AssumptionsSection cases) and `CheckFlow.test.tsx` (card terms). All read rows now behind Show details in AssumptionsSection, which another executor is modifying in the working tree (uncommitted `AssumptionsSection.tsx` change); none touch this plan's files.

## Deviations from Plan

**1. [Rule 3] Test scope.** `setbacksOptions.test.tsx` needed no edit: its assertions never targeted the dark card, and the wrapper still renders the same texts. Only `depthSections.test.tsx` moved to the new cash-path copy.

**2. Formatting.** Edited section files were run through prettier (single quote, width 160), so the diffs are wider than the logic change.

**3. D-76 test.** The no-clamp test forces stacking via a `useShouldStack` spy plus fontScale 2 rather than a 320 window width.

## Known Stubs

None.

## Device items

05-EXECUTION-NOTES entry 05-66: cash path without a pay series shows the declarative line and the link opens Record on a money-in entry; options sit in one ink tile; setbacks, expected income and who pays wrap at 2.0x text with no cut-off words.

## Self-Check: PASSED
