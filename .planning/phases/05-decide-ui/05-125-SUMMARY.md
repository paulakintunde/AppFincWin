---
phase: 05-decide-ui
plan: 125
subsystem: decide home
tags: [net-free-cash-flow, month-details, pots-link, DCU-35, D-100, D-101, R18.1]
requires: [05-120, 05-124, 05-131]
provides: [monthBreakdown, breakdownOut, POTS_HREF, NFCF card and Month details]
affects: [05-126, 05-127, 05-130, 05-26]
key-files:
  modified:
    - src/features/decide/home/homeCardModel.ts
    - src/features/decide/home/HomeSummaryCard.tsx
    - src/features/decide/home/MonthDetailsSheet.tsx
    - src/features/decide/home/YourMonthCard.tsx
    - src/features/decide/home/DecideHomeScreen.tsx
    - src/features/decide/home/useDecideHomeViewModel.ts
    - src/features/decide/home/checkHref.ts
    - src/features/decide/home/__tests__/ (homeCardModel, HomeSummaryCard, MonthDetailsSheet, LinesAndMonth, DecideHomeScreen)
metrics:
  completed: 2026-10-24
requirements: [DCU-35]
---

# Phase 5 Plan 125: Net free cash flow card and Month details Summary

The home card is now named Net free cash flow with the basis in its sub-line, Out counts everything that leaves so In - Out equals the hero on every basis, and Month details is a stacked breakdown that adds up to the hero with an always-visible "Pots >" link.

## Commits
- 394aecc1 feat(05-125): net free cash flow card eyebrow, basis sub-line and reconciling Out figure
- 19a07bdc feat(05-125): month details breakdown that adds up to net free cash flow, with the Pots link

## What was built
- `homeCardModel.ts`: new pure `monthBreakdown(source, today)` returns income, spending, debts, saving, setAside and result for a logged source (read from `prepareContext`) and for a rough source (`totalSetAside(source.pots, today)` taken off, so rough and logged follow one formula). The figure model carries `breakdown`; `outAmount = income - result`. `HomeCardFlags` gained a required `today`.
- `HomeSummaryCard.tsx`: constant eyebrow `card.eyebrow` + ⓘ `netFreeCashFlow` as the next flex sibling (dark), Details unchanged. `LABEL_KEY` points at `hero.sub*`; the tightest variant puts ⓘ `tightestFigures` beside the sub-line. Summary group uses `a11yNfcfLeft/Short` with the sub-line as `{{basis}}`. The `heroAmountText(amount, heroOneLineMax(width, fontScale))` rule (27a413b9) is untouched.
- `YourMonthCard.tsx` (`MonthDetailsBody`): the FigureStrip is replaced by `Breakdown` rows (Money in, Spending, Debt payments, Saving and investing, Set aside for pots with ⓘ `pots`, then the result under a rule). Zero rows hide, a negative result is true-minus in `danger` with the `resultShort` a11y label, and the `Pots ›` link (44 hit) is always shown.
- `MonthDetailsSheet.tsx`: basis meta line (`monthDetails.basis*`, ⓘ on tightest); `Pots ›` calls `onClose()` then `pushOnce(POTS_HREF)`.
- `DecideHomeScreen.tsx`: title is `monthDetails.title`; `CARD_LABEL_KEY` removed; passes `today` and spoken amounts. The Lines row text, `homeRowsModel` and `linesSet*` keys are untouched (05-126).
- `checkHref.ts`: `POTS_HREF = '/decide/pots' as Href` (route is created by 05-127).
- No copy keys were added; all keys come from 05-131.

## Hand-off notes covered
1. Rough figures now subtract `totalSetAside(result.pots)`; named test `D-100 rough figures take the pots set-asides off, like the logged formula`, plus a rendered Month details case.
2. `D-100 In minus Out equals the hero on every basis and on rough figures` covers worst, average, tightest, switched, rough, rough with pots and a short month, and a fast-check property covers random income, spending, saving, investing and pots (also asserting the rows add up).
3. Hero one-line rule kept as committed.
4. 05-126's Lines-row text not touched.

## Verification
- `npx jest src/features/decide`: 120 suites, 1717 tests pass (includes the D-76 text-fit allowlists, unchanged and exact).
- `npm run typecheck`: clean. `npm run depcruise`: no violations. `npx eslint src/features/decide/home`: 0 errors (warnings are pre-existing; none added).

## Deviations from Plan
- [Rule 3 - Blocking] `CARD_LABEL_KEY` in `DecideHomeScreen.tsx` was removed rather than re-pointed at `hero.sub*`: once the sheet title is the constant `monthDetails.title`, nothing in the screen consumed it. The basis meta line (which needs the distinct `monthDetails.basis*` wording) lives in `MonthDetailsSheet` as `BASIS_KEY`.
- `MonthDetailsBody` / `MonthDetailsSheet` gained a required `today` prop, and the view model exposes `wholeA11y` (spoken amounts); `useDecideHomeViewModel.ts` was in the plan's file list for this.
- Task 1's commit leaves `DecideHomeScreen.tsx` (not passing the new `today` flag) type-red at that single commit; task 2 fixes it. HEAD is green.
- The 320 / 2.0x eyebrow render test asserts structure (wrap, space-between, no line limit, 44 boxes and hit slop, no absolute position) because RNTL has no layout; real overlap is the device check.

## Known Stubs
None. `POTS_HREF` points at a route 05-127 creates; until then the link is a no-route push (the `as Href` cast is deliberate, per the plan).

## Device item
05-EXECUTION-NOTES "05-26 device checklist additions (Money concepts R18)", entry 05-125 (eyebrow at 320 / 2.0x, sub-line wrap, probes about 470 / 532 and 710 / 772, TalkBack summary group). Not ticked; requirement DCU-35 not marked complete.

## Self-Check: PASSED
- Commits 394aecc1 and 19a07bdc exist; files above modified; ROADMAP one-line tick of 05-125 only.
