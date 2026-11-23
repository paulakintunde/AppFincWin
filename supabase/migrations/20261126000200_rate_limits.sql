-- Phase 10 (10-09): ACC-13 per-user rate limits for Edge Functions. Fixed window, service role only.
-- Functions are stateless and run on many instances, so the counter lives here. Keys look like '<function>:<user id>'.

create table public.rate_limits (
  key text not null check (char_length(key) <= 200),
  window_start timestamptz not null,
  count integer not null default 1,
  primary key (key, window_start)
);

alter table public.rate_limits enable row level security;
revoke all on public.rate_limits from anon, authenticated;

-- True = allowed. The window start is floor(epoch / window) * window, so a new window starts again at 1.
create or replace function public.rate_limit_hit(p_key text, p_limit integer, p_window_seconds integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_start timestamptz;
  v_count integer;
begin
  if p_window_seconds is null or p_window_seconds < 1 or p_limit is null or p_limit < 1 then
    raise exception 'invalid rate limit arguments';
  end if;
  v_start := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  insert into public.rate_limits as r (key, window_start, count)
  values (p_key, v_start, 1)
  on conflict (key, window_start) do update set count = r.count + 1
  returning r.count into v_count;
  return v_count <= p_limit;
end;
$$;

revoke execute on function public.rate_limit_hit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.rate_limit_hit(text, integer, integer) to service_role;

create or replace function public.purge_rate_limits()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n integer;
begin
  delete from public.rate_limits where window_start < now() - interval '2 days';
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

revoke execute on function public.purge_rate_limits() from public, anon, authenticated;
grant execute on function public.purge_rate_limits() to service_role;

select cron.schedule('rate-limits-purge', '50 3 * * *', $$select public.purge_rate_limits()$$);
