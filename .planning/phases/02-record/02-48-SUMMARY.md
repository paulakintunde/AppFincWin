---
phase: 02-record
plan: 48
subsystem: fx-read-path
tags: [fx, depcruise, accounts, gap-closure]
requires: [02-46]
provides: [waiting-for-a-rate state on foreign accounts, structural ban on read-path FX fetches]
affects: [Phase 4 Decide (must carry the waiting state into verdict copy)]
key-files:
  created:
    - src/features/record/accounts/__tests__/AccountBalanceBlock.test.tsx
    - src/data/queries/__tests__/homeAmount.test.ts
  modified:
    - src/features/record/accounts/AccountBalanceBlock.tsx
    - src/i18n/locales/en.ts
    - .dependency-cruiser.cjs
decisions:
  - "Missing pair rate renders 'Waiting for a rate' in meta style, no RateAttribution, own-currency balance always shown"
metrics:
  tasks: 2
  completed: 2026-10-08
requirements: [MON-07, REC-08, ACT-01]
---

# Phase 2 Plan 48: Waiting for a rate + read-path fetch ban Summary

A foreign account with no stored rate for its pair now reads "Waiting for a rate" instead of silently hiding the home figure, and dependency-cruiser fails the build if any read path can reach `src/db/fxResolve.ts`, directly or transitively.

## Commits
- a28e556 feat(02-48): 'Waiting for a rate' (Task 1, RED confirmed first: 4 waiting-state tests failed before the change)
- 3b16707 chore(02-48): depcruise rules fx-fetch-only-from-writes and fx-fetch-never-from-reads (Task 2)

## Task 1
`AccountBalanceBlock` computes `waiting = foreign && !overflow && balance !== null && homeFigure === null` and renders `accounts.inHomeWaiting` ('Waiting for a rate') in the existing meta style, compact and full. Final copy, not a placeholder (AWAITING_COPY_KEYS stays empty). Tests: both legs stored shows the figure; empty table, GBP missing, USD missing show the waiting line and no "≈"; home account shows neither; compact card shows it; render never calls the `fxResolve` exports or `functions.invoke`. `homeAmount.test.ts` pins null on a missing leg, EUR needing only the other leg, and `latestPerEur('EUR')` non-null on an empty table.

## Task 2 probe output
Clean tree: `no dependency violations found (282 modules, 1333 dependencies cruised)`.

Probe 1 (`import '@/db/fxResolve'` in AccountBalanceBlock.tsx):
```
error fx-fetch-only-from-writes: src/features/record/accounts/AccountBalanceBlock.tsx → src/db/fxResolve.ts
x 1 dependency violations (1 errors, 0 warnings)
```
Probe 2 (`import '@/data/mutations/transactionCache'` in homeAmount.ts):
```
error fx-fetch-never-from-reads: src/data/queries/homeAmount.ts → src/db/fxResolve.ts
    src/data/mutations/transactionCache.ts → src/db/fxResolve.ts
error fx-fetch-never-from-reads: src/data/queries/activity.ts → src/db/fxResolve.ts
    src/data/queries/homeAmount.ts → src/data/mutations/transactionCache.ts → src/db/fxResolve.ts
x 2 dependency violations (2 errors, 0 warnings)
```
Both probes were reverted with `git checkout`; no probe import remains.

## Verification
`npm run depcruise` pass; `npm run typecheck` pass; `npm run lint` 0 errors (255 pre-existing warnings); jest on `src/features/record/accounts`, `src/data/queries/__tests__/homeAmount.test.ts`, `src/i18n`: 7 suites, 1765 tests pass. The wider `src/features/record src/data` jest run was not repeated after Task 2 (a config-only change).

## Deviations
None. Worktree base was reset to 06e439e as instructed; `npm ci --legacy-peer-deps` was needed.

## Threat flags
None. T-02-48-01 and T-02-48-02 mitigated as planned.

## Self-Check: PASSED
