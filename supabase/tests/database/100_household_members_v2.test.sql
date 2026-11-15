-- pgTAP: Phase 8 members v2 (HH-03, HH-10; D-08, D-11, D-30..D-34). Owner flag and label, colours, weights with 0
-- allowed and the all-zero guard, household name, events, profile invisibility, RPC-only writes.

begin;
create extension if not exists pgtap with schema extensions;

select extensions.plan(28);

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@test.local', '{"full_name":"Alice Test"}', now(), now()),
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b@test.local', '{"full_name":"Bob Test"}', now(), now());

create temp table hh as select owner_id, id from public.households;
grant select on hh to authenticated;

-- Signup row of A, before B joins.
select is((select is_owner from public.household_members where user_id = '11111111-1111-1111-1111-111111111111'), true, 'A is the owner');
select is((select role_label from public.household_members where user_id = '11111111-1111-1111-1111-111111111111'), 'Owner', 'A label is Owner');
select is((select weight from public.household_members where user_id = '11111111-1111-1111-1111-111111111111'), 100, 'A weight is 100');
select is((select colour_key from public.household_members where user_id = '11111111-1111-1111-1111-111111111111'), 0::smallint, 'A colour is 0');
select is((select display_name from public.household_members where user_id = '11111111-1111-1111-1111-111111111111'), 'Alice', 'A display name is the first name');
select is((select name from public.households where owner_id = '11111111-1111-1111-1111-111111111111'), 'Alice''s household', 'household name defaults to the first name');
select extensions.hasnt_column('public', 'household_members', 'role', 'role column is gone');

-- B joins as superuser (B's own household of one is emptied first, so B belongs to exactly one household) with the new columns; weight 0 is allowed while A keeps 100.
delete from public.household_members where user_id = '22222222-2222-2222-2222-222222222222';
insert into public.household_members (household_id, user_id, is_owner, weight)
values ((select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), '22222222-2222-2222-2222-222222222222', false, 0);

select is((select colour_key from public.household_members where user_id = '22222222-2222-2222-2222-222222222222'), 1::smallint, 'B gets the next free colour');
select is((select role_label from public.household_members where user_id = '22222222-2222-2222-2222-222222222222'), 'Flatmate', 'B label defaults to Flatmate');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);

select is(public.set_my_member_display(1, 0::smallint, false, 'Bobby') ->> 'reason', 'colour_taken', 'taking A''s colour is refused');
select is(public.set_my_member_display(1, 2::smallint, true, 'Bobby') ->> 'ok', 'true', 'own colour and hidden name accepted');
select is(public.set_member_role('22222222-2222-2222-2222-222222222222', 'Lodger', 2) ->> 'ok', 'true', 'B sets own label');
select is(public.set_member_role('22222222-2222-2222-2222-222222222222', repeat('x', 25), 3) ->> 'reason', 'invalid_role', 'a 25 character label is refused');
select is(public.set_member_role('11111111-1111-1111-1111-111111111111', 'Partner', 1) ->> 'ok', 'false', 'B cannot relabel the owner');

create temp table w1 as select public.set_member_weights('{"11111111-1111-1111-1111-111111111111":60,"22222222-2222-2222-2222-222222222222":40}'::jsonb) as r;
grant select on w1 to authenticated;
select is((select r ->> 'ok' from w1), 'true', 'weights 60/40 accepted');
select ok((select r -> 'before' from w1) is not null, 'weights call returns the before map for Undo');
select is(public.set_member_weights('{"11111111-1111-1111-1111-111111111111":0,"22222222-2222-2222-2222-222222222222":0}'::jsonb) ->> 'reason', 'all_zero', 'all zero refused');
select is(public.set_member_weights('{"11111111-1111-1111-1111-111111111111":70,"22222222-2222-2222-2222-222222222222":40}'::jsonb) ->> 'reason', 'not_100', 'sum other than 100 refused');
select is(public.set_member_weights('{"11111111-1111-1111-1111-111111111111":100,"22222222-2222-2222-2222-222222222222":0}'::jsonb) ->> 'ok', 'true', '100/0 accepted: a weight of 0 is allowed');

-- Rename: B is not the owner.
select is(public.rename_household('B''s place', 1) ->> 'reason', 'not_owner', 'non-owner cannot rename');

-- B cannot see A's profile (D-32).
select is((select count(*) from public.profiles where id = '11111111-1111-1111-1111-111111111111'), 0::bigint, 'B cannot read A''s profile');

-- Direct writes are refused.
select throws_ok($$insert into public.household_events (household_id, kind) values ((select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'renamed')$$, '42501', null, 'clients cannot insert events');
select throws_ok($$update public.household_members set weight = 1$$, '42501', null, 'clients cannot update members');

-- A renames.
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
select is(public.rename_household('The Flat', (select version from public.households where owner_id = '11111111-1111-1111-1111-111111111111')) ->> 'ok', 'true', 'owner renames');

reset role;
select is((select count(*) from public.household_events where kind = 'renamed'), 1::bigint, 'exactly one renamed event');

-- Audience-limited event is invisible to B.
insert into public.household_events (household_id, kind, audience)
values ((select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'settle_ask', array['11111111-1111-1111-1111-111111111111'::uuid]);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
select is((select count(*) from public.household_events where kind = 'settle_ask'), 0::bigint, 'audience event hidden from B');
reset role;

-- Every weight at 0 fails at commit time (guard, D-30).
select throws_ok(
  $t$do $x$ begin update public.household_members set weight = 0; set constraints all immediate; end $x$$t$,
  '23514', null, 'all weights at 0 is refused');

select ok(not has_function_privilege('anon', 'public.set_member_weights(jsonb)', 'execute'), 'anon cannot execute set_member_weights');

select * from extensions.finish();
rollback;
