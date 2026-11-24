---
quick: 261123-debt-details
subsystem: grow-debts, insights
tags: [debts, net-worth, accessibility, migration]
requires: [20261125000400_decide_go_from_waiting.sql, 20261122000300_household_privacy_rpcs.sql]
provides: [debts.credit_limit, debts.revolving, rate-unknown display, net-worth start dates]
key-files:
  created:
    - supabase/migrations/20261125001100_debt_details.sql
    - supabase/tests/database/119_debt_details.test.sql
    - src/features/grow/debts/DebtDetailsAsk.tsx
    - src/features/grow/debts/debtAskStore.ts
  modified:
    - src/features/grow/debts/AddDebtSheet.tsx
    - src/features/grow/debts/useDebtsRead.ts
    - src/features/grow/debts/DebtsSegment.tsx
    - src/features/grow/debts/DebtDetailScreen.tsx
    - src/data/mutations/growDebts.ts
    - src/db/debts.ts
    - src/engine/grow/netWorthSeries.ts
    - src/data/queries/insightsNetWorth.ts
    - src/features/insights/sections/NetWorthSection.tsx
completed: 2026-11-23
---

# Quick 261123: Debt details (DD-01..DD-08) and three Insights accessibility/offline fixes

Owner decisions are in `261123-debt-details-CONTEXT.md`. Branch: `worktree-agent-adb9775edc40f5d1e`.

## Commits

| Hash | What |
| --- | --- |
| ba246196 | docs: owner decisions DD-01..DD-08 (CONTEXT) |
| 97f01177 | migration 20261125001100 + pgTAP 119 + export manifest columns |
| ed73bf46 | data layer: DebtRow/keys, useSaveGrowDebt (no silent started_balance), cache 17 -> 18 |
| 41712c3e | engine + read: net worth honours start dates and works fixed loans back (DD-07) |
| 3293fe35 | Grow UI: form (DD-01..DD-04), rate unknown shown as unknown, quiet ask (DD-05) |
| f9f05d04 | Insights: heading on offline/loading/error, figure label, chart toggle label |
| 97a60a1f | refactor: rateForMathsOf moved to break an import cycle |

## Migration

`supabase/migrations/20261125001100_debt_details.sql`. It is additive and was NOT applied to any database.
- `debts.credit_limit bigint` (nullable, 0..10^13) and `debts.revolving boolean` (nullable).
- Grants: insert (credit_limit, revolving, paid_off_on); update (start_date, credit_limit, revolving).
- `apply_patches`: copied from 20261122000300. The debts allowlist and type map add start_date, credit_limit and revolving, so Undo of an edit replays.
- `record_decide_go` (p_row_ids overload): copied from 20261125000400. The financed debt now stores `started_balance` = the financed amount and `start_date` = the purchase date (the earliest row date written in the call, or today), plus `revolving = false` (DD-08).

## Choices made within DD-01..DD-08

- **Rate unknown has no new column.** A null `apr` on a carried debt is the stored "I don't know" (D-07). 0% is stored as '0'. A card paid in full keeps a null rate but is never flagged.
- **`revolving` column.** Line of credit and Money owed both save as `kind = 'other'`, so this column tells them apart. Money owed counts as a fixed loan.
- **No silent `started_balance`.** On add it is no longer set to the balance. A fixed loan stores its original amount; a revolving debt stores nothing.
- **Editing an old debt with a null rate** opens with "I don't know the rate" already chosen, so DD-01 never blocks the edit.
- **Payoff maths for an unknown rate** still runs without interest. Every place that shows it says so: list row ("rate unknown"), detail (rate fact, "Not counted · rate unknown" for interest, what-if line), a note naming the debts under the plan card, and a note in the extra-payment calculator.
- **"Not now" (DD-05)** is remembered per user on the device (AsyncStorage `fincwin:debt-ask:<user>`). Device wipe clears it.
- **Net worth (DD-07).** A debt is left out before its start date. A fixed loan with no account, an original amount, a start date and paid payments is worked back as today's balance plus later payments, capped at the original amount. Payments come from `fetchDebtPayments` (capped at 240 lines). If any payment can't be converted, the loan keeps today's rule; no amount is guessed.

## Do figures move?

- **Decide:** the app sends no change. The Decide v3 Go-ahead sends no debt today (`debt: null`), so DD-08 only changes rows written by older or future callers.
- **Grow payoff numbers:** unchanged. Unknown-rate debts are now labelled as such instead of showing $0 interest.
- **Insights net worth history:** moves for debts that have a start date (left out before it) and for fixed loans that can be worked back.

## Checks

- `npx tsc --noEmit`: clean.
- eslint on changed files: 0 errors (4 old require() warnings in test files).
- `npm run depcruise`: no violations. One cycle was found and fixed in 97a60a1f.
- `npm run check:cache-version`: OK (version 18, lock updated).
- `npm run lint:migrations`: MIGRATION COMPAT OK (115 files).
- `npm run verify:migrations`: MIGRATION GATE OK.
- jest `src/features/grow src/data src/engine/grow src/engine/payoff src/features/insights src/i18n src/db`: 271 suites passed, 27111 tests passed, 2 skipped. After the refactor, grow/debts, grow/connect and grow/calculators were re-run: 311 tests passed.
- netWorthSeries.ts coverage: 100% statements, branches, functions and lines.
- **pgTAP not run.** Docker Desktop is not running on this machine, so `supabase db start` could not run. `119_debt_details.test.sql` has never been executed. Run it before the migration is pushed.

## For the owner

1. Run pgTAP 119 (and the full `supabase test db`) on a local stack before pushing 20261125001100.
2. **Decide's own debt sheet still says "Leave blank if none."** (en.ts ~1054, `decide...rateHelp`). It is not part of the Grow form, and I left it alone. If DD-01 should cover Decide's sheet too, that is a follow-up.
3. A paid-off debt is not listed in the Grow Debts segment, which is existing behaviour. After it is added, its detail page (the "cleared" view) opens. A "paid off" list is not part of these decisions.
4. Net worth history still begins at the first month with records. A loan that started earlier does not push the chart further back.

## Self-Check: PASSED
- All files listed in key-files exist. Commits ba246196, 97f01177, ed73bf46, 41712c3e, 3293fe35, f9f05d04 and 97a60a1f are on the branch.
