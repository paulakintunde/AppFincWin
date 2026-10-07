---
phase: 02-record
plan: 07
subsystem: database
tags: [postgres, supabase, rls, pgtap, categories, transactions, migrations]

# Dependency graph
requires:
  - phase: 01-money-core
    provides: households/profiles/accounts/transactions tables, bump_version(), user_household_ids(), the FX stamping trigger, and the additive-migration/squawk compatibility gate
provides:
  - "public.categories: per-user table, seeded 15 rows (13 editable built-ins + 2 system-owned) at signup, backfilled for pre-existing profiles"
  - "public.set_updated_by(): shared restamp-aware updated_by trigger, reused by categories/transactions/accounts"
  - "public.guard_category(), public.guard_transaction_category(): ownership/immutability guards"
  - "transactions: name, category_id, payment_type, status, deleted_at, import_batch_id, recurring_series_id, occurrence_date, updated_by"
  - "transactions import provenance: raw_amount, raw_balance, external_id (non-unique), import_format, transfer_id"
  - "accounts: overdraft_limit, credit_limit, updated_by"
  - "public.transactions_active: security_invoker view hiding soft-deleted rows, the mandatory client read path"
  - "transactions_name_trgm_idx: pg_trgm GIN index for cross-month search (ACT-03)"
affects: [02-08-recurring-series, 02-09-server-rpcs, 02-38-transfer-pairing-and-import-profiles]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Per-user RLS table (categories) copies custom_currencies' owner_id = (select auth.uid()) shape verbatim, not the household user_household_ids() pattern"
    - "set_updated_by() reuses the Phase 1 fincwin.system_restamp GUC convention (mirrors bump_version leaving version alone during a system restamp)"
    - "transactions_active as a security_invoker view is the single soft-delete filter point, rather than repeating deleted_at is null in every new read path"

key-files:
  created:
    - supabase/migrations/20260926000100_categories.sql
    - supabase/migrations/20260926000200_transactions_record_fields.sql
    - supabase/tests/database/25_categories.test.sql
    - supabase/tests/database/26_transactions_record_fields.test.sql
    - supabase/tests/database/31_transactions_import_provenance.test.sql
    - supabase/tests/database/32_accounts_limits.test.sql
  modified: []

key-decisions:
  - "Reworded the D-54 index comment (\"NOT unique on (account_id, external_id)\") to avoid a self-defeating match against the plan's own acceptance-criteria grep for unique+external_id on one line -- same intent, different wording (Rule 1)"

patterns-established:
  - "pgTAP tests referencing another user's owned row (e.g. proving a cross-owner guard) must capture that row's id into a temp table as postgres BEFORE switching role, since RLS blocks the acting user's own subquery from ever seeing it"

requirements-completed: [REC-01, REC-02, REC-03, REC-04, REC-07, ACT-01, ACT-03, REC-14, REC-16, REC-17, REC-18]

# Metrics
duration: ~45min active work (plus ~2h of local Docker/Postgres stack recovery, see Issues Encountered)
completed: 2026-09-27
---

# Phase 02 Plan 07: Record Schema Foundation Summary

**Per-user categories with signup seeding and owner-only RLS, plus additive Record/import-provenance columns on transactions and accounts, proven by 397 pgTAP tests across 28 files.**

## Performance

- **Duration:** ~45 min of actual migration/test authoring and debugging; wall-clock was much longer due to a local Docker Desktop stack recovery (see Issues Encountered)
- **Tasks:** 2 completed
- **Files modified:** 6 (2 migrations, 4 pgTAP test files)

## Accomplishments
- `public.categories`: 15 rows seeded per user (13 editable built-ins + Transfer/Settlement system rows), owner-only RLS, immutable system rows enforced by grant, RLS `with check`, and a defensive `guard_category` trigger
- `handle_new_user()` extended (three original insert statements kept byte-for-byte) to seed categories at signup, plus a one-time idempotent backfill for every pre-existing profile
- `transactions` gained the full Record field set (name/category_id/payment_type/status/deleted_at/import_batch_id/recurring_series_id/occurrence_date/updated_by) and the statement-import provenance extension (raw_amount/raw_balance/external_id/import_format/transfer_id) in one additive migration, since 02-09's RPCs and apply_patches allowlist reference these columns
- `accounts` gained `overdraft_limit`/`credit_limit`/`updated_by`, uncoupled from `kind`
- `public.transactions_active` (security_invoker view) established as the one mandatory soft-delete filter point for every client read path
- `transactions_name_trgm_idx` (pg_trgm GIN) in place before any real data volume accumulates (ACT-03)

## Task Commits

1. **Task 1: categories migration + pgTAP** - `eea40e6` (feat)
2. **Task 2: transaction record fields, import provenance, transfer link, account limits, guard, view, index + pgTAP** - `f142585` (feat)

## Files Created/Modified
- `supabase/migrations/20260926000100_categories.sql` - categories table, RLS, seed_user_categories(), handle_new_user() extension, backfill, set_updated_by()
- `supabase/migrations/20260926000200_transactions_record_fields.sql` - additive transaction/account columns, guard_transaction_category, transactions_active view, trigram index, grants
- `supabase/tests/database/25_categories.test.sql` - 17 assertions: seeding, idempotency, owner isolation, immutability, colour/name bounds
- `supabase/tests/database/26_transactions_record_fields.test.sql` - 17 assertions: default status, category guard, soft-delete view filtering, server-only column grants, account updated_by
- `supabase/tests/database/31_transactions_import_provenance.test.sql` - 14 assertions: provenance insert-only grants, length/format bounds, non-unique external_id, transfer_id grant
- `supabase/tests/database/32_accounts_limits.test.sql` - 10 assertions: limit bounds, negative opening balance accepted, kind change with a limit set accepted

