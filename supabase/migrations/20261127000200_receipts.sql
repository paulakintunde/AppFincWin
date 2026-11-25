-- Phase 10.1 (D-06..D-09, D-19, D-21, D-23; RCP-01/02/05): receipt files on a line.
-- Files live in a private Storage bucket. SQL can never delete Storage files, so removal and hard delete
-- queue the paths in receipt_purge_queue for a service-role function (plan 10.1-12) to delete through the
-- Storage API. This migration never deletes from storage.objects.

create table public.transaction_receipts (
  id uuid primary key,                                   -- client-generated (idempotent retries)
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  household_id uuid not null,                            -- copied from the line by add_receipt; the household realtime channel filters on it (no FK: follows transactions.household_id)
  group_id uuid not null,                                -- = id for a single photo/file; shared by the pages of one scan
  page_no smallint not null default 1 check (page_no between 1 and 10),
  uploaded_by uuid references auth.users(id) on delete set null,   -- D-19: shared-line receipts outlive the uploader
  object_path text not null unique,                      -- '<line owner uid>/<transaction id>/<id>.<ext>', built server-side
  kind text not null check (kind in ('photo','file','scan')),
  mime_type text not null check (mime_type in ('image/jpeg','image/png','image/webp','application/pdf')),
  bytes integer not null check (bytes > 0 and bytes <= 5242880),
  created_at timestamptz not null default now(),
  unique (group_id, page_no)
);
create index transaction_receipts_tx on public.transaction_receipts (transaction_id);
create index transaction_receipts_household on public.transaction_receipts (household_id);

create table public.receipt_purge_queue (
  object_path text primary key,
  queued_at timestamptz not null default now(),
  attempts int not null default 0
);

alter table public.transaction_receipts enable row level security;
alter table public.receipt_purge_queue enable row level security;

create policy "read receipts of visible lines" on public.transaction_receipts for select to authenticated
  using (exists (select 1 from public.transactions t
                  where t.id = transaction_receipts.transaction_id
                    and t.deleted_at is null
                    and (t.created_by = (select auth.uid())
                         or (t.is_shared and t.household_id in (select public.user_household_ids())))));
revoke all on public.transaction_receipts from anon;
revoke insert, update, delete, truncate on public.transaction_receipts from authenticated;
grant select on public.transaction_receipts to authenticated;
revoke all on public.receipt_purge_queue from anon, authenticated;

-- Bucket (D-21): private, 5 MB, JPEG/PNG/WebP/PDF.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('receipts', 'receipts', false, 5242880, array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- Storage policies (D-07). No UPDATE and no DELETE policy: files change only through the service role.
create policy "receipts: read files of visible lines"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'receipts'
    and exists (
      select 1 from public.transaction_receipts r
        join public.transactions t on t.id = r.transaction_id
       where r.object_path = objects.name
         and t.deleted_at is null
         and (t.created_by = (select auth.uid())
              or (t.is_shared and t.household_id in (select public.user_household_ids())))
    )
  );

create policy "receipts: upload into an editable line folder"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'receipts'
    and array_length(storage.foldername(objects.name), 1) = 2
    and storage.extension(objects.name) in ('jpg','png','webp','pdf')
    and exists (
      select 1 from public.transactions t
       where t.id::text = (storage.foldername(objects.name))[2]
         and t.created_by::text = (storage.foldername(objects.name))[1]
         and t.deleted_at is null
         and (t.created_by = (select auth.uid())
              or (t.is_shared and t.household_id in (select public.user_household_ids())))
    )
  );

-- D-08: removal and hard delete queue the stored file. A soft delete only updates deleted_at, so nothing is queued.
create or replace function public.receipts_queue_purge()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.receipt_purge_queue (object_path) values (old.object_path) on conflict do nothing;
  return old;
end
$$;
revoke execute on function public.receipts_queue_purge() from public, anon, authenticated;

