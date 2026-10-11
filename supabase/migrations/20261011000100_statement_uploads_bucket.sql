-- Phase 02.1 (IMP-03): private bucket for uploaded PDF statements.
-- D-04: same project / region as everything else. D-07: 10 MB, PDF only.
-- D-10/D-13: only the service role reads or deletes; there is deliberately
-- NO select/update/delete policy for any client role.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('statement-uploads', 'statement-uploads', false, 10485760, array['application/pdf'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy "statement uploads: owner inserts own folder"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'statement-uploads'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and array_length(storage.foldername(name), 1) = 1
    and storage.extension(name) = 'pdf'
  );
