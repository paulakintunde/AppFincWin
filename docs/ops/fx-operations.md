# FX operations

The operator runbook for the FX pipeline. Since the on-demand model (plans
02-41 to 02-50, decision `02-DECISION-fx-on-demand.md`, rolled out
2026-10-08) there is **one** function, `resolve-rate`, and **no daily job**.
Rates are fetched only when a foreign currency is actually used. `fx-sync`
(daily ingest, plan 01-08) and `fx-monitor` (daily digest, plan 01-11) and
their cron jobs `fx-sync-daily` / `fx-monitor-daily` are retired. Nothing
here is user-facing: every alert goes to the operator inbox
(`FX_ALERT_TO_EMAIL`) by email through Resend, never to app users (D-09).
The rate's visible publication date (MON-07) is the user's own honest signal.

## How rates get fetched

`resolve-rate` (JWT-gated, `verify_jwt = true`) is the only door, and the
client reaches it only through `src/db/fxResolve.ts`. It fetches what is
neither already covered nor backing off, with one Frankfurter request per
distinct date and open.er-api as the fallback. Triggers:

- a foreign-currency line (its date);
- a foreign-currency account (its opening date);
- an import (one call per distinct date);
- a recurring series create or edit (its materialised lines);
- a home-currency change (today's rate for the new home against every other
  currency in use, 50 codes per call);
- the client pending sweep, which retries outstanding lines and checks.

The sweep also covers foreign lines that the server's
`recurring-materialise-daily` job creates. That job runs no FX fetch of its
own, so **its foreign lines get their rate only when a client sweep next
runs**. If nobody opens the app, those lines stay `rate_pending` (shown
provisional with the nearest earlier rate) until someone does.

### Bounds

| Mechanism | Rule |
|---|---|
| Coverage, `fx_rate_lookups` | One row per (quote, requested date) naming the stored rate that is that date's publication. FINAL when the requested date is at least 2 UTC days before the fetch; otherwise it counts as covered for 1 hour. |
| Negative cache, `fx_rate_fetch_failures` | After both providers failed: 30 minutes. After no usable rate, or a held value: 6 hours. |
| Client sweep budget | At most once per 15 minutes and at most 10 `resolve-rate` calls per run, shared by the home-currency retry, account checks and pending lines. |
| Per-user rate limit (RD-05) | About 60 calls/hour, see below. |

### Plausibility, hold, witness (MON-11)

A fetched rate that moves more than about 10% against a prior stored rate no
more than 7 days older is quarantined in `fx_rate_holds` instead of
`fx_rates`. A second source (open.er-api, only for dates within 2 days of
today, since it is latest-only) can confirm it. Otherwise later readings are
classified by `classifyRates` and a consistent reading confirms the hold.
An unconfirmed hold is accepted lazily after 2 days, on the next
`resolve-rate` call that fetches (`fx_auto_accept_holds()`); that also
refreshes `fetched_at` on the matching lookups so the date counts as
covered. The last confirmed rate keeps serving until then.

## Alert kinds

Every row in `fx_alerts` has a `kind`. Written now:

| Kind | Raised by | Meaning |
|---|---|---|
| `sync-failed` | resolve-rate | `detail.via` is `resolve-rate`. `detail.reason` is `both-sources-failed` (Frankfurter and open.er-api both failed) or `no-usable-rate` (they answered but nothing usable). Nothing was written for those quotes; the line stays provisional and is retried after the back-off. Check Frankfurter's status and `docs/dependency-register.md` if it repeats. |
| `held` | resolve-rate | A move over about 10% was quarantined into `fx_rate_holds`. `detail.via` is `resolve-rate`. The last confirmed rate keeps serving. |
| `auto-accepted` | resolve-rate | A hold sat unconfirmed for more than 2 days and was accepted into `fx_rates` (D-12). The alert most worth a manual look; see "Dropping a bad rate". |
| `hold-dropped` | `fx_drop_hold()` | The operator dropped a hold. `detail` records the hold's previous status, whether a served `fx_rates` row was removed (`rateRemoved`) and how many transactions were re-stamped (`restamped`). |

Retired on 2026-10-07 (old rows may still exist, nothing writes them now):
`stale`, `pending-rows`, `fallback-used`, `custom-shadowed`.

Email: at most one per hour, for failure, hold and auto-accept only. There is
**no daily digest and no "all clear" heartbeat**, so silence now means
nothing is wrong; it can no longer be read as "the monitor died".

## Inspecting holds

```sql
select * from public.fx_rate_holds where status = 'held';
```

