---
phase: 05-decide-ui
plan: 140
subsystem: decide-home
tags: [D-106, D-107, judge-on, fab, month-details]
requirements: [DCU-40, DCU-39, DCU-35, DCU-34, DCU-14]
key-files:
  created: [src/features/decide/home/JudgeOnControl.tsx, JudgeOnControl.test.tsx, DecideHomeJudgeOn.test.tsx, DecideFabClearance.test.tsx]
  modified: [HomeSummaryCard.tsx, YourMonthCard.tsx, MonthDetailsSheet.tsx, DecideHomeScreen.tsx, QuickCheckForm.tsx, QuickResult.tsx, en.ts, and the tests listed below]
metrics:
  completed: 2026-10-24
---

# Phase 5 Plan 140: Judge-on dropdown, Month details sync, FAB back Summary

The card has a "This month ▾" Judge-on dropdown, Month details shows the same three-option choice, one `useChooseJudgeOn` drives card and checks, the quick result carries the waiting-for-a-rate note, and the New check FAB is back on Decide home.

## Commits
- f4ab602c feat(05-140): dropdown on the card, fallback line, quick-result note
- 4c481177 feat(05-140): Month details three-option radio list
- a9f134a2 feat(05-140): screen wiring and the FAB

## Built
- `JudgeOnControl.tsx`: `JudgeOnButton` (DarkPill tint, "{name} ▾", role button, 44 high; plain "This month" label under 3 full months; nothing until read), `JudgeOnSheet` (app Sheet, body line, optional waiting line, three radios, haptic + close), `canChooseJudgeOn(source)`.
- `HomeSummaryCard`: button sits in the eyebrow row between the eyebrow and Details; owns the sheet open state; renders `decide.home.hero.monthWaitingRate` in `inkSoft1` under the sub-line on fallback (hidden with a quick result). New prop `onChooseJudgeOn`.
- `YourMonthCard` `MonthDetailsBody`: control is now This month / Worst / Average as a stacked radio list (labels `This month · {{expected money in}}` via `expectedMonthMoney`, Worst/Average chips); history line only for Worst/Average; fewer than 3 months = no control; under a fallback This month has no amount and stays checked. Props `selected`, `fallback`, `onChooseJudgeOn`; it no longer writes settings itself.
- `MonthDetailsSheet`: passes `card.selected/fallback`, shows the waiting line above the rows.
- `DecideHomeScreen`: `useJudgeOn` + `useChooseJudgeOn` once, `choose` passed to card and sheet; judgeOn into `homeCardModel`; `useRegisterFab(fab)` with New check (D-107 supersedes D-98's removal; header comment updated).
- `QuickResult`/`QuickCheckForm`: `waitingCurrencies` prop; the note renders under the result and joins the polite live-region label.
- `en.ts`: `decide.fab.label` 'New check', `decide.fab.a11y` 'Starts a new affordability check' restored. No other new strings.

## Tests
Named tests in the plan are present: HomeSummaryCard (Judge-on describe), JudgeOnControl, LinesAndMonth, MonthDetailsSheet, DecideHomeScreen (FAB, loading, shared choose), DecideHomeJudgeOn (real hook and store: opens on This month with stored Worst override, Worst writes basis_override once and card moves, This month writes nothing, late settings do not flip), DecideFabClearance (real TabRootScreen vs FAB_CLEARANCE), Fab.test (strings resolve, Decide registration), QuickCheckForm (fallback note, dark and light), r18Matrix and r18ReadingOrder (dropdown in order and 44 targets across the matrix).

## Verification
- `npx jest` full: 634 of 636 suites pass; 24676 tests passed. The 2 failures (`stackPerf.test.ts` 1048 ms vs a 1000 ms bound, `AppStatusBar.test.tsx` hook timeout) are load-timing flakes under the full parallel run; both pass alone (3/3). Not touched by this plan.
- `npm run typecheck` clean; `npx eslint src` 0 errors (warnings none in files touched here); `npm run depcruise` no violations.
- decideTextFit passes unchanged: no new `numberOfLines`, fixed height or absolute in decide files.

## Deviations
1. [Design] Presentational props instead of hooks inside the components: the screen calls `useChooseJudgeOn` once and passes `onChooseJudgeOn` to `HomeSummaryCard` and `MonthDetailsSheet`/`MonthDetailsBody`, rather than each calling the hook. Same function for dropdown and sheet (so they always agree), card/sheet component tests need no QueryClient. The plan's key_link `JudgeOnControl -> useChooseJudgeOn` is therefore `DecideHomeScreen -> useChooseJudgeOn`.
2. [Rule 3] `QuickResult.tsx` also edited (not in files_modified): the note must live in its live region.
3. Dropdown shows only for a logged source with a figure; rough/first-run/unavailable cards show none.
4. `useChooseJudgeOn(userId ?? '')` when signed out, with `onChooseJudgeOn` guarded on `userId !== null`.
5. DecideHomeScreen.test mocks the store and `useChooseJudgeOn`; the real wiring is covered in the new DecideHomeJudgeOn.test.

## Device items
05-EXECUTION-NOTES "05-26 device checklist additions (Wording and This month, D-106)": entries 05-139, 05-140, 05-143. For 05-140: dropdown reachable and clear of the FAB at 320 and 402, 1.0x and 2.0x; sheet choices; Month details radio list matches; FAB visible with New check on Decide home; TalkBack order summary, dropdown, Details, field.

## Self-Check: PASSED
