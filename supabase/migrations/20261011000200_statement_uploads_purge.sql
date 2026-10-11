-- Phase 02.1 (D-12): backstop purge for statement uploads the normal
-- delete-after-read missed. Threshold 1 hour on an hourly schedule, so a stray
-- file lives under 2 hours (stricter than D-12's 24-hour ceiling). Deletion
-- itself happens in the purge-statement-uploads Edge Function through the
-- Storage API, because a SQL DELETE on storage.objects orphans the file.

create or replace function public.stale_statement_uploads(p_older_than interval default interval '1 hour', p_limit integer default 100)
returns setof text
language sql
stable
security definer
set search_path = ''
as $$
  select o.name from storage.objects o
   where o.bucket_id = 'statement-uploads' and o.created_at < now() - p_older_than
   order by o.created_at
   limit least(greatest(p_limit, 1), 1000)
$$;
revoke execute on function public.stale_statement_uploads(interval, integer) from public, anon, authenticated;
grant execute on function public.stale_statement_uploads(interval, integer) to service_role;

select cron.schedule(
  'statement-uploads-purge-hourly',
  '17 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'statement_purge_url'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-statement-purge-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'statement_purge_secret')),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);
