# Debug: currency picker empty for every user (fx currencies.end_date)

Date: 2026-10-07. Status: fixed in code, awaiting production rollout.

## Symptom
The currency picker is empty for every user. `useCurrencies` succeeds with 0 rows; `buildCurrencyOptions` returns 0 options.

## Root cause
Frankfurter v2 `GET /v2/currencies` now returns `end_date` as the latest date with data for ACTIVE currencies (e.g. AED `2026-10-08`). `fx-sync/currencies.ts` copied it straight into `endDate`, and `fx-sync/index.ts` upserted it as `currencies.end_date`. Phase 1 D-08 defines `end_date` as "discontinued" (null while active). `src/db/currencies.ts` filters `.is('end_date', null)`, so every currency was hidden. The empty result was cached for `staleTime: ONE_DAY_MS`, so devices did not refetch.

Knock-on: `fx-monitor/monitor.ts` skips any currency with an `end_date`, so staleness alerts were effectively off for every currency.

## Evidence (production, read-only, 2026-10-07)
- All 166 rows in `public.currencies` have `end_date` set (2026-09-29 .. 2026-10-07); USD/EUR/GBP/CAD = 2026-10-07.
- `fx_rates` healthy: 2,240 rows, latest 2026-10-07.

## Fix
1. fx-sync parser: `parseFrankfurterCurrencies(json, syncDate)` keeps `end_date` only when more than `DISCONTINUED_AFTER_DAYS = 30` days before the sync date, else null. The sync date is injected (`runFxSync` passes today, UTC); the parser reads no clock. Tests cover today, yesterday, 29 days, exactly 30 (active), 31 (discontinued), long-old, missing and unparseable.
2. Migration `20261007000200_currencies_clear_false_end_dates.sql`: `update public.currencies set end_date = null where end_date >= current_date - 30`. Idempotent, additive. pgTAP `39_currencies_clear_false_end_dates.test.sql` seeds recent, boundary and old rows. The test re-states the UPDATE because psql runs in a container and cannot `\i` the migration file; keep the two identical. 20261007000100 and all earlier migrations are untouched.
3. Client: `staleUnlessEmpty()` (`src/data/queries/staleness.ts`) is the `staleTime` for `useCurrencies` and `useFxLatest`: 0 when the cached list is empty, otherwise the old window. A device that cached `[]` refetches on its next mount. No persister cache-buster bump: a bump discards the whole persisted cache, including the cached reads that queued offline writes depend on.
4. fx-monitor: no code change needed. A regression test confirms an active currency with null `end_date` and no override is checked against the global default.

## Rollout (needs user approval; NOT done)
1. Deploy the `fx-sync` edge function first (parser fix), so a later sync cannot re-write recent end_dates.
2. `npm run supabase:preflight`, then `npm run supabase:db:push` (production). Applies `20261007000100` (if unpushed) and `20261007000200`.
3. Trigger one fx-sync run. No fx-monitor deploy is needed (data-only effect).
4. Ship the client change (OTA or next build). Devices holding a cached `[]` refetch on next mount once running it.
5. Verify: `select count(*) from currencies where end_date is null` is about 166 (minus any genuinely discontinued); the picker lists currencies; the next fx-monitor run evaluates staleness.
