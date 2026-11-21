-- pgTAP: Phase 8 plan 08-09 (HH-01, HH-02, HH-15; D-02, D-03, D-05, D-10; T-08-31, T-08-33, T-08-34, T-08-109).
-- Invite lifecycle: owner-only, 7 days, single use, cancel and undo, the 6-person cap, a persisted per-user rate limit,
-- no global brake, and no oracle between the ways a code can be dead.

begin;
create extension if not exists pgtap with schema extensions;

select extensions.plan(41);

-- A owner, B member, C D E F joiners, G H I extra members for the cap.
insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
select ('' || n || n || n || n || n || n || n || n || '-' || n || n || n || n || '-' || n || n || n || n || '-' || n || n || n || n || '-' || n || n || n || n || n || n || n || n || n || n || n || n)::uuid,
       '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'u' || n || '@test.local',
       json_build_object('full_name', 'User ' || n)::jsonb, now(), now()
  from generate_series(1, 9) n;

create temp table hh as select owner_id, id from public.households;
grant select on hh to authenticated;
create temp table codes (label text primary key, code text, invite_id uuid);
grant all on codes to authenticated;

create function public.t105_as(u text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true)
$$;

-- B joins A's household (superuser), so B is a member who is not the owner.
delete from public.household_members where user_id = '22222222-2222-2222-2222-222222222222';
insert into public.household_members (household_id, user_id, is_owner, weight, created_at)
values ((select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), '22222222-2222-2222-2222-222222222222', false, 0, now() - interval '1 day');

set local role authenticated;

-- 1-3. Only the owner creates an invite; the code is 12 Crockford symbols in three groups.
select public.t105_as('22222222-2222-2222-2222-222222222222');
select extensions.is(public.create_invite() ->> 'reason', 'not_owner', 'a member who is not the owner cannot create an invite (D-05)');

select public.t105_as('11111111-1111-1111-1111-111111111111');
insert into codes select 'k1', r ->> 'code', (r ->> 'invite_id')::uuid from (select public.create_invite() r) s;
select extensions.is((select count(*)::int from codes where label = 'k1' and code is not null), 1, 'the owner creates an invite');
select extensions.matches((select code from codes where label = 'k1'),
  '^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$', 'the code is three groups of four Crockford symbols');

-- 4-5. The code and its hash are never readable by a client.
select extensions.is(has_column_privilege('authenticated', 'public.household_invites', 'code', 'select'), false, 'authenticated cannot read the plain code column');
select extensions.is(has_column_privilege('authenticated', 'public.household_invites', 'code_hash', 'select'), false, 'authenticated cannot read the code hash column');

-- 6-7. Guessing is futile: 60 bits, and 20 guesses a day is a vanishing chance.
select extensions.ok(round(12 * log(2::numeric, 32::numeric))::int >= 60, '12 symbols of 32 give at least 60 bits');
select extensions.ok(20 / power(2::numeric, 60) < 1e-16, '20 guesses a day against 2^60 codes succeed with chance below 1e-16');

-- 8-11. Expiry is checked by the server on every use.
reset role;
update public.household_invites set expires_at = now() - interval '1 second' where id = (select invite_id from codes where label = 'k1');
set local role authenticated;
select public.t105_as('33333333-3333-3333-3333-333333333333');
select extensions.is(public.redeem_invite((select code from codes where label = 'k1')), '{"ok": false, "reason": "invalid"}'::jsonb, 'an expired code redeems as invalid');
select extensions.is(public.preview_invite((select code from codes where label = 'k1')), '{"ok": false, "reason": "invalid"}'::jsonb, 'an expired code previews as invalid');
select public.t105_as('44444444-4444-4444-4444-444444444444');
select extensions.is(public.redeem_invite('ZZZZ-ZZZZ-ZZZZ'), '{"ok": false, "reason": "invalid"}'::jsonb, 'an unknown code is the same invalid answer');
select public.t105_as('11111111-1111-1111-1111-111111111111');
select extensions.is((select count(*)::int from public.my_open_invites() j, jsonb_array_elements(j -> 'invites')), 0, 'an expired invite is not listed as open');

