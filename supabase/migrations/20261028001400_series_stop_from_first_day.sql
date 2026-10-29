-- 05.2-58 (F-13, D-24): a series can be stopped or paused from its first day.
-- Stopped from date F writes end_date = F - 1; for F = anchor_date that is the
-- day before the start, which the old check refused. end_date = anchor_date - 1
-- means the series counts from no day at all (materialise_series clamps its
-- through-date to end_date, which is before its floor, so no row is generated).
-- Anything earlier than anchor_date - 1 stays refused.
--
-- Additive in effect: the check is widened by one day. The wider check is added
-- and validated before the narrower one is dropped, so there is never a moment
-- without a check. Old app versions never write anchor_date - 1.

alter table public.recurring_series
  add constraint recurring_series_end_after_anchor_v2
  check (end_date is null or end_date >= anchor_date - 1) not valid;

alter table public.recurring_series validate constraint recurring_series_end_after_anchor_v2;

alter table public.recurring_series drop constraint recurring_series_end_after_anchor;
