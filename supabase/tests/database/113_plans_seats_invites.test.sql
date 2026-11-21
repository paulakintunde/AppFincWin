-- pgTAP: Phase 9 plan 09-04 (D-10, D-17, D-21; T-09-14, T-09-16). Needs 20261124000100..000300.
-- Seats come from the plan, a person beyond the plan size waits for the payer's bigger plan, and the new notice kinds exist.
-- The RPCs are security definer and read the caller from request.jwt.claims, so the test calls them as the table owner.
-- Note: the 12-seat plan is not filled to 12 here, because household_members.colour_key (0..5, unique) caps a household at 6 today.

begin;
create extension if not exists pgtap with schema extensions;

select extensions.plan(37);

-- A owner and payer of hA, B a member; C, D, H joiners; E, F, G fill the household to 6; I owns hI (one person).
insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
select ('' || n || n || n || n || n || n || n || n || '-' || n || n || n || n || '-' || n || n || n || n || '-' || n || n || n || n || '-' || n || n || n || n || n || n || n || n || n || n || n || n)::uuid,
       '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'u' || n || '@test.local',
       json_build_object('full_name', 'User ' || n)::jsonb, now(), now()
  from generate_series(1, 9) n;

create temp table hh as select owner_id, id from public.households;
create temp table codes (label text primary key, code text, invite_id uuid);

create function public.t113_as(u text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true)
$$;
create function public.t113_h(n int) returns uuid language sql stable as $$
  select id from hh where owner_id = ('' || n || n || n || n || n || n || n || n || '-' || n || n || n || n || '-' || n || n || n || n || '-' || n || n || n || n || '-' || n || n || n || n || n || n || n || n || n || n || n || n)::uuid
$$;
create function public.t113_u(n int) returns uuid language sql immutable as $$
  select ('' || n || n || n || n || n || n || n || n || '-' || n || n || n || n || '-' || n || n || n || n || '-' || n || n || n || n || '-' || n || n || n || n || n || n || n || n || n || n || n || n)::uuid
$$;
-- Replaces the household's plan row. p_key follows the size.
create function public.t113_plan(p_n int, p_status text, p_size smallint, p_covered timestamptz) returns void language plpgsql as $$
begin
  delete from public.household_plans where household_id = public.t113_h(p_n);
  insert into public.household_plans (household_id, payer_id, store, plan_size, status, covered_until, plan_key, period)
  values (public.t113_h(p_n), public.t113_u(p_n), 'APP_STORE', p_size, p_status, p_covered,
          case p_size when 1 then 'solo' when 2 then 'duo' when 6 then 'household' else 'extended' end, 'month');
end;
$$;
create function public.t113_member(p_n int, p_h int) returns void language plpgsql as $$
begin
  delete from public.household_members where user_id = public.t113_u(p_n);
  insert into public.household_members (household_id, user_id, is_owner, weight, created_at)
  values (public.t113_h(p_h), public.t113_u(p_n), false, 0, now() - interval '1 day');
end;
$$;

update public.plan_settings set paid_from = now() - interval '1 day', enforce_for = '{}';
select public.t113_member(2, 1);

-- 1-5. A trial is 2 seats. An invite beyond that is allowed; the person who uses it waits for approval (D-10, D-21).
select public.t113_plan(1, 'trial', 2::smallint, now() + interval '7 days');
select public.t113_as(public.t113_u(1)::text);
insert into codes select 'k1', r ->> 'code', (r ->> 'invite_id')::uuid from (select public.create_invite() r) s;
select extensions.is((select count(*)::int from codes where label = 'k1' and code is not null), 1,
  'an invite beyond the plan size is allowed in a trial (approval happens at redeem)');
select public.t113_as(public.t113_u(3)::text);
select extensions.is(public.redeem_invite((select code from codes where label = 'k1')) ->> 'reason', 'needs_approval',
  'a 3rd person in a 2-seat trial gets needs_approval');
select extensions.is((select count(*)::int from public.plan_join_requests
                       where household_id = public.t113_h(1) and user_id = public.t113_u(3) and status = 'waiting' and needed_plan_size = 6), 1,
  'a waiting request for a 6 plan exists');
select extensions.is((select count(*)::int from public.household_members where user_id = public.t113_u(3) and household_id = public.t113_h(1)), 0,
  'the 3rd person is not a member, not even provisionally');
