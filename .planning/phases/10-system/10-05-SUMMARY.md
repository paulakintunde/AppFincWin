---
phase: 10-system
plan: 05
subsystem: engine
tags: [alerts, engine, tdd, money]
requires: []
provides: [suggestAlertAmounts, ALERT_HISTORY_MIN_EXPENSES, ALERT_HISTORY_MIN_MONTHS, FLAT_LARGE_EUR_MINOR, FLAT_LOW_EUR_MINOR]
affects: [10-15, 10-22]
key-files:
  created:
    - src/engine/alerts/defaults.ts
    - src/engine/alerts/index.ts
    - src/engine/alerts/__tests__/defaults.test.ts
decisions:
  - "Flat amounts never round to zero: a minimum of one whole unit of the home currency applies"
metrics:
  completed: 2026-11-22
---

# Phase 10 Plan 05: Default alert amounts Summary

Pure `suggestAlertAmounts` (D-10): large = 3x the median single spend and low = 3-month spend / 13 (half up) over the 3 calendar months ending today; flat 200 / 100 EUR-equivalent (converted, rounded half up to whole units) until 30 expenses across 2 months exist.

## Commits
- fadd85d1 test(10-05): failing tests (RED)
- GREEN commit: feat(10-05): default alert amounts from the person's own months

## Verification
- `npx jest -c jest.engine.config.js src/engine/alerts`: 21 tests pass, defaults.ts 100% statements/branches/functions/lines.
- Greps for floats and react/`@/` imports return nothing; module imports only from `../money`.

## Deviations from Plan
- Window helper is local to defaults.ts (string date maths with end-of-month clamp) rather than `engine/time`, which has no month-subtract helper.
- Added a minimum of one whole unit for flat amounts (guards against tiny rates rounding to 0) and a safe-integer throw test.
- Worktree HEAD was reset to the given base SHA 493c04d9 at start.

## Notes for orchestrator
No installs, no owner items. tsc and lint were not run (jest only, per milestone rule).

## Self-Check: PASSED
