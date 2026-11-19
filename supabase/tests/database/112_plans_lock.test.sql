-- pgTAP: Phase 9 read-only lock (09-03). Needs 20261124000100 and 20261124000200.
-- D-02 / D-40 the server refuses records writes (PT402) when a household is not covered, including writes made through
-- SECURITY DEFINER RPCs; D-03 profile/setup/switch writes stay open; D-17b the sample RPCs bypass; D-29 tester backfill.

begin;
create extension if not exists pgtap with schema extensions;

select extensions.plan(26);

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@test.local', '{"full_name":"Ann Test"}', now(), now()),
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b@test.local', '{"full_name":"Bob Test"}', now(), now());

create temp table ids as select (select id from public.households where owner_id = '11111111-1111-1111-1111-111111111111') as h;
grant select on ids to authenticated;

create function public.t112_as(u text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true)
$$;
create function public.t112_plan(p_status text, p_covered timestamptz) returns void language plpgsql as $$
begin
  delete from public.household_plans where household_id = (select h from ids);
  insert into public.household_plans (household_id, payer_id, store, plan_size, status, covered_until, plan_key, period)
  values ((select h from ids), '11111111-1111-1111-1111-111111111111', 'APP_STORE', 2, p_status, p_covered, 'duo', 'month');
end;
$$;

-- Records written while the household is still writable (prelaunch default; no jwt claims so the trigger lets the setup through).
insert into public.accounts (id, household_id, created_by, name, kind, currency, opening_balance, is_shared) values
  ('a1120000-0000-0000-0000-000000000001', (select h from ids), '11111111-1111-1111-1111-111111111111', 'A personal', 'checking', 'USD', 0, false);
insert into public.debts (id, household_id, created_by, name, kind, currency, balance) values
  ('a1120000-0000-0000-0000-000000000002', (select h from ids), '11111111-1111-1111-1111-111111111111', 'A loan', 'loan', 'USD', 90000);
insert into public.transactions (id, household_id, created_by, account_id, original_amount, original_currency, local_date, time_zone, name, status, is_shared) values
  ('a1120000-0000-0000-0000-000000000003', (select h from ids), '11111111-1111-1111-1111-111111111111', 'a1120000-0000-0000-0000-000000000001', -1000, 'USD', current_date, 'UTC', 'Shop', 'paid', false);

-- B joins A's household (two members, USD reporting) so share_transaction gets past its own checks and reaches its write.
update public.household_members set created_at = now() - interval '2 days' where user_id = '11111111-1111-1111-1111-111111111111';
delete from public.household_members where user_id = '22222222-2222-2222-2222-222222222222';
insert into public.household_members (household_id, user_id, is_owner, weight, created_at)
values ((select h from ids), '22222222-2222-2222-2222-222222222222', false, 50, now() - interval '1 day');
update public.household_members set weight = 50 where user_id = '11111111-1111-1111-1111-111111111111';
update public.households set reporting_currency = 'USD' where id = (select h from ids);

-- 1. Coverage: every client-writable records table carries the plan_lock trigger.
-- Exclusions (one reason each): profiles, user_setup, feature_switches = D-03 stays writable while locked;
-- households, household_members, household_events, household_event_reads, household_invites, member_departures,
-- household_former_members, settlement_nudges = household admin and messaging, not records; household_plans, plan_events,
-- plan_products, plan_settings, trial_ledger, household_leave_log, plan_join_requests = plan state itself (server only);
-- decide_shadow_runs = consent-gated telemetry insert, not a user record.
select extensions.is_empty($$
  select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
     and exists (select 1 from pg_policies p
                  where p.schemaname = 'public' and p.tablename = c.relname
                    and p.cmd in ('INSERT','UPDATE','DELETE','ALL')
                    and (p.roles && array['authenticated','public']::name[]))
     and not exists (select 1 from pg_trigger t where t.tgrelid = c.oid and t.tgname = 'plan_lock')
     and c.relname not in ('profiles','user_setup','feature_switches','households','household_members','household_events',
       'household_event_reads','household_invites','member_departures','household_former_members','settlement_nudges',
       'plan_products','household_plans','plan_events','trial_ledger','household_leave_log','plan_join_requests',
       'plan_settings','decide_shadow_runs')
$$, 'every client-writable records table has the plan_lock trigger');

