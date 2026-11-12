-- pgTAP: Phase 06 Grow (06-06) -- the D-07 data step: each tester's Decide safety-net settings become their one flagged,
-- locked safety-net goal, once. Migration 20261106000200 (part B, section 7). The data step ran at migration time on an
-- empty database, so the same statement is run again here through t90_migrate() against fixtures.
-- Needs 20261016000100, 20261028000100, 20261103000300, 20261103000800, 20261106000100, 20261106000200.

begin;
create extension if not exists pgtap with schema extensions;

select extensions.plan(20);

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@test.local', '{}', now(), now()),
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b@test.local', '{}', now(), now()),
  ('33333333-3333-3333-3333-333333333333', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'c@test.local', '{}', now(), now()),
  ('44444444-4444-4444-4444-444444444444', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'd@test.local', '{}', now(), now()),
  ('55555555-5555-5555-5555-555555555555', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'e@test.local', '{}', now(), now());

create temp table hh as select owner_id, id from public.households;
grant select on hh to authenticated;

-- The same statement as the migration's section 7.
create function public.t90_migrate() returns void language sql as $$
insert into public.savings_goals (id, household_id, created_by, kind, name, currency, target, opening_saved, account_id,
                                  protect, locked, is_safety_net, net_confirmed_at)
select gen_random_uuid(), hm.household_id, ds.user_id, 'pot', 'Safety net',
       coalesce(ds.currency, p.home_currency, 'USD'), nullif(ds.safety_net_size, 0), coalesce(ds.reserve, 0),
       case when ds.reserve is null then null
            else (select a.id from public.accounts a where a.id = ds.reserve_account_id and a.household_id = hm.household_id) end,
       ds.safety_net_protect, true, true, null
  from public.decide_settings ds
  join lateral (select m.household_id from public.household_members m where m.user_id = ds.user_id
                 order by m.created_at, m.household_id limit 1) hm on true
  left join public.profiles p on p.id = ds.user_id
 where not exists (select 1 from public.savings_goals g
                    where g.household_id = hm.household_id and g.created_by = ds.user_id
                      and g.is_safety_net and g.deleted_at is null);
$$;

create function public.t90_net(u uuid) returns setof public.savings_goals language sql as $$
  select * from public.savings_goals g where g.created_by = u and g.is_safety_net and g.deleted_at is null;
$$;

-- Fixtures, written as the table owner. The settings guard checks the caller's households, and a fixture has no caller.
alter table public.decide_settings disable trigger guard_decide_settings_account;

insert into public.accounts (id, household_id, name, kind, currency, opening_balance) values
  ('a9000000-0000-0000-0000-000000000001', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'A savings', 'savings', 'USD', 1070000),
  ('a9000000-0000-0000-0000-000000000002', (select id from hh where owner_id = '22222222-2222-2222-2222-222222222222'), 'B savings', 'savings', 'USD', 500),
  ('a9000000-0000-0000-0000-000000000004', (select id from hh where owner_id = '44444444-4444-4444-4444-444444444444'), 'D savings', 'savings', 'USD', 1070000);

insert into public.decide_settings (user_id, currency, reserve, reserve_account_id, safety_net_size, safety_net_protect) values
  ('11111111-1111-1111-1111-111111111111', 'USD', 130000, 'a9000000-0000-0000-0000-000000000001', 230000, true),
  ('22222222-2222-2222-2222-222222222222', null, null, null, null, true),
  ('33333333-3333-3333-3333-333333333333', 'USD', 50000, 'a9000000-0000-0000-0000-000000000002', 100000, false),
  ('44444444-4444-4444-4444-444444444444', 'USD', null, 'a9000000-0000-0000-0000-000000000004', 100000, true),
  ('55555555-5555-5555-5555-555555555555', 'USD', 70000, null, 90000, true);

-- E already made a safety net by hand: it must not be duplicated.
insert into public.savings_goals (id, household_id, created_by, kind, name, currency, target, opening_saved, is_safety_net, locked) values
  ('9a900000-0000-0000-0000-0000000000e5', (select id from hh where owner_id = '55555555-5555-5555-5555-555555555555'),
   '55555555-5555-5555-5555-555555555555', 'pot', 'My own net', 'USD', 123000, 1000, true, true);

select extensions.is((select count(*)::int from public.savings_goals where is_safety_net), 1, 'before the data step only E has a flagged goal');
select extensions.lives_ok($$select public.t90_migrate()$$, 'the data step runs');

select extensions.is((select count(*)::int from public.t90_net('11111111-1111-1111-1111-111111111111')), 1, 'A gets exactly one flagged goal');
select extensions.is((select target from public.t90_net('11111111-1111-1111-1111-111111111111')), 230000::bigint, 'A: target is the old safety-net size');
select extensions.is((select opening_saved from public.t90_net('11111111-1111-1111-1111-111111111111')), 130000::bigint, 'A: opening saved is the old reserve');
select extensions.is((select account_id from public.t90_net('11111111-1111-1111-1111-111111111111')),
  'a9000000-0000-0000-0000-000000000001'::uuid, 'A: the reserve account is linked (reserve is not null)');
select extensions.ok((select locked and protect from public.t90_net('11111111-1111-1111-1111-111111111111')), 'A: locked and protected');

select extensions.is((select count(*)::int from public.t90_net('22222222-2222-2222-2222-222222222222')), 1, 'B (all defaults) gets one flagged goal');
select extensions.is((select target from public.t90_net('22222222-2222-2222-2222-222222222222')), null::bigint, 'B: no size reads as no target');
select extensions.is((select opening_saved from public.t90_net('22222222-2222-2222-2222-222222222222')), 0::bigint, 'B: nothing saved yet');
select extensions.is((select currency from public.t90_net('22222222-2222-2222-2222-222222222222')), 'USD', 'B: no settings currency falls back to the home currency');

select extensions.is((select account_id from public.t90_net('33333333-3333-3333-3333-333333333333')), null::uuid,
  'C: a reserve account from another household becomes null');
select extensions.is((select protect from public.t90_net('33333333-3333-3333-3333-333333333333')), false, 'C: protect false is copied');
select extensions.is((select opening_saved from public.t90_net('33333333-3333-3333-3333-333333333333')), 50000::bigint, 'C: reserve is copied');

select extensions.is((select account_id from public.t90_net('44444444-4444-4444-4444-444444444444')), null::uuid,
  'D: no account link when the old reserve was null (Decide must not read the whole live balance as the fund)');
select extensions.is((select opening_saved from public.t90_net('44444444-4444-4444-4444-444444444444')), 0::bigint, 'D: opening saved 0 when the reserve was null');

select extensions.is((select count(*)::int from public.t90_net('55555555-5555-5555-5555-555555555555')), 1, 'E: the net they made is not duplicated');
select extensions.is((select target from public.t90_net('55555555-5555-5555-5555-555555555555')), 123000::bigint, 'E: their own net is untouched');

-- Idempotent: a second run inserts nothing.
select extensions.is((select count(*)::int from public.savings_goals where is_safety_net), 5, 'one flagged goal per tester after the first run');
select public.t90_migrate();
select extensions.is((select count(*)::int from public.savings_goals where is_safety_net), 5, 'a second run leaves the count unchanged');

select * from extensions.finish();
rollback;
