---
phase: 05-decide-ui
plan: 92
subsystem: engine
tags: [engine, decide, cash-path, instalment, frequency, D-89, E3]
requires: [05-91]
provides:
  - purchaseFlows dates a non-monthly instalment's payments on occurrenceDate(asOf, freq, k)
affects: [05-103]
key-files:
  modified:
    - src/engine/decide/cashPath.ts
    - src/engine/decide/__tests__/cashPath.test.ts
    - src/engine/decide/__tests__/payback.test.ts
    - src/engine/decide/__tests__/investmentViews.test.ts
decisions:
  - "For a weekly, fortnightly or quarterly plan the payment flows and the monthly running-cost flows are separate flows (a payment date and a running-cost date can differ); monthly and frequency-less plans keep the combined flow, so their output is identical"
requirements: [DCU-31, DCU-14]
metrics:
  tasks: 2
  completed: 2026-10-23
---

# Phase 5 Plan 92: Engine E3c, cash path and month consumers by frequency Summary

`purchaseFlows` puts payment k of a weekly, fortnightly or quarterly plan on `occurrenceDate(asOf, freq, k)` for every period inside the 90-day window (same roll rule as the SQL). Running costs stay on their monthly dates as their own flows. A 'today' plan has the first payment in dayOne; a 'next_period' plan starts one period after asOf. Monthly plans and loans give exactly today's flows.

## Tasks

| Task | Commit | Notes |
|------|--------|-------|
| 1. Cash path dates by frequency | b28bb330 | three "D-89" tests in cashPath.test.ts |
| 2. Payback and investing views use monthlyStepsOf | 7b85a3ba | tests only; the source change was already made in 05-91 (its deviation 1) |

## Verification

- cashPath.ts and payback.ts: 100% on all four measures (per-file run); cashPath, payback, investmentViews suites pass.
- Golden suites (decide and payoff) pass. `npm run typecheck`, `npm run depcruise` clean; eslint clean on touched files.
- Full `npx jest src/engine`: one failure, `plan.test.ts` "expected missing" (line 346). Not from this plan: it comes from another executor's uncommitted edit to `plan.ts` (`cardEligibility(check.itemType, p.region ?? null)`) and `cardRule.ts`. Because that run fails, the global coverage threshold command did not report a clean pass; re-run it once that plan lands.

## Deviations from Plan

**1. [Scope] Task 2 has no source change.** 05-91 already moved `payback.ts` and `investmentViews.ts` to `monthlyStepsOf`; this plan added the D-89 tests only.

## Device items

05-EXECUTION-NOTES "05-26 device checklist additions (Decide UX refresh)", entry 05-92: engine only; nothing visible until 05-103.

## Known Stubs

None.

## Self-Check: PASSED
