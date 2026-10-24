---
phase: 05-decide-ui
plan: 83
subsystem: snapshot
tags: [decide, inputs, migration, cheaper, expected-return, D-80, D-81, D-82, D-83]
requires: [05-61, 05-81, 05-82]
provides:
  - CheckInputs R15 fields (instalment hasRate/aprText/firstPayment, cheaperPrice, customItemType, investReturnText, lumpHorizonMonths) with migration
  - cheaperFinalPrice, cheaperPriceForPercent, exact-price repriceInputs
  - expectedReturnProjection and LUMP_HORIZON_DEFAULT
affects: [05-69, 05-74, 05-76, 05-84, 05-85, 05-86, 05-87]
key-files:
  created:
    - src/features/decide/snapshot/expectedReturn.ts
    - src/features/decide/snapshot/__tests__/expectedReturn.test.ts
  modified:
    - src/features/decide/snapshot/types.ts
    - src/features/decide/snapshot/checkInputs.ts
    - src/features/decide/snapshot/computeCheck.ts
    - src/features/decide/snapshot/__tests__/checkInputs.test.ts
    - src/features/decide/snapshot/__tests__/computeCheck.test.ts
    - src/features/decide/check/steps/Step4Alternatives.tsx
    - src/features/decide/check/steps/__tests__/Step4Alternatives.test.tsx
decisions:
  - "Old cheaperRatioPercent is read only by parseCheckInputs from raw JSON and becomes ceil(advertised x pct / 100); the field is gone from CheckInputs"
  - "An exact reprice scales a loan deposit half up by the cheaper final price over the check's price, the same ratio the engine's cheaper row uses (M4)"
  - "expectedReturnProjection returns { fv: null } on an engine RangeError and null when there is no valid return, no invest check or no monthly term"
requirements: [DCU-29, DCU-30, DCU-26, DCU-05, DCU-12, DCU-03]
metrics:
  tasks: 2
  completed: 2026-10-23
---

# Phase 5 Plan 83: Snapshot and saved-inputs migration for R15 Summary

Check inputs now carry the R15 fields as plain JSON. Old checks parse with the same meaning, and the exact cheaper price runs from the inputs through `computeCheck` and `repriceInputs`. The expected-return projection is a pure, display-only module.

## Tasks

| Task | Commit | Notes |
|------|--------|-------|
| 1. Input fields, migration, engine mapping | 985711b2 | tests named "D-80", "D-81", "D-82", "D-83" |
| 2. Exact cheaper price, expectedReturnProjection, Step4 bridge | d1df6797 | removes the 05-82 percent bridge and `cheaperRatioPercent` from `CheckInputs` |

## Verification

- `jest src/features/decide/snapshot` plus Step4Alternatives: 13 suites, 259 tests passed.
- `src/features/decide/snapshot` coverage: 100% statements, branches, functions and lines for every file, including the new `expectedReturn.ts`. The threshold passed.
- `jest src/features/decide`: 84 of 85 suites passed. `verdictCard.test.tsx` failed once and passed on rerun. It reads `VerdictCard.tsx`, which another executor is editing, so it is not this plan.
- `npm run typecheck` is clean. `npm run depcruise` reports no violations. eslint is clean on the snapshot folder and the Step4 files.
- `grep cheaperRatioPercent` outside tests returns only the migration read in `checkInputs.ts`.

## Deviations from Plan

**1. Deposit ratio.** The plan says the deposit scales by cheaper over advertised. I scale by the cheaper *final* price over the check's final price. That is the ratio the engine's cheaper row uses (05-82, M4), so the re-priced check is exactly the one judged. With no tax or fees on the check the two are identical.

**2. Step4 bridge default.** With no typed `cheaperPrice`, "Use the cheaper price" passes the engine's default row as `cheaperPriceForPercent(advertised, alts.cheaper.ratioPercent)`. The existing test expecting a scaled deposit still holds. 05-69 replaces the bridge.

**3. Extra export.** `cheaperPriceForPercent(advertised, pct)` is exported from `checkInputs.ts` and shared by the migration and the Step4 bridge.

**4. Open point.** After "Use the cheaper price", `cheaperPrice` keeps its old value, which now equals the new advertised price. The cheaper row therefore equals the planned row until the user moves it. The old percent behaved the same way. 05-69 may want to reset it to null in that patch; I left it as the plan specifies.

## Device items

05-EXECUTION-NOTES "05-26 device checklist additions (Decide UX refresh)", entry 05-83: no new UI. Open an old saved check and confirm the cheaper slider shows the same figure and the instalment shows no rate and a first payment today.

## Known Stubs

None. The Step4 slider bridge is temporary by design until 05-69.

## Self-Check: PASSED