-- Lock the household: launch date passed, no plan row.
update public.plan_settings set paid_from = now() - interval '1 day', enforce_for = '{}';
select extensions.is(public.household_plan_state((select h from ids)), 'none', 'setup: the household is locked (no plan after paid_from)');

set local role authenticated;
select public.t112_as('11111111-1111-1111-1111-111111111111');

-- 3-8. Refusals. Each write uses only the columns the client is granted, the way the app writes them: a column the
-- client may not write fails the grant check (42501) before any trigger runs, which would hide the lock.
select extensions.throws_ok($$ insert into public.transactions (id, household_id, account_id, original_amount, original_currency, local_date, time_zone, name, status)
  values ('a1120000-0000-0000-0000-000000000009', (select h from ids), 'a1120000-0000-0000-0000-000000000001', -500, 'USD', current_date, 'UTC', 'Locked', 'paid') $$,
  'PT402', 'plan locked', 'locked: insert into transactions is refused');
select extensions.throws_ok($$ update public.accounts set name = 'Renamed' where id = 'a1120000-0000-0000-0000-000000000001' $$,
  'PT402', 'plan locked', 'locked: update accounts is refused');
select extensions.throws_ok($$ insert into public.categories (id, name, color_key) values ('a1120000-0000-0000-0000-000000000004', 'Locked cat', 'green') $$,
  'PT402', 'plan locked', 'locked: insert into categories (owner table, no household_id) is refused');
select extensions.throws_ok($$ insert into public.decide_checks (id, household_id, kind, name)
  values ('a1120000-0000-0000-0000-000000000005', (select h from ids), 'buy', 'Laptop') $$,
  'PT402', 'plan locked', 'locked: insert into decide_checks is refused');
select extensions.throws_ok($$ update public.debts set deleted_at = now() where id = 'a1120000-0000-0000-0000-000000000002' $$,
  'PT402', 'plan locked', 'locked: deleting a debt (the app sets deleted_at) is refused');
select extensions.throws_ok($$ select public.share_transaction('a1120000-0000-0000-0000-000000000003',
  (select version from public.transactions where id = 'a1120000-0000-0000-0000-000000000003'), 'even',
  array['11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222']::uuid[]) $$,
  'PT402', null, 'locked: a SECURITY DEFINER write RPC (share_transaction) is refused');

-- 9-12. Allowed while locked (D-03).
select extensions.lives_ok($$ update public.profiles set accent = 'green' where id = '11111111-1111-1111-1111-111111111111' $$,
  'locked: a profile (theme) change still works');
select extensions.lives_ok($$ insert into public.user_setup (user_id, level, level_source) values ('11111111-1111-1111-1111-111111111111', 2, 'answers')
  on conflict (user_id) do update set level = 3 $$, 'locked: setup answers still save');
select extensions.lives_ok($$ insert into public.feature_switches (user_id, feature_id, is_on) values ('11111111-1111-1111-1111-111111111111', 'decide.later', true) $$,
  'locked: a feature switch still saves');
select extensions.is((select count(*)::int from public.transactions), 1, 'locked: reading records still works');

-- 13. Service role / cron (auth.uid() is null) is not locked out.
reset role;
select set_config('request.jwt.claims', '', true);
select extensions.lives_ok($$ insert into public.transactions (id, household_id, created_by, account_id, original_amount, original_currency, local_date, time_zone, name, status, is_shared)
  values ('a1120000-0000-0000-0000-00000000000a', (select h from ids), '11111111-1111-1111-1111-111111111111', 'a1120000-0000-0000-0000-000000000001', -500, 'USD', current_date, 'UTC', 'Cron line', 'paid', false) $$,
  'locked: a write with no session (service role, cron) succeeds');

