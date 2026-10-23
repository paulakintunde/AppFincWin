---
phase: 05-decide-ui
plan: 90
subsystem: engine
tags: [engine, payoff, decide, apr, D-90, E4]
requires: [05-87]
provides:
  - impliedApr (true nominal APR from payments) and impliedAprDisplay in engine/payoff
affects: [05-102]
key-files:
  created:
    - src/engine/payoff/impliedApr.ts
    - src/engine/payoff/__tests__/impliedApr.test.ts
  modified:
    - src/engine/payoff/index.ts
    - src/features/decide/__tests__/engineBarrel.test.ts
decisions:
  - "MAX_APR (999.99%) is a payoff-side constant; the solver takes an optional maxApr and never imports decide"
  - "Ordinary PV test: P*Dp*(A^n-Dp^n) > F*A^n*apr; due swaps Dp for A (A = Dp+apr, Dp = 100*ppy*PERCENT_SCALE)"
  - "Zero financed returns null; count above MAX_IMPLIED_APR_COUNT (5000) throws RangeError"
  - "Display drops a trailing .0 (18 not 18.0); 0 is '0'"
requirements: [DCU-31]
metrics:
  tasks: 1
  completed: 2026-10-23
---

# Phase 5 Plan 90: Engine E4, true APR solver Summary

`impliedApr({ financed, payment, count, periodsPerYear, timing })` solves the nominal APR by exact bigint bisection on the percent scale, comparing present values through cross-multiplied rationals (powers by squaring, no floats). It returns `{ apr }` (upper bound of the one-unit bracket), `{ aboveMax: true }` or `null`; `impliedAprDisplay` rounds up to one decimal.

## Tasks

| Task | Commit | Notes |
|------|--------|-------|
| 1. impliedApr solver and display | a9ff4f25 | D-90 unit tests plus two fast-check properties (round-trip within one minor unit through amortise/amortiseDue; monotonic in payment) |

## Verification

- impliedApr.ts at 100% statements, branches, functions, lines (per-file threshold command passes); 16 tests.
- Performance: n = 500 solved in 4 ms in Node (loose 1 s guard in the test; the Pixel 9 budget is a 05-26 item).
- depcruise clean; eslint 0 errors on engine/payoff; the whole payoff suite and engineBarrel pass.
- `grep parseFloat|Math.pow` in impliedApr.ts: 0.
- typecheck: one error, in `src/shell/fab/__tests__/FabProvider.test.tsx` (`current` not in `ShellTestOptions`), another plan's file, not fixed.

## Deviations from Plan

**1. [Rule 3 - Blocking] Barrel surface test enumerates exports**
- `engineBarrel.test.ts` PAYOFF_RUNTIME_EXPORTS gained `MAX_APR`, `MAX_IMPLIED_APR_COUNT`, `impliedApr`, `impliedAprDisplay`. Only my hunk was staged (05-89 had added `rateDenominator` in the same line).
- Round-trip property runs at periodsPerYear 12, since amortise/amortiseDue are monthly (05-89 added periodsPerYear to the schedule maths but the round trip needs monthly figures).

## Device items

05-EXECUTION-NOTES "05-26 device checklist additions (Decide UX refresh)", entry 05-90: time impliedApr at n = 500 on the Pixel 9 (budget under 30 ms).

## Known Stubs

None.

## Self-Check: PASSED
