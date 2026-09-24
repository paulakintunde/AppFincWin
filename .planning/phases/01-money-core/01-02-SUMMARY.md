---
phase: 01-money-core
plan: 02
subsystem: database
tags: [postgres, supabase, rls, pgtap, migrations, money, fx, custom-currencies]

# Dependency graph
requires:
  - phase: 00-foundation
    provides: bump_version() trigger, user_household_ids() RLS helper, households/household_members/profiles tables, fx_rates table
provides:
  - custom_currencies table with owner-only RLS, immutable code/decimals, ISO-shadow guard
  - is_iso_currency()/is_known_currency() currency-knowledge helpers (security definer, pinned search_path)
  - profiles.home_currency/show_cents/lead_figure and households.reporting_currency, with home-currency validation and household-of-one reporting sync
  - accounts table (client-UUID PK, household-scoped RLS, currency locked at creation)
  - transactions table in full D-26 money shape (signed minor units, FX stamp columns, local_date + time_zone, composite FK to accounts, server-only stamp-column grants)
  - pgTAP proofs: 05_accounts_transactions.test.sql (20 assertions), 08_custom_currencies_prefs.test.sql (20 assertions)
affects: [01-05 (FX rate stamping trigger), 01-16 (production migration push), Record phase (Phase 2, writes through these tables), Decide phase (Phase 4, reads transactions)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Currency-knowledge helper pair (is_iso_currency/is_known_currency), security definer, set search_path = '', execute revoked from public/anon"
    - "Guard trigger (BEFORE INSERT OR UPDATE) enforcing business rules a CHECK constraint can't express (ISO-shadow rejection, code/decimals immutability)"
    - "Column-level grants as the D-16 server-only enforcement mechanism: exclude stamp columns from insert/update grants entirely so a naming attempt fails 42501 before any trigger runs"
    - "pgTAP results_eq() with a $$-quoted data-modifying WITH-CTE query, not is() wrapping the CTE as a scalar subquery (Postgres rejects a data-modifying CTE nested inside a subquery argument)"

key-files:
  created:
    - supabase/migrations/20260924000100_custom_currencies.sql
    - supabase/migrations/20260924000200_money_prefs.sql
    - supabase/migrations/20260924000300_accounts.sql
    - supabase/migrations/20260924000400_transactions.sql
    - supabase/tests/database/05_accounts_transactions.test.sql
    - supabase/tests/database/08_custom_currencies_prefs.test.sql
  modified: []

key-decisions:
  - "custom_currencies.owner_id defaults to auth.uid() but the guard trigger also forces new.owner_id := old.owner_id on UPDATE, closing off an owner-reassignment path the column grants alone don't prevent"
  - "is_iso_currency()/is_known_currency() live in the custom_currencies migration (not a separate file) since custom_currencies is the first table that needs them and accounts/transactions (Task 2) both depend on them at insert time"
  - "accounts.currency is fixed at creation (validated once via guard_account_currency BEFORE INSERT only) and excluded from the update grant -- changing an account's currency after transactions exist against it is out of scope for this plan"

patterns-established:
  - "Server-only stamp columns: a future migration adding a new server-authoritative column follows the same shape -- add the column, do NOT add it to any client grant, document why in a comment above the grant statement"

requirements-completed: [MON-04, MON-08, MON-09, MON-14]

# Metrics
duration: ~45min (includes an unplanned ~25min Docker/local-Supabase-stack recovery delay, not implementation time)
completed: 2026-09-24
---

# Phase 01 Plan 02: Money Tables (Custom Currencies, Accounts, Transactions) Summary

**Four migrations creating the Phase 1 money schema in full shape -- custom_currencies, profiles/households money prefs, accounts, and transactions with server-only FX stamp columns -- plus two pgTAP files (40 assertions) proving client-UUID PKs, version bumps, household RLS isolation, the composite account/household FK, and D-16's column-grant enforcement.**

## Performance

- **Duration:** ~45 min total; implementation itself was fast (all four migrations and both test files written and green on the first `db reset` for three of four files) -- most of the wall-clock time was an unrelated local Docker/Supabase-stack hiccup (the `supabase_db` container failed to restart cleanly on the first `db reset` attempt and needed ~25 min to recover before migrations could apply)
- **Tasks:** 3/3 completed
- **Files modified:** 6 created, 0 modified

## Accomplishments
- `custom_currencies` (MON-04, MON-13, D-07): owner-isolated, code/decimals immutable, cannot shadow an ISO code, reference currency must itself be a known ISO currency
- `is_iso_currency()`/`is_known_currency()`: the shared currency-validation helpers every subsequent money table (and Record's UI, later) relies on
- `profiles.home_currency`/`show_cents`/`lead_figure` and `households.reporting_currency` (MON-04, D-01, D-06, D-25), with a validation trigger and a household-of-one reporting-currency sync
- `accounts` and `transactions` in full D-26 shape: client-generated UUID PKs with no server default (MON-08), server-incremented `version` via the existing `bump_version()` trigger (MON-09), `local_date`/`time_zone` required on every transaction (MON-14), a composite FK preventing a transaction from pointing at another household's account, and column-level grants that make every FX stamp column (`rate`, `rate_date`, `rate_source`, `home_amount`, `home_currency`, `orig_per_eur`, `home_per_eur`, `rate_pending`) server-only (D-16)
- 40 new pgTAP assertions (92 total across the whole `supabase/tests/database/` suite), all green against a clean `supabase db reset --local`

## Task Commits

Each task was committed atomically:

1. **Task 1: custom currencies and money preference migrations** - `4267ff5` (feat)
2. **Task 2: accounts and transactions migrations** - `adf7735` (feat)
3. **Task 3: pgTAP proofs for money tables, custom currencies and preferences** - `89a3a4f` (test)

**Plan metadata:** committed separately by the orchestrator after all worktree agents in this wave complete.

## Files Created/Modified
- `supabase/migrations/20260924000100_custom_currencies.sql` - custom_currencies table, is_iso_currency()/is_known_currency() helpers, guard_custom_currency() trigger, owner-only RLS
- `supabase/migrations/20260924000200_money_prefs.sql` - profiles.home_currency/show_cents/lead_figure, households.reporting_currency, validate_home_currency() and sync_reporting_currency() triggers
- `supabase/migrations/20260924000300_accounts.sql` - accounts table, guard_account_currency() trigger, household-scoped RLS, column grants
- `supabase/migrations/20260924000400_transactions.sql` - transactions table in full money shape, guard_transaction_currency() trigger, composite FK to accounts, household-scoped RLS, server-only stamp-column grants
- `supabase/tests/database/05_accounts_transactions.test.sql` - 20 pgTAP assertions: no-default PK proof, insert/update as owner, D-16 grant denial, version bump x2, version-conditional update, two-user RLS isolation, composite FK rejection, required-field checks, unknown-currency rejection, anon denial, rate_pending honesty, index existence
- `supabase/tests/database/08_custom_currencies_prefs.test.sql` - 20 pgTAP assertions: owner isolation, ISO-shadow and reference-currency rejection, immutability (grant + trigger), version bump, home_currency validation, household-of-one reporting sync, preference defaults, function hardening

## Decisions Made
- `custom_currencies.owner_id` is forced back to `old.owner_id` inside `guard_custom_currency()` on UPDATE, in addition to being excluded from the update grant -- belt-and-braces against ownership reassignment, matching the plan's threat register (T-01-02-03)
- `is_iso_currency()`/`is_known_currency()` were placed in the Task 1 migration file rather than a separate file, since custom_currencies is the first consumer and accounts/transactions (Task 2) both need them at insert time -- avoids a forward-reference between migration files
- No column names, enum values or table names deviated from the plan's `<interfaces>` contract; Task 2's exact column list (`transactions`, `accounts`) matches verbatim what plans 01-05/01-10/01-12/01-13 will depend on

## Deviations from Plan

None in the shipped schema or tests -- all four migrations and both test files match the plan's `<action>` blocks essentially verbatim (SQL bodies were copied from the plan's fully-specified snippets, not redesigned).

### Auto-fixed Issues

**1. [Rule 1 - Bug] pgTAP `results_eq()` needed for the version-conditional-update assertion, not `is()` wrapping a CTE**
- **Found during:** Task 3, running `npx supabase test db` for the first time
- **Issue:** The plan's suggested pattern -- `extensions.is((with u as (update ... returning 1) select count(*) from u), 0, ...)` -- fails in Postgres with `WITH clause containing a data-modifying statement must be at the top level` when the WITH is nested inside a function-call argument (a scalar subquery), rather than being the top-level statement of its own query.
- **Fix:** Switched to `extensions.results_eq($$with u as (update ... returning 1) select count(*)::int from u$$, $$values (0)$$, ...)`, passing the WITH-CTE as SQL text so pgTAP executes it as its own top-level statement -- the same pattern `02_rls_isolation.test.sql` already uses for an equivalent assertion.
- **Files modified:** `supabase/tests/database/05_accounts_transactions.test.sql`
- **Verification:** `npx supabase test db` -- all 92 assertions pass, including this one
- **Committed in:** `89a3a4f` (Task 3 commit; caught and fixed before the commit was made, so no separate fix commit was needed)

---

**Total deviations:** 1 auto-fixed (1 bug in test SQL syntax, not a schema or business-logic bug)
**Impact on plan:** No scope creep. The fix only changed how one assertion invokes pgTAP, not what it proves.

## Issues Encountered
- The local Supabase Docker stack's `supabase_db` container failed to restart cleanly on the very first `supabase db reset --local` invocation (`LegacyContainerRemoveError` / `LegacyDbSetupError`), unrelated to this plan's SQL. It self-recovered after ~25 minutes once Docker finished cycling the container; all four migrations then applied cleanly and every test file passed on a subsequent clean `db reset` + `test db` run. No repo change was needed to resolve this -- purely an environment hiccup, noted here in case it recurs for a later plan in this wave.

## User Setup Required

None - no external service configuration required. All work is local-only migrations and pgTAP tests; production push happens in plan 01-16.

## Next Phase Readiness

- The full Phase 1 money schema (`accounts`, `transactions`, `custom_currencies`, money preferences) is in place and green locally, ready for plan 01-05 to add the `stamp_fx_rate()` trigger on top of it without any further DDL to `transactions`' shape.
- The exact column names/types in `accounts` and `transactions` match the plan's `<interfaces>` contract verbatim, so plans 01-10, 01-12 and 01-13 (which depend on these exact names) are unblocked.
- No blockers. The one open item is environmental (the local Docker stack's occasional slow container-restart cycle) rather than a code or schema concern -- future plans in this wave using the same local stack should budget a few extra minutes for `supabase db reset --local` if the containers were recently cycled.

---
*Phase: 01-money-core*
*Completed: 2026-09-24*

## Self-Check: PASSED

All 7 created files verified present on disk; all 3 task commit hashes (4267ff5, adf7735, 89a3a4f) verified present in `git log`.
