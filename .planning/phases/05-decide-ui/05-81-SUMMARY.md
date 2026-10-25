---
phase: 05-decide-ui
plan: 81
subsystem: engine
tags: [engine, payoff, decide, instalment, apr, D-80]
requires: [05-25]
provides:
  - amortiseDue (annuity-due level payment) in engine/payoff
  - instalment plan with optional apr, firstPayment, Plan.computedPayment, instalment_rate_missing, MAX_APR_PERCENT
affects: [05-83, 05-85, 05-80]
key-files:
  created:
    - src/engine/decide/__tests__/deviations/d80-instalment-rate.test.ts
  modified:
    - src/engine/payoff/amortise.ts
    - src/engine/payoff/__tests__/amortise.test.ts
    - src/engine/decide/types.ts
    - src/engine/decide/plan.ts
    - src/engine/decide/constants.ts
    - src/features/decide/copy/codeMaps.ts
    - src/features/decide/copy/__tests__/codeMaps.test.ts
    - src/features/decide/__tests__/engineBarrel.test.ts
decisions:
  - "amortise and amortiseDue share one level walk (a due flag): due pays at month 0 with no interest, then months 1..n-1"
  - "Due AmortisationResult.months is the number of payments (the last is paid in month months-1)"
  - "With a rate, interest = paid minus financed; the no-rate path keeps max(0, total minus price) for exact parity"
requirements: [DCU-29, DCU-17]
metrics:
  tasks: 2
  completed: 2026-10-22
---

# Phase 5 Plan 81: Engine E1, instalment plan with optional APR Summary

An instalment plan can carry an annual rate and a first-payment date: the payment is worked out in bigint on the amount financed (annuity-due for 'today', ordinary annuity for 'next_month'), rounded up with the final payment adjusted (D-64), while a typed amount is still the one scored.

## Tasks

| Task | Commit | Notes |
|------|--------|-------|
| 1. amortiseDue in payoff | e5f8f39c | shared walk with a due flag; hand-checked 1,200.00 at 12% over 12: ordinary 106.62, due 105.57; grid property loop |
| 2. planInstalment apr / firstPayment / computedPayment / instalment_rate_missing | e6329cf2 | MAX_APR_PERCENT (999.99%) in decide constants, exported through the barrel; codeMaps bridge points `instalment_rate_missing` at the existing count-missing key until 05-80 |

## Verification

- engine/decide and engine/payoff at 100% statements, branches, functions and lines.
- Full `npm run test:coverage`: 537 suites, 18455 tests passed, no threshold failure.
- typecheck clean, lint 0 errors, depcruise clean.
- Golden suites (decide and payoff) unchanged and passing; no golden expectation changed.

## Deviations from Plan

**1. [Rule 3 - Blocking] Barrel surface and code-map tests enumerate exports and reasons**
- engineBarrel.test.ts (DECIDE and PAYOFF runtime export lists: `MAX_APR_PERCENT`, `amortiseDue`) and codeMaps.test.ts (MISSING_TITLE codes: `instalment_rate_missing`) updated. The plan said to flag these; both are tests outside the file list.
- Commits: e5f8f39c / e6329cf2.

Otherwise the plan ran as written. No migrations, no Supabase calls.

## Device items

05-EXECUTION-NOTES "05-26 device checklist additions (Decide UX refresh)", entry 05-81: an instalment with a rate on the Pixel shows 105.57 for 1,200.00 at 12% over 12, first payment today; "In a month" moves the first payment a month on in the cash path (the UI arrives in 05-83/05-85).

## Known Stubs

`instalment_rate_missing` maps to a temporary existing key in `MISSING_TITLE`; 05-80 adds the real string and repoints it.

## Self-Check: PASSED
