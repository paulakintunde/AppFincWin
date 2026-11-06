-- pgTAP: 05.4 M2/M3 -- accounts.overdraft_rate and debts.due_day, and apply_patches (the Undo path) for both.
-- Migration 20261103000200. Needs 20261016000100 .. 20261016000400, 20261024000100 and 20261028000100 .. 20261103000200.

begin;
create extension if not exists pgtap with schema extensions;

select extensions.plan(12);

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@test.local', '{}', now(), now()),
  ('33333333-3333-3333-3333-333333333333', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'c@test.local', '{}', now(), now());

create temp table hh as select owner_id, id from public.households;
grant select on hh to authenticated;

create function public.t82_ver(e text, i uuid) returns integer language plpgsql as $$
declare v integer;
begin
  execute format('select version from public.%I where id = $1', e) into v using i;
  return v;
end;
$$;
create function public.t82_ap(e text, i uuid, p jsonb) returns text language sql as $$
  select (public.apply_patches(jsonb_build_array(jsonb_build_object(
    'entity', e, 'id', i, 'expectedVersion', public.t82_ver(e, i), 'patch', p))) ->> 'status');
$$;

insert into public.accounts (id, household_id, name, kind, currency, opening_balance) values
  ('a8200000-0000-0000-0000-000000000001', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'Checking', 'checking', 'USD', 0),
  ('a8200000-0000-0000-0000-000000000002', (select id from hh where owner_id = '33333333-3333-3333-3333-333333333333'), 'Other checking', 'checking', 'USD', 0);
insert into public.debts (id, household_id, created_by, name, kind, currency) values
  ('d8200000-0000-0000-0000-000000000001', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), '11111111-1111-1111-1111-111111111111', 'Card', 'card', 'USD'),
  ('d8200000-0000-0000-0000-000000000002', (select id from hh where owner_id = '33333333-3333-3333-3333-333333333333'), '33333333-3333-3333-3333-333333333333', 'Other card', 'card', 'USD');

select extensions.has_column('public', 'accounts', 'overdraft_rate', 'accounts.overdraft_rate exists');
select extensions.has_column('public', 'debts', 'due_day', 'debts.due_day exists');
select extensions.col_is_null('public', 'accounts', 'overdraft_rate', 'overdraft_rate is nullable');
select extensions.col_hasnt_default('public', 'accounts', 'overdraft_rate', 'overdraft_rate is never defaulted');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

select extensions.throws_ok($$update public.accounts set overdraft_rate = '22%' where id = 'a8200000-0000-0000-0000-000000000001'$$,
  '23514', null, 'a rate with a percent sign is refused');
select extensions.throws_ok($$update public.debts set due_day = 0 where id = 'd8200000-0000-0000-0000-000000000001'$$,
  '23514', null, 'due_day 0 is refused');
select extensions.throws_ok($$update public.debts set due_day = 32 where id = 'd8200000-0000-0000-0000-000000000001'$$,
  '23514', null, 'due_day 32 is refused');

-- apply_patches sets and undoes both columns on an owned row.
select extensions.is(public.t82_ap('accounts', 'a8200000-0000-0000-0000-000000000001', '{"overdraft_rate":"39.9"}'),
  'applied', 'apply_patches sets overdraft_rate');
select extensions.is(public.t82_ap('accounts', 'a8200000-0000-0000-0000-000000000001', '{"overdraft_rate":null}'),
  'applied', 'apply_patches undoes overdraft_rate back to null');
select extensions.is(public.t82_ap('debts', 'd8200000-0000-0000-0000-000000000001', '{"due_day":15}'),
  'applied', 'apply_patches sets due_day');
select extensions.is(public.t82_ap('debts', 'd8200000-0000-0000-0000-000000000001', '{"due_day":null}'),
  'applied', 'apply_patches undoes due_day back to null');

-- Another household's row is refused.
select extensions.throws_ok($$select public.t82_ap('debts', 'd8200000-0000-0000-0000-000000000002', '{"due_day":5}')$$,
  null, null, 'apply_patches refuses a debt of another household');

select * from extensions.finish();
rollback;
