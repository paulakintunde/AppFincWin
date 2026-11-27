-- 10-review S-7 (owner-approved 2026-11-27): reviewer-signin counts only failed password attempts toward its per-email
-- limit. That needs a read that does not count: rate_limit_peek says whether the key is still under its limit in the
-- current window, without adding a hit. A failure is then counted with rate_limit_hit. Same window rule as rate_limit_hit.

create function public.rate_limit_peek(p_key text, p_limit integer, p_window_seconds integer)
returns boolean
language plpgsql
stable
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
  select r.count into v_count from public.rate_limits r where r.key = p_key and r.window_start = v_start;
  return coalesce(v_count, 0) < p_limit;
end;
$$;

revoke execute on function public.rate_limit_peek(text, integer, integer) from public, anon, authenticated;
grant execute on function public.rate_limit_peek(text, integer, integer) to service_role;
