-- pgTAP: quick 261124-2bs (09-HUMAN-UAT C2 row 1). Needs 20261125001200_plan_state_left_at.sql.
-- plan_state() returns left_at / left_home_name only for a person who is alone in a household created by their own leave.

begin;
create extension if not exists pgtap with schema extensions;

select extensions.plan(11);

-- A owns the old home; B left it; C left a home that is gone; D has a leave logged AFTER their household was made;
-- E shares a household with A and has a log row; F never left anything.
insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values
  ('a1200000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@t120.local', '{"full_name":"Ann Test"}', now(), now()),
  ('a1200000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b@t120.local', '{"full_name":"Bob Test"}', now(), now()),
  ('a1200000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'c@t120.local', '{"full_name":"Cy Test"}', now(), now()),
  ('a1200000-0000-0000-0000-00000000000d', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'd@t120.local', '{"full_name":"Di Test"}', now(), now()),
  ('a1200000-0000-0000-0000-00000000000e', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'e@t120.local', '{"full_name":"Ed Test"}', now(), now()),
  ('a1200000-0000-0000-0000-00000000000f', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'f@t120.local', '{"full_name":"Flo Test"}', now(), now());

update public.households set name = 'Old Home' where owner_id = 'a1200000-0000-0000-0000-00000000000a';

-- E joins A's household (first by created_at, so it is E's current home with two members).
delete from public.household_members where user_id = 'a1200000-0000-0000-0000-00000000000e';
insert into public.household_members (household_id, user_id, is_owner, weight, created_at)
values ((select id from public.households where owner_id = 'a1200000-0000-0000-0000-00000000000a'),
        'a1200000-0000-0000-0000-00000000000e', false, 0, now() - interval '1 day');

-- Leave log rows (the table is closed to clients, so insert as the superuser).
insert into public.household_leave_log (user_id, household_id, left_at, reason) values
  ('a1200000-0000-0000-0000-00000000000b', (select id from public.households where owner_id = 'a1200000-0000-0000-0000-00000000000a'), now(), 'left'),
  ('a1200000-0000-0000-0000-00000000000c', 'a1200000-0000-0000-0000-0000000000ff', now(), 'left'),
  ('a1200000-0000-0000-0000-00000000000d', 'a1200000-0000-0000-0000-0000000000fe', now() + interval '1 hour', 'left'),
  ('a1200000-0000-0000-0000-00000000000e', 'a1200000-0000-0000-0000-0000000000fd', now(), 'left');

set local role authenticated;

-- 1-2. Never left anything.
select set_config('request.jwt.claims', '{"sub":"a1200000-0000-0000-0000-00000000000f","role":"authenticated"}', true);
select extensions.is(public.plan_state() ->> 'left_at', null, 'no leave log: left_at is null');
select extensions.is(public.plan_state() ->> 'left_home_name', null, 'no leave log: left_home_name is null');

-- 3-4. Left a home that still exists.
select set_config('request.jwt.claims', '{"sub":"a1200000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
select extensions.isnt(public.plan_state() ->> 'left_at', null, 'alone after leaving: left_at is set');
select extensions.is(public.plan_state() ->> 'left_home_name', 'Old Home', 'alone after leaving: the home left is named');

-- 5-6. Left a home that has since been deleted.
select set_config('request.jwt.claims', '{"sub":"a1200000-0000-0000-0000-00000000000c","role":"authenticated"}', true);
select extensions.isnt(public.plan_state() ->> 'left_at', null, 'left a deleted home: left_at is still set');
select extensions.is(public.plan_state() ->> 'left_home_name', null, 'left a deleted home: left_home_name is null');

-- 7. An unrelated log row that came after the current household was made does not count.
select set_config('request.jwt.claims', '{"sub":"a1200000-0000-0000-0000-00000000000d","role":"authenticated"}', true);
select extensions.is(public.plan_state() ->> 'left_at', null, 'household older than the leave: left_at is null');

-- 8. Two or more members: null even with a log row.
select set_config('request.jwt.claims', '{"sub":"a1200000-0000-0000-0000-00000000000e","role":"authenticated"}', true);
select extensions.is(public.plan_state() ->> 'left_at', null, 'two members in the current home: left_at is null');

-- 9. All 23 existing keys plus the two new ones.
select extensions.is((select count(*)::int from jsonb_object_keys(public.plan_state())), 25, 'plan_state has 25 keys (23 existing + left_at + left_home_name)');

-- 10-11. Grants unchanged.
reset role;
select extensions.is(has_function_privilege('anon', 'public.plan_state()', 'execute'), false, 'anon cannot execute plan_state');
select extensions.is(has_function_privilege('authenticated', 'public.plan_state()', 'execute'), true, 'authenticated can execute plan_state');

select * from extensions.finish();
rollback;
