# Decision: on-demand FX, no daily sync

**Date:** 2026-10-07
**Decided by:** the user, during the Phase 2 device walkthrough.
**Amends:** Phase 1 D-08 (picker data source) and the fx-sync and fx-monitor design (Phase 0/1).
**Status:** decided. To be built as Phase 2 gap-closure plans, before Phase 2 closes.

## Why
On 2026-10-07 the currency picker was empty for every user. The daily `fx-sync` job had been copying Frankfurter v2's `end_date`, which now means "latest date with data", into `currencies.end_date`. D-08 defines that column as "discontinued", so all 166 currencies looked discontinued. Root cause and evidence are in `.planning/debug/fx-currency-end-date.md`.

The user chose the cheapest model with the fewest moving parts. The goals, all chosen together:
- fewer moving parts;
- less API usage and cost;
- fresher rates;
- privacy.

## Decision
1. **Built-in currency list.** The picker uses a fixed ISO 4217 list shipped with the app, updated with releases, plus the user's custom currencies. It keeps the Popular sections (02-DECISION-popular-currencies.md). It does not depend on the `currencies` table or on any rate existing.
2. **No daily job.** Remove the `fx-sync` daily cron, `fx-monitor`, and the per-currency staleness limits.
3. **Fetch only when a different currency is involved.** A rate is fetched, then stored, only when a currency other than the home currency enters the data:
   - saving a foreign-currency line uses the line's own date;
   - creating a foreign-currency account uses its opening date;
   - a statement import makes one fetch per distinct foreign date;
   - changing the home currency fetches today's rate for the new home currency against every other currency the household already uses (accounts, lines, recurring series), through the same fetch path, so totals convert immediately; offline, it is retried like a pending line. *(Added 2026-10-07 by the user while reviewing the gap-closure plans; built in plan 02-49.)*
   A user who only ever uses their home currency never causes a fetch.
4. **Shared rates.** One stored rate per currency per date, readable by every user. A rate is fetched once, ever. Rates are public data, so sharing reveals nothing about users.
5. **Balances use the latest stored rate.** Account balances, net worth and Decide convert with the most recent stored rate for the pair and never fetch on their own.
6. **Offline.** The current behaviour is unchanged: the line saves as "rate pending" and the rate is filled in when the device is online again (the existing resolve-rate follow-up).
7. **One fetch path.** Frankfurter is primary and openErApi is the fallback, reusing the existing `resolve-rate` function where possible. An alert fires only when an on-demand fetch fails.

## Consequences
- The empty-picker class of bug cannot happen, because the picker has no server dependency.
- The `20261007000200` migration (clearing false `end_date` values) stays, so the `currencies` table isn't left wrong. Nothing depends on that table for the picker anymore.
- The fx-sync parser fix from the same day becomes moot once the daily job is removed.
- The client change that never treats an empty cached list as fresh stays.
- Removing the cron and `fx-monitor` is a production change and needs the user's approval at deploy time.
- **Open for planning:**
  - whether any existing code reads `currencies` or `fx_latest_rates` for something other than the picker (exponent lookups, the Decide engine, money mirror tests);
  - how the cross rate via the EUR base works when neither currency is EUR;
  - what a balance shows when no stored rate exists yet for a pair.
