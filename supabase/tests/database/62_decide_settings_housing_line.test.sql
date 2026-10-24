-- pgTAP: Phase 5 (05-119, R18.4; D-103) -- decide_settings.housing_line, migration 20261024000200.
-- Up to 3 digits and 4 decimals, at most 100; insert and update column grants; owner-private.
--
-- Needs 20261016000100 and 20261024000200.

begin;
create extension if not exists pgtap with schema extensions;

select extensions.plan(20);

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@test.local', '{}', now(), now()),
  ('33333333-3333-3333-3333-333333333333', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'c@test.local', '{}', now(), now());

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

-- The first save, in the exact shape PostgREST sends an upsert (see 60_decide_review_fixes CR-A01).
select extensions.lives_ok(
  $$insert into public.decide_settings (user_id, currency, housing_line) values ('11111111-1111-1111-1111-111111111111', 'USD', null)
    on conflict (user_id) do update set user_id = excluded.user_id, currency = excluded.currency, housing_line = excluded.housing_line$$,
  'the first upsert, with housing_line null, succeeds');
select extensions.is(
  (select housing_line from public.decide_settings where user_id = '11111111-1111-1111-1111-111111111111'),
  null, 'housing_line is null by default');

select extensions.lives_ok(
  $$insert into public.decide_settings (user_id, housing_line) values ('11111111-1111-1111-1111-111111111111', '28')
    on conflict (user_id) do update set user_id = excluded.user_id, housing_line = excluded.housing_line$$,
  'an upsert setting housing_line to 28 succeeds through the column grants');
select extensions.is(
  (select housing_line from public.decide_settings where user_id = '11111111-1111-1111-1111-111111111111'),
  '28', 'the upsert stored 28');

select extensions.lives_ok(
  $$update public.decide_settings set housing_line = '100' where user_id = '11111111-1111-1111-1111-111111111111'$$,
  'housing_line 100 is accepted (the check accepts the upper bound)');
select extensions.lives_ok(
  $$update public.decide_settings set housing_line = '0.5' where user_id = '11111111-1111-1111-1111-111111111111'$$,
  'housing_line 0.5 is accepted');
select extensions.lives_ok(
  $$update public.decide_settings set housing_line = '28.0001' where user_id = '11111111-1111-1111-1111-111111111111'$$,
  'housing_line with four decimals is accepted');
select extensions.lives_ok(
  $$update public.decide_settings set housing_line = null where user_id = '11111111-1111-1111-1111-111111111111'$$,
  'housing_line can be cleared back to the default');

select extensions.throws_ok(
  $$update public.decide_settings set housing_line = '101' where user_id = '11111111-1111-1111-1111-111111111111'$$,
  '23514', null, 'housing_line 101 is refused (over 100)');
select extensions.throws_ok(
  $$update public.decide_settings set housing_line = '100.0001' where user_id = '11111111-1111-1111-1111-111111111111'$$,
  '23514', null, 'housing_line 100.0001 is refused (over 100)');
select extensions.throws_ok(
  $$update public.decide_settings set housing_line = '28.00001' where user_id = '11111111-1111-1111-1111-111111111111'$$,
  '23514', null, 'housing_line with five decimals is refused');
select extensions.throws_ok(
  $$update public.decide_settings set housing_line = 'abc' where user_id = '11111111-1111-1111-1111-111111111111'$$,
  '23514', null, 'housing_line abc is refused');
select extensions.throws_ok(
  $$update public.decide_settings set housing_line = '-1' where user_id = '11111111-1111-1111-1111-111111111111'$$,
  '23514', null, 'housing_line -1 is refused');
select extensions.throws_ok(
  $$update public.decide_settings set housing_line = '' where user_id = '11111111-1111-1111-1111-111111111111'$$,
  '23514', null, 'an empty housing_line is refused');
select extensions.throws_ok(
  $$update public.decide_settings set housing_line = '1000' where user_id = '11111111-1111-1111-1111-111111111111'$$,
  '23514', null, 'a four-digit housing_line is refused');

-- Other users cannot read or write it.
select extensions.lives_ok(
  $$update public.decide_settings set housing_line = '30' where user_id = '11111111-1111-1111-1111-111111111111'$$,
  'A sets housing_line to 30');
select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true);
select extensions.is(
  (select count(*)::int from public.decide_settings where user_id = '11111111-1111-1111-1111-111111111111'),
  0, 'another user cannot read A''s settings row');
update public.decide_settings set housing_line = '50' where user_id = '11111111-1111-1111-1111-111111111111';
select extensions.lives_ok(
  $$insert into public.decide_settings (user_id, housing_line) values ('11111111-1111-1111-1111-111111111111', '50')$$,
  'an insert naming A''s user id runs, pinned to the caller by fill_decide_settings');
select extensions.is(
  (select user_id::text || '/' || housing_line from public.decide_settings),
  '33333333-3333-3333-3333-333333333333/50', 'the row landed under the caller''s own id, not A''s');
reset role;
select extensions.is(
  (select housing_line from public.decide_settings where user_id = '11111111-1111-1111-1111-111111111111'),
  '30', 'A''s housing_line is unchanged after the other user''s attempts');

select * from extensions.finish();
rollback;
