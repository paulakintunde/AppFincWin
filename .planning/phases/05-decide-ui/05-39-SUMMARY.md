---
phase: 05-decide-ui
plan: 39
subsystem: decide-journal
tags: [decide, journal, pure, estimate-bias, savings-goal]
requires: [05-05, 05-08, 05-33, 05-38]
provides: [toPastDecisions, attachRoleFor, savedSoFar]
affects: [05-44]
key-files:
  created:
    - src/features/decide/journal/pastDecisions.ts
    - src/features/decide/journal/goalProgress.ts
    - src/features/decide/journal/__tests__/pastDecisions.test.ts
    - src/features/decide/journal/__tests__/goalProgress.test.ts
requirements-completed: []
---

# Phase 5 Plan 39: Journal depth helpers Summary

Pure helpers that turn bought decisions into the engine's `PastDecision[]` (honest per-figure actuals, null never zero), default an attached line's role by date, and compute a goal's saved-so-far from tagged lines with stored rates only.

## Behaviour
- `attachRoleFor(decidedAt, lineDate)`: day_one when the line is dated 0..7 days after the decision's local date, else running_cost.
- `toPastDecisions`: bought, live decisions with a payment-split estimate whose 90-day (else 30-day) checkpoint is reached (dates taken from `compareEstimate`). Estimates converted with `convertLatest` when `inputs.currency` differs from home; any null conversion drops the decision. Day-one actual = sum of linked day_one lines; payment / running actuals = window sum over whole months (min 1), `divideHalfUp`. No link of the role, or any line without a stored rate, gives null. Transaction links and recurring-series links are both followed; only paid, live lines count.
- `savedSoFar`: opening_saved + paid, live lines tagged with the goal (sign ignored); any line without a usable stored amount, or a goal not in the home currency with tagged lines, gives `saved: null` (waiting for a rate).

## Verification
Journal folder jest: 18 tests, 100% statements/branches/functions/lines. typecheck clean, lint 0 errors, depcruise clean. Phase 4 gate passed.

## Deviations from Plan
- Decision local date is the device-local calendar date of `decided_at` (Date local getters), so the decision date follows the device timezone.
- `savedSoFar` for a goal whose currency differs from home returns null when any tagged line exists (the plan's "otherwise null for that line"); no cross-currency conversion was added.
- Tests were written first and committed failing (modules absent), then implementation added.
- No engine edits, no migrations.

## Human/device items
None.

## Self-Check: PASSED