## Decisions Made
- Reworded one code comment to satisfy the plan's own acceptance-criteria grep (see Deviations) — no design change, D-54's "FITIDs are not unique per account" intent is unchanged.
- Otherwise followed the plan's literal column lists, check constraints, RLS shapes and grant lists as specified.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Reworded the external_id index comment to satisfy the plan's own acceptance-criteria grep**
- **Found during:** Task 2, before running `lint:migrations`/verifying acceptance criteria
- **Issue:** The plan's literal action text specifies the comment `-- NOT unique on (account_id, external_id): real banks reuse and regenerate FITIDs (D-54, RESEARCH §A1).` but the plan's own acceptance criterion requires `grep -ciE "unique[^;]*external_id" ...` to return 0. That exact comment line matches the pattern (the words "unique" and "external_id" appear in that order on the same line), so following the literal text would fail the plan's own gate.
- **Fix:** Reworded to `-- FITIDs repeat across statements from the same bank, so this index allows duplicates (D-54, RESEARCH §A1).` — same design intent (non-unique index, banks reuse FITIDs), no code or constraint change, just wording that doesn't self-defeat the grep.
- **Files modified:** `supabase/migrations/20260926000200_transactions_record_fields.sql`
- **Verification:** `grep -ciE "unique[^;]*external_id" supabase/migrations/20260926000200_transactions_record_fields.sql` returns 0; all other Task 2 acceptance-criteria greps also verified passing.
- **Committed in:** f142585 (Task 2 commit)

**2. [Rule 1 - Bug] Fixed a pgTAP test that silently tested nothing due to RLS**
- **Found during:** Task 2, first `supabase test db` run — 26_transactions_record_fields.test.sql failed assertion 6 ("A cannot reference B's category")
- **Issue:** The test, while impersonating user A, selected B's category id via `(select id from public.categories where owner_id = B and builtin_key = 'Housing')` directly against the RLS-protected table. Because A cannot see B's rows under categories' owner-only RLS, that subquery silently returned `NULL`, so the subsequent insert used `category_id = NULL` instead of B's real id — `guard_transaction_category`'s `new.category_id is not null` check short-circuited, and no exception was raised even though the guard itself was correctly written.
- **Fix:** Added a `cat` temp table capturing `(owner_id, builtin_key, id)` from `public.categories` as `postgres` (bypassing RLS) before switching to the `authenticated` role, mirroring the existing `hh` (households) temp-table pattern already used for household ids in this test suite. Both the A-owns and B-owns category lookups in the test now read from `cat` instead of the live RLS-protected table.
- **Files modified:** `supabase/tests/database/26_transactions_record_fields.test.sql`
- **Verification:** Full `supabase test db` run: 28/28 files, 397/397 tests pass, including the corrected assertion 6 now genuinely exercising `guard_transaction_category`'s 23514 path.
- **Committed in:** f142585 (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 acceptance-criteria wording conflict, 1 test bug caught by the plan's own verification step)
**Impact on plan:** Both fixes were necessary to make the plan's stated verification actually prove what it claims. No scope creep, no schema or RLS design change.

## Issues Encountered

- **Local Docker Supabase stack instability.** The shared local stack's `supabase_db` container had been SIGKILLed by an earlier session and required a WSL2 fsync-heavy crash recovery (~5-10 min) before it would report healthy. Two subsequent `supabase db reset --local` attempts failed — one with `LegacyDbSetupError` (db container mid-recovery), one with `LegacyHealthCheckTimeoutError` on `supabase_storage` (a sibling service, unrelated to this plan's schema, still catching up under I/O contention). A third attempt, run after confirming `supabase_db` was healthy via `docker inspect`, succeeded cleanly and applied both new migrations without incident. No production Supabase commands were run at any point (`supabase db push` / `npm run supabase:db:push` were never invoked, per the safety constraints).
- Both issues above are resolved and documented as Deviations, not open follow-ups.

## User Setup Required

None - no external service configuration required. Production push is explicitly out of scope for this plan (plan 02-31's job).

## Next Phase Readiness

- `categories`, the extended `transactions`/`accounts` columns, `transactions_active`, and `guard_transaction_category` are all in place and pgTAP-proven locally — plans 02-08 (recurring series) and 02-09 (server RPCs, apply_patches allowlist) can now reference `category_id`, `recurring_series_id`, `import_batch_id`, `raw_amount`/`raw_balance`/`external_id`/`import_format`, and `transfer_id` as real columns.
- The transfer-pair trigger and `import_profiles` table remain deliberately out of scope here — they land with plan 02-38, as the plan specifies.
- Nothing has been pushed to production; the two migrations exist only in this worktree branch pending merge and plan 02-31's rollout.

---
*Phase: 02-record*
*Completed: 2026-09-27*

## Self-Check: PASSED

All 7 created files verified present on disk; both task commits (`eea40e6`, `f142585`) verified present in `git log`.
