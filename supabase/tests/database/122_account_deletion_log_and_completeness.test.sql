-- pgTAP: Phase 10 plan 10-10 (ACC-10, DAT-04; D-19, D-20). The deletion log is written in the same transaction as the
-- auth.users delete (Pitfall 1), holds user ids only, never blocks a delete, prunes at 35 days; and after a deletion no
-- uuid person column in any public table still names the deleted user.

begin;
create extension if not exists pgtap with schema extensions;

select extensions.plan(17);

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at) values
  ('20000000-0000-4000-8000-0000000000a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a122@test.local', '{"full_name":"A"}', now(), now()),
  ('20000000-0000-4000-8000-0000000000a2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b122@test.local', '{"full_name":"B"}', now(), now()),
  ('20000000-0000-4000-8000-0000000000a3', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'c122@test.local', '{"full_name":"C"}', now(), now());

create temp table ids as select (select id from public.households where owner_id = '20000000-0000-4000-8000-0000000000a1') as h;
grant select on ids to authenticated;

create function public.t122_val(q text) returns text language plpgsql security definer as $$
declare v text;
begin execute q into v; return v; end;
$$;

-- B joins A's household, A joined first.
update public.household_members set created_at = now() - interval '2 days', weight = 60 where user_id = '20000000-0000-4000-8000-0000000000a1';
insert into public.household_members (household_id, user_id, is_owner, weight, created_at, display_name)
  values ((select h from ids), '20000000-0000-4000-8000-0000000000a2', false, 40, now() - interval '1 day', 'Bea');

-- A's rows: personal and shared accounts, lines, a series, a loan.
insert into public.accounts (id, household_id, created_by, name, kind, currency, opening_balance, is_shared) values
  ('a1220000-0000-4000-8000-00000000000a', (select h from ids), '20000000-0000-4000-8000-0000000000a1', 'A personal', 'checking', 'USD', 0, false),
  ('a1220000-0000-4000-8000-00000000000b', (select h from ids), '20000000-0000-4000-8000-0000000000a1', 'Joint', 'checking', 'USD', 0, true);
insert into public.transactions (id, household_id, created_by, account_id, original_amount, original_currency, local_date, time_zone, name, status) values
  ('d1220000-0000-4000-8000-000000000001', (select h from ids), '20000000-0000-4000-8000-0000000000a1', 'a1220000-0000-4000-8000-00000000000a', -700, 'USD', current_date, 'UTC', 'P1 personal', 'paid'),
  ('d1220000-0000-4000-8000-000000000002', (select h from ids), '20000000-0000-4000-8000-0000000000a1', 'a1220000-0000-4000-8000-00000000000b', -1200, 'USD', current_date, 'UTC', 'J1 joint', 'paid');
insert into public.recurring_series (id, household_id, created_by, account_id, name, amount, currency, freq, anchor_date, time_zone)
  values ('e1220000-0000-4000-8000-000000000001', (select h from ids), '20000000-0000-4000-8000-0000000000a1', 'a1220000-0000-4000-8000-00000000000a', 'A bill', -500, 'USD', 'monthly', current_date - 10, 'UTC');
insert into public.debts (id, household_id, created_by, name, kind, currency)
  values ('d2220000-0000-4000-8000-000000000001', (select h from ids), '20000000-0000-4000-8000-0000000000a1', 'Loan', 'loan', 'USD');
-- 10-review S-3: store webhook events keyed by A (text id), one naming A only inside the payload, and one for B.
insert into public.plan_events (rc_event_id, type, app_user_id, environment, payload) values
  ('ev122-a', 'INITIAL_PURCHASE', '20000000-0000-4000-8000-0000000000a1', 'SANDBOX', '{"event":{"app_user_id":"20000000-0000-4000-8000-0000000000a1"}}'),
  ('ev122-t', 'TRANSFER', null, 'SANDBOX', '{"event":{"transferred_from":["20000000-0000-4000-8000-0000000000a1"],"transferred_to":["x"]}}'),
  ('ev122-b', 'INITIAL_PURCHASE', '20000000-0000-4000-8000-0000000000a2', 'SANDBOX', '{"event":{"app_user_id":"20000000-0000-4000-8000-0000000000a2"}}');

-- 1. Log table: shape and privacy ---------------------------------------------------------------------------------
select extensions.has_table('public', 'account_deletion_log', 'account_deletion_log exists');
select extensions.is((select relrowsecurity from pg_class where oid = 'public.account_deletion_log'::regclass), true, 'RLS is on');
select extensions.is(has_table_privilege('authenticated', 'public.account_deletion_log', 'select'), false, 'authenticated cannot read the log');
select extensions.is(has_table_privilege('anon', 'public.account_deletion_log', 'select'), false, 'anon cannot read the log');

