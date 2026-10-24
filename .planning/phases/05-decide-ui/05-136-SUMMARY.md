---
phase: 05-decide-ui
plan: 136
subsystem: decide-copy
tags: [copy, i18n, D-106, D-105, D-107, DCU-09, DCU-39]
requirements: [DCU-39, DCU-09]
key-files:
  created: [src/features/decide/copy/monthFigure.ts, src/features/decide/copy/__tests__/monthFigure.test.ts]
  modified: [src/i18n/locales/en.ts, keyFiguresCopy.ts, foldCopy.ts, MonthSection.tsx, LinesSection.tsx, step3Folds.tsx]
metrics:
  completed: 2026-10-24
---

# Phase 5 Plan 136: Free / overspent wording, part 1 Summary

A signed month figure on the verdict side of Decide now reads "{{amount}} free" or "{{amount}} overspent" (absolute amount, no minus), decided by one shared helper `monthFigure` / `isOverspent`. The D-105 pause naming is kept. The D-107 month-basis strings are in the catalogue.

## Commit
- f8ce7b16 feat(05-136): single commit for both tasks (en.ts is shared by both, so the tasks could not be split cleanly).

## New strings (decide.*)
- fig.free '{{amount}} free'; fig.overspent '{{amount}} overspent'
- verdict.key.freeCaption 'Free a month'; overspentCaption 'Overspent a month'; a11y 'Free each month after this: ...'; a11yOverspent 'Overspent each month after this: ...'
- verdict.titleNoAlreadyShort 'Your {{basis}} month is {{already}} overspent. This makes it {{short}}.'; ...Same 'Your {{basis}} month is already {{already}} overspent either way.'; titleNoMonthShort 'The month ends {{short}} overspent.'
- quick.line.cashMonthShort 'Cash covers it. Even with saving paused, the month would end {{short}} overspent.'; ...NoPause 'Cash covers it, but the month would end {{short}} overspent.'; creditShort '... The month is {{short}} overspent.'; creditShortZero '... Still {{short}} overspent, so no rate makes it fit.'
- warn.monthTitle 'Still overspent with saving paused'; monthValue '{{amount}}'; monthAlready / monthAlreadySame '... already {{already}} overspent before this purchase ...'; monthPaused '... leaving {{short}} overspent.'
- section.rowLeft 'Month end'; monthSummary and fold.preview.month 'Month end: {{after}}'; monthShort 'The month would be {{amount}} overspent. ...'; lineMonthFree '{{amount}} free at month end'; lineMonthOverspent '{{amount}} overspent at month end'; lineOverspent 'Overspent {{amount}}' (lineShort kept for cash)
- D-107 month basis: verdict.titleNoAlreadyShortMonth, titleNoAlreadyShortSameMonth, bodyOtherMonth; warn.monthAlreadyMonth, monthAlreadySameMonth; section.monthNoteMonth, monthClosesMonth, optEarnDescMonth, asIncomeValueMonth; basis.month 'This month · {{amount}} in'
- Retired (grep clean): verdict.key.leftCaption, section.lineMonthDesc.

## Verification
- `npx jest` whole suite: 623 suites, 24327 passed, 14 skipped, 0 failed. decideTextFit 6/6.
- `tsc --noEmit` clean; eslint 0 errors (60 pre-existing warnings); depcruise clean.

## Deviations
- [Rule 3] Edited step3Folds.tsx (not in files_modified) for the new single-argument `monthPreview`, and infoTerms.test.ts (refresh-key list names the retired/added keys).
- Rule T tests: demo-value title is 59 characters, not 62 (still under the 64 cap). Wide-amount ($123,456.78) Month titles assert at most 64.
- The What breaks fold preview is count-based ('2 lines break'), not the month title; the 44-character assertion for the title alone (34 chars) is in decideNamePause.test.ts and decideCopyFit.test.ts.
- monthSectionPots.test.tsx and whatBreaks.test.tsx matched the grep but assert nothing this plan changed; left untouched.
- Left for 05-137 (not month figure wording owned here): Step4Alternatives 'Month still $50 short...', Step5Decision '...month was $90 short', verdictDepth 'the month is $90 short'; they still pass.

## Decision needed
- The cash-column/now-column of the month table result row also tints danger when the Now value is overspent (small extension). Stacked layout keeps a single colour.
- The month-basis keys have no consumer yet (05-142); the decide copy guards accept them.

## Self-Check: PASSED
