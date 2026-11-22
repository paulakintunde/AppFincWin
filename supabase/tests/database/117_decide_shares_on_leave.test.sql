-- pgTAP: 08.1 review C-CR-01 / C-WR-01 (migration 20261125000900). A shared safety net, the partner opt-ins and the published
-- figure end when their owner leaves the household (or is removed). The remaining members stop seeing the net, the leaver's
-- device can no longer publish into the old household, the leaver can still switch the net off, and a rejoin starts from off.
-- The reads and publishes also refuse a row whose owner is no longer a member, even if one were left behind.

begin;
create extension if not exists pgtap with schema extensions;

select extensions.plan(24);

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
select ('' || n || n || n || n || n || n || n || n || '-' || n || n || n || n || '-' || n || n || n || n || '-' || n || n || n || n || '-' || n || n || n || n || n || n || n || n || n || n || n || n)::uuid,
       '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'u' || n || '@test.local',
       json_build_object('full_name', 'User ' || n)::jsonb, now(), now()
  from generate_series(1, 4) n;

create temp table ids as select (select id from public.households where owner_id = '11111111-1111-1111-1111-111111111111') as h;
grant select on ids to authenticated;
create function public.t117_as(u text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true)
$$;

-- A owns the household; B and C are members; D is alone.
update public.household_members set created_at = now() - interval '3 days' where user_id = '11111111-1111-1111-1111-111111111111';
delete from public.household_members where user_id in ('22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333333');
insert into public.household_members (household_id, user_id, is_owner, weight, created_at, display_name) values
  ((select h from ids), '22222222-2222-2222-2222-222222222222', false, 50, now() - interval '2 days', 'Bea'),
  ((select h from ids), '33333333-3333-3333-3333-333333333333', false, 50, now() - interval '1 day', 'Cy');

-- B's safety net, in the shared household.
select set_config('fincwin.decide_rpc', 'on', true);
insert into public.savings_goals (id, household_id, created_by, kind, name, currency, target, ready_by, is_safety_net, locked, opening_saved) values
  ('b1170000-0000-0000-0000-000000000001', (select h from ids), '22222222-2222-2222-2222-222222222222', 'pot', 'B safety net', 'USD', 300000, current_date + 90, true, true, 52000);
select set_config('fincwin.decide_rpc', '', true);

set local role authenticated;
-- B shares the net and both A and B count each other's money; A and C count each other's money too.
select public.t117_as('22222222-2222-2222-2222-222222222222');
select extensions.is((select public.set_shared_safety_net('b1170000-0000-0000-0000-000000000001', true) ->> 'ok'), 'true', 'B shares the safety net');
select public.set_partner_optin('11111111-1111-1111-1111-111111111111', true);
select extensions.is((select public.publish_partner_figure(90000, 'USD') ->> 'ok'), 'true', 'B publishes a figure');
select public.t117_as('11111111-1111-1111-1111-111111111111');
select public.set_partner_optin('22222222-2222-2222-2222-222222222222', true);
select public.set_partner_optin('33333333-3333-3333-3333-333333333333', true);
select public.publish_partner_figure(120000, 'USD');
select public.t117_as('33333333-3333-3333-3333-333333333333');
select public.set_partner_optin('11111111-1111-1111-1111-111111111111', true);
select public.publish_partner_figure(40000, 'USD');
select public.t117_as('11111111-1111-1111-1111-111111111111');
select extensions.is((select public.shared_safety_net() ->> 'saved'), '52000', 'before leaving, A sees the saved amount of B''s net');
select extensions.is((select public.partner_money_total('22222222-2222-2222-2222-222222222222') ->> 'rounded_left'), '90000', 'before leaving, A counts B');

-- 1. B leaves.
select public.t117_as('22222222-2222-2222-2222-222222222222');
select extensions.is((select public.leave_household() ->> 'ok'), 'true', 'B leaves');
reset role;
select extensions.is((select count(*)::int from public.safety_net_shares where owner_id = '22222222-2222-2222-2222-222222222222'), 0, 'the leaver''s net share is gone');
select extensions.is((select count(*)::int from public.decide_partner_optins
   where owner_id = '22222222-2222-2222-2222-222222222222' or partner_id = '22222222-2222-2222-2222-222222222222'), 0,
  'every opt-in the leaver owned or was named in is gone');
select extensions.is((select count(*)::int from public.partner_figures where owner_id = '22222222-2222-2222-2222-222222222222'), 0, 'the leaver''s figure is gone');
select extensions.is((select count(*)::int from public.partner_figures where owner_id = '11111111-1111-1111-1111-111111111111'), 1,
  'A still counts C, so A''s figure stays');
