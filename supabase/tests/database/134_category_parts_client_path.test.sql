-- pgTAP: Phase 10.1 plan 11 (D-01, SPL-01). The client read and insert path for category parts: transactions_active exposes
-- category_parts and item_split, a client may insert a line with valid parts (the guard trigger validates), a bad total is
-- refused, and a client cannot UPDATE category_parts or touch item_split directly.
-- Needs 20261127000100 and 20261127000300. Local stack only.

begin;
create extension if not exists pgtap with schema extensions;

select extensions.plan(8);

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@test.local', '{}', now(), now());

create temp table hh as select owner_id, id from public.households;
grant select on hh to authenticated;
create temp table cats as
  select builtin_key as k, id from public.categories where owner_id = '11111111-1111-1111-1111-111111111111' and builtin_key in ('Groceries', 'Dining');
grant select on cats to authenticated;

insert into public.accounts (id, household_id, name, kind, currency, opening_balance)
select 'a1340000-0000-0000-0000-000000000001', id, 'Checking', 'checking', 'USD', 0 from hh;

select extensions.has_column('public', 'transactions_active', 'category_parts', 'view has category_parts');
select extensions.has_column('public', 'transactions_active', 'item_split', 'view has item_split');

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-1111-1111-111111111111', 'role', 'authenticated')::text, true);

select extensions.lives_ok($$
  insert into public.transactions (id, household_id, account_id, original_amount, original_currency, local_date, time_zone, category_parts)
  select 'e1340000-0000-0000-0000-000000000001', hh.id, 'a1340000-0000-0000-0000-000000000001', -5000, 'USD', current_date, 'UTC',
         jsonb_build_array(jsonb_build_object('c', (select id from cats where k = 'Groceries'), 'a', -3000),
                           jsonb_build_object('c', (select id from cats where k = 'Dining'), 'a', -2000))
    from hh $$, 'a client can insert a line with parts');
select extensions.is((select category_id from public.transactions_active where id = 'e1340000-0000-0000-0000-000000000001'),
  (select id from cats where k = 'Groceries'), 'category_id follows the largest part');
select extensions.is((select jsonb_array_length(category_parts) from public.transactions_active where id = 'e1340000-0000-0000-0000-000000000001'),
  2, 'parts are readable through the view');

select extensions.throws_ok($$
  insert into public.transactions (id, household_id, account_id, original_amount, original_currency, local_date, time_zone, category_parts)
  select 'e1340000-0000-0000-0000-000000000002', hh.id, 'a1340000-0000-0000-0000-000000000001', -5000, 'USD', current_date, 'UTC',
         jsonb_build_array(jsonb_build_object('c', (select id from cats where k = 'Groceries'), 'a', -1000))
    from hh $$, 'PT001', null, 'parts that do not add up to the line are refused');

select extensions.throws_ok($$update public.transactions set category_parts = null where id = 'e1340000-0000-0000-0000-000000000001'$$,
  '42501', null, 'a client cannot update category_parts directly');
select extensions.throws_ok($$update public.transactions set item_split = '{}'::jsonb where id = 'e1340000-0000-0000-0000-000000000001'$$,
  '42501', null, 'a client cannot write item_split');

select * from extensions.finish();
rollback;
