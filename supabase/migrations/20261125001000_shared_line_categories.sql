-- Phase 07 (WR-03, owner decisions D-32, D-33, D-34): a partner's own category on a line or series shared into the caller's
-- household. Categories stay owner-only (20260926000100_categories.sql); there is deliberately no new select policy, which
-- would hand every member the partner's whole category list, including monthly_cap, and put it in the caller's pickers.
--
-- This read returns, for one household the caller belongs to, only the categories that sit on a live shared line or a live
-- shared series of that household and are not the caller's own. It returns the display fields (name, colour, icon), the
-- builtin_key the client uses to match the caller's own category, and owner_id so the client can name whose category it is
-- ("Pets (Sam)"; owner ids of fellow members are already readable through household_members). It never returns
-- monthly_cap, archived_at, is_sample or any category that is only on a partner's private lines or series.
create or replace function public.shared_line_categories(p_household uuid)
returns table (id uuid, owner_id uuid, builtin_key text, name text, color_key text, icon_key text)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, c.owner_id, c.builtin_key::text, c.name, c.color_key::text, c.icon_key::text
    from public.categories c
   where p_household in (select public.user_household_ids())
     and c.owner_id <> (select auth.uid())
     and (exists (select 1 from public.transactions t
                   where t.category_id = c.id
                     and t.household_id = p_household
                     and t.is_shared
                     and t.deleted_at is null)
          or exists (select 1 from public.recurring_series s
                      where s.category_id = c.id
                        and s.household_id = p_household
                        and s.is_shared
                        and s.deleted_at is null))
$$;
revoke execute on function public.shared_line_categories(uuid) from public, anon;
grant execute on function public.shared_line_categories(uuid) to authenticated;
