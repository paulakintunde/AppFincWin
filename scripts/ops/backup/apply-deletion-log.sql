-- 10-20 / D-19: re-apply account deletions to a restored copy before anything reads it.
-- Triggers are ON here, so the cascade into public tables runs exactly as in production.
begin;
with gone as (
  delete from auth.users
  where id in (select user_id from public.account_deletion_log)
  returning id
)
select count(*) as deleted_users from gone;
commit;
