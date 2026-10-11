-- pgTAP: Phase 02.1 plan 02 -- statement-uploads bucket, owner-folder INSERT policy,
-- stale_statement_uploads() selector and hourly purge job (IMP-03; D-07, D-10, D-12, D-13).
--
-- Needs 20261011000100 and 20261011000200.

begin;
create extension if not exists pgtap with schema extensions;

select extensions.plan(19);

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@test.local', '{}', now(), now()),
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b@test.local', '{}', now(), now());

-- Note: storage.protect_delete blocks direct DELETE for every role, so delete
-- denial is covered by the 'exactly one policy, INSERT' assertions instead.

-- 1. Bucket settings.
select extensions.is(
  (select public from storage.buckets where id = 'statement-uploads'), false, 'bucket is private');
select extensions.is(
  (select file_size_limit from storage.buckets where id = 'statement-uploads'), 10485760::bigint, 'bucket caps files at 10 MB');
select extensions.is(
  (select allowed_mime_types from storage.buckets where id = 'statement-uploads'), array['application/pdf'], 'bucket allows application/pdf only');

-- 5. Exactly one policy, and it is INSERT.
select extensions.is(
  (select count(*)::int from pg_policies where schemaname = 'storage' and tablename = 'objects'
     and (coalesce(qual, '') || coalesce(with_check, '')) like '%statement-uploads%'),
  1, 'exactly one storage policy mentions statement-uploads');
select extensions.is(
  (select cmd from pg_policies where schemaname = 'storage' and tablename = 'objects'
     and (coalesce(qual, '') || coalesce(with_check, '')) like '%statement-uploads%'),
  'INSERT', 'that policy is INSERT only');

-- 2-4. Behaviour as user A.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

select extensions.lives_ok(
  $$insert into storage.objects (bucket_id, name) values ('statement-uploads', '11111111-1111-1111-1111-111111111111/aaaaaaaa-0000-0000-0000-000000000001.pdf')$$,
  'owner can upload into own folder');
select extensions.throws_ok(
  $$insert into storage.objects (bucket_id, name) values ('statement-uploads', '22222222-2222-2222-2222-222222222222/aaaaaaaa-0000-0000-0000-000000000002.pdf')$$,
  '42501', null, 'cannot upload into another user''s folder');
select extensions.throws_ok(
  $$insert into storage.objects (bucket_id, name) values ('statement-uploads', '11111111-1111-1111-1111-111111111111/nested/aaaaaaaa-0000-0000-0000-000000000003.pdf')$$,
  '42501', null, 'cannot upload into a nested path');
select extensions.throws_ok(
  $$insert into storage.objects (bucket_id, name) values ('statement-uploads', '11111111-1111-1111-1111-111111111111/aaaaaaaa-0000-0000-0000-000000000004.csv')$$,
  '42501', null, 'cannot upload a non-pdf name');
select extensions.is(
  (select count(*)::int from storage.objects where bucket_id = 'statement-uploads'), 0, 'owner cannot see even their own upload');
do $$
declare n integer;
begin
  update storage.objects set metadata = '{}'::jsonb where bucket_id = 'statement-uploads';
  get diagnostics n = row_count;
  perform set_config('pgtap.upd', n::text, true);
end $$;
select extensions.is(current_setting('pgtap.upd')::int, 0, 'owner cannot update objects');
select extensions.throws_ok(
  $$select public.stale_statement_uploads()$$, '42501', null, 'authenticated cannot call the purge selector');

-- anon.
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select extensions.throws_ok(
  $$insert into storage.objects (bucket_id, name) values ('statement-uploads', '11111111-1111-1111-1111-111111111111/aaaaaaaa-0000-0000-0000-000000000005.pdf')$$,
  '42501', null, 'anon cannot upload');

-- 6. Selector as the owner role.
reset role;
insert into storage.buckets (id, name, public) values ('pgtap-other', 'pgtap-other', false);
insert into storage.objects (bucket_id, name, created_at) values
  ('statement-uploads', '11111111-1111-1111-1111-111111111111/old.pdf', now() - interval '2 hours'),
  ('statement-uploads', '11111111-1111-1111-1111-111111111111/recent.pdf', now() - interval '10 minutes'),
  ('pgtap-other', 'x/ancient.pdf', now() - interval '3 days');

select extensions.is(
  (select array_agg(n) from public.stale_statement_uploads() n),
  array['11111111-1111-1111-1111-111111111111/old.pdf'], 'selector returns only the stale statement object');
select extensions.is(
  (select array_agg(n order by n) from public.stale_statement_uploads(interval '5 minutes') n),
  array['11111111-1111-1111-1111-111111111111/old.pdf', '11111111-1111-1111-1111-111111111111/recent.pdf'],
  'shorter threshold returns both statement objects');
select extensions.is(
  (select array_agg(n) from public.stale_statement_uploads(interval '5 minutes', 5) n),
  array['11111111-1111-1111-1111-111111111111/old.pdf', '11111111-1111-1111-1111-111111111111/recent.pdf'],
  'oldest first');
select extensions.ok(
  (select count(*) from public.stale_statement_uploads(interval '5 minutes', 0)) = 1, 'p_limit 0 clamps to 1 row');

-- 8. Cron job.
select extensions.is(
  (select schedule from cron.job where jobname = 'statement-uploads-purge-hourly'), '17 * * * *', 'purge job runs hourly');
select extensions.ok(
  (select command like '%statement_purge_secret%' and command like '%statement_purge_url%' and command not like '%delete from storage%'
     from cron.job where jobname = 'statement-uploads-purge-hourly'),
  'purge job calls the Edge Function with Vault secrets and never deletes via SQL');

select * from extensions.finish();
rollback;
