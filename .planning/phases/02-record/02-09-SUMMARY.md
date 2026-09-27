---
phase: 02-record
plan: 09
subsystem: database
tags: [postgres, supabase, rls, pgtap, undo, optimistic-concurrency, transfers]

# Dependency graph
requires:
  - phase: 02-record
    provides: "02-05: engine/undo/ (PatchOp, buildStep, inverse builders) -- this plan implements the server side of the same op/undo-step contract"
  - phase: 02-record
    provides: "02-07: categories, transactions Record + import-provenance fields, accounts limits, transactions_active view, updated_by stamping"
  - phase: 02-record
    provides: "02-38: transfer_pair_check deferred constraint trigger on transactions.transfer_id, which apply_patches' transfer_id/category_id allowlist entries cooperate with"
provides:
  - "public.undo_log: per-user table (owner-only RLS), server-derived touched_ids, 12-deep trim, cascade-deleted with the user (D-23, D-25)"
  - "public.apply_patches(ops, undo_step): the one generic, atomic, version-checked, entity/column-allowlisted patch primitive every bulk write and every undo replay goes through (D-26)"
  - "public.apply_undo_step(step_id) / public.rollback_undo_to(step_id): replay-one-step and rollback-to-X, with named refusal attribution (D-27, D-28)"
  - "public.purge_record_tombstones(): daily hard-delete of soft-deleted rows no available/refused undo step still references (D-30)"
  - "public.account_balances(household_id) / public.transaction_months(household_id): security-invoker read RPCs over transactions_active (REC-08, ACT-02)"
affects: [02-12-db-patches-undoLog, 02-13-undo-mutations, 02-15-activity-bulk-actions, 02-26-import-pipeline]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "apply_patches resolves an entire row to jsonb via `to_jsonb(t) ... for update` before any scope/version check, so one generic code path handles all four allowlisted entities (transactions/categories/recurring_series/accounts) without per-entity branching on column names"
    - "Phase A (validate + lock + check every op) fully precedes Phase B (write); a version conflict or scope violation returns/raises before any row in the batch is written, giving true all-or-nothing bulk semantics without an explicit savepoint"
    - "A deferred constraint trigger's pending check is not consumed by a caught exception inside a pgTAP throws_ok/lives_ok block (the internal savepoint rollback un-fires it too) -- a test that deliberately leaves a transfer pair broken must repair it before any later `set constraints ... immediate` in the same file, or every later flush re-fails on the stale pending check"

key-files:
  created:
    - supabase/migrations/20260926000500_undo_log.sql
    - supabase/migrations/20260926000600_record_read_rpcs.sql
    - supabase/tests/database/29_undo_log.test.sql
    - supabase/tests/database/30_record_read_rpcs.test.sql
  modified: []

key-decisions:
  - "apply_patches locates a row via `select to_jsonb(t) ... for update` rather than per-entity typed variables -- record_name (t.name), updated_by, version, household_id/owner_id and builtin_key (categories only) are all read generically off the same jsonb, since every allowlisted entity happens to carry a `name` and `updated_by` column (Rule 1 simplification, not a deviation from the plan's literal shape)"
  - "The pgTAP file for transfer scenarios (15-17) deliberately never sets the trigger to immediate mode globally, unlike 33_transfer_pairs.test.sql -- apply_patches applies a pair's two legs as two separate dynamic UPDATE statements, which only stays correct under the trigger's real production default (deferrable initially deferred); a file-wide immediate mode would make a genuine two-op transfer link fail mid-call the way it never does in production"

requirements-completed: [REC-11, REC-12, REC-04, ACT-05, REC-08, ACT-02, REC-16, REC-17, REC-18]

# Metrics
duration: ~65min
completed: 2026-09-27
---

# Phase 02 Plan 09: Server-Side Undo and Record Read RPCs Summary

**A generic, version-checked, all-or-nothing `apply_patches` primitive backing every bulk write and undo replay, a 12-deep server-side undo_log with named refusal attribution, and RLS-respecting account-balance/month-list read RPCs, proven by 72 new pgTAP assertions.**

## Performance

- **Duration:** ~65 min (base checkout 15:28:38 to final commit 16:32:42)
- **Tasks:** 2 completed
- **Files modified:** 4 (2 migrations, 2 pgTAP test files)

## Accomplishments
- `public.undo_log`: owner-only RLS, server-derived `touched_ids` (never client-supplied), a 12-deep trim that also ages out now-pointless `undone` history once the available/refused floor moves, cascade-deleted with the user
- `public.apply_patches(ops, undo_step)`: validates a fixed four-entity/per-entity-column allowlist via `%I`/`%L` only (never client text), locks and checks every op's household/owner scope and expected version *before* writing a single row, and optionally records its own undo step in the same call -- the one primitive every bulk action, import and undo replay goes through
- `public.apply_undo_step` / `public.rollback_undo_to`: replay-one-step and rollback-to-X, refusing (never clobbering) on any version mismatch and naming who changed what
- `public.purge_record_tombstones()`: daily hard-delete of soft-deleted transactions/recurring_series no available or refused undo step still references, respecting the FK from transactions to recurring_series
- `public.account_balances` / `public.transaction_months`: security-invoker reads proving a transfer's two legs both count in their own account's paid/pending sums (D-50), and that another household's id returns zero rows
- Proved apply_patches cooperates correctly with plan 02-38's deferred transfer-pair constraint trigger: linking two unlinked legs, unlinking one leg alone (rejected only once actually checked), and soft-deleting/undoing both legs of a pair together

## Task Commits

1. **Task 1: undo_log, apply_patches, apply_undo_step, rollback, trim, purge** - `dc3c444` (feat)
2. **Task 2: read RPCs + pgTAP for undo and reads** - `6e6a460` (test)

