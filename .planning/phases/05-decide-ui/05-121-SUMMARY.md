---
phase: 05-decide-ui
plan: 121
subsystem: decide engine / decide copy
tags: [engine, E8, housing, DCU-38, D-103]
requires: [05-120, 05-131]
provides: [DEFAULT_HOUSING_LINE, WarningCode housing, Assessment housing fields, housing margin, exhaustive housing copy sites]
affects: [05-124, 05-126, 05-133]
key-files:
  modified:
    - src/engine/decide/constants.ts
    - src/engine/decide/types.ts
    - src/engine/decide/assess.ts
    - src/engine/decide/decision.ts
    - src/features/decide/copy/codeMaps.ts
    - src/features/decide/copy/quickCopy.ts
    - src/features/decide/copy/verdictCopy.ts
    - src/features/decide/copy/warningCopy.ts
    - src/features/decide/snapshot/buildSnapshot.ts
  created:
    - src/engine/decide/__tests__/housing.test.ts
    - src/engine/decide/__tests__/housingProperties.test.ts
metrics:
  completed: 2026-10-24
requirements: [DCU-38]
---

# Phase 5 Plan 121: Engine E8 housing line Summary

A property purchase that pushes housing costs past 28% of money in now raises a soft `housing` warning, with the constant, margins and every exhaustive `WarningCode` site landed together so the app compiles.

## Commits
- 2e0619b5 feat(05-121): housing line engine (constant, code, assessment fields, margin, limits, snapshot field, tests)
- ccff06a4 feat(05-121): housing case at every exhaustive WarningCode site (codeMaps, quickCopy x2, verdictCopy, warningCopy)

## Citation used (verified first)
`DEFAULT_HOUSING_LINE` cites the 28/36 rule's front-end ratio: Bankrate, "What Percentage Of Income Should Go To A Mortgage?", https://www.bankrate.com/mortgages/what-is-the-28-36-rule/, fetched live 2026-10-24, which states the 28% cap is "based on a borrower's front-end debt-to-income (DTI) ratio" of gross monthly income and that the 36% rule is the back-end ratio. It is a secondary (publisher) source: the agency pages tried (CFPB, Fannie Mae marketing pages, HUD handbook, Investopedia, NerdWallet) returned 402/403/404 or did not state 28% in fetchable text. The Cite: comment also records that FincWin applies 28% to take-home money in (stricter than a gross-income test) and that the user confirmed it on 2026-10-24.

## What was built
- Engine: `DEFAULT_HOUSING_LINE = percent('28')`; `WARNING_ORDER` is month, cash, cash_dip, dsr, housing, owe, inv; `WarningCode`/`MarginLine` gain `housing`; `DecideLimits.housingLine`, `ResolvedLimits.housingLine`, `DecideSnapshot.housingMonthly`; `Assessment.housingBefore/After/RatioBefore/RatioAfter` and `checks.housing`; validation rejects a negative `housingLine` or `housingMonthly`.
- Rule: tested only for `itemType === 'property'` buy checks with `mineMonthly + mineRunning > 0`; bigint cross-multiply, equal not a breach, `incomeBasis` 0 breaches when housingAfter > 0; shortfall = housingAfter minus half-up line; soft (adjust, never no alone).
- `lineMargins` pushes a `housing` margin for property buy checks (between dsr and owe); the line in money is 0 with no income.
- Copy: WARNING_TITLE/TONE, both quickCopy maps (reuse `decide.warn.housingBody`/`housingBodyNoIncome`), ADJUST_TITLE (`titleHousing`, `titleHousingNoIncome`), the warning card (value `housingValue`/`housingValueNoIncome`). No copy keys added.
- `buildSnapshot.ts` passes `housingMonthly: 0` and `housingLine: null` only (05-124 fills them). `DEFAULT_HOUSING_LINE` is in `DECIDE_RUNTIME_EXPORTS`.
- Fixed ~40 test literals (limits and snapshot fixtures) for the new required fields.

## Verification
- `npx jest src/engine src/features/decide/__tests__/engineBarrel.test.ts` with the 100% coverage gate on constants, assess, margins, decision: 181 suites pass, 100/100/100/100, no ignore comments.
- `npx jest src/features/decide src/engine --silent`: all pass (after updating the `buildSnapshot.test.ts` literals).
- `npm run typecheck` exit 0, `npm run lint` 0 errors (pre-existing warnings), `npm run depcruise` no violations.
- Named tests present: the six Task 1 and four Task 2 `D-103 ...` tests, plus the decision.test.ts lineMargins test and fast-check properties.

## Deviations from Plan
1. **[Rule 1 - unreachable branch] No `max(0, ...)` floor.** `housingAfter` is only computed when `newMonthly > 0` and `housingMonthly >= 0` is validated, so the floor can never bite and would be an uncoverable branch. The "floored at 0" test asserts the real behaviour: a property check whose replaced expenses net the effect to zero or below is not tested, and `housingAfter` stays `housingBefore`, never negative.
2. **Custom type "like Property"**: `ItemType` has no custom value; only `'property'` is tested. If the UI maps a custom type to property before building the check, it is covered; nothing else was added.
3. **[Rule 3] `buildSnapshot.test.ts` literal** updated for the two new snapshot fields (not in the plan's file list).
4. `copy/__tests__/helpers/fixtures.ts` housing fields (`housingAfter`, `housingRatioAfter`, `limits.housingLine`) added so copy tests can render the card; `depthVerdictCopy.test.ts` needed no change.

## Needs a decision
- **Missing edge-line copy key.** `edgeChipA11y` builds `decide.edge.line.${margin.line}`; en.ts has `dsr`, `cash`, `month`, `owe`, `inv`, `cash_path` but no `housing`, so an on-the-edge housing margin would speak a raw key. The rule said not to add copy keys; one key (for example `decide.edge.line.housing: 'housing costs'`) in the 05-131 catalogue, or in the plan that renders the margin, is needed.
- **Zero shortfall warning.** Because the line in money is rounded half-up (as for dsr), a breach of under half a minor unit yields a `housing` warning with shortfall 0. This follows the spec; the property test allows `>= 0`.
- Stacked other open property checks do not add to `housingMonthly` (the engine only adds the check under assessment); not in scope.

## Device item
05-EXECUTION-NOTES "05-26 device checklist additions (Money concepts R18)", entry 05-121: not edited here.

## Self-Check: PASSED
Commits 2e0619b5 and ccff06a4 exist; housing.test.ts and housingProperties.test.ts exist.
