-- pgTAP: Phase 2.2 apply_patches / undo_log_fill / undo_replay extensions
-- (RESEARCH Pitfall 2 and Pattern 7; CONTEXT D-08, D-24).
--
-- Proves: the new client-writable columns patch through apply_patches; the
-- server-only keys (recurring_series.materialised_through,
-- households.horizon_month) are refused for clients and for client-recorded
-- undo steps, but rewind through a server-flagged step; a households op is
-- scope-checked; undoing an account soft delete restores it.

begin;
create extension if not exists pgtap with schema extensions;

select extensions.plan(23);

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@test.local', '{"full_name":"Alice Test"}', now(), now()),
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b@test.local', '{}', now(), now());

create temp table hh as select owner_id, id from public.households;
grant select on hh to authenticated;

-- Fixtures as postgres: A's accounts, a category, a series and a horizon.
insert into public.accounts (id, household_id, name, kind, currency, opening_balance) values
  ('a1111111-1111-1111-1111-111111111111', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'Wallet', 'cash', 'USD', 0),
  ('a2222222-2222-2222-2222-222222222222', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'Spare', 'cash', 'USD', 0);
insert into public.categories (id, owner_id, name, color_key)
values ('ca000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Groceries2', 'green');
insert into public.transactions (id, created_by, household_id, account_id, original_amount, original_currency, local_date, time_zone, name) values
  ('d1000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'a1111111-1111-1111-1111-111111111111', 500, 'USD', '2026-10-02', 'UTC', 'Money back');
insert into public.recurring_series (id, household_id, account_id, name, amount, currency, freq, anchor_date, time_zone, materialised_through)
values ('c1000000-0000-0000-0000-000000000001', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
  'a1111111-1111-1111-1111-111111111111', 'Rent', -1000, 'USD', 'monthly', '2026-10-01', 'UTC', '2026-12-31');
update public.households set horizon_month = '2026-12' where id = (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

-- 1-4. New transaction booleans.
select extensions.is(
  (public.apply_patches('[{"entity":"transactions","id":"d1000000-0000-0000-0000-000000000001","expectedVersion":1,"patch":{"is_refund":true}}]'::jsonb)) ->> 'status',
  'applied', 'is_refund patches through apply_patches');
select extensions.ok(
  (select is_refund from public.transactions where id = 'd1000000-0000-0000-0000-000000000001'), 'is_refund is stored');
select extensions.is(
  (public.apply_patches('[{"entity":"transactions","id":"d1000000-0000-0000-0000-000000000001","expectedVersion":2,"patch":{"is_automatic":true}}]'::jsonb)) ->> 'status',
  'applied', 'is_automatic patches through apply_patches');
select extensions.ok(
  (select is_automatic from public.transactions where id = 'd1000000-0000-0000-0000-000000000001'), 'is_automatic is stored');

-- 5-7. Category cap and series is_automatic.
select extensions.is(
  (public.apply_patches('[{"entity":"categories","id":"ca000000-0000-0000-0000-000000000001","expectedVersion":1,"patch":{"monthly_cap":50000}}]'::jsonb)) ->> 'status',
  'applied', 'monthly_cap patches through apply_patches');
select extensions.is(
  (select monthly_cap from public.categories where id = 'ca000000-0000-0000-0000-000000000001'), 50000::bigint, 'monthly_cap is stored');
select extensions.is(
  (public.apply_patches('[{"entity":"recurring_series","id":"c1000000-0000-0000-0000-000000000001","expectedVersion":1,"patch":{"is_automatic":true}}]'::jsonb)) ->> 'status',
  'applied', 'series is_automatic patches through apply_patches');

-- 8-11. Account soft delete through apply_patches with an undo step; then undo.
select extensions.is(
  (public.apply_patches(
    '[{"entity":"accounts","id":"a2222222-2222-2222-2222-222222222222","expectedVersion":1,"patch":{"deleted_at":"$now"}}]'::jsonb,
    '{"id":"e4000000-0000-0000-0000-000000000001","label_key":"deletedAccount","label_params":{},
      "ops":[{"entity":"accounts","id":"a2222222-2222-2222-2222-222222222222","expectedVersion":2,"patch":{"deleted_at":null}}]}'::jsonb
  )) ->> 'status',
  'applied', 'account soft delete applies with its undo step');
select extensions.isnt(
  (select deleted_at from public.accounts where id = 'a2222222-2222-2222-2222-222222222222'), null, 'the account is soft-deleted');
select extensions.is(
  (public.apply_undo_step('e4000000-0000-0000-0000-000000000001')) ->> 'status',
  'undone', 'undoing the soft delete succeeds');
select extensions.is(
  (select deleted_at from public.accounts where id = 'a2222222-2222-2222-2222-222222222222'), null, 'undo restores the account (deleted_at null)');

-- 12-16. Server-only keys are refused for a client.
select extensions.throws_ok(
  $$select public.apply_patches('[{"entity":"recurring_series","id":"c1000000-0000-0000-0000-000000000001","expectedVersion":2,"patch":{"materialised_through":"2026-01-31"}}]'::jsonb)$$,
  '22023', null, 'materialised_through is refused for a client call');
select extensions.throws_ok(
  $$select public.apply_patches(jsonb_build_array(jsonb_build_object('entity','households','id',(select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),'expectedVersion',1,'patch','{"horizon_month":null}'::jsonb)))$$,
  '22023', null, 'households.horizon_month is refused for a client call');
select extensions.throws_ok(
  $$select public.apply_patches('[{"entity":"transactions","id":"d1000000-0000-0000-0000-000000000001","expectedVersion":3,"patch":{"bogus_column":1}}]'::jsonb)$$,
  '22023', null, 'an unknown column still raises 22023');
select extensions.throws_ok(
  $$insert into public.undo_log (id, label_key, ops) values ('e4000000-0000-0000-0000-000000000002', 'x',
      jsonb_build_array(jsonb_build_object('entity','households','id',(select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),'expectedVersion',1,'patch','{"horizon_month":null}'::jsonb)))$$,
  '22023', null, 'a client-inserted step naming a households op is rejected');
select extensions.throws_ok(
  $$insert into public.undo_log (id, label_key, ops, allow_system_keys) values ('e4000000-0000-0000-0000-000000000003', 'x',
      '[{"entity":"transactions","id":"d1000000-0000-0000-0000-000000000001","expectedVersion":3,"patch":{"name":"x"}}]'::jsonb, true)$$,
  '42501', null, 'a client cannot set allow_system_keys');

-- 17-19. A server-flagged step rewinds the high-water marks.
reset role;
insert into public.undo_log (id, owner_id, label_key, ops, allow_system_keys)
select 'e4000000-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111', 'removedMonth',
  jsonb_build_array(
    jsonb_build_object('entity','households','id',h.id,'expectedVersion',h.version,'patch','{"horizon_month":null}'::jsonb),
    jsonb_build_object('entity','recurring_series','id',s.id,'expectedVersion',s.version,'patch','{"materialised_through":"2026-11-30"}'::jsonb)),
  true
from public.households h, public.recurring_series s
where h.id = (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111') and s.id = 'c1000000-0000-0000-0000-000000000001';

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
select extensions.is(
  (public.apply_undo_step('e4000000-0000-0000-0000-000000000004')) ->> 'status',
  'undone', 'a server-flagged step replays');
select extensions.is(
  (select horizon_month from public.households where id = (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111')),
  null, 'the household horizon is rewound');
select extensions.is(
  (select materialised_through from public.recurring_series where id = 'c1000000-0000-0000-0000-000000000001'),
  '2026-11-30'::date, 'the series high-water mark is rewound');

-- 20-21. Scope: a forged flagged step for B targeting A's household is refused.
reset role;
update public.households set horizon_month = '2026-12' where id = (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111');
insert into public.undo_log (id, owner_id, label_key, ops, allow_system_keys)
select 'e4000000-0000-0000-0000-000000000005', '22222222-2222-2222-2222-222222222222', 'forged',
  jsonb_build_array(jsonb_build_object('entity','households','id',h.id,'expectedVersion',h.version,'patch','{"horizon_month":"2030-01"}'::jsonb)),
  true
from public.households h where h.id = (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
select extensions.is(
  (public.apply_undo_step('e4000000-0000-0000-0000-000000000005')) ->> 'status',
  'refused', 'a forged step against another household is refused');
reset role;
select extensions.is(
  (select horizon_month from public.households where id = (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111')),
  '2026-12', 'the other household was not touched');

-- 22-23. The replay GUCs do not leak out of undo_replay.
select extensions.is(coalesce(current_setting('fincwin.undo_replay', true), ''), '', 'undo_replay gate is closed after replay');
select extensions.is(coalesce(current_setting('fincwin.system_restamp', true), ''), '', 'system_restamp is closed after replay');

select * from extensions.finish();
rollback;
