---
phase: 02-record
plan: 41
subsystem: database
tags: [fx, supabase, pgtap, stamping]
requires: []
provides:
  - fx_rate_lookups and fx_rate_fetch_failures tables (service-role only)
  - fx_rate_covers(), fx_quotes_needing_fetch() (service_role only)
  - per_eur_rate() coverage-based exactness; is_iso_currency() accepts the active ISO 4217 set
affects: [02-42, 02-44, 02-45]
tech-stack:
  added: []
  patterns: [coverage lookup table instead of a fixed 7-day exact window, per-reason negative cache]
key-files:
  created:
    - supabase/migrations/20261007000400_fx_on_demand_stamping.sql
    - supabase/tests/database/40_fx_on_demand_stamping.test.sql
  modified:
    - supabase/tests/database/06_fx_stamping.test.sql
    - supabase/tests/database/13_restamp_window.test.sql
    - supabase/tests/database/14_custom_attribution.test.sql
    - supabase/tests/database/15_fx_drop_hold_repair.test.sql
    - supabase/tests/database/18_stamped_exponents.test.sql
    - supabase/tests/database/24_exact_custom_conversion.test.sql
    - supabase/tests/database/33_transfer_pairs.test.sql
key-decisions:
  - "Exact only from an own-date rate or an earlier row a recorded lookup names; the 7-day window only orders provisional values"
  - "Final lookup = requested_date <= fetched UTC date - 2; non-final counts for 1 hour"
  - "Negative cache windows: both-sources-failed 30 min, no-usable-rate/held 6 h"
requirements-completed: [MON-05, MON-06, MON-13]
duration: ~1h
completed: 2026-10-07
---

# Phase 2 Plan 41: On-demand FX stamping Summary

One forward migration (20261007000400) makes server-side stamping work without a daily rate feed: lookups record which stored rate is a date's publication, failures back off per reason, and every active ISO 4217 code is accepted without a stored rate.

## Commits
- 185b7e4 test(02-41): failing pgTAP (RED; confirmed failing: tables missing)
- 7525ebf feat(02-41): migration (GREEN; 40_fx_on_demand_stamping passes 40/40)
- 3345b7b test(02-41): existing pgTAP moved onto the coverage rule

## Existing pgTAP files edited (all other migrations untouched)
- 06_fx_stamping: added FINAL lookups for the 09-22 and 09-19 lines (incidental seed)
- 13_restamp_window: fresh lookups for the tomorrow-dated row (window semantics; header note added); final lookups for the fx_restamp_pending() block (restamp_pending block seed; block kept for 02-42 to remove)
- 14_custom_attribution, 18_stamped_exponents, 24_exact_custom_conversion, 33_transfer_pairs: final lookups next to the fx_rates seed (incidental seed)
- 15_fx_drop_hold_repair: assertion 5 flipped from exact to pending (window semantics). After a hold is dropped the lookup naming the deleted row is inert and the prior-date row (09-18) is not recorded as 09-22's publication, so the line is provisional until the next fetch. Plan 02-44 may want to delete lookups pointing at a dropped hold's date when dropping.

## Deviations from Plan
- Worktree base was not 29c9755 on start; reset to it per the branch check.
- Test 40's stale-lookup case was initially seeded wrong (row on the requested date counted as own-date); fixed within the GREEN commit by storing the rate at current_date - 2.
- Test 15 assertion change (above) is a semantic change rather than a seed addition; the plan allowed rewriting window-semantics assertions.

## Verification
Full pgTAP suite: 40 files, 740 tests pass. lint:migrations, verify:migrations, check:money-mirror, check:recurring-mirror all green. `supabase db reset --local` prints a transient storage health-check timeout; the database itself resets fine.

## Self-Check: PASSED