select extensions.is((select count(*)::int from public.decide_partner_optins
   where owner_id in ('11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333') and enabled), 2,
  'opt-ins between the members who stay are untouched');

-- 2. The remaining members no longer see the net; the leaver cannot publish into the old household.
set local role authenticated;
select public.t117_as('11111111-1111-1111-1111-111111111111');
select extensions.is((select public.shared_safety_net() ->> 'reason'), 'none_shared', 'A no longer sees B''s net');
select extensions.is((select public.partner_money_total('22222222-2222-2222-2222-222222222222') ->> 'reason'), 'not_both_on', 'A no longer counts B');
select public.t117_as('22222222-2222-2222-2222-222222222222');
select extensions.is((select public.publish_safety_net_saved('b1170000-0000-0000-0000-000000000001', 60000) ->> 'reason'), 'not_shared', 'the leaver''s hourly publish is refused');
select extensions.is((select public.publish_partner_figure(90000, 'USD') ->> 'reason'), 'no_optin', 'the leaver cannot publish a figure');
-- 3. The leaver can still switch the net off in a household of one (it is a no-op, never no_partner).
select extensions.is((select public.set_shared_safety_net('b1170000-0000-0000-0000-000000000001', false) ->> 'ok'), 'true', 'the leaver can switch the net off');
select extensions.is((select public.set_shared_safety_net('b1170000-0000-0000-0000-000000000001', true) ->> 'reason'), 'no_partner', 'but cannot share it with nobody');

-- 4. A rejoin starts from off: no opt-in, no share comes back.
reset role;
insert into public.household_members (household_id, user_id, is_owner, weight, display_name)
  values ((select h from ids), '22222222-2222-2222-2222-222222222222', false, 50, 'Bea');
set local role authenticated;
select public.t117_as('11111111-1111-1111-1111-111111111111');
select extensions.is((select public.partner_money_total('22222222-2222-2222-2222-222222222222') ->> 'reason'), 'not_both_on', 'after a rejoin B counts only with fresh consent');
select extensions.is((select public.shared_safety_net() ->> 'reason'), 'none_shared', 'after a rejoin B''s net is not shared');
reset role;
delete from public.household_members where user_id = '22222222-2222-2222-2222-222222222222' and household_id = (select h from ids);

-- 5. Removal ends C's opt-ins too, and A's figure goes with A's last opt-in.
set local role authenticated;
select public.t117_as('11111111-1111-1111-1111-111111111111');
select extensions.is((select public.remove_member('33333333-3333-3333-3333-333333333333') ->> 'ok'), 'true', 'A removes C');
reset role;
select extensions.is((select count(*)::int from public.decide_partner_optins), 0, 'no opt-ins are left in the household');
select extensions.is((select count(*)::int from public.partner_figures), 0, 'no figure is left once nobody counts anybody');

-- 6. Belt and braces: rows written straight into the tables for D, who was never a member here, are never read or written
-- through. This tests the guards in the functions on their own, without the trigger.
select set_config('fincwin.decide_rpc', 'on', true);
insert into public.savings_goals (id, household_id, created_by, kind, name, currency, target, ready_by, is_safety_net, locked, opening_saved) values
  ('d1170000-0000-0000-0000-000000000001', (select h from ids), '44444444-4444-4444-4444-444444444444', 'pot', 'D safety net', 'USD', 200000, current_date + 90, true, true, 10000);
select set_config('fincwin.decide_rpc', '', true);
insert into public.safety_net_shares (household_id, goal_id, owner_id, enabled, rounded_saved)
  values ((select h from ids), 'd1170000-0000-0000-0000-000000000001', '44444444-4444-4444-4444-444444444444', true, 10000);
insert into public.decide_partner_optins (household_id, owner_id, partner_id, enabled) values
  ((select h from ids), '44444444-4444-4444-4444-444444444444', '11111111-1111-1111-1111-111111111111', true);
set local role authenticated;
select public.t117_as('11111111-1111-1111-1111-111111111111');
select extensions.is((select public.shared_safety_net() ->> 'reason'), 'none_shared', 'a non-member''s share is never read');
select public.t117_as('44444444-4444-4444-4444-444444444444');
select extensions.is((select public.publish_safety_net_saved('d1170000-0000-0000-0000-000000000001', 20000) ->> 'reason'), 'not_shared', 'a non-member cannot publish the saved amount');
select extensions.is((select public.publish_partner_figure(50000, 'USD') ->> 'reason'), 'no_optin', 'a non-member''s opt-in does not let a figure through');
reset role;

select * from extensions.finish();
rollback;
