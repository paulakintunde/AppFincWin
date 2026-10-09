# Phase 2.2: record polish production rollout record

Plan 02.2-16. Records every production command and what it printed. No secret
values are ever written here (names only).

PR: PENDING
Approval: pending
Deployed commit: pending

min_supported_version: unchanged (additive only)

## Local gate (Task 1), run 2026-10-09 on phase branch HEAD 74d2319

- `npm run lint:migrations`: MIGRATION COMPAT OK (29 files, floor 0.1.0); two non-fatal DEPRECATED-comment warnings from 20261007000300.
- `npm run verify:migrations`: MIGRATION GATE OK.
- `npx supabase db reset && npx supabase test db`: Files=48, Tests=911, Result: PASS.
- `npm run check:money-mirror`: up to date.
- `npm run check:recurring-mirror`: up to date.
- `npm run typecheck`: clean.
- `npm run depcruise`: no dependency violations (312 modules, 1438 dependencies).
- `npm run lint`: 366 problems (0 errors, 366 warnings).
- `npx jest --coverage --ci --no-watchman`: Test Suites 182 passed; Tests 5534 passed; no threshold failure.

## Schema push

Migrations:
1. 20261010000100_record_polish_columns
2. 20261010000200_record_polish_patches
3. 20261010000300_record_polish_series
4. 20261010000400_record_polish_reads
5. 20261010000500_add_activity_month
6. 20261010000600_sample_data

Steps (Task 3, after approval):
1. `gh pr merge <number> --merge`; `git fetch origin main`; `git rev-parse origin/main`. Observed:
2. `git diff --quiet <deployed commit> -- supabase/`. Observed:
3. `npm run supabase:preflight`. Observed:
4. `npx supabase migration list --linked` (six remote-missing). Observed:
5. `npm run supabase:db:push`; `npx supabase migration list --linked`. Observed:
6a. transactions_active columns is_refund/is_automatic/is_sample (3 rows). Observed:
6b. 10 functions present. Observed:
6c. has_column_privilege is_sample/is_refund/horizon_month UPDATE (false,true,false). Observed:
6d. `select count(*) from public.dismissed_series_offers` (0). Observed:
6e. cron.job names unchanged. Observed:
6f. min_supported_version unchanged. Observed:

## Device walkthrough

(filled by plan 35)
