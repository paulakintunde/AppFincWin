-- 05.2 (D-12, D-13, D-15..D-17, D-50, owner OQ1): additive decide_settings columns. Nothing dropped.

-- id lets a settings edit be undone through apply_patches. PK stays user_id; the client can never write id.
alter table public.decide_settings add column if not exists id uuid not null default gen_random_uuid();
alter table public.decide_settings add constraint decide_settings_id_key unique (id);

-- Income profile (D-15, D-17, D-34). Engine mapping of the six setup values is done in the snapshot (05.2-19).
alter table public.decide_settings add column if not exists income_types text[]
  check (income_types is null or (cardinality(income_types) between 1 and 6
    and income_types <@ array['salary_or_wages','commission_or_tips','freelance','own_business','pension_or_benefits','none']::text[]));
alter table public.decide_settings add column if not exists income_pattern text
  check (income_pattern is null or income_pattern in ('steady','variable','seasonal'));
alter table public.decide_settings add column if not exists income_pattern_confirmed boolean;
alter table public.decide_settings add column if not exists variable_method text
  check (variable_method is null or variable_method in ('match','spread','steady','balance'));
alter table public.decide_settings add column if not exists steady_amount bigint
  check (steady_amount is null or steady_amount between 0 and 10000000000000);
alter table public.decide_settings add column if not exists spread_months smallint
  check (spread_months is null or spread_months in (0,1,2,3,6,12));
comment on column public.decide_settings.spread_months is '0 = It varies, ask me each time (FincWin choice)';
alter table public.decide_settings add column if not exists hold_months smallint
  check (hold_months is null or hold_months in (1,2,3));
alter table public.decide_settings add column if not exists share_pct smallint
  check (share_pct is null or share_pct between 1 and 100);
comment on column public.decide_settings.share_pct is '100 = Just me; 1..99 = my share of shared bills; null = not answered (FincWin choice)';
alter table public.decide_settings add column if not exists detail text
  check (detail is null or detail in ('short','full'));
alter table public.decide_settings add column if not exists remind_plan boolean;
alter table public.decide_settings add column if not exists remind_unspent boolean;
alter table public.decide_settings add column if not exists setup_done_at timestamptz;

-- Everyday override, month marks, unspent anchor.
alter table public.decide_settings add column if not exists everyday_override bigint
  check (everyday_override is null or everyday_override between 0 and 10000000000000);
alter table public.decide_settings add column if not exists everyday_override_at date;
alter table public.decide_settings add column if not exists month_marks jsonb
  check (month_marks is null or (jsonb_typeof(month_marks) = 'object' and pg_column_size(month_marks) < 4096));
alter table public.decide_settings add column if not exists unspent_anchor bigint
  check (unspent_anchor is null or abs(unspent_anchor) <= 10000000000000);
alter table public.decide_settings add column if not exists unspent_anchor_at date;

-- Emergency account and goal, rough figures.
alter table public.decide_settings add column if not exists reserve_account_id uuid
  references public.accounts(id) on delete set null;
alter table public.decide_settings add column if not exists reserve_goal bigint
  check (reserve_goal is null or reserve_goal between 0 and 10000000000000);
alter table public.decide_settings add column if not exists rough_saving bigint
  check (rough_saving is null or rough_saving between 0 and 10000000000000);
alter table public.decide_settings add column if not exists rough_debt bigint
  check (rough_debt is null or rough_debt between 0 and 10000000000000);
alter table public.decide_settings add column if not exists rough_invest bigint
  check (rough_invest is null or rough_invest between 0 and 10000000000000);
alter table public.decide_settings add column if not exists rough_as_of date;

-- Unexplained-money answer (D-13 / 05.1 D-50): one answer per user.
alter table public.decide_settings add column if not exists unexplained_amount bigint
  check (unexplained_amount is null or unexplained_amount between 0 and 10000000000000);
alter table public.decide_settings add column if not exists unexplained_use text
  check (unexplained_use is null or unexplained_use in ('spare','envelope_or_goal','set_aside_for_bill','someone_elses'));
alter table public.decide_settings add column if not exists unexplained_at date;

-- Refine timestamps (D-12).
alter table public.decide_settings add column if not exists refine_last_at timestamptz;
alter table public.decide_settings add column if not exists refine_snooze_until timestamptz;

-- Column grants are additive; id is never granted.
grant insert (income_types, income_pattern, income_pattern_confirmed, variable_method, steady_amount, spread_months,
  hold_months, share_pct, detail, remind_plan, remind_unspent, setup_done_at, everyday_override, everyday_override_at,
  month_marks, unspent_anchor, unspent_anchor_at, reserve_account_id, reserve_goal, rough_saving, rough_debt,
  rough_invest, rough_as_of, unexplained_amount, unexplained_use, unexplained_at, refine_last_at, refine_snooze_until)
  on public.decide_settings to authenticated;
grant update (income_types, income_pattern, income_pattern_confirmed, variable_method, steady_amount, spread_months,
  hold_months, share_pct, detail, remind_plan, remind_unspent, setup_done_at, everyday_override, everyday_override_at,
  month_marks, unspent_anchor, unspent_anchor_at, reserve_account_id, reserve_goal, rough_saving, rough_debt,
  rough_invest, rough_as_of, unexplained_amount, unexplained_use, unexplained_at, refine_last_at, refine_snooze_until)
  on public.decide_settings to authenticated;

-- reserve_account_id must point at an account in one of the caller's households.
create or replace function public.guard_decide_settings_account()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.reserve_account_id is not null and not exists (
       select 1 from public.accounts a
        where a.id = new.reserve_account_id and a.household_id in (select public.user_household_ids())) then
    raise exception 'decide_settings: account is not in your household' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke execute on function public.guard_decide_settings_account() from public, anon, authenticated;
create trigger guard_decide_settings_account before insert or update of reserve_account_id on public.decide_settings
  for each row execute function public.guard_decide_settings_account();
