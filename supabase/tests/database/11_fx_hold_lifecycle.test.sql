-- pgTAP: CR-B02 proof that an operator-dropped hold stays dropped.
--
-- fx-sync's hold upsert used to overwrite a dropped row back to 'held'
-- (keeping its original held_at), and fx_auto_accept_holds() then accepted
-- it at the next run -- silently undoing the operator's drop. A resolved
-- hold (confirmed, auto-accepted or dropped) is now terminal: only the
-- operator's drop may still change it, and auto-accept never touches a row
-- that has ever been resolved.

begin;
create extension if not exists pgtap with schema extensions;

select extensions.plan(6);

-- A hold held 3 days ago that the operator then dropped.
insert into public.fx_rate_holds (base, quote, held_rate, held_rate_date, source, status, held_at)
values ('EUR', 'JPY', 200, '2026-09-18', 'frankfurter-v2', 'held', now() - interval '3 days');
select public.fx_drop_hold((select id from public.fx_rate_holds where quote = 'JPY'));

-- 1. The next fx-sync re-reports the same (quote, date, source). This is
-- exactly what a PostgREST merge-duplicates upsert sends.
insert into public.fx_rate_holds (base, quote, held_rate, held_rate_date, source, prior_rate, prior_rate_date, change_ratio, status)
values ('EUR', 'JPY', 200, '2026-09-18', 'frankfurter-v2', 160, '2026-09-17', 0.25, 'held')
on conflict (quote, held_rate_date, source) do update
  set held_rate = excluded.held_rate,
      prior_rate = excluded.prior_rate,
      prior_rate_date = excluded.prior_rate_date,
      change_ratio = excluded.change_ratio,
      status = excluded.status;

select extensions.is(
  (select status from public.fx_rate_holds where quote = 'JPY'), 'dropped',
  'a merge-upsert cannot resurrect a dropped hold back to held'
);
select extensions.isnt(
  (select resolved_at from public.fx_rate_holds where quote = 'JPY'), null,
  'the dropped hold keeps its resolved_at'
);

-- 2. Even a row forced back to 'held' by a privileged writer (defence in
-- depth: resolved_at is still set) is never auto-accepted.
alter table public.fx_rate_holds disable trigger user;
update public.fx_rate_holds set status = 'held' where quote = 'JPY';
alter table public.fx_rate_holds enable trigger user;

select extensions.is(
  (select count(*) from public.fx_auto_accept_holds())::int, 0,
  'fx_auto_accept_holds() never accepts a hold that has already been resolved'
);
select extensions.is(
  (select count(*) from public.fx_rates where quote = 'JPY')::int, 0,
  'the dropped rate never reaches fx_rates'
);

-- 3. A confirmed hold cannot go back to held either, but the operator may
-- still drop it.
insert into public.fx_rate_holds (base, quote, held_rate, held_rate_date, source, status, resolved_at)
values ('EUR', 'NZD', 1.9, '2026-09-18', 'frankfurter-v2', 'confirmed', now());
update public.fx_rate_holds set status = 'held' where quote = 'NZD';
select extensions.is(
  (select status from public.fx_rate_holds where quote = 'NZD'), 'confirmed',
  'a confirmed hold cannot be moved back to held'
);
update public.fx_rate_holds set status = 'dropped', resolved_at = now() where quote = 'NZD';
select extensions.is(
  (select status from public.fx_rate_holds where quote = 'NZD'), 'dropped',
  'a confirmed hold can still be dropped by the operator'
);

select * from extensions.finish();
rollback;
