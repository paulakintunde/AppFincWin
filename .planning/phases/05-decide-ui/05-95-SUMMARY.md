---
phase: 05-decide-ui
plan: 95
subsystem: snapshot
tags: [snapshot, decide, card-limit, fx, D-91, D-92, E5]
requires: [05-93, 05-94]
provides:
  - SnapshotResult.cardMaxPurchase (CARD_MAX_PURCHASE_USD in home minor units, floored; null = no stored USD rate)
  - SnapshotResult.region (RD-02 code) and basisNotes ({ kind: 'card_limit_rate', date })
  - convertFloored (rational, floored conversion at stored rates)
  - engineCtxOf (snapshot to EngineCtx, used by computeCheck and stacking)
affects: [05-96, 05-26]
key-files:
  modified:
    - src/features/decide/snapshot/buildSnapshot.ts
    - src/features/decide/snapshot/types.ts
    - src/features/decide/snapshot/checkInputs.ts
    - src/features/decide/snapshot/conversion.ts
    - src/features/decide/snapshot/computeCheck.ts
    - src/features/decide/snapshot/stacking.ts
    - src/features/decide/snapshot/__tests__/buildSnapshot.test.ts
    - src/features/decide/snapshot/__tests__/checkInputs.test.ts
    - src/features/decide/snapshot/__tests__/conversion.test.ts
requirements: [DCU-32, DCU-23]
metrics:
  tasks: 1
  completed: 2026-10-24
---

# Phase 5 Plan 95: Engine E5c, the snapshot converts the card limit Summary

The snapshot builder now converts US$100,000 (`CARD_MAX_PURCHASE_USD`) into the home currency and every card payment carries it, with the RD-02 region, into the engine.

## Task

| Task | Commit | Notes |
|------|--------|-------|
| 1. Convert the limit and carry it to the card payment | ef7264bf | builder, types, checkInputs, conversion, callers, tests |

## What was built

- `convertFloored` (conversion.ts): the same ratio as `convertMinorExact` (custom legs and exponents included) in bigint, with one floor at the end instead of half-up. Stored rates only (`resolvePerEur`), never the FX fetch door. Null on a missing rate, unusable exponent or an unsafe result; never throws. Recorded how: the stored rate form is already an exact scaled bigint, so no decimal-string parsing was needed.
- `buildSnapshot`: `cardMaxPurchase` (USD home = 10,000,000 with no rate; no stored USD rate = null so the engine reports `card_limit_rate_missing`), `region: source.region`, and `basisNotes` with `{ kind: 'card_limit_rate', date }` only when the USD rate is dated before today. The note is display only; it touches no converter note, unconverted count, provisional flag or confidence.
- `checkInputs`: `EngineCtx` gains optional `cardMaxPurchase` and `region`; the card payment carries them when present (absent in fixtures = no limit, unknown region). `engineCtxOf(source)` builds the context from a snapshot.
- `computeCheck` and `stacking` use `engineCtxOf`, so the main check and every stacked check see the limit and region.

## Verification

- `npx jest src/features/decide/snapshot`: 12 suites, 262 tests pass; coverage 100% on all four measures for every file in the folder.
- `npm run typecheck` clean; `npm run depcruise` clean (703 modules); eslint on `src/features/decide/snapshot` clean.
- Named tests: "D-91 the card limit converts at the latest stored rate and floors" (1.3 USD per EUR: exact 7,692,307.69 floors to 7,692,307, half-up would give 7,692,308), "D-91 no USD rate leaves the limit null", "D-91 USD home needs no rate", "D-91 an older rate adds only a basis note", "D-92 the RD-02 region is carried through", plus the checkInputs payment tests and `convertFloored` edge tests (custom legs, bad exponent, overflow).
- `npx jest src/features/decide` (whole feature): 3 suites fail (decideTextFit, depthStep2, depthInputsCopy), 7 tests. All concern RunningCostPrompts, MoneyInput, RateInput and depthInputsCopy, which are uncommitted work of the parallel executor (05-101). Not touched by this plan; left alone.

## Deviations from Plan

- **[Rule 3] Two callers outside the plan's file list** (`computeCheck.ts`, `stacking.ts`) changed to use the new `engineCtxOf`; without them no card payment would carry the limit. `conversion.ts` also gained the helper (plan listed only buildSnapshot, types, checkInputs). All in the same snapshot folder.
- The new snapshot fields are optional on the `SnapshotResult` type (as `fx` and `provisional` already are) so hand-built fixtures still compile; the builder always sets them.
- `MethodPanels.tsx` still builds an `EngineCtx` by hand for a loan-only check; not a card payment, left unchanged.
- ROADMAP: `roadmap update-plan-progress` also ticked 05-101 and 05-110 (their summaries exist or are in progress); those two ticks were reverted by hand so only 05-95 changes in this plan's commit.

## Known Stubs

None. UI consumers of `basisNotes` (basis row text, key `decide.pay.cardLimitBasis`) and `cardMaxPurchase` (info terms) belong to later plans.

Device item: 05-EXECUTION-NOTES "05-26 device checklist additions (Decide UX refresh)", entry 05-95.

## Self-Check: PASSED
