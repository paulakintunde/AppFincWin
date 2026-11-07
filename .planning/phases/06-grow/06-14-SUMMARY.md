---
phase: 06-grow
plan: 14
subsystem: data-access
tags: [grow, debts, payoff, holdings, investing, net-worth, mutations, write-queue]
requires: ["06-01", "06-02", "06-05", "06-07", "06-08", "06-09", "06-12"]
provides:
  - "src/db/debtPlan.ts: saveDebtPlan, recordDebtSale RPC wrappers"
  - "src/data/mutations/growDebts.ts: registerGrowDebtMutations, useSaveGrowDebt, useSaveDebtPlan, useRecordDebtSale, refreshDebtReads"
  - "src/features/grow/debts/useDebtsRead.ts: useDebtsRead, buildDebtsModel, DebtsModel"
  - "src/data/queries/growHoldings.ts: useHoldingRows, useHoldingLotRows"
  - "src/data/mutations/growHoldings.ts: registerGrowHoldingMutations, useAddHolding, useEditHolding, useAddHoldingLot, useEditHoldingLot, useSetAccountRate, refreshHoldingReads, lotsReplayError"
  - "src/features/grow/investing/useInvestingRead.ts: useInvestingRead, buildInvestingModel, InvestingModel"
  - "src/features/grow/netWorth.ts: netWorthOf (the one D-26 net-worth rule)"
affects: [06-15, 06-16, 06-17, 06-18]
key-files:
  created:
    - src/db/debtPlan.ts
    - src/db/__tests__/debtPlan.test.ts
    - src/data/mutations/growDebts.ts
    - src/data/mutations/__tests__/growDebts.test.tsx
    - src/data/mutations/__tests__/growSale.test.tsx
    - src/features/grow/debts/useDebtsRead.ts
    - src/features/grow/debts/__tests__/useDebtsRead.test.tsx
    - src/data/queries/growHoldings.ts
    - src/data/mutations/growHoldings.ts
    - src/data/mutations/__tests__/growHoldings.test.tsx
    - src/features/grow/investing/useInvestingRead.ts
    - src/features/grow/investing/__tests__/useInvestingRead.test.tsx
    - src/features/grow/netWorth.ts
    - src/features/grow/__tests__/netWorth.test.ts
  modified:
    - src/data/mutations/index.ts
    - src/features/grow/connect/debtPoint.ts
key-decisions:
  - "saveGrowDebt edits use the direct version-conditional update (updateDebt) plus a client-built Undo step, like debts.ts and 06-12's goal edits; the plan and the sale use the server-built steps."
  - "The combined payoff plan is worked in one currency (the one with the most owed); debts in other currencies are listed but marked inPlan false, never mixed."
  - "The saved plan extra is the sum of payoff_extra over the plan's debts; the saved order is the first non-null payoff_order."
  - "A sale payment above the balance is refused client-side ('payment-exceeds-balance'); leftOver = max(0, soldFor - paidToLoan)."
  - "netWorthOf takes already-converted home-currency figures; the caller converts and leaves out what it cannot convert."
requirements-completed: [GRW-04, GRW-05, GRW-06, GRW-07, GRW-08, GRW-09, GRW-10, GRW-11]
completed: 2026-11-06
---

# Phase 6 Plan 14: Debt and investing data hooks Summary

RPC wrappers, queued undoable writes and engine-sourced read models for Grow's Debts and Investing segments (LEDGER: Auto loan clears 2029-04-15 with 75636 interest; holdings total 769000 with a 69000 gain), plus `netWorthOf`, the single D-26 net-worth rule.

## Tasks

| Task | Commit | Result |
|------|--------|--------|
| 1 Debt RPC wrappers, mutations, sale, payoff read model | 94782f87 | 7 db tests, 11 debt mutation tests, 7 sale tests, 9 read tests |
| 2 Holdings, lots, values, APY, investing read model, net worth | 1223d5ac | 18 mutation tests, 10 investing read tests, 6 net worth tests |

## What was built

