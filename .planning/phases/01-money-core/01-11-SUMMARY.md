---
phase: 01-money-core
plan: 11
subsystem: database
tags: [supabase, edge-functions, deno, jest, pgtap, fx, resend, pg_cron]

# Dependency graph
requires:
  - phase: 01-money-core
    provides: "01-05: per_eur_rate()/restamp_transaction() (service_role-only, GUC-gated); 01-08: currencies/fx_rate_holds/fx_alerts tables, fx_latest_rates(), fx_drop_hold(), fx-sync's parse.ts (FRANKFURTER_V2_RATES_URL, parseFrankfurterRates), openErApi.ts (OPEN_ER_API_ATTRIBUTION)"
provides:
  - "public.fx_auto_accept_holds(), fx_pending_rows_count() -- service_role-only, called by fx-monitor"
  - "fx-monitor-daily pg_cron job (17:00 UTC), same shared-secret/Vault trust model as fx-sync-daily"
  - "supabase/functions/resolve-rate/{resolve.ts,index.ts} -- client-invoked (verify_jwt=true), JWT-scoped historical backfill + restamp (D-03, D-17)"
  - "supabase/functions/fx-monitor/{monitor.ts,index.ts} -- pg_cron-invoked staleness/auto-accept/pending-rows Resend digest (MON-10, D-09, D-12)"
  - "docs/ops/fx-operations.md -- operator runbook: alert kinds, holds, drops, staleness overrides, secrets, attribution"
