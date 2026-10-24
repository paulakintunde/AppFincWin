---
phase: 05-decide-ui
plan: 38
subsystem: db
tags: [decide, supabase, db-module, replay-safe]
requires: [05-32]
provides: [decideChanges db module, savingsGoals db module]
affects: [05-12, 05-19, 05-40]
key-files:
  created:
    - src/db/decideChanges.ts
    - src/db/savingsGoals.ts
    - src/db/__tests__/decideChanges.test.ts
    - src/db/__tests__/savingsGoals.test.ts
metrics:
  tasks: 2
  files: 4
---

# Phase 5 Plan 38: Decide db modules Summary

Typed, replay-safe db modules for `decide_changes` (insert/patch key lists mirroring the 05-32 grants, MON-08 duplicate-id replay, version-conditional update, amount and month validation) and `savings_goals` (read and soft-delete only, no insert function, `fetchGoalLines` with regex-validated uuids capped at 200).

## Tasks

| Task | Commit |
|------|--------|
| 1 decideChanges.ts | 183dc47 |
| 2 savingsGoals.ts | 93f3615 |

## Verification

- `npx jest src/db`: 20 suites, 307 tests pass
- `npm run typecheck`: clean; eslint on the four files: clean; depcruise: no violations

## Deviations from Plan

- `insertDecideChange` also runs `assertAllowedKeys` on the whole payload (the plan requires a throw before any request on an extra key; this is how it is done).
- `fetchGoalLines` reads the `transactions` table with `deleted_at is null`, as the plan specifies, not the active view (the view may not expose `goal_id`).

## Notes

- No database needed; pgTAP is run by CI's `rls` job. No migration files created.
- Requirement IDs DCU-03, DCU-07, DCU-15, DCU-21 span later plans; left pending.

## Self-Check: PASSED
