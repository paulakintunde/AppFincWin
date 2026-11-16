-- pgTAP: 05.5-27 (Q11 = A) -- decide_settings.unspent_anchor_set_at is stamped by the server whenever the spare-money
-- anchor changes, and no client can write it. Migration 20261116000200.
--
-- Needs 20261028000100 (unspent_anchor, unspent_anchor_at) and 20261116000200.
-- now() is fixed inside one transaction, so an older stamp is planted with the trigger switched off.

begin;
create extension if not exists pgtap with schema extensions;

select extensions.plan(13);

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@test.local', '{}', now(), now()),
  ('33333333-3333-3333-3333-333333333333', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'c@test.local', '{}', now(), now()),
  ('44444444-4444-4444-4444-444444444444', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'd@test.local', '{}', now(), now());

create function public.t99a_ver(i uuid) returns integer language sql security definer set search_path = '' as $$
  select version from public.decide_settings where id = i $$;
grant execute on function public.t99a_ver(uuid) to authenticated;
create function public.t99a_ap(i uuid, p jsonb) returns text language sql as $$
  select (public.apply_patches(jsonb_build_array(jsonb_build_object(
    'entity', 'decide_settings', 'id', i, 'expectedVersion', public.t99a_ver(i), 'patch', p))) ->> 'status');
$$;
grant execute on function public.t99a_ap(uuid, jsonb) to authenticated;

select extensions.has_column('public', 'decide_settings', 'unspent_anchor_set_at', 'unspent_anchor_set_at exists');

-- 1. Insert: stamped when an anchor comes with it, null when not, and a forged value is overwritten.
insert into public.decide_settings (user_id, currency, unspent_anchor, unspent_anchor_at) values
  ('11111111-1111-1111-1111-111111111111', 'USD', 100000, current_date);
insert into public.decide_settings (user_id, currency) values
  ('33333333-3333-3333-3333-333333333333', 'USD');
insert into public.decide_settings (user_id, currency, unspent_anchor_set_at) values
  ('44444444-4444-4444-4444-444444444444', 'USD', '2001-01-01T00:00:00Z');

create temp table sid as select id, user_id from public.decide_settings;
grant select on sid to authenticated;

select extensions.is(
  (select unspent_anchor_set_at from public.decide_settings where user_id = '11111111-1111-1111-1111-111111111111'),
  now(), 'insert with an anchor is stamped with the server time');
select extensions.is(
  (select unspent_anchor_set_at from public.decide_settings where user_id = '33333333-3333-3333-3333-333333333333'),
  null, 'insert without an anchor is not stamped');
select extensions.is(
  (select unspent_anchor_set_at from public.decide_settings where user_id = '44444444-4444-4444-4444-444444444444'),
  null, 'a stamp carried on insert is overwritten (no anchor, so null)');

-- Plant an old stamp (trigger off), as the table owner.
alter table public.decide_settings disable trigger stamp_unspent_anchor_set_at;
update public.decide_settings set unspent_anchor_set_at = '2020-01-01T00:00:00Z' where user_id = '11111111-1111-1111-1111-111111111111';
alter table public.decide_settings enable trigger stamp_unspent_anchor_set_at;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

-- 2. Another column changes: the stamp is kept.
select extensions.is(
  public.t99a_ap((select id from sid where user_id = '11111111-1111-1111-1111-111111111111'), '{"rough_income":500000}'),
  'applied', 'an unrelated patch applies');
select extensions.is(
  (select unspent_anchor_set_at from public.decide_settings where user_id = '11111111-1111-1111-1111-111111111111'),
  '2020-01-01T00:00:00Z'::timestamptz, 'another column changing keeps the stamp');

-- 3. The amount changes: re-stamped.
update public.decide_settings set unspent_anchor = 200000 where user_id = '11111111-1111-1111-1111-111111111111';
select extensions.is(
  (select unspent_anchor_set_at from public.decide_settings where user_id = '11111111-1111-1111-1111-111111111111'),
  now(), 'a new amount re-stamps');

-- 4. Only the date changes: re-stamped too (plant again first).
reset role;
alter table public.decide_settings disable trigger stamp_unspent_anchor_set_at;
update public.decide_settings set unspent_anchor_set_at = '2020-01-01T00:00:00Z' where user_id = '11111111-1111-1111-1111-111111111111';
alter table public.decide_settings enable trigger stamp_unspent_anchor_set_at;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
update public.decide_settings set unspent_anchor_at = current_date - 1 where user_id = '11111111-1111-1111-1111-111111111111';
select extensions.is(
  (select unspent_anchor_set_at from public.decide_settings where user_id = '11111111-1111-1111-1111-111111111111'),
  now(), 'a new date re-stamps');

-- 5. Cleared: null.
update public.decide_settings set unspent_anchor = null, unspent_anchor_at = null where user_id = '11111111-1111-1111-1111-111111111111';
select extensions.is(
  (select unspent_anchor_set_at from public.decide_settings where user_id = '11111111-1111-1111-1111-111111111111'),
  null, 'clearing the anchor clears the stamp');

-- 6. No client write path.
select extensions.is(has_column_privilege('authenticated', 'public.decide_settings', 'unspent_anchor_set_at', 'update'),
  false, 'authenticated has no update grant on the column');
select extensions.is(has_column_privilege('authenticated', 'public.decide_settings', 'unspent_anchor_set_at', 'insert'),
  false, 'authenticated has no insert grant on the column');
select extensions.throws_ok(
  $$update public.decide_settings set unspent_anchor_set_at = now() where user_id = '11111111-1111-1111-1111-111111111111'$$,
  '42501', null, 'a direct client update of the column is refused');
select extensions.throws_ok(
  $$select public.t99a_ap((select id from sid where user_id = '11111111-1111-1111-1111-111111111111'), '{"unspent_anchor_set_at":"2030-01-01T00:00:00Z"}')$$,
  '22023', null, 'a client patch naming the column is refused');

select * from extensions.finish();
rollback;
