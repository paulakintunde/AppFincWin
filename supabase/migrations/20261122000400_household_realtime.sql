-- HH-11. Published: shared-capable tables only; RLS filters INSERT/UPDATE per subscriber.
-- Not published: households, household_members (membership changes travel as household_events,
-- so DELETE events never broadcast member keys), statement_periods (D-43), every decide_* and
-- Grow table. DELETE events bypass RLS and carry primary keys only: published tables are
-- soft-delete only for clients; the retention purge's hard deletes broadcast bare uuids,
-- recorded in the DPIA (plan 08-26). Later plans add transaction_splits, settlements,
-- settlement_lines and household_split_defaults (plan 08-23).

do $$
declare
  t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    return;
  end if;
  foreach t in array array['transactions', 'accounts', 'household_events'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end
$$;
