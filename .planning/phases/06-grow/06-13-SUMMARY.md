---
phase: 06-grow
plan: 13
subsystem: ui
tags: [calculators, payoff, growth, typed-input, expo-router]
requires:
  - phase: 06-grow plan 01
    provides: amortise, strategy, compoundSteps (engine/payoff), monthsToReach, depositDate (engine/grow)
  - phase: 06-grow plan 09
    provides: en.grow.calc and en.grow.debts copy, GrowGlyph, StateBadge
  - phase: 06-grow plan 21
    provides: CalcResultCard, HowWorkedOutBox, BarChart
provides:
  - Pure calculator models loanCalc, savingsCalc, compoundCalc, debtPayoffCalc
  - CalculatorsScreen (GC01) with a recordLinks prop, and the four typed calculators
  - Routes grow/calculators/{index,loan,savings,growth,payoff}
affects: [06-18, 06-19, 06-22]
key-files:
  created:
    - src/features/grow/calculators/typed/calcModels.ts
    - src/features/grow/calculators/typed/useCalcInput.ts
    - src/features/grow/calculators/typed/CalcFields.tsx
    - src/features/grow/calculators/typed/CalculatorsScreen.tsx
    - src/features/grow/calculators/typed/LoanCalculator.tsx
    - src/features/grow/calculators/typed/SavingsCalculator.tsx
    - src/features/grow/calculators/typed/CompoundCalculator.tsx
    - src/features/grow/calculators/typed/DebtPayoffCalculator.tsx
    - src/features/grow/calculators/__tests__/calcModels.test.ts
    - src/features/grow/calculators/__tests__/typedCalculators.test.tsx
    - app/(app)/grow/calculators/index.tsx
    - app/(app)/grow/calculators/loan.tsx
    - app/(app)/grow/calculators/savings.tsx
    - app/(app)/grow/calculators/growth.tsx
    - app/(app)/grow/calculators/payoff.tsx
  modified:
    - app/(app)/_layout.tsx
key-decisions:
  - "Models return minor units, counts, ISO dates and copy keys with values; money and dates inside worked-out values are wrapped ({money}, {date}) and formatted by the screen, so no English or formatting lives in the model."
  - "Calculators always show cents (formatter built with showCents true) whatever the Show cents setting says."
  - "Savings is null when saved already covers the target or the target is not reached in 600 deposits; the page then shows 'Fill in the numbers above'."
requirements-completed: [GRW-08, GRW-09, GRW-11]
completed: 2026-11-06
---

# Phase 6 Plan 13: Calculators page and typed calculators Summary

The D-21 Calculators page: a GC01 list plus loan, savings, compound growth and debt payoff calculators that work from typed numbers only, reproduce the prototype ledger to the cent, and save nothing.

## Tasks

| Task | Name | Commit |
|------|------|--------|
| 1 | Pure calculator models (ledger fixtures) | d75f1dc6 |
| 2 | Calculators page and four calculator screens | 6e843d03 |
| 3 | Thin calculator routes and stack registration | 1ffc4e46 |

## What was built

- **Models** call the engine directly (`amortise`, `monthsToReach`/`depositDate`, `compoundSteps`, `strategy`); no `Math.pow`/`Math.round`. Bounds: amounts 0..10^13, months 1..600, years 1..50. Any empty or invalid field, or an engine RangeError, gives `null`. The monthly-rate text for the worked-out box is bigint half-up to four places.
- **Ledger reproduced** (tests assert each): payment 40,076 / last 40,067 / interest 404,551; 18 deposits, May 2028, interest 11,990, total 511,990 (also 18 at 0%); 2,944,998 with put in 2,400,000; rate order 24 months, Nov 2028, 114,868, first cleared month 22; balance order 128,030, month 9; minimums only 41 months, Apr 2030, 218,434.
- **Screens**: results follow typing 150 ms later (`useDebounced`); amounts go through `MoneyInput` (the app parser); result card is the 06-21 polite live region; every result shows the always-visible worked-out box. Compound always shows the "Illustration, not a forecast" badge and a BarChart whose label names the end figure and the put-in amount. Debt payoff shows the two orders in identical cards (stacked above 1.3x font scale), a minimums-only card, "+ Add another debt" (1 to 6 debts), "With one debt, both orders are the same." and "The choice is yours."
- **Prefill**: `CompoundCalculator` takes `start`/`monthly` (digits, minor units) and `rate` (percent text); a bad value is ignored and that field starts empty. Fields stay editable. The growth route passes `useLocalSearchParams` values straight through.
- **Routes**: five thin routes under `app/(app)/grow/calculators/`, registered in the (app) Stack next to the decide entries, outside `Stack.Protected`.
- **Offline / never saved**: the screens read only the cached home currency and today's date (`useRecordContext`); no mutation, storage or cache write exists in `typed/` (a test greps for it).

## Verification

- `npx jest src/features/grow/calculators`: 23 tests pass (13 model, 10 screen). `src/theme` tests pass (47).
- `npm run typecheck` clean, `npm run depcruise` no violations, `npx eslint src/features/grow/calculators "app/(app)"` clean. Full `npm run lint` was started at the end; no errors were seen in the plan's files.

## Deviations from Plan

**1. [Rule 3 - Blocking] Extra file `typed/CalcFields.tsx`.** The four calculators share the labelled rate/whole-number field, label-value row, card, footer note, the formatting hook and the worked-line translator. Not in the plan's file list, but needed to avoid four copies; it is inside the plan's own directory.

**2. Model additions.** `PayoffResult.extraTo` (which debt the extra goes to in each order) and per-year `growth` in the compound result are computed in the model so the components do no arithmetic.

**3. Worktree base.** The worktree was not on the expected base, so it was reset to c8d1b06b as instructed before any work.

## Missing strings (not added; en.ts is owned by 06-09)

- A "name, month N" value for the payoff card's "First debt cleared" line. The card composes `Debt N · {{debtFreeValue}}` in code, so it reads "Debt 2 · 22 months" where the prototype reads "Personal loan, month 22".
- `grow.calc.payoff.debtFreeValue` is "{{count}} months" with no plural form, so a one-month result reads "1 months".
- The prototype names debts ("Credit card"); the typed screen uses "Debt 1", "Debt 2" because no name field copy exists.

## Known Stubs

None.

## Threat Flags

None. T-06-13-01 (bounds, null on invalid) and T-06-13-03 (nothing persisted or sent) are mitigated as planned; T-06-13-02 relies on the 06-09 copy (footers, badge, equal-weight cards).

## Self-Check: PASSED
