-- pgTAP: 05.2-39 -- recurring_series.end_reason (D-24 Stopped / Paused) and debts.paid_off_on (owner addition 2026-10-28):
-- column shape, write paths (apply_patches, edit_recurring_series_from, the debts column grant), the in-place resume path,
-- one replay-safe undo step per pause / resume, and erasure.
--
-- Needs 20261028001200

begin;
create extension if not exists pgtap with schema extensions;

select extensions.plan(46);

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@test.local', '{}', now(), now()),
  ('33333333-3333-3333-3333-333333333333', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'c@test.local', '{}', now(), now());

create temp table hh as select owner_id, id from public.households;
grant select on hh to authenticated;

create function public.t71_ver(e text, i uuid) returns integer language plpgsql security definer set search_path = '' as $$
declare v integer;
begin
  execute format('select version from public.%I where id = $1', e) using i into v;
  return v;
end;
$$;
create function public.t71_ap(e text, i uuid, p jsonb) returns text language sql as $$
  select (public.apply_patches(jsonb_build_array(jsonb_build_object(
    'entity', e, 'id', i, 'expectedVersion', public.t71_ver(e, i), 'patch', p))) ->> 'status');
$$;

-- Fixtures, written as the table owner. A0 is the first of the month two months back.
insert into public.accounts (id, household_id, name, kind, currency, opening_balance) values
  ('a7100000-0000-0000-0000-000000000001', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'Checking', 'checking', 'USD', 0);

insert into public.recurring_series (id, household_id, created_by, account_id, category_id, name, amount, currency, freq, anchor_date, end_date, time_zone) values
  ('5e710000-0000-0000-0000-000000000001', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
   '11111111-1111-1111-1111-111111111111', 'a7100000-0000-0000-0000-000000000001',
   (select id from public.categories where owner_id = '11111111-1111-1111-1111-111111111111' and builtin_key = 'Groceries'),
   'Apply patches series', -5000, 'USD', 'monthly', (date_trunc('month', current_date) - interval '2 months')::date,
   (date_trunc('month', current_date) - interval '2 months')::date + 10, 'UTC'),
  ('5e710000-0000-0000-0000-000000000002', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
   '11111111-1111-1111-1111-111111111111', 'a7100000-0000-0000-0000-000000000001',
   (select id from public.categories where owner_id = '11111111-1111-1111-1111-111111111111' and builtin_key = 'Groceries'),
   'Paused series', -5000, 'USD', 'monthly', (date_trunc('month', current_date) - interval '2 months')::date,
   (date_trunc('month', current_date) - interval '2 months')::date + 10, 'UTC'),
  ('5e710000-0000-0000-0000-000000000003', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
   '11111111-1111-1111-1111-111111111111', 'a7100000-0000-0000-0000-000000000001',
   (select id from public.categories where owner_id = '11111111-1111-1111-1111-111111111111' and builtin_key = 'Groceries'),
   'Live series', -5000, 'USD', 'monthly', (date_trunc('month', current_date) - interval '2 months')::date, null, 'UTC');
update public.recurring_series set end_reason = 'paused' where id = '5e710000-0000-0000-0000-000000000002';

insert into public.debts (id, household_id, created_by, name, kind, currency) values
  ('d7100000-0000-0000-0000-000000000001', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
   '11111111-1111-1111-1111-111111111111', 'Card', 'card', 'USD');

-- (a) column shape
select extensions.col_type_is('public', 'recurring_series', 'end_reason', 'text', 'end_reason is text');
select extensions.col_is_null('public', 'recurring_series', 'end_reason', 'end_reason is nullable');
-- (h) debts.paid_off_on shape
select extensions.col_type_is('public', 'debts', 'paid_off_on', 'date', 'paid_off_on is a date');
select extensions.col_is_null('public', 'debts', 'paid_off_on', 'paid_off_on is nullable');
select extensions.is(
  (select paid_off_on from public.debts where id = 'd7100000-0000-0000-0000-000000000001'), null,
  'a freshly inserted debt is not paid off');

-- (b) the check
select extensions.throws_ok(
  $$update public.recurring_series set end_reason = 'other' where id = '5e710000-0000-0000-0000-000000000001'$$,
  '23514', null, 'end_reason refuses an unknown value');
select extensions.lives_ok(
  $$update public.recurring_series set end_reason = 'stopped' where id = '5e710000-0000-0000-0000-000000000001'$$,
  'end_reason accepts stopped');
update public.recurring_series set end_reason = null where id = '5e710000-0000-0000-0000-000000000001';

-- (c) as A, apply_patches
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

create temp table v0 as select version from public.recurring_series where id = '5e710000-0000-0000-0000-000000000001';
grant select on v0 to authenticated;

select extensions.is(
  public.t71_ap('recurring_series', '5e710000-0000-0000-0000-000000000001', '{"end_reason":"paused"}'::jsonb),
  'applied', 'apply_patches sets end_reason paused');
select extensions.is(
  (select end_reason from public.recurring_series where id = '5e710000-0000-0000-0000-000000000001'), 'paused',
  'end_reason is stored');
