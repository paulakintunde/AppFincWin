---
phase: 03-shell
plan: 17
subsystem: engine/activity
tags: [engine, money, home, activity, tdd]
requires: []
provides: [monthPosition, unpaidOutflows, barShares, leftAfterEverything, isUnpaidBill, filterProjections, isOnlyUnpaid]
affects: [Home This month card, Activity Unpaid filter]
key-files:
  created:
    - src/engine/activity/monthFigures.ts
    - src/engine/activity/__tests__/monthFigures.test.ts
  modified:
    - src/engine/activity/filters.ts
    - src/engine/activity/index.ts
    - src/engine/activity/__tests__/activity.test.ts
decisions:
  - "UNPAID counts only unpaid outflows (rows plus projections); stillToCome is never used"
  - "unpaidOnly filter means bills out only (D-35, D-36); projections join it via filterProjections"
metrics:
  completed: 2026-10-13
requirements: [HOME-01, HOME-02, HOME-03]
---

# Phase 3 Plan 17: Month figures and Unpaid filter Summary

Pure engine maths for Home's UNPAID, left after everything and paid/pending bar shares, plus an Unpaid filter that now means bills out only, so Home and Activity share one definition.

## Commits
- d316bc1 test: failing monthFigures tests (RED)
- 2415c6c feat: monthFigures module and barrel export (GREEN)
- ce8e65f feat: isUnpaidBill, filterProjections, isOnlyUnpaid; unpaidOnly branch updated

## Verification
- `npx jest src/engine/activity --coverage`: 9 suites, 133 tests, 100% across the folder.
- `npx tsc --noEmit` clean; eslint 0 errors (existing fast-check import warnings only); activityTools.test.tsx 18 passing.
- Not run: `npm run depcruise` (monthFigures imports only `./status`, no forbidden layers).

## Deviations from Plan
None in code. Environment: the node_modules junction could not be re-pointed to fincwin-p3 (shell tooling refused powershell/cmd); the existing junction to fincwin-w1 was used, and all checks ran fine.

## Known Stubs
None.

## Self-Check: PASSED