Add `order by held_at` to see the oldest first; those are closest to
auto-accepting. `status` moves `held` to `confirmed` (a second source or a
later reading landed near it) or `held` to `auto-accepted` (2 days elapsed
unconfirmed), and optionally to `dropped` (see below).

A resolved hold is terminal. `dropped` never changes again, and
`confirmed`/`auto-accepted` can only move to `dropped`. A guard trigger on
`fx_rate_holds` discards any other update, and `resolve-rate` skips an
incoming rate whose `(quote, date, source)` is already held or dropped. So a
provider that keeps re-reporting a value you dropped never revives it.

## Dropping a bad held, confirmed or auto-accepted rate

`public.fx_drop_hold(<id>)` is the runbook function (service_role-only,
`supabase/migrations/20260924000600_fx_monitoring.sql`). Whatever the hold's
status (`held`, `confirmed` or `auto-accepted`), it removes any `fx_rates`
row with the same `(quote, date, source)` and marks the hold `dropped`. A
dropped `(quote, date, source)` is never re-evaluated. Later publications on
other dates are checked normally.

When a served rate was removed, `fx_drop_hold` also calls
`fx_restamp_by_rate(<quote>, <date>)`, which re-stamps every transaction
that could have been stamped from the rate. Re-stamped rows take the best
remaining rate; if none is covered they go back to `rate_pending`. After a
drop, the `fx_rate_lookups` row naming the deleted rate is inert (coverage
needs the referenced `fx_rates` row), so lines on that date stay provisional
until the date is refetched after the 6-hour `held` back-off and the provider
publishes a sane value. `version` is not bumped. The function returns the
re-stamped count, which the `hold-dropped` alert also records.

`select public.restamp_transaction('<transaction-id>');` re-stamps a single
row, but only if it is still `rate_pending`.

Run it against the linked (production) project with the Supabase CLI, not
the dashboard SQL editor, so the action is logged the same way every other
production database operation is:

```bash
npx supabase db query --linked "select public.fx_drop_hold(<hold-id>);"
```

Acting fast still matters. The repair re-stamps stored rows, but any figure
a user already saw or acted on while the bad rate was served cannot be
recalled. The 2-day auto-accept window (D-12) is the time budget to act in.

## Currency metadata

`currencies` is now a frozen snapshot. The daily metadata sync is gone, so
nothing writes `currencies.end_date` again (migration 20261007000200 cleared
the false end dates that the old sync had written from Frankfurter's
"latest date with data"). Which codes are accepted is decided by
`is_iso_currency()`, which accepts the active ISO 4217 set without needing a
stored rate. The per-currency staleness override
(`currencies.staleness_limit_days`) is retired along with the stale check; the
column remains, carrying a retirement comment in migration 20261007000300.

## Secrets each function needs

| Function | Auth | Env vars | Vault rows |
|---|---|---|---|
| `resolve-rate` | caller's JWT (`verify_jwt = true`) | `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `FX_ALERT_TO_EMAIL` | none (not pg_cron-invoked) |

`FX_SYNC_SECRET`, `FX_MONITOR_SECRET` and the vault rows `fx_sync_url`,
`fx_sync_secret`, `fx_monitor_url`, `fx_monitor_secret` are removed by the
rollout (Task 5 of plan 02-50). `RESEND_*` and `FX_ALERT_TO_EMAIL` stay as
Edge Function secrets only.

The two monitor-only SQL functions `fx_pending_rows_count()` and
`fx_restamp_pending()` are REVOKED from every role and marked DEPRECATED, not
dropped (user decision 2026-10-08; `lint:migrations` rejects `drop function`
without a `min_supported_version` raise). They are dropped at the next
`min_supported_version` raise (follow-up 22).

## resolve-rate's per-user rate limit (RD-05)

`resolve-rate` throttles each caller to about 60 calls/hour, tracked in
`fx_resolve_calls` (one row per `(user_id, current UTC hour)`, incremented
atomically by the service-role-only `fx_resolve_rate_check_limit()`). A
caller over the limit gets `HTTP 429 {"ok":false,"error":"rate-limited"}`
before any read, fetch or write happens; the row stays `rate_pending` until
a later call resolves it. This is not a failure to page on: a burst of
offline writes flushing at once is the normal case. Only investigate if the
same household stays rate-pending across days, which would suggest the
client-side backoff (`src/data/sync/resolveRateBackoff.ts`), the sweep
budget or the 60/hour limit needs tuning.

```sql
-- Calls in the current hour, by user, closest to the limit first.
select user_id, count from public.fx_resolve_calls
 where window_start = date_trunc('hour', now())
 order by count desc;
```