select extensions.is(
  (select version from public.recurring_series where id = '5e710000-0000-0000-0000-000000000001'), (select version + 1 from v0),
  'the write bumps the version');
select extensions.is(
  public.t71_ap('recurring_series', '5e710000-0000-0000-0000-000000000001', '{"end_reason":null}'::jsonb),
  'applied', 'apply_patches sets end_reason back to null');
select extensions.is(
  (select end_reason from public.recurring_series where id = '5e710000-0000-0000-0000-000000000001'), null,
  'end_reason is null again');
select extensions.throws_ok(
  $$select public.t71_ap('recurring_series', '5e710000-0000-0000-0000-000000000001', '{"end_reason":"other"}'::jsonb)$$,
  '23514', null, 'apply_patches end_reason other fails the column check');

-- (e) no direct client write
select extensions.throws_ok(
  $$update public.recurring_series set end_reason = 'paused' where id = '5e710000-0000-0000-0000-000000000001'$$,
  '42501', null, 'a direct client update of end_reason is refused');

-- (i) paid_off_on direct write and the Undo path
create temp table dv0 as select version from public.debts where id = 'd7100000-0000-0000-0000-000000000001';
grant select on dv0 to authenticated;
select extensions.lives_ok(
  $$update public.debts set paid_off_on = '2026-10-01' where id = 'd7100000-0000-0000-0000-000000000001'$$,
  'a household member can set paid_off_on directly');
select extensions.is(
  (select paid_off_on from public.debts where id = 'd7100000-0000-0000-0000-000000000001'), '2026-10-01'::date,
  'paid_off_on is stored');
select extensions.cmp_ok(
  (select version from public.debts where id = 'd7100000-0000-0000-0000-000000000001'), '>', (select version from dv0),
  'the debt write bumps the version');
select extensions.is(
  public.t71_ap('debts', 'd7100000-0000-0000-0000-000000000001', '{"paid_off_on":null}'::jsonb),
  'applied', 'apply_patches restores paid_off_on to null');
select extensions.is(
  (select paid_off_on from public.debts where id = 'd7100000-0000-0000-0000-000000000001'), null,
  'paid_off_on is null again');
select extensions.is(
  public.t71_ap('debts', 'd7100000-0000-0000-0000-000000000001', '{"paid_off_on":"2026-09-15"}'::jsonb),
  'applied', 'apply_patches can set paid_off_on to a date');

-- (j) a non-date value
select extensions.throws_ok(
  $$select public.t71_ap('debts', 'd7100000-0000-0000-0000-000000000001', '{"paid_off_on":"not-a-date"}'::jsonb)$$,
  '22007', null, 'apply_patches refuses a non-date paid_off_on');

-- (f) resume path: paused series, anchor moved to the resume date, end_date cleared, gap not materialised
create temp table r as select (date_trunc('month', current_date) - interval '1 month')::date as resume_on;
grant select on r to authenticated;
select extensions.is(
  (public.edit_recurring_series_from(
     '5e710000-0000-0000-0000-000000000002'::uuid, public.t71_ver('recurring_series', '5e710000-0000-0000-0000-000000000002'),
     jsonb_build_object('anchor_date', (select resume_on from r), 'end_date', null, 'end_reason', null),
     (select resume_on from r)) ->> 'status'),
  'applied', 'resume: edit_recurring_series_from applies');
select extensions.is(
  (select end_date from public.recurring_series where id = '5e710000-0000-0000-0000-000000000002'), null,
  'resume: end_date is cleared');
select extensions.is(
  (select anchor_date from public.recurring_series where id = '5e710000-0000-0000-0000-000000000002'), (select resume_on from r),
  'resume: anchor_date is the resume date');
select extensions.is(
  (select end_reason from public.recurring_series where id = '5e710000-0000-0000-0000-000000000002'), null,
  'resume: end_reason is cleared');
select extensions.is(
  (select count(*)::int from public.transactions t
    where t.recurring_series_id = '5e710000-0000-0000-0000-000000000002'
      and t.local_date > (date_trunc('month', current_date) - interval '2 months')::date + 10
      and t.local_date < (select resume_on from r)),
  0, 'resume: nothing is materialised in the gap');

-- (k) pause and Undo through edit_recurring_series_from on a live series
create temp table p as select (date_trunc('month', current_date) - interval '1 month')::date as d;
grant select on p to authenticated;
select extensions.is(
  (public.edit_recurring_series_from(
     '5e710000-0000-0000-0000-000000000003'::uuid, public.t71_ver('recurring_series', '5e710000-0000-0000-0000-000000000003'),
     jsonb_build_object('end_date', (select d - 1 from p), 'end_reason', 'paused'),
     (select d from p),
     jsonb_build_object('id', 'e7100000-0000-0000-0000-0000000000a1', 'label_key', 'pauseSeries')) ->> 'status'),
  'applied', 'pause: edit_recurring_series_from applies with an undo step');
select extensions.is(
  (select end_date from public.recurring_series where id = '5e710000-0000-0000-0000-000000000003'), (select d - 1 from p),
  'pause: end_date is set');
