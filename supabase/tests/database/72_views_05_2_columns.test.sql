-- pgTAP: 05.2 fix -- transactions_active exposes income_kind, counts_as and refund_of, still hides soft-deleted rows, and
-- is readable (not writable) by authenticated.
--
-- Needs 20261028001300

begin;
create extension if not exists pgtap with schema extensions;

select extensions.plan(9);

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@test.local', '{}', now(), now());

create temp table hh as select owner_id, id from public.households;
grant select on hh to authenticated;

insert into public.accounts (id, household_id, name, kind, currency, opening_balance)
select 'a7200000-0000-0000-0000-000000000001', id, 'Checking', 'checking', 'USD', 0 from hh;

insert into public.transactions (id, household_id, created_by, account_id, original_amount, original_currency, local_date, time_zone, income_kind, counts_as)
select 'e7200000-0000-0000-0000-000000000001', id, owner_id, 'a7200000-0000-0000-0000-000000000001', 5000, 'USD', current_date, 'UTC', 'salary', 'available' from hh;
insert into public.transactions (id, household_id, created_by, account_id, original_amount, original_currency, local_date, time_zone, deleted_at)
select 'e7200000-0000-0000-0000-000000000002', id, owner_id, 'a7200000-0000-0000-0000-000000000001', -100, 'USD', current_date, 'UTC', now() from hh;

select extensions.has_column('public', 'transactions_active', 'income_kind', 'view has income_kind');
select extensions.has_column('public', 'transactions_active', 'counts_as', 'view has counts_as');
select extensions.has_column('public', 'transactions_active', 'refund_of', 'view has refund_of');
select extensions.has_column('public', 'transactions_active', 'goal_id', 'view still has goal_id');

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-1111-1111-111111111111', 'role', 'authenticated')::text, true);

select extensions.is((select count(*)::int from public.transactions_active), 1, 'view hides the soft-deleted row');
select extensions.is((select income_kind from public.transactions_active where id = 'e7200000-0000-0000-0000-000000000001'), 'salary', 'income_kind readable');
select extensions.is((select counts_as from public.transactions_active where id = 'e7200000-0000-0000-0000-000000000001'), 'available', 'counts_as readable');
select extensions.is((select refund_of from public.transactions_active where id = 'e7200000-0000-0000-0000-000000000001'), null, 'refund_of readable (null)');
select extensions.throws_ok($$update public.transactions_active set note = 'x'$$, '42501', null, 'view is not writable by authenticated');

select * from extensions.finish();
rollback;
