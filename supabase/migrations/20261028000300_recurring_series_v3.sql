-- 05.2: series attributes the v3 engine reads (counts_as, income_kind, saving_mode, pay_group). Written only via the series RPCs and apply_patches (plan 05.2-08); no client grant.
alter table public.recurring_series add column if not exists counts_as text
  check (counts_as is null or counts_as in ('available', 'kept'));
alter table public.recurring_series add column if not exists income_kind text
  check (income_kind is null or (char_length(income_kind) between 1 and 40 and income_kind ~ '^[a-z0-9_-]+$'));
alter table public.recurring_series add column if not exists saving_mode text
  check (saving_mode is null or saving_mode in ('fixed', 'flexible'));
alter table public.recurring_series add column if not exists pay_group uuid;
