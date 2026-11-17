---
phase: 08-household
plan: 30
subsystem: activity-decide-figures
tags: [household, settlements, ARC-18, engine, activity, decide]
requires: [08-04, 08-15]
provides:
  - monthTotals and unpaidOutflows exclude isSettlement rows
  - withSettlementFlag (src/data/queries/settlementFlag.ts): Decide source rows carry isSettlement from is_settlement
  - bo07.phase8 settlement contracts switched on
affects: [08-25, 08.1]
key-files:
  created:
    - src/engine/activity/__tests__/totals.test.ts
    - src/data/queries/settlementFlag.ts
    - src/features/decide/snapshot/v3/__tests__/buildInputs.settlement.test.ts
  modified:
    - src/engine/activity/totals.ts
    - src/engine/activity/monthFigures.ts
    - src/engine/activity/__tests__/monthFigures.test.ts
    - src/data/queries/activity.ts
    - src/data/queries/decide.ts
    - src/features/record/activity/useActivityViewModel.ts
    - src/features/record/activity/monthFigureInputs.ts
    - src/features/record/activity/__tests__/monthFigureInputs.test.ts
    - src/engine/month/__tests__/bo07.phase8.contract.test.ts
decisions:
  - A settlement row is dropped before the transfer check, so it never adds to transferCount; balance.ts is untouched, so a settle-up still moves its account's balance (D-22)
  - Decide's source keeps its array identity when no row is a settlement (06.1-46), so only households with settle-ups allocate a mapped copy
completed: 2026-11-16
---

# Phase 8 Plan 30: Settlements out of spending and income (client half of ARC-18) Summary

Settlement records no longer count as money in or out. `monthTotals` (Activity totals, Home's This month figures) and `unpaidOutflows` (Home's unpaid line) skip rows flagged `isSettlement`, every caller sets the flag through the one engine rule, and Decide's source rows now carry it so 05.5's builder (which already skips flagged rows) leaves settle-ups out of the month lines and the month picture that Home's small line and Decide's lead figure both read.

## Commits
- a2301eb3: engine totals and month figures exclude settlement rows (100% branch coverage on src/engine/activity)
- fe1be31a: callers (activity query, narrowed totals, monthFigureInputs, Decide source) set `isSettlement`; builder test; two BO-07 contracts on

## What was built
- `TotalsInput.isSettlement?` and `MonthFigureRow.isSettlement?` (omitted means not a settlement); `monthTotals` skips such rows ahead of the transfer branch; `isUnpaidOutflow` rejects them.
- Callers: `src/data/queries/activity.ts` (the month totals), `useActivityViewModel.ts` (narrowed totals when searching or filtering), `monthFigureInputs.ts` (`is_settlement` added to the picked fields; this feeds `monthPositionOf` for Home and Activity). All use `isSettlement({ isSettlement: r.is_settlement === true })` from `engine/household/settlement`.
- Decide: `useDecideSnapshot`'s `source` maps `history.data` and `upcoming.data` through `withSettlementFlag`. Home's small line (`useHomeViewModel` through `useDecideV3`) and Decide's lead figure read the one picture, so one change covers both.
- Contracts, switched on in place with exact titles: "settlements count as neither spending nor income in Activity totals" (`monthTotals`) and "...in the month picture" (`countsForMe` is 0 for a settlement line; `excludeSettlements`; comment names the builder test). The other two titles stay `test.todo` (08-25 and 08.1 own them). The frozen manifest passes.
- Category caps: no change needed. Settlement records are written with no category (`hh_write_settlement_records` inserts without `category_id`), and `useCategoryMonthUsage` skips rows with no category.
- Grep check: the only non-test callers that build these inputs are the ones listed (activity query, useActivityViewModel, monthFigureInputs via useHomeViewModel and useActivityViewModel); no unlisted caller exists.

## Verification
- `jest -c jest.engine.config.js` on src/engine/activity, src/engine/month, src/engine/household: 47 suites pass; totals.ts and monthFigures.ts at 100% statements, branches, functions, lines
- jest: buildInputs.settlement, buildInputs.paths, monthFigureInputs, src/data/queries decide, src/test/contracts (bo07 contracts and the manifest), src/features/record/activity, src/i18n (householdCopy), hapticNames, noRawColours: pass (one full run of these had two failures, both fixed below, then re-run alone: green)
- `npx tsc --noEmit` clean; eslint on touched files: 0 errors (warnings only, all in untouched test lines)
- No database, no package changes, no pushes.

## Deviations from Plan
1. [Rule 3 - Blocking] `withSettlementFlag` lives in a new file `src/data/queries/settlementFlag.ts`, not inside `decide.ts`: importing decide.ts in a unit test pulls the Google sign-in native module through the supabase client. `decide.ts` imports it.
2. [Rule 1] The existing `monthFigureInputs.test.ts` "maps rows" expectation gained `isSettlement: false` because the mapping now always sets the flag.
3. No separate `useActivityViewModel` or activity-query test exists for totals; the engine, `monthFigureInputs` and the builder tests carry the coverage.

## Known Stubs
None.

## Self-Check: PASSED
