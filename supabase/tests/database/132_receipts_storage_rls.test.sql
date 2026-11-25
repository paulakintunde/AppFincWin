-- pgTAP: Phase 10.1 plan 06 (RCP-01/02/05; D-07, D-21). Receipt files: bucket settings, who can read and upload,
-- the add_receipt refusals and caps, table visibility, and no client UPDATE/DELETE policy on storage.
-- Needs 20261127000200_receipts.sql.

begin;
create extension if not exists pgtap with schema extensions;

select extensions.plan(32);

-- A owns four lines (LA private, LS shared on a joint account, LT and LU shared for the caps); B is A's partner; C is an outsider.
insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values
  ('a1320000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@t132.local', '{"full_name":"Ann Test"}', now(), now()),
  ('a1320000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b@t132.local', '{"full_name":"Bob Test"}', now(), now()),
  ('a1320000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'c@t132.local', '{"full_name":"Cy Test"}', now(), now());

create temp table hh as select owner_id, id from public.households;
grant select on hh to authenticated;

delete from public.household_members where user_id = 'a1320000-0000-0000-0000-00000000000b';
insert into public.household_members (household_id, user_id, is_owner, weight)
values ((select id from hh where owner_id = 'a1320000-0000-0000-0000-00000000000a'), 'a1320000-0000-0000-0000-00000000000b', false, 0);

insert into public.accounts (id, household_id, created_by, name, kind, currency, opening_balance, is_shared) values
  ('a1320000-0000-0000-0000-0000000000f1', (select id from hh where owner_id = 'a1320000-0000-0000-0000-00000000000a'), 'a1320000-0000-0000-0000-00000000000a', 'A personal', 'checking', 'USD', 0, false),
  ('a1320000-0000-0000-0000-0000000000f2', (select id from hh where owner_id = 'a1320000-0000-0000-0000-00000000000a'), 'a1320000-0000-0000-0000-00000000000a', 'Joint', 'checking', 'USD', 0, true);

insert into public.transactions (id, household_id, created_by, account_id, original_amount, original_currency, local_date, time_zone, name, status, is_shared) values
  ('a1320000-0000-0000-0000-0000000000a1', (select id from hh where owner_id = 'a1320000-0000-0000-0000-00000000000a'), 'a1320000-0000-0000-0000-00000000000a', 'a1320000-0000-0000-0000-0000000000f1', -1000, 'USD', '2026-11-02', 'UTC', 'Private', 'paid', false),
  ('a1320000-0000-0000-0000-0000000000a2', (select id from hh where owner_id = 'a1320000-0000-0000-0000-00000000000a'), 'a1320000-0000-0000-0000-00000000000a', 'a1320000-0000-0000-0000-0000000000f2', -1000, 'USD', '2026-11-03', 'UTC', 'Shared', 'paid', true),
  ('a1320000-0000-0000-0000-0000000000a3', (select id from hh where owner_id = 'a1320000-0000-0000-0000-00000000000a'), 'a1320000-0000-0000-0000-00000000000a', 'a1320000-0000-0000-0000-0000000000f2', -1000, 'USD', '2026-11-04', 'UTC', 'Cap five', 'paid', true),
  ('a1320000-0000-0000-0000-0000000000a4', (select id from hh where owner_id = 'a1320000-0000-0000-0000-00000000000a'), 'a1320000-0000-0000-0000-00000000000a', 'a1320000-0000-0000-0000-0000000000f2', -1000, 'USD', '2026-11-05', 'UTC', 'Cap pages', 'paid', true);

-- Simulate uploads (as the table owner): one file each on LA and LS, six on LT, eleven on LU.
insert into storage.objects (bucket_id, name, owner) values
  ('receipts', 'a1320000-0000-0000-0000-00000000000a/a1320000-0000-0000-0000-0000000000a1/a1320000-0000-0000-0001-000000000001.jpg', 'a1320000-0000-0000-0000-00000000000a'),
  ('receipts', 'a1320000-0000-0000-0000-00000000000a/a1320000-0000-0000-0000-0000000000a2/a1320000-0000-0000-0001-000000000002.jpg', 'a1320000-0000-0000-0000-00000000000a');
insert into storage.objects (bucket_id, name, owner)
select 'receipts', 'a1320000-0000-0000-0000-00000000000a/a1320000-0000-0000-0000-0000000000a3/a1320000-0000-0000-0002-' || lpad(g::text, 12, '0') || '.jpg', 'a1320000-0000-0000-0000-00000000000a'
  from generate_series(1, 6) g;
insert into storage.objects (bucket_id, name, owner)
select 'receipts', 'a1320000-0000-0000-0000-00000000000a/a1320000-0000-0000-0000-0000000000a4/a1320000-0000-0000-0003-' || lpad(g::text, 12, '0') || '.jpg', 'a1320000-0000-0000-0000-00000000000a'
  from generate_series(1, 11) g;

-- A registers them through add_receipt.
select set_config('request.jwt.claims', '{"sub":"a1320000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
do $$
declare g int;
begin
  perform public.add_receipt('a1320000-0000-0000-0001-000000000001', 'a1320000-0000-0000-0000-0000000000a1', 'a1320000-0000-0000-0001-000000000001', 1, 'photo', 'image/jpeg', 1000);
  perform public.add_receipt('a1320000-0000-0000-0001-000000000002', 'a1320000-0000-0000-0000-0000000000a2', 'a1320000-0000-0000-0001-000000000002', 1, 'photo', 'image/jpeg', 1000);
  for g in 1..5 loop
    perform public.add_receipt(('a1320000-0000-0000-0002-' || lpad(g::text, 12, '0'))::uuid, 'a1320000-0000-0000-0000-0000000000a3',
      ('a1320000-0000-0000-0002-' || lpad(g::text, 12, '0'))::uuid, 1, 'photo', 'image/jpeg', 1000);
  end loop;
  for g in 1..10 loop
    perform public.add_receipt(('a1320000-0000-0000-0003-' || lpad(g::text, 12, '0'))::uuid, 'a1320000-0000-0000-0000-0000000000a4',
      'a1320000-0000-0000-0003-000000000001', g, 'scan', 'image/jpeg', 1000);
  end loop;
end
$$;

-- 1-3. Bucket settings.
select extensions.is((select public from storage.buckets where id = 'receipts'), false, 'bucket is private');
select extensions.is((select file_size_limit from storage.buckets where id = 'receipts'), 5242880::bigint, 'bucket caps files at 5 MB');
select extensions.is((select allowed_mime_types from storage.buckets where id = 'receipts'),
  array['image/jpeg','image/png','image/webp','application/pdf'], 'bucket allows JPEG, PNG, WebP and PDF only');

-- 4. No UPDATE or DELETE policy for the bucket.
select extensions.is(
  (select count(*)::int from pg_policies where schemaname = 'storage' and tablename = 'objects'
     and policyname like 'receipts: %' and cmd not in ('SELECT', 'INSERT')),
  0, 'no UPDATE or DELETE policy on receipt files');

-- 5-9. Read matrix over storage.objects.
create or replace function pg_temp.n_objs(p_like text) returns bigint language sql as
  $f$ select count(*) from storage.objects where bucket_id = 'receipts' and name like p_like $f$;
grant execute on function pg_temp.n_objs(text) to authenticated, anon;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a1320000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
select extensions.is(pg_temp.n_objs('%/a1320000-0000-0000-0000-0000000000a1/%'), 1::bigint, 'A reads own private line file');
select extensions.is(pg_temp.n_objs('%/a1320000-0000-0000-0000-0000000000a2/%'), 1::bigint, 'A reads own shared line file');

select set_config('request.jwt.claims', '{"sub":"a1320000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
select extensions.is(pg_temp.n_objs('%/a1320000-0000-0000-0000-0000000000a1/%'), 0::bigint, 'B cannot read A private line file');
select extensions.is(pg_temp.n_objs('%/a1320000-0000-0000-0000-0000000000a2/%'), 1::bigint, 'B reads the shared line file');

select set_config('request.jwt.claims', '{"sub":"a1320000-0000-0000-0000-00000000000c","role":"authenticated"}', true);
select extensions.is(
  pg_temp.n_objs('%/a1320000-0000-0000-0000-0000000000a1/%') + pg_temp.n_objs('%/a1320000-0000-0000-0000-0000000000a2/%'),
  0::bigint, 'C reads neither');

-- 10-16. Upload matrix.
select set_config('request.jwt.claims', '{"sub":"a1320000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
select extensions.lives_ok(
  $$insert into storage.objects (bucket_id, name) values ('receipts', 'a1320000-0000-0000-0000-00000000000a/a1320000-0000-0000-0000-0000000000a2/a1320000-0000-0000-0009-000000000001.jpg')$$,
  'B can upload into the shared line folder');
select extensions.throws_ok(
  $$insert into storage.objects (bucket_id, name) values ('receipts', 'a1320000-0000-0000-0000-00000000000a/a1320000-0000-0000-0000-0000000000a1/a1320000-0000-0000-0009-000000000002.jpg')$$,
  '42501', null, 'B cannot upload into A private line folder');
select extensions.throws_ok(
  $$insert into storage.objects (bucket_id, name) values ('receipts', 'a1320000-0000-0000-0000-00000000000a/a1320000-0000-0000-0000-0000000000a2/x/a1320000-0000-0000-0009-000000000003.jpg')$$,
  '42501', null, 'a path of depth three is refused');
select extensions.throws_ok(
  $$insert into storage.objects (bucket_id, name) values ('receipts', 'a1320000-0000-0000-0000-00000000000a/a1320000-0000-0000-0000-0000000000a2/a1320000-0000-0000-0009-000000000004.exe')$$,
  '42501', null, 'extension exe is refused');

select set_config('request.jwt.claims', '{"sub":"a1320000-0000-0000-0000-00000000000c","role":"authenticated"}', true);
select extensions.throws_ok(
  $$insert into storage.objects (bucket_id, name) values ('receipts', 'a1320000-0000-0000-0000-00000000000a/a1320000-0000-0000-0000-0000000000a2/a1320000-0000-0000-0009-000000000005.jpg')$$,
  '42501', null, 'C cannot upload into the shared line folder');
select extensions.is(public.receipt_object_path('a1320000-0000-0000-0009-000000000006', 'a1320000-0000-0000-0000-0000000000a2', 'image/jpeg'), null,
  'receipt_object_path is null for an outsider');
select set_config('request.jwt.claims', '{"sub":"a1320000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
select extensions.is(public.receipt_object_path('a1320000-0000-0000-0009-000000000006', 'a1320000-0000-0000-0000-0000000000a2', 'image/jpeg'),
  'a1320000-0000-0000-0000-00000000000a/a1320000-0000-0000-0000-0000000000a2/a1320000-0000-0000-0009-000000000006.jpg',
  'receipt_object_path gives the line owner folder for a partner');

-- 17. anon sees nothing.
reset role;
set local role anon;
select extensions.is(pg_temp.n_objs('%/a1320000-0000-0000-0000-0000000000a2/%'), 0::bigint, 'anon reads nothing');

-- 18-24. add_receipt refusals as A.
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a1320000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
select extensions.is(public.add_receipt('a1320000-0000-0000-0009-000000000010', 'a1320000-0000-0000-0000-0000000000a2', 'a1320000-0000-0000-0009-000000000010', 1, 'file', 'text/plain', 1000) ->> 'reason',
  'bad_type', 'text/plain is refused');
select extensions.is(public.add_receipt('a1320000-0000-0000-0009-000000000011', 'a1320000-0000-0000-0000-0000000000a2', 'a1320000-0000-0000-0009-000000000011', 1, 'photo', 'image/jpeg', 6000000) ->> 'reason',
  'too_big', 'over 5 MB is refused');
select extensions.is(public.add_receipt('a1320000-0000-0000-0009-000000000012', 'a1320000-0000-0000-0000-0000000000a2', 'a1320000-0000-0000-0009-000000000012', 1, 'photo', 'image/jpeg', 1000) ->> 'reason',
  'object_missing', 'no uploaded object is refused');
select extensions.is(public.add_receipt('a1320000-0000-0000-0002-000000000006', 'a1320000-0000-0000-0000-0000000000a3', 'a1320000-0000-0000-0002-000000000006', 1, 'photo', 'image/jpeg', 1000) ->> 'reason',
  'too_many_receipts', 'a sixth receipt is refused');
select extensions.is(public.add_receipt('a1320000-0000-0000-0003-000000000011', 'a1320000-0000-0000-0000-0000000000a4', 'a1320000-0000-0000-0003-000000000001', 10, 'scan', 'image/jpeg', 1000) ->> 'reason',
  'too_many_pages', 'an eleventh page of one scan is refused');
select extensions.is(public.add_receipt('a1320000-0000-0000-0001-000000000002', 'a1320000-0000-0000-0000-0000000000a2', 'a1320000-0000-0000-0001-000000000002', 1, 'photo', 'image/jpeg', 1000) ->> 'already',
  'true', 'repeating the same id is already true');
select extensions.is(public.add_receipt('a1320000-0000-0000-0001-000000000002', 'a1320000-0000-0000-0000-0000000000ee', 'a1320000-0000-0000-0001-000000000002', 1, 'photo', 'image/jpeg', 1000) ->> 'reason',
  'not_found', 'an unknown line is not_found');

-- 25-27. Table visibility mirrors storage.
select extensions.is((select count(*)::int from public.transaction_receipts where transaction_id = 'a1320000-0000-0000-0000-0000000000a1'), 1, 'A sees LA rows');
select set_config('request.jwt.claims', '{"sub":"a1320000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
select extensions.is((select count(*)::int from public.transaction_receipts where transaction_id = 'a1320000-0000-0000-0000-0000000000a1'), 0, 'B does not see LA rows');
select extensions.is((select count(*)::int from public.transaction_receipts where transaction_id = 'a1320000-0000-0000-0000-0000000000a2'), 1, 'B sees LS rows');

-- 28-30. No direct writes.
select extensions.throws_ok(
  $$insert into public.transaction_receipts (id, transaction_id, household_id, group_id, object_path, kind, mime_type, bytes)
    values ('a1320000-0000-0000-0009-000000000020', 'a1320000-0000-0000-0000-0000000000a2', gen_random_uuid(), gen_random_uuid(), 'x', 'photo', 'image/jpeg', 1)$$,
  '42501', null, 'clients cannot insert receipt rows');
select extensions.throws_ok($$update public.transaction_receipts set bytes = 1$$, '42501', null, 'clients cannot update receipt rows');
select extensions.throws_ok($$delete from public.transaction_receipts$$, '42501', null, 'clients cannot delete receipt rows');

-- 31-32. Anon cannot reach the table or the RPCs.
reset role;
select extensions.is(has_function_privilege('anon', 'public.add_receipt(uuid,uuid,uuid,int,text,text,int)', 'execute'), false, 'anon cannot add_receipt');
select extensions.is(has_table_privilege('anon', 'public.transaction_receipts', 'select'), false, 'anon cannot select receipts');

select * from extensions.finish();
rollback;
