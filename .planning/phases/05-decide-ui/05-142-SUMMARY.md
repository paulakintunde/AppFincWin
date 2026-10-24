---
phase: 05-decide-ui
plan: 142
subsystem: engine/decide
tags: [engine, month-basis, D-106, D-107]
requires: [05-135, 05-136]
provides: [Basis month, HistoryBasis, basisKey]
affects: [Decide home card, Judge on control, verdict comparison]
key-files:
  created:
    - src/features/decide/copy/basisKey.ts
    - src/engine/decide/__tests__/monthBasis.test.ts
    - src/engine/decide/__tests__/monthBasisParity.test.ts
    - src/features/decide/copy/__tests__/basisKey.test.ts
  modified:
    - src/engine/decide/types.ts
    - src/engine/decide/assess.ts
    - src/features/decide/copy/verdictCopy.ts
    - src/features/decide/copy/warningCopy.ts
    - src/features/decide/copy/optionCopy.ts
    - src/features/decide/check/sections/MonthSection.tsx
    - src/features/decide/check/sections/AssumptionsSection.tsx
    - src/features/decide/check/sections/__tests__/tableSections.test.tsx
requirements: [DCU-40, DCU-39]
completed: 2026-10-24
---

# Phase 5 Plan 142: Month basis Summary

`Basis` is now `'average' | 'worst' | 'month'`. With `basisOverride: 'month'`, a check is judged on the current month as it is expected to end, and every figure downstream follows.

## The seam
`prepareContext` only. It asks `deriveMoney` for the worst basis (`HistoryBasis`; `deriveMoney` and `summariseMonth` are untouched beyond `MoneyInput.basisOverride: HistoryBasis | null`), then, for 'month', overlays `{ basis: 'month', incomeBasis, spendingBasis }` from `expectedMonthMoney(snapshot, spendingShare)`. Nothing else in the money is replaced, so the averages, worst and best months, steadiness, fullMonthsUsed, smoothed bills and the default reserve stay the history's. `leftBefore` equals `expectedMonth(context).result` exactly. `no_full_month` is unchanged. `expectedMonthMoney` throws RangeError on a bad bill or income series, as `assertValidBill` does elsewhere.

No other reader of `money.spendingBasis` needed a change: `cashPath` takes it as the undated burn and the context's own path equals a path rebuilt with the month money (tested).

## Copy
`basisKey.ts` (Record tables over Basis, so a fourth basis fails to compile): `basisWordKey(HistoryBasis)`, `basisVariantKey(key, basis)` (Month suffix), `basisKeyParams(basis)` (no {{basis}} for month), `basisMarkerKey`, `monthClosesKey`. verdictCopy (titles, body, marker), warningCopy (month-already), optionCopy (earn line), MonthSection (note, closing) and the Assumptions income row use it. No basis ternary remains in decide copy or sections. `verdictCopy` still re-exports `basisWordKey`.

## Parity results
World: worst income 500_000 and worst spending 350_000; July holds the pay, the rent and 250_000 other spending, nothing still due. For cash buy, loan, instalment, card, invest lump, invest monthly, property with a housing line and a typed income change (alone and with two stacked checks), the context, verdict, decide (margins, stress, worst month, expected income), position, line margins, options, alternatives (default and fixed cheaper), wait (default and fixed), setbacks, income at risk, stress, cash path and confidence are deep-equal between 'month' and 'worst' once `basis` and `basisOverride` are blanked. Second group: a tighter month fires the month warning on 'month' only, a looser one on 'worst' only, and every check's context differs when the figures differ.

## Verification
- engine/decide, copy, features/decide and i18n jest suites green (1568 engine tests; 17262 in features/decide and i18n); engine/decide coverage gate passes; `check:ignores` OK; no ignore comments; depcruise clean; typecheck green after each task; eslint 0 errors.
- Device item: 05-EXECUTION-NOTES "05-26 device checklist additions (Wording and This month, D-106)", entry 05-142.

## Commits
- 1bf23494 feat(05-142): first-class month basis in the engine, with the basis copy-key mapping
- 2cb4f71b feat(05-142): the month and assumptions sections use the basis mapping

## Deviations from Plan
- `basisKeyParams` added beyond the plan's four helpers, to keep the three copy callers to one line each.
- Dynamic keys in MonthSection and AssumptionsSection go through the existing `t as Translate` cast (the typed `t` rejects non-literal keys).
- Named test 'D-107 the verdict body names this month' added; the engineBarrel test needed no change (`HistoryBasis` is a type, no new runtime export).

## Noted, not changed (outside this plan's files)
- `home/homeCardModel.ts` line 124 (`money.basis === 'average' ? 'average' : 'worst'`) would label a 'month'-basis context as worst; the home card uses its own expected-month path, so this only matters if a later plan feeds it a month-basis context.
- `db/decideSettings.ts` and `buildSnapshot.ts` still type `basis_override` as `'average' | 'worst' | null`; wiring the stored view preference to `'month'` is a later plan.

## Self-Check: PASSED
