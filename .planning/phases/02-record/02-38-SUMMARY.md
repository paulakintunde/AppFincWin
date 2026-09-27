---
phase: 02-record
plan: 38
subsystem: database
tags: [postgres, supabase, rls, pgtap, transfers, constraint-trigger, import]

# Dependency graph
requires:
  - phase: 02-record
    provides: "02-07: transactions.transfer_id (nullable, partial index), deleted_at, household_id, account_id, original_amount, transactions_active view, bump_version(), user_household_ids()"
provides:
  - "public.check_transfer_pair() and the deferred constraint trigger transfer_pair_check on public.transactions -- enforces a transfer is exactly two active rows sharing a transfer_id, on different accounts, opposite signs, one household"
  - "public.import_profiles: per-user remembered statement-format profile table, owner-only RLS, unique (owner_id, account_id, layout_signature), 2 KB jsonb object cap, account-in-caller's-household insert check"
affects: [02-09-server-rpcs, 02-15-undo, 02-26-import-pipeline, 02-31-rollout]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Deferred constraint trigger (deferrable initially deferred) for a multi-row invariant checked at statement/commit end, not mid-statement -- lets a single multi-row INSERT or a two-statement deferred UPDATE both see the complete group before the check runs"
    - "import_profiles follows the custom_currencies per-user RLS shape (owner_id = (select auth.uid())), not the household user_household_ids() shape, plus an extra insert-time check that the referenced account belongs to one of the caller's households"

key-files:
  created:
    - supabase/migrations/20260926000700_transfer_pairs.sql
    - supabase/migrations/20260926000800_import_profiles.sql
    - supabase/tests/database/33_transfer_pairs.test.sql
    - supabase/tests/database/34_import_profiles.test.sql
  modified: []

key-decisions:
  - "Added updated_at to import_profiles (not in the plan's literal action SQL) because bump_version()'s existing shared trigger unconditionally sets NEW.updated_at -- omitting the column made every UPDATE fail with 42703 (Rule 1 bug fix)"
  - "Reformatted check_transfer_pair()'s function signature onto one line (security definer set search_path = '' as $$) to satisfy the plan's own literal acceptance-criteria grep, which expects that exact combined string on one line -- same design intent as the codebase's usual multi-line guard_* style, wording/formatting only (Rule 1)"

patterns-established:
  - "pgTAP UUID literals must be valid hex per group (no letters outside a-f) -- an id like 'p0000001-...' fails 22P02 at the database, not at test-authoring time"

requirements-completed: [REC-13, REC-18]

# Metrics
duration: ~50min active work (plus significant wall-clock time lost to a shared local Supabase Docker stack racing with a concurrent plan's own db reset/test runs)
completed: 2026-09-27
---

# Phase 02 Plan 38: Transfer Pairing and Import Profiles Summary

**Deferred constraint trigger enforcing exactly-one-linked-pair for transfers, plus a per-user import_profiles table for remembered statement-format readings, both proven by pgTAP.**

## Performance

- **Duration:** ~50 min of active authoring/debugging; wall-clock was much longer due to the shared local Supabase stack being reset/torn down repeatedly by a concurrently-running plan (02-08) in another worktree
- **Tasks:** 2 completed
- **Files modified:** 4 (2 migrations, 2 pgTAP test files)

## Accomplishments
- `check_transfer_pair()` + `transfer_pair_check`: a `deferrable initially deferred` constraint trigger on `transactions` that only ever rejects writes an old app version never makes (old apps never set `transfer_id`) -- proven against creation, a lone leg, a third leg, the two-statement deferred linking path, same-account, same-sign, cross-household, soft-delete-both vs soft-delete-one, and clearing `transfer_id`
- `public.import_profiles`: per-user (not household-scoped) remembered format profile, unique on `(owner_id, account_id, layout_signature)`, capped at 2 KB and object-only, with an insert-time check that the account belongs to one of the caller's households
- Both migrations are additive (new function/trigger, new table); `lint:migrations` and `verify:migrations` both pass with no `contract-ok` marker needed
- 427 pgTAP assertions pass across all 30 test files (16 new for transfer pairs, 14 new for import_profiles)

## Task Commits

1. **Task 1: Transfer pair constraint trigger + pgTAP** - `a388afc` (feat)
2. **Task 2: import_profiles table + pgTAP** - `c079b2a` (feat)

## Files Created/Modified
- `supabase/migrations/20260926000700_transfer_pairs.sql` - `check_transfer_pair()` (security definer, `search_path = ''`) and the deferred constraint trigger
- `supabase/migrations/20260926000800_import_profiles.sql` - `import_profiles` table, indexes, `set_version` trigger, RLS, grants
- `supabase/tests/database/33_transfer_pairs.test.sql` - 16 pgTAP assertions
- `supabase/tests/database/34_import_profiles.test.sql` - 14 pgTAP assertions

## Decisions Made
- Added `updated_at` to `import_profiles` (see Deviations) -- a straightforward bug fix, not a design change.
- Reformatted one function signature to satisfy the plan's own literal acceptance-criteria grep (see Deviations) -- wording only, no behavior change.
- Otherwise followed the plan's literal column lists, trigger shape, RLS policies and grant lists as specified.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `import_profiles` was missing `updated_at`, which the shared `bump_version()` trigger requires**
- **Found during:** Task 2, first `supabase test db` run -- test 10 ("A can update the profile column of A's own row") died with `42703: record "new" has no field "updated_at"`
- **Issue:** The plan's literal action SQL for `import_profiles` (and RESEARCH.md §A6's sketch) both omit an `updated_at` column. `public.bump_version()` (defined in Phase 1, reused by every versioned table in this codebase) unconditionally executes `new.updated_at := now();` on every UPDATE, whether or not a system restamp is in progress. Any table with a `set_version` trigger but no `updated_at` column fails every single UPDATE.
- **Fix:** Added `updated_at timestamptz not null default now()` to the table definition, matching every other versioned table in the codebase (`accounts`, `transactions`, `custom_currencies`, `categories`).
- **Files modified:** `supabase/migrations/20260926000800_import_profiles.sql`
- **Verification:** `supabase test db` -- all 14 assertions in `34_import_profiles.test.sql` pass, including the version-bump-on-update test that originally caught this.
- **Committed in:** `c079b2a` (Task 2 commit)

