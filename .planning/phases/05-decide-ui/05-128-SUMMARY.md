---
phase: 05-decide-ui
plan: 128
subsystem: decide verdict card
tags: [verdict, total-cost, opportunity-cost, month-table, DCU-37, DCU-36, D-102, D-104, D-101]
requires: [05-123, 05-124, 05-131]
provides: [ComputedCheck.totalCost, tcoRow, investedRow, keyFiguresLabel, verdict rows 4b/4c, month-table pots row]
key-files:
  created:
    - src/features/decide/copy/ownershipCopy.ts
    - src/features/decide/copy/__tests__/ownershipCopy.test.ts
    - src/features/decide/check/__tests__/verdictOwnership.test.tsx
    - src/features/decide/check/__tests__/monthSectionPots.test.tsx
  modified:
    - src/features/decide/copy/keyFiguresCopy.ts
    - src/features/decide/copy/__tests__/keyFiguresCopy.test.ts
    - src/features/decide/check/VerdictCard.tsx
    - src/features/decide/check/steps/Step3Verdict.tsx
    - src/features/decide/check/sections/MonthSection.tsx
    - src/features/decide/snapshot/computeCheck.ts
    - src/features/decide/snapshot/types.ts
    - src/features/decide/snapshot/__tests__/computeCheck.test.ts
    - src/features/decide/check/__tests__/useBoughtCheckComputation.test.tsx
metrics:
  completed: 2026-10-24
requirements: [DCU-37, DCU-36]
---

# Phase 5 Plan 128: Verdict rows 4b and 4c and the pots month row Summary

The verdict card now states the total cost over the years (row 4b) and what the same money could have grown to at a typed rate (row 4c), each only when real, plus a "Set aside for pots" row in the month table.

## Commits
- a7e8b613 feat(05-128): pure copy builders for the total-cost and invested-instead rows (D-102, D-104)
- 470d798e feat(05-128): total-cost and invested-instead rows on the verdict card, pots row in the month table (D-102, D-104, D-101)
- (docs) this summary and the ROADMAP tick

## What was built
- `ownershipCopy.ts`: `tcoRow` (whole years when the horizon divides by 12, else months; null for no total or a trivial one), `investedRow` (year/month, fee variant, too-large variant, a11y ending "A projection, not a forecast."; null with no headline) and `rateOneDecimal` (bigint, half-up, one decimal at most). All CopyRefs over 05-131's keys; no key added.
- `keyFiguresLabel` in `keyFiguresCopy.ts`: group label order figures, total cost, invested instead, hidden rows left out.
- `ComputedCheck.totalCost` (types.ts) built in `computeDetails` beside `investmentViews` from `totalCost(check, verdict, { horizonMonths: inputs.investHorizonMonths, advertised: resolvedPrice.advertised, lossMonthly: running.nonCash })`; null for invest checks and in `NO_FIGURES`. 05-124's `ownCheckId` paths untouched.
- `VerdictCard`: rows 4b and 4c between the key figures and the basis marker, `meta` 600 `surface` Text with the info button (`totalCost`, `investedInstead`) as the next flex sibling, no `numberOfLines`, 8 apart. Shown only for a resolved logged verdict. The key-figures group a11y label carries the two sentences. A new `busy` prop (passed by `Step3Verdict` from `props.busy`) marks the row group `accessibilityState.busy`.
- `MonthSection`: "Set aside for pots" row between "Saving and investing" and the purchase row, hidden when both columns are 0.

## Verification
- `npx jest src/features/decide/check src/features/decide/snapshot src/features/decide/copy`: 76 suites, 1143 tests pass.
- Snapshot coverage gate (100/100/100/100 over `snapshot/**`): pass.
- Named tests present: D-102 whole years / trivial or null total / sofa no row / car loan Over 5 years above the basis marker / a11y order / bought check recalculates rows 4b and 4c (`useBoughtCheckComputation.test.tsx`) / computeCheck carries totalCost; D-104 fee and too-large variants / no headline / only with a typed non-zero rate / under the key figures when total cost is hidden / keeps its last value with the busy state; D-101 pots row only above zero and still adds up.
- `npx tsc --noEmit`: no errors. eslint on every touched file: 0 errors, 0 warnings.
- `npm run depcruise`: started, no result seen at the time of writing (long run); no new import crosses a boundary (copy imports engine barrel and a type from keyFiguresCopy only).

## Deviations from Plan
1. **[Rule 3] `Step3Verdict.tsx` edited** (not in the plan's file list): one line passing `busy` to the card. The card cannot know the slow figures are settling otherwise.
2. **First read shows neither row.** R18.3's state table lists "First read (rough figures): shown", but `totalCost` needs a `Verdict` and `investmentViews` only runs on a logged verdict, so both are null for a first read. Showing a rough total would need a new engine path; not done. Needs a decision if the first-read row is wanted.
3. **"Updating" treatment for the rows.** The rows keep their last value by construction (the live computation spreads the last settled details, so `totalCost` and `investmentViews` are the previous ones while typing) and carry `accessibilityState={{ busy }}`. The folds' visible "Updating" text replaces a preview line and has no equivalent for a figure row that must keep its value, so no visible word was added (no new copy key).
4. **Car loan test uses a 60-month term.** The demo car loan is 24 months ("Over 2 years"); the named test builds a 60-month variant to match "Over 5 years".
5. The bought-check named test lives in `useBoughtCheckComputation.test.tsx` (where the hook's mocks are) rather than `verdictOwnership.test.tsx`.
6. The month-table row label is the catalogue's `decide.section.monthPots`; the plan's "This purchase" neighbour is the existing label "Running costs of this".
7. `computeDetails` reads `resolvedPrice` and `running` with a cast, since a core with a check always carries them; a null guard would leave unreachable branches under the 100% gate.

## Needs a decision
- First-read rows (deviation 2).
- Visible "Updating" wording on the rows (deviation 3), if wanted.

## Known Stubs
None.

## Device item
05-EXECUTION-NOTES "05-26 device checklist additions (Money concepts R18)", entry 05-128 (budget: row 4b +25.5, frame 2 second warning ends at 721 against the bar at 735; 4c +25.5, or +43 with the fee): not edited here and not ticked. The unit tests cannot measure layout.

## Self-Check: PASSED
Commits a7e8b613 and 470d798e exist; ownershipCopy.ts, verdictOwnership.test.tsx and monthSectionPots.test.tsx exist.
