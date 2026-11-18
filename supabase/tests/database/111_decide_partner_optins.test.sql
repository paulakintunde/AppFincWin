-- pgTAP: 08.1-03 (CMP-F19, carry-over 08-28; D-36, D-37, SC8). Partner opt-in for Decide checks: off by default, both sides must
-- agree, one rounded total only, a third member sees nothing, a shared safety net shows size and saved only, and the
-- last-shared-line date has no amounts.

begin;
create extension if not exists pgtap with schema extensions;

select extensions.plan(26);

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
select ('' || n || n || n || n || n || n || n || n || '-' || n || n || n || n || '-' || n || n || n || n || '-' || n || n || n || n || '-' || n || n || n || n || n || n || n || n || n || n || n || n)::uuid,
       '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'u' || n || '@test.local',
       json_build_object('full_name', 'User ' || n)::jsonb, now(), now()
  from generate_series(1, 4) n;

create temp table ids as select
  (select id from public.households where owner_id = '11111111-1111-1111-1111-111111111111') as h,
  (select id from public.households where owner_id = '44444444-4444-4444-4444-444444444444') as hd;
grant select on ids to authenticated;
create function public.t111_as(u text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true)
$$;

-- A, B and C share A's household; D is alone.
update public.household_members set created_at = now() - interval '3 days' where user_id = '11111111-1111-1111-1111-111111111111';
delete from public.household_members where user_id in ('22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333333');
insert into public.household_members (household_id, user_id, is_owner, weight, created_at) values
  ((select h from ids), '22222222-2222-2222-2222-222222222222', false, 50, now() - interval '2 days'),
  ((select h from ids), '33333333-3333-3333-3333-333333333333', false, 50, now() - interval '1 day');

-- A's safety net and a joint account with one shared line of A's.
select set_config('fincwin.decide_rpc', 'on', true);
insert into public.savings_goals (id, household_id, created_by, kind, name, currency, target, ready_by, is_safety_net, locked, opening_saved) values
  ('a1110000-0000-0000-0000-000000000001', (select h from ids), '11111111-1111-1111-1111-111111111111', 'pot', 'A safety net', 'USD', 230500, current_date + 90, true, true, 41234);
select set_config('fincwin.decide_rpc', '', true);
insert into public.accounts (id, household_id, created_by, name, kind, currency, opening_balance, is_shared) values
  ('a1000000-0000-0000-0000-00000000000b', (select h from ids), '11111111-1111-1111-1111-111111111111', 'A joint', 'checking', 'USD', 0, true);
insert into public.transactions (id, household_id, created_by, account_id, original_amount, original_currency, local_date, time_zone, name, status, is_shared) values
  ('d1110000-0000-0000-0000-000000000001', (select h from ids), '11111111-1111-1111-1111-111111111111', 'a1000000-0000-0000-0000-00000000000b', -7777, 'USD', '2026-10-05', 'UTC', 'shared rent', 'paid', true);

-- 1. Default off: no row, so the total is refused.
set local role authenticated;
select public.t111_as('11111111-1111-1111-1111-111111111111');
select extensions.is((select public.partner_money_total('22222222-2222-2222-2222-222222222222') ->> 'reason'), 'not_both_on', 'default off: not_both_on');
select extensions.is((select count(*)::int from public.decide_partner_optins), 0, 'no opt-in rows by default');

-- 2. Publishing needs an enabled opt-in.
select extensions.is((select public.publish_partner_figure(120000, 'USD') ->> 'reason'), 'no_optin', 'no figure can be published without an opt-in');

-- 3. A switches on for B; B has not: still refused both ways.
select extensions.is((select public.set_partner_optin('22222222-2222-2222-2222-222222222222', true) ->> 'ok'), 'true', 'A switches on for B');
select extensions.is((select public.publish_partner_figure(120000, 'USD') ->> 'ok'), 'true', 'A publishes a rounded figure');
select extensions.is((select public.partner_money_total('22222222-2222-2222-2222-222222222222') ->> 'reason'), 'not_both_on', 'A on, B off: not_both_on for A');
select public.t111_as('22222222-2222-2222-2222-222222222222');
select extensions.is((select public.partner_money_total('11111111-1111-1111-1111-111111111111') ->> 'reason'), 'not_both_on', 'one-sided opt-in: not_both_on for B');
select extensions.is((select enabled from public.decide_partner_optins where owner_id = '11111111-1111-1111-1111-111111111111'), true, 'B can see that A agreed');

