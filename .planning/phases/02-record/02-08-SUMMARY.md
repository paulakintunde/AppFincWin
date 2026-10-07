---
phase: 02-record
plan: 08
subsystem: database
tags: [postgres, supabase, rls, pgtap, pg_cron, recurring, migrations]

# Dependency graph
requires:
  - phase: 02-record
    provides: "02-01: engine/recurring/schedule.ts (occurrenceDate/materialisationHorizon), the shared recurring-schedule-cases.json fixture"
  - phase: 02-record
    provides: "02-07: categories, transactions Record fields (name/category_id/payment_type/status/deleted_at/import_batch_id/recurring_series_id/occurrence_date/updated_by), transactions_active view, set_updated_by()/bump_version() restamp-aware triggers"
provides:
  - "public.recurring_series: household-scoped table (template + schedule), select-only RLS, guard_recurring_series trigger"
  - "public.recurring_occurrence_date()/recurring_horizon(): plpgsql mirror of src/engine/recurring/schedule.ts, proven against supabase/tests/fixtures/recurring-schedule-cases.json"
  - "public.materialise_series()/materialise_recurring(): service_role-only materialiser, high-water-mark bookkeeping via fincwin.system_restamp"
  - "public.create_recurring_series()/edit_recurring_series_from()/end_recurring_series(): the three client-facing series RPCs, replay-safe, membership-checked, one version bump per genuine edit"
  - "transactions_recurring_series_fk, transactions_series_occurrence_uidx, transactions_series_pair, transactions_skipped_needs_series constraints"
  - "recurring-materialise-daily pg_cron job (00:20 UTC)"
  - "scripts/gen-recurring-mirror-test.mjs + npm run check:recurring-mirror + CI step"
affects: [02-09-server-rpcs, 02-12-db-recurringSeries, 02-13-server-undo]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "SQL mirror generator script (scripts/gen-recurring-mirror-test.mjs), modelled byte-for-byte on scripts/gen-money-mirror-test.mjs, generating supabase/tests/database/27_recurring_schedule_mirror.test.sql from a JSON fixture with a --check mode wired into CI"
    - "Materialiser high-water mark (recurring_series.materialised_through) rather than 'does a row already exist for this date' as the do-not-recreate mechanism -- a soft-deleted or skipped occurrence's date is never revisited because the floor has already moved past it, independent of the row's own status"
    - "RPC response contract as jsonb: {status, series:{id,version,before}, inserted, soft_deleted, linked} -- consumed by plan 02-12's db/recurringSeries.ts to build an engine SeriesChangeSet"

key-files:
  created:
    - supabase/migrations/20260926000300_recurring_series.sql
    - supabase/migrations/20260926000400_recurring_materialisation.sql
    - scripts/gen-recurring-mirror-test.mjs
    - supabase/tests/database/27_recurring_schedule_mirror.test.sql
    - supabase/tests/database/28_recurring_series.test.sql
  modified:
    - package.json
    - .github/workflows/ci.yml

key-decisions:
  - "create_recurring_series() also stamps updated_by = auth.uid() at insert time (alongside created_by), not left null until a genuine edit -- otherwise edit_recurring_series_from's conflict response could never name a real last-editor for a series nobody has edited since creation (Rule 2)"
  - "Test fixture gap: is_known_currency() only treats EUR as unconditionally known; USD needs an fx_rates row quoting it, exactly as 05_accounts_transactions.test.sql/26_transactions_record_fields.test.sql already seed (Rule 1)"

patterns-established:
  - "Series ids and other client-generated test UUIDs must use only hex characters (0-9a-f) in every position -- 's' and 'g' prefixes are invalid uuid literals and fail at cast time inside a plpgsql function, not at the pgTAP call site"
  - "pgTAP's extensions.is(bigint_column, plain_integer_literal, description) has no matching overload; cast the literal side explicitly (e.g. (-1000)::bigint) rather than the column"

requirements-completed: [REC-05, REC-06]

# Metrics
duration: ~45min active work (plus several hours of local Docker/Postgres stack recovery under heavy concurrent load, see Issues Encountered)
completed: 2026-09-27
---

# Phase 02 Plan 08: Recurring Series Summary

**Recurring series as a first-class household-scoped entity with a plpgsql mirror of the TS schedule maths, a high-water-mark materialiser immune to double-writes, and three client-facing RPCs (create/edit-from-date/end) proven by 28 pgTAP assertions plus a 54-case shared-fixture mirror test.**

## Performance

- **Duration:** ~45 min of actual migration/script/test authoring and debugging
- **Started:** 2026-09-27 (session start)
- **Completed:** 2026-09-27T22:01:40Z
- **Tasks:** 3 completed
- **Files modified:** 7 (2 new migrations, 1 new generator script, 2 new pgTAP files, package.json, ci.yml)

