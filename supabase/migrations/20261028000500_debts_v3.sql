-- 05.2: debts.pays_in_full (yes / sometimes / no): whether the card is paid off each month.
alter table public.debts add column if not exists pays_in_full text
  check (pays_in_full is null or pays_in_full in ('yes', 'sometimes', 'no'));
grant insert (pays_in_full) on public.debts to authenticated;
grant update (pays_in_full) on public.debts to authenticated;
