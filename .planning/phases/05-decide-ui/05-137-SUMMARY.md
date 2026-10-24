---
phase: 05-decide-ui
plan: 137
subsystem: decide-copy
tags: [copy, i18n, D-106, DCU-09, DCU-39]
requirements: [DCU-39, DCU-09]
key-files:
  modified: [src/i18n/locales/en.ts, Step4Alternatives.tsx, Step5Decision.tsx, ExpectedIncomeSection.tsx, OpenChecksCard.tsx]
metrics:
  completed: 2026-10-24
---

# Phase 5 Plan 137: Free / overspent wording, part 2 Summary

The rest of the check side words a month figure free / overspent through the shared `monthFigure` / `isOverspent` helper from 05-136.

## New / changed strings (decide.*)
- alt.reasonMonthShortCheaper 'Month still {{amount}} overspent on this plan'; reasonMonthShort 'Month is {{amount}} overspent — nothing spare'; reasonTooThin 'Only {{amount}} a month free — too thin to count' (44 characters at the demo amounts, exactly at the cap)
- alt.tradeThin '... but the month still only has {{left}} — nothing you could reliably set aside.' ({{left}} = monthFigure text)
- decision.freeAfter 'Free after', decision.overspentAfter 'Overspent after' (leftAfter retired, no consumer)
- decision.goDescShort '... the month was {{amount}} overspent when you signed.'; waitWithin / waitBeyond 'Your month currently has {{left}}, so ...'
- depth.income.rows.month 'Month end' (rows.left retired), value is the monthFigure words
- changes.worstMonth 'Fits now; from {{month}} the month is {{amount}} overspent.'
- open.sub '{{price}} · {{method}} · {{left}} a month'; open.subWithOthers '... with the other open checks, {{left}} a month'

## Tests
Named D-106 tests added (Step 5 caption flip, alternatives reasons, Wait, Go ahead, open-check line, worst-month line, expected-income Month row). Existing assertions updated in Step4Alternatives, Step5Decision, verdictDepth, depthSections, OpenChecksCard tests.

## Verification
- `npx jest` whole suite: 625 suites, 24407 passed, 14 skipped, 0 failed.
- eslint 0 errors; depcruise clean; decideCopyFit / decideTextFit green.
- `tsc --noEmit`: one error in copy/__tests__/basisKey.test.ts (untracked, owned by 05-142, 'pausable'); not from this plan.

## Deviations
- Files outside files_modified: none needed beyond the plan list (alternativesCopy.ts, depthVerdictCopy.ts, commit.test.tsx, step5Depth.test.tsx and others needed no change; the wording lives in en.ts).
- Left alone: home hero.short / hero.shortWord / summaryShort and infoTerms.test.ts 'hero.short' assertion (home card, owned by 05-141). Cash / cushion "short" and "spare" untouched.

## Self-Check: PASSED