create trigger transaction_receipts_queue_purge
  before delete on public.transaction_receipts
  for each row execute function public.receipts_queue_purge();

create or replace function public.receipt_ext(p_mime text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_mime
    when 'image/jpeg' then 'jpg'
    when 'image/png' then 'png'
    when 'image/webp' then 'webp'
    when 'application/pdf' then 'pdf'
  end
$$;
revoke execute on function public.receipt_ext(text) from public, anon, authenticated;

-- Where the client uploads before add_receipt. Null when the caller cannot edit the line or the type is unknown.
create or replace function public.receipt_object_path(p_id uuid, p_transaction uuid, p_mime text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select t.created_by::text || '/' || t.id::text || '/' || p_id::text || '.' || public.receipt_ext(p_mime)
    from public.transactions t
   where t.id = p_transaction
     and public.receipt_ext(p_mime) is not null
     and t.deleted_at is null
     and (t.created_by = (select auth.uid())
          or (t.is_shared and t.household_id in (select public.user_household_ids())))
$$;
revoke execute on function public.receipt_object_path(uuid, uuid, text) from public, anon;
grant execute on function public.receipt_object_path(uuid, uuid, text) to authenticated;

create or replace function public.add_receipt(
  p_id uuid, p_transaction uuid, p_group_id uuid, p_page_no int, p_kind text, p_mime text, p_bytes int)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.transactions%rowtype;
  v_ext text;
  v_path text;
begin
  select * into t from public.transactions x
   where x.id = p_transaction
     and x.deleted_at is null
     and (x.created_by = (select auth.uid())
          or (x.is_shared and x.household_id in (select public.user_household_ids())))
   for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  v_ext := public.receipt_ext(p_mime);
  if v_ext is null or p_kind is null or p_kind not in ('photo','file','scan') then
    return jsonb_build_object('ok', false, 'reason', 'bad_type');
  end if;
  if p_bytes is null or p_bytes <= 0 or p_bytes > 5242880 then
    return jsonb_build_object('ok', false, 'reason', 'too_big');
  end if;
  if p_page_no is null or p_page_no < 1 or p_page_no > 10 then
    return jsonb_build_object('ok', false, 'reason', 'too_many_pages');
  end if;

  v_path := t.created_by::text || '/' || t.id::text || '/' || p_id::text || '.' || v_ext;

  if exists (select 1 from public.transaction_receipts r where r.id = p_id and r.object_path = v_path) then
    return jsonb_build_object('ok', true, 'object_path', v_path, 'already', true);
  end if;

  if (select count(distinct r.group_id) from public.transaction_receipts r
       where r.transaction_id = t.id and r.group_id <> p_group_id) >= 5 then
    return jsonb_build_object('ok', false, 'reason', 'too_many_receipts');
  end if;
  if (select count(*) from public.transaction_receipts r where r.group_id = p_group_id) >= 10 then
    return jsonb_build_object('ok', false, 'reason', 'too_many_pages');
  end if;

  if not exists (select 1 from storage.objects o where o.bucket_id = 'receipts' and o.name = v_path) then
    return jsonb_build_object('ok', false, 'reason', 'object_missing');
  end if;

  insert into public.transaction_receipts
    (id, transaction_id, household_id, group_id, page_no, uploaded_by, object_path, kind, mime_type, bytes)
  values
    (p_id, t.id, t.household_id, p_group_id, p_page_no::smallint, (select auth.uid()), v_path, p_kind, p_mime, p_bytes);

  return jsonb_build_object('ok', true, 'object_path', v_path, 'already', false);
end
$$;
revoke execute on function public.add_receipt(uuid, uuid, uuid, int, text, text, int) from public, anon;
grant execute on function public.add_receipt(uuid, uuid, uuid, int, text, text, int) to authenticated;

-- No undo: the trigger queues the files and the UI confirms "deleted for good".
create or replace function public.remove_receipt(p_group_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tx uuid;
  v_n int;
begin
  select r.transaction_id into v_tx
    from public.transaction_receipts r
    join public.transactions t on t.id = r.transaction_id
   where r.group_id = p_group_id
     and t.deleted_at is null
     and (t.created_by = (select auth.uid())
          or (t.is_shared and t.household_id in (select public.user_household_ids())))
   limit 1;
  if v_tx is null then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  delete from public.transaction_receipts where group_id = p_group_id and transaction_id = v_tx;
  get diagnostics v_n = row_count;
  return jsonb_build_object('ok', true, 'transaction_id', v_tx, 'removed', v_n);
end
$$;
revoke execute on function public.remove_receipt(uuid) from public, anon;
grant execute on function public.remove_receipt(uuid) to authenticated;

create or replace function public.remove_all_receipts(p_transaction uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n int;
begin
  if not exists (
    select 1 from public.transactions t
     where t.id = p_transaction
       and t.deleted_at is null
       and (t.created_by = (select auth.uid())
            or (t.is_shared and t.household_id in (select public.user_household_ids())))
  ) then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  delete from public.transaction_receipts where transaction_id = p_transaction;
  get diagnostics v_n = row_count;
  return jsonb_build_object('ok', true, 'removed', v_n);
end
$$;
revoke execute on function public.remove_all_receipts(uuid) from public, anon;
grant execute on function public.remove_all_receipts(uuid) to authenticated;

-- Service-role selectors for the purge function (plan 10.1-12).
create or replace function public.pending_receipt_purges(p_limit int)
returns setof text
language sql
stable
security definer
set search_path = ''
as $$
  (select q.object_path from public.receipt_purge_queue q order by q.queued_at limit least(greatest(p_limit, 1), 1000))
  union all
  (select o.name from storage.objects o
    where o.bucket_id = 'receipts'
      and o.created_at < now() - interval '1 hour'
      and not exists (select 1 from public.transaction_receipts r where r.object_path = o.name)
      and not exists (select 1 from public.receipt_purge_queue q where q.object_path = o.name)
    limit least(greatest(p_limit, 1), 1000))
$$;

create or replace function public.ack_receipt_purges(p_paths text[])
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n int;
begin
  delete from public.receipt_purge_queue where object_path = any (p_paths);
  get diagnostics v_n = row_count;
  return v_n;
end
$$;

-- D-23: after a restore, rows whose file no longer exists are dropped. The queue trigger fires harmlessly.
create or replace function public.prune_receipt_rows_without_objects()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n int;
begin
  delete from public.transaction_receipts r
   where not exists (select 1 from storage.objects o where o.bucket_id = 'receipts' and o.name = r.object_path);
  get diagnostics v_n = row_count;
  return v_n;
end
$$;

revoke execute on function public.pending_receipt_purges(int) from public, anon, authenticated;
revoke execute on function public.ack_receipt_purges(text[]) from public, anon, authenticated;
revoke execute on function public.prune_receipt_rows_without_objects() from public, anon, authenticated;
grant execute on function public.pending_receipt_purges(int) to service_role;
grant execute on function public.ack_receipt_purges(text[]) to service_role;
grant execute on function public.prune_receipt_rows_without_objects() to service_role;

-- Purge job every five minutes (same secret pattern as the statement purge).
do $$
begin
  if exists (select 1 from cron.job where jobname = 'receipts-purge-every-5-min') then
    perform cron.unschedule('receipts-purge-every-5-min');
  end if;
end
$$;
select cron.schedule(
  'receipts-purge-every-5-min',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'receipt_purge_url'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-receipt-purge-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'receipt_purge_secret')),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);

-- Realtime: a partner sees a new receipt live. The channel filters on household_id.
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    return;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'transaction_receipts'
  ) then
    alter publication supabase_realtime add table public.transaction_receipts;
  end if;
end
$$;