**2. [Rule 1 - Bug] Reformatted `check_transfer_pair()`'s signature to satisfy the plan's own acceptance-criteria grep**
- **Found during:** Task 1, before finalizing -- the plan's acceptance criterion `grep -c "security definer set search_path = ''" supabase/migrations/20260926000700_transfer_pairs.sql` requires that exact string together on one line. The house style used elsewhere in this codebase (`guard_transaction_category`, `guard_account_currency`, etc.) splits `security definer` and `set search_path = ''` onto separate lines, which I initially followed and which made the plan's own grep return 0.
- **Fix:** Combined the function's `returns trigger language plpgsql security definer set search_path = '' as $$` onto one line, matching the plan's own literal action code block exactly. Same design intent (security definer, empty search_path), formatting only.
- **Files modified:** `supabase/migrations/20260926000700_transfer_pairs.sql`
- **Verification:** `grep -c "security definer set search_path = ''" supabase/migrations/20260926000700_transfer_pairs.sql` returns 1; full pgTAP suite re-run green afterward.
- **Committed in:** `a388afc` (Task 1 commit)

**3. [Rule 1 - Bug, self-caught] `34_import_profiles.test.sql`'s own row ids used an invalid hex prefix**
- **Found during:** Task 2, first `supabase test db` run -- `22P02: invalid input syntax for type uuid: "p0000001-..."`
- **Issue:** My own draft test file used ids like `p0000001-1111-1111-1111-111111111111`. `p` is not a valid hex digit, so every literal failed to parse as a uuid before any RLS or constraint logic ran.
- **Fix:** Replaced the `p...` prefix with `f...` (valid hex) throughout the test file.
- **Files modified:** `supabase/tests/database/34_import_profiles.test.sql`
- **Verification:** Full pgTAP suite green afterward.
- **Committed in:** `c079b2a` (Task 2 commit)

---

**Total deviations:** 3 auto-fixed (2 Rule 1 bugs found via the plan's own verification step, 1 self-caught test-authoring bug)
**Impact on plan:** All three fixes were necessary to make the plan's stated verification actually pass. No scope creep, no schema or RLS design change beyond the one missing `updated_at` column bump_version() requires.

## Issues Encountered

- **Shared local Supabase Docker stack contention with a concurrently-running plan (02-08).** Both this plan and 02-08 run in separate git worktrees against the same local Supabase project (`cohmcbdfgqmiwykztrdg`) and the same Docker containers, and each plan's `supabase db reset --local` recreates the schema from *its own worktree's* migration files. Repeated `db reset --local` / `supabase start` / `supabase test db` invocations failed with `LegacyDbSetupError`, `LegacyDbConnectError`, `LegacyResetLocalDbNotRunningError`, and once a genuine corrupted-volume error (`duplicate key value violates unique constraint "pg_type_typname_nsp_index"` on `schema_migrations`) as the two sessions' resets raced. Several rounds of `db reset --local && test db` (run back-to-back to narrow the race window) eventually landed inside a window where the schema on disk matched this worktree's migrations, and the full 30-file, 427-assertion pgTAP suite passed cleanly. No production Supabase commands were run at any point, and no Docker volumes/containers were deliberately pruned or removed by this session (one `supabase start --debug` invocation triggered the CLI's own internal prune-on-failure step, after which the coordinator explicitly redirected to `db reset --local` only, which was followed for the remainder of the session).
- Both issues above are resolved and documented as Deviations/Issues, not open follow-ups. The final `lint:migrations` and `verify:migrations` runs, and the final `supabase test db` run, all pass green with the committed migrations and test files.

## User Setup Required

None - no external service configuration required. Production push is explicitly out of scope for this plan (plan 02-31's job).

## Next Phase Readiness

- `transfer_pair_check` and `import_profiles` are in place and pgTAP-proven locally. Plan 02-09 (server RPCs) can now rely on the deferred pair constraint firing correctly inside `apply_patches`' all-or-nothing multi-row updates, and on `import_profiles` for remembered format lookups.
- Plan 02-15 (undo) can rely on the pair constraint refusing an undo that would leave a linked leg's partner soft-deleted (RESEARCH §A5.3's documented pitfall) -- this is enforced at the database, not just documented.
- Nothing has been pushed to production; both migrations exist only in this worktree branch pending merge and plan 02-31's rollout.
- No stubs, no threat-surface additions beyond what the plan's own `<threat_model>` already enumerates (T-02-38-01 through T-02-38-06), all mitigated as specified and pgTAP-proven.

---
*Phase: 02-record*
*Completed: 2026-09-27*

## Self-Check: PASSED

All 5 files verified present on disk (2 migrations, 2 pgTAP test files, this SUMMARY.md); both task commits (`a388afc`, `c079b2a`) verified present in `git log`.
