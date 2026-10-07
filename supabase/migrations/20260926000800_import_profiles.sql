-- Remembered statement-format profiles (D-42, REC-13, RESEARCH §A6).
--
-- Every import builds a format profile before any conversion (D-41): what a
-- positive amount means, what the balance column shows, and any stated
-- limit. Once the user confirms a reading, it is remembered per file layout
-- (a header signature) and per account, so the next file from the same
-- bank is read the same way without asking again.
--
-- Per-user, not per-account: one member's remembered reading must never
-- silently apply to another household member's differently-laid-out
-- export (Phase 8). The account itself stays household-scoped, but the
-- profile row belongs to whichever member confirmed it -- the same
-- owner-only shape as custom_currencies (Phase 1 D-07), not the household
-- user_household_ids() pattern.
--
-- Additive: a brand-new table, no change to any existing column (FND-10,
-- Phase 1 D-26/D-27).

create table public.import_profiles (
  id uuid primary key,                                     -- client-generated (MON-08)
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,
  layout_signature text not null check (char_length(layout_signature) between 1 and 500),
  profile jsonb not null check (jsonb_typeof(profile) = 'object' and pg_column_size(profile) <= 2048),
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint import_profiles_owner_account_signature unique (owner_id, account_id, layout_signature)
);

create index import_profiles_account_id_idx on public.import_profiles (account_id);

create trigger set_version before update on public.import_profiles for each row execute function public.bump_version();

alter table public.import_profiles enable row level security;

create policy "owner reads own import profiles" on public.import_profiles for select to authenticated
  using (owner_id = (select auth.uid()));
create policy "owner inserts own import profiles" on public.import_profiles for insert to authenticated
  with check (owner_id = (select auth.uid())
    and account_id in (select a.id from public.accounts a where a.household_id in (select public.user_household_ids())));
create policy "owner updates own import profiles" on public.import_profiles for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

revoke all on public.import_profiles from anon;
revoke insert, update, delete, truncate on public.import_profiles from authenticated;
grant select on public.import_profiles to authenticated;
grant insert (id, account_id, layout_signature, profile) on public.import_profiles to authenticated;
grant update (profile) on public.import_profiles to authenticated;

-- No delete policy: an account delete cascades the profile (on delete
-- cascade above); account deletion itself cascades from auth.users
-- deletion per the existing account-deletion purge chain.
