-- ENV-08: schedule the fx-sync Edge Function daily via pg_cron + pg_net,
-- authenticated with a shared secret held in Vault (never in a migration
-- or in git -- created per environment at deploy time, see 00-09-PLAN.md
-- Task 3). Locally the job runs, finds null secrets in
-- vault.decrypted_secrets, and fails harmlessly.
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

select cron.schedule(
  'fx-sync-daily',
  '30 16 * * *', -- 16:30 UTC, after ECB's ~16:00 CET publication; Frankfurter refreshes by then
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'fx_sync_url'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-fx-sync-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'fx_sync_secret')),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);