-- 14-17. Sample data bypass (D-17b), and the bypass does not leak into a later statement.
set local role authenticated;
select public.t112_as('11111111-1111-1111-1111-111111111111');
select extensions.lives_ok($$ select public.seed_sample_data((select h from ids), current_date) $$, 'locked: seed_sample_data works');
select extensions.throws_ok($$ insert into public.accounts (id, household_id, name, kind, currency, opening_balance, is_shared)
  values ('a1120000-0000-0000-0000-00000000000b', (select h from ids), 'After seed', 'checking', 'USD', 0, false) $$,
  'PT402', 'plan locked', 'the sample bypass does not leak: a real write right after seeding is still refused');
-- Make the sample lines two months old with no session (seed_sample_data only accepts a p_today within 2 days of today).
reset role;
select set_config('request.jwt.claims', '', true);
select set_config('fincwin.system_restamp', 'on', true);  -- keeps is_sample through the edit (as 87 does)
update public.transactions set local_date = (local_date - interval '2 months')::date where household_id = (select h from ids) and is_sample;
select set_config('fincwin.system_restamp', '', true);
set local role authenticated;
select public.t112_as('11111111-1111-1111-1111-111111111111');
select extensions.is(public.redate_sample_data_if_stale((select h from ids), current_date), true, 'locked: redate_sample_data_if_stale works');
select extensions.lives_ok($$ select public.clear_sample_data((select h from ids)) $$, 'locked: clear_sample_data works');
select extensions.throws_ok($$ update public.accounts set name = 'Still locked' where id = 'a1120000-0000-0000-0000-000000000001' $$,
  'PT402', 'plan locked', 'the clear bypass does not leak either');

-- 19-20. Covered states are writable.
reset role;
select public.t112_plan('trial', now() + interval '7 days');
set local role authenticated;
select public.t112_as('11111111-1111-1111-1111-111111111111');
select extensions.lives_ok($$ update public.accounts set name = 'Trial rename' where id = 'a1120000-0000-0000-0000-000000000001' $$, 'a trial household can write');
reset role;
delete from public.household_plans where household_id = (select h from ids);
update public.plan_settings set paid_from = null;
set local role authenticated;
select public.t112_as('11111111-1111-1111-1111-111111111111');
select extensions.lives_ok($$ update public.accounts set name = 'Prelaunch rename' where id = 'a1120000-0000-0000-0000-000000000001' $$, 'a prelaunch household can write');

-- 21-26. Tester backfill (D-29, Owner Answer 8).
reset role;
select set_config('request.jwt.claims', '', true);
update public.plan_settings set paid_from = now() - interval '1 day';
delete from public.household_plans;
delete from public.user_setup;
select extensions.ok(public.plan_backfill_testers() >= 1, 'plan_backfill_testers inserts a row per household with no plan');
select extensions.is((select count(*)::int from public.households h where not exists (select 1 from public.household_plans p where p.household_id = h.id)), 0,
  'after the backfill every household has a plan row');
select extensions.is((select count(*)::int from public.household_plans
   where not (status = 'promo' and promo_kind = 'tester' and store = 'BACKFILL' and plan_size = 6 and covered_until is null)), 0,
  'every backfilled row is promo, tester, BACKFILL, 6 seats, no end date');
select extensions.is(public.plan_backfill_testers(), 0, 'running the backfill twice adds nothing');
select extensions.is((select count(*)::int from public.user_setup
   where level = 4 and level_source = 'existing' and existing_card = 'pending' and completed_at is not null
     and user_id in ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222')), 2,
  'the backfill sets existing users to level 4, source existing, card pending, setup completed');
select extensions.is(public.household_writable((select h from ids)), true, 'a backfilled household stays writable after the launch date');

select * from extensions.finish();
rollback;