## open.er-api attribution

Whenever a converted figure's rate came from the open.er-api fallback
(`fx_rates.source = 'open-er-api'`, or a transaction whose `rate_source` is
`'open-er-api'`), the UI must show the attribution text beside the rate
date, verbatim:

> Rates By Exchange Rate API

linking to `https://www.exchangerate-api.com`.
`supabase/functions/_shared/fx/openErApi.ts` exports
`OPEN_ER_API_ATTRIBUTION`/`OPEN_ER_API_ATTRIBUTION_URL` as the canonical
strings. open.er-api is latest-only (no historical mode), which is why it is
the fallback for today-ish dates and the second-source witness only within 2
days of today. A permanent line is also required in the app's About/credits
screen, independent of whether any displayed figure used the fallback.

## min_supported_version

No `min_supported_version` raise was needed for this rollout and none is
made. No table or column was dropped or renamed, and every old-client read
path keeps its shape: `currencies` stays (frozen, end dates cleared),
`fx_latest_rates` is unchanged, and `resolve-rate` still accepts the old
`{transactionId}` request (shape A) and resolves those rows. The two
monitor-only functions were revoked rather than dropped for the same reason.

## Rollback

Cheap and secret-free until Task 5 of plan 02-50 (the cleanup) has run.
After Task 5, step (c) also needs the secrets and vault rows re-created. The
new tables (`fx_rate_lookups`, `fx_rate_fetch_failures`) can stay in every
case; nothing old reads them.

**(a) Client.** Supersede the bad update on the same channel and
environment (`docs/ops/ota-policy.md`):

```bash
npx eas update:list --branch <channel> --json --non-interactive   # find the last good group
npx eas update:republish --group <last-good-group-id> --message "rollback: on-demand FX"
# or fall back to the embedded bundle of the installed binary:
npx eas update:roll-back-to-embedded --branch <channel> --runtime-version <fingerprint>
```

Use the channel (`development` / `preview` / `production`) and its
identically named EAS environment that the rollout published to.

**(b) resolve-rate.** Redeploy the pre-rollout version from the main commit
recorded in `docs/acceptance/phase-02-fx-on-demand.md` (field "Pre-rollout
main hash"):

```bash
git switch -c rollback/resolve-rate <pre-rollout-main-hash>
npx supabase functions deploy resolve-rate
```

(or `git show <hash>:supabase/functions/resolve-rate/<file>` per file into a
branch). Old clients that send `{transactionId}` keep working either way.

**(c) Daily jobs.** Write a NEW forward migration
`supabase/migrations/<ts>_fx_restore_daily_jobs.sql` (never edit or delete an
applied one). It must:

1. re-create `fx_pending_rows_count()` and `fx_restamp_pending()` verbatim
   from `20260924000700_fx_monitor_jobs.sql` and re-grant their execute
   rights as that file did (migration 20261007000300 revoked them);
2. re-create the ISO branch of `per_eur_rate()` verbatim from
   `20260924000500` (the old 7-day exact window);
3. re-run both `cron.schedule(...)` calls verbatim: `fx-sync-daily`
   (`30 16 * * *`) from `20260922000400_fx_sync_schedule.sql` and
   `fx-monitor-daily` (`0 17 * * *`) from `20260924000700_fx_monitor_jobs.sql`.

Then redeploy the two functions from the last commit that had them, which is
`29c9755` (the parent of 957d263; it already carries the `end_date` parser
fix, so the old `currencies.end_date` corruption cannot recur):

```bash
git switch -c rollback/fx-daily 29c9755
npx supabase functions deploy fx-sync --no-verify-jwt
npx supabase functions deploy fx-monitor --no-verify-jwt
npm run supabase:db:push     # applies the restore migration, preflight-chained
```

Before Task 5 the secrets and vault rows still exist and nothing more is
needed. After Task 5 they must be re-created as in plans 00-09 / 01-16: new
random `FX_SYNC_SECRET` and `FX_MONITOR_SECRET` values (different from each
other) via `npx supabase secrets set`, and the four vault rows via
`vault.create_secret` (`fx_sync_url`, `fx_sync_secret`, `fx_monitor_url`,
`fx_monitor_secret`, each secret pair holding the same value as the function
secret). Never print or commit the values.

If a push stops part-way, after migration 20261007000200 but before
20261007000300, unschedule both crons at once so the old deployed fx-sync
cannot re-write `currencies.end_date`:

```sql
select cron.unschedule(jobname) from cron.job
 where jobname in ('fx-sync-daily','fx-monitor-daily') returning jobname;
```
