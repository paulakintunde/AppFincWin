-- On-demand FX stamping (decision 02-DECISION-fx-on-demand.md items 1, 3, 4, 6).
--
-- The daily fx-sync feed is going away: rates are fetched on demand by
-- resolve-rate and stored sparsely. per_eur_rate() used to call ANY stored
-- rate up to 7 days earlier "exact". With sparse storage a rate stored for
-- someone else's line five days ago would count as this date's rate and the
-- line's own date would never be fetched. So:
--
--   * fx_rate_lookups records what an on-demand fetch learned: the rate_date
--     the provider returned for a requested date. An earlier-dated stored row
--     is exact for a date only when a lookup says it is that date's
--     publication (fx_rate_covers).
--   * A lookup is FINAL when the requested date is at least two UTC days
--     older than the fetch (the provider will not revise it). A non-final
--     lookup counts for one hour only, so later lines on a recent date
--     trigger a fresh fetch.
--   * A lookup may point at a rate still held (MON-11). Coverage requires the
--     referenced fx_rates row to exist (per_eur_rate picks the nearest stored
--     row and compares its rate_date), so the lookup is inert while the value
--     is quarantined and covers as soon as the row lands (final lookups at
--     once; resolve-rate refreshes fetched_at on auto-accept for non-final).
--   * fx_rate_fetch_failures backs off per reason: 'both-sources-failed' 30
--     minutes, 'no-usable-rate' and 'held' 6 hours (fx_quotes_needing_fetch).
--   * is_iso_currency() accepts every active ISO 4217 code with no stored
--     rate (plus EUR and any code already in fx_rates).
--
-- The 7-day window survives only as the preference order for a PROVISIONAL
-- value. Ordered after 20261007000300 (retire jobs). No drop, rename or type
-- change.

create table public.fx_rate_lookups (
  base char(3) not null default 'EUR' check (base = 'EUR'),
  quote char(3) not null check (quote ~ '^[A-Z]{3}$'),
  requested_date date not null,
  rate_date date not null,
  source text not null check (source in ('frankfurter-v2', 'open-er-api')),
  fetched_at timestamptz not null default now(),
  primary key (base, quote, requested_date),
  check (rate_date <= requested_date)
);
comment on table public.fx_rate_lookups is 'On-demand FX: which rate_date a fetch for (quote, requested_date) returned. Written by resolve-rate (service role); read by fx_rate_covers().';

create table public.fx_rate_fetch_failures (
  base char(3) not null default 'EUR' check (base = 'EUR'),
  quote char(3) not null check (quote ~ '^[A-Z]{3}$'),
  requested_date date not null,
  reason text not null check (reason in ('both-sources-failed', 'no-usable-rate', 'held')),
  failed_at timestamptz not null default now(),
  primary key (base, quote, requested_date)
);
comment on table public.fx_rate_fetch_failures is 'Negative cache for on-demand FX fetches; fx_quotes_needing_fetch() skips a (quote, date) whose failure is younger than its reason window.';

alter table public.fx_rate_lookups enable row level security;
alter table public.fx_rate_fetch_failures enable row level security;
revoke all on public.fx_rate_lookups from anon, authenticated;
revoke all on public.fx_rate_fetch_failures from anon, authenticated;

create or replace function public.fx_rate_covers(p_quote text, p_on date, p_rate_date date)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_rate_date = p_on or exists (
    select 1 from public.fx_rate_lookups l
     where l.base = 'EUR' and l.quote = p_quote
       and l.requested_date = p_on and l.rate_date = p_rate_date
       and (l.requested_date <= (l.fetched_at at time zone 'UTC')::date - 2
            or l.fetched_at > now() - interval '1 hour')
  )
$$;

create or replace function public.fx_quotes_needing_fetch(p_quotes text[], p_on date)
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(q.code order by q.code), '{}'::text[])
    from (select distinct c as code from unnest(p_quotes) as c where c <> 'EUR') q
   where not exists (
           select 1
             from (select r.rate_date
                     from public.fx_rates r
                    where r.base = 'EUR' and r.quote = q.code and r.rate_date <= p_on
                    order by r.rate_date desc, (r.source = 'frankfurter-v2') desc
                    limit 1) n
            where public.fx_rate_covers(q.code, p_on, n.rate_date))
     and not exists (
           select 1 from public.fx_rate_fetch_failures f
            where f.base = 'EUR' and f.quote = q.code and f.requested_date = p_on
              and f.failed_at > now() - case f.reason
                    when 'both-sources-failed' then interval '30 minutes'
                    else interval '6 hours' end)
$$;

-- per_eur_rate: only the ISO branch changes; EUR and custom branches are
-- verbatim from 20260924000500.
create or replace function public.per_eur_rate(
  p_code text,
  p_on date,
  p_owner uuid,
  p_relax_quotes text[] default null,
  out rate numeric,
  out rate_date date,
  out source text,
  out exact boolean,
  out custom_unit_value numeric,
  out custom_ref_per_eur numeric
)
returns record
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  c public.custom_currencies%rowtype;
  ref record;
  relax boolean := p_code = any(coalesce(p_relax_quotes, '{}'::text[]));
  e_rate numeric;
  e_date date;
  e_source text;
  e_found boolean;
