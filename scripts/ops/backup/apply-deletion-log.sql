-- 10-20 / D-19: re-apply account deletions to a restored copy before anything reads it.
-- Triggers are ON here, so the cascade into public tables runs exactly as in production.
-- 10-review L-3: it now fails loudly. A missing log table, or any logged user still present afterwards, raises, so with
-- ON_ERROR_STOP the run stops non-zero and the transaction rolls back. Run inside a transaction: restore-check.sh wraps
-- it in begin/commit; restore.sh runs it in the same transaction as the data load, so a restore that cannot apply the
-- log leaves nothing behind.
\set ON_ERROR_STOP on
do $$
begin
  if to_regclass('public.account_deletion_log') is null then
    raise exception 'apply-deletion-log: public.account_deletion_log is missing, so deletions cannot be re-applied';
  end if;
end $$;
with gone as (
  delete from auth.users
  where id in (select user_id from public.account_deletion_log)
  returning id
)
select count(*) as deleted_users from gone;
do $$
declare
  n integer;
begin
  select count(*) into n from auth.users u where u.id in (select l.user_id from public.account_deletion_log l);
  if n > 0 then
    raise exception 'apply-deletion-log: % deleted account(s) still present after re-applying the log', n;
  end if;
end $$;
