-- 05.2 D-13: the in-check answers, owner-private (one person's check data).
--   pay_arrival     key '<series uuid>:<YYYY-MM-DD>'  bool_value + on_date   did this pay land on that date
--   expected_income key 'YYYY-MM'                     amount + on_date       expected income for that month
--   held_bridge     key check_id::text                amount + check_id      amount held back for one check
--   volatile_cover  key check_id::text                bool_value + check_id  can you cover the low months, one check
-- The bridge and cover rows go away with their check (check_id FK cascades). Removal is a soft delete so Undo works;
-- there is no delete grant. Every FK to a user or household cascades (GDPR erasure). Additive.
create table if not exists public.decide_answers (
  id uuid primary key,                                                    -- client-generated (MON-08)
  household_id uuid not null references public.households(id) on delete cascade,
  created_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  updated_by uuid references auth.users(id) on delete set null,
  kind text not null check (kind in ('pay_arrival', 'expected_income', 'held_bridge', 'volatile_cover')),
  key text not null check (char_length(key) between 1 and 80),
  amount bigint check (amount is null or amount between 0 and 10000000000000),
  bool_value boolean,
  on_date date,
  check_id uuid references public.decide_checks(id) on delete cascade,
  deleted_at timestamptz,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint decide_answers_shape check (
    (kind = 'pay_arrival' and bool_value is not null and on_date is not null and amount is null and check_id is null
       and key ~ '^[0-9a-f-]{36}:\d{4}-\d{2}-\d{2}$')
    or (kind = 'expected_income' and amount is not null and on_date is not null and bool_value is null and check_id is null
       and key ~ '^\d{4}-\d{2}$')
    or (kind = 'held_bridge' and amount is not null and check_id is not null and key = check_id::text and bool_value is null)
    or (kind = 'volatile_cover' and bool_value is not null and check_id is not null and key = check_id::text and amount is null))
);
create unique index if not exists decide_answers_live_key
  on public.decide_answers (created_by, kind, key) where deleted_at is null;
create index if not exists decide_answers_check_idx on public.decide_answers (check_id) where check_id is not null;
create index if not exists decide_answers_household_idx on public.decide_answers (household_id);

create or replace function public.guard_decide_answer()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.check_id is not null and not exists (
       select 1 from public.decide_checks k where k.id = new.check_id and k.household_id = new.household_id) then
    raise exception 'decide_answers: check is not in this household' using errcode = '42501';
  end if;
  if tg_op = 'INSERT' then
    new.created_by := coalesce((select auth.uid()), new.created_by);
    new.updated_by := new.created_by;
    return new;
  end if;
  new.id := old.id;
  new.household_id := old.household_id;
  new.kind := old.kind;
  new.key := old.key;
  new.check_id := old.check_id;
  new.created_at := old.created_at;
  if new.created_by is not null then new.created_by := old.created_by; end if;
  new.updated_at := now();
  return new;
end;
$$;
revoke execute on function public.guard_decide_answer() from public, anon, authenticated;
create trigger guard_decide_answer before insert or update on public.decide_answers
  for each row execute function public.guard_decide_answer();
create trigger set_version before update on public.decide_answers
  for each row execute function public.bump_version();
create trigger set_updated_by before update on public.decide_answers
  for each row execute function public.set_updated_by();

alter table public.decide_answers enable row level security;
create policy "own decide answers" on public.decide_answers for all to authenticated
  using (created_by = (select auth.uid()) and household_id in (select public.user_household_ids()))
  with check (created_by = (select auth.uid()) and household_id in (select public.user_household_ids()));

revoke all on public.decide_answers from anon;
revoke insert, update, delete, truncate on public.decide_answers from authenticated;
grant select on public.decide_answers to authenticated;
grant insert (id, household_id, kind, key, amount, bool_value, on_date, check_id) on public.decide_answers to authenticated;
grant update (amount, bool_value, on_date, deleted_at) on public.decide_answers to authenticated;
