-- pgTAP: 10-25 (ACC-11, D-26) reset_reviewer_account, migration 20261126000800.

begin;
create extension if not exists pgtap with schema extensions;

select extensions.plan(13);

-- Without allow-list rows it does nothing.
select extensions.is(public.reset_reviewer_account() ->> 'status', 'skipped', 'no allow-list rows: skipped');

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values
  ('7e1e7e00-0000-4000-8000-00000000a001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rev@example.test', '{"full_name":"Sample Reviewer"}', now(), now()),
  ('7e1e7e00-0000-4000-8000-00000000a002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rev2@example.test', '{"full_name":"Sample Partner"}', now(), now()),
  ('7e1e7e00-0000-4000-8000-00000000b003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'other@example.test', '{"full_name":"Other Person"}', now(), now());

insert into public.reviewer_allowlist (email, user_id, note) values
  ('rev@example.test', '7e1e7e00-0000-4000-8000-00000000a001', 'reviewer'),
  ('rev2@example.test', '7e1e7e00-0000-4000-8000-00000000a002', 'reviewer-partner');

-- A household of the stranger with one account and a transaction-free state; its row counts must not move.
create temp table other_before as
select (select count(*) from public.accounts a join public.households h on h.id = a.household_id where h.owner_id = '7e1e7e00-0000-4000-8000-00000000b003') as accounts,
       (select count(*) from public.household_members m join public.households h on h.id = m.household_id where h.owner_id = '7e1e7e00-0000-4000-8000-00000000b003') as members;

select extensions.is(public.reset_reviewer_account() ->> 'status', 'reset', 'with both accounts listed: reset');

create function public.t128_hid() returns uuid language sql stable as $$
  select id from public.households where owner_id = '7e1e7e00-0000-4000-8000-00000000a001'
$$;

select extensions.ok(
  (select count(distinct date_trunc('month', t.local_date)) from public.transactions t
    where t.household_id = public.t128_hid() and t.local_date < date_trunc('month', current_date)) >= 3,
  'transactions in at least 3 distinct past months');
select extensions.ok((select count(*) from public.savings_goals where household_id = public.t128_hid()) >= 1, 'at least one savings goal');
select extensions.ok((select count(*) from public.debts where household_id = public.t128_hid()) >= 1, 'at least one debt');
select extensions.is((select count(*)::int from public.household_members where household_id = public.t128_hid()), 2, 'two household members');
select extensions.is(
  (select plan_key || '/' || status from public.household_plans where household_id = public.t128_hid()),
  'extended/promo', 'top plan, promotional');
select extensions.ok((select count(*) from public.transactions where household_id = public.t128_hid() and paid_by = '7e1e7e00-0000-4000-8000-00000000a002') >= 1,
  'the partner paid for at least one shared line');
select extensions.is(
  (select count(*)::int from public.transactions where household_id = public.t128_hid() and is_sample)
  + (select count(*)::int from public.accounts where household_id = public.t128_hid() and is_sample)
  + (select count(*)::int from public.debts where household_id = public.t128_hid() and is_sample)
  + (select count(*)::int from public.decide_checks where household_id = public.t128_hid() and is_sample),
  0, 'nothing is marked sample');

-- Idempotent: a second run gives the same counts.
create temp table first_run as
select (select count(*) from public.transactions where household_id = public.t128_hid()) as tx,
       (select count(*) from public.accounts where household_id = public.t128_hid()) as accounts,
       (select count(*) from public.debts where household_id = public.t128_hid()) as debts,
       (select count(*) from public.savings_goals where household_id = public.t128_hid()) as goals;
select public.reset_reviewer_account();
select extensions.is(
  (select row((select count(*) from public.transactions where household_id = public.t128_hid()),
              (select count(*) from public.accounts where household_id = public.t128_hid()),
              (select count(*) from public.debts where household_id = public.t128_hid()),
              (select count(*) from public.savings_goals where household_id = public.t128_hid()))::text),
  (select row(tx, accounts, debts, goals)::text from first_run),
  'a second reset yields the same counts');

select extensions.is(
  (select row(accounts, members)::text from other_before),
  (select row((select count(*) from public.accounts a join public.households h on h.id = a.household_id where h.owner_id = '7e1e7e00-0000-4000-8000-00000000b003'),
              (select count(*) from public.household_members m join public.households h on h.id = m.household_id where h.owner_id = '7e1e7e00-0000-4000-8000-00000000b003'))::text),
  'an unrelated user is untouched');

select extensions.ok(
  not exists (select 1 from public.profiles where id in ('7e1e7e00-0000-4000-8000-00000000a001', '7e1e7e00-0000-4000-8000-00000000a002') and decide_v3),
  'neither reviewer account has Decide testing on');
select extensions.ok(
  not has_function_privilege('authenticated', 'public.reset_reviewer_account()', 'execute')
  and not has_function_privilege('anon', 'public.reset_reviewer_account()', 'execute'),
  'authenticated and anon cannot run the reset');

select * from extensions.finish();
rollback;
