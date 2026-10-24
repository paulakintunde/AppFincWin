---
phase: 05-decide-ui
plan: 18
subsystem: decide-demo-fixture
tags: [decide, demo, fixture, app-review, tdd]
requires: [05-06, 05-07]
provides:
  - DEMO, demoRows, demoSource, sofaInputs, carInputs (src/features/decide/__tests__/helpers/demoScenario.ts)
  - demoScenario.json, the single source of the demo figures that 05-51 mirrors in the SQL seed
affects: [05-51, 05-52]
key-files:
  created:
    - src/features/decide/__tests__/helpers/demoScenario.json
    - src/features/decide/__tests__/helpers/demoScenario.ts
    - src/features/decide/__tests__/demoScenario.test.ts
decisions:
  - Salary pays on the 5th (not the 1st) and Subscriptions moves to the 1st, so the cash path's lowest day is not the day before payday (cash_path margin on_edge on 2026-12-31) while the oldest month still starts on a 1st and counts as full
  - Settings are non-null: investing_floor typed as 0, because the engine's default floor equals the monthly investing figure and leaves the 'inv' margin at exactly 0, always flagged on_edge
  - The same monthly template fills the current month and the six past months (no separate current-month set)
metrics:
  tasks: 1
  files: 3
  completed: 2026-10-16
---

# Phase 5 Plan 18: Demo scenario fixture Summary

A single-source demo fixture (six full months, a confirmed Salary series, savings and investment transfers, a student loan, a paid-in-full card) proven through the real snapshot builder and engine to give a sofa that fits and a car that needs adjusting and spreading, for four dates.

## What was built

- **demoScenario.json**: every constant (accounts, monthly template, transfers, debt, card debt, settings, both check inputs). The car APR is the typed text `"6.9"`.
- **demoScenario.ts**: `demoRows(today)` (current month plus six past months, paid or pending by day, transfer legs, Salary rows carrying the series id), `demoSource(today)` (balances = opening + paid rows, region `'US'` explicit, empty customCurrencies/changes/paymentLinks, Salary series, both debts rows), `sofaInputs` (combine false), `carInputs` (combine true).
- **demoScenario.test.ts**: for 2026-10-15, 2026-11-01, 2026-12-31 and 2027-03-15, builds the snapshot (logged, 6+ full months, no unconverted, no conversions, cardsWithoutMinimum 0, cardsMinimumWithoutRate 0, card paidInFull, one income series), asserts sofa `fits`, car `adjust` with 2+ warnings, `needs_spreading` and at most 3 suppressed alternatives, and the stacked part 2 assertions (combinedDiffers false for both, confidence strong, no basis codes, cash path available, no cash_tight_before_payday, no on_edge margin, worstMonth.differsFromNow false).

## Final tuned figures (USD whole units unless stated)

Income Salary 4,400 on the 5th (monthly series); Rent 1,600 (2nd); groceries 4 x 140 (4th, 11th, 18th, 25th); Utilities 170; Transport 220; Dining 180; Subscriptions 40 (1st); Insurance 150; Student loan payment 190 (22nd, Debt); transfers 500 to Savings and 400 to Investments (3rd). Openings: Everyday 2,400, Cash 80, Savings 7,200 (plan start 3,800), Investments 2,000. Student loan 6,200 at 5.5%, minimum 190. Sofa 1,800 cash, combine off. Car 14,500, loan deposit 7,000 (plan start 3,000), 24 months (start 48), APR text "6.9", secured; running costs Insurance 160, Fuel 140, Parking 60; replaces Bus pass 120. Cash at seed time is therefore about 17,000, not the plan's approximately 12,000.

## Deviations from Plan

**1. [Rule 1 - plan truths in conflict] Typed investing floor of 0 in settings.** The plan says settings null, but with the default floor the 'inv' margin is exactly 0 and the engine flags it `on_edge` (isOnEdge, 04 D-43) whenever nothing is paused, which contradicts the "no on_edge margin" truth. `demoSource` therefore returns settings with `investing_floor: 0` and every other limit null. **05-51 must write a settings row with `investing_floor = 0` for the demo household** (or the mirror check will find the seed's verdict differs).

**2. [Tuning, within the plan's allowance] Figures changed from the starting set**: Savings opening 7,200, car deposit 7,000, term 24, Salary on the 5th, Subscriptions on the 1st (reasons in the decisions above). No engine code and no target was changed.

**3. [Interpretation] One template for every month.** The plan's "current-month rows of the existing seed + 6 past months" would mix two figure sets; the plan's own starting figures describe a single monthly set, so the current month uses it too (status paid when the day is on or before today, else pending, matching the seed's rule). 05-51 should replace the old current-month rows with this template.

No engine edits. No migrations created.

## Verification

- `npx jest src/features/decide/__tests__/demoScenario.test.ts --silent`: 20 tests pass (4 dates x 5).
- `npm run typecheck`: clean. `npm run lint`: 0 errors (existing warnings only). `npm run depcruise`: no violations.
- Acceptance greps: aprText "6.9" 1, "paid_in_full": true 1, region: 'US' 1, "combine": false 1, combinedDiffers 2, needs_spreading and 'fits' present.

## Known Stubs

None.

## Human verification

None (pure logic). For 05-51 the seed must reproduce the fixture exactly, including the settings row (deviation 1).

## Self-Check: PASSED
