---
phase: 06-grow
plan: 19
subsystem: ui
tags: [calculators, goals, debts, growth, make-this-the-plan, expo-router]
requires:
  - phase: 06-grow plan 13
    provides: calcModels (parseRateText, MAX_YEARS), CalcFields, CalculatorsScreen recordLinks, prefill helpers
  - phase: 06-grow plan 21
    provides: CalcResultCard, HowWorkedOutBox, LinkedPairFields, ChangeRows, BarChart, Stepper
  - phase: 06-grow plans 12, 14
    provides: useSaveGoalPlan, useSaveDebtPlan, goals/debts/investing read models
provides:
  - goalCalcModel, debtExtraModel, growthIllustrationModel (pure, engine-backed)
  - GoalCalculator, DebtExtraCalculator, GrowthIllustration, MakePlanSheet
  - Routes grow/calculators/goal/[id], debt/[id], illustration
  - Entry links from goal detail, debt detail, investing segment, holding detail and the Calculators page
affects: [06-20]
key-files:
  created:
    - src/features/grow/calculators/record/recordCalcModels.ts
    - src/features/grow/calculators/record/GoalCalculator.tsx
    - src/features/grow/calculators/record/DebtExtraCalculator.tsx
    - src/features/grow/calculators/record/GrowthIllustration.tsx
    - src/features/grow/calculators/record/MakePlanSheet.tsx
    - src/features/grow/calculators/record/useRecordLinks.ts
    - src/features/grow/calculators/__tests__/recordCalcModels.test.ts
    - src/features/grow/calculators/__tests__/recordCalculators.test.tsx
    - app/(app)/grow/calculators/goal/[id].tsx
    - app/(app)/grow/calculators/debt/[id].tsx
    - app/(app)/grow/calculators/illustration.tsx
  modified:
    - app/(app)/_layout.tsx
    - app/(app)/grow/calculators/index.tsx
    - src/features/grow/goals/GoalDetailScreen.tsx
    - src/features/grow/debts/DebtDetailScreen.tsx
    - src/features/grow/debts/DebtsSegment.tsx
    - src/features/grow/debts/debtScreenData.ts
    - src/features/grow/investing/InvestingSegment.tsx
    - src/features/grow/investing/HoldingDetailScreen.tsx
key-decisions:
  - "Models call engine/grow (goalPlanByMonthly, goalPlanByDate, depositDate) and engine/payoff (fixedPayoff, compoundSteps); the only other arithmetic is integer add/subtract and one half-up whole percent via divideHalfUp."
  - "Make this the plan writes only through useSaveGoalPlan (existing record passed back so an edit never stops it) and useSaveDebtPlan; no write on Not now, Cancel or backdrop (tested). The server builds the debt-plan Undo; the goal toast uses useGoalToast."
  - "The goal calculator is for goals in the home currency (the into-goals and left-in-month figures are home-currency). A goal in another currency, or with no target, shows no calculator and no link."
  - "Growth illustration is fixed at 10 years and takes start, rate and monthly from route params; the badge is not optional."
requirements-completed: [GRW-01, GRW-03, GRW-08, GRW-09, GRW-11]
completed: 2026-11-06
---

# Phase 6 Plan 19: Record calculators and Make this the plan Summary

The three record-based calculators (D-17 goal, D-18 debt extra payment, D-19 growth illustration) and the shared "Make this the plan" confirm (D-20), reachable from goal detail, debt detail, investing and the Calculators page.

## Tasks

| Task | Name | Commit |
|------|------|--------|
| 1 | Record calculator models | cf7d8682 |
| 2 | Record calculator screens, Make this the plan, routes | 63d897ff |
| 3 | Entry links from goal, debt, investing and the Calculators page | c36d29a3 |

## What was built