## Accomplishments
- `public.recurring_series`: household-scoped table with the full D-02 template+schedule shape, select-only RLS (no insert/update/delete policy — every write goes through the three definer RPCs), and a `guard_recurring_series` trigger validating currency/time zone/category ownership and pinning `household_id`/`created_by` on update
- `public.recurring_occurrence_date()`/`recurring_horizon()`: the plpgsql mirror of `src/engine/recurring/schedule.ts`'s `occurrenceDate()`/`materialisationHorizon()`, verified live against Postgres 17's actual `date + make_interval()` month-end-clamping behaviour (confirmed via direct psql query before writing the migration, not assumed) and proven against all 54 cases (46 occurrence + 8 horizon) in the shared fixture via a new generator script mirroring `gen-money-mirror-test.mjs`
- `public.materialise_series()`/`materialise_recurring()`: the daily/on-demand generator, service_role-only, using a `materialised_through` high-water mark (not "does a row exist") so a skipped or soft-deleted occurrence is never recreated regardless of its row's own status, with the `on conflict` unique index as a second line of defence against the double-write race (Pitfall 3)
- `public.create_recurring_series()`/`edit_recurring_series_from()`/`end_recurring_series()`: replay-safe by client-generated id, membership-checked before any write (re-implementing what RLS would have enforced, since these run as security definer), "this and future" filtering strictly on `status = 'pending' AND occurrence_date >= effective_date` so a paid row is provably never rewritten, and a `materialised_through` rewind combined with the template patch in one UPDATE statement so a genuine edit bumps the series version exactly once
- Transaction linkage: FK, the partial unique index the materialiser's `on conflict` target relies on, and the two shape checks (series pair, skip-needs-series)
- `recurring-materialise-daily` cron job (00:20 UTC, 30 minutes clear of the FX jobs)
- 28-assertion behavioural pgTAP suite (`28_recurring_series.test.sql`) plus the 54-case SQL/TS mirror test (`27_recurring_schedule_mirror.test.sql`), both green; full suite (30 files, 491 tests) green

## Task Commits

1. **Task 1: recurring_series table, transaction linkage constraints, SQL schedule mirror + generator** - `52fbe23` (feat)
2. **Task 2: materialiser, series RPCs, cron job** - `d712d24` (feat)
3. **Task 3: behavioural pgTAP for recurring series** - `ac94526` (test)

## Files Created/Modified
- `supabase/migrations/20260926000300_recurring_series.sql` - the table, its RLS/guard, the transaction FK/unique-index/checks, and the pure SQL schedule mirror functions
- `supabase/migrations/20260926000400_recurring_materialisation.sql` - the materialiser, the three series RPCs, grants, and the daily cron schedule
- `scripts/gen-recurring-mirror-test.mjs` - fixture → pgTAP generator with `--check` mode, modelled on `gen-money-mirror-test.mjs`
- `supabase/tests/database/27_recurring_schedule_mirror.test.sql` - generated, 54 assertions (46 occurrence cases + 8 horizon cases)
- `supabase/tests/database/28_recurring_series.test.sql` - 28 hand-written assertions covering create/replay/idempotency/RLS/skip/soft-delete/edit-conflict/this-and-future/end/anchor-linking/service-role-only/cron
- `package.json` - added `check:recurring-mirror` script
- `.github/workflows/ci.yml` - added the recurring-mirror CI step next to `check:money-mirror`

## Decisions Made
- `create_recurring_series()` stamps `updated_by` at insert time (same value as `created_by`), not left null — otherwise a conflict returned by `edit_recurring_series_from()`/`end_recurring_series()` on a series nobody has edited since creation could never name a real last-editor, which is exactly the case the plan's own Task 3 test 8 exercises ("the conflict names A as the last editor"). This is additive to the plan's literal insert-column list, not a redesign (Rule 2).
- Verified live (not assumed) that Postgres 17's `date + make_interval(months => n)` clamps to the target month's actual last day rather than overflowing into the next month — the opposite of the well-known `timestamp + interval '1 month'` overflow gotcha some other systems have. Ran a direct `psql` query against the shared local stack against several of the fixture's own month-end cases (31st→Feb 28/29, leap-year Feb 29 + 1 year, quarterly month-end) before committing to the plan's literal `(p_anchor + make_interval(...))::date` formula, since this is the single most important correctness property of the whole SQL mirror.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] `create_recurring_series()` also stamps `updated_by` at insert**
- **Found during:** Task 3, while designing the pgTAP conflict-naming assertion (test 8)
- **Issue:** The plan's literal action text for `create_recurring_series()` lists `created_by = auth.uid()` in the insert but does not mention `updated_by`. Left at its column default (null), a series that has only ever been created — never genuinely edited — would report `conflict.updated_by: null` forever, which the RPC's own interface contract types as valid (`"updated_by": "uuid|null"`) but defeats the plan's own acceptance scenario ("the conflict names A as the last editor") for the common case of a first-ever conflicting edit.
- **Fix:** Added `updated_by` to the insert's column and value lists in `create_recurring_series()`, set to `(select auth.uid())` alongside `created_by`.
- **Files modified:** `supabase/migrations/20260926000400_recurring_materialisation.sql`
- **Verification:** pgTAP test 8 (`the conflict names A as the last editor`) passes.
- **Committed in:** `d712d24` (Task 2 commit)