-- 12-18. Cancel, undo, and the privacy rule on someone else's invite.
insert into codes select 'k2', r ->> 'code', (r ->> 'invite_id')::uuid from (select public.create_invite() r) s;
select extensions.is(public.cancel_invite((select invite_id from codes where label = 'k2')) ->> 'ok', 'true', 'the creator cancels an invite');
select public.t105_as('44444444-4444-4444-4444-444444444444');
select extensions.is(public.redeem_invite((select code from codes where label = 'k2')), '{"ok": false, "reason": "invalid"}'::jsonb, 'a cancelled code redeems as invalid');
select public.t105_as('22222222-2222-2222-2222-222222222222');
select extensions.is(public.cancel_invite((select invite_id from codes where label = 'k2')),
  public.cancel_invite('ffffffff-ffff-ffff-ffff-ffffffffffff'), 'another member cancelling A''s invite is refused like a missing id');
select extensions.is(public.restore_invite((select invite_id from codes where label = 'k2')),
  public.restore_invite('ffffffff-ffff-ffff-ffff-ffffffffffff'), 'another member restoring A''s invite is refused like a missing id');
select extensions.is((select count(*)::int from public.household_invites), 0, 'a member who did not create the invites sees none');
select public.t105_as('11111111-1111-1111-1111-111111111111');
select extensions.is(public.restore_invite((select invite_id from codes where label = 'k2')) ->> 'ok', 'true', 'undo restores a cancel within 24 hours');
select extensions.is((select count(*)::int from public.household_invites), 2, 'the creator sees their own invites');

-- 19-21. Single use (D-03). C redeems; D with the same code is refused.
insert into codes select 'k3', r ->> 'code', (r ->> 'invite_id')::uuid from (select public.create_invite() r) s;
select public.t105_as('33333333-3333-3333-3333-333333333333');
select extensions.is(public.redeem_invite((select code from codes where label = 'k3')) ->> 'ok', 'true', 'a valid code joins at once (D-04)');
select public.t105_as('44444444-4444-4444-4444-444444444444');
select extensions.is(public.redeem_invite((select code from codes where label = 'k3')), '{"ok": false, "reason": "invalid"}'::jsonb, 'a used code redeems as invalid (D-03)');
reset role;
select extensions.ok((select used_at is not null and code is null and used_by = '33333333-3333-3333-3333-333333333333' from public.household_invites where id = (select invite_id from codes where label = 'k3')),
  'a used invite records who used it and drops the plain code');
set local role authenticated;

-- 22-24. The cap: members plus open invites never exceed 6 (D-10). A has A B C, plus G and H = 5, plus the open K2.
reset role;
delete from public.household_members where user_id in ('77777777-7777-7777-7777-777777777777', '88888888-8888-8888-8888-888888888888', '99999999-9999-9999-9999-999999999999');
insert into public.household_members (household_id, user_id, is_owner, weight, created_at)
select (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), u, false, 0, now() - interval '12 hours'
  from unnest(array['77777777-7777-7777-7777-777777777777', '88888888-8888-8888-8888-888888888888']::uuid[]) u;
set local role authenticated;
select public.t105_as('11111111-1111-1111-1111-111111111111');
select extensions.is(public.create_invite() ->> 'reason', 'full', '5 members plus 1 open invite is the cap: the next invite is refused');
reset role;
insert into public.household_members (household_id, user_id, is_owner, weight, created_at)
values ((select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), '99999999-9999-9999-9999-999999999999', false, 0, now() - interval '11 hours');
set local role authenticated;
select public.t105_as('66666666-6666-6666-6666-666666666666');
select extensions.is(public.redeem_invite((select code from codes where label = 'k2')) ->> 'reason', 'full', 'a 7th person is refused when 6 are in');
reset role;
select extensions.is((select count(*)::int from public.household_members where user_id = '66666666-6666-6666-6666-666666666666' and household_id = (select id from hh where owner_id = '66666666-6666-6666-6666-666666666666')),
  1, 'the refused person keeps their own household');
delete from public.household_members where user_id in ('77777777-7777-7777-7777-777777777777', '88888888-8888-8888-8888-888888888888', '99999999-9999-9999-9999-999999999999');
set local role authenticated;

