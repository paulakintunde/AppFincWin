---
phase: 01-money-core
plan: 05
subsystem: database
tags: [postgres, supabase, pgtap, fx, money, rounding, sql-mirror, migrations]

# Dependency graph
requires:
  - phase: 01-money-core
    provides: "01-01: src/engine/money (divideHalfUp, convertMinor, crossRate, customPerEur, ISO_EXPONENT_EXCEPTIONS) and supabase/tests/fixtures/money-conversion-cases.json; 01-02: accounts/transactions/custom_currencies/money_prefs schema, is_known_currency(), bump_version()"
provides:
  - "public.div_half_up/convert_minor/cross_rate/custom_per_eur/currency_exponent -- SQL mirror of engine/money, proven identical via the shared fixture"
  - "public.per_eur_rate() -- the one function that reads fx_rates/custom_currencies for a rate, with D-02 nearest-earlier lookup, D-17 provisional-later fallback, and D-07 custom-currency recursion"
  - "trigger stamp_fx_rate before insert or update on public.transactions -- server-authoritative FX stamping (D-16)"
  - "public.restamp_transaction(uuid) -- service_role-only backfill path for plan 01-11's resolve-rate Edge Function"
  - "scripts/gen-money-mirror-test.mjs -- generates supabase/tests/database/07_money_rounding_mirror.test.sql from money-conversion-cases.json, --check mode for CI (plan 01-06)"
