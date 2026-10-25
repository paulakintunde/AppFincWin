---
phase: 05-decide-ui
plan: 131
subsystem: i18n / decide copy
tags: [copy, i18n, DCU-09, R18]
requires: []
provides: [R18 copy catalogue, INFO_KEYS 65, pot and housing undo labels, guard lists]
affects: [05-120, 05-121, 05-122..05-129, 05-130, 05-133, 05-134]
key-files:
  modified:
    - src/i18n/locales/en.ts
    - src/features/decide/copy/infoTerms.ts
    - src/features/decide/copy/__tests__/infoTerms.test.ts
    - src/i18n/__tests__/decideCopy.test.ts
    - src/engine/undo/types.ts
    - src/engine/undo/__tests__/types.test.ts
metrics:
  completed: 2026-10-24
requirements: [DCU-35, DCU-36, DCU-37, DCU-38, DCU-09]
---

# Phase 5 Plan 131: R18 copy catalogue Summary

All new R18 strings are in `en.ts` as additive keys, INFO_KEYS is 65, six undo labels exist, and the DCU-09 guard lists cover the new controls. No existing key was edited or removed.

## Commits
- a9d3c9fd feat(05-131): undo labels for pots and the debt housing marker
- 3b3ece7d feat(05-131): R18 copy catalogue, INFO_KEYS 65 and DCU-09 guard lists

## Final key map (all under `decide.` unless noted)
Names match the plan's key map except where listed under "Differences".

- `you.record.pots` "Pots"
- `undo.label.{potAdded, potEdited, potDeleted, potDone, potReopened, debtHousingChanged}` (no `{{name}}`, so no labelUnnamed twins)
- `info.{netFreeCashFlow, pots, totalCost, housingLine, investedInstead}.{term, body, changes}`
- `home.card.{eyebrow, a11yNfcfLeft, a11yNfcfShort}`
- `home.hero.{subWorst, subAverage, subTightest, subFigures, subSwitched}`
- `home.monthDetails.{title, basisWorst, basisAverage, basisTightest, basisFigures, basisSwitched, in, spending, debts, saving, pots, result, resultShort, potsLink, rowA11y}` (existing `close` kept)
- `home.rows.linesSetSix_one/_other`, `home.linesFold.previewSix_one/_other`
- `home.problems.{potPastDue_one/_other, potPastDueAffects, potPastDueAction, affectsPots_one/_other}`
- `pots.{title, sub, add, addA11y, limit, summary_one/_other, loading, loadError, empty, emptyAction, doneFold_one/_other, doneLine, caption, progressA11y, stateActive, stateReached, statePastDue, stateWait, stateWaitBare, stateNoRate, rowA11y, rowA11yReached, rowA11yPastDue, rowA11yWait, rowA11yNoRate, rowA11yDone, rowHint}`
- `pots.menu.{markDone, reopen, delete, moreFor}`
- `pots.sheet.{titleNew, titleEdit, cancel, name, namePlaceholder, target, by, byRange, alreadySaved, previewActive_one/_other, previewReached, previewPast, savedNote, tagTransfer, save}`
- `pots.toast.{saved, deleted, done, reopened}` (no `pots.retry`: use `decide.flow.retry`)
- `verdict.tco.{year, month, a11y_year, a11y_month}` each `_one/_other`
- `verdict.invested.{year, month, feeYear, feeMonth}` each `_one/_other`, plus `tooLarge`, `a11y`
- `verdict.titleHousing`, `verdict.titleHousingNoIncome`
- `warn.{housingTitle, housingValue, housingBody, housingValueNoIncome, housingBodyNoIncome}`
- `section.{monthPots, lineHousing, lineHousingDesc, lineHousingDescNoIncome}`
- `assumptions.{housingToday, housingTodayValue}` (new top-level `decide.assumptions` block)
- `lines.housing.{name, desc, value, info}`
- `housing.{heading, helper, switchLabel, switchA11y, switchHint, empty, payment}`

## Differences from the plan's key map and things later plans must know
- Added beyond the map: `home.problems.potPastDueAffects/Action`, `pots.caption`, `pots.progressA11y`, `pots.stateWaitBare` ("From a check", for a Wait pot with no amount or date), `pots.rowHint`, `assumptions.housingTodayValue`, `pots.rowA11y{Reached,PastDue,Wait,NoRate,Done}`.
- `home.monthDetails.potsLink` is "Pots" without the chevron, as `card.details` is "Details"; the component draws the "›".
- `verdict.invested.a11y` is `{{text}}. A projection, not a forecast.`; the component supplies `{{text}}` as the row sentence with `formatMoneyA11y` amounts.
- `verdict.tco.a11y_*` have no trailing period, so the key-figures group can join them.
- `home.card.a11yNfcfLeft/Short` take `{{basis}}` (the sub-line text), so the "after spending, debts and everything set aside" phrase appears in the five sub-lines only (grep count 5).
- No "Lines screen sub-copy" twin exists: `decide.lines.sub` contains no count, and the only "of 5" strings were `home.linesFold.preview*` and `home.rows.linesSet*`, both twinned (`…Six`). The "of 6" twins use U+00A0 after `{{count}}`, like the strings they twin.
- `section.lineHousingDesc` is "{{pct}} of money in" (the spec wording), `lineHousingDescNoIncome` mirrors `lineDsrDescNoIncome`.
- Undo labels are the spec strings with no name; the toast names ("Pot deleted · {{name}}") are `pots.toast.*`.

## Verification
- `npx jest src/i18n src/features/decide/copy`: 21 suites, 15537 tests pass (includes the named tests `D-100 INFO_KEYS holds 65 terms and the five R18 terms resolve`, `D-101 the pot and housing undo labels exist and resolve`, `DCU-09 the R18 strings pass the guard apart from Save pot on the keyed list`, `DCU-09 Invested instead is not an imperative lead`).
- `npx jest src/engine/undo` with 100% thresholds: pass.
- `npx eslint src/i18n src/features/decide/copy src/engine/undo`: 0 errors (14 pre-existing warnings).
- `npm run typecheck`: no error in any file of this plan. It is red in `src/engine/decide/**` and `src/features/decide/snapshot/**` from the other executors' uncommitted `DecideSnapshot.pots` / `protectedCash` work (cashPath.test.ts, fixtures.ts, snapshotFixtures.ts, buildSnapshot.ts); left alone.
- `npm run depcruise` not run (the undo test change keeps engine/ free of i18n imports; the i18n test imports engine, which is allowed).

## Deviations from Plan
- Task 2's catalogue-resolving undo test sits in `decideCopy.test.ts` rather than `engine/undo/__tests__/types.test.ts`, because engine/ may not import i18n; `types.test.ts` asserts the six keys exist once.
- The undo commit precedes the catalogue commit so HEAD stays green at each step.

## Device item
05-EXECUTION-NOTES "05-26 device checklist additions (Money concepts R18)", entry 05-131: not edited here (copy only).

## Self-Check: PASSED
