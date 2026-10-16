---
phase: 04-decide-engine
plan: 07
subsystem: engine/decide
tags: [assess, verdict, cash-path, cash-dip, tdd]
requires: [04-06, 04-13, 04-15, 04-17]
provides: [prepareContext, assessPlan, assess, purchaseSize]
affects: [04-08, 04-09, 04-10, 04-11, 04-18, 04-20, 04-21, phase-05]
key-files:
  created:
    - src/engine/decide/assess.ts
    - src/engine/decide/__tests__/assess.test.ts
decisions:
  - "prepareContext resolves two shares (purchase via resolveShare on the scope, existing spending via resolveSpendingShare) and never re-shares existing spending with the purchase share (D-34)"
  - "Three cash figures: cashAvailable (the cash check, path-aware), ledgerCash (D-38 row: D-24 bills plus outflows dated on or before asOf) and cashAfterBills (spare money: also every outflow within 90 days); D-61 read literally"
  - "assessPlan builds the month table, five ledgers, D-31/D-59 facts, size and confidence in one pass, so Tasks 3 and 4 needed no further implementation"
metrics:
  tasks: 4
  files: 2
  tests: 89 (assess.test.ts), 645 across engine/decide and engine/payoff
  completed: 2026-10-16
---

# Phase 4 Plan 07: prepareContext, assessPlan and assess Summary

The Decide verdict: `prepareContext(snapshot)` resolves everything that does not depend on the check, `assessPlan(context, check, plan)` produces the ordered warnings, pause rule, cash-path dip, month table and five ledgers, and `assess(snapshot, check)` composes them with `resolvePlan` into a `Verdict`. `assess.ts` is at 100% statements, branches, functions and lines.

## What was built

- `prepareContext`: money basis (with `incomeSeries` for D-60), two shares (D-34), every limit defaulted from the user's own figures (D-01, D-04, D-05, D-06; cushion by steadiness through `defaultReserve`, D-42), bills due within 90 days (D-24), scheduled outflows through `scheduledOutflowsDue` (D-61), the 90-day cash path (D-44), `leftThisMonth`, `monthIncome`, `position: null`, `limits.projectionRates` (D-51). Failures return reasons in order (money, purchase split, spending split) plus a D-46 confidence from the money basis.
- `assessPlan`: pause rule (D-35, none for invest checks, D-33), warnings sorted by shortfall with the WARNING_ORDER tie-break, `cash_dip` through `classifyCashDip` with `cashOnHand: context.cashAvailable` (D-59), the `cash_tight_before_payday` fact after the D-31 fact, state rule (a hard dip is `no`), `basisCodes`, confidence, debt-service ratios, `debtBalanceAfter`, D-62 `newMonthly = mineMonthly + mineRunning`, the pre-pause month table and the five D-38 ledgers (cash row reads `ledgerCash` / `ledgerCashAfterPurchase`).
- `purchaseSize` (D-36) and `assess` (currency check D-16, statelessness D-30, missing verdict carries size and confidence).

## Commits

| Commit | Message |
| ------ | ------- |
| 3525f65 | test(04-07): prepareContext with two shares and bills due |
| 3676338 | feat(04-07): prepareContext with user-derived limits, two shares and bills due |
| 6b8d051 | test(04-07): assessPlan ledgers, pause rule and invest checks |
| 97a0cce | feat(04-07): assessPlan with pausable saving and investing |
| f3e7261 | test(04-07): assess composition, D-31 fact and properties |
| 0fd83e6 | feat(04-07): assess with basis facts and currency rejection |
| 3ea4f63 | test(04-07): month table and ledgers |
| cfe822c | refactor(04-07): reword docblock so the purchase-share call appears once |

## Verification

- `npx jest src/engine/decide src/engine/payoff --coverage`: 39 suites, 645 tests passed; decide and payoff at 100% (assess.ts 100/100/100/100).
- `npx tsc --noEmit`: clean apart from the known `expo-blur` error in `TabBar.tsx`; the D-30 `@ts-expect-error` is honoured.
- `npx eslint` on the touched files: 0 errors (only the known fast-check default-import warnings).
- `npm run depcruise`: no violations. `npm run check:ignores`: OK.
- Every hand-derived figure in the plan (cash-path lows 47_808 / -52_192 / 197_808 / 377_808 / 497_808 / 447_808 / 367_808, dip shortfalls 52_192 / 100_000 / 222_192 / 102_192 / 152_192 / 202_192, path balances for OUT_AHEAD / OUT_PAST / OUT_EDGE, the 1_845_005 cushion, D-60 433_333 / 900_000) matched the engine; nothing was bent to fit.

## Deviations from Plan

None in behaviour. Process notes:

- **TDD gate (Tasks 3 and 4):** `assessPlan` returns the whole `Assessment` (size, facts, month table, ledgers), which the type requires, so Task 2's GREEN commit already contained the D-36 size, D-31 fact, month table and ledgers. Task 3's RED commit failed (assess/purchaseSize missing, 17 tests) and its GREEN added `assess`; Task 4's tests (commit 3ea4f63) passed on first run and have no separate GREEN commit. Task 1 and Task 2 REDs were observed failing (module / export missing).
- **Docblock reword:** a final refactor commit rewords one docblock sentence so the acceptance grep for the single purchase-share call returns 1.
- Test titles avoid the reserved `D-24:`, `D-33:`..`D-36:`, `D-38:`, `D-59:`, `D-61:` prefixes; D-31/D-32 titles use `D-31:` / `D-32:` as the plan requires.

## Known Stubs

None.

## Threat Flags

None. All new surface is pure engine code inside the planned trust boundary.

## Requirements

DEC-06 is delivered here in part (the verdict); it stays Pending in REQUIREMENTS.md because 04-18 (stacking, future changes) and 04-20 (named deviations) still deliver parts of it. DEC-07, DEC-08, DEC-11, DEC-18, DEC-20, DEC-22, DEC-34, DEC-36 and DEC-37 likewise have other plans still delivering parts and were not ticked.

## Self-Check: PASSED

- src/engine/decide/assess.ts and src/engine/decide/__tests__/assess.test.ts exist.
- Commits 3525f65, 3676338, 6b8d051, 97a0cce, f3e7261, 0fd83e6, 3ea4f63 and cfe822c are in `git log` on phase/04-decide-engine.