begin
  exact := false;

  if p_code = 'EUR' then
    rate := 1; rate_date := p_on; source := null; exact := true;
    return;
  end if;

  select * into c from public.custom_currencies where owner_id = p_owner and code = p_code;
  if found then
    select * into ref from public.per_eur_rate(c.reference_currency, p_on, null, p_relax_quotes);
    if ref.rate is null then
      rate := null; rate_date := null; source := null; exact := false;
      return;
    end if;
    rate := public.custom_per_eur(ref.rate, c.unit_value);
    rate_date := least(ref.rate_date, c.as_of);
    source := case when ref.source = 'open-er-api' then 'open-er-api' else 'custom' end;
    exact := ref.exact;
    custom_unit_value := c.unit_value;
    custom_ref_per_eur := ref.rate;
    return;
  end if;

  -- Nearest earlier row, any age.
  select r.rate, r.rate_date, r.source into e_rate, e_date, e_source
    from public.fx_rates r
   where r.base = 'EUR' and r.quote = p_code and r.rate_date <= p_on
   order by r.rate_date desc, (r.source = 'frankfurter-v2') desc
   limit 1;
  e_found := found;

  -- Exact: relaxed by a backfill, or covered by the line's own date / a
  -- recorded lookup.
  if e_found and (relax or public.fx_rate_covers(p_code, p_on, e_date)) then
    rate := e_rate; rate_date := e_date; source := e_source; exact := true;
    return;
  end if;

  -- Provisional: an earlier row within a week.
  if e_found and e_date >= p_on - 7 then
    rate := e_rate; rate_date := e_date; source := e_source; exact := false;
    return;
  end if;

  -- Provisional: nearest later row.
  select r.rate, r.rate_date, r.source into rate, rate_date, source
    from public.fx_rates r
   where r.base = 'EUR' and r.quote = p_code and r.rate_date > p_on
   order by r.rate_date asc, (r.source = 'frankfurter-v2') desc
   limit 1;
  if found then
    exact := false;
    return;
  end if;

  -- Provisional: an older earlier row.
  if e_found then
    rate := e_rate; rate_date := e_date; source := e_source; exact := false;
    return;
  end if;

  rate := null; rate_date := null; source := null; exact := false;
  return;
end;
$$;

create or replace function public.is_iso_currency(p_code text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_code = 'EUR'
    or p_code = any (array[
    -- active (ISO 4217, 2025)
    'AED', 'AFN', 'ALL', 'AMD', 'AOA', 'ARS', 'AUD', 'AWG', 'AZN', 'BAM', 'BBD', 'BDT', 'BGN', 'BHD', 'BIF', 'BMD',
    'BND', 'BOB', 'BOV', 'BRL', 'BSD', 'BTN', 'BWP', 'BYN', 'BZD', 'CAD', 'CDF', 'CHE', 'CHF', 'CHW', 'CLF', 'CLP',
    'CNY', 'COP', 'COU', 'CRC', 'CUP', 'CVE', 'CZK', 'DJF', 'DKK', 'DOP', 'DZD', 'EGP', 'ERN', 'ETB', 'EUR', 'FJD',
    'FKP', 'GBP', 'GEL', 'GHS', 'GIP', 'GMD', 'GNF', 'GTQ', 'GYD', 'HKD', 'HNL', 'HTG', 'HUF', 'IDR', 'ILS', 'INR',
    'IQD', 'IRR', 'ISK', 'JMD', 'JOD', 'JPY', 'KES', 'KGS', 'KHR', 'KMF', 'KPW', 'KRW', 'KWD', 'KYD', 'KZT', 'LAK',
    'LBP', 'LKR', 'LRD', 'LSL', 'LYD', 'MAD', 'MDL', 'MGA', 'MKD', 'MMK', 'MNT', 'MOP', 'MRU', 'MUR', 'MVR', 'MWK',
    'MXN', 'MXV', 'MYR', 'MZN', 'NAD', 'NGN', 'NIO', 'NOK', 'NPR', 'NZD', 'OMR', 'PAB', 'PEN', 'PGK', 'PHP', 'PKR',
    'PLN', 'PYG', 'QAR', 'RON', 'RSD', 'RUB', 'RWF', 'SAR', 'SBD', 'SCR', 'SDG', 'SEK', 'SGD', 'SHP', 'SLE', 'SOS',
    'SRD', 'SSP', 'STN', 'SVC', 'SYP', 'SZL', 'THB', 'TJS', 'TMT', 'TND', 'TOP', 'TRY', 'TTD', 'TWD', 'TZS', 'UAH',
    'UGX', 'USD', 'USN', 'UYI', 'UYU', 'UYW', 'UZS', 'VED', 'VES', 'VND', 'VUV', 'WST', 'XAF', 'XAG', 'XAU', 'XBA',
    'XBB', 'XBC', 'XBD', 'XCD', 'XCG', 'XDR', 'XOF', 'XPD', 'XPF', 'XPT', 'XSU', 'XTS', 'XUA', 'XXX', 'YER', 'ZAR',
    'ZMW', 'ZWG'
  ]::text[])
    or exists (select 1 from public.fx_rates r where r.quote = p_code)
$$;

revoke execute on function public.fx_rate_covers(text, date, date) from public, anon, authenticated;
grant execute on function public.fx_rate_covers(text, date, date) to service_role;
revoke execute on function public.fx_quotes_needing_fetch(text[], date) from public, anon, authenticated;
grant execute on function public.fx_quotes_needing_fetch(text[], date) to service_role;

revoke execute on function public.per_eur_rate(text, date, uuid, text[]) from public, anon, authenticated;
grant execute on function public.per_eur_rate(text, date, uuid, text[]) to service_role;
revoke execute on function public.is_iso_currency(text) from public, anon;
grant execute on function public.is_iso_currency(text) to authenticated, service_role;
