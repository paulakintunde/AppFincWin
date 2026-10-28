-- pgTAP: Phase 05.2 (D-05, D-22) -- saving buckets, envelope account, colour on savings_goals. Migration 20261028000700.
--
-- Needs 20261016000100 .. 20261016000400, 20261021000100, 20261024000100 and 20261028000700.

begin;
create extension if not exists pgtap with schema extensions;

select extensions.plan(18);

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@test.local', '{}', now(), now()),
  ('33333333-3333-3333-3333-333333333333', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'c@test.local', '{}', now(), now());

create temp table hh as select owner_id, id from public.households;
grant select on hh to authenticated;

insert into public.accounts (id, household_id, name, kind, currency, opening_balance) values
  ('a6700000-0000-0000-0000-000000000001', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'Savings', 'savings', 'USD', 0),
  ('a6700000-0000-0000-0000-000000000002', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'Spare', 'savings', 'USD', 0),
  ('a6700000-0000-0000-0000-000000000003', (select id from hh where owner_id = '33333333-3333-3333-3333-333333333333'), 'Other', 'checking', 'USD', 0);

-- Rows that existed before the change: an ordinary pot and a wait goal.
insert into public.savings_goals (id, household_id, created_by, kind, name, currency, target, ready_by) values
  ('b6700000-0000-0000-0000-000000000001', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
   '11111111-1111-1111-1111-111111111111', 'pot', 'Old pot', 'USD', 80000, current_date + 90);
select set_config('fincwin.decide_rpc', 'on', true);
insert into public.savings_goals (id, household_id, created_by, kind, name, currency, target, monthly_amount, ready_by) values
  ('b6700000-0000-0000-0000-000000000002', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
   '11111111-1111-1111-1111-111111111111', 'wait', 'Old wait', 'USD', 500000, 50000, current_date + 90);
select set_config('fincwin.decide_rpc', '', true);

select extensions.is(
  (select kind || '/' || target::text || '/' || coalesce(bucket, 'null') from public.savings_goals where id = 'b6700000-0000-0000-0000-000000000001'),
  'pot/80000/null', 'an existing pot reads unchanged (bucket null)');
select extensions.is(
  (select kind || '/' || monthly_amount::text || '/' || coalesce(bucket, 'null') from public.savings_goals where id = 'b6700000-0000-0000-0000-000000000002'),
  'wait/50000/null', 'an existing wait goal reads unchanged (bucket null)');

select extensions.throws_ok(
  $$insert into public.savings_goals (id, household_id, created_by, kind, name, currency)
    values ('b6700000-0000-0000-0000-000000000003', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
            '11111111-1111-1111-1111-111111111111', 'pot', 'No target', 'USD')$$,
  '23514', null, 'a pot with no target, no ready_by and no bucket is refused');
select extensions.lives_ok(
  $$insert into public.savings_goals (id, household_id, created_by, kind, name, currency, bucket, monthly_amount)
    values ('b6700000-0000-0000-0000-000000000004', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
            '11111111-1111-1111-1111-111111111111', 'pot', 'College', 'USD', 'college', 0)$$,
  'a bucket with no target, no date and a zero monthly amount is accepted');
select extensions.lives_ok(
  $$insert into public.savings_goals (id, household_id, created_by, kind, name, currency, bucket, monthly_amount, target)
    values ('b6700000-0000-0000-0000-000000000005', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
            '11111111-1111-1111-1111-111111111111', 'pot', 'House', 'USD', 'house', 20000, 3000000)$$,
  'a bucket with a monthly amount and a goal is accepted');
select set_config('fincwin.decide_rpc', 'on', true);
select extensions.throws_ok(
  $$insert into public.savings_goals (id, household_id, created_by, kind, name, currency, bucket, target, ready_by)
    values ('b6700000-0000-0000-0000-000000000006', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
            '11111111-1111-1111-1111-111111111111', 'wait', 'Wait bucket', 'USD', 'car', 1000, current_date + 30)$$,
  '23514', null, 'a bucket on a wait goal is refused');
select set_config('fincwin.decide_rpc', '', true);
select extensions.throws_ok(
  $$insert into public.savings_goals (id, household_id, created_by, kind, name, currency, bucket, monthly_amount)
    values ('b6700000-0000-0000-0000-000000000007', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
            '11111111-1111-1111-1111-111111111111', 'pot', 'Boat', 'USD', 'boat', 0)$$,
  '23514', null, 'a bucket kind outside the list is refused');

-- As A: monthly_amount lands on a bucket, is held on an ordinary pot.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

select extensions.lives_ok(
  $$update public.savings_goals set monthly_amount = 25000 where id = 'b6700000-0000-0000-0000-000000000004'$$,
  'a bucket monthly_amount update is accepted');
select extensions.is(
  (select monthly_amount from public.savings_goals where id = 'b6700000-0000-0000-0000-000000000004'),
  25000::bigint, 'the bucket monthly_amount landed');
select extensions.lives_ok(
  $$update public.savings_goals set monthly_amount = 777 where id = 'b6700000-0000-0000-0000-000000000001'$$,
  'an ordinary pot monthly_amount update does not error');
select extensions.is(
  (select monthly_amount from public.savings_goals where id = 'b6700000-0000-0000-0000-000000000001'),
  null::bigint, 'the guard reset the ordinary pot monthly_amount to its old value');

select extensions.lives_ok(
  $$update public.savings_goals set account_id = 'a6700000-0000-0000-0000-000000000001' where id = 'b6700000-0000-0000-0000-000000000004'$$,
  'an envelope may sit in an account of its household');
select extensions.throws_ok(
  $$update public.savings_goals set account_id = 'a6700000-0000-0000-0000-000000000003' where id = 'b6700000-0000-0000-0000-000000000004'$$,
  '42501', null, 'an envelope cannot sit in another household account');

select extensions.lives_ok(
  $t$do $b$ declare k text; begin
      foreach k in array array['green','slate','teal','blue','plum','rust','ochre'] loop
        update public.savings_goals set color_key = k where id = 'b6700000-0000-0000-0000-000000000004';
      end loop; end $b$$t$,
  'every swatch key is accepted');
select extensions.throws_ok(
  $$update public.savings_goals set color_key = 'pink' where id = 'b6700000-0000-0000-0000-000000000004'$$,
  '23514', null, 'a colour outside the swatch list is refused');

-- As the table owner: the bucket kind is immutable, account inserts are checked, account delete clears the link.
reset role;
update public.savings_goals set bucket = 'car' where id = 'b6700000-0000-0000-0000-000000000004';
select extensions.is(
  (select bucket from public.savings_goals where id = 'b6700000-0000-0000-0000-000000000004'),
  'college', 'a changed bucket kind is held to the original');
select extensions.throws_ok(
  $$insert into public.savings_goals (id, household_id, created_by, kind, name, currency, bucket, monthly_amount, account_id)
    values ('b6700000-0000-0000-0000-000000000008', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
            '11111111-1111-1111-1111-111111111111', 'pot', 'Bad account', 'USD', 'trip', 0, 'a6700000-0000-0000-0000-000000000003')$$,
  '42501', null, 'an insert with another household account is refused');

update public.savings_goals set account_id = 'a6700000-0000-0000-0000-000000000002' where id = 'b6700000-0000-0000-0000-000000000005';
delete from public.accounts where id = 'a6700000-0000-0000-0000-000000000002';
select extensions.is(
  (select account_id from public.savings_goals where id = 'b6700000-0000-0000-0000-000000000005'),
  null::uuid, 'deleting the account sets the envelope account_id to null');

select * from extensions.finish();
rollback;