- **Models** reproduce LEDGER GC02, GC04 and GC05 to the cent (tests assert 8286, 4834, 11145, 4091444, 2944998 and every table row): $82.86 by Dec 2027 (rounded up), $48.34 by Oct 2028, +$50 gives 26 payments, Dec 2028, 11,145 saved, last 1,491, 11% of pay; 4% growth gives 4,091,444 with 3,169,000 put in.
- **GoalCalculator**: linked "Each month" / "Reaches by" fields (the date field uses MM/YYYY so a derived value can be edited), a stepper in $25 steps, "Or reach it by" chips, live-region result, the "What changes each month" rows, the amber line note only below the saving line, a worked-out box, and a quiet "This is your plan now" line instead of the button when the amount equals the current plan.
- **DebtExtraCalculator**: chips None / +$25 / +$50 / +$100 (plus the saved extra if it differs), paid-off figure and sentence, rows, share of pay, two equal Payoff order cards with the one-debt note, and "Try it with more debts" to the payoff calculator.
- **GrowthIllustration**: fixed "Illustration, not a forecast" badge under the title, rate chips 2/4/6 (plus a linked rate), BarChart with legend and label, the tint note and the footer.
- **MakePlanSheet**: before -> after rows, note, primary "Make this the plan" and "Not now"; the owner's onConfirm runs once, Cancel/backdrop/Not now call onCancel only.
- **Entry links**: goal detail "Try other amounts or dates" (target, home currency, not the safety net); debt detail "Try other amounts" (debts with a rate); investing segment and holding detail "See what it could grow to" now open the illustration; the Calculators page builds "With your records" through `useRecordLinks` (first goal with a target not yet reached, first debt with a rate, investing when holdings exist; absent with none).

## Deviations from Plan

**1. [Rule 3 - Blocking] `payAccountId` moved from DebtsSegment to debtScreenData.** The debt calculator needs the same "which account the extra leaves" rule; importing DebtsSegment would pull the whole segment. DebtsSegment now imports it. Behaviour unchanged.

**2. [Instruction override] app/(app)/_layout.tsx edited.** The plan said expo-router auto-registers; the executor note asked for the three new routes to be declared next to the other Grow routes, outside `Stack.Protected`. Done.

**3. [Design] New file `useRecordLinks.ts`.** The plan has index.tsx build the links; the hook keeps the route thin and testable.

**4. [Design] Entry-link assertions live in the existing screen test files** (goalScreens, debtScreens, investingScreens) where the screen mocks already exist; the Calculators page links are tested in recordCalculators.test.tsx.

**5. Holding detail link target changed** from `/grow/calculators/growth` to `/grow/calculators/illustration` (the account-detail link in record/accounts still uses the typed growth calculator; not in this plan's files).

## Notes for later plans

- No `en.ts` strings were added; every string used already existed under `en.grow.calc`. Missing: a long-form month for spoken announcements (the announcement uses the short "Oct 2028" form) and a copy key for a goal in a non-home currency (the calculator simply is not offered).
- The debt calculator has no worked-out box (no copy exists for it in `en.grow.calc.debtExtra`).
- The Payoff order cards are equal single-debt cards; the multi-debt order comparison remains in the typed payoff calculator.

## Known Stubs

None.

## Threat Flags

None. T-06-19-01 (no write before confirm, tested for Not now and backdrop, Undo toast), T-06-19-02 (fixed badge, tint note, footer; copyLint passes) and T-06-19-03 (ceiling rule via engine goalPlanByDate) are mitigated.

## Verification

- `npx jest src/features/grow/calculators` 54 pass (16 model, 12+3 record screens/links); goals, debts, investing whole-file suites 114 pass; `src/i18n`, `src/theme` and `src/features/grow/__tests__` (copyLint) pass.
- `npm run typecheck` clean; `npm run depcruise` no violations; `npm run lint` 0 errors.
- Not run: full coverage (per milestone rule).

## Self-Check: PASSED

Created files exist; commits cf7d8682, 63d897ff and c36d29a3 exist.
