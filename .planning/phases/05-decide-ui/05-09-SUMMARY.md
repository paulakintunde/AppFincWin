---
phase: 05-decide-ui
plan: 09
subsystem: decide-copy
tags: [decide, copy, i18n, exhaustive-maps, tdd]
requires: [05-01, 05-02]
provides:
  - exhaustive code to key maps (src/features/decide/copy/codeMaps.ts)
  - stateChip / verdictTitle / verdictBody / basisMarker / missingRateCopy (verdictCopy.ts)
  - warningCard / cardReasonCards (warningCopy.ts)
  - quickResultCopy (quickCopy.ts)
  - suppressionReason / cheaperDescriptor / keptHeader (alternativesCopy.ts)
  - optionCopy (optionCopy.ts)
  - percentText, CopyRef / Fmt / WarnCard / ref (percentText.ts, types.ts)
affects: [05-10, 05-15, 05-16, 05-17, 05-21]
key-files:
  created:
    - src/features/decide/copy/types.ts
    - src/features/decide/copy/percentText.ts
    - src/features/decide/copy/codeMaps.ts
    - src/features/decide/copy/verdictCopy.ts
    - src/features/decide/copy/warningCopy.ts
    - src/features/decide/copy/quickCopy.ts
    - src/features/decide/copy/alternativesCopy.ts
    - src/features/decide/copy/optionCopy.ts
    - src/features/decide/copy/__tests__/codeMaps.test.ts
    - src/features/decide/copy/__tests__/verdictCopy.test.ts
    - src/features/decide/copy/__tests__/quickCopy.test.ts
    - src/features/decide/copy/__tests__/alternativesOptions.test.ts
    - src/features/decide/copy/__tests__/helpers/fixtures.ts
    - src/features/decide/copy/__tests__/helpers/enKeys.ts
key-decisions:
  - "CopyRef gained optional keyParams (param name to catalogue key) so words like average/worst are translated, not hardcoded English"
  - "WarnCard.value is nullable: the card-remainder card has no value chip"
  - "QuickResultCopy gained a caption field (the monthly figure caption: plain, paid-off or zero-rate) beyond the plan's listed shape"
  - "cardReasonCards takes a Verdict (not an Assessment) because card_not_accepted arrives on a missing verdict"
requirements-completed: []
duration: ~45 min
completed: 2026-10-16
---

# Phase 5 Plan 09: Decide copy layer Summary

Pure functions turn engine codes into `decide.*` catalogue keys plus formatted string params, with compile-time exhaustiveness (`satisfies Record<Code, ...>`) for every code union, including the alignment cases (zero-income dsr, 50-year card, exceeds_range, term vs payoff month, cash_dip).

## Verification

- `npx jest src/features/decide/copy`: 71 passed (4 suites)
- `npm run typecheck` clean; `npm run lint` 0 errors (pre-existing warnings only); `npm run depcruise` no violations
- Acceptance greps: 14 `satisfies Record<` in codeMaps, no hardcoded 9.4 in quickCopy, no "keeps earning", no snapshot fixtures or computeCheck/computeQuick in the tests, no advice/recommend/"you should" in the copy modules

## Commits

- 9e3882f feat(05-09): exhaustive engine code to catalogue key maps and percentText
- 1dec609 feat(05-09): verdict, warning and quick-result copy from engine codes
- 578bb0b feat(05-09): alternatives suppression and option copy

## Deviations from Plan

- Rule 3 (minimal): test fixtures cast the nested `Assessment` context once (`as unknown as Assessment`) populating only the fields the copy layer reads, instead of writing out the whole `DecideSnapshot`; same-wave rule respected (no snapshot fixtures, no computeCheck/computeQuick).
- Interface additions noted above (keyParams, nullable WarnCard.value, caption, Verdict-typed cardReasonCards). Screens must resolve `keyParams` through `t()` before interpolating.
- Tone of `cash_dip` mapped soft in WARNING_TONE and upgraded to hard by warningCard when `assessment.cashDip === 'hard'`, as specified.

## Known Stubs

None.

## Human verification

None needed (pure functions).

## Migrations

None.

## Self-Check: PASSED
