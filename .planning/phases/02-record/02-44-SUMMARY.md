---
phase: 02-record
plan: 44
subsystem: api
tags: [fx, edge-function, supabase, resolve-rate, mon-11]
requires: [02-41, 02-43]
provides:
  - resolve-rate as the single on-demand FX fetch path (request shapes A, B, C)
  - _shared/fx/witness.ts confirmWithWitness (ported WR-B03 match)
  - resolve-rate/notify.ts throttled operator email
affects: [02-46, 02-47, 02-49, 02-50]
key-files:
  created:
    - supabase/functions/_shared/fx/witness.ts
    - supabase/functions/_shared/fx/witness.test.ts
    - supabase/functions/resolve-rate/notify.ts
    - supabase/functions/resolve-rate/notify.test.ts
  modified:
    - supabase/functions/resolve-rate/resolve.ts
    - supabase/functions/resolve-rate/resolve.test.ts
    - supabase/functions/resolve-rate/index.ts
key-decisions:
  - "PRIOR_WINDOW_DAYS = 7, WITNESS_WINDOW_DAYS = 2"
  - "One lookup per (quote, requested date): the accepted row's wins over a confirmed older hold's"
  - "Held value = failed fetch (reason 'held', 6h back-off) but alerts only via its own 'held' alert"
requirements-completed: [MON-05, MON-06, MON-10, MON-11, MON-12, ENV-08]
completed: 2026-10-08
---

# Phase 2 Plan 44: On-demand FX in resolve-rate Summary

resolve-rate now fetches only what is neither covered nor backing off, with one Frankfurter request per distinct date, an open.er-api fallback, coverage and failure records, the MON-11 hold with an open.er-api second-source witness, lazy hold auto-accept and failure-only throttled operator email.

## Commits
- f94c7e8 test(02-44): failing tests (RED confirmed: 24 of 42 failing)
- d5706cd feat(02-44): shapes A/B/C, fetch planning, fallback, coverage, failures (GREEN, 42/42)
- bb82584 feat(02-44): witness.ts + open holds + witness confirmation (49/49 resolve, 5 witness)
- (task 3) feat(02-44): notify.ts + index.ts wiring

## Rewritten existing resolve.test.ts cases (named, no others)
- "fetches the sorted, EUR-excluded quotes ..." , "drops rows for a quote that was not requested ...", "never serves a row whose (quote, date) has an open or dropped hold", "writes nothing ..."/held-USD "quarantines a >10% move ...": `upsertRates` expectation gained the `'frankfurter-v2'` second argument (the quarantine and blockedHolds cases only changed in that argument).
- Hold prior moved from `2019-12-01` to `2020-01-10` in "quarantines a >10% move ..." and "relaxes only the quotes whose backfilled row was actually stored ...".
- Added sibling "accepts the same 50% move when the only prior is 45 days old".
- No edit inside the two existing 502 cases; both still pass through the new fallback because fetchJson fails or garbles for both sources.
- `makeDeps` gained the new members with neutral defaults.

## Deviations from Plan
- [Process] witness.ts was written together with witness.test.ts, so a standalone RED run for the witness suite was not done (the resolve.ts witness tests were RED first: 4 failing before the implementation).
- [Minor] witness.ts imports `CONFIRM_TOLERANCE` (a constant) as a runtime import from `./plausibility.ts`, which itself has no runtime imports; the plan said type-only. Re-declaring the constant would risk drift.
- [Test fix] One witness test seeded a prior dated after the row (so no hold was created); moved the prior to 2026-09-30. Test-only.
- Held-value lookups use "one lookup per (quote, requested date)" de-duplication, because the table key would make a second row in the same upsert fail (ON CONFLICT affecting a row twice).
- Witness DB writes sit outside the try/catch (only the open.er-api fetch/match is swallowed), so a database fault still surfaces as 500 like every other DB error.

## Follow-up from 02-41: lookups after a DROPPED hold
Not changed here. Dropping is an operator SQL action, not a resolve-rate path, so resolve-rate cannot see it happen. After a drop the lookup naming the deleted rate is inert (coverage needs the referenced fx_rates row), so lines on that date stay provisional (nearest earlier rate, rate_pending = true, as pgTAP 15 assertion 5 now expects). Waiting is acceptable: the operator rejected that value on purpose; the (quote, date, source) stays blocked (CR-B02) so the same bad value is never re-served; the date is refetched after the 6-hour 'held' back-off, and if the provider republishes a sane value (or Frankfurter fails over to open.er-api) it is stored and the line becomes exact. Deleting the stale lookup in `fx_drop_hold` (SQL) would be the tidy fix if the orchestrator wants it; it is a one-line `delete from fx_rate_lookups where quote = ... and rate_date = ...` plus a pgTAP assertion, outside this plan's files.

## Verification
- `npx jest --ci supabase/functions src/i18n`: 10 suites, 1809 tests pass. `npm run typecheck` and `npm run depcruise` clean.
- Not run (per instructions): local Supabase stack / pgTAP. Suggested pgTAP check for the orchestrator after merge: call `fx_auto_accept_holds()` on a 3-day-old held row, confirm it returns the accepted hold with `quote` and `held_rate_date` columns (index.ts maps those names), and that `fx_quotes_needing_fetch` returns the quote again after a lookup with a stale `fetched_at`. Deno type-checking of index.ts is not exercised by Jest (it happens at deploy, 02-50).

## Known Stubs
None.

## Threat Flags
None beyond the plan's register: the new outbound POST to api.resend.com is T-02-44-04/05 (digest carries codes, dates and reasons only; secrets are never logged).

## Self-Check: PASSED
