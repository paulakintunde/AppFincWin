---
phase: 08-household
plan: 03
subsystem: engine
tags: [household, split, weights, memberLabel, feature-switches]
requires: []
provides: [splitLine, rebalanceWeights, evenWeights, nextFreeColour, memberLabel, HOUSEHOLD_FEATURES]
affects: [jest.config.js]
key-files:
  created:
    - src/engine/household/lineSplit.ts
    - src/engine/household/weights.ts
    - src/engine/household/colours.ts
    - src/engine/household/memberLabel.ts
    - src/config/householdFeatures.ts
  modified:
    - jest.config.js
metrics:
  completed: 2026-11-15
---

# Phase 8 Plan 03: Household split, weights, colours and member names Summary

Pure household engine pieces: splitLine reuses SplitRule and memberParts from engine/decide/share.ts (no second rule type), whole-percent weight rebalancing, next-free colour, the single memberLabel resolver, and the D-44 feature switches.

## Commits
- 89dc6a38 test(08-03): failing tests for line split and weights (also registers 'household' as a 100% folder)
- 9693a111 feat(08-03): household line split and weight rebalance
- 7f14a940 feat(08-03): member colours, memberLabel resolver and household feature switches

## Verification
- jest src/engine/household plus src/config/__tests__/householdFeatures.test.ts: 5 suites, 40 tests pass (08-03 files).
- Branch coverage 100% on all household engine files.
- eslint: 0 errors (only the repo-wide fast-check `fc` import-style warnings, same as the allocate tests).

## Deviations from Plan
- Tests for colours, memberLabel and householdFeatures were committed together with their implementation in the Task 2 commit rather than as a separate RED commit. Task 1 followed RED then GREEN.
- splitLine returns all zeros for a zero total (memberParts/allocate reject an empty positive set) and rebalanceWeights throws RangeError for fewer than two members; both are small guards beyond the spec.

## Known Stubs
None.

## Self-Check: PASSED
