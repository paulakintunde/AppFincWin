-- pgTAP: 05.4 M5 -- profiles.decide_shadow (server-only write) and profiles.region_subdivision (user-writable), migration 20261103000400.

begin;
create extension if not exists pgtap with schema extensions;

select extensions.plan(10);

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@test.local', '{}', now(), now());

select extensions.has_column('public','profiles','decide_shadow','decide_shadow exists');
select extensions.col_not_null('public','profiles','decide_shadow','decide_shadow is not null');
select extensions.col_default_is('public','profiles','decide_shadow','false','decide_shadow defaults false');
select extensions.has_column('public','profiles','region_subdivision','region_subdivision exists');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
select extensions.results_eq($$select decide_shadow from public.profiles where id = '11111111-1111-1111-1111-111111111111'$$, $$values (false)$$, 'own decide_shadow reads false');
select extensions.throws_ok($$update public.profiles set decide_shadow = true where id = '11111111-1111-1111-1111-111111111111'$$, '42501', null, 'client cannot give shadow consent');
select extensions.lives_ok($$update public.profiles set region_subdivision = 'CA' where id = '11111111-1111-1111-1111-111111111111'$$, 'client can set own region_subdivision');
select extensions.results_eq($$select region_subdivision from public.profiles where id = '11111111-1111-1111-1111-111111111111'$$, $$values ('CA'::text)$$, 'region_subdivision reads back');
select extensions.throws_ok($$update public.profiles set region_subdivision = 'california' where id = '11111111-1111-1111-1111-111111111111'$$, '23514', null, 'a long word is refused');

reset role;
select extensions.lives_ok($$update public.profiles set decide_shadow = true where id = '11111111-1111-1111-1111-111111111111'$$, 'the server side can set the flag');

select * from extensions.finish();
rollback;
