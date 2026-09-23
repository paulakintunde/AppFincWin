---
phase: 00-foundation
plan: 06
subsystem: database
tags: [supabase, postgres, rls, pgtap, migrations, security-definer]

# Dependency graph
requires:
  - phase: 00-foundation (plan 03)
    provides: linked production Supabase project (Fincwin United, ref cohmcbdfgqmiwykztrdg), local Docker stack, pinned Supabase CLI
provides:
  - households, household_members, profiles tables with household-of-one auto-provisioning (ACC-04)
  - RLS proven by pgTAP to isolate one household's data from another's (FND-12)
  - app_config table with anon-readable min_supported_version (D-25, FND-09)
  - production cloud schema applied via migrations only (ENV-17)
affects: [household-management-phase, decide-engine-phase, auth-phase]

# Tech tracking
tech-stack:
  added: [pgTAP 1.3.3 (local Docker extension), supabase test db / pg_prove]
  patterns:
    - "Household-of-one via security-definer AFTER INSERT trigger on auth.users"
    - "Membership lookup centralised in a stable security-definer function (user_household_ids()) to avoid recursive RLS"
    - "Every RLS policy uses the (select auth.uid()) initPlan form, scoped explicitly to authenticated (or anon, authenticated for the one public-read table)"
    - "Column-level GRANT UPDATE restricts client writes to specific profile columns; table-level UPDATE/INSERT/DELETE revoked otherwise"
    - "pgTAP fixtures insert auth.users rows directly as postgres, then impersonate via `set local role` + `set_config('request.jwt.claims', ...)`"

key-files:
  created:
    - supabase/migrations/20260922000100_household_of_one.sql
    - supabase/migrations/20260922000200_app_config.sql
    - supabase/tests/database/01_household_of_one.test.sql
    - supabase/tests/database/02_rls_isolation.test.sql
    - supabase/tests/database/03_app_config.test.sql
  modified: []

key-decisions:
  - "handle_new_user() stays owned by postgres rather than a dedicated non-login role (deviation from 00-RESEARCH.md's Pattern 3 suggestion), because a custom role would need BYPASSRLS or direct table ownership to fire an AFTER INSERT trigger on auth.users -- which widens privilege rather than narrows it. Mitigated instead with search_path pinned to '', fully qualified names, and execute revoked from public/anon/authenticated."
  - "anon's table-level privileges are fully revoked (not just gated by RLS) on households/household_members/profiles, so an anon REST read returns a 42501 permission-denied error rather than an empty array -- a stronger form of the same isolation guarantee. Documented as a deviation from the plan's literal '[]' wording below."

patterns-established:
  - "Pattern for every future data table: (select auth.uid())-wrapped policies, `to authenticated` role scoping, an index on the household/user foreign key, and no insert/delete policy unless a trigger or RPC needs one."

requirements-completed: [ACC-04, FND-12, FND-09, ENV-17, ACC-03]

# Metrics
duration: ~25min
completed: 2026-09-23
---

# Phase 00 Plan 06: Household-of-One, Profiles, App Config and Production Migration Summary

**First two production migrations (household-of-one auto-provisioning, profiles, app_config) shipped with 35 pgTAP assertions proving cross-household RLS isolation, then pushed live to the Fincwin United production project.**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-09-22T23:52Z (approx, first commit of this plan at 23:57:14)
- **Completed:** 2026-09-23T00:03Z (approx, at Task 2 commit; Task 3 push followed immediately after)
- **Tasks:** 3 (all `type=auto`)
- **Files modified:** 5 created (2 migrations, 3 pgTAP test files)

