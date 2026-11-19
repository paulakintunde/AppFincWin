-- pgTAP: Phase 9 plan 09-04 (D-39, D-41, D-42, D-21a, D-19, D-03; T-09-15, T-09-17). Needs 20261124000100..000300.
-- The once-a-year switch rule, and what happens to the plan when a payer or a member leaves or is removed.
-- The RPCs are security definer and read the caller from request.jwt.claims, so the test calls them as the table owner.

begin;
create extension if not exists pgtap with schema extensions;

select extensions.plan(31);

-- Users 1..12. Part 1: 8 (leaver) and 9 (target owner). Part 2: owner 1, payer 2. Part 3: payer and owner 3, members 4 and 5.
-- Part 4: tester household of 6, member 7. Part 5: lapsed household of 10, members 11 and 12.
insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
select ('00000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid,
       '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'u' || n || '@test.local',
       json_build_object('full_name', 'User ' || n)::jsonb, now(), now()
  from generate_series(1, 12) n;

create temp table hh as select owner_id, id from public.households;
create temp table codes (label text primary key, code text);

create function public.t114_u(n int) returns uuid language sql immutable as $$
  select ('00000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid
$$;
create function public.t114_as(n int) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', public.t114_u(n), 'role', 'authenticated')::text, true)
$$;
create function public.t114_h(n int) returns uuid language sql stable as $$
  select id from hh where owner_id = public.t114_u(n)
$$;
-- The household a person is in now.
create function public.t114_now_h(n int) returns uuid language sql stable as $$
  select household_id from public.household_members where user_id = public.t114_u(n) order by created_at limit 1
$$;
create function public.t114_member(p_n int, p_owner int) returns void language plpgsql as $$
begin
  delete from public.household_members where user_id = public.t114_u(p_n);
  insert into public.household_members (household_id, user_id, is_owner, weight, created_at)
  values (public.t114_h(p_owner), public.t114_u(p_n), false, 0, now() - interval '2 days');
end;
$$;

update public.plan_settings set paid_from = null, enforce_for = '{}';

-- ---- Part 1: the switch rule (D-39) ----
-- User 8 left household hP 30 days ago.
insert into public.household_leave_log (user_id, household_id, left_at, reason)
values (public.t114_u(8), public.t114_h(1), now() - interval '30 days', 'left');
select public.t114_as(9);
insert into codes select 'kT', r ->> 'code' from (select public.create_invite() r) s;
select public.t114_as(8);

-- 1-2. A person outside the free countries is held back until 12 months after leaving.
select extensions.is(public.redeem_invite((select code from codes where label = 'kT'), 'BR') ->> 'reason', 'switch_rule',
  'a store country outside the free list: joining another household within 12 months is refused');
select extensions.is((public.redeem_invite((select code from codes where label = 'kT'), 'BR') ->> 'open_from')::timestamptz,
  (select left_at + interval '12 months' from public.household_leave_log where user_id = public.t114_u(8)),
  'open_from is the leaving date plus 12 months');
-- 3-5. Alpha-3 and other countries are held; the free list, and an unknown country, are not.
select extensions.ok((select bool_and(public.plan_switch_blocked_until(public.t114_u(8), public.t114_h(9), c) is not null)
                        from unnest(array['BRA', 'BR', 'IN', 'JPN']) c), 'alpha-3 and other outside countries are held');
select extensions.ok((select bool_and(public.plan_switch_blocked_until(public.t114_u(8), public.t114_h(9), c) is null)
                        from unnest(array['US', 'USA', 'GB', 'UK', 'DE', 'DEU', 'NZ', 'CH', 'NO']) c),
  'US, USA, GB, UK, DE, DEU, NZ, CH and NO are free');
select extensions.is(public.plan_switch_blocked_until(public.t114_u(8), public.t114_h(9), null), null::timestamptz,
  'an unknown store country means no rule (owner answer 6)');
-- 6-10. The exceptions.
update public.household_leave_log set reason = 'removed' where user_id = public.t114_u(8);
select extensions.is(public.plan_switch_blocked_until(public.t114_u(8), public.t114_h(9), 'BR'), null::timestamptz, 'a person who was removed is not held');
update public.household_leave_log set reason = 'left' where user_id = public.t114_u(8);
select extensions.is(public.plan_switch_blocked_until(public.t114_u(8), public.t114_h(1), 'BR'), null::timestamptz, 'going back to the same household is not held');
update public.household_leave_log set exception_until = now() + interval '1 day' where user_id = public.t114_u(8);
select extensions.is(public.plan_switch_blocked_until(public.t114_u(8), public.t114_h(9), 'BR'), null::timestamptz, 'a support exception in the future is not held');
update public.household_leave_log set exception_until = null where user_id = public.t114_u(8);
insert into public.household_plans (household_id, payer_id, store, plan_size, status, covered_until)
values (public.t114_h(1), null, 'NONE', 2, 'lapsed', now() - interval '1 day');
select extensions.is(public.plan_switch_blocked_until(public.t114_u(8), public.t114_h(9), 'BR'), null::timestamptz, 'a household that has lapsed does not hold anyone');
delete from public.household_plans where household_id = public.t114_h(1);
update public.household_leave_log set household_id = gen_random_uuid() where user_id = public.t114_u(8);
select extensions.is(public.plan_switch_blocked_until(public.t114_u(8), public.t114_h(9), 'BR'), null::timestamptz, 'a household that no longer exists does not hold anyone');
-- 11. The country is never stored.
select extensions.is((select count(*)::int from information_schema.columns
                       where table_schema = 'public' and table_name = 'household_leave_log' and column_name ilike '%countr%'), 0,
  'household_leave_log stores no country');
-- 12. In a free country the same person joins.
update public.household_leave_log set household_id = public.t114_h(1) where user_id = public.t114_u(8);
select extensions.is(public.redeem_invite((select code from codes where label = 'kT'), 'US') ->> 'ok', 'true', 'in a free country the person joins');

-- ---- Part 2: the payer leaves (D-42) ----
select public.t114_member(2, 1);
insert into public.household_plans (household_id, payer_id, store, plan_size, status, covered_until, plan_key, period)
values (public.t114_h(1), public.t114_u(2), 'APP_STORE', 2, 'active', now() + interval '20 days', 'duo', 'month');
select public.t114_as(2);
select public.leave_household();
-- 13-17.
select extensions.is((select payer_id from public.household_plans where household_id = public.t114_now_h(2)), public.t114_u(2),
  'the plan moved with the payer to their new household');
select extensions.is((select status || '/' || coalesce(payer_id::text, 'null') || '/' || store from public.household_plans where household_id = public.t114_h(1)),
  'grace/null/NONE', 'the old household has a grace row with no payer and no store');
select extensions.ok((select covered_until between now() + interval '6 days 23 hours' and now() + interval '7 days 1 hour'
                        from public.household_plans where household_id = public.t114_h(1)), 'the grace lasts about 7 days');
select extensions.is((select audience from public.household_events where household_id = public.t114_h(1) and kind = 'plan_payer_left'),
  array[public.t114_u(1)], 'the people left are told the payer left');
select extensions.is((select count(*)::int from public.household_leave_log
                       where user_id = public.t114_u(2) and household_id = public.t114_h(1) and reason = 'left'), 1, 'a leave is logged');

-- ---- Part 3: a member leaves a covered Household plan (D-41, D-21a) ----
select public.t114_member(4, 3);
select public.t114_member(5, 3);
insert into public.household_plans (household_id, payer_id, store, plan_size, status, covered_until, plan_key, period)
values (public.t114_h(3), public.t114_u(3), 'APP_STORE', 6, 'active', now() + interval '20 days', 'household', 'month');
insert into public.trial_ledger (user_id, household_id) values (public.t114_u(3), public.t114_h(3));
select public.t114_as(5);
select public.leave_household();
-- 18-23.
select extensions.is((select status from public.household_plans where household_id = public.t114_now_h(5)), 'left_grace',
  'the member who left has a left_grace plan in their new household');
select extensions.is((select plan_size::int from public.household_plans where household_id = public.t114_now_h(5)), 1, 'left_grace is a plan of one');
select extensions.ok((select covered_until between now() + interval '6 days 23 hours' and now() + interval '7 days 1 hour'
                        from public.household_plans where household_id = public.t114_now_h(5)), 'left_grace covers about 7 days');
select extensions.is((select count(*)::int from public.trial_ledger where user_id in (public.t114_u(3), public.t114_u(5))), 1, 'no new trial is recorded for the person who left');
select extensions.is((select audience from public.household_events where household_id = public.t114_h(3) and kind = 'plan_downgrade_offer'),
  array[public.t114_u(3)], 'the payer is offered a smaller plan');
select extensions.is((select params ->> 'plan_size' from public.household_events where household_id = public.t114_h(3) and kind = 'plan_downgrade_offer'), '2',
  'the offer is the Duo plan');
-- 24-25. Removal logs a removal and gives the same 7 days.
select public.t114_as(3);
select public.remove_member(public.t114_u(4));
select extensions.is((select count(*)::int from public.household_leave_log
                       where user_id = public.t114_u(4) and household_id = public.t114_h(3) and reason = 'removed'), 1, 'a removal is logged');
select extensions.is((select status from public.household_plans where household_id = public.t114_now_h(4)), 'left_grace',
  'a removed member also gets left_grace');

-- ---- Part 4: a tester household (D-41) ----
select public.t114_member(7, 6);
insert into public.household_plans (household_id, payer_id, store, plan_size, status, promo_kind, covered_until)
values (public.t114_h(6), null, 'PROMOTIONAL', 6, 'promo', 'tester', now() + interval '30 days');
select public.t114_as(7);
select public.leave_household();
-- 26-27.
select extensions.is((select status || '/' || coalesce(promo_kind, 'null') from public.household_plans where household_id = public.t114_now_h(7)),
  'promo/tester', 'a member who leaves a tester household gets a tester row');
select extensions.is((select covered_until from public.household_plans where household_id = public.t114_now_h(7)),
  (select covered_until from public.household_plans where household_id = public.t114_h(6)), 'with the same end date');

-- ---- Part 5: leaving and removal work while the household is locked (D-03) ----
select public.t114_member(11, 10);
select public.t114_member(12, 10);
insert into public.household_plans (household_id, payer_id, store, plan_size, status, covered_until, plan_key, period)
values (public.t114_h(10), public.t114_u(10), 'APP_STORE', 6, 'lapsed', now() - interval '2 days', 'household', 'month');
-- 28-31.
select extensions.is(public.household_writable(public.t114_h(10)), false, 'the lapsed household is locked');
select public.t114_as(11);
select extensions.is(public.leave_household() ->> 'ok', 'true', 'a member can leave a locked household');
select public.t114_as(10);
select extensions.is(public.remove_member(public.t114_u(12)) ->> 'ok', 'true', 'the owner can remove a member from a locked household');
select extensions.is((select string_agg(reason, ',' order by reason) from public.household_leave_log where household_id = public.t114_h(10)),
  'left,removed', 'both are logged');

select * from extensions.finish();
rollback;
