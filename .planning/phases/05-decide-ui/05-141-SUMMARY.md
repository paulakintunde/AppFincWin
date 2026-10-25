---
phase: 05-decide-ui
plan: 141
subsystem: decide-copy
tags: [copy, i18n, D-106, D-107, DCU-09]
requirements: [DCU-39, DCU-35, DCU-09]
key-files:
  modified: [src/i18n/locales/en.ts, HomeSummaryCard.tsx, YourMonthCard.tsx, infoTerms.test.ts, r18Retired.test.ts, HomeSummaryCard.test.tsx, MonthDetailsSheet.test.tsx, LinesAndMonth.test.tsx, HomeProblemsSheet.test.tsx]
  created: [src/i18n/__tests__/d106Wording.test.ts, src/i18n/__tests__/d106Retired.test.ts]
metrics:
  completed: 2026-10-24
---

# Phase 5 Plan 141: Free / overspent wording, part 3 Summary

The home card and Month details word the month figure free / overspent (amount absolute, overspent in the danger tint), every string the This-month and Judge-on plans need is in the catalogue, and two guard tests keep "left" / "short" out of month figures.

## Commits
- e0ed57fb feat(05-141): card, Month details, strings
- 62dffd4a test(05-141): d106Wording and d106Retired guards

## New keys (all under `decide.`)
- home.card.a11yNfcfFree 'Net free cash flow: {{amount}} free {{basis}}. In {{in}}, out {{out}}.'
- home.card.a11yNfcfOverspent 'Net free cash flow: {{amount}} overspent {{basis}}. In {{in}}, out {{out}}.'
- home.card.judge.month 'This month' / worst 'Worst month' / average 'Average month'
- home.card.judge.a11y 'Judged on {{basis}}. Opens the choices.'
- home.card.judge.sheetTitle 'Judge on'; sheetBody 'The card and every check use this choice.'
- home.card.judge.sheetWaiting 'This month is waiting for a {{currency}} rate, so it shows the worst month.'
- home.hero.freeWord 'free'; overspentWord 'overspent'
- home.hero.summary '{{amount}} free · In {{in}} · Out {{out}}'; summaryOverspent '{{amount}} overspent · In {{in}} · Out {{out}}'
- home.hero.subMonth 'this month, after spending, debts and everything set aside'
- home.hero.monthWaitingRate 'This month is waiting for a {{currency}} rate'
- home.monthDetails.basisMonth 'Worked out on this month as it is expected to end.'
- home.monthDetails.resultOverspent 'Net free cash flow, {{amount}} overspent'
- month.thisMonthChip 'This month · {{amount}}'
- verdict.compare.title 'The outcome on each basis'; month / worst / average as the judge rows; chosen 'Used for this check'; rowA11y '{{basis}}: {{state}}, {{figure}}'; rowA11yChosen '{{basis}}: {{state}}, {{figure}}. Used for this check.'; waiting 'Waiting for a {{currency}} rate, shown as the worst month'

## Reworded
- home.problems.noMonth.affects 'Net free cash flow and every check'
- info.netFreeCashFlow.body: the plan's text, merged to 3 sentences (see Deviations)
- section.optTermStill 'still short' -> 'still overspent' (a month figure the d106Wording guard caught)

## Retired (grep-first, no consumers left)
home.hero.left / short / leftWord / shortWord / summaryShort; home.card.a11yNfcfLeft / a11yNfcfShort; home.monthDetails.resultShort. (verdict.key.leftCaption, decision.leftAfter, depth.income.rows.left, section.lineMonthDesc were already gone from 05-136/137.)

## Code
- HomeSummaryCard: hero word, summary line and screen-reader label switch on `model.short` to the free / overspent keys.
- YourMonthCard Breakdown: result row value is `refText(t, monthFigure(b.result, whole))`; a11y label is rowA11y when free, resultOverspent when overspent. Other rows keep their minus signs.

## Tests
Named: 'D-106 the card hero reads free with the amount absolute', 'D-106 an overspent hero is dangerTint2 with the word overspent and no minus', 'D-106 the card screen-reader line says free / overspent', 'D-106 Month details result row prints the words, other rows stay plain', 'D-106 the quick-result summary line says free while a result is open' (name adjusted: the plan's text "says overspent" would not describe the positive case the existing test covers; the overspent variant is covered by the hero and screen-reader tests). Guards: d106Wording (allowlist of 26 cash / cushion / card-balance / count / "Left blank" paths, each with a reason, both directions checked; placeholders like {{left}} are stripped before matching), d106Retired (retired keys gone, replacements and This-month strings exist). infoTerms.test.ts, r18Retired.test.ts, HomeProblemsSheet, LinesAndMonth updated for the new wording.

## Verification
- `npx jest` whole suite: 629 suites, 24568 passed, 14 skipped, 0 failed.
- `tsc --noEmit` clean; eslint 0 errors (835 pre-existing warnings); depcruise clean.

## Deviations
- [Rule 1] info.netFreeCashFlow.body: the plan's wording is 5 sentences; the existing D-70/D-84/D-100 tests cap info bodies at 3. Joined with a semicolon and a comma ("...before month end; it can instead be worked out on your worst month or the average, as the line under it says, and checks use the same choice."). Same content.
- [Rule 1] decide.section.optTermStill reworded to 'still overspent' (month figure).
- Files outside files_modified: none beyond the plan list (HomeProblemsSheet.test.tsx and LinesAndMonth.test.tsx were already listed).
- Decision for later plans: decide.info.netFreeCashFlow.body is on the d106Wording allowlist (the definition "what is left of a month" is prose, not a figure being read out). Reword it if the user wants that gone too.
- src/features/decide/copy/__tests__/alternativesOptions.test.ts is modified in the working tree by the other executor (05-138); untouched here.

## Device item
05-EXECUTION-NOTES "05-26 device checklist additions (Wording and This month, D-106)", entry 05-141: home card reads "$X free" / "$X overspent" with no minus; Month details result row the same; VoiceOver/TalkBack lines say free / overspent.

## Self-Check: PASSED