-- 2. Atomic with the delete ---------------------------------------------------------------------------------------
savepoint sp_c;
delete from auth.users where id = '20000000-0000-4000-8000-0000000000a3';
select extensions.is(public.t122_val('select count(*) from public.account_deletion_log where user_id = ''20000000-0000-4000-8000-0000000000a3'''), '1', 'deleting C logs C');
rollback to savepoint sp_c;
select extensions.is(public.t122_val('select count(*) from public.account_deletion_log where user_id = ''20000000-0000-4000-8000-0000000000a3'''), '0', 'a rolled-back delete leaves no log row');
select extensions.is(public.t122_val('select count(*) from auth.users where id = ''20000000-0000-4000-8000-0000000000a3'''), '1', 'and C still exists');

-- 3. Delete A: logged once, completeness sweep, Phase 8 rules -----------------------------------------------------
select extensions.lives_ok($$delete from auth.users where id = '20000000-0000-4000-8000-0000000000a1'$$, 'deleting A succeeds');
select extensions.is(public.t122_val('select count(*) from public.account_deletion_log where user_id = ''20000000-0000-4000-8000-0000000000a1'''), '1', 'A is in the log exactly once');

select extensions.lives_ok($$
  do $d$
  declare
    r record;
    n bigint;
  begin
    for r in
      select c.table_name, c.column_name
        from information_schema.columns c
        join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name and t.table_type = 'BASE TABLE'
       where c.table_schema = 'public' and c.data_type = 'uuid'
         and c.column_name in ('user_id', 'owner_id', 'created_by', 'updated_by', 'paid_by', 'actor_id', 'subject_id',
                               'partner_id', 'member_id', 'payer_id', 'from_id', 'to_id')
         and c.table_name <> 'account_deletion_log'
    loop
      execute format('select count(*) from public.%I where %I = $1', r.table_name, r.column_name)
        into n using '20000000-0000-4000-8000-0000000000a1'::uuid;
      if n > 0 then
        raise exception 'completeness: %.% still names the deleted user (% rows)', r.table_name, r.column_name, n;
      end if;
    end loop;
  end
  $d$
$$, 'no public person column still names A');

-- 10-review S-3: text columns can hold a user id too (plan_events.app_user_id is the store's text id).
select extensions.lives_ok($$
  do $d$
  declare
    r record;
    n bigint;
  begin
    for r in
      select c.table_name, c.column_name
        from information_schema.columns c
        join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name and t.table_type = 'BASE TABLE'
       where c.table_schema = 'public' and c.data_type in ('text', 'character varying')
    loop
      execute format('select count(*) from public.%I where %I = $1', r.table_name, r.column_name)
        into n using '20000000-0000-4000-8000-0000000000a1';
      if n > 0 then
        raise exception 'completeness: %.% (text) still names the deleted user (% rows)', r.table_name, r.column_name, n;
      end if;
    end loop;
  end
  $d$
$$, 'no public text column still holds A''s id');
select extensions.is(public.t122_val('select count(*) from public.plan_events where rc_event_id in (''ev122-a'', ''ev122-t'')'), '0', 'store events naming A are gone, including one naming A only in its payload');
select extensions.is(public.t122_val('select count(*) from public.plan_events where rc_event_id = ''ev122-b'''), '1', 'B''s store event stays');

select extensions.is(public.t122_val('select owner_id::text from public.households where id = (select h from ids)'), '20000000-0000-4000-8000-0000000000a2', 'ownership passed to B');
select extensions.is(public.t122_val('select count(*) from public.transactions where name = ''J1 joint'' and created_by is null'), '1', 'the shared line stays as Former member');

-- 4. Prune --------------------------------------------------------------------------------------------------------
insert into public.account_deletion_log (user_id, deleted_at) values
  ('20000000-0000-4000-8000-0000000000b1', now() - interval '36 days'),
  ('20000000-0000-4000-8000-0000000000b2', now() - interval '1 day');
select extensions.is(public.prune_account_deletion_log(), 1, 'prune removes the 36-day-old row');
select extensions.is(public.t122_val('select count(*) from public.account_deletion_log where user_id = ''20000000-0000-4000-8000-0000000000b2'''), '1', 'and keeps the 1-day-old row');

select * from extensions.finish();
rollback;