## Files Created/Modified
- `supabase/migrations/20260926000500_undo_log.sql` - undo_log table + RLS/grants, undo_log_fill/undo_log_trim triggers, apply_patches, apply_undo_step, rollback_undo_to, purge_record_tombstones, daily cron job
- `supabase/migrations/20260926000600_record_read_rpcs.sql` - account_balances, transaction_months (security invoker), grants
- `supabase/tests/database/29_undo_log.test.sql` - 64 assertions: atomicity, allowlist/scope/version validation, refusal attribution across two household members, 12-deep trim, rollback-to-X with a blocked scenario, category archive vs system-category refusal, tombstone purge, undo_log write-protection, transfer-pair linking/unlinking/soft-delete-undo, mark-paid-from-import, credit_limit vs provenance-column rejection
- `supabase/tests/database/30_record_read_rpcs.test.sql` - 8 assertions: paid/pending separation, transfer-leg inclusion in both accounts, soft-delete exclusion, cross-household zero-rows, month ordering newest-first

## Decisions Made
- Used a single generic `to_jsonb(t)` row lookup inside apply_patches rather than per-entity typed selects, since every allowlisted entity (transactions, categories, recurring_series, accounts) happens to carry `version`, `updated_by` and `name` columns -- this is a code-shape simplification within the plan's literal design, not a schema or contract change.
- See patterns-established above for the deferred-constraint-trigger pgTAP lesson (own test-authoring correction, not a migration bug).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug, self-caught] pgTAP test left a transfer pair genuinely broken across scenarios, causing later flushes to re-fail**
- **Found during:** Task 2, first `supabase test db` run -- tests 50 and 55 in `29_undo_log.test.sql` failed with `23514: transfer pair is incomplete or invalid` on statements that should have passed (soft-deleting/restoring an unrelated, fully-linked pair)
- **Issue:** Scenario 16 deliberately unlinks one leg of a transfer pair to prove `apply_patches` still applies (the deferred check hasn't run yet) and that `set constraints ... immediate` then throws 23514. `pgTAP`'s `throws_ok` catches that exception inside an internal savepoint, which un-fires the deferred trigger's pending check rather than consuming it -- so the still-broken pair stayed queued and re-failed on every later `set constraints ... immediate` call in the same transaction, including the unrelated scenario 17.
- **Fix:** After the deliberate failure, re-link the leg (`update ... set transfer_id = ...`) to restore the pair to a valid state before any later flush in the file. Documented as a reusable pattern in this SUMMARY (patterns-established) since it will recur in any future pgTAP file exercising the deferred pair trigger more than once.
- **Files modified:** `supabase/tests/database/29_undo_log.test.sql`
- **Verification:** Full `supabase test db` run: 34/34 files, 593/593 tests pass, including the two previously-failing assertions.
- **Committed in:** `6e6a460` (Task 2 commit)

**2. [Rule 1 - Bug, self-caught] Draft test tried to insert a soft-deleted row's `deleted_at` directly at insert time**
- **Found during:** Task 2, first `supabase test db` run -- `30_record_read_rpcs.test.sql` died with `permission denied for table transactions` (hint: grant insert)
- **Issue:** `deleted_at` is update-only in the client grant (D-30 -- a client never inserts a row pre-deleted), so naming it in an authenticated `insert` column list fails 42501 regardless of value.
- **Fix:** Insert the row without `deleted_at`, then a separate `update ... set deleted_at = now()` (which the update grant does cover).
- **Files modified:** `supabase/tests/database/30_record_read_rpcs.test.sql`
- **Verification:** Full `supabase test db` run passes.
- **Committed in:** `6e6a460` (Task 2 commit)

---

**Total deviations:** 2 auto-fixed, both self-caught test-authoring bugs found by the plan's own verification step. No production migration code was changed by either fix.
**Impact on plan:** No scope creep, no schema/RLS/RPC design change. Both fixes were necessary to make the plan's stated verification actually pass.

## Issues Encountered

- **Shared local Supabase Docker stack contention.** `npx supabase db reset --local` failed twice with `LegacyHealthCheckTimeoutError` (storage container unhealthy) and `LegacyContainerRemoveError` (concurrent worktree agent's own reset racing this one) before a third attempt succeeded cleanly. No production Supabase commands were run, and no Docker volumes/containers were pruned or removed, per the safety constraints.

## User Setup Required

None - no external service configuration required. Production push is explicitly out of scope for this plan (plan 02-31's job).

## Next Phase Readiness

- `apply_patches`, `apply_undo_step`, `rollback_undo_to`, `account_balances` and `transaction_months` are all in place and pgTAP-proven locally. Plan 02-12 (`db/patches.ts`, `db/undoLog.ts`) can now call these RPCs directly and parse the documented jsonb response shapes (interfaces block) into the engine's `PatchOp`/`UndoStepDraft` types from plan 02-05.
- Plan 02-15 (Activity bulk actions) and 02-26 (import pipeline) can build every bulk write and every undo step on `apply_patches`' allowlists, which already include the transfer link and account limit columns plans 02-38/02-07 added.
- Nothing has been pushed to production; both new migrations exist only on this worktree branch pending merge and plan 02-31's rollout.
- No stubs, no threat-surface additions beyond what this plan's own `<threat_model>` already enumerates (T-02-09-01 through T-02-09-10), all mitigated as specified and pgTAP-proven.

---
*Phase: 02-record*
*Completed: 2026-09-27*

## Self-Check: PASSED

All 5 files verified present on disk (2 migrations, 2 pgTAP test files, this SUMMARY.md); both task commits (`dc3c444`, `6e6a460`) verified present in `git log`.
