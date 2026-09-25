-- FX monitoring: resilient fx-sync ingest state (MON-06, MON-11, MON-12).
--
-- currencies mirrors Frankfurter v2's /v2/currencies metadata (name, symbol,
-- ISO numeric) for the D-08 currency picker -- client-readable, since the
-- picker needs it. fx_rate_holds quarantines a >10% day-on-day move instead
-- of writing it straight to fx_rates (D-11, MON-11); fx_alerts queues every
-- hold/fallback/staleness/sync-failure event for the operator digest (D-09,
-- D-12, plan 01-11). Neither hold nor alert rows are ever readable by a
-- client role -- fx_latest_rates() and per_eur_rate() (plan 01-05) only
-- ever read fx_rates, never fx_rate_holds.

create table public.currencies (
  code char(3) primary key check (code ~ '^[A-Z]{3}$'),
  iso_numeric text,
  name text not null,
  symbol text,
  start_date date,
  end_date date,
  staleness_limit_days smallint check (staleness_limit_days between 1 and 30),
  synced_at timestamptz
);
comment on column public.currencies.staleness_limit_days is 'D-10 per-currency override of the global staleness default (about 4 days); null = global default. Populating overrides for volatile currencies (ARS, NGN, TRY) is deferred to ops.';

alter table public.currencies enable row level security;
create policy "signed-in users read currencies" on public.currencies for select to authenticated using (true);
revoke all on public.currencies from anon;
revoke insert, update, delete, truncate on public.currencies from authenticated;

create table public.fx_rate_holds (
  id bigint generated always as identity primary key,
  base char(3) not null default 'EUR' check (base ~ '^[A-Z]{3}$'),
  quote char(3) not null check (quote ~ '^[A-Z]{3}$'),
  held_rate numeric(24,10) not null check (held_rate > 0),
  held_rate_date date not null,
  source text not null check (source in ('frankfurter-v2', 'open-er-api')),
  prior_rate numeric(24,10),
  prior_rate_date date,
  change_ratio numeric(12,6),
  status text not null default 'held' check (status in ('held', 'confirmed', 'auto-accepted', 'dropped')),
  held_at timestamptz not null default now(),
  resolved_at timestamptz,
  unique (quote, held_rate_date, source)
);
create index fx_rate_holds_status_held_at_idx on public.fx_rate_holds (status, held_at);
comment on table public.fx_rate_holds is 'D-11 quarantine for a >10% day-on-day FX move (MON-11). Never read by per_eur_rate() (20260924000500_fx_stamping.sql) -- a held rate can never be served to a conversion, only a confirmed or auto-accepted one, and only once it has been upserted into fx_rates.';

-- A resolved hold is terminal (CR-B02). held -> confirmed / auto-accepted /
-- dropped, and confirmed / auto-accepted -> dropped (the operator's
-- fx_drop_hold) are the only transitions. Any other update to a resolved
-- row -- above all fx-sync re-upserting the same (quote, date, source) as
-- 'held' after the operator dropped it -- is silently discarded rather than
-- raised, so one stale tuple never fails a whole ingest batch.
create or replace function public.guard_fx_rate_hold_status()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status = 'dropped' then
    return old;
  end if;
  if old.status <> 'held' and new.status is distinct from 'dropped' then
    return old;
  end if;
  return new;
end;
$$;

create trigger guard_fx_rate_hold_status
  before update on public.fx_rate_holds
  for each row execute function public.guard_fx_rate_hold_status();

revoke execute on function public.guard_fx_rate_hold_status() from public, anon, authenticated;

alter table public.fx_rate_holds enable row level security;
-- No policy for authenticated on purpose (D-11): a held row must never be
-- client-visible, so there is nothing an RLS `using` clause could safely
-- allow. Combined with the revoke below, every client role is denied at the
-- privilege level before RLS is even evaluated.
revoke all on public.fx_rate_holds from anon, authenticated;

create table public.fx_alerts (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('stale', 'held', 'auto-accepted', 'pending-rows', 'fallback-used', 'sync-failed')),
  quote text,
  detail jsonb not null default '{}',
  created_at timestamptz not null default now(),
  emailed_at timestamptz
);
create index fx_alerts_unemailed_idx on public.fx_alerts (created_at) where emailed_at is null;
comment on table public.fx_alerts is 'Operator digest queue for FX monitoring events (D-09, D-12). Never client-readable; read and marked emailed by the fx-monitor function (plan 01-11).';

alter table public.fx_alerts enable row level security;
revoke all on public.fx_alerts from anon, authenticated;

-- fx_latest_rates(): one row per quote, the latest EUR-based rate on or
-- before p_on_or_before (or overall latest if null), preferring
-- frankfurter-v2 over a same-date duplicate from open-er-api. security
-- invoker, since it only ever reads fx_rates, which authenticated can
-- already select directly -- this is a convenience wrapper, not a
-- privilege escalation.
create or replace function public.fx_latest_rates(p_on_or_before date default null)
returns table (quote text, rate text, rate_date date, source text)
language sql
stable
security invoker
set search_path = ''
as $$
  select distinct on (r.quote) r.quote::text, r.rate::text, r.rate_date, r.source
  from public.fx_rates r
  where r.base = 'EUR' and (p_on_or_before is null or r.rate_date <= p_on_or_before)
  order by r.quote, r.rate_date desc, (r.source = 'frankfurter-v2') desc
$$;

revoke execute on function public.fx_latest_rates(date) from public, anon;
grant execute on function public.fx_latest_rates(date) to authenticated, service_role;

-- fx_drop_hold(): operator runbook (D-12; documented in
-- docs/ops/fx-operations.md by plan 01-11). If the hold was already
-- auto-accepted (i.e. its rate was upserted into fx_rates after 2 days
-- unconfirmed), remove that fx_rates row too. A transaction already
-- stamped from a dropped auto-accepted rate keeps its stamp -- a stamp is
-- a historical fact, not a live pointer -- the operator can re-stamp
-- individually affected rows via restamp_transaction() (plan 01-05) only
-- for rows that are still rate_pending.
create or replace function public.fx_drop_hold(p_hold_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  h public.fx_rate_holds%rowtype;
begin
  select * into h from public.fx_rate_holds where id = p_hold_id;
  if not found then
    raise exception 'fx_rate_holds row % not found', p_hold_id using errcode = 'P0002';
  end if;

  if h.status = 'auto-accepted' then
    delete from public.fx_rates
     where base = h.base and quote = h.quote and rate_date = h.held_rate_date and source = h.source;
  end if;

  update public.fx_rate_holds set status = 'dropped', resolved_at = now() where id = p_hold_id;
end;
$$;

revoke execute on function public.fx_drop_hold(bigint) from public, anon, authenticated;
grant execute on function public.fx_drop_hold(bigint) to service_role;
