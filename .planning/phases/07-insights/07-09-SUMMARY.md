---
phase: 07-insights
plan: 09
subsystem: insights
tags: [insights, everyday, charts, engine-glue]
requires: [07-02, 07-04, 07-06, 07-07, 07-08]
provides: [model/everyday.ts, MoneyInOutSection, WhereItWentSection, MonthAgainstLastSection]
affects: [07-11 Insights screen assembly]
key-files:
  created:
    - src/features/insights/model/everyday.ts
    - src/features/insights/model/__tests__/everyday.test.ts
    - src/features/insights/sections/MoneyInOutSection.tsx
    - src/features/insights/sections/WhereItWentSection.tsx
    - src/features/insights/sections/MonthAgainstLastSection.tsx
    - src/features/insights/sections/__tests__/everydaySections.test.tsx
decisions:
  - "inOutModel does not slice again: barsInRange already returns N+1 bars (D-26a)"
  - "WhereItWentSection always shows the debt and saving note (D-27, D-30); the left-out note also shows for an empty period"
metrics:
  completed: 2026-11-23
---

# Phase 07 Plan 09: Everyday sections Summary

Three Everyday Insights sections (Money in and out, Where it went, This month against last) over one shared Prepared, with a pure model that only calls the engine.

## What was built
- `model/everyday.ts`: `inOutModel`, `categoryModel`, `compareModel`, `recordedMonths`. No money arithmetic; 100% coverage.
- `MoneyInOutSection`: In / Out / Left tiles (short glyph + word on a negative Left), InOutBars, a Left each month mode using SignedBars' default tone (`insights-left-bars`), readout on tap, all-range window note, one-month and empty states.
- `WhereItWentSection`: month or range toggle, month chips, ranked CategoryRows (colorIndex = rank, null for Everything else), Show all after 8, row tap calls `requestActivityFocus` (direction 'out', latest month in range mode) then `router.navigate('/activity')`; the debt and saving note always shows.
- `MonthAgainstLastSection`: month chips, three tiles with more/less/same in words, neutral change rows (arrow glyph + word in inkDim, no state colours), Show all after 6, nothing-recorded state with Add an entry.

## Deviations from Plan
- The plan's must_have says the Left bar "reads 'short'"; Decide's SignedBars word is "{{amount}} short", so the test matches that wording.
- The leftOut note is rendered outside the non-empty branch so an empty month that only had moves still explains itself.
- Tests need `series` on the fixtures (income counts only with a pay series) and awaited RNTL calls.

## Checks
- `npx jest src/features/insights --coverage=false`: 38 passed.
- Coverage model/everyday.ts: 100/100/100/100.
- eslint (model, sections), `npx tsc --noEmit`, `npm run depcruise`: see final report (run at close).
- Grep gates: no `stateColors` in MonthAgainstLastSection or WhereItWentSection; no `countsForMe` in sections.

## Known Stubs
None.

## Self-Check: PASSED
