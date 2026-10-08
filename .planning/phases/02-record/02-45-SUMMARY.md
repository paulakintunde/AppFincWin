---
phase: 02-record
plan: 45
subsystem: record / currency picker
tags: [fx, currencies, gap-closure]
requires: []
provides: [ISO_CURRENCIES, isoCurrency, ISO_CURRENCY_LIST_AS_OF, buildCurrencyOptions(iso, customs)]
affects: [currency picker, AccountSheet, TransactionSheet, useBalanceSummary]
key-files:
  created:
    - src/engine/money/isoCurrencies.ts
    - src/engine/money/__tests__/isoCurrencies.test.ts
    - src/data/queries/__tests__/isoCurrencyServerParity.test.ts
  modified:
    - src/engine/money/index.ts
    - src/data/queries/currencyOptions.ts
    - src/data/queries/__tests__/currencyOptions.test.ts
    - src/data/queries/__tests__/queries.test.tsx
    - src/db/rows.ts
    - src/data/keys.ts
  deleted:
    - src/data/queries/currencies.ts
    - src/db/currencies.ts
decisions:
  - "154-currency built-in list from a Frankfurter v2 snapshot dated 2026-10-07"
metrics:
  tasks: 2
  completed: 2026-10-07
---

# Phase 2 Plan 45: Built-in ISO currency list Summary

The picker's ISO source is now a 154-entry list shipped in `engine/money`, with no dependency on `fx_rates`, the `currencies` table or the network.

## What was done

- `src/engine/money/isoCurrencies.ts`: pure data (no imports), frozen, sorted by code, with `isoCurrency(code)` and `ISO_CURRENCY_LIST_AS_OF = '2026-10-07'`. Built from one fetch of `https://api.frankfurter.dev/v2/currencies` (165 entries) filtered by the plan's rule: the server's active ISO 4217 block, minus fund/metal/testing codes, keeping entries whose end_date is null or within 30 days of the snapshot.
- Left out as not in the server's active ISO block: ANG, CMD, CNH, GGP, IMP, JEP (XAG, XAU, XDR, XPD, XPT dropped by the exclusion list). EUR is present. All 21 Popular codes are present, so no stop condition was hit.
- Tests: the engine test checks each exponent against `currencyExponent`, codes unique and sorted, exclusions, lookup hit and miss, frozen, and the date format. `engine/money` coverage stays 100%. The parity test (under `src/data`) checks every code is in the server's active ISO block and every Popular code is in the list.
- `buildCurrencyOptions(iso, customs)` and `useCurrencyOptions` rewritten. ISO options always have `rateDate: null`. `loading = Boolean(userId) && customCurrencies.isLoading`, and ISO options are present on the first render.
- Deleted `useCurrencies`, `fetchCurrencies`, `CurrencyRow` and `queryKeys.currencies`. `staleness.ts` and `useFxLatest` are untouched.

## Tests changed

- `src/data/queries/__tests__/currencyOptions.test.ts`: rewritten for the built-in list, plus a picker-sections check.
- `src/data/queries/__tests__/queries.test.tsx`: removed the `useCurrencies` suites and the two cached-currencies cases. The `useFxLatest` cases are kept.
- No other test seeded `queryKeys.currencies()` or mocked `useCurrencies`.

## Verification

- `npx jest src/engine/money` plus the parity test, with coverage: 13 suites, 355 tests passed.
- `npm run typecheck`, `npm run depcruise` and `npx eslint src/data src/db src/engine/money` are clean.
- Full `npx jest`: 4588 of 4589 passed. The one failure, `YouScreen.test.tsx` "renders the user's full name and email", passed 15/15 when run alone. The suite took 25s in the full run, so this looks like a timing flake under load. The test is unrelated to this plan.

## Deviations from Plan

- **popularCurrencies.ts comment not changed.** The file contains no "live rate, or EUR" comment (that wording is only in the decision doc). The file's line endings made any edit rewrite the whole file, so I left it untouched.
- **ANG is excluded.** Frankfurter prices it, but the server's `is_iso4217_code()` lists it as withdrawn, and the parity requirement outranks it.
- Prettier is not a project dependency. I formatted the new files with single quotes, width 120 and es5 trailing commas to match the repo, which expands `isoCurrencies.ts` to one field per line.

## Commits

- 5cbe66c: built-in ISO list, tests and parity test
- bd750db: picker options from the built-in list, currencies query deleted

## Self-Check: PASSED
