-- Household-of-one, profiles, and their RLS.
--
-- Every auth user gets a household, an owner membership (weight 1) and a
-- profile row created by a trigger in the signup transaction, with no
-- client step (ACC-04). RLS is the only authorisation boundary between one
-- household's money and another's (FND-12); every policy here uses the
-- (select auth.uid()) initPlan form and is proven by pgTAP in
-- supabase/tests/database/01_household_of_one.test.sql and
-- 02_rls_isolation.test.sql.

-- 1. Shared version-bump trigger function, reused by every versioned table.
create or replace function public.bump_version()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.version := old.version + 1;
  new.updated_at := now();
  return new;
end;
$$;

-- 2. Tables.
create table public.households (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.household_members (
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'owner' check (role in ('owner', 'member')),
  weight integer not null default 1 check (weight > 0),
  display_name text check (display_name is null or char_length(display_name) <= 60),
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (household_id, user_id)
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text check (full_name is null or char_length(full_name) <= 200),
  email text check (email is null or char_length(email) <= 320),
  accent text not null default 'green' check (accent in ('green', 'navy', 'rust', 'slate')),
  font_pairing text not null default 'bold' check (font_pairing in ('bold', 'modern', 'grotesk', 'neutral')),
  analytics_consent text check (analytics_consent in ('granted', 'declined')),
  analytics_consent_at timestamptz,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index household_members_user_id_idx on public.household_members (user_id);
create index households_owner_id_idx on public.households (owner_id);
-- (household_id, user_id) is covered by the primary key.

-- 3. Version-bump triggers.
create trigger set_version
  before update on public.households
  for each row execute function public.bump_version();

create trigger set_version
  before update on public.household_members
  for each row execute function public.bump_version();

create trigger set_version
  before update on public.profiles
  for each row execute function public.bump_version();

-- 4. Membership helper. Centralises the household-membership lookup so RLS
-- policies on household_members don't need to self-reference (which would
-- otherwise create recursive RLS evaluation).
create or replace function public.user_household_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select hm.household_id from public.household_members hm where hm.user_id = (select auth.uid())
$$;

revoke execute on function public.user_household_ids() from public, anon;
grant execute on function public.user_household_ids() to authenticated;

-- 5. Provisioning trigger (ACC-04).
--
-- Deviation from 00-RESEARCH.md's Pattern 3 / 00-06-PLAN.md's suggested
-- non-login owner role: the function owner stays `postgres` (Supabase's
-- documented pattern for trigger functions on auth.users, since a custom
-- role cannot be granted trigger rights on the auth schema without also
-- granting it BYPASSRLS or table ownership -- which widens privilege
-- rather than narrows it). The mitigations used instead: `search_path`
-- pinned to '', every reference fully qualified, and execute revoked from
-- every client role (anon, authenticated, public). See SUMMARY.md.
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
  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 6. RLS.
alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.profiles enable row level security;

create policy "members read their households" on public.households for select to authenticated
  using (id in (select public.user_household_ids()));

create policy "members read memberships of their households" on public.household_members for select to authenticated
  using (household_id in (select public.user_household_ids()));

create policy "users read own profile" on public.profiles for select to authenticated
  using (id = (select auth.uid()));

create policy "users update own profile" on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

revoke all on public.households, public.household_members, public.profiles from anon;
revoke insert, update, delete, truncate on public.households, public.household_members from authenticated;
revoke insert, update, delete, truncate on public.profiles from authenticated;
grant update (full_name, email, accent, font_pairing, analytics_consent, analytics_consent_at) on public.profiles to authenticated;

-- There are no insert/delete policies. Rows come only from the
-- handle_new_user trigger above. Household writes arrive with the
-- Household phase via RPCs.
