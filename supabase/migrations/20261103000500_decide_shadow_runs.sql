-- 05.4 M6 (BO-08, D-10, D-11, D-13): rounded shadow-run results, one row per tester, engine revision and fixed sample.
-- The check runs on the tester's phone; only the rounded result comes here. Insert only for your own id while decide_shadow is true.
-- No select, update or delete for clients (the tester cannot read it back). Erased with the account by the FK cascade.
create table if not exists public.decide_shadow_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  engine_revision text not null check (engine_revision ~ '^[a-z0-9._-]{1,40}$'),
  sample_id text not null check (sample_id in ('s60', 'p500', 'l2000', 'c9000_cash', 'c9000_plan', 'f1200_plan')),
  code text not null check (code in ('needs_input', 'not_yet', 'monthly_short', 'emergency_use', 'fits_unspent', 'fits_month',
    'fits_uses_net', 'fits_uses_overdraft', 'fits_by_borrowing', 'fits_on_your_answer')),
  -- Round-1 right-answer variants (D-35..D-40) added before the first push: not_cleared, no_net, small_net, costly_debt,
  -- borrowing_costs_more. Keep in step with VARIANTS in src/engine/decide/v3/__tests__/rightAnswers/schema.ts.
  variant text check (variant is null or variant in ('payday', 'not_covered', 'low_month', 'tight', 'protection_off',
    'not_cleared', 'no_net', 'small_net', 'costly_debt', 'borrowing_costs_more')),
  reasons text[] not null default '{}' check (cardinality(reasons) <= 12),
  figures jsonb not null check (jsonb_typeof(figures) = 'object' and pg_column_size(figures) < 2048),
  created_at timestamptz not null default now(),
  unique (user_id, engine_revision, sample_id)
);

alter table public.decide_shadow_runs enable row level security;

create policy "insert own shadow run with consent" on public.decide_shadow_runs
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.decide_shadow)
  );

-- Insert only. No select, update or delete is granted.
grant insert (user_id, engine_revision, sample_id, code, variant, reasons, figures) on public.decide_shadow_runs to authenticated;