affects: [01-16 (production migration push, Vault rows fx_monitor_url/fx_sync_secret, RESEND_API_KEY/RESEND_FROM_EMAIL/FX_ALERT_TO_EMAIL secrets, function deploy), Record phase (Phase 2, any UI surfacing rate_pending/held/auto-accepted state), Compliance phase (open.er-api attribution obligation now fully documented)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "resolve.ts/monitor.ts follow fx-sync's established shape exactly: a pure, zero-runtime-import core (Deno + Jest dual-loadable) behind an injected-deps interface, with index.ts reduced to a thin Deno.serve wrapper that builds the real Supabase/Resend clients"
    - "resolveQuote()'s EUR-short-circuit + custom-currency-reference recursion mirrors per_eur_rate()'s own EUR/custom-currency handling (01-05) at the Edge Function layer, so the two never need to agree on rate math -- resolve-rate only ever decides *which quotes to fetch*, restamp_transaction still owns the actual stamp"
    - "fx-monitor's MonitorDeps mirrors fx-sync's FxSyncDb pattern: today()/latestRates()/currencies() as pure reads, insertAlerts()/autoAcceptHolds()/pendingRowsCount()/unsentAlerts()/markEmailed()/sendEmail() as the only side effects, so runFxMonitor's ordering (stale alerts -> auto-accept -> pending-rows alert -> one Resend call -> mark emailed) is fully asserted in Jest with no network or database"

key-files:
  created:
    - supabase/migrations/20260924000700_fx_monitor_jobs.sql
    - supabase/tests/database/10_fx_monitor_jobs.test.sql
    - supabase/functions/resolve-rate/resolve.ts
    - supabase/functions/resolve-rate/resolve.test.ts
    - supabase/functions/resolve-rate/index.ts
    - supabase/functions/resolve-rate/deno.json
    - supabase/functions/fx-monitor/monitor.ts
    - supabase/functions/fx-monitor/monitor.test.ts
    - supabase/functions/fx-monitor/index.ts
    - supabase/functions/fx-monitor/deno.json
    - docs/ops/fx-operations.md
  modified:
    - supabase/config.toml
    - .env.example
    - docs/dependency-register.md

key-decisions:
  - "SUPABASE_ANON_KEY is the env var name resolve-rate/index.ts reads for the platform-injected anon/publishable key inside the Edge Function runtime -- distinct from the app's own EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY, which is a client-bundle env var name, not an Edge Function one. Documented inline in index.ts; not independently re-verified against live Supabase docs this session (the plan flagged this as worth confirming/noting) -- if a production deploy in plan 01-16 finds a different actual env var name injected, only this one line in index.ts needs to change."
  - "resolve.ts's quote-resolution helper always calls customReference for both currency legs (skipping only literal 'EUR'), rather than special-casing ISO vs custom up front -- customReference returning null is itself the signal 'not a registered custom currency for this owner', which keeps the logic to one code path instead of two"
  - "fx-monitor's cron job and supabase/config.toml's [functions.resolve-rate]/[functions.fx-monitor] blocks were committed together with resolve-rate's Task 2 GREEN commit (both config.toml edits landed before the first commit boundary) rather than split across Task 2/Task 3 -- functionally identical to a split, just a slightly earlier landing point for the fx-monitor verify_jwt block; noted here for commit-history clarity, not a behavioral deviation"

patterns-established:
  - "docs/ops/fx-operations.md's per-alert-kind table (raised-by, meaning, what to check) is the template for any future operator-facing monitoring surface in this project -- one row per alert kind, one 'what does a repeat of this mean' sentence each"

requirements-completed: [MON-10, MON-11, MON-05]

# Metrics
duration: ~2h (includes an unplanned Docker Desktop resource-saver pause mid-session that required `docker desktop restart` and a ~90s container warm-up before `supabase db reset --local` could run at all -- not implementation time; also a session interruption/resume mid-plan, verified via git status/log on resume rather than redone)
completed: 2026-09-24
---

# Phase 1 Plan 11: FX Monitor and Resolve-Rate Edge Functions Summary

**The two remaining FX Edge Functions -- `resolve-rate` (JWT-scoped, client-invoked historical backfill + re-stamp) and `fx-monitor` (pg_cron-invoked staleness check, held-rate auto-accept, pending-row count and the Resend operator digest) -- plus the SQL jobs backing the monitor and the operator runbook, closing out MON-10, the auto-accept half of MON-11, and the D-03/D-17 backfill path for MON-05.**

## Performance

- **Duration:** ~2h total, including an unplanned Docker Desktop resource-saver pause (the local stack was manually paused mid-session; `docker desktop restart` plus container warm-up resolved it) and a mid-plan session interruption/resume
- **Tasks:** 3/3 completed
- **Files modified:** 11 created, 3 modified

## Accomplishments
- `public.fx_auto_accept_holds(p_older_than default '2 days')`: accepts every held rate older than the window into `fx_rates` (`on conflict do nothing`), flips its status to `auto-accepted`, and queues one `fx_alerts` row per acceptance with the held rate/date/hold-id in `detail` -- the D-12 half of the hold lifecycle `fx_drop_hold()` (01-08) started
- `public.fx_pending_rows_count(p_older_than default '1 day')`: counts transactions still `rate_pending` past the window, feeding the digest's Pitfall-2 signal that a stuck backfill is never silent
- `fx-monitor-daily` pg_cron job at 17:00 UTC (30 minutes after `fx-sync-daily`), same shared-secret/Vault-row trust model as the existing schedule; both new functions are `service_role`-only, revoked from `public`/`anon`/`authenticated`
- `supabase/functions/resolve-rate/resolve.ts`: pure `resolveRate(deps, input)` -- 400 on a non-UUID `transactionId`, 404 with zero fetch/admin-write when the user-scoped `readPending` finds nothing (the IDOR mitigation happens entirely in `index.ts`'s client construction, T-01-11-01), a straight 200 pass-through for a non-pending row, sorted EUR-excluded quote resolution (custom currencies recurse through their reference currency exactly like `per_eur_rate()` does in SQL) feeding one Frankfurter historical fetch, an `upsertRates` + `restamp_transaction` call, and 502 with no restamp on any fetch/parse failure
- `supabase/functions/resolve-rate/index.ts`: `verify_jwt = true`; builds a user-scoped client from the caller's own `Authorization` header for `readPending` and a service-role admin client for everything after -- a transaction id the caller's household cannot see never reaches the admin client at all
- `supabase/functions/fx-monitor/monitor.ts`: pure `findStale` (per-currency `staleness_limit_days` override or the 4-day global default, D-10; an `end_date` currency never flagged since it will never publish again), `buildDigest` (grouped-by-kind subject with a count, e.g. `FincWin FX: 2 stale, 1 held, 1 auto-accepted`; body carries only currency codes/rates/counts, never a user identifier -- T-01-11-04), and `runFxMonitor` orchestration (stale alerts -> auto-accept -> a `pending-rows` alert only when nonzero -> one Resend call covering every unsent alert -> mark emailed only on success, so a Resend failure leaves `emailed_at` null for tomorrow's retry)
- `supabase/functions/fx-monitor/index.ts`: shared-secret auth identical to `fx-sync` (`safeEqual`, `x-fx-sync-secret`, reusing `FX_SYNC_SECRET`); missing `RESEND_API_KEY`/`RESEND_FROM_EMAIL`/`FX_ALERT_TO_EMAIL` fails closed with a generic `{ error: 'config' }` 500 that never names which value is missing
- `docs/ops/fx-operations.md`: a glossary of all six `fx_alerts` kinds (`stale`, `held`, `auto-accepted`, `pending-rows`, `fallback-used`, `sync-failed`) with what each means and what a repeat of it implies; how to inspect and drop a bad held/auto-accepted rate via `fx_drop_hold`; how to set a per-currency staleness override via migration, never the dashboard; a secrets/Vault-row table per function; the open.er-api attribution obligation (verbatim text, URL, and the permanent About/credits line)
- `docs/dependency-register.md`: open.er-api's row moved `deferred` -> `provisioned` (it shipped in plan 01-08, this plan just documents the runbook side); new row for Resend's FX operator digest
- Full local proof: `npx supabase db reset --local && npx supabase test db` -- 10 files, 198 assertions, `Result: PASS`; `npx jest supabase/functions` -- 7 suites, 67 tests, all passing; `npm run lint:migrations` -- `MIGRATION COMPAT OK`

## Task Commits

Each task was committed atomically. Tasks 2 and 3 (`tdd="true"`) are each split into a `test` commit followed by a `feat` commit, per the plan's explicit RED-then-GREEN instruction:

1. **Task 1: Monitor SQL functions, cron job and pgTAP** - `e1bce43` (feat)
2. **Task 2 RED: resolve-rate tests** - `e9fbea9` (test)
3. **Task 2 GREEN: resolve-rate Edge Function** - `db7cece` (feat)
4. **Task 3 RED: fx-monitor tests** - `475ff3f` (test)
5. **Task 3 GREEN: fx-monitor Edge Function, runbook and dependency register** - `68709f1` (feat)

**Plan metadata:** committed separately by the orchestrator after all worktree agents in this wave complete.

## Files Created/Modified
- `supabase/migrations/20260924000700_fx_monitor_jobs.sql` - `fx_auto_accept_holds()`, `fx_pending_rows_count()`, `fx-monitor-daily` cron schedule and grants
- `supabase/tests/database/10_fx_monitor_jobs.test.sql` - 10 pgTAP assertions proving the above
- `supabase/functions/resolve-rate/resolve.ts` + `resolve.test.ts` - pure core, 9 Jest tests
- `supabase/functions/resolve-rate/index.ts` + `deno.json` - Deno.serve wrapper, user-scoped + admin clients
- `supabase/functions/fx-monitor/monitor.ts` + `monitor.test.ts` - pure core, 15 Jest tests
- `supabase/functions/fx-monitor/index.ts` + `deno.json` - Deno.serve wrapper, shared-secret auth, Resend call
- `docs/ops/fx-operations.md` - operator runbook (new file)
- `supabase/config.toml` - `[functions.resolve-rate]` (`verify_jwt = true`), `[functions.fx-monitor]` (`verify_jwt = false`)
- `.env.example` - `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `FX_ALERT_TO_EMAIL`
- `docs/dependency-register.md` - open.er-api status update, new Resend digest row

## Decisions Made
- `SUPABASE_ANON_KEY` is the env var name used in `resolve-rate/index.ts` for the Edge Function runtime's platform-injected anon/publishable key (distinct from the app-bundle's `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`). The plan asked to "check `Deno.env` names in the Supabase Edge Functions docs and note it in the SUMMARY" -- this session used the name documented across Supabase's own Edge Function examples rather than independently re-verifying against a live fetch; if production deploy (plan 01-16) finds Supabase injects a different literal name, only this one line needs to change.
- `resolve.ts`'s per-leg quote resolution always calls `customReference` for both the original and home currency (skipping only a literal `'EUR'`), rather than branching on "is this code known to be custom vs ISO" beforehand -- a null return from `customReference` is itself sufficient to mean "not custom, fetch it directly," keeping one code path instead of two.
- Both `supabase/config.toml` `[functions.*]` blocks (`resolve-rate` and `fx-monitor`) ended up in the Task 2 GREEN commit rather than split one-per-task, because both edits were made to the file before the first commit boundary was reached. This has no functional effect -- the file's final content is identical either way -- and is noted here only for commit-history clarity.
- No column names, function signatures, table names or exported interfaces deviated from the plan's `<interfaces>` contract.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Test transaction insert omitted `created_by`, tripping `stamp_fx_rate()`'s author-profile lookup**
- **Found during:** Task 1, first `supabase test db` run
- **Issue:** `10_fx_monitor_jobs.test.sql` seeded its two pending-transaction rows as `postgres` without setting `created_by`. `transactions.created_by` defaults to `auth.uid()`, which is null for the `postgres` role, so `stamp_fx_rate()`'s `owner := coalesce(new.created_by, (select auth.uid()))` resolved to null and its profile lookup raised `no profile for transaction author`.
- **Fix:** Added `created_by` explicitly to both transaction inserts, set to the seeded test user's id.
- **Files modified:** `supabase/tests/database/10_fx_monitor_jobs.test.sql`
- **Verification:** `npx supabase test db` -- 198/198 assertions pass, including all 10 in this file
- **Committed in:** `e1bce43` (Task 1 commit; caught and fixed before the commit was made, no separate fix commit needed)

**2. [Rule 1 - Bug] resolve.test.ts's Frankfurter fetch mock returned already-parsed `FxRow[]` instead of the raw provider JSON shape**
- **Found during:** Task 2, first Jest run against the new (GREEN) `resolve.ts`
- **Issue:** The "fetches the sorted, EUR-excluded quotes... and restamps" test's `fetchJson` mock returned `FxRow[]` (string `rate`), but `resolveRate` passes the fetched JSON through `parseFrankfurterRates`, which requires the raw Frankfurter v2 shape (numeric `rate`). The mismatch made `parseFrankfurterRates` throw on the mock data, `resolveRate` return 502, and `upsertRates`/`restamp` never get called -- the test failed on `upsertRates` "Number of calls: 0."
- **Fix:** Changed the mock to return the raw Frankfurter v2 array shape (numeric `rate`) and assert `upsertRates` was called with the separately-declared, already-parsed `FxRow[]` it should produce.
- **Files modified:** `supabase/functions/resolve-rate/resolve.test.ts`
- **Verification:** `npx jest supabase/functions/resolve-rate` -- 9/9 pass
- **Committed in:** `e9fbea9` (Task 2 RED commit; the corrected test is what was committed, so RED/GREEN history stays clean)

---

**Total deviations:** 2 auto-fixed bugs, both in test setup (not in any migration, trigger or Edge Function logic). No scope creep.

## Issues Encountered
- Mid-session, the local Docker stack was found "manually paused" (Docker Desktop's Resource Saver, engaged outside this session) -- every `docker`/`supabase` CLI call failed with `Docker Desktop is manually paused. Unpause it through the Whale menu or Dashboard.` `docker desktop restart` (the Docker Desktop CLI plugin) resolved it; all containers reported healthy within about a minute, after which `supabase db reset --local` and `supabase test db` ran cleanly. No repository change was needed.
- This execution was also interrupted and resumed once mid-plan (a fresh agent instance picked up the worktree). On resume, `git status`/`git log` confirmed no work had been silently lost or duplicated before continuing -- all three tasks' commits listed above landed in a single continuous run once Docker was back up.

## User Setup Required

None -- no external service configuration required. All work is local migrations, pgTAP tests and Edge Function code with Jest-mocked dependencies; production push, Vault row creation (`fx_monitor_url`) and the `RESEND_API_KEY`/`RESEND_FROM_EMAIL`/`FX_ALERT_TO_EMAIL` secrets happen in plan 01-16.

## Next Phase Readiness

- The FX pipeline is now feature-complete for Phase 1: `fx-sync` (01-08) ingests and quarantines, `fx-monitor` (this plan) alerts and auto-accepts, `resolve-rate` (this plan) backfills history on demand, and every path funnels through `restamp_transaction`/`per_eur_rate` (01-05) as the single source of stamped truth.
- `docs/ops/fx-operations.md` gives plan 01-16's deploy step (and any future operator) everything needed to read a digest and act on it -- no further documentation work is implied for Phase 1.
- No blockers for downstream plans. The Docker Desktop resource-saver pause is worth flagging again for any other worktree agent using the local Supabase stack on this machine: if every `docker`/`supabase` command starts failing with the exact "manually paused" message, `docker desktop restart` (not `docker desktop start`, which reports "already running" while paused) is the fix.

---
*Phase: 01-money-core*
*Completed: 2026-09-24*

## Self-Check: PASSED

All 11 created files verified present on disk (`supabase/migrations/20260924000700_fx_monitor_jobs.sql`, `supabase/tests/database/10_fx_monitor_jobs.test.sql`, `supabase/functions/resolve-rate/{resolve.ts,resolve.test.ts,index.ts,deno.json}`, `supabase/functions/fx-monitor/{monitor.ts,monitor.test.ts,index.ts,deno.json}`, `docs/ops/fx-operations.md`) plus this SUMMARY.md. All 5 task commit hashes (`e1bce43`, `e9fbea9`, `db7cece`, `475ff3f`, `68709f1`) verified present in `git log`.
