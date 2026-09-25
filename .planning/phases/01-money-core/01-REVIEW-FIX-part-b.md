---
phase: 01-money-core
partition: B
fixed_at: 2026-09-24
review_path: .planning/phases/01-money-core/01-REVIEW.md
iteration: 1
findings_in_scope: 16
fixed: 16
skipped: 0
partially_addressed: [WR-B07, IN-B01]
status: all_fixed
---

# Phase 1 Partition B: Code Review Fix Report

**Fixed at:** 2026-09-24
**Source review:** .planning/phases/01-money-core/01-REVIEW.md (Partition B only: CR-B*, WR-B*, IN-B*)
**Iteration:** 1

**Summary:**
- Findings in scope: 16 (3 critical, 9 warning, 4 info)
- Fixed: 16. Two are only partly addressed (WR-B07, IN-B01); see their notes.
- Skipped: 0
- Every fix has a regression test that failed before the fix: 11 new pgTAP files (`11_`–`21_`) and new Jest cases in the Edge Function and engine tests. WR-B09 is the exception, because it only adds test coverage.
- Phase 1 migrations were edited in place (not yet pushed). None of the edits adds a `drop`, `rename` or `alter type` statement.

## Findings

| ID | Outcome | Commit | Note |
|----|---------|--------|------|
| CR-B01 | fixed | 983c6fc | resolve-rate backfill filtering: keeps only requested quotes dated on or before `local_date`, and skips any `(quote, date)` with a held or dropped hold. The remaining rows go through fx-sync's own `classifyRates` against the nearest stored prior, with no age window. Implausible rows go to `fx_rate_holds` with a `held` alert (`via: resolve-rate`). A backfill can never confirm a hold. |
| CR-B02 | fixed | 88134a7 | Resolved holds are now terminal, enforced four ways. (1) A guard trigger on `fx_rate_holds` discards any update other than the operator's drop. (2) The fx-sync hold upsert uses `ignoreDuplicates`. (3) `classifyRates` skips rows whose `(quote, date, source)` is already held or dropped, and never confirms a dropped hold. (4) `fx_auto_accept_holds` requires `resolved_at is null`. The FX runbook is updated. |
| CR-B03 | fixed | 114ac93 | EXECUTE on `is_known_currency`, `currency_exponent` and `per_eur_rate` revoked from public/anon/authenticated; service_role keeps it. No `src/` code calls these via rpc; the triggers call them as definer. pgTAP proves user B cannot read A's custom currency and that A's own triggers still work. |
| WR-B01 | fixed: requires human verification | 705f334 | `restamp_transaction(p_id, p_relax_quotes text[])`: only the quotes whose backfill actually reached `fx_rates` may use a rate older than 7 days. A row dated more than one day past the server date is never exact. `local_date` must fall between 1900-01-01 and `current_date + 366`, else 23514. New `fx_restamp_pending()` runs daily from fx-monitor, so future-dated rows resolve once their day arrives. **Product choices made conservatively:** the one-day slack covers UTC+14 zones; the 1900 lower bound (the review suggested 1999-01-04) avoids rejecting historical same-currency entries. |
| WR-B02 | fixed | a9b37d0 | A custom leg whose reference rate came from open.er-api is now attributed `open-er-api`, which outranks `custom` in the existing precedence. |
| WR-B03 | fixed | 9d2cb51 | Same-run witness confirmation now matches the hold created in this run on `(quote, date, source)` and upserts under the hold's own source. `classifyRates` checks every open hold for the quote. |
| WR-B04 | fixed | 3bde3bb | fx-sync history is now every stored row from the batch's earliest date plus each quote's latest stored rate before it (`fx_latest_rates`, no age window). "No prior" now only means the quote was never stored. resolve-rate got the same no-window prior lookup in CR-B01. |
| WR-B05 | fixed: requires human verification | 8785e65 | `fx_drop_hold` removes the matching `fx_rates` row for any non-dropped status, then calls the new service-role `fx_restamp_by_rate(quote, date)`. That re-stamps rows that could have used the rate, whether pending or not: rows with the quote on either leg (directly or as a custom reference) that are pending, carry that `rate_date`, or are dated within the 7 days the rate served. `version` is not bumped. It adds a new `hold-dropped` alert kind carrying the count, and now returns an integer. **Please verify the row-selection heuristic.** A row made exact by a relaxed backfill on another leg can drop back to pending. |
| WR-B06 | fixed: requires human verification | 640af12 | New static ISO 4217 list, `is_iso4217_code`: active codes plus common withdrawn ones. It is used, together with `fx_rates`, in the custom-code shadow check. New `check (reference_currency <> code)`. `per_eur_rate` now resolves a custom currency's reference with no owner, so it cannot recurse (the pre-fix run reproduced "stack depth limit exceeded"). Custom decimals still take precedence over ISO decimals for an existing custom code, because switching would reinterpret stored minor units. **Please review the static code list.** |
| WR-B07 | fixed (partial) | fa6d8e7 | TS `customPerEur` and SQL `custom_per_eur` now fail identically on a zero result or a numeric(24,10) overflow: RangeError in TS, 22003 in SQL. A new `guard_custom_currency_rate` trigger rejects a custom currency declared or revalued out of range against its reference's latest rate (23514). Two fixture parity cases were added and the mirror regenerated; engine/money coverage is still 100%. **Not fixed: precision loss inside the representable range** (1 GOLD = 60,000 USD still converts to 59,999.90). Fixing it exactly needs the custom leg's unit value and reference rate stored on the transaction, plus a new mirror function the generator script cannot express without editing it. That is a schema decision, so it is left open. No fixed `unit_value` bound was added either: the review's 1e6 cap would reject legitimate units such as a VND-referenced asset. |
| WR-B08 | fixed | 37a9f85 | Server-only `orig_exp`/`home_exp` columns on `transactions`, stamped at insert and reused on edits; only an `original_currency` change re-derives `orig_exp`. Clients cannot write them (column grants). Not done: making custom currencies readable by household members. That depends on Phase 8 household work, and until then the stamped exponents let the client format amounts. |
| WR-B09 | fixed | fac9e8d | Fixture now asserts all 26 ISO exponent exceptions plus 8 default-2 codes. New conversion cases: 4-decimal both ways, negative 3→0 and 0→3, custom 3-decimal both ways, `MAX_ABS_AMOUNT_MINOR`, and ±`MAX_SAFE_INTEGER`. The overflow boundary is asserted with the same inputs on both sides: a Jest RangeError and pgTAP `19_money_bounds` (23514). The generator script is unchanged. This finding is coverage-only, so there is no failing-before test beyond the new cases themselves. |
| IN-B01 | fixed (partial) | 5eccc4d | Any throw after input validation now returns `500 {ok:false,error:'internal'}` with no message echoed. **Per-user throttling was not added:** it needs a rate-limit store, an infrastructure decision. |
| IN-B02 | fixed | eb568a9 | `runFxSync` catches failures after the fetch, writes a best-effort `sync-failed` alert (`stage: 'ingest'`), and rethrows the original error. |
| IN-B03 | fixed | 7d1db01 | fx-monitor has its own `FX_MONITOR_SECRET` / `x-fx-monitor-secret`, checked by a new testable `auth.ts`. The cron job sends the new `fx_monitor_secret` Vault row. fx-monitor emails a daily "all clear" heartbeat when no alerts are pending, so no email at all means fx-monitor failed. |
| IN-B04 | fixed | b2c7b20 | A guard trigger checks `time_zone` against `pg_timezone_names` on insert and on zone change; null is left to NOT NULL. Stale alerts are deduplicated on `(quote, rateDate)`, looking back 90 days. |

