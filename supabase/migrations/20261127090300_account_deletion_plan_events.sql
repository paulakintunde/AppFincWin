-- 10-review S-3 (owner-approved 2026-11-27): deleting an account left public.plan_events rows behind. That ledger is
-- keyed by the store app user id (text, equal to the user's uuid) and keeps the full RevenueCat payload, so it named the
-- deleted person after deletion. The rows now go in the same transaction as the auth.users delete, like the deletion
-- log (10-10). An event that names the person anywhere in its payload (a transfer, an alias) goes too: the ledger is
-- only a webhook dedupe record, and a replay for a deleted user has no account to apply to.

create function public.purge_plan_events_on_account_delete() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v text := old.id::text;
begin
  delete from public.plan_events e
   where e.app_user_id = v
      or strpos(e.payload::text, v) > 0;
  return old;
end;
$$;
revoke all on function public.purge_plan_events_on_account_delete() from public, anon, authenticated;

create trigger auth_users_after_delete_plan_events
  after delete on auth.users
  for each row execute function public.purge_plan_events_on_account_delete();
