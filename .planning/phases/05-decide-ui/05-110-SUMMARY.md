---
phase: 05-decide-ui
plan: 110
subsystem: decide-copy
tags: [i18n, copy, hints, dcu-09]
requires: [05-109]
provides: [decide.home.* R17 strings, INFO_KEYS tightestFigures, loadHomeBasisSeen, markHomeBasisSeen]
affects: [05-111..05-118]
key-files:
  modified:
    - src/i18n/locales/en.ts
    - src/features/decide/copy/infoTerms.ts
    - src/i18n/__tests__/decideCopy.test.ts
    - src/features/decide/copy/__tests__/infoTerms.test.ts
    - src/features/decide/hints/decideHints.ts
    - src/features/decide/hints/__tests__/decideHints.test.tsx
requirements: [DCU-34, DCU-25, DCU-09]
completed: 2026-10-24
---

# Phase 5 Plan 110: R17 copy, tightestFigures info term and homeBasisSeen Summary

The redesigned Decide home has all its words (`decide.home.*`), the `tightestFigures` info term (60 keys), and a `homeBasisSeen` flag that shares the v1 hints record with the fold hint without clobbering it.

## Commits
- 010d7ce4 feat(05-110): R17 home strings and the tightestFigures info term
- 5c739aca feat(05-110): homeBasisSeen in the decide hints record

## Key names (Claude's discretion, for 05-111..05-118)
All under `decide.home.`, added beside the old keys (which stay until 05-118):
- `header`
- `card.{labelWorst,labelAverage,labelTightest,labelFigures,labelSwitched,details,detailsA11y,detailsHint,a11yLeft,a11yShort,loading}`. The a11y templates take `{{cardLabel}} {{amount}} {{in}} {{out}}`.
- `hero.{left,short,leftWord,shortWord,sub,inOut,summary,summaryShort}`. `leftWord` and `shortWord` are for the two-Text hero (M2); `summary` and `summaryShort` are the one-line form while a quick result is open.
- `unavailable.{title,noFigures,rate,addRough,seeLines}`
- `field.{placeholder,placeholderShort,a11y,check,full,fullA11y}`
- `rows.{open,openChanged,changes,changesAdd,past,lines,linesSet_one/_other,linesDefault,a11y}`
- `notice.{items_one/_other,offline,offlineWaiting_one/_other,saving,hint}`
- `problems.{title,affects,entryA11y,close,noMonth.*,rate.*,failed_*,failedAction,conflict_*,conflictAction,recordsOnDevice,cardMin.*,stale.*,offline.*}`. `rate.affectsLines_*`, `rate.affectsCardLimit` and `rate.affectsChecks_*` are the three entry-2 "Affects" forms.
- `monthDetails.close`

Hints API: `loadHomeBasisSeen(userId)` and `markHomeBasisSeen(userId)` in `src/features/decide/hints/decideHints.ts`. Both flags are read-modify-write on `fincwin:decide-hints:{userId}`. A single flag writes `{"v":1,"homeBasisSeen":true}`.

## Verification
- `npx jest src/features/decide/copy src/i18n` passed (21 suites, 14579 tests).
- Hints, decideCopy and infoTerms re-run after the last edits: 3 suites passed.
- `npm run typecheck` is clean.
- eslint on `src/i18n`, `src/features/decide/copy` and `src/features/decide/hints`: 0 errors, 1 existing warning in `src/i18n/index.ts` (not mine).
- The named tests pass: `D-95 R17 strings resolve`, `D-95 INFO_TERMS has 60 keys with tightestFigures`, `D-95 homeBasisSeen shares the hints record without clearing the fold hint`, `D-95 a failed read counts as not seen`.
- Also added: `D-95 the R17 controls are on the keyed list and read as the spec words them`.

## Deviations from Plan
- The plan wrote the 59-key test as `D-84 / R16 INFO_TERMS has 59 keys`. I replaced it with the 60-key test, so there is no 59 assertion left.
- The plan said "Check it", "Full check", "Review changes", "Review edits", "Add rough figures", "Exchange rates" and "Card minimum payment" join the guard's keyed list. Only CONTROL_LABELS was needed, because none opens with an IMPERATIVE_LEAD verb. ACTION_LABELS is unchanged.
- ROADMAP: ticked by hand, a one-line diff.

## Known Stubs
None.

## Device item
05-EXECUTION-NOTES, 05-26 "Decide UX refresh", entry 05-110 (copy read in context). The requirements are not ticked because that device check is open.

## Self-Check: PASSED
Both commits exist, and all six files are modified and committed.
