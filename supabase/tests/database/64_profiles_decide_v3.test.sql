-- pgTAP: 05.2 D-02 -- profiles.decide_v3, migration 20261028000200. Server-only write.
-- Needs 20261028000200.

begin;
create extension if not exists pgtap with schema extensions;

select extensions.plan(8);

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@test.local', '{}', now(), now()),
  ('33333333-3333-3333-3333-333333333333', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'c@test.local', '{}', now(), now());

select extensions.has_column('public','profiles','decide_v3','decide_v3 exists');
select extensions.col_not_null('public','profiles','decide_v3','decide_v3 is not null');
select extensions.col_default_is('public','profiles','decide_v3','false','decide_v3 defaults false');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
select extensions.results_eq($$select decide_v3 from public.profiles where id = '11111111-1111-1111-1111-111111111111'$$, $$values (false)$$, 'own decide_v3 reads false');
select extensions.throws_ok($$update public.profiles set decide_v3 = true where id = '11111111-1111-1111-1111-111111111111'$$, '42501', null, 'client cannot enable the v3 switch');
select extensions.is((select count(*)::int from public.profiles where id = '33333333-3333-3333-3333-333333333333'), 0, 'another profile is not visible');

reset role;
select extensions.lives_ok($$update public.profiles set decide_v3 = true where id = '11111111-1111-1111-1111-111111111111'$$, 'owner can set the flag');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
select extensions.results_eq($$select decide_v3 from public.profiles where id = '11111111-1111-1111-1111-111111111111'$$, $$values (true)$$, 'own decide_v3 now reads true');

select * from extensions.finish();
rollback;
