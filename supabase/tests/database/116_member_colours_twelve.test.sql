-- pgTAP: Phase 9 plan 09-26 (D-06, D-10, D-03 spirit; T-09-26-01..04). Needs 20261124000100..000300 and 20261124000450.
-- Owner decisions 2026-11-19: an Extended plan seats 12 people, each with their own colour (keys 0 to 11); a 13th is refused;
-- leaving, removing a member and the owner leaving all keep working while the household is locked, and the plan bypass does not leak.
-- The RPCs are security definer and read the caller from request.jwt.claims, so the test calls them as the table owner.

begin;
create extension if not exists pgtap with schema extensions;

select extensions.plan(21);

-- Users 1..23. Part 1: Extended household of owner 1 (members 2..6 direct, 7..12 by invite, 13 the refused one).
-- Part 2: locked household of owner 20, members 21, 22, 23.
insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
select ('00000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid,
       '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'u' || n || '@test.local',
       json_build_object('full_name', 'User ' || n)::jsonb, now(), now()
  from generate_series(1, 23) n;

create temp table hh as select owner_id, id from public.households;

create function public.t116_u(n int) returns uuid language sql immutable as $$
  select ('00000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid
$$;
create function public.t116_as(n int) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', public.t116_u(n), 'role', 'authenticated')::text, true)
$$;
create function public.t116_h(n int) returns uuid language sql stable as $$
  select id from hh where owner_id = public.t116_u(n)
$$;
create function public.t116_member(p_n int, p_owner int) returns void language plpgsql as $$
begin
  delete from public.household_members where user_id = public.t116_u(p_n);
  insert into public.household_members (household_id, user_id, is_owner, weight, created_at)
  values (public.t116_h(p_owner), public.t116_u(p_n), false, 0, now() - interval '2 days');
end;
$$;
-- The real join path: the owner makes an invite and the person redeems it. Returns the redeem answer's ok.
create function public.t116_join(p_n int) returns text language plpgsql as $$
declare v_code text;
begin
  perform public.t116_as(1);
  v_code := public.create_invite() ->> 'code';
  perform public.t116_as(p_n);
  return public.redeem_invite(v_code) ->> 'ok';
end;
$$;

update public.plan_settings set paid_from = null, enforce_for = '{}';

-- ---- Part 1: an Extended household of 12 ----
insert into public.household_plans (household_id, payer_id, store, plan_size, status, covered_until, plan_key, period)
values (public.t116_h(1), public.t116_u(1), 'APP_STORE', 12, 'active', now() + interval '30 days', 'extended', 'month');
select public.t116_member(n, 1) from generate_series(2, 6) n;

-- 1. Members 7 to 12 join through create_invite and redeem_invite.
select extensions.is((select string_agg(public.t116_join(n), ',' order by n) from generate_series(7, 12) n),
  'true,true,true,true,true,true', 'members 7 to 12 join an Extended household through the real invite path');
select public.t116_as(1);
-- 2-4. Twelve people, twelve distinct colours, keys 0 to 11.
select extensions.is((select count(*)::int from public.household_members where household_id = public.t116_h(1)), 12, 'the household has 12 members');
select extensions.is((select array_agg(colour_key::int order by colour_key) from public.household_members where household_id = public.t116_h(1)),
  array[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], 'the 12 members hold the colours 0 to 11');
select extensions.is((select count(distinct colour_key)::int from public.household_members where household_id = public.t116_h(1)), 12,
  'no two members of the household share a colour');
-- 5. A 13th person is refused at the invite.
select extensions.is(public.create_invite() ->> 'reason', 'full', 'create_invite answers full at 12 members');
-- 6. And at the row, because no colour is free.
select extensions.throws_ok($$ select public.t116_member(13, 1) $$, '23514', 'household_full', 'a 13th direct member insert fails with household_full');
-- 7. A colour above 11 never reaches the table.
select extensions.throws_ok($$ update public.household_members set colour_key = 12 where user_id = public.t116_u(12) $$, '23514',
  'new row for relation "household_members" violates check constraint "household_members_colour_key_check"',
  'a colour key of 12 is refused by the check constraint');
-- 8-9. The member RPC accepts 0 to 11 and refuses 12.
select public.t116_as(12);
select extensions.is(public.set_my_member_display((select version from public.household_members where user_id = public.t116_u(12)),
  12::smallint, false, null) ->> 'reason', 'colour_taken', 'set_my_member_display refuses colour 12');
select extensions.is(public.set_my_member_display((select version from public.household_members where user_id = public.t116_u(12)),
  (select colour_key from public.household_members where user_id = public.t116_u(12)), false, null) ->> 'ok', 'true',
  'a member can keep their own colour above 5');
-- 10. A colour held by someone else is still refused.
select extensions.is(public.set_my_member_display((select version from public.household_members where user_id = public.t116_u(12)),
  7::smallint, false, null) ->> 'reason', 'colour_taken', 'colour 7 is held by another member, so it is taken');

-- ---- Part 2: leaving and removal on a locked household (D-03 spirit, Phase 8 D-25/D-26) ----
select public.t116_member(21, 20);
select public.t116_member(22, 20);
select public.t116_member(23, 20);
-- A waiting settle-up between 21 and 20, written while the household is still open (no claims set, so the lock lets it through).
select set_config('request.jwt.claims', '', true);
insert into public.settlements (id, household_id, kind, payer_id, receiver_id, amount, currency, status, created_by)
values ('a1160000-0000-0000-0000-000000000001', public.t116_h(20), 'payment', public.t116_u(21), public.t116_u(20), 500, 'USD', 'pending', public.t116_u(21));
insert into public.household_plans (household_id, payer_id, store, plan_size, status, covered_until, plan_key, period)
values (public.t116_h(20), null, 'NONE', 6, 'lapsed', now() - interval '2 days', 'household', 'month');

-- 11. The household is locked.
select extensions.is(public.household_writable(public.t116_h(20)), false, 'the lapsed household is locked');
-- 12-15. A member leaves.
select public.t116_as(21);
select extensions.is(public.leave_household() ->> 'ok', 'true', 'a member can leave a locked household');
select extensions.is((select status from public.settlements where id = 'a1160000-0000-0000-0000-000000000001'), 'cancelled',
  'the waiting settle-up was cancelled by the leave');
select extensions.ok(coalesce(current_setting('fincwin.plan_bypass', true), '') <> 'on', 'after leave_household the plan bypass is not on');
select extensions.is((select count(*)::int from public.household_members where household_id = public.t116_h(20)), 3,
  'the household now has 3 members');
-- 16. The bypass did not leak: a remaining member still cannot write records.
select public.t116_as(22);
select extensions.throws_ok($$ insert into public.accounts (id, household_id, created_by, name, kind, currency, opening_balance, is_shared)
  values ('a1160000-0000-0000-0000-000000000002', public.t116_h(20), public.t116_u(22), 'Locked', 'checking', 'USD', 0, false) $$,
  'PT402', 'plan locked', 'a remaining member still gets PT402 on a records write');
-- 17-19. The owner removes a member.
select public.t116_as(20);
select extensions.is(public.remove_member(public.t116_u(22)) ->> 'ok', 'true', 'the owner can remove a member from a locked household');
select extensions.ok(coalesce(current_setting('fincwin.plan_bypass', true), '') <> 'on', 'after remove_member the plan bypass is not on');
select extensions.is((select count(*)::int from public.household_members where household_id = public.t116_h(20)), 2,
  'the removed member is out of the household');
-- 20-21. The owner leaves and hands the household to the last member.
select extensions.is(public.leave_household(public.t116_u(23)) ->> 'ok', 'true', 'the owner can leave a locked household and name a new owner');
select extensions.ok(coalesce(current_setting('fincwin.plan_bypass', true), '') <> 'on'
                     and (select is_owner from public.household_members where user_id = public.t116_u(23) and household_id = public.t116_h(20)),
  'the new owner holds the household and the plan bypass is not on');

select * from extensions.finish();
rollback;
