---
phase: 06-grow
plan: 08
subsystem: data-access
tags: [grow, db, holdings, export, cache]
requires: ["06-04"]
provides:
  - "Typed holdings and holding_lots db modules"
  - "Grow columns on goal, debt, account and series row types"
  - "Grow query and mutation keys"
  - "Export manifest coverage for Grow data"
  - "Persisted cache version 4"
affects: [06-10, 06-11, 06-12, 06-13, 06-14]
tech-stack:
  added: []
  patterns: ["key lists proven equal to SQL grants by parsing the migration"]
key-files:
  created:
    - src/db/holdings.ts
    - src/db/holdingLots.ts
    - src/db/__tests__/holdings.test.ts
    - src/db/__tests__/holdingLots.test.ts
    - src/db/__tests__/columns06.test.ts
  modified:
    - src/db/savingsGoals.ts
    - src/db/debts.ts
    - src/db/accounts.ts
    - src/db/rows.ts
    - src/db/__tests__/savingsGoals.test.ts
    - src/data/keys.ts
    - src/data/exportManifest.ts
    - src/data/__tests__/exportManifest.test.ts
    - src/data/cache/persister.ts
    - scripts/cache-shape.lock.json
key-decisions:
  - "NewGoal makes locked required (D-23); insertSavingsGoal accepts NewPot or NewGoal and skips the legacy pot shape rule when locked is present"
  - "New row fields are optional so old cached rows still type-check"
  - "Holdings and holding_lots exported without updated_by, is_sample and version"
metrics:
  tasks: 2
  completed: 2026-11-06
---

# Phase 6 Plan 08: Grow data access Summary

Typed access for every Grow column plus holdings and holding entries, with key lists proven equal to the SQL grants, GDPR export coverage, and a cache version bump to 4.

## Tasks

| Task | Commit | Result |
|------|--------|--------|
| 1 Row types, key lists, holdings modules | c1152229 | SavingsGoalRow, DebtRow, AccountRow, RecurringSeriesRow extended; NewGoal; holdings.ts and holdingLots.ts; columns06 grant-equality test |
| 2 Keys, export manifest, cache version | 5c216648 | queryKeys holdings and holdingLots; 14 unique mutation keys; export manifest; CACHE_SCHEMA_VERSION '4' and lock updated |

## Deviations from Plan

**1. [Rule 1 - Bug] Updated existing savingsGoals test**
- The 05-era test asserted the insert key list without the 06 grants and treated `check_id` as a stray key. The 06 grant adds `check_id` and the other Grow columns, so the expected list was extended and the stray-key case now uses `is_sample`. Added one test for an open-ended `NewGoal` insert.

**2. [Rule 3 - Blocking] WriteEntity not yet extended**
- Plan 06-09 owns `src/db/errors.ts` and adds `holdings` and `holding_lots` to `WriteEntity`. To keep this plan compiling alone, both modules use `'holdings' as unknown as WriteEntity` (and the lots equivalent). The casts become redundant once 06-09 merges and can be tightened to plain `as const` then.

## Verification

- jest: holdings, holdingLots, columns06, columns05_2, savingsGoals, debtsLinksPeriods, accounts, exportManifest all pass
- typecheck, eslint on touched files, depcruise, check:cache-version pass
- Mutation key uniqueness check: 86 keys, 86 unique

## Known Stubs

None.

## Threat Flags

None. T-06-08-01 to 03 mitigated as planned (grant-equality test, export guard test, cache version bump).

## Self-Check: PASSED