- `saveDebtPlan` / `recordDebtSale` (src/db/debtPlan.ts): 'conflict' throws `VersionConflictError`; 'applied' and 'already-applied' are success; unknown status is a bad-response `DbError`. The undo step sent is only `{ id, label_key, label_params: { name } }` ('debtPlanSaved' / 'debtSaleRecorded'). Extra 0 sends `p_series` null; an extra without its record is refused client-side.
- `useSaveGrowDebt` (key `saveGrowDebt`): add (labels 'debtAdded') and edit ('debtEdited'). started_balance defaults to the balance. A card with pays_in_full 'yes' is saved with no rate and minimum 0 (D-15); "Not sure" stays null and counts as carried.
- `useSaveDebtPlan`: builds the monthly record on the debt's due day (today when none) from the chosen account and sends one `save_debt_plan` call. The server builds the Undo step, so the client records none. Success refetches debts and recurring series (no version + 1 guess).
- `useRecordDebtSale`: ONE `record_debt_sale` call carrying both legs with client uuids (T-06-14-01). Optimistic cache marks the debt paid off; the server's `still_owed > 0` keeps it open; returns `leftOver` for the "Left over goes to" line. `refreshDebtReads` is exported for use after Undo (same role as `refreshGoalReads`).
- `buildDebtsModel` / `useDebtsRead`: composes `debtPointOf`, `strategy`, `fixedPayoff` and `estimatedCardMinimum`. Gives both orders' payoff date and total interest with and without the extra, cards paid in full listed apart, `minimumEstimated` flag (D-28), `oneDebt`, and what-if scenarios for the focus debt. LEDGER: minimum only (30 months, 75636), +5000 (26, 64491), lump 100000 (26, 58204), date 2029-04-15.
- Holdings: `useAddHolding`, `useEditHolding` (edit and remove), `useAddHoldingLot` (buy, sell, dividend, fee, and 'value' for "Update value"), `useEditHoldingLot` (edit and remove), `useSetAccountRate` (percent checked client-side). Labels used are only the 06-09 keys: holdingAdded, holdingEdited, holdingRemoved, holdingEntryAdded, holdingEntryEdited, holdingEntryRemoved, holdingValueUpdated, accountRateSaved. A sale beyond the units held, or an edit or removal that would leave one, is refused with `sell-exceeds-units` (T-06-14-02); the opening put-in counts as the first buy.
- `buildInvestingModel` / `useInvestingRead`: put in via `replayLots`, gain via `holdingGain` / `totalGain` / `gainPercentTenths`, staleness via `isValueStale` (fresh at 30 days, stale at 31), whole-percent allocation via `divideHalfUp`. LEDGER: Retirement 645000 (+65000, 11.2%), Index 124000 (+4000), totals 769000 / 700000 / 69000, allocation 84 / 16, monthly 20000.
- `netWorthOf` (src/features/grow/netWorth.ts): header names it the single rule for Grow and the later Insights/Overview phase. Skips an investment account's balance once it has a live holding, and does not subtract a debt linked to an account (already in that balance). LEDGER 403500; an investment account with no holding gives 903500.

## Deviations from Plan

**1. [Rule 3 - Blocking] `dueDateOf` is now exported from src/features/grow/connect/debtPoint.ts** (one-word change, `export function`). The plan did not list that file, but the series anchor date and the plan's payoff date need the same due-day arithmetic; duplicating it would risk the two drifting. 06-15 does not touch that file.

**2. [Design] Add and edit of a Grow debt share the key `saveGrowDebt`**, with a `mode` discriminator in the variables, because the key list has one key for both.

**3. [Design] `useAddHolding` requires `openingPutIn`** (no default): leaving it at 0 would make the whole value look like gain.

**4. [Design] Acceptance grep `grep -rn "estimatedCardMinimum" src/features/decide`** matches one comment and one export-list string in the existing `engineBarrel.test.ts` (added by 06-01). No Decide source file uses the estimate, which is the intent of D-28's deferred note.

## Known limitations (for later plans)

- A queued edit of a holding made right after a value entry may carry a stale expected version (the server trigger bumps the holding version on any value-entry write). The holdings list is refetched after every entry write, which closes it in normal use; a long offline queue could still park a conflict.
- The combined payoff plan covers one currency; mixed-currency debt lists show the others as outside the plan.
- Allocation percentages use per-row half-up rounding, so they may not add to exactly 100.

## New strings needed in en.grow (06-09 owns it; not edited here)

- Series name for the extra payment record: the hook defaults it to the debt's name, but the UI should pass a translated `seriesName` (for example "Extra on {{name}}").
- Sale line names for the UI to pass: the sale transaction name ("{{name}} sold") and the final payment name ("{{name}} final payment").
- Error wording for the refusals the UI must show: `sell-exceeds-units`, `bad-units`, `payment-exceeds-balance` (the hooks throw `RangeError` with these as the message).
- Label "Estimate" for `minimumEstimated` (D-28) and "Value out of date" for `stale` (D-12), if not already present.

## Known Stubs

None.

## Threat Flags

None beyond the plan's threat model: T-06-14-01 (single RPC call, asserted in growSale test), -02 (replayLots check on add, edit and remove of entries, tested), -03 (D-26 rule tested with linked and unlinked investment accounts and linked debts), -04 (failed-write records carry ids and field names only, tested with sentinel names and amounts).

## Verification

- `npx jest` on the nine new suites (db debtPlan, growDebts, growSale, useDebtsRead, growHoldings, useInvestingRead, netWorth) plus registry05_2/05_3: all pass.
- `npm run typecheck`, `npm run depcruise`, `npm run check:cache-version` (shapes unchanged, version 4), eslint on changed files: clean (require-import warnings in the mutation tests, same as sibling tests).
- Not run: full coverage (per milestone rule).

## Self-Check: PASSED

Created files exist; commits 94782f87 and 1223d5ac exist.