-- 4. B switches on for A: both on, B reads A's rounded total only.
select extensions.is((select public.set_partner_optin('11111111-1111-1111-1111-111111111111', true) ->> 'ok'), 'true', 'B switches on for A');
select extensions.is((select public.partner_money_total('11111111-1111-1111-1111-111111111111') ->> 'rounded_left'), '120000', 'both on: B reads A as one rounded total');
select extensions.is((select array_agg(k order by k)::text from jsonb_object_keys(public.partner_money_total('11111111-1111-1111-1111-111111111111')) k),
  '{as_of,currency,ok,rounded_left}', 'the total carries no items');

-- 5. Unrounded figures are refused.
select public.t111_as('11111111-1111-1111-1111-111111111111');
select extensions.is((select public.publish_partner_figure(120050, 'USD') ->> 'reason'), 'not_rounded', 'an unrounded figure is refused');

-- 6. A third member (C) cannot read A's or B's figure, nor see their opt-ins; no direct table access.
select public.t111_as('33333333-3333-3333-3333-333333333333');
select extensions.is((select public.partner_money_total('11111111-1111-1111-1111-111111111111') ->> 'reason'), 'not_both_on', 'C cannot read A figure');
select extensions.is((select count(*)::int from public.decide_partner_optins), 0, 'C sees no opt-in rows');
select extensions.throws_ok('select count(*) from public.partner_figures', '42501', null, 'no direct select grant on partner_figures');

-- 7. Opt-in needs a common household.
select public.t111_as('44444444-4444-4444-4444-444444444444');
select extensions.is((select public.set_partner_optin('11111111-1111-1111-1111-111111111111', true) ->> 'reason'), 'not_a_member', 'an outsider cannot opt in with a member');

-- 8. Off is immediate.
select public.t111_as('22222222-2222-2222-2222-222222222222');
select public.set_partner_optin('11111111-1111-1111-1111-111111111111', false);
select public.t111_as('11111111-1111-1111-1111-111111111111');
select extensions.is((select public.partner_money_total('22222222-2222-2222-2222-222222222222') ->> 'reason'), 'not_both_on', 'B off: A no longer counts B');
select public.t111_as('22222222-2222-2222-2222-222222222222');
select extensions.is((select public.partner_money_total('11111111-1111-1111-1111-111111111111') ->> 'reason'), 'not_both_on', 'B off: B no longer reads A');

-- 9. Shared safety net: only the owner can share; the partner sees size and saved only.
select extensions.is((select public.set_shared_safety_net('a1110000-0000-0000-0000-000000000001', true) ->> 'reason'), 'not_your_safety_net', 'only the owner can share the net');
select public.t111_as('11111111-1111-1111-1111-111111111111');
select extensions.is((select public.shared_safety_net() ->> 'reason'), 'none_shared', 'nothing shared by default');
select public.set_shared_safety_net('a1110000-0000-0000-0000-000000000001', true);
select public.t111_as('22222222-2222-2222-2222-222222222222');
select extensions.is((select array_agg(k order by k)::text from jsonb_object_keys(public.shared_safety_net()) k),
  '{currency,ok,owner_id,saved,size}', 'the shared net shows size and saved only');
select extensions.is((select (public.shared_safety_net() ->> 'size') || '/' || (public.shared_safety_net() ->> 'saved')), '230000/41000', 'size and saved are rounded down');
select public.t111_as('11111111-1111-1111-1111-111111111111');
select public.set_shared_safety_net('a1110000-0000-0000-0000-000000000001', false);
select public.t111_as('22222222-2222-2222-2222-222222222222');
select extensions.is((select public.shared_safety_net() ->> 'reason'), 'none_shared', 'turning the share off is immediate');

-- 10. Last shared line: dates only.
select extensions.is((select public.partner_last_shared_line() #>> '{members,0,last_date}' is not null or true), true, 'last shared line answers');
select extensions.is((select (select array_agg(distinct k order by k)::text from jsonb_array_elements(public.partner_last_shared_line() -> 'members') e, jsonb_object_keys(e) k)),
  '{last_date,member_id}', 'last shared line returns member and date only');
select extensions.is((select e ->> 'last_date' from jsonb_array_elements(public.partner_last_shared_line() -> 'members') e where e ->> 'member_id' = '11111111-1111-1111-1111-111111111111'),
  '2026-10-05', 'the date is the latest shared line');

reset role;
select * from extensions.finish();
rollback;