**2. [Rule 1 - Bug] Fixed three bugs in the hand-written pgTAP test, found by actually running it**
- **Found during:** Task 3, first three `supabase test db` runs
- **Issue:** (a) The test created a USD account/series without seeding an `fx_rates` row quoting USD first — `is_known_currency()` only treats EUR as unconditionally known, everything else needs a quoting rate row, exactly as `05_accounts_transactions.test.sql`/`26_transactions_record_fields.test.sql` already do; the first run failed with `unknown currency USD`. (b) Series ids used `'s...'` as their leading hex nibble (`s1111111-...`) — `s` is not a valid hexadecimal digit, so casting the jsonb payload's `id` field to `uuid` inside `create_recurring_series()` failed with `invalid input syntax for type uuid`. (c) `extensions.is(original_amount, -1000, description)` had no matching overload since `original_amount` is `bigint` and a bare `-1000` literal defaults to `integer`.
- **Fix:** (a) Added the same `insert into public.fx_rates (...) values ('EUR','USD',...)` fixture line other tests use. (b) Replaced every series id's leading character from `s` to `c` (`c1111111...`, `c2222222...`, etc.). (c) Cast the literal side explicitly (`(-1000)::bigint`, `(-1500)::bigint`) rather than the column.
- **Files modified:** `supabase/tests/database/28_recurring_series.test.sql`
- **Verification:** Full `supabase test db` run: 30/30 files, 491/491 tests pass, including all 28 assertions in `28_recurring_series.test.sql`.
- **Committed in:** `ac94526` (Task 3 commit)

---

**Total deviations:** 2 auto-fixed (1 missing-critical insert column, 1 batch of test-authoring bugs caught by the plan's own verification step)
**Impact on plan:** Both fixes were necessary to make the plan's stated verification actually prove what it claims. No schema or RPC design change; the second deviation is entirely test-file, no production code touched.

## Issues Encountered

- **Severe local Docker/Supabase stack contention.** This plan's local Postgres verification (`npx supabase start` / `db reset --local` / `test db`) shares one Docker stack with other concurrently-running worktree agents (per the orchestrator's explicit safety note, plan 02-38 in particular). Across roughly a dozen attempts, the stack repeatedly failed with `LegacyDbSetupError` (container killed with SIGTERM mid-bootstrap or mid-schema-init), `LegacyContainerRemoveError` ("tried to kill container, but did not receive an exit event"), `LegacyResetLocalDbNotRunningError`, and one `pg_ctl: server did not start in time` under sustained I/O contention before the postgres container's own bootstrap self-recovered on a later health-check pass. Per the safety constraints, no destructive `docker rm`/`docker system prune`/container-killing command was ever run — every recovery was a plain retry of `supabase start` or `db reset --local`, waiting for the shared containers to stabilise. This consumed the overwhelming majority of wall-clock time on this plan; the actual migration/script/test authoring was well under an hour.
- Once the stack held still for one full cycle, both migrations applied cleanly on the first pass with zero SQL errors, and only the pgTAP test file itself needed the three fixes documented above — no bug was found in `20260926000300_recurring_series.sql` or `20260926000400_recurring_materialisation.sql` at any point.
- No production Supabase commands were run at any point (`supabase db push`/`npm run supabase:db:push` were never invoked, per the safety constraints).

## User Setup Required

None — no external service configuration required. Production push is explicitly out of scope for this plan (plan 02-31's job).

## Next Phase Readiness

- `recurring_series`, `recurring_occurrence_date()`/`recurring_horizon()`, `materialise_series()`/`materialise_recurring()`, and the three series RPCs are all in place and pgTAP-proven locally — plan 02-12 (`db/recurringSeries.ts`) can now call `create_recurring_series`/`edit_recurring_series_from`/`end_recurring_series` and parse their documented jsonb response shape into an engine `SeriesChangeSet`, and plan 02-09's server undo/RPC work can rely on `recurring_series.version` following the same optimistic-concurrency shape as every other versioned table.
- Nothing has been pushed to production; both new migrations exist only on this worktree branch pending merge and plan 02-31's rollout.
- The materialiser's `materialised_through` high-water-mark mechanism (rather than "does a row exist for this date") is the load-bearing invariant behind D-08's "never recreated" guarantee — any future plan that touches `materialise_series()` must preserve it.

---
*Phase: 02-record*
*Completed: 2026-09-27*

## Self-Check: PASSED

All 5 created files verified present on disk; all 3 task commits (`52fbe23`, `d712d24`, `ac94526`) verified present in `git log`; full local pgTAP suite (30 files, 491 tests) and all four required verification commands (`check:recurring-mirror`, `lint:migrations`, `verify:migrations`, `check:money-mirror`) pass.