select extensions.is((select audience from public.household_events where household_id = public.t113_h(1) and kind = 'plan_approval_needed'),
  array[public.t113_u(1)], 'the payer alone gets the plan_approval_needed notice');

-- 6-7. The preview tells the person before they try.
select public.t113_as(public.t113_u(4)::text);
select extensions.is(public.preview_invite((select code from codes where label = 'k1')) ->> 'needs_approval', 'true',
  'preview_invite says needs_approval when members have reached the seats');
select extensions.is(public.preview_invite((select code from codes where label = 'k1')) ->> 'seats', '2', 'preview_invite reports the seats');

-- 8-10. A second try changes nothing: same request, one request, one notice.
select public.t113_as(public.t113_u(3)::text);
select extensions.is(public.redeem_invite((select code from codes where label = 'k1')) ->> 'request_id',
  (select id::text from public.plan_join_requests where user_id = public.t113_u(3) and status = 'waiting' and household_id = public.t113_h(1)),
  'trying again returns the same request');
select extensions.is((select count(*)::int from public.plan_join_requests where user_id = public.t113_u(3) and status = 'waiting'), 1,
  'there is still one waiting request');
select extensions.is((select count(*)::int from public.household_events where household_id = public.t113_h(1) and kind = 'plan_approval_needed'), 1,
  'the payer is told once');

-- 11-13. Only the person or the payer can withdraw a request (T-09-16).
select public.t113_as(public.t113_u(4)::text);
select extensions.is(public.cancel_join_request((select id from public.plan_join_requests where user_id = public.t113_u(3) and status = 'waiting')) ->> 'ok', 'false',
  'a stranger cannot cancel a join request');
select public.t113_as(public.t113_u(1)::text);
select extensions.is(public.cancel_join_request((select id from public.plan_join_requests where user_id = public.t113_u(3) and status = 'waiting')) ->> 'ok', 'true',
  'the payer can cancel a join request');
select extensions.is((select status from public.plan_join_requests where user_id = public.t113_u(3) order by created_at limit 1), 'cancelled',
  'the cancelled request is marked cancelled');

-- 14-17. A bigger plan admits the person who was waiting.
select public.t113_plan(1, 'active', 2::smallint, now() + interval '20 days');
select public.t113_as(public.t113_u(3)::text);
select extensions.is(public.redeem_invite((select code from codes where label = 'k1')) ->> 'reason', 'needs_approval',
  'an active Duo with 2 members also holds the 3rd person for approval');
update public.household_plans set plan_size = 6, plan_key = 'household' where household_id = public.t113_h(1);
select extensions.is(public.plan_admit_waiting(public.t113_h(1)), 1, 'plan_admit_waiting admits the one waiting person');
select extensions.is((select count(*)::int from public.household_members where user_id = public.t113_u(3) and household_id = public.t113_h(1)), 1,
  'the waiting person is now a member');
select extensions.is((select status from public.plan_join_requests where user_id = public.t113_u(3) and status <> 'cancelled'), 'admitted',
  'the request is marked admitted');

-- 18. Active Duo: members = size gives needs_approval.
delete from public.household_members where user_id = public.t113_u(3) and household_id = public.t113_h(1);
select public.t113_plan(1, 'active', 2::smallint, now() + interval '20 days');
select public.t113_as(public.t113_u(1)::text);
insert into codes select 'k2', r ->> 'code', (r ->> 'invite_id')::uuid from (select public.create_invite() r) s;
select public.t113_as(public.t113_u(4)::text);
select extensions.is(public.redeem_invite((select code from codes where label = 'k2')) ->> 'reason', 'needs_approval',
  'active plan size 2 with 2 members: needs_approval');

-- 19-20. Active Household (6) with 6 members: needs_approval, and the Extended plan is the one it needs.
select public.t113_member(3, 1);
select public.t113_member(5, 1);
select public.t113_member(6, 1);
select public.t113_member(7, 1);
select public.t113_plan(1, 'active', 6::smallint, now() + interval '20 days');
select public.t113_as(public.t113_u(8)::text);
select extensions.is(public.redeem_invite((select code from codes where label = 'k2')) ->> 'reason', 'needs_approval',
  'active plan size 6 with 6 members: needs_approval');
select extensions.is((select needed_plan_size::int from public.plan_join_requests
                       where user_id = public.t113_u(8) and household_id = public.t113_h(1) and status = 'waiting'), 12,
  'the 7th person needs the 12 plan');