select extensions.is(
  (select end_reason from public.recurring_series where id = '5e710000-0000-0000-0000-000000000003'), 'paused',
  'pause: end_reason is paused');
select extensions.is(
  (select ops -> -1 -> 'patch' -> 'end_reason' from public.undo_log where id = 'e7100000-0000-0000-0000-0000000000a1'),
  'null'::jsonb, 'pause: the undo op restores end_reason null');
select extensions.is(
  (select ops -> -1 -> 'patch' -> 'end_date' from public.undo_log where id = 'e7100000-0000-0000-0000-0000000000a1'),
  'null'::jsonb, 'pause: the undo op restores end_date null');
select extensions.is(
  (public.apply_patches(jsonb_build_array((select ops -> -1 from public.undo_log where id = 'e7100000-0000-0000-0000-0000000000a1'))) ->> 'status'),
  'applied', 'pause: the undo op applies through apply_patches');
select extensions.is(
  (select end_date::text || coalesce(end_reason, '-') from public.recurring_series where id = '5e710000-0000-0000-0000-000000000003'),
  null, 'pause: after Undo end_date and end_reason are both null');

-- (l) resume clears end_reason and its undo step restores paused with the old end_date and anchor_date
select public.t71_ap('recurring_series', '5e710000-0000-0000-0000-000000000003', jsonb_build_object('end_date', (select d - 1 from p), 'end_reason', 'paused'));
select extensions.is(
  (public.edit_recurring_series_from(
     '5e710000-0000-0000-0000-000000000003'::uuid, public.t71_ver('recurring_series', '5e710000-0000-0000-0000-000000000003'),
     jsonb_build_object('anchor_date', (select d from p), 'end_date', null, 'end_reason', null),
     (select d from p),
     jsonb_build_object('id', 'e7100000-0000-0000-0000-0000000000a2', 'label_key', 'resumeSeries')) ->> 'status'),
  'applied', 'resume: applies with an undo step');
select extensions.is(
  (select end_reason from public.recurring_series where id = '5e710000-0000-0000-0000-000000000003'), null,
  'resume: end_reason is null afterwards');
select extensions.is(
  (select ops -> -1 -> 'patch' ->> 'end_reason' from public.undo_log where id = 'e7100000-0000-0000-0000-0000000000a2'),
  'paused', 'resume: the undo op restores paused');
select extensions.is(
  (select ops -> -1 -> 'patch' ->> 'end_date' from public.undo_log where id = 'e7100000-0000-0000-0000-0000000000a2'),
  (select (d - 1)::text from p), 'resume: the undo op restores the old end_date');
select extensions.is(
  (select ops -> -1 -> 'patch' ->> 'anchor_date' from public.undo_log where id = 'e7100000-0000-0000-0000-0000000000a2'),
  ((date_trunc('month', current_date) - interval '2 months')::date)::text, 'resume: the undo op restores the old anchor_date');

-- (m) unknown key and bad value through the RPC
select extensions.throws_ok(
  $$select public.edit_recurring_series_from('5e710000-0000-0000-0000-000000000003'::uuid, public.t71_ver('recurring_series', '5e710000-0000-0000-0000-000000000003'), '{"bogus":1}'::jsonb, current_date)$$,
  '22023', null, 'an unknown patch key is still refused');
select extensions.throws_ok(
  $$select public.edit_recurring_series_from('5e710000-0000-0000-0000-000000000003'::uuid, public.t71_ver('recurring_series', '5e710000-0000-0000-0000-000000000003'), '{"end_reason":"other"}'::jsonb, current_date)$$,
  '23514', null, 'end_reason other in the RPC patch fails the column check');

-- (d) a member of another household is refused
select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true);
select extensions.throws_ok(
  $$select public.t71_ap('recurring_series', '5e710000-0000-0000-0000-000000000001', '{"end_reason":"paused"}'::jsonb)$$,
  '42501', null, 'another household cannot write end_reason');
select extensions.throws_ok(
  $$select public.t71_ap('debts', 'd7100000-0000-0000-0000-000000000001', '{"paid_off_on":"2026-10-01"}'::jsonb)$$,
  '42501', null, 'another household cannot write paid_off_on');
update public.debts set paid_off_on = '2026-10-02' where id = 'd7100000-0000-0000-0000-000000000001';

-- (g) erasure
reset role;
select extensions.is(
  (select paid_off_on from public.debts where id = 'd7100000-0000-0000-0000-000000000001'), '2026-09-15'::date,
  'another household cannot update paid_off_on directly');
select extensions.lives_ok($$delete from auth.users where id = '11111111-1111-1111-1111-111111111111'$$, 'deleting the owner succeeds');
select extensions.is((select count(*)::int from public.recurring_series where id::text like '5e710000%'), 0, 'the series rows are erased');
select extensions.is((select count(*)::int from public.debts where id = 'd7100000-0000-0000-0000-000000000001'), 0, 'the debt row is erased');

select * from extensions.finish();
rollback;
