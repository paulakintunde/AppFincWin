-- 05.2 DSU-15: the once-only new-payer question in Activity, stored per household.
-- When money from a new payer arrives the user answers once how it counts (available to spend, or kept aside);
-- the answer becomes one live rule per payer. payer_key is normalised on the client with normaliseDescription
-- (like category_rules.keyword_norm); the server only bounds it. Removal is a soft delete so Undo works; there is no
-- delete grant. Household FK cascades (GDPR erasure); created_by is set null when a member leaves.
-- Additive: no existing row is written.
create table if not exists public.income_payer_prompts (
  id uuid primary key,                                                    -- client-generated (MON-08)
  household_id uuid not null references public.households(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  payer_key text not null check (char_length(payer_key) between 1 and 60),
  income_kind text not null check (char_length(income_kind) between 1 and 40 and income_kind ~ '^[a-z0-9_-]+$'),
  counts_as text not null check (counts_as in ('available', 'kept')),
  apply_to_future boolean not null default true,
  deleted_at timestamptz,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists income_payer_prompts_live_key
  on public.income_payer_prompts (household_id, payer_key) where deleted_at is null;

create or replace function public.guard_income_payer_prompt()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := coalesce((select auth.uid()), new.created_by);
    new.updated_by := new.created_by;
    return new;
  end if;
  new.id := old.id;
  new.household_id := old.household_id;
  new.payer_key := old.payer_key;
  new.created_at := old.created_at;
  if new.created_by is not null then new.created_by := old.created_by; end if;
  new.updated_at := now();
  return new;
end;
$$;
revoke execute on function public.guard_income_payer_prompt() from public, anon, authenticated;
create trigger guard_income_payer_prompt before insert or update on public.income_payer_prompts
  for each row execute function public.guard_income_payer_prompt();
create trigger set_version before update on public.income_payer_prompts
  for each row execute function public.bump_version();
create trigger set_updated_by before update on public.income_payer_prompts
  for each row execute function public.set_updated_by();

alter table public.income_payer_prompts enable row level security;
create policy "household payer prompts" on public.income_payer_prompts for all to authenticated
  using (household_id in (select public.user_household_ids()))
  with check (household_id in (select public.user_household_ids()));

revoke all on public.income_payer_prompts from anon;
revoke insert, update, delete, truncate on public.income_payer_prompts from authenticated;
grant select on public.income_payer_prompts to authenticated;
grant insert (id, household_id, payer_key, income_kind, counts_as, apply_to_future) on public.income_payer_prompts to authenticated;
grant update (income_kind, counts_as, apply_to_future, deleted_at) on public.income_payer_prompts to authenticated;
