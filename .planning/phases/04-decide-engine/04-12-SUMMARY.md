---
phase: 04-decide-engine
plan: 12
subsystem: engine/decide
tags: [decide, barrel, public-api, codes-only-guard, phase-gate]
requires: [04-08, 04-09, 04-10, 04-11, 04-16, 04-18, 04-19, 04-20, 04-21, 04-22]
provides: [engine/decide public barrel, D-21 codes-only guard, phase 4 gate]
affects: [phase-05]
key-files:
  created:
    - src/engine/decide/index.ts
    - src/engine/decide/__tests__/public-api.test.ts
    - src/engine/decide/__tests__/outputs-are-codes.test.ts
  modified:
    - src/engine/decide/position.ts
    - src/engine/decide/__tests__/position.test.ts
decisions:
  - "The barrel uses export * for every module except share.ts and cardRule.ts, which are explicit named re-exports: types.ts already re-exports ShareScope, SplitRule, ResolvedShare, ItemType, CardEligibility, Percent and CardMinimumTerms, and import/export lint rejects the duplicates"
  - "The codes walker skips the context.snapshot key: it is the caller's own input handed back (record line ids), not an engine output"
  - "The engine-generated future-change id 'purchase-income' became 'purchase_income' so every engine-emitted string is a code (D-21)"
metrics:
  completed: 2026-10-16
requirements-completed: [DEC-12, DEC-30]
---

# Phase 4 Plan 12: Public barrel, codes-only guard and phase gate Summary

`engine/decide` is now one import for Phase 5 (32 modules plus `percent`, `ZERO_PERCENT` and the `CurrencyCode`/`MinorUnits` types), a recursive guard proves every string the engine emits is a code, a caller id or a date, and the full phase gate is green.

## Tasks
1. Barrel and API/purity tests: `index.ts`, `public-api.test.ts` (102 tests). Entry-point existence, end-to-end assess/options/alternatives/setbacks/wait/firstRead on a plain snapshot, the 05 D-23 quick-check path, `decide()` equal to `assess()` with the D-41..D-53 report, investment views at 0% and 5% with and without a holding fee, the D-61 outflow smoke (`o_pending`, ledger cash unchanged, `ledgerCashAfterPurchase`), verdict-path isolation for 26 modules (comments stripped before matching), and an in-suite purity mirror over every non-test file in decide and payoff.
2. Codes-only guard: `outputs-are-codes.test.ts` (19 scenario tests + 41 no-advice source scans). Walks fits, adjust (D-35 `inv` pause), no, several missing, invest with `debt_rate_exceeds_return`, bills due, month table/ledgers/wait plan, all six option codes, four suppression codes with `byRate` of length 2 (0% first), all four setbacks and incomeAtRisk, four first reads, a Decision with stacked/missing checks, stress and expected income, `cash_dip`, `cash_path_unavailable`, `cash_tight_before_payday`, `one_offs_excluded`, `on_edge`, promo with `deferred_interest_charged`, late fees, card fees (D-63), investment views with a holding fee, a `loss_of_value` running cost, the prompt table, estimate bias and scheduled outflows `o_past`/`o_ahead`. A final test asserts the set of collected strings includes every expected code.

## Commits
- b2504de feat(04-12): decide public barrel
- fa2d278 test(04-12): engine outputs are codes and numbers only (D-21)

## Phase gate results (full run, worktree C:\dev\fincwin-p4)
- `npm run test:coverage`: 429 suites (427 passed, 2 failed), 9567 tests (9553 passed, 14 skipped). `engine/decide`, `engine/payoff` and `engine/statement` are all 100% on statements, branches, functions and lines; no coverage-threshold message. The 2 failed suites are `src/shell/tabBar/__tests__/TabBar.a11y.test.tsx` and `src/shell/__tests__/shellNavigation.test.tsx`: both `Cannot find module 'expo-blur'`.
- `npm run depcruise`: no violations (522 modules). `npm run check:ignores`: OK. `node scripts/decide-golden/generate-golden.mjs --check`: exit 0. `npm run verify:gates`: GATES OK.
- `npm run typecheck`: one error, `src/shell/tabBar/TabBar.tsx` expo-blur not found. `npm run lint`: one error, the same file (`import/no-unresolved` for expo-blur); the other 677 are warnings.
- Cross-suite check (W6): the assess, firstRead, bisect, options, alternatives, setbacks, wait, golden, position, plan, money, cashPath and deviations suites all pass in the same full run.

## Environment findings (not caused by this phase)
- `expo-blur` is declared in package.json but missing from the shared node_modules junction. It accounts for the single tsc error, the single lint error and the 2 failing shell suites. `git diff origin/main --stat -- src/shell src/engine/statement` is empty: this phase touched neither.
- `src/engine/statement/` under its 100% threshold, seen in earlier scoped runs, does not reproduce: it is 100% in the full `npm run test:coverage` run (scoped runs only load part of the folder's tests). Nothing to fix.

## Deviations from Plan
**1. [Rule 1 - Bug] Engine-emitted non-code id.** Found during Task 2: `position.ts` named the purchase-linked future change `'purchase-income'`, which appears in `Decision.withExpectedIncome.assessment.context.position.changes[].id` and is not snake_case. Renamed to `purchase_income` (one constant in `position.ts`, one expectation in `position.test.ts`). Commit fa2d278.

**2. [Rule 3 - Blocking] Duplicate star re-exports.** `export *` from share.ts and cardRule.ts duplicates names types.ts already re-exports (lint `import/export`, not a TS2308). Those two modules are explicit named re-exports; the public surface is unchanged. Percent and CardMinimumTerms come from types.ts rather than a second explicit export. Commit b2504de.

**3. Test scenarios chosen to be correct, not copied from the plan.** The plan's "adjust" example (cash purchase of 150_000) is `fits`: a cash purchase does not move the month. The guard uses a 12 x 150_000 instalment (`adjust`, with the `inv` pause warning) and a 6_000_000 zero-deposit loan on a 1_000_000/700_000 history for `no`. The options scenario is a 6_000_000 loan with a 1_500_000 deposit so all six option codes appear. No engine figure was bent.

## Requirements
DEC-12 and DEC-30 delivered and marked complete. The phase itself is not marked complete here (orchestrator, after verification).

## Known Stubs
None.

## Self-Check: PASSED
