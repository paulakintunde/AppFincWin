-- Per-user categories (D-33, D-34, D-35, D-36).
--
-- Categories are per-user, not household-scoped: each user gets their own
-- editable set, seeded at signup with 13 built-in labels plus the two
-- system-owned categories the engine relies on (Transfer, Settlement).
-- Built-in categories can be renamed, recoloured and archived; system
-- categories cannot be changed at all -- guard_category pins is_system,
-- builtin_key and owner_id on every update, defensively, even for a
-- privileged writer. "Tax" is a plain spending-category label (money already
-- paid, e.g. a tax bill or an accountant's fee) -- it must never gain
-- tax-specific behaviour (D-34, clarified 2026-09-25).
--
-- set_updated_by() is the Phase 1 restamp-GUC pattern (mirrors bump_version
-- leaving `version` alone during a system restamp): a system bookkeeping
-- update (fincwin.system_restamp = 'on', reused by 02-08's materialiser)
-- leaves updated_by untouched; every other write stamps the acting user, or
-- null for a cron/service write, which the undo refusal reports as a
-- system change.

-- 1. Shared updated_by stamping trigger, reused by categories, transactions
-- and accounts (Task 2).
create or replace function public.set_updated_by()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if coalesce(current_setting('fincwin.system_restamp', true), '') = 'on' then
    new.updated_by := old.updated_by;
  else
    new.updated_by := (select auth.uid());
  end if;
  return new;
end;
$$;

revoke execute on function public.set_updated_by() from public, anon, authenticated;

-- 2. Table.
create table public.categories (
  id uuid primary key,                                                 -- client-generated (MON-08 pattern)
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  builtin_key text check (builtin_key is null or builtin_key in (
    'Housing', 'Utilities', 'Groceries', 'Transport', 'Insurance', 'Health', 'Subscriptions',
    'Debt', 'Savings', 'Business', 'Tax', 'Dining', 'Income', 'Transfer', 'Settlement'
  )),
  name text check (name is null or char_length(btrim(name)) between 1 and 60),
  color_key text not null check (color_key in ('green', 'slate', 'teal', 'blue', 'plum', 'rust', 'ochre')),
  is_system boolean not null default false,
  archived_at timestamptz,
  version integer not null default 1,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint categories_named check (name is not null or builtin_key is not null),
  constraint categories_system_builtin check (not is_system or builtin_key in ('Transfer', 'Settlement')),
  constraint categories_owner_builtin_key unique (owner_id, builtin_key)
);
create index categories_owner_id_idx on public.categories (owner_id);

-- 3. Triggers.
create trigger set_version before update on public.categories
  for each row execute function public.bump_version();
create trigger set_updated_by before update on public.categories
  for each row execute function public.set_updated_by();

create or replace function public.guard_category()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.owner_id := old.owner_id;
  new.builtin_key := old.builtin_key;
  new.is_system := old.is_system;
  if old.is_system then
    raise exception 'system category is read-only' using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke execute on function public.guard_category() from public, anon, authenticated;

create trigger guard_category
  before update on public.categories
  for each row execute function public.guard_category();

-- 4. RLS: owner-only (D-33), same shape as custom_currencies. No delete
-- policy -- archive instead (D-36).
alter table public.categories enable row level security;

create policy "owner reads own categories" on public.categories for select to authenticated
  using (owner_id = (select auth.uid()));
create policy "owner inserts own categories" on public.categories for insert to authenticated
  with check (owner_id = (select auth.uid()) and not is_system and builtin_key is null);
create policy "owner updates own categories" on public.categories for update to authenticated
  using (owner_id = (select auth.uid()) and not is_system)
  with check (owner_id = (select auth.uid()) and not is_system);

-- 5. Grants.
revoke all on public.categories from anon;
revoke insert, update, delete, truncate on public.categories from authenticated;
grant select on public.categories to authenticated;
grant insert (id, name, color_key) on public.categories to authenticated;
grant update (name, color_key, archived_at) on public.categories to authenticated;

-- 6. Seeding. Idempotent: safe to call again for a user who already has
-- their 15 rows (RESEARCH.md Pitfall 7).
create or replace function public.seed_user_categories(p_user uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.categories (id, owner_id, builtin_key, color_key, is_system)
  values
    (gen_random_uuid(), p_user, 'Housing', 'green', false),
    (gen_random_uuid(), p_user, 'Utilities', 'slate', false),
    (gen_random_uuid(), p_user, 'Groceries', 'teal', false),
    (gen_random_uuid(), p_user, 'Transport', 'slate', false),
    (gen_random_uuid(), p_user, 'Insurance', 'blue', false),
    (gen_random_uuid(), p_user, 'Health', 'teal', false),
    (gen_random_uuid(), p_user, 'Subscriptions', 'plum', false),
    (gen_random_uuid(), p_user, 'Debt', 'rust', false),
    (gen_random_uuid(), p_user, 'Savings', 'green', false),
    (gen_random_uuid(), p_user, 'Business', 'ochre', false),
    (gen_random_uuid(), p_user, 'Tax', 'rust', false),
    (gen_random_uuid(), p_user, 'Dining', 'ochre', false),
    (gen_random_uuid(), p_user, 'Income', 'green', false),
    (gen_random_uuid(), p_user, 'Transfer', 'slate', true),
    (gen_random_uuid(), p_user, 'Settlement', 'slate', true)
  on conflict on constraint categories_owner_builtin_key do nothing;
$$;

revoke execute on function public.seed_user_categories(uuid) from public, anon, authenticated;
grant execute on function public.seed_user_categories(uuid) to service_role;

-- 7. Extend the signup trigger. The first three statements are the existing
-- handle_new_user() body, kept byte-for-byte (interfaces block); only the
-- seed_user_categories call is new.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_household_id uuid;
begin
  insert into public.profiles (id, full_name, email)
  values (new.id,
          nullif(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'), ''),
          new.email);
  insert into public.households (owner_id) values (new.id) returning id into new_household_id;
  insert into public.household_members (household_id, user_id, role, weight) values (new_household_id, new.id, 'owner', 1);
  perform public.seed_user_categories(new.id);
  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- 8. Back-fill: idempotent seeding for every profile that predates this
-- migration (RESEARCH.md Pitfall 7 -- this project dogfoods on the single
-- production database, so some profiles already exist).
select public.seed_user_categories(p.id) from public.profiles p;
