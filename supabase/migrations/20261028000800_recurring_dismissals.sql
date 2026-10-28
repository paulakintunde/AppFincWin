-- 05.2 DSU-05 (00-UPGRADE-PLAN 4.2): "Not regular" answers, stored per household.
-- A dismissal says "this payee in this direction is not a regular payment"; the detector skips it. Removal is a soft
-- delete (deleted_at) so Undo works; there is no delete grant. payee_key is the detector's offerKey
-- (normalised description | currency | sign), which the client builds; the server only bounds it.
-- Household FK cascades (GDPR erasure); created_by is set null when a member leaves, since the answer is the
-- household's. Additive: no existing row is written.
create table if not exists public.recurring_dismissals (
  id uuid primary key,                                                    -- client-generated (MON-08)
  household_id uuid not null references public.households(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  payee_key text not null check (char_length(payee_key) between 1 and 200),
  direction text not null check (direction in ('in', 'out')),
  dismissed_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists recurring_dismissals_live_key
  on public.recurring_dismissals (household_id, payee_key, direction) where deleted_at is null;

create or replace function public.guard_recurring_dismissal()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := coalesce((select auth.uid()), new.created_by);
    new.updated_by := new.created_by;
    return new;
  end if;
  new.id := old.id;
  new.household_id := old.household_id;
  new.payee_key := old.payee_key;
  new.direction := old.direction;
  new.dismissed_at := old.dismissed_at;
  new.created_at := old.created_at;
  if new.created_by is not null then new.created_by := old.created_by; end if;
  new.updated_at := now();
  return new;
end;
$$;
revoke execute on function public.guard_recurring_dismissal() from public, anon, authenticated;
create trigger guard_recurring_dismissal before insert or update on public.recurring_dismissals
  for each row execute function public.guard_recurring_dismissal();
create trigger set_version before update on public.recurring_dismissals
  for each row execute function public.bump_version();
create trigger set_updated_by before update on public.recurring_dismissals
  for each row execute function public.set_updated_by();

alter table public.recurring_dismissals enable row level security;
create policy "household dismissals" on public.recurring_dismissals for all to authenticated
  using (household_id in (select public.user_household_ids()))
  with check (household_id in (select public.user_household_ids()));

revoke all on public.recurring_dismissals from anon;
revoke insert, update, delete, truncate on public.recurring_dismissals from authenticated;
grant select on public.recurring_dismissals to authenticated;
grant insert (id, household_id, payee_key, direction) on public.recurring_dismissals to authenticated;
grant update (deleted_at) on public.recurring_dismissals to authenticated;
