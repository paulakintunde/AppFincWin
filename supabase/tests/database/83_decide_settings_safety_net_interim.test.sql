-- pgTAP: 05.4 D-33 -- decide_settings.safety_net_protect and safety_net_size (interim, removed in 05.5), migration 20261103000300.
-- Needs 20261016000100 and 20261103000300.

begin;
create extension if not exists pgtap with schema extensions;

select extensions.plan(8);

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@test.local', '{}', now(), now()),
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b@test.local', '{}', now(), now());

insert into public.decide_settings (user_id, currency) values ('11111111-1111-1111-1111-111111111111', 'USD');

select extensions.has_column('public', 'decide_settings', 'safety_net_protect', 'safety_net_protect exists');
select extensions.has_column('public', 'decide_settings', 'safety_net_size', 'safety_net_size exists');
select extensions.col_default_is('public', 'decide_settings', 'safety_net_protect', 'true', 'the safety net is protected by default');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

select extensions.lives_ok($$update public.decide_settings set safety_net_protect = false, safety_net_size = 250000 where user_id = '11111111-1111-1111-1111-111111111111'$$,
  'the owner switches the safety net off and sets a size');
select extensions.is((select safety_net_size from public.decide_settings where user_id = '11111111-1111-1111-1111-111111111111'),
  250000::bigint, 'the size reads back');
select extensions.throws_ok($$update public.decide_settings set safety_net_size = -1 where user_id = '11111111-1111-1111-1111-111111111111'$$,
  '23514', null, 'a negative size is refused');

select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
with u as (update public.decide_settings set safety_net_protect = true where user_id = '11111111-1111-1111-1111-111111111111' returning 1)
select extensions.is((select count(*)::int from u), 0, 'another user updates 0 rows of A');
select extensions.is((select count(*)::int from public.decide_settings where user_id = '11111111-1111-1111-1111-111111111111'),
  0, 'another user reads no settings row of A');

select * from extensions.finish();
rollback;
