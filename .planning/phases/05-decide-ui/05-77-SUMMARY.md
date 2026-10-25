---
phase: 05-decide-ui
plan: 77
subsystem: i18n
tags: [i18n, copy, decide, rule-U, rule-E, rule-T, plural-keys, DCU-09]
requires: [05-54, 05-64, 05-69, 05-73, 05-80, 05-84, 05-86]
provides:
  - the replaced Decide copy retired from en.ts
  - decideCopyFit.test.ts (rules U, E, T and the R3 plural keys)
affects: []
key-files:
  created:
    - src/i18n/__tests__/decideCopyFit.test.ts
  modified:
    - src/i18n/locales/en.ts
    - src/i18n/__tests__/decideCopy.test.ts
    - src/features/decide/copy/depthVerdictCopy.ts
    - src/features/decide/copy/__tests__/depthVerdictCopy.test.ts
    - src/features/decide/copy/__tests__/foldCopy.test.ts
    - src/features/decide/copy/__tests__/depthInputsCopy.test.ts
    - src/features/decide/copy/__tests__/keyFiguresCopy.test.ts
decisions:
  - "A key is deleted only when a grep of src and app (excluding en.ts and tests) finds no reader and no dynamic builder"
  - "The undo labels checkAbandoned, decisionRemoved and changeRemoved stay (R3 exception)"
  - "decide.past.emptyHeading/emptyBody stay: the Past decisions screen still renders them"
  - "decide.alt.spendTitle (35 characters) is a recorded rule E exception, flagged for the user"
requirements: [DCU-09, DCU-27, DCU-11]
metrics:
  tasks: 2
  completed: 2026-10-23
---

# Phase 5 Plan 77: Copy retirement and text-fit tests Summary

The strings the refresh replaced are gone from `en.ts`, and a new catalogue test enforces rule U (no-break spaces), rule E (32-character eyebrows), rule T (length caps) and the R3 plural keys.

## Tasks

| Task | Commit | Notes |
|------|--------|-------|
| 1. Retire replaced strings | 68cc4085 | 27 keys removed, each proved unread; ACTION_LABELS lost `decide.past.removeKeep`; `cashPathCopy` no longer names the dead keys |
| 2. decideCopyFit.test.ts | 18122361 | rules U, E, T, plural keys; 37 en.ts lines fixed for rule U; 3 copy tests follow the no-break strings |

## Keys retired (all under `decide.`)

- `quick.clear` ("Clear the check"; `clearText` and `clearA11y` stay)
- `home.pastNone` ("Nothing decided yet" as the row value)
- `open.abandonA11y`, `open.emptyHeading`, `open.emptyBody`
- `toast.abandoned`, `toast.removed`
- `price.advertised`, `price.amount`, `price.edit`, `price.final` (the rest of `decide.price.*` is live in Step2PriceAndPay)
- `pay.head`, `pay.headInvest`, `pay.sub`, `pay.subInvest` (flat copies; `pay.howYouPay.*` is live)
- `pay.flagRateNeeded`
- `pay.noteLoan`, `pay.noteLoanZero`, `pay.noteLoanNoRate`, `pay.noteInstalment`, `pay.noteCard`, `pay.noteCardNoRate`, `pay.noteCardFull`, `pay.noteInvestWorth`, `pay.noteInvestCaption`
- `past.remove`, `past.removeTitle`, `past.removeBody`, `past.removeKeep`, `past.removeConfirm`
- `depth.changes.removed`, `depth.changes.removeA11y`, `depth.changes.emptyTitle`, `depth.changes.emptyBody`
- `depth.cashPath.unavailableSummary`, `unavailableBody`, `unavailableLink` ("Add your pay as a recurring series" and "Add a recurring series"; the section already renders `fold.cashPath.unavailablePreview`/`unavailableBody`/`recurringLink`)
- `depth.invest.over`, `depth.invest.horizonChip`

## Keys kept, with the reason

