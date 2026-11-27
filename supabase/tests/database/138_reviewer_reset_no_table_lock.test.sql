-- pgTAP: 10-review S-2 / S-5 (migration 20261127090400). reset_reviewer_account takes no table-wide lock, leaves every
-- trigger on, clears is_sample only through the owner path, and raises instead of reporting 'reset' after a failed wipe.

begin;
create extension if not exists pgtap with schema extensions;

select extensions.plan(12);

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values
  ('7e1e7e00-0000-4000-8000-00000000c001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rev138@example.test', '{"full_name":"Sample Reviewer"}', now(), now()),
  ('7e1e7e00-0000-4000-8000-00000000c002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rev138b@example.test', '{"full_name":"Sample Partner"}', now(), now());
insert into public.reviewer_allowlist (email, user_id, note) values
  ('rev138@example.test', '7e1e7e00-0000-4000-8000-00000000c001', 'reviewer'),
  ('rev138b@example.test', '7e1e7e00-0000-4000-8000-00000000c002', 'reviewer-partner');

create function public.t138_hid() returns uuid language sql stable as $$
  select id from public.households where owner_id = '7e1e7e00-0000-4000-8000-00000000c001'
$$;
grant execute on function public.t138_hid() to authenticated;

-- ------------------------------------------------------------------ S-2: no lock, triggers on
select extensions.is(public.reset_reviewer_account() ->> 'status', 'reset', 'the reset runs');
select extensions.is(
  (select count(*)::int from pg_locks l join pg_class c on c.oid = l.relation join pg_namespace n on n.oid = c.relnamespace
    where l.pid = pg_backend_pid() and l.mode = 'AccessExclusiveLock' and n.nspname = 'public'
      and c.relname in ('transactions', 'accounts', 'debts', 'decide_checks', 'savings_goals')),
  0, 'no ACCESS EXCLUSIVE lock on shared tables');
select extensions.is(
  (select count(*)::int from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and not t.tgisinternal and t.tgenabled = 'D'),
  0, 'no user trigger is left disabled');
select extensions.is(
  (select count(*)::int from public.transactions where household_id = public.t138_hid() and is_sample)
  + (select count(*)::int from public.accounts where household_id = public.t138_hid() and is_sample),
  0, 'the reviewer rows are no longer sample');
select extensions.is(
  (select count(*)::int from information_schema.columns c
     join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name
    where c.table_schema = 'public' and t.table_type = 'BASE TABLE' and c.column_name = 'is_sample'
      and not exists (select 1 from pg_trigger g where g.tgrelid = format('public.%I', c.table_name)::regclass
                        and g.tgname = 'zz_reviewer_reset_unsample')),
  0, 'every is_sample table has the unsample trigger');
select extensions.is(coalesce(current_setting('fincwin.reviewer_reset', true), ''), '', 'the setting is off after the reset');

-- ------------------------------------------------------------------ the owner path only
-- debts has a guard (guard_debt) that pins is_sample. Plant a sample flag past the guards (superuser only), then try to
-- clear it three ways. t138_writer stands in for any non-owner role that could write the table.
create temp table debt as select id from public.debts where household_id = public.t138_hid() order by created_at limit 1;
create role t138_writer;
grant t138_writer to current_user;
grant usage on schema public to t138_writer;
grant select, update on public.debts to t138_writer;
grant select on debt to t138_writer;
create policy t138_writer_all on public.debts for all to t138_writer using (true) with check (true);

set local session_replication_role = replica;
update public.debts set is_sample = true where id = (select id from debt);
set local session_replication_role = origin;

update public.debts set is_sample = false where id = (select id from debt);
select extensions.is((select is_sample from public.debts where id = (select id from debt)), true, 'without the setting the guard keeps the flag');

select set_config('fincwin.reviewer_reset', 'on', true);
set local role t138_writer;
update public.debts set is_sample = false where id = (select id from debt);
reset role;
select extensions.is((select is_sample from public.debts where id = (select id from debt)), true, 'a non-owner role with the setting on cannot clear the flag');

update public.debts set is_sample = false where id = (select id from debt);
select extensions.is((select is_sample from public.debts where id = (select id from debt)), false, 'the owner with the setting on can');
select set_config('fincwin.reviewer_reset', '', true);

select extensions.ok(
  not has_function_privilege('authenticated', 'public.reviewer_reset_unsample()', 'execute'),
  'authenticated cannot execute the trigger function');

-- ------------------------------------------------------------------ S-5: a wipe that fails raises
create table public.t138_block (household_id uuid);
create function public.t138_refuse() returns trigger language plpgsql as $$ begin raise exception 'refuse'; end $$;
create trigger t138_refuse before delete on public.t138_block for each row execute function public.t138_refuse();
insert into public.t138_block values (public.t138_hid());
select extensions.throws_ok($$ select public.reset_reviewer_account() $$, 'P0001',
  'reset_reviewer_account: 1 table(s) could not be wiped', 'a table that cannot be wiped stops the reset');
select extensions.is((select count(*)::int from public.t138_block), 1, 'and the failed reset changed nothing');

select * from extensions.finish();
rollback;
