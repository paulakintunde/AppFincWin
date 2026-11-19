-- pgTAP: Phase 9 plan core (09-02). Needs 20261124000100_plans_core.sql.
-- State, seats, writable, trial ledger and RLS privacy of the store-neutral plan record (D-01, D-09, D-10, D-13, D-16, D-30).

begin;
create extension if not exists pgtap with schema extensions;

select extensions.plan(39);

-- A (payer, owner), B (member of A's household), C (stranger).
insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@test.local', '{"full_name":"Ann Test"}', now(), now()),
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b@test.local', '{"full_name":"Bob Test"}', now(), now()),
  ('33333333-3333-3333-3333-333333333333', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'c@test.local', '{"full_name":"Cy Test"}', now(), now());

create temp table hh as select owner_id, id from public.households;
grant select on hh to authenticated;

-- B joins A's household.
delete from public.household_members where user_id = '22222222-2222-2222-2222-222222222222';
insert into public.household_members (household_id, user_id, is_owner, weight, created_at)
values ((select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), '22222222-2222-2222-2222-222222222222', false, 0, now() - interval '1 day');

create function public.t111_hid() returns uuid language sql stable as $$
  select id from public.households where owner_id = '11111111-1111-1111-1111-111111111111'
$$;
create function public.t111_plan(p_status text, p_size smallint, p_covered timestamptz) returns void language plpgsql as $$
begin
  delete from public.household_plans where household_id = public.t111_hid();
  insert into public.household_plans (household_id, payer_id, store, plan_size, status, covered_until, plan_key, period)
  values (public.t111_hid(), '11111111-1111-1111-1111-111111111111', 'APP_STORE', p_size, p_status, p_covered, 'duo', 'month');
end;
$$;

-- 1-3. Launch switch off: prelaunch.
update public.plan_settings set paid_from = null, enforce_for = '{}';
select extensions.is(public.household_plan_state(public.t111_hid()), 'prelaunch', 'no plan row, paid_from null: prelaunch');
select extensions.is(public.household_writable(public.t111_hid()), true, 'prelaunch household is writable');
select extensions.is(public.household_seats(public.t111_hid()), 6, 'prelaunch household has 6 seats');

-- 4-6. paid_from in the past: none.
update public.plan_settings set paid_from = now() - interval '1 day';
select extensions.is(public.household_plan_state(public.t111_hid()), 'none', 'no plan row, paid_from past: none');
select extensions.is(public.household_writable(public.t111_hid()), false, 'a household with no plan is not writable after paid_from');
select extensions.is(public.household_seats(public.t111_hid()), 2, 'a household with no plan has seats equal to its member count');

-- 7. paid_from in the future but a member is on enforce_for.
update public.plan_settings set paid_from = now() + interval '30 days',
  enforce_for = array['22222222-2222-2222-2222-222222222222'::uuid];
select extensions.is(public.household_plan_state(public.t111_hid()), 'none', 'enforce_for puts a household on the paywall early');
update public.plan_settings set paid_from = now() - interval '1 day', enforce_for = '{}';

-- 8-10. Trial.
select public.t111_plan('trial', 2::smallint, now() + interval '7 days');
select extensions.is(public.household_plan_state(public.t111_hid()), 'trial', 'status trial with future cover: trial');
select extensions.is(public.household_seats(public.t111_hid()), 2, 'a trial has 2 seats');
select extensions.is(public.household_writable(public.t111_hid()), true, 'a trial is writable');

-- 11-12. Active seats follow the plan size.
select public.t111_plan('active', 12::smallint, now() + interval '20 days');
select extensions.is(public.household_seats(public.t111_hid()), 12, 'active plan size 12 gives 12 seats');
select public.t111_plan('active', 1::smallint, now() + interval '20 days');
select extensions.is(public.household_seats(public.t111_hid()), 1, 'active plan size 1 gives 1 seat');

-- 13-14. Grace.
select public.t111_plan('grace', 2::smallint, now() + interval '3 days');
select extensions.is(public.household_plan_state(public.t111_hid()), 'grace', 'status grace with future cover: grace');
select extensions.is(public.household_writable(public.t111_hid()), true, 'grace is writable');

-- 15-16. Cover in the past is lapsed whatever the status.
select public.t111_plan('active', 2::smallint, now() - interval '1 hour');
select extensions.is(public.household_plan_state(public.t111_hid()), 'lapsed', 'covered_until in the past: lapsed');
select extensions.is(public.household_writable(public.t111_hid()), false, 'lapsed is not writable');

-- 17-19. Promo.
select public.t111_plan('promo', 6::smallint, null);
select extensions.is(public.household_plan_state(public.t111_hid()), 'promo', 'promo with no end: promo');
select extensions.is(public.household_writable(public.t111_hid()), true, 'promo is writable');
select extensions.is(public.household_seats(public.t111_hid()), 6, 'promo seats are the plan size');

-- 20. left_grace.
select public.t111_plan('left_grace', 6::smallint, now() + interval '5 days');
select extensions.is(public.household_seats(public.t111_hid()), 1, 'left_grace has 1 seat');

-- 21-23. Trial ledger: once per person and once per household.
select extensions.is(public.plan_trial_available('33333333-3333-3333-3333-333333333333', gen_random_uuid()), true, 'a fresh person and household may trial');
insert into public.trial_ledger (user_id, household_id) values ('33333333-3333-3333-3333-333333333333', gen_random_uuid());
select extensions.is(public.plan_trial_available('33333333-3333-3333-3333-333333333333', gen_random_uuid()), false, 'a person in the ledger may not trial again');
insert into public.trial_ledger (user_id, household_id) values ('22222222-2222-2222-2222-222222222222', public.t111_hid());
select extensions.is(public.plan_trial_available('11111111-1111-1111-1111-111111111111', public.t111_hid()), false, 'a household in the ledger may not trial again');

-- 24-26. plan_state() for the caller.
select public.t111_plan('active', 2::smallint, now() + interval '20 days');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
select extensions.is((public.plan_state() ->> 'household_id')::uuid, (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'plan_state returns the caller household');
select extensions.is((public.plan_state() ->> 'payer_is_me')::boolean, true, 'payer_is_me is true for the payer');
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
select extensions.is((public.plan_state() ->> 'payer_is_me')::boolean, false, 'payer_is_me is false for another member');

-- 27-28. Plan record visibility.
select extensions.is((select count(*)::int from public.household_plans), 1, 'a member reads the household plan row');
select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true);
select extensions.is((select count(*)::int from public.household_plans), 0, 'a stranger cannot read the household plan row');

-- 29-32. Private setup answers and feature switches (D-30).
reset role;
insert into public.user_setup (user_id, level, level_source) values ('11111111-1111-1111-1111-111111111111', 2, 'answers');
insert into public.feature_switches (user_id, feature_id, is_on) values ('11111111-1111-1111-1111-111111111111', 'decide.later', true);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
select extensions.is((select count(*)::int from public.user_setup where user_id = '11111111-1111-1111-1111-111111111111'), 0, 'member B cannot read A user_setup');
select extensions.is((select count(*)::int from public.feature_switches where user_id = '11111111-1111-1111-1111-111111111111'), 0, 'member B cannot read A feature_switches');
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
select extensions.lives_ok($$ insert into public.feature_switches (user_id, feature_id, is_on) values ('11111111-1111-1111-1111-111111111111', 'goals.pace', false) $$, 'A inserts own feature switch');
update public.feature_switches set is_on = false where user_id = '11111111-1111-1111-1111-111111111111' and feature_id = 'decide.later';
select extensions.is((select is_on from public.feature_switches where feature_id = 'decide.later'), false, 'A updates own feature switch');

-- 33-38. Clients never write plan state.
select extensions.throws_ok($$ insert into public.household_plans (household_id, store, plan_size, status) values (gen_random_uuid(), 'NONE', 1, 'active') $$, '42501', null, 'authenticated cannot insert household_plans');
select extensions.throws_ok($$ update public.household_plans set status = 'active' $$, '42501', null, 'authenticated cannot update household_plans');
select extensions.throws_ok($$ insert into public.plan_events (rc_event_id, type) values ('x', 'TEST') $$, '42501', null, 'authenticated cannot insert plan_events');
select extensions.throws_ok($$ insert into public.trial_ledger (user_id, household_id) values (gen_random_uuid(), gen_random_uuid()) $$, '42501', null, 'authenticated cannot insert trial_ledger');
select extensions.throws_ok($$ insert into public.plan_settings (id) values (false) $$, '42501', null, 'authenticated cannot insert plan_settings');
select extensions.throws_ok($$ update public.plan_settings set paid_from = null $$, '42501', null, 'authenticated cannot update plan_settings');

-- 39. No session.
select set_config('request.jwt.claims', '', true);
select extensions.throws_ok($$ select public.plan_state() $$, '42501', null, 'plan_state without a session raises 42501');

reset role;
select * from extensions.finish();
rollback;
