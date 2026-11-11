---
phase: 06-grow
review: 06-REVIEW.md
fixed_on: 2026-11-11
scope: all 73 findings (12 critical, 44 warning, 17 info), owner choice "Everything"
status: fixed, pending CI (pgTAP) and production migration 20261110000200
---

# Phase 6 review fixes

Five fixers worked in parallel (database, engine, debts/investing/calculators UI,
goals/safety net/home/lines UI, Record wiring). The orchestrator then joined
their work and ran the full local checks. All checks passed: typecheck, lint
(0 errors), depcruise, lint:migrations, cache-version (v7 unchanged),
right-answers, money-mirror, and full jest (990 suites, 40,028 tests passed).

## Commits

| Commit | Area |
|---|---|
| 8b7b94ac | Database: migration 20261110000200 and pgTAP 96 (84 assertions) |
| 8eb35da0 | Engine: unlocked goals, card minimum by currency exponent, revision 06.2 |
| 7ad48c6c | Data and Decide wiring |
| ac362261 | Grow screens |
| 3da31a3e | Record |

## Owner decisions applied (2026-11-10)

- **Remove a goal or debt:** future lines stop. Removal ends on the later of
  yesterday and the last paid line. Overdue unpaid lines are removed. One
  server call (`remove_goal` / `remove_debt`) writes one undo step.
- **Production push:** only if CI is green, after `npm run supabase:preflight`.

## Defaults chosen and reported to the owner

- A removed goal's old Expected line can be marked paid as a plain payment.
- "See all in Activity" from a debt opens on the latest paid month.
- A typed $0 loan minimum is allowed. Old $0 minimums stay as they are.
- Share-of-pay is hidden when currencies differ.
- Goals in another currency show their own currency.
- The Reached moment may replay.

## Integration changes made by the orchestrator

- `save_debt_plan` with an extra now stops the extra on other debts in the
  same undo step. The client-side loops in `DebtExtraCalculator` and
  `DebtsSegment.useExtra` were removed.
- Import marks goal lines (`pendingIsGoalLine`), so a flagged goal line is
  inserted, not patched.
- Card minimum estimates use the currency's exponent everywhere: add sheet,
  debts read, detail floor.
- `useRemoveDebt` refreshes inline instead of importing `transactionCache`.
  That import broke the fx-fetch-never-from-reads rule.
- **P4-CR-03 changed approach.** `planMonthly` exists on the engine inputs but
  is not passed in. Passing it changed answers for pots saved before Phase 6
  (growConnect "keeps every existing answer" failed). Instead, Grow now saves
  the matching ready-by date with each monthly amount (`readyByFromMonthly`),
  and Decide follows the date.

## Follow-ups (not in this fix)

1. **GL-04, lock-or-leave prompt.** The owner sent GL-04 back. After a net
   withdrawal, the next answer should use the $1,000 and show a prompt to
   lock it or leave it unlocked. GL-04 stays draft (allow-listed in
   `phaseGate.test.ts`).
2. **judge.ts freed money.** Wording and placement of the freed-money line
   for unlocked goals need a review against the GL-04 prompt.
3. **Bulk mark-paid for removed goals.** `useBulkMarkPaid` still skips all
   goal_id lines, including lines of removed goals.
4. **planMonthly not wired.** See above. Revisit only with a right-answers
   case and owner sign-off.
5. **cashLeft question (engine fixer).** Should money in unlocked goals count
   toward "cash left" on the verdict card, or only in the spendable total?
   Owner to decide.
