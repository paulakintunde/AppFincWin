---
phase: 05-decide-ui
plan: 17
subsystem: decide-check-step4-step5
tags: [decide, ui, check-flow, step4, step5, alternatives, written-lines, tdd]
requires: [05-07, 05-08, 05-09, 05-10, 05-28, 05-31]
provides:
  - Step4Alternatives (four rows, suppression reasons, cheaper trade, optional rate)
  - Step5Decision and Step5Props (outcomes, wait panel, paying account, Into, What gets written)
  - writtenLines (pure, shared with the 05-29 confirm sheet) and WrittenCtx
affects: [05-20, 05-29, 05-30, 05-45, 05-46]
key-files:
  created:
    - src/features/decide/check/steps/Step4Alternatives.tsx
    - src/features/decide/check/steps/Step5Decision.tsx
    - src/features/decide/check/writtenLines.ts
    - src/features/decide/check/steps/__tests__/Step4Alternatives.test.tsx
    - src/features/decide/check/steps/__tests__/Step5Decision.test.tsx
    - src/features/decide/check/__tests__/writtenLines.test.ts
decisions:
  - writtenLines ctx carries `today` and `investAccountName` in addition to the plan's list; the screen and the confirm sheet pass both
  - A rate is appended to inputs.projectionRates on blur (not per keystroke), so typing "5.5" never stores "5"
  - Go ahead's paying-account default is written by an effect once outcome is 'go' (so a reopened check gets it too)
metrics:
  tasks: 2
  files: 6
  completed: 2026-10-16
---

# Phase 5 Plan 17: Step 4 alternatives and Step 5 decision Summary

Step 4 shows the four alternatives as stacked rows with a dash and one amber reason wherever the money is not genuinely spare, a free (no lock, no `canUse`) table, a 0% default Kept with an optional first rate, and the cheaper trade; Step 5 offers Go ahead, Wait and save and Pass over a "What gets written" list built by the pure `writtenLines` that mirrors 05-20's write branch for branch.

## Commits
- f6ab05c: Step4Alternatives and tests (Task 1)
- 86e941c: writtenLines, Step5Decision and tests (Task 2)

## What was built
- **Step4Alternatives**: heading `Four ways, same {horizonMonths} months`; rows as_planned (fill5, Kept dash, no reason), cheaper, wait_and_save, skip; descriptor one line (two above 1.3x); A month in cents, On the day and Kept whole. `suppressionReason` supplies exactly one reason (all five codes plus `exceeds_range`). Kept header from `keptHeader`; `+ Add a rate` reveals `RateInput`, refused above 100% with `decide.depth.invest.rateCap`, hidden at three rates, chip removes the first rate. Spend-less card with the 30..100 slider; trade line idle / thin / kept / kept-with-growth / too-large (`tradeKeptTooLarge`); `Use the cheaper price` through `repriceInputs` (hidden when null or for an invest check); `Wait and save` sets outcome wait and goes to step 5.
- **writtenLines**: cash, loan (deposit, debt line, then/final lines per `paymentSteps` run, no debt line with nothing financed), instalment, card (on-card, day-one remainder plus fees as one deposit line, payoff runs for `months`), running costs, investing drops or untouched; invest lump (transfer or pending payment) and monthly; wait (target, reminder when a ready-by exists, no-change line, kept line); pass (three lines).
- **Step5Decision**: plan card (price and method, On the day, A month in cents, Left after negative in danger), three `ChoiceCard`s with `goFlagBreaks` when not fits and `goDescShort` when the month is short, wait panel (Put aside figure, Ready by, 2 500 step slider up to twice what is spare, within/beyond note), Paid from account list (largest balance default), Into list for same-currency tracked investment accounts, What gets written card, read-only locks.

## Verification
- `npx jest src/features/decide/check --silent`: 9 suites, 173 tests passed (writtenLines 18, Step4 28, Step5 17).
- `npm run typecheck` clean; `npm run lint` 0 errors (684 pre-existing warnings); `npm run depcruise` clean; `noRawColours` passes.
- All acceptance greps hold (canUse 0, projectionReturnText 0, keeps earning 0, twelve months 0, named tests present).

## Deviations from Plan
**1. [Rule 3 - Blocking] `writtenLines` ctx gained `today` and `investAccountName`.** The plan's ctx list has no way to date a payment when needBy is empty or to name the investment account for the transfer line.
**2. [Rule 2 - Match the writes] Card paid over months lists `writtenCardPayoff` per payment run.** 05-20 writes those series (iteration-3 checker) though this plan's behaviour list omitted the line; the key already exists in the catalogue.
**3. [Design token] The Wait and save button on the ink trade card uses `inkDim` fill with `surface` text** in place of `surface@.12`, since there is no alpha token (CLAUDE.md: tokens only).
**4. [Interpretation] The paying-account row shows for every method (cash, loan, instalment, card) of a Go ahead,** since each writes at least a day-one cash row or a payoff series; the plan said "a cash method".
**5. [Interpretation] The Into list filters on the snapshot currency,** because `Step5Props.cashAccounts` carries no currency (the plan's interface).
**6. [Edge] Wait with no ready-by date omits the target and reminder lines** (the catalogue lines need a date); the closing "Nothing else changes" line stays.
**7.** `Step5Decision` reads Wait figures from `computation.waitPlan` and writes `inputs.wait.monthlyAmount`; the tertiary goal preview and cooling-off toggle are 05-46's.

## Human / device items
- DCU-11 fold at 402x874: four stacked rows (each at most 114dp) plus the reason lines, on device.
- Slider drag feel (Gesture.Pan snap to 1 percent and 2 500 units) and the blur-to-add of the rate field with the numeric keyboard dismissed by tapping elsewhere.
- Copy pass: `decide.alt.rateChip` chip uses a literal multiplication sign as the remove mark.

## Known Stubs
None. Step 5 does not commit: wiring to 05-20/05-29 is those plans' job by design.

## Threat Flags
None.

## Self-Check: PASSED
- src/features/decide/check/steps/Step4Alternatives.tsx, Step5Decision.tsx, writtenLines.ts and the three test files exist.
- Commits f6ab05c and 86e941c are on phase/05-decide-ui.
