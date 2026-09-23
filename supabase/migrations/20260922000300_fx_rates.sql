-- ENV-08: reference FX rate store, written only by the fx-sync Edge
-- Function (service-role key, bypasses RLS). Signed-in users may read it;
-- no client role may write it. Rates are multiplicative factors, hence
-- numeric(24,10); money amounts themselves stay integer minor units
-- (ARCHITECTURE.md Pattern 7).
create table public.fx_rates (
  base char(3) not null check (base ~ '^[A-Z]{3}$'),
  quote char(3) not null check (quote ~ '^[A-Z]{3}$'),
  rate numeric(24,10) not null check (rate > 0),
  rate_date date not null,
  source text not null default 'frankfurter-v2' check (source in ('frankfurter-v2', 'open-er-api')),
  fetched_at timestamptz not null default now(),
  primary key (base, quote, rate_date, source)
);
-- 'open-er-api' is allowed in the check now so MON-12 (Phase 1, the
-- fallback source) needs no constraint migration of its own.

create index fx_rates_quote_date_idx on public.fx_rates (quote, rate_date desc);

alter table public.fx_rates enable row level security;

create policy "signed-in users read fx rates" on public.fx_rates for select to authenticated using (true);

revoke all on public.fx_rates from anon;
revoke insert, update, delete, truncate on public.fx_rates from authenticated;

comment on table public.fx_rates is 'Reference FX rates written only by the fx-sync Edge Function (ENV-08). Rates are multiplicative factors, hence numeric; money amounts stay integer minor units.';
