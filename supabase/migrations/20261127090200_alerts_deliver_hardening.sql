-- 10-review S-1 / S-6 (owner-approved 2026-11-27): alerts must not double-send.
--
-- S-1a. A row left in 'sending' by a run that died after the Expo send (or whose finish call failed) was reclaimed after
--       5 minutes and sent again, with no cap. Now a stale 'sending' row that already carries ticket ids is recorded as
--       sent and never resent, and a stale row is reclaimed at most once: the second time it is dropped and logged failed.
-- S-1b. Two overlapping minute runs could both send the 08:00 digest, because last_digest_date was written after
--       sending. alerts_digest_claim takes the day atomically before anything is sent; alerts_digest_release gives it
--       back after a failure that may pass, so the next minute inside the window can retry.
-- S-6.  alerts_claim counts an attempt on every claim, including one that only finds the person in quiet hours.
--       alerts_hold now gives that attempt back, so a quiet-hours hold never uses up a retry.

-- 1. Reclaim counter -------------------------------------------------------------------------------------------------------
alter table public.alert_outbox add column reclaims smallint not null default 0;

-- 2. Claim -----------------------------------------------------------------------------------------------------------------
create or replace function public.alerts_claim(p_limit int)
returns setof jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- A stale 'sending' row with tickets went out: record it as sent (receipts still get checked), never send it again.
  with gone as (
    update public.alert_outbox o
       set status = 'sent', sent_at = coalesce(o.sent_at, now())
     where o.status = 'sending' and o.claimed_at < now() - interval '5 minutes' and cardinality(o.ticket_ids) > 0
    returning o.log_id
  )
  update public.alert_log l
     set delivery = 'sent', delivered_at = coalesce(l.delivered_at, now())
    from gone
   where l.id = gone.log_id;

  -- A stale row already reclaimed once is not tried a third time: it may have gone out, so a resend risks a duplicate.
  with gone as (
    update public.alert_outbox o
       set status = 'dropped'
     where o.status = 'sending' and o.claimed_at < now() - interval '5 minutes' and o.reclaims >= 1
    returning o.log_id
  )
  update public.alert_log l
     set delivery = 'failed'
    from gone
   where l.id = gone.log_id;

  return query
  with picked as (
    select o.id
      from public.alert_outbox o
     where (o.status = 'queued' and o.deliver_after <= now())
        or (o.status = 'sending' and o.claimed_at < now() - interval '5 minutes')
     order by o.deliver_after, o.created_at
     limit greatest(coalesce(p_limit, 0), 0)
       for update skip locked
  ), upd as (
    update public.alert_outbox o
       set status = 'sending',
           attempts = o.attempts + 1,
           reclaims = o.reclaims + case when o.status = 'sending' then 1 else 0 end,
           claimed_at = now()
      from picked
     where o.id = picked.id
    returning o.id, o.user_id, o.log_id, o.kind, o.params, o.attempts, o.deliver_after
  )
  select jsonb_build_object(
           'id', u.id,
           'user_id', u.user_id,
           'log_id', u.log_id,
           'kind', u.kind,
           'params', u.params,
           'attempts', u.attempts,
           'prefs', jsonb_build_object(
             'mode', coalesce(p.mode, 'instant'),
             'quiet_enabled', coalesce(p.quiet_enabled, true),
             'quiet_start', coalesce(p.quiet_start, '22:00'::time),
             'quiet_end', coalesce(p.quiet_end, '07:00'::time),
             'time_zone', coalesce(z.name, 'UTC'),
             'last_digest_date', p.last_digest_date),
           'tokens', coalesce((select jsonb_agg(t.token order by t.updated_at desc) from public.push_tokens t where t.user_id = u.user_id), '[]'::jsonb))
    from upd u
    left join public.alert_prefs p on p.user_id = u.user_id
    left join pg_catalog.pg_timezone_names z on z.name = p.time_zone
   order by u.deliver_after, u.id;
end;
$$;

-- 3. Hold gives the attempt back (S-6) -------------------------------------------------------------------------------------
create or replace function public.alerts_hold(p_id uuid, p_until timestamptz)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_log uuid;
begin
  update public.alert_outbox
     set status = 'queued', deliver_after = p_until, attempts = greatest(attempts - 1, 0)
   where id = p_id
  returning log_id into v_log;
  if v_log is not null then
    update public.alert_log set held_for_quiet = true where id = v_log;
  end if;
end;
$$;

-- 4. Digest claim / release (S-1b) -----------------------------------------------------------------------------------------
-- True only for the one run that moves last_digest_date to this local date. A person with no prefs row gets one with the
-- defaults (the same values alerts_claim already assumes), so the claim still has a row to lock.
create function public.alerts_digest_claim(p_user uuid, p_local_date date)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ok boolean;
begin
  insert into public.alert_prefs as p (user_id, last_digest_date)
  values (p_user, p_local_date)
  on conflict (user_id) do update
    set last_digest_date = excluded.last_digest_date
    where p.last_digest_date is null or p.last_digest_date < excluded.last_digest_date
  returning true into v_ok;
  return coalesce(v_ok, false);
end;
$$;

-- Puts the previous date back, only while the claimed date is still there (a later successful run is never undone).
create function public.alerts_digest_release(p_user uuid, p_local_date date, p_previous date)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.alert_prefs set last_digest_date = p_previous
   where user_id = p_user and last_digest_date = p_local_date;
$$;

-- 5. Access: the service role only -------------------------------------------------------------------------------------------
revoke execute on function public.alerts_digest_claim(uuid, date) from public, anon, authenticated;
revoke execute on function public.alerts_digest_release(uuid, date, date) from public, anon, authenticated;
grant execute on function public.alerts_digest_claim(uuid, date) to service_role;
grant execute on function public.alerts_digest_release(uuid, date, date) to service_role;
revoke execute on function public.alerts_claim(int) from public, anon, authenticated;
revoke execute on function public.alerts_hold(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.alerts_claim(int) to service_role;
grant execute on function public.alerts_hold(uuid, timestamptz) to service_role;
