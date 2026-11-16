-- 08-23 (HH-11): later shared-capable tables join the Realtime publication (M9, after 20261122000800).
-- RLS filters every INSERT/UPDATE per subscriber (settlements and their lines reach the two parties only;
-- departures and former members reach household members only). Realtime also honours column grants, so the
-- two tables with narrowed client select grants deliver only the granted columns.
--
-- Published here: settlements, settlement_lines (the live flag flips when a settle-up lapses or is undone),
-- household_former_members, member_departures (08-14 follow-up).
-- Not published, on purpose:
--   transaction_splits: hard-deleted and rewritten on every split change; a split change bumps the parent
--     transactions row, which is published, so the client refetches the splits from that.
--   household_split_defaults: changes travel as household_events (default_changed, category_default_changed).
--   settlement_nudges: no client access at all (rate-limit bookkeeping).
--   household_invites: owner-only secrets (codes); never broadcast.
-- DELETE events bypass RLS and carry primary keys only. settlement_lines, household_former_members and member_departures
-- are hard-deleted only by cascades (settlement, transaction or household removal) and by the account-deletion purge, so
-- those broadcast bare uuids (settlement and line ids, never amounts or names); recorded for the DPIA (plan 08-26).

do $$
declare
  t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    return;
  end if;
  foreach t in array array['settlements', 'settlement_lines', 'household_former_members', 'member_departures'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end
$$;