## Accomplishments
- `households`, `household_members`, `profiles` tables with version-bump triggers and RLS, provisioned invisibly on signup by a security-definer trigger on `auth.users` (ACC-04)
- `user_household_ids()` security-definer helper centralises membership lookups, avoiding recursive RLS on `household_members`
- `app_config` table with a public-read `min_supported_version` row (D-25, FND-09), writable by no client role
- 35 pgTAP assertions across 3 test files proving: exact-shape provisioning, security-definer hardening (pinned `search_path`, revoked execute), the `(select auth.uid())` initPlan form on every policy, and full cross-household isolation (A cannot read or write B's rows; anon cannot read any of the three tables)
- Both migrations pushed to and verified against the production Supabase project (Fincwin United, `cohmcbdfgqmiwykztrdg`) via `supabase db push --linked`

## Task Commits

Each task was committed atomically:

1. **Task 1: Write the household-of-one and app_config migrations** - `6dd2083` (feat)
2. **Task 2: pgTAP tests for provisioning, isolation and app_config** - `f1cffec` (test)
3. **Task 3: Push migrations to the production cloud project** - no new commit (no file changes; the two migration files pushed were already committed in Task 1 -- see Task Commits detail below)

**Plan metadata:** committed alongside this SUMMARY

## Files Created/Modified
- `supabase/migrations/20260922000100_household_of_one.sql` - households/household_members/profiles tables, version-bump trigger, `user_household_ids()`, `handle_new_user()` signup trigger, RLS
- `supabase/migrations/20260922000200_app_config.sql` - app_config table, anon-readable policy, `min_supported_version` seed row
- `supabase/tests/database/01_household_of_one.test.sql` - 16 pgTAP assertions: provisioning shape, security-definer hardening, index, policy-shape check
- `supabase/tests/database/02_rls_isolation.test.sql` - 15 pgTAP assertions: cross-user read/write isolation, column-privilege limits, check-constraint enforcement, anon denial
- `supabase/tests/database/03_app_config.test.sql` - 4 pgTAP assertions: anon read, anon/authenticated write denial

## Decisions Made
- **`handle_new_user()` ownership:** kept as `postgres` rather than introducing a dedicated non-login owner role, per 00-06-PLAN.md's explicit guidance -- a custom role would need `BYPASSRLS` or table ownership to be permitted to fire a trigger on `auth.users`, which is a net privilege *increase*. Mitigated with pinned empty `search_path`, fully qualified references, and `execute` revoked from `public`, `anon`, and `authenticated`.
- **Weight is an integer**, not numeric, matching the project's money-as-integer-minor-units discipline (split maths must be exact integer maths).
- **No insert/delete RLS policies** on households/household_members/profiles -- rows arrive only via the `handle_new_user` trigger in this plan; household writes (invites, membership changes) arrive with a later phase via RPCs, not direct table writes.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Clarification, no code change] Anon isolation proven as 42501, not literal `[]`**
- **Found during:** Task 2 (writing the RLS isolation pgTAP tests) and confirmed again in Task 3's production smoke check
- **Issue:** The plan's `<behavior>` text says "anon sees 0 rows in all three tables" and Task 3's acceptance criteria says the anon REST read of `households` "returns `[]`". As written, Task 1's own migration (`revoke all on public.households, public.household_members, public.profiles from anon;`) removes anon's table-level privilege entirely, not just its RLS visibility. A table-privilege-less anon SELECT fails at the privilege-check stage with PostgREST/Postgres error `42501 permission denied for table households`, before RLS is even evaluated -- it cannot return an empty array, because it never reaches row-filtering.
- **Fix:** No code change -- this is the migration exactly as Task 1 specified it, and it is a *strictly stronger* isolation guarantee than "0 rows" (anon cannot query the table at all, versus a query that runs and happens to return nothing). Wrote `02_rls_isolation.test.sql`'s anon assertions as `throws_ok(..., '42501')` rather than a row-count check, and verified the same `42501` behaviour lands identically against production in Task 3's smoke check.
- **Files affected:** `supabase/tests/database/02_rls_isolation.test.sql` (assertions 13-15); confirmed live via `curl` against the production REST API in Task 3
- **Verification:** Local: `supabase test db` shows all 3 anon-denial assertions passing. Production: `curl .../rest/v1/households?select=id` with the anon publishable key returns `{"code":"42501","message":"permission denied for table households",...}`.
- **Committed in:** `f1cffec` (Task 2 test commit); the production confirmation itself produced no file change (see Task 3 notes)

---

**Total deviations:** 1 (documentation/test-design clarification only; no migration or application code changed)
**Impact on plan:** None on scope or security posture -- the shipped migration matches the plan's own SQL exactly. Only the pgTAP assertions and this summary's wording were adjusted to match the actually-observed (and stronger) Postgres/PostgREST error-precedence behaviour instead of the plan's slightly imprecise prose description.

## Issues Encountered
- Casting `proconfig::text` (the whole array) and matching `like '%search_path=""%'` fails, because Postgres's array-to-text output backslash-escapes the embedded double quotes (`{"search_path=\"\""}`). Fixed by indexing the array element directly (`proconfig[1] = 'search_path=""'`) in both the exploratory query and the final `01_household_of_one.test.sql` assertions.
- A `WITH ... UPDATE ... RETURNING` CTE cannot be nested inside another query's scalar-subquery argument (`extensions.is((select count(*) from (with u as (update ...) ...)) ...)` -- Postgres requires a data-modifying CTE to be the top-level statement. Fixed by passing the whole `WITH`-update as the SQL text argument to `extensions.results_eq(...)`, which pgTAP executes as its own top-level statement.

## User Setup Required

None - no external service configuration required. The production push itself was pre-authorized by the user (see plan's `<user_authorization>`) and completed in this run; no further manual step remains.

## Next Phase Readiness
- The household-of-one shape (`households` / `household_members` / `profiles`) and the RLS/index/policy pattern it establishes are ready for every subsequent data table (transactions, checks, etc.) to copy verbatim.
- `app_config.min_supported_version` is live in production and ready for the client's launch-time version gate (FND-09) to read.
- `user_household_ids()` is the canonical helper every future household-scoped RLS policy should reference instead of re-deriving membership inline.
- No blockers for the next phase.

---
*Phase: 00-foundation*
*Completed: 2026-09-23*

## Self-Check: PASSED

All 5 created files verified present on disk; both task commits (`6dd2083`, `f1cffec`) verified present in `git log`.
