-- Corrective data fix (additive, idempotent; no schema change).
--
-- Upstream change: on or before 2026-10-07 Frankfurter v2
-- GET /v2/currencies began returning `end_date` as the latest date with data
-- for ACTIVE currencies too (e.g. AED end_date 2026-10-08). fx-sync copied
-- that straight into currencies.end_date, so all 166 rows ended up with an
-- end_date of 2026-09-29..2026-10-07. Phase 1 D-08 defines end_date as
-- "discontinued" (null while active), so the currency picker (end_date is
-- null) went empty for every user and fx-monitor skipped staleness checks.
--
-- fx-sync now maps an end_date to null unless it is more than 30 days before
-- the sync date. This migration applies the same rule to rows already
-- written: end_date within the last 30 days is not a discontinuation.
-- Genuinely discontinued currencies (older end dates) are untouched.
-- Re-running is a no-op.

update public.currencies
   set end_date = null
 where end_date >= current_date - 30;
