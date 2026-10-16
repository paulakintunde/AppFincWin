---
phase: 04-decide-engine
plan: 05
subsystem: engine/decide
tags: [contracts, constants, market-defaults, series, currency, projection-rates]
requires: [04-01, 04-02]
provides: [decide types.ts contracts, cited behaviour constants, MARKET_DEFAULTS, assertCurrency, monthlyEquivalent, billsDueWithin, scheduledOutflowsDue, addDays, resolveProjectionRates, shared test fixtures]
affects: [04-06, 04-07, 04-08, 04-13, 04-14, 04-15, 04-16, 04-17, 04-18, 04-19, 04-20, 04-21, 04-22]
key-files:
  created:
    - src/engine/decide/types.ts
    - src/engine/decide/constants.ts
    - src/engine/decide/marketDefaults.ts
    - src/engine/decide/currency.ts
    - src/engine/decide/series.ts
    - src/engine/decide/projectionRates.ts
    - src/engine/decide/__tests__/constants.test.ts
    - src/engine/decide/__tests__/marketDefaults.test.ts
    - src/engine/decide/__tests__/currency.test.ts
    - src/engine/decide/__tests__/series.test.ts
    - src/engine/decide/__tests__/projectionRates.test.ts
    - src/engine/decide/__tests__/helpers/fixtures.ts
key-decisions:
  - "types.ts is type-only and carries every snapshot, check, plan, verdict and depth-expansion contract (D-41..D-63) so later plans code against it without exploring"
  - "constants.ts: every export sits under a // Cite: block, enforced by a static test; 12x and 36% lines cited as user-confirmed FincWin behaviour lines, values unchanged"
  - "scheduledOutflowsDue and billsDueWithin take horizonDays as a required argument (no default parameter), so the 100% branch gate has no untestable default branch"
  - "CashDipInput stays a multi-line interface after formatting; the plan's one-line grep for it does not match, field order and types are identical"
requirements-completed: [DEC-12, DEC-20, DEC-27, DEC-30, DEC-32, DEC-33, DEC-34]
completed: 2026-10-16
---

# Phase 4 Plan 05: Decide contracts, constants and series maths Summary

Interface-first foundation for the Decide engine: the full type contract (snapshot, check, plan, verdict, depth expansion D-41..D-63), cited behaviour constants, per-market card defaults, the single-currency guard, recurring-series maths (monthly equivalents, bills due within 90 days, dated scheduled outflows), the shared projection-rate list and the shared test builders.

## Commits
- e773667 test: decide constants and market defaults (RED)
- 7a9f82e feat: decide contracts, constants, market defaults (GREEN)
- 45aec59 test: currency guard and series maths (RED)
- fcfa318 feat: currency guard, monthly equivalents and bills due (GREEN)
- a8814f9 test: expansion constants and D-58 citations (RED)
- 7e9edb4 feat: depth-expansion contracts and cited constants (GREEN)

## Results
- decide + payoff jest: 231 tests pass; 100% statements/branches/functions/lines on every decide source file (types.ts is type-only).
- tsc: only the known expo-blur error in TabBar.tsx. eslint clean on touched files. depcruise and check:ignores clean. Golden harness `--check` exits 0.
- Acceptance greps from the plan pass (29 expansion types declared, 7 Phase 5 alignment interfaces, 37 Cite blocks, osfi/fannie URLs once each, no currency amounts or default rates in constants.ts).

## Deviations from Plan

**1. [Rule 3 - Blocking] Default parameter values removed from billsDueWithin / scheduledOutflowsDue**
- **Issue:** `horizonDays = BILLS_DUE_HORIZON_DAYS` creates a default-argument branch that tests always override, which would break the 100% branch gate.
- **Fix:** horizonDays is a required parameter (the plan signature already lists it as required).

**2. [Rule 3 - Formatting] types.ts is formatted multi-line**
- **Issue:** The plan's contract block uses long single-line interfaces; the plan's grep gate for `CashDipInput` expects `readonly cashAfter: MinorUnits; readonly cashOnHand: MinorUnits }` on one line.
- **Fix:** none needed semantically. Fields, types and comments are identical; only that one literal grep returns 0. All other acceptance greps match.

**3. Test-process note:** an accidental repo-default prettier run reformatted four pre-existing decide files; they were restored with `git checkout` before any commit. Own files were re-formatted with single quotes, width 120.

## Known Stubs
None.

## Threat Flags
None. (T-04-05-01..07 mitigations are implemented: assertCurrency, confirmed-only bills and no detect.ts import, null for unsourced market values, RangeError guards, STRESS_OFFSETS boundary test, D-58 static citation test, scheduledOutflowsDue guards.)

## Self-Check: PASSED