affects: [01-06 (CI wiring for the --check gate), 01-08 (fx_rate_holds must never be read by per_eur_rate), 01-11 (resolve-rate Edge Function calls restamp_transaction), 01-12, 01-13, Record phase (Phase 2, every transaction write goes through this trigger)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "SQL/TypeScript rounding mirror proven from one shared JSON fixture, consumed by both Jest (01-01) and a generated pgTAP file (--check mode fails CI on drift)"
    - "Transaction-local GUC (fincwin.system_restamp) as the only channel a privileged server-side path uses to change trigger behaviour -- unreachable from any client write since PostgREST cannot set a GUC"
    - "per_eur_rate()'s three-tier fallback (nearest earlier within window -> nearest later provisional -> nearest earlier beyond window) reused unchanged by both live inserts and the any_earlier restamp path"

key-files:
  created:
    - supabase/migrations/20260924000500_fx_stamping.sql
    - scripts/gen-money-mirror-test.mjs
    - supabase/tests/database/06_fx_stamping.test.sql
    - supabase/tests/database/07_money_rounding_mirror.test.sql
  modified: []

key-decisions:
  - "per_eur_rate's out-parameter variables (rate, rate_date, source) double as the SELECT INTO targets directly, rather than an intermediate record variable named `found` -- avoids shadowing plpgsql's special FOUND variable, which the function relies on after every lookup query"
  - "Test 10 (the service-role restamp) switches to `set local role service_role` rather than relying on the postgres superuser's grant bypass, so the pgTAP proof exercises the actual production grant path the resolve-rate Edge Function will use"
  - "06_fx_stamping.test.sql's transaction ids all start with a hex letter (b1111111, not t1111111) -- a 't' prefix is not valid hex and Postgres rejects it as a malformed uuid literal; caught and fixed during first `supabase test db` run"

requirements-completed: [MON-05, MON-07, MON-13, MON-01]

# Metrics
duration: ~90min (includes an unplanned ~50min local Supabase Docker stack recovery -- multiple LegacyContainerRemoveError/LegacyDbSetupError cycles before `db reset` completed cleanly; not implementation time)
completed: 2026-09-24
---

# Phase 1 Plan 5: Server-Side FX Rate Stamping Summary

**A SQL mirror of `engine/money` (div_half_up/convert_minor/cross_rate/custom_per_eur/currency_exponent), `per_eur_rate()`'s nearest-earlier/nearest-later/custom-currency rate lookup, and the `stamp_fx_rate` trigger that makes every transaction write server-authoritative on FX (D-16) -- proven against the same fixture the TypeScript engine uses, plus a hand-written pgTAP suite covering exact stamps, re-rates, amount-only edits, provisional pending rates, source attribution, custom currencies and the service-role-only restamp path.**

## Performance

- **Duration:** ~90 min total; actual SQL/test authoring was well under half of that -- the local Supabase Docker stack needed several `db reset` retries (`LegacyContainerRemoveError`, then a `LegacyDbSetupError` mid-way through applying migrations after a dropped connection) before a clean reset completed and `supabase test db` could run
- **Tasks:** 2/2 completed
- **Files modified:** 4 created, 0 modified

## Accomplishments
- `public.div_half_up`, `convert_minor`, `cross_rate`, `custom_per_eur` implemented exactly as specified in the plan's `<interfaces>`/`<action>` blocks -- `div()` on non-negative numeric operands as floor (matching BigInt division), `power(10::numeric, n)` instead of the caret operator, no bare Postgres rounding call
- `public.currency_exponent(code, owner)` -- a custom currency's own declared decimals take priority over the ISO 4217 exception table, which is transcribed in lockstep with `src/engine/money/currencyExponents.ts`
- `public.per_eur_rate(...)` -- EUR short-circuits to rate 1; a custom currency recurses through its declared ISO reference currency and applies `custom_per_eur`; an ISO currency finds the nearest earlier row within a 7-day exact window (D-02), same-date frankfurter-v2 preferred over any other same-date source, falling back to the nearest later row as a provisional value (D-03/D-17), and finally (only when the caller hasn't already widened the window) an earlier row beyond 7 days
- `stamp_fx_rate()` trigger on `transactions`: stamps `home_currency` once at insert from the author's profile and never again (D-05); re-rates on a `local_date` or `original_currency` change or when the row was already `rate_pending`; keeps every stored rate column on an amount-only edit and only recomputes `home_amount` (D-04); marks a row `rate_pending = true` with null stamp columns only when genuinely no rate exists in either direction
- `bump_version()` extended (not replaced in shape) so a system restamp -- signalled only by the transaction-local `fincwin.system_restamp` GUC -- does not count as a user edit, satisfying D-18's groundwork that an offline-queued edit against version 1 still applies after a background restamp
- `restamp_transaction(uuid)`, service_role only, sets and clears that GUC around a guarded update (`where id = p_id and rate_pending`) so it only ever touches rows that are actually still pending
- `scripts/gen-money-mirror-test.mjs` generates `07_money_rounding_mirror.test.sql` from `supabase/tests/fixtures/money-conversion-cases.json` (50 pgTAP assertions across halfUp/convert/customPerEur/crossRate/exponent cases); `--check` mode diffs the regenerated content against the file on disk and exits 1 on drift, ready for CI (plan 01-06)
- `06_fx_stamping.test.sql` (43 hand-written pgTAP assertions) proves every behaviour in the plan's acceptance list: an exact same-date-tie-break stamp, the display cross rate, a same-currency short-circuit, re-rate-on-date-change, amount-only-edit rate preservation, a pre-fx-sync-history date marked `rate_pending` with a provisional value and its source still attributed, the open.er-api fallback's attribution surviving into `rate_source`, a custom currency converting through its declared reference and unit value, `restamp_transaction` being service_role-only (42501 for `authenticated`), a full restamp accepting a >7-day-old backfilled rate without bumping `version`, and the pre-existing unknown-currency guard
- Full local suite green: `node scripts/gen-money-mirror-test.mjs --check` exits 0; `npx supabase db reset --local && npx supabase test db` -- 8 files, 174 assertions, all pass (including the pre-existing 05/08 files, unaffected by this plan's `bump_version()` change)

## Task Commits

Each task was committed atomically:

1. **Task 1: SQL money functions, per_eur_rate, stamp trigger and restamp** - `8ccae7e` (feat)
2. **Task 2: Generated rounding-mirror pgTAP and stamping pgTAP** - `1482ae5` (test)

**Plan metadata:** committed separately by the orchestrator after all worktree agents in this wave complete.

## Files Created/Modified
- `supabase/migrations/20260924000500_fx_stamping.sql` - money SQL functions, `per_eur_rate`, `stamp_fx_rate` trigger, `restamp_transaction`, `bump_version()` extended for system restamps, all grants
- `scripts/gen-money-mirror-test.mjs` - generator for the pgTAP rounding-mirror file, `--check` mode for CI
- `supabase/tests/database/07_money_rounding_mirror.test.sql` - generated, 50 assertions mirroring every case in `money-conversion-cases.json`
- `supabase/tests/database/06_fx_stamping.test.sql` - hand-written, 43 assertions proving stamping behaviour end to end

## Decisions Made
- `per_eur_rate`'s three lookup queries write directly into the function's own OUT parameters (`rate`, `rate_date`, `source`) rather than an intermediate `record` variable, specifically to avoid naming a local variable `found` -- plpgsql's special `FOUND` variable (which the function relies on immediately after each query) would otherwise be shadowed
- Test 10's service-role restamp assertion uses `set local role service_role` explicitly instead of relying on the `postgres` superuser's implicit grant bypass, so the pgTAP proof actually exercises the same grant path the resolve-rate Edge Function (plan 01-11) will use in production
- No column names, function signatures or table names deviated from the plan's `<interfaces>` contract -- every function name/signature plans 01-08, 01-11, 01-12 depend on matches verbatim

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Test transaction ids used an invalid hex character**
- **Found during:** Task 2, first `supabase test db` run
- **Issue:** `06_fx_stamping.test.sql`'s transaction row ids were prefixed `t1111111`, `t2111111`, etc. -- `t` is not a valid hexadecimal digit, so Postgres rejected every literal as `invalid input syntax for type uuid` the moment the first insert tried to read it back.
- **Fix:** Renamed every transaction id's leading character to a valid hex digit (`b1...`, `b2...`, `b4...`, `b5...`, `b6...`, `b7...`) via a scoped `sed` pass across the one file; the custom currency id (`c1111111...`) and account id (`a1111111...`) were already valid hex and untouched.
- **Files modified:** `supabase/tests/database/06_fx_stamping.test.sql`
- **Verification:** `npx supabase test db` -- all 174 assertions across 8 files pass, including all 43 in this file
- **Committed in:** `1482ae5` (Task 2 commit; caught and fixed before the commit was made, so no separate fix commit was needed)

---

**Total deviations:** 1 auto-fixed (1 bug in test SQL, not schema or trigger logic)
**Impact on plan:** No scope creep. The fix only changed literal id values used inside the test file, not what the test proves.

## Issues Encountered
- The local Supabase Docker stack needed multiple `db reset --local` attempts before completing cleanly: the first attempt failed with `LegacyContainerRemoveError` (container busy from a prior session), the second with a `LegacyDbSetupError` after "Connection terminated unexpectedly" while applying an unrelated pre-existing migration (`20260922000400_fx_sync_schedule.sql`, the pg_cron/pg_net setup), likely from a stray concurrent `docker exec` diagnostic command overlapping with the reset. A subsequent clean `db reset --local` (no other commands running concurrently against the same container) applied all nine migrations, including this plan's, without incident. No repository change was needed -- purely an environment/concurrency hiccup, consistent with the recovery note plan 01-02's SUMMARY left for this wave.
- The final storage-container health check in `db reset`'s output reported `unhealthy`/`LegacyHealthCheckTimeoutError` for `supabase_storage_...`, unrelated to this plan (storage is not used by any table or function here); `supabase test db` against the database itself was unaffected and passed cleanly afterward.

## User Setup Required

None - no external service configuration required. All work is local-only migrations and pgTAP tests; production push happens in plan 01-16.

## Next Phase Readiness

- Every transaction write is now stamped server-side from the project's own `fx_rates` (or a custom currency's declared rate), with its publication date, exactly mirroring `src/engine/money` -- the fixture-driven pgTAP file (07) makes any future drift between the TypeScript and SQL engines a CI failure once plan 01-06 wires `--check` in.
- `per_eur_rate`, `restamp_transaction` and the pure conversion functions are stable and named exactly per the plan's `<interfaces>` contract, so plan 01-08 (fx_rate_holds, never read by `per_eur_rate`), plan 01-11 (`resolve-rate` Edge Function calling `restamp_transaction`) and plans 01-12/01-13 are unblocked.
- No blockers for downstream plans. The one recurring environmental note (local Docker stack container-restart flakiness, and the risk of concurrent shell commands against the same container corrupting a `db reset` mid-way) is worth flagging again for any other worktree agent in this wave that touches the local Supabase stack: avoid running unrelated `docker exec`/`psql` diagnostics concurrently with a `db reset` or `test db` invocation against the same container.

## Self-Check: PASSED

All 4 created files verified present on disk (`supabase/migrations/20260924000500_fx_stamping.sql`, `scripts/gen-money-mirror-test.mjs`, `supabase/tests/database/06_fx_stamping.test.sql`, `supabase/tests/database/07_money_rounding_mirror.test.sql`). Both task commit hashes (`8ccae7e`, `1482ae5`) verified present in `git log`.

---
*Phase: 01-money-core*
*Completed: 2026-09-24*
