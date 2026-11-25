-- pgTAP: Phase 10.1 plan 06 (RCP-05; D-08, D-19, D-23). Purge queue behaviour, uploader erasure, service-role selectors.
-- Needs 20261127000200_receipts.sql.

begin;
create extension if not exists pgtap with schema extensions;

select extensions.plan(14);

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values
  ('a1330000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@t133.local', '{"full_name":"Ann Test"}', now(), now()),
  ('a1330000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b@t133.local', '{"full_name":"Bob Test"}', now(), now());

create temp table hh as select owner_id, id from public.households;
grant select on hh to authenticated;

delete from public.household_members where user_id = 'a1330000-0000-0000-0000-00000000000b';
insert into public.household_members (household_id, user_id, is_owner, weight)
values ((select id from hh where owner_id = 'a1330000-0000-0000-0000-00000000000a'), 'a1330000-0000-0000-0000-00000000000b', false, 0);

insert into public.accounts (id, household_id, created_by, name, kind, currency, opening_balance, is_shared) values
  ('a1330000-0000-0000-0000-0000000000f2', (select id from hh where owner_id = 'a1330000-0000-0000-0000-00000000000a'), 'a1330000-0000-0000-0000-00000000000a', 'Joint', 'checking', 'USD', 0, true);

-- Lines 1..5 of A (line 4 private).
insert into public.transactions (id, household_id, created_by, account_id, original_amount, original_currency, local_date, time_zone, name, status, is_shared)
select ('a1330000-0000-0000-0000-0000000000a' || g)::uuid, (select id from hh where owner_id = 'a1330000-0000-0000-0000-00000000000a'),
       'a1330000-0000-0000-0000-00000000000a', 'a1330000-0000-0000-0000-0000000000f2', -1000, 'USD', '2026-11-02', 'UTC', 'Line ' || g, 'paid', g <> 4
  from generate_series(1, 5) g;

-- Files: line 1 has a two-page scan (r1, r2) and a photo (r3); line 2 r4; line 3 r5; line 4 r6; line 5 r7 uploaded by B.
insert into storage.objects (bucket_id, name, owner)
select 'receipts', 'a1330000-0000-0000-0000-00000000000a/a1330000-0000-0000-0000-0000000000a' || l || '/a1330000-0000-0000-0001-00000000000' || r || '.jpg',
       'a1330000-0000-0000-0000-00000000000a'
  from (values (1,1),(1,2),(1,3),(2,4),(3,5),(4,6),(5,7)) v(l, r);
insert into storage.objects (bucket_id, name, owner, created_at) values
  ('receipts', 'a1330000-0000-0000-0000-00000000000a/a1330000-0000-0000-0000-0000000000a1/orphan-old.jpg', 'a1330000-0000-0000-0000-00000000000a', now() - interval '2 hours'),
  ('receipts', 'a1330000-0000-0000-0000-00000000000a/a1330000-0000-0000-0000-0000000000a1/orphan-new.jpg', 'a1330000-0000-0000-0000-00000000000a', now());

-- Register rows directly (the table is closed to clients).
insert into public.transaction_receipts (id, transaction_id, household_id, group_id, page_no, uploaded_by, object_path, kind, mime_type, bytes)
select ('a1330000-0000-0000-0001-00000000000' || r)::uuid, ('a1330000-0000-0000-0000-0000000000a' || l)::uuid,
       (select id from hh where owner_id = 'a1330000-0000-0000-0000-00000000000a'),
       ('a1330000-0000-0000-0001-00000000000' || grp)::uuid, pg,
       case when r = 7 then 'a1330000-0000-0000-0000-00000000000b'::uuid else 'a1330000-0000-0000-0000-00000000000a'::uuid end,
       'a1330000-0000-0000-0000-00000000000a/a1330000-0000-0000-0000-0000000000a' || l || '/a1330000-0000-0000-0001-00000000000' || r || '.jpg',
       case when r in (1, 2) then 'scan' else 'photo' end, 'image/jpeg', 1000
  from (values (1,1,1,1::smallint),(1,2,1,2::smallint),(1,3,3,1::smallint),(2,4,4,1::smallint),(3,5,5,1::smallint),(4,6,6,1::smallint),(5,7,7,1::smallint)) v(l, r, grp, pg);