-- 25-28. The failure counter persists, per user, and limits the sixth call even for a valid code (HH-15).
select public.t105_as('11111111-1111-1111-1111-111111111111');
insert into codes select 'k4', r ->> 'code', (r ->> 'invite_id')::uuid from (select public.create_invite() r) s;
select public.t105_as('55555555-5555-5555-5555-555555555555');
select extensions.is(
  (select array_agg(public.redeem_invite('WRONG-CODE-' || g) -> 'reason') from generate_series(1, 5) g),
  array['"invalid"', '"invalid"', '"invalid"', '"invalid"', '"invalid"']::jsonb[], 'five wrong codes are each invalid');
reset role;
select extensions.is((select count(*)::int from public.redeem_attempts where user_id = '55555555-5555-5555-5555-555555555555' and not ok), 5, 'the five failures were persisted although the calls failed');
set local role authenticated;
select public.t105_as('55555555-5555-5555-5555-555555555555');
select extensions.is(public.redeem_invite((select code from codes where label = 'k4')) ->> 'reason', 'slow_down', 'the sixth call, even with a valid code, is slowed down');
select extensions.is(public.preview_invite((select code from codes where label = 'k4')) ->> 'reason', 'slow_down', 'preview shares the same limit');
select public.t105_as('44444444-4444-4444-4444-444444444444');
select extensions.is(public.redeem_invite('NOPE-NOPE-NOPE') ->> 'reason', 'invalid', 'another user''s failures do not limit D');

-- 29-30. The 20-a-day limit counts failures older than an hour.
reset role;
insert into public.redeem_attempts (user_id, ok, at)
select '77777777-7777-7777-7777-777777777777', false, now() - interval '3 hours' - g * interval '1 minute' from generate_series(1, 20) g;
set local role authenticated;
select public.t105_as('77777777-7777-7777-7777-777777777777');
select extensions.is(public.redeem_invite((select code from codes where label = 'k4')) ->> 'reason', 'slow_down', '20 failures in a day limit a user though none are in the last hour');
select public.t105_as('44444444-4444-4444-4444-444444444444');
select extensions.is(public.preview_invite((select code from codes where label = 'k4')) ->> 'ok', 'true', 'preview of a valid code succeeds');

-- 31-34. No global brake (T-08-109): 200 foreign failures in the last hour do not block F.
reset role;
insert into public.redeem_attempts (user_id, ok, at)
select ('11111111-1111-1111-1111-111111111111')::uuid, false, now() - g * interval '1 second' from generate_series(1, 200) g;
set local role authenticated;
select public.t105_as('66666666-6666-6666-6666-666666666666');
select extensions.is(public.redeem_invite((select code from codes where label = 'k4')) ->> 'ok', 'true', 'a valid code still redeems under 200 foreign failures an hour');
reset role;
select extensions.ok(public.hh_redeem_failure_rate() >= 200, 'the global failure rate is measured for alerting');
select extensions.is(has_function_privilege('authenticated', 'public.hh_redeem_failure_rate()', 'execute'), false, 'a client cannot read the global failure rate');
select extensions.is(has_function_privilege('anon', 'public.redeem_invite(text, text)', 'execute'), false, 'anon cannot redeem an invite');

-- 35-37. Rate limiting is fed by one table nobody can read.
select extensions.is(has_table_privilege('authenticated', 'public.redeem_attempts', 'select'), false, 'redeem_attempts is not readable by clients');
select extensions.is(has_function_privilege('anon', 'public.create_invite()', 'execute'), false, 'anon cannot create an invite');
select extensions.is(has_function_privilege('authenticated', 'public.hh_rate_limited(uuid)', 'execute'), false, 'the rate-limit helper is not client-callable');

-- 38-40. Alphabet and normalisation: look-alike letters, dashes and spaces and case are forgiven.
select extensions.is(public.hh_normalise_code(' abcd-efgh-ijkl '), 'ABCDEFGH1JK1', 'O, I, L and dashes normalise like Crockford');
select extensions.is(public.hh_code_hash('0O0O-1I1I-1L1L'), public.hh_code_hash('0000 1111 1111'), 'look-alike symbols hash alike');
select extensions.is((select count(*)::int from (select public.hh_new_invite_code() c from generate_series(1, 50)) s where c !~ '^[0-9A-HJKMNP-TV-Z]{12}$'), 0, 'every generated code is 12 symbols of the Crockford alphabet');

select * from extensions.finish();
rollback;
