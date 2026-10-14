---
phase: 03-shell
plan: 38
subsystem: acceptance
tags: [device-check, gap-closure, android]
gap_closure: true
requires: [03-25, 03-26, 03-27, 03-28, 03-29, 03-30, 03-31, 03-32, 03-33, 03-34, 03-35, 03-36, 03-37]
provides: [gap re-check record]
key-files:
  created: []
  modified: [docs/acceptance/phase-03-shell.md]
key-decisions:
  - "R1: the plain background revealed behind the dragged screen during the in-app edge swipe is accepted"
  - "R3 and R9-2 were checked by moving the phone date to 5 December 2026, because the nightly materialisation job leaves no expected-only month in the user's data at today's date; nothing was written while the date was changed"
requirements-completed: [NAV-01, NAV-02, NAV-03, NAV-04, NAV-05, NAV-06, DSG-07, HOME-01, HOME-02, HOME-03, HOME-04]
duration: ~1h (device session)
completed: 2026-10-14
---

# Phase 3 Plan 38: Pixel 9 gap re-check

All nine device re-checks of the gap fixes (plans 03-25..03-37) passed on the Pixel 9; the acceptance record has a dated "Gap re-check (03-38)" section and no gaps remain.

## What was done

- **Task 1:** the gate was green on phase/03-shell 7e52bb2: tsc, eslint and depcruise clean, and jest passed 337 suites / 8128 tests with coverage thresholds met. `git diff 06ac01d -- package.json app.config.ts` showed no native change, so the installed dev build was reloaded from Metro on 8081 instead of rebuilt. The re-check slots were committed in 8b1361a.
- **Task 2:** the user ran R1–R9 on the device, and all passed.
- **Task 3:** the results were recorded with their finding IDs. Re-check lines were added to A7, A9, A15 and the Accounts-row finding.

## Results

| Row | Findings | Result |
|---|---|---|
| R1 edge swipe | G7, D-40 | PASS (background reveal accepted) |
| R2 Unpaid banner | G8, D-41 | PASS |
| R3 Expected wording and tap | G9, D-42 | PASS (phone date 5 Dec 2026) |
| R4 sync line at rest | G5 | PASS |
| R5 Accounts row | G6, D-39 | PASS |
| R6 import from Home | G3 | PASS |
| R7 double tap | H7 | PASS |
| R8 FAB clearance | H8 | PASS |
| R9 toast and headline | M3, G1 | PASS |

## Deviations

- **R3 and R9-2 test setup:** the expected-only month had to be created by moving the phone date forward. The daily `materialise_recurring` cron (00:20 UTC) fills in this month and next, so at today's date the user's data held only "scheduled" (materialised) bills. No test data was stored.
- **Task 3 pending-grep check:** the check expects 0 `Result: pending` lines but finds 4. All 4 are I1–I4, which stay "pending: Apple enrolment" by design.

## Self-Check: PASSED
