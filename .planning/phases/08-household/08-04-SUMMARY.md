---
phase: 08-household
plan: 04
subsystem: engine
tags: [household, balances, settlement]
requires: []
provides: [pairBalances, owedToMeTotal, isSettlement, excludeSettlements, settleUpTotal]
key-files:
  created:
    - src/engine/household/balances.ts
    - src/engine/household/settlement.ts
metrics:
  completed: 2026-11-15
---

# Phase 8 Plan 04: Balances and settlement Summary

Per-pair who-owes-who maths over stored per-line shares (no simplification, joint-paid lines create no owing, settled and written-off lines drop out, pending lines count and are reported separately), the single isSettlement rule, and settleUpTotal over ticked open lines.

## Commits
- 0ae57c35 feat(08-04): per-pair household balances (balances.ts and tests)
- fc4f18db feat(08-04): settlement rule and settle-up total (settlement.ts and tests, plus a comparator simplification in balances.ts)

## Verification
- jest -c jest.engine.config.js src/engine/household: 6 suites, 58 tests pass.
- 100% statements, branches, functions and lines on every household engine file.
- Properties: antisymmetry, zero-sum across members, joint lines never change nets, owedToMeTotal >= 0, all-open-ticked equals pair net.
- eslint: 0 errors.

## Deviations from Plan
- Task 1 and Task 2 sources were written before the tests were committed, so there is no separate RED commit for 08-04 (tests and implementation committed together per task).
- Pair sort comparator uses `a < b ? -1 : 1` (keys are unique map keys), avoiding an unreachable branch under the 100% gate.
- Zero-amount shares are skipped, so they add no line id.

## Known Stubs
None.

## Self-Check: PASSED
