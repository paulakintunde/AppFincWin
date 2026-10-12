-- Phase 02.3 (REC-27; CONTEXT D-24..D-27): description-to-category rules.
-- A rule is 'personal' (Just me: owned by its creator, points at the creator's
-- own category id) or 'shared' (household: any member reads and edits it; it
-- points at a category by built-in key or by name and resolves per member on
-- the client, D-26). categories has no kind column, so "by name and kind" is
-- stored as target_builtin_key XOR target_name (02.3-RESEARCH Open Question 1).
-- Removal is a soft delete (deleted_at) so Undo and History work (D-24); there
-- is no delete grant. keyword_norm is computed on the client with
-- normaliseDescription; the server only bounds it. Additive: no existing row
-- is written.
create table public.category_rules (
  id uuid primary key,                                               -- client-generated (MON-08)
  scope text not null check (scope in ('personal', 'shared')),
  owner_id uuid references auth.users(id) on delete cascade,         -- personal only
  household_id uuid references public.households(id) on delete cascade, -- shared only
  created_by uuid references auth.users(id) on delete set null,
  keyword text not null check (char_length(btrim(keyword)) between 1 and 60),
  keyword_norm text not null check (char_length(keyword_norm) between 1 and 60),
  category_id uuid references public.categories(id) on delete cascade, -- personal only
  target_builtin_key text check (target_builtin_key is null or target_builtin_key in (
    'Housing', 'Utilities', 'Groceries', 'Transport', 'Insurance', 'Health', 'Subscriptions',
    'Debt', 'Savings', 'Business', 'Tax', 'Dining', 'Income'
  )),
  target_name text check (target_name is null or char_length(btrim(target_name)) between 1 and 60),
  deleted_at timestamptz,
  version integer not null default 1,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint category_rules_scope_shape check (
    (scope = 'personal' and owner_id is not null and household_id is null and category_id is not null
       and target_builtin_key is null and target_name is null)
    or (scope = 'shared' and owner_id is null and household_id is not null and category_id is null
       and ((target_builtin_key is null) <> (target_name is null)))
  )
);
create unique index category_rules_personal_keyword on public.category_rules (owner_id, keyword_norm)
  where scope = 'personal' and deleted_at is null;
create unique index category_rules_shared_keyword on public.category_rules (household_id, keyword_norm)
  where scope = 'shared' and deleted_at is null;
create index category_rules_category_id_idx on public.category_rules (category_id) where category_id is not null;
create index category_rules_household_id_idx on public.category_rules (household_id) where household_id is not null;

-- Who owns the row is set by the server, never by the client.
create or replace function public.fill_category_rule()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.created_by := (select auth.uid());
  new.updated_by := (select auth.uid());
  new.owner_id := case when new.scope = 'personal' then (select auth.uid()) else null end;
  if new.scope = 'personal' then new.household_id := null; end if;
  return new;
end;
$$;
revoke execute on function public.fill_category_rule() from public, anon, authenticated;
create trigger fill_category_rule before insert on public.category_rules
  for each row execute function public.fill_category_rule();

-- scope, owner and household never move, even for a privileged writer (guard_category precedent).
create or replace function public.guard_category_rule()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.id := old.id;
  new.scope := old.scope;
  new.owner_id := old.owner_id;
  new.household_id := old.household_id;
  new.created_at := old.created_at;
  -- an ON DELETE SET NULL from auth.users may clear created_by; nothing else may change it
  if new.created_by is not null then new.created_by := old.created_by; end if;
  new.updated_at := now();
  return new;
end;
$$;
revoke execute on function public.guard_category_rule() from public, anon, authenticated;
create trigger guard_category_rule before update on public.category_rules
  for each row execute function public.guard_category_rule();
create trigger set_version before update on public.category_rules
  for each row execute function public.bump_version();
create trigger set_updated_by before update on public.category_rules
  for each row execute function public.set_updated_by();

alter table public.category_rules enable row level security;
create policy "members read category rules" on public.category_rules for select to authenticated
  using ((scope = 'personal' and owner_id = (select auth.uid()))
      or (scope = 'shared' and household_id in (select public.user_household_ids())));
create policy "members insert category rules" on public.category_rules for insert to authenticated
  with check (
    (scope = 'personal' and owner_id = (select auth.uid())
       and category_id in (select c.id from public.categories c where c.owner_id = (select auth.uid()) and not c.is_system))
    or (scope = 'shared' and household_id in (select public.user_household_ids())));
create policy "members update category rules" on public.category_rules for update to authenticated
  using ((scope = 'personal' and owner_id = (select auth.uid()))
      or (scope = 'shared' and household_id in (select public.user_household_ids())))
  with check (
    (scope = 'personal' and owner_id = (select auth.uid())
       and category_id in (select c.id from public.categories c where c.owner_id = (select auth.uid()) and not c.is_system))
    or (scope = 'shared' and household_id in (select public.user_household_ids())));

revoke all on public.category_rules from anon;
revoke insert, update, delete, truncate on public.category_rules from authenticated;
grant select on public.category_rules to authenticated;
grant insert (id, scope, household_id, keyword, keyword_norm, category_id, target_builtin_key, target_name)
  on public.category_rules to authenticated;
grant update (keyword, keyword_norm, category_id, target_builtin_key, target_name, deleted_at)
  on public.category_rules to authenticated;