-- r8: a row on line 2 whose object does not exist (D-23).
insert into public.transaction_receipts (id, transaction_id, household_id, group_id, page_no, uploaded_by, object_path, kind, mime_type, bytes)
values ('a1330000-0000-0000-0001-000000000008', 'a1330000-0000-0000-0000-0000000000a2', (select id from hh where owner_id = 'a1330000-0000-0000-0000-00000000000a'),
        'a1330000-0000-0000-0001-000000000008', 1, 'a1330000-0000-0000-0000-00000000000a',
        'a1330000-0000-0000-0000-00000000000a/a1330000-0000-0000-0000-0000000000a2/a1330000-0000-0000-0001-000000000008.jpg', 'photo', 'image/jpeg', 1000);

-- 1-2. remove_receipt queues the scan's two pages.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a1330000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
select extensions.is((public.remove_receipt('a1330000-0000-0000-0001-000000000001') ->> 'removed')::int, 2, 'remove_receipt removes both pages of the scan');
reset role;
select extensions.is((select count(*)::int from public.receipt_purge_queue), 2, 'both page paths are queued');

-- 3-4. remove_all_receipts removes the rest of line 1.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a1330000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
select extensions.is((public.remove_all_receipts('a1330000-0000-0000-0000-0000000000a1') ->> 'removed')::int, 1, 'remove_all_receipts removes the remaining receipt');
reset role;
select extensions.is((select count(*)::int from public.receipt_purge_queue), 3, 'three paths queued after remove_all');

-- 5-6. Soft delete queues nothing and keeps the row.
update public.transactions set deleted_at = now() where id = 'a1330000-0000-0000-0000-0000000000a3';
select extensions.is((select count(*)::int from public.receipt_purge_queue), 3, 'soft delete queues nothing');
select extensions.is((select count(*)::int from public.transaction_receipts where transaction_id = 'a1330000-0000-0000-0000-0000000000a3'), 1, 'soft delete keeps the receipt row for Undo');

-- 7-8. Hard delete queues the line's file and removes its rows.
delete from public.transactions where id = 'a1330000-0000-0000-0000-0000000000a4';
select extensions.is((select count(*)::int from public.receipt_purge_queue where object_path like '%a4/%'), 1, 'hard delete of a line queues its file');
select extensions.is((select count(*)::int from public.transaction_receipts where transaction_id = 'a1330000-0000-0000-0000-0000000000a4'), 0, 'hard delete removes its rows');

-- 9. D-19: the uploader is deleted, the shared-line receipt stays.
delete from auth.users where id = 'a1330000-0000-0000-0000-00000000000b';
select extensions.is((select uploaded_by from public.transaction_receipts where id = 'a1330000-0000-0000-0001-000000000007'), null,
  'deleting the uploader keeps the receipt with uploaded_by null');

-- 10-11. Selectors: 4 queued paths plus the old orphan, not the fresh one; ack removes the queue rows.
select extensions.ok(
  exists (select 1 from public.pending_receipt_purges(100) p where p like '%orphan-old.jpg')
  and not exists (select 1 from public.pending_receipt_purges(100) p where p like '%orphan-new.jpg')
  and (select count(*) from public.pending_receipt_purges(100) p) = 5,
  'pending returns the 4 queued paths and the old orphan only');
select extensions.is(public.ack_receipt_purges(array(select object_path from public.receipt_purge_queue)), 4, 'ack removes the queue rows');

-- 12. Only the service role can run the purge functions.
select extensions.ok(
  not has_function_privilege('authenticated', 'public.pending_receipt_purges(int)', 'execute')
  and not has_function_privilege('authenticated', 'public.ack_receipt_purges(text[])', 'execute')
  and not has_function_privilege('authenticated', 'public.prune_receipt_rows_without_objects()', 'execute')
  and has_function_privilege('service_role', 'public.prune_receipt_rows_without_objects()', 'execute'),
  'only service_role can execute the purge functions');

-- 13-14. prune removes the row whose object is gone (r8 only).
select extensions.is(public.prune_receipt_rows_without_objects(), 1, 'prune removes the one row without an object');
select extensions.is((select count(*)::int from public.transaction_receipts where id = 'a1330000-0000-0000-0001-000000000008'), 0, 'that row is gone');

select * from extensions.finish();
rollback;
