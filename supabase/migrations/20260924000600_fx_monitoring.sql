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
  kind text not null check (kind in ('stale', 'held', 'auto-accepted', 'pending-rows', 'fallback-used', 'sync-failed', 'hold-dropped')),
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

-- fx_restamp_by_rate(): re-stamps every transaction that could have been
-- stamped from the EUR-based rate for p_quote on p_rate_date, pending or
-- not, after that rate was removed from fx_rates (WR-B05). A row qualifies
-- when one of its legs is p_quote -- directly, or as the reference
-- currency of its author's custom currency -- and it is either still
-- pending (a provisional value may have come from any later date), or its
-- rate_date is p_rate_date, or its local_date falls in the 7-day exact
-- window that p_rate_date served. The restamp runs under the normal 7-day
-- window with no quote relaxed, so a row that can no longer be stamped
-- exact goes back to rate_pending for resolve-rate / fx_restamp_pending()
-- to resolve. A system restamp: version is not bumped. Returns the number
-- of rows re-stamped. Service-role only.
create or replace function public.fx_restamp_by_rate(p_quote text, p_rate_date date)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  perform set_config('fincwin.system_restamp', 'on', true);
  perform set_config('fincwin.restamp_relax_quotes', '', true);
  update public.transactions t
     set updated_at = now()
   where (t.rate_pending
          or t.rate_date = p_rate_date
          or t.local_date between p_rate_date and p_rate_date + 7)
     and (t.original_currency = p_quote
          or t.home_currency = p_quote
          or exists (
            select 1 from public.custom_currencies c
             where c.owner_id = t.created_by
               and c.code in (t.original_currency, t.home_currency)
               and c.reference_currency = p_quote));
  get diagnostics n = row_count;
  perform set_config('fincwin.system_restamp', '', true);
  return n;
end;
$$;

revoke execute on function public.fx_restamp_by_rate(text, date) from public, anon, authenticated;
grant execute on function public.fx_restamp_by_rate(text, date) to service_role;

-- fx_drop_hold(): operator runbook (D-12; documented in
-- docs/ops/fx-operations.md by plan 01-11). Whatever the hold's status --
-- held, confirmed or auto-accepted -- any fx_rates row with the same
-- (base, quote, rate_date, source) is removed, because a confirmed rate, or
-- a held value that reached fx_rates some other way, would otherwise stay
-- served (WR-B05). Every transaction that could have been stamped from it
-- is then re-stamped through fx_restamp_by_rate(), including rows that are
-- no longer rate_pending, and a 'hold-dropped' alert records how many rows
-- were re-stamped. Dropping an already-dropped hold is a no-op. Returns the
-- number of re-stamped rows.
create or replace function public.fx_drop_hold(p_hold_id bigint)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  h public.fx_rate_holds%rowtype;
  removed integer := 0;
  restamped integer := 0;
begin
  select * into h from public.fx_rate_holds where id = p_hold_id;
  if not found then
    raise exception 'fx_rate_holds row % not found', p_hold_id using errcode = 'P0002';
  end if;

  if h.status = 'dropped' then
    return 0;
  end if;

  delete from public.fx_rates
   where base = h.base and quote = h.quote and rate_date = h.held_rate_date and source = h.source;
  get diagnostics removed = row_count;

  update public.fx_rate_holds set status = 'dropped', resolved_at = now() where id = p_hold_id;

  if removed > 0 then
    restamped := public.fx_restamp_by_rate(h.quote, h.held_rate_date);
  end if;

  insert into public.fx_alerts (kind, quote, detail)
  values (
    'hold-dropped',
    h.quote,
    jsonb_build_object(
      'holdId', h.id,
      'previousStatus', h.status,
      'heldRate', h.held_rate::text,
      'heldRateDate', h.held_rate_date,
      'rateRemoved', removed > 0,
      'restamped', restamped)
  );

  return restamped;
end;
$$;

revoke execute on function public.fx_drop_hold(bigint) from public, anon, authenticated;
grant execute on function public.fx_drop_hold(bigint) to service_role;