-- 21-22. Active Extended (12): invites are allowed up to 12 in total and the seats are 12.
select public.t113_plan(1, 'active', 12::smallint, now() + interval '20 days');
select public.t113_as(public.t113_u(1)::text);
select extensions.is(public.create_invite() ->> 'ok', 'true', 'active plan size 12 with 6 members and 1 open invite can invite again');
select extensions.is(public.household_seats(public.t113_h(1)), 12, 'active plan size 12 gives 12 seats');

-- 23-25. Active Solo (1): one person, so the second needs a Duo.
select public.t113_plan(9, 'active', 1::smallint, now() + interval '20 days');
select public.t113_as(public.t113_u(9)::text);
insert into codes select 'k3', r ->> 'code', (r ->> 'invite_id')::uuid from (select public.create_invite() r) s;
select extensions.is((select count(*)::int from codes where label = 'k3' and code is not null), 1, 'a Solo household can create an invite');
select public.t113_as(public.t113_u(8)::text);
select extensions.is(public.redeem_invite((select code from codes where label = 'k3')) ->> 'reason', 'needs_approval',
  'active plan size 1 with 1 member: needs_approval');
select extensions.is((select needed_plan_size::int from public.plan_join_requests
                       where user_id = public.t113_u(8) and household_id = public.t113_h(9) and status = 'waiting'), 2,
  'the 2nd person needs the 2 plan');

-- 26-27. Active Duo with room: the person joins at once.
select public.t113_plan(4, 'active', 2::smallint, now() + interval '20 days');
select public.t113_as(public.t113_u(4)::text);
insert into codes select 'k4', r ->> 'code', (r ->> 'invite_id')::uuid from (select public.create_invite() r) s;
select public.t113_as(public.t113_u(8)::text);
select extensions.is(public.redeem_invite((select code from codes where label = 'k4')) ->> 'ok', 'true',
  'active plan size 2 with 1 member: the person joins');
select extensions.is((select count(*)::int from public.household_members where household_id = public.t113_h(4)), 2, 'that household now has 2 members');

-- 28-29. A lapsed or unpaid household takes no more people.
select public.t113_plan(1, 'lapsed', 6::smallint, now() - interval '1 day');
select public.t113_as(public.t113_u(1)::text);
select extensions.is(public.create_invite() ->> 'reason', 'full', 'a lapsed household cannot invite');
delete from public.household_plans where household_id = public.t113_h(1);
select extensions.is(public.create_invite() ->> 'reason', 'full', 'a household with no plan after paid_from cannot invite');

-- 30-31. Before launch the Phase 8 cap of 6 is unchanged.
update public.plan_settings set paid_from = null;
select extensions.is(public.create_invite() ->> 'reason', 'full', 'prelaunch: 6 members is the cap');
delete from public.household_members where user_id = public.t113_u(7) and household_id = public.t113_h(1);
update public.household_invites set cancelled_at = now() where household_id = public.t113_h(1) and cancelled_at is null;
select extensions.is(public.create_invite() ->> 'ok', 'true', 'prelaunch: 5 members can still invite');

-- 32-33. The new notice kinds exist and the list is still closed.
select extensions.lives_ok($$
  insert into public.household_events (household_id, kind, params)
  select public.t113_h(1), k, '{}'::jsonb
    from unnest(array['plan_approval_needed','plan_payer_left','plan_takeover','plan_grace','plan_locked','plan_downgrade_offer',
                      'plan_recovered_after_takeover','plan_double_cover']) k$$,
  'all eight new household_events kinds insert');
select extensions.throws_ok($$
  insert into public.household_events (household_id, kind, params) values (public.t113_h(1), 'plan_made_up', '{}'::jsonb)$$,
  '23514', null, 'an unknown household_events kind is still refused');

-- 34-37. Who may call what.
select extensions.is(has_function_privilege('authenticated', 'public.plan_admit_waiting(uuid)', 'execute'), false, 'clients cannot call plan_admit_waiting');
select extensions.is(has_function_privilege('authenticated', 'public.cancel_join_request(uuid)', 'execute'), true, 'clients can call cancel_join_request');
select extensions.is(has_function_privilege('authenticated', 'public.plan_on_departure(uuid, uuid, uuid, text)', 'execute'), false, 'clients cannot call plan_on_departure');
select extensions.is(has_function_privilege('authenticated', 'public.redeem_invite(text, text)', 'execute'), true, 'clients can call redeem_invite with a country');

select * from extensions.finish();
rollback;