## Follow-ups outside Partition B ownership

- **`.env.example`** (not mine to edit): add `FX_MONITOR_SECRET=`. Also change the `FX_SYNC_SECRET` comment, which still says fx-sync and fx-monitor share it.
- **Plan 01-16 deploy steps:** create Edge Function secret `FX_MONITOR_SECRET` and Vault row `fx_monitor_secret`, with a value different from `FX_SYNC_SECRET`. `docs/ops/fx-operations.md` is already updated.
- **Partition A (client), behaviours the server now enforces:**
  - `local_date` must fall between 1900-01-01 and one year ahead, else 23514.
  - `time_zone` must be an IANA zone, else 23514.
  - A custom currency whose per-EUR rate would round to zero or overflow is rejected (23514).
  - `customPerEur` now throws a RangeError in those same cases; `provisional.ts` should catch it (see IN-A02 and WR-A03).
  - Transactions now carry `orig_exp`/`home_exp`.
- **WR-B07 exact custom conversion:** needs a schema decision (store the unit value and reference rate per leg) and a generator extension.

## Verification

- pgTAP, full suite on a freshly reset local stack: 21 files, 305 tests, PASS.
- Jest `supabase/functions` + `src/engine`: 20 suites, 340 tests, PASS. engine/money coverage 100/100/100/100.
- Jest `src/data` + `src/db`: 144 tests, PASS. Nothing regressed from the `customPerEur` change.
- `npm run check:money-mirror`: up to date. `npm run lint`: 0 errors. `npm run typecheck`: pass.
- `npm run lint:migrations` and `npm run verify:migrations`: OK.
- `deno check` on all three Edge Function entry points: pass.

---

_Fixed: 2026-09-24_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
