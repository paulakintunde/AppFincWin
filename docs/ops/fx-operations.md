# FX operations

The operator runbook for the FX pipeline: `fx-sync` (daily ingest, plan
01-08), `fx-monitor` (daily digest, plan 01-11) and `resolve-rate`
(client-invoked backfill, plan 01-11). Nothing here is user-facing — every
alert in this document goes to the operator inbox (`FX_ALERT_TO_EMAIL`) by
email through Resend, never to app users (D-09). The rate's visible
publication date (MON-07) is the user's own honest signal.

## Alert kinds

Every row in `fx_alerts` has a `kind`. `fx-monitor`'s daily digest groups
unsent rows by kind with a count in the subject (for example `FincWin FX: 2
stale, 1 held, 1 auto-accepted`) and lists each alert's currency and detail
in the body.

| Kind | Raised by | Meaning |
|---|---|---|
| `stale` | fx-monitor | A currency's latest stored rate is older than its staleness limit — the per-currency override (`currencies.staleness_limit_days`) if set, else the global default of about 4 calendar days (D-10). Check whether `fx-sync-daily` actually ran; Frankfurter/ECB publish nothing on weekends, so isolated staleness on a Monday for every currency is expected, but one currency stale on its own usually means that currency stopped publishing or the sync silently regressed for it. |
| `held` | fx-sync | A day-on-day move over ~10% was quarantined into `fx_rate_holds` instead of being written to `fx_rates` (D-11, MON-11). The last confirmed rate keeps serving conversions until this is confirmed or auto-accepted. |
| `auto-accepted` | fx-monitor | A held rate sat unconfirmed for more than 2 days and was accepted into `fx_rates` on the operator's behalf (D-12). This is the alert that most warrants a manual look — see "Dropping a bad rate" below. |
| `pending-rows` | fx-monitor | How many transactions have sat `rate_pending = true` for more than a day (Pitfall 2 — a stuck backfill must never be silent). Before counting, fx-monitor runs `fx_restamp_pending()`, which re-stamps every pending row whose date has arrived under the normal 7-day window. So a planned, future-dated row (kept pending until its own day) resolves on its own once fx-sync stores that day's rate, and only genuinely stuck rows are counted. A non-zero count that persists across several days' digests means `resolve-rate` isn't being called for those rows, is failing, or is finding its backfilled rate held; check Edge Function logs for `resolve-rate` and `fx_rate_holds`. |
| `fallback-used` | fx-sync | Frankfurter v2 was unreachable or returned something unparsable for that day's sync, and open.er-api served the rates instead (MON-12). Check `docs/dependency-register.md`'s Frankfurter row and Frankfurter's own status if this repeats. |
| `sync-failed` | fx-sync | Both Frankfurter and the open.er-api fallback failed in the same run — nothing was written. Rates stay at their last known values (still individually dated and visible per MON-07); investigate immediately, since two consecutive failed days approaches the staleness limit. |

## Inspecting holds

```sql
select * from public.fx_rate_holds where status = 'held';
```

Add `order by held_at` to see the oldest first — those are closest to
auto-accepting. `status` moves `held` → `confirmed` (a second source or a
later refresh landed near it) or `held` → `auto-accepted` (2 days elapsed
unconfirmed) → optionally `dropped` (see below).

A resolved hold is terminal. `dropped` never changes again, and
`confirmed`/`auto-accepted` can only move to `dropped`. A guard trigger on
`fx_rate_holds` discards any other update, and `fx-sync` skips an incoming
rate whose `(quote, date, source)` is already held or dropped. So a
Frankfurter feed that keeps re-reporting a value you dropped never revives
it, and `fx_auto_accept_holds()` only ever accepts rows that were never
resolved. `resolve-rate` backfills go through the same quarantine: a
backfilled rate for a held or dropped `(quote, date)` is discarded, and an
implausible one becomes a new hold whose `held` alert carries
`"via": "resolve-rate"`.

## Dropping a bad held or auto-accepted rate

`public.fx_drop_hold(<id>)` is the runbook function (service_role-only,
`supabase/migrations/20260924000600_fx_monitoring.sql`). If the hold was
already auto-accepted, it also removes that row from `fx_rates`; if it's
still merely `held`, it marks it `dropped`. A dropped `(quote, date,
source)` is never re-evaluated. Later publications on other dates are
checked normally. Any transaction already stamped from a
dropped auto-accepted rate keeps its stamp — a stamp is a historical fact,
not a live pointer — restamp an individual affected row with
`select public.restamp_transaction('<transaction-id>');` only if it is still
`rate_pending`. Called without a second argument, it re-stamps under the
normal 7-day window. `resolve-rate` passes the quotes its backfill stored as
`p_relax_quotes`, and only those legs may use an older rate. A row dated more
than a day ahead of the server date always stays pending.

Run it against the linked (production) project with the Supabase CLI, not
the dashboard SQL editor, so the action is logged the same way every other
production database operation is:

```bash
npx supabase db query --linked "select public.fx_drop_hold(<hold-id>);"
```

Acting fast matters here: `fx_drop_hold` only prevents a *future* digest
misreporting a dropped rate as still live — it does not undo any conversion
already computed and shown from an auto-accepted rate before you dropped it.
The 2-day auto-accept window (D-12) is the actual time budget to act in.

## Setting a per-currency staleness override

`currencies.staleness_limit_days` (D-10) tightens the global ~4-day default
for a specific currency — a candidate for a volatile currency (ARS, NGN,
TRY) that genuinely needs catching sooner. Always via a migration, never the
dashboard, per `CLAUDE.md`'s "no dashboard SQL edits to schema, ever":

```sql
-- supabase/migrations/<timestamp>_ars_staleness_override.sql
update public.currencies set staleness_limit_days = 2 where code = 'ARS';
```

`staleness_limit_days` is checked `between 1 and 30`; `null` (the default)
falls back to the global default inside `fx-monitor`'s `findStale()`.

## Secrets and Vault rows each function needs

| Function | Auth | Env vars | Vault rows (production, created at deploy time — plan 01-16, never in git) |
|---|---|---|---|
| `fx-sync` | shared secret (`x-fx-sync-secret`) | `FX_SYNC_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | `fx_sync_url`, `fx_sync_secret` |
| `fx-monitor` | shared secret (`x-fx-sync-secret`, reuses `FX_SYNC_SECRET`) | `FX_SYNC_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `FX_ALERT_TO_EMAIL` | `fx_monitor_url`, `fx_sync_secret` (shared with fx-sync) |
| `resolve-rate` | caller's JWT (`verify_jwt = true`) | `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | none (not pg_cron-invoked) |

`fx-monitor`'s cron job (`fx-monitor-daily`, 17:00 UTC — 30 minutes after
`fx-sync-daily`) runs locally too and fails harmlessly, since
`vault.decrypted_secrets` has no rows in local development. This is expected
and not a bug to chase.

## open.er-api attribution

Whenever a converted figure's rate came from the open.er-api fallback
(`fx_rates.source = 'open-er-api'`, or a transaction whose `rate_source` is
`'open-er-api'`), the UI must show the attribution text beside the rate
date, verbatim:

> Rates By Exchange Rate API

linking to `https://www.exchangerate-api.com`. Phase 1 ships the reusable
component and its i18n key (`supabase/functions/fx-sync/openErApi.ts`
exports `OPEN_ER_API_ATTRIBUTION`/`OPEN_ER_API_ATTRIBUTION_URL` as the
canonical strings); Record's screens are what actually render it. A
permanent line is also required in the app's About/credits screen,
independent of whether any currently-displayed figure used the fallback
that day.
