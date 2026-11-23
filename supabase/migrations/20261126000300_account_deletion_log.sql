-- Phase 10 (10-10): D-19 deletion log, written in the same transaction as the delete (Pitfall 1). User ids only.
-- A restore (10-20) re-applies this log before restored data is used, so a deleted person is never resurrected. The AFTER
-- DELETE trigger fires inside the delete's own transaction: a failed or rolled-back delete never lists a live user.
-- No FK (the user is gone) and ON CONFLICT DO NOTHING, so the log can never block a deletion (D-20).

create table public.account_deletion_log (
  user_id uuid primary key,
  deleted_at timestamptz not null default now()
);
alter table public.account_deletion_log enable row level security;
revoke all on public.account_deletion_log from anon, authenticated;

create function public.log_account_deletion() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.account_deletion_log (user_id) values (old.id) on conflict (user_id) do nothing;
  return old;
end;
$$;
revoke all on function public.log_account_deletion() from public, anon, authenticated;

create trigger auth_users_after_delete_log
  after delete on auth.users
  for each row execute function public.log_account_deletion();

-- Kept 35 days, longer than the 30-day backup horizon (D-07, D-19).
create function public.prune_account_deletion_log() returns integer
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  delete from public.account_deletion_log where deleted_at < now() - interval '35 days';
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke all on function public.prune_account_deletion_log() from public, anon, authenticated;

select cron.schedule('deletion-log-prune', '55 3 * * *', $$select public.prune_account_deletion_log()$$);