- `undo.checkAbandoned`, `undo.decisionRemoved`, `undo.changeRemoved` (both undo label tables): saved undo rows still name them (R3 exception, user-acknowledged).
- `decide.past.emptyHeading` ("Nothing decided yet") and `emptyBody`: read by `PastDecisionsScreen`, and UI-SPEC still specifies that empty state. Only the home row value (`home.pastNone`) was retired.
- `decide.lineEditor.removeA11y` ("Remove {{name}}"): read by five line editors; the retired "Remove {{name}}" was `depth.changes.removeA11y`.
- `decide.toast.lineRemoved` ("Removed · {{name}}"): still used.
- `decide.pay.noteCash`, `noteInvestMonthly`, `flagNotAccepted`, `flagPartOnCard`, `flagBelowPrice`: still read.
- `decide.pay.loanTermUnit` ("mo"): unread but not in the plan's candidate list, so left for a decision.
- `decide.depth.cashPath.basisUnavailable`: not in the candidate list, left.

## Verification

- `npx jest src/features/decide src/i18n --silent`: 110 suites, 14461 tests passed.
- Full `npx jest --silent`: 569 suites passed, 21228 tests passed, 14 skipped.
- `npm run typecheck` clean, `npm run lint` 0 errors (733 warnings, none new from this plan), `npm run depcruise` clean.
- DCU-09 guard (`decideCopy.test.ts`) and `copyStatus.ts` pass.

## Deviations from Plan

**1. [Rule 3 - Blocking] cashPathCopy read three retired keys**
- `depthVerdictCopy.ts` `cashPathCopy` returned refs to `cashPath.unavailable*` for the unavailable case, but `DayByDaySection` never rendered them (it uses `decide.fold.cashPath.*`). Changed the unavailable case to `{ available: false }` and updated `depthVerdictCopy.test.ts`. Not in the plan's file list.
- Commit: 68cc4085.

**2. [Rule 1 - Bug] Rule U found plain spaces already in en.ts**
- 37 lines in the Decide namespace joined `{{count}}`/`1` to month(s), mo, year(s), or `{{rate}}%` to "a year" with a plain space. Fixed with the ` ` escape. The 14 literal U+00A0 characters in en.ts became ` ` escapes (same value). Three copy tests (`foldCopy`, `depthInputsCopy`, `keyFiguresCopy`) that asserted the old plain-space strings were updated. The rule also covers `1 month`/`1 year` (the `_one` forms) and "years", as the R3 table requires.
- Commit: 18122361.

**3. [Rule 4 candidate, recorded not changed] Eyebrow over the cap**
- `decide.alt.spendTitle` ("The cheaper one, and what it leaves") is 35 characters and renders as an eyebrow in Step4Alternatives, over the 32-character rule E cap. The title is user-accepted copy (UI-SPEC, amended 2026-10-22), so it is a named exception (cap 35) in the test rather than reworded. Needs the user's decision: shorten it, or accept it wrapping.

**4. Plan acceptance grep not literally met**
- `grep -c "Nothing decided yet"` in en.ts is 2 (past.emptyHeading, kept as above), not 0. All other acceptance greps hold (`checkAbandoned` count is 2).

**5. R3 plural table: `decide.pay.monthsShort` does not exist**
- The table lists `decide.pay.monthsShort` ("1 mo" / "{{count}} mo"), but no plan added it and no screen renders it. The plural test covers the 14 keys that exist; the short unit that is rendered, `decide.depth.invest.axisMonths` ("{{count}} mo"), is covered by rule U.

## Tests that name retired strings

`Step2PriceAndPay` ("Rate needed"), `ChangesCard` ("Nothing dated yet"), `DecideHomeScreen` ("Nothing decided yet"), `OpenChecksCard` ("No checks open") and `DecisionDetailSheet` ("Remove") only assert the text is absent, which still holds, so they were left as they are. `PastDecisionsScreen` asserts the Past empty heading, which is live.

## Device items

05-EXECUTION-NOTES "05-26 device checklist additions (Decide UX refresh)", entry 05-77: eyebrow wrapping at 402 and at font scale 2, including the 35-character "The cheaper one, and what it leaves" eyebrow; no-break units do not split across lines in the key figures and fold summaries.

## Known Stubs

None.

## Self-Check: PASSED
