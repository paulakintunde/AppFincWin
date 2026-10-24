---
phase: 05-decide-ui
plan: 65
subsystem: ui
tags: [decide, fold-bodies, a11y, D-74, D-75, D-76, D-70]
requires: [05-54, 05-55, 05-58, 05-59, 05-64]
provides:
  - SectionBodyProps type
  - Rule-S TableRow (value under the label when stacking applies)
  - LedgersBody, MonthBody, AssumptionsBody (wrappers kept until 05-78)
affects: [05-74, 05-78]
key-files:
  modified:
    - src/features/decide/check/sections/sectionUi.tsx
    - src/features/decide/check/sections/LedgersSection.tsx
    - src/features/decide/check/sections/MonthSection.tsx
    - src/features/decide/check/sections/AssumptionsSection.tsx
    - src/features/decide/check/__tests__/sectionBodies.test.tsx
    - src/features/decide/check/sections/__tests__/tableSections.test.tsx
    - src/features/decide/check/sections/__tests__/depthSections.test.tsx
decisions:
  - "Provisional-rate row moves into the fifth visible slot when it would land behind Show details (T-05-65-02)"
  - "assumptionRows() is shared by the body and the wrapper so the old summary count stays correct"
metrics:
  tasks: 2
  completed: 2026-10-23
requirements: [DCU-11, DCU-14, DCU-23, DCU-27]
---

# Phase 5 Plan 65: Month, Where it lands and Assumptions fold bodies Summary

Where it lands is now stacked ledger rows (dot, name, Better/Worse/Same tag, description, Now and After with no arrow), the month table stacks under rule S, and Assumptions shows 5 rows then Show details, with the provisional-rate row carrying its info button.

## Tasks

| Task | Commit | Notes |
|------|--------|-------|
| 1. Rule-S TableRow, LedgersBody | a00ff7a8 | Group label "{ledger}, now {now}, after {after}, {direction}"; Now/After stack under S |
| 2. MonthBody, AssumptionsBody | 07c723d9 | Stacked month lines read "Now x · After y"; LabelValueRow rows; DetailsToggle after 5 rows |
| test cleanup | follow-up commit | merged a duplicate fixture import |

## Verification

- `npx jest src/features/decide/check/__tests__/sectionBodies.test.tsx src/features/decide/check/sections`: 66 passed (sectionBodies 9 tests).
- Full `src/features/decide` run showed transient failures in `cardMinimum`, `step2Custom`, `Step2PriceAndPay`, `lockedReadOnly` caused by another executor's in-flight `MethodPanels.tsx` (`Card is not defined`); CheckFlow and infoPlacement passed on rerun.
- `npm run typecheck`: no errors in plan files; eslint on sections and the new test: 0 errors, 0 warnings.
- `grep -c "→"` on LedgersSection is 0; `LedgersBody`, `MonthBody`, `AssumptionsBody` each exported once.

## Deviations from Plan

**1. [Rule 2 - Threat mitigation] Provisional row kept visible.** Basis items sit at the end of the row list, so with more than 5 rows the provisional row would hide. It moves to slot 5 when it would fall past it (T-05-65-02).

**2. [Rule 3] Existing assertions moved.** Assumptions assertions reading rows past the fifth now press Show details first (tableSections, depthSections), as the plan directed; the Ledgers direction assertion reads the tag word instead of "· Word".

**3. Formatting.** The two bodies were run through prettier with print width 160 and object-wrap collapse, so the diff of MonthSection and AssumptionsSection is wider than the logic change.

## Known Stubs

None.

## Device items

05-EXECUTION-NOTES entry 05-65: Where it lands reads cleanly at 320 and 2.0x text (tag never clipped, Now/After stack); month lines stack below 360 wide; Show details reveals the rest of Assumptions; the provisional-rate row opens its info sheet with the stored rate date.

## Self-Check: PASSED
