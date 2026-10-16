---
phase: 04-decide-engine
plan: 09
subsystem: engine/decide
tags: [bisection, options, tdd]
requires: [04-07, 04-22]
provides: [bisectLargest, affordablePrice, buildOptions]
affects: [04-11, 04-18, 04-20, phase-05]
key-files:
  created:
    - src/engine/decide/bisect.ts
    - src/engine/decide/options.ts
    - src/engine/decide/__tests__/bisect.test.ts
    - src/engine/decide/__tests__/options.test.ts
    - src/engine/decide/__tests__/deviations/d20-exact-bisection.test.ts
    - src/engine/decide/__tests__/deviations/d05-option-thresholds.test.ts
decisions:
  - "affordablePrice treats only `found` with price > 0 as an option; full_price_fits cannot occur for a non-fits assessment on the same context"
  - "cut_line is emitted with or without a month gap (as the prototype did); closesGap is false when the gap is 0"
  - "Tie-break on line id uses a branch-free comparison so options.ts stays at 100% branches"
metrics:
  tasks: 2
  files: 6
  tests: 40 new (17 bisect and D-20, 23 options and D-05/D-06); 731 across engine/decide and engine/payoff
  completed: 2026-10-16
---

# Phase 4 Plan 09: Bisection and options Summary

Exact integer bisection for the largest affordable price (`bisectLargest`, `affordablePrice`) and the ordered options list (`buildOptions`) as pure functions over an AssessContext. bisect.ts and options.ts are at 100% statements, branches, functions and lines.

- **Bisection (DEC-09, D-20).** Integer search on minor units, `nothing_affordable` / `full_price_fits` explicit, `found` p always satisfies fits(p) and not fits(p + 1). The predicate is assessPlan's state, so it carries D-44 cash_dip and the D-48 highest scheduled payment. Monotonicity is property-tested across the vehicle dealer cap, a 2-member even household, a 0% deferred-interest promo loan, and a snapshot with a confirmed pay series. For a [3,5,7] household (Alabama paradox) the witness shows fits(6), not fits(7), fits(8): the answer is 6 against a true maximum of 8, within ceil(W / w_me) of price and 1 minor unit of the member's share; a 50-run property confirms the bound for random 3 to 5 member unequal weights.
- **Options (DEC-13, D-19).** Order: affordable_price, longer_term (loan, +24 months capped at 600), cut_line x2 (a fifth of the two biggest cuttable lines, ties by line id), earn_more (only with a gap, percent of money in), save_first (reads `context.cashAfterBills` and `assessment.cashAfterBillsAndPurchase`, so a bill within 90 days is deducted even with a pay series), do_without (kept monthly projected at 0% by default, `byRate` for every projection rate, D-51). Empty when the verdict fits. Gap is the pre-pause shortfall, so a pause-only `adjust` still gets options (D-35). No currency thresholds (D-05).

## Commits

| Commit | Message |
| ------ | ------- |
| ec3145d | test(04-09): exact bisection |
| 8586523 | feat(04-09): integer bisection for largest affordable price |
| e2be449 | test(04-09): options list order and content |
| 17a1b7a | feat(04-09): options list |

RED was observed failing (module not found) before each GREEN. The bisect GREEN passed all tests first run; the options GREEN needed two test corrections (below).

## Verification

- `npx jest src/engine/decide src/engine/payoff --coverage`: 731 tests passed; engine/decide and engine/payoff at 100% on all four measures.
- `npx tsc --noEmit`: only the known `expo-blur` error in `TabBar.tsx`.
- eslint: no errors (fc default-import warnings, same as earlier plans); `npm run depcruise` and `npm run check:ignores` pass.
- Plan greps: forbidden-threshold grep 0, `cashAvailable`/`cashOnHand` in options.ts 0, `cashAfterBills` 2, `D-41` in bisect.ts present.

## Deviations from Plan

1. **[Test correction] cut_line without a gap.** My first draft of the "no gap" test and the D-05 cut-line test assumed cut_line needs a gap. The prototype (lines 4592-4630) emits the two cut lines regardless, and the plan's `closesGap = gap > 0 && cut >= gap` implies the same, so the tests were corrected, not the engine.
2. **[Acceptance grep] `grep -c "fc.assert" bisect.test.ts` is 4, not 6.** The four monotonicity cases (dealer cap, 2-member even, promo loan, cash path) share one helper that holds a single `fc.assert`, so there are 7 property runs for 4 source occurrences. Coverage of the required cases is complete.
3. All plan hand figures matched the engine (1_400_000, 300_000, 420_000, 180_000, 25_000 gap).

## Requirements

DEC-09 and DEC-13 are fully delivered by this plan and marked complete.

## Known Stubs

None.

## Self-Check: PASSED

Files exist (bisect.ts, options.ts and the four test files); commits ec3145d, 8586523, e2be449, 17a1b7a are in the log.
