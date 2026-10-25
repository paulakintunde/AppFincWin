---
phase: 05-decide-ui
plan: 119
subsystem: database
tags: [supabase, postgres, pgtap, rls, pots, housing]
requires: []
provides:
  - savings_goals.kind ('wait' | 'pot'), done_at, pot shape check, live index, widened grants, per-kind guard
  - debts.is_housing with backfill, update grant and guard_debt() default
  - apply_patches allow-list widened for savings_goals and debts
  - decide_settings.housing_line
affects: [05-120, 05-132, pots UI, housing line]
key-files:
  created:
    - supabase/migrations/20261024000100_pots_and_debt_housing.sql
    - supabase/migrations/20261024000200_decide_settings_housing_line.sql
    - supabase/tests/database/61_pots_and_debt_housing.test.sql
    - supabase/tests/database/62_decide_settings_housing_line.test.sql
  modified:
    - supabase/tests/database/36_account_deletion.test.sql
    - supabase/tests/database/55_decide_patches.test.sql
    - supabase/tests/database/58_decide_depth_tables.test.sql
    - supabase/tests/database/59_record_one_off_goal_tag.test.sql
    - supabase/tests/database/60_decide_review_fixes.test.sql
requirements-completed: [DCU-36, DCU-38]
completed: 2026-10-24
---

# Phase 5 Plan 119: Pots and housing migrations Summary

Two additive migrations (pots on `savings_goals`, `debts.is_housing`, `decide_settings.housing_line`) applied and proven on the local database only; nothing was pushed to production (that is 05-132).

## Commits
- 45a37a8a: pots, debts.is_housing, apply_patches, 61 test, 36 extension, old-fixture updates
- fe672d1a: housing_line migration and 62 test

## Verify
- `npm run lint:migrations`: MIGRATION COMPAT OK (44 files); `npm run verify:migrations`: MIGRATION GATE OK
- `supabase db reset --local` then `supabase test db`: 62 files, 1364 tests, PASS
- 61_pots_and_debt_housing: 55 tests; 62_decide_settings_housing_line: 20 tests; 36_account_deletion: plan(19) with "no pot remains" and "no debt remains"

## Deviations from Plan
**[Rule 3 - Blocking] Existing pgTAP fixtures updated (55, 58, 59, 60).** With the guard forcing `kind = 'pot'` on any insert outside `fincwin.decide_rpc` (as specified), their table-owner Wait-goal fixtures hit the pot shape check. Each fixture insert now runs with the RPC flag on and resets it straight after. In 58, two assertions encoded the old grants and were rewritten: a client goal insert now fails the pot shape check (23514, was 42501 "no insert grant"), and a client update of a Wait goal's target is put back by the guard (was 42501 "no column grant"). Also changed `guard_savings_goal` to set `new.kind := old.kind` on every update (kind frozen for both kinds) and to put back any non-null `check_id` change (WR-A01 preserved).

apply_patches was found unchanged since 20261016000200 (20261021000100 did not re-create it), so it was copied from there.

## Notes for later plans
- `reset role` keeps the last JWT claims; owner-role fixtures after a user section must clear `request.jwt.claims` or `auth.uid()` fills `created_by`.
- Backfill is proven by re-running the migration's UPDATE statement verbatim in the test against a rebuilt "old" state.
- The device item for 05-119 is in 05-EXECUTION-NOTES (R18 additions); production push is 05-132.

## Self-Check: PASSED
