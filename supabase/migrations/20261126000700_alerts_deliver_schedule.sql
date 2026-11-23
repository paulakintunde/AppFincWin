-- Phase 10 (10-23): ALR-03/04/06 delivery: claim, hold, finish, digest, receipts. Cron calls the alerts-deliver function every minute with its own secret.
-- Evaluation is 10-15 (it writes alert_outbox). Time-zone logic and Expo calls live in the Edge Function; these RPCs only move rows between states
-- and are callable by the service role alone. Every outcome lands in alert_log (sent, digest, no_device, failed), so the log is complete without a device.

-- 1. Outbox bookkeeping ------------------------------------------------------------------------------------------------
-- ticket_tokens runs parallel to ticket_ids so a receipt that says DeviceNotRegistered can name the token to delete.
-- claimed_at lets a row left in 'sending' by a crashed run be picked up again.
alter table public.alert_outbox
  add column ticket_ids text[] not null default '{}',
  add column ticket_tokens text[] not null default '{}',
  add column sent_at timestamptz,
  add column receipts_checked boolean not null default false,
  add column claimed_at timestamptz;
create index alert_outbox_receipts_idx on public.alert_outbox (sent_at) where status = 'sent' and not receipts_checked;

-- 2. Claim: due queued rows, oldest first, never the same row twice --------------------------------------------------------
create function public.alerts_claim(p_limit int)
returns setof jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
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
       set status = 'sending', attempts = o.attempts + 1, claimed_at = now()
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

-- 3. Finish / hold / requeue -----------------------------------------------------------------------------------------------
-- p_delivery null leaves alert_log alone (a row moving to 'digest' is still pending until the summary goes out).
create function public.alerts_finish(p_id uuid, p_status text, p_delivery text, p_ticket_ids text[], p_ticket_tokens text[] default '{}')
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_log uuid;
begin
  if p_status not in ('sent', 'digest', 'dropped') then
    raise exception 'alerts_finish: bad status %', p_status using errcode = '22023';
  end if;
  if p_delivery is not null and p_delivery not in ('sent', 'digest', 'no_device', 'failed') then
    raise exception 'alerts_finish: bad delivery %', p_delivery using errcode = '22023';
  end if;
  update public.alert_outbox
     set status = p_status,
         sent_at = case when p_status = 'sent' then now() else sent_at end,
         ticket_ids = coalesce(p_ticket_ids, '{}'),
         ticket_tokens = coalesce(p_ticket_tokens, '{}')
   where id = p_id
  returning log_id into v_log;
  if v_log is not null and p_delivery is not null then
    update public.alert_log
       set delivery = p_delivery,
           delivered_at = case when p_delivery in ('sent', 'digest') then now() else delivered_at end
     where id = v_log;
  end if;
end;
$$;

create function public.alerts_hold(p_id uuid, p_until timestamptz)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_log uuid;
begin
  update public.alert_outbox set status = 'queued', deliver_after = p_until where id = p_id returning log_id into v_log;
  if v_log is not null then
    update public.alert_log set held_for_quiet = true where id = v_log;
  end if;
end;
$$;

-- A send that failed for a reason that may pass: back to the queue shortly. Not a quiet-hours hold, so the log is untouched.
create function public.alerts_requeue(p_id uuid, p_after timestamptz)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.alert_outbox set status = 'queued', deliver_after = p_after where id = p_id;
$$;

-- 4. Digest ----------------------------------------------------------------------------------------------------------------
create function public.alerts_digest_users()
returns setof jsonb
language sql
security definer
set search_path = ''
as $$
  select jsonb_build_object(
           'user_id', d.user_id,
           'prefs', jsonb_build_object(
             'mode', coalesce(p.mode, 'instant'),
             'time_zone', coalesce(z.name, 'UTC'),
             'last_digest_date', p.last_digest_date),
           'tokens', coalesce((select jsonb_agg(t.token order by t.updated_at desc) from public.push_tokens t where t.user_id = d.user_id), '[]'::jsonb),
           'counts', d.counts)
    from (
      select o.user_id, jsonb_object_agg(o.kind, o.n) as counts
        from (select user_id, kind, count(*)::int as n from public.alert_outbox where status = 'digest' group by user_id, kind) o
       group by o.user_id
    ) d
    left join public.alert_prefs p on p.user_id = d.user_id
    left join pg_catalog.pg_timezone_names z on z.name = p.time_zone
$$;

create function public.alerts_digest_done(p_user uuid, p_local_date date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.alert_log set delivery = 'digest', delivered_at = now()
   where id in (select log_id from public.alert_outbox where user_id = p_user and status = 'digest');
  update public.alert_outbox set status = 'sent', sent_at = now(), receipts_checked = true
   where user_id = p_user and status = 'digest';
  update public.alert_prefs set last_digest_date = p_local_date where user_id = p_user;
end;
$$;

-- 5. Receipts and dead tokens ----------------------------------------------------------------------------------------------
create function public.alerts_receipts_due()
returns setof jsonb
language sql
security definer
set search_path = ''
as $$
  select jsonb_build_object('id', o.id, 'ticket_ids', to_jsonb(o.ticket_ids), 'ticket_tokens', to_jsonb(o.ticket_tokens))
    from public.alert_outbox o
   where o.status = 'sent'
     and cardinality(o.ticket_ids) > 0
     and not o.receipts_checked
     and o.sent_at between now() - interval '24 hours' and now() - interval '15 minutes'
   order by o.sent_at
   limit 500
$$;

create function public.alerts_receipts_done(p_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.alert_outbox set receipts_checked = true where id = p_id;
$$;

create function public.alerts_drop_token(p_token text)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.push_tokens where token = p_token;
$$;

-- 6. Access: the service role only ---------------------------------------------------------------------------------------------
revoke execute on function public.alerts_claim(int) from public, anon, authenticated;
revoke execute on function public.alerts_finish(uuid, text, text, text[], text[]) from public, anon, authenticated;
revoke execute on function public.alerts_hold(uuid, timestamptz) from public, anon, authenticated;
revoke execute on function public.alerts_requeue(uuid, timestamptz) from public, anon, authenticated;
revoke execute on function public.alerts_digest_users() from public, anon, authenticated;
revoke execute on function public.alerts_digest_done(uuid, date) from public, anon, authenticated;
revoke execute on function public.alerts_receipts_due() from public, anon, authenticated;
revoke execute on function public.alerts_receipts_done(uuid) from public, anon, authenticated;
revoke execute on function public.alerts_drop_token(text) from public, anon, authenticated;
grant execute on function public.alerts_claim(int) to service_role;
grant execute on function public.alerts_finish(uuid, text, text, text[], text[]) to service_role;
grant execute on function public.alerts_hold(uuid, timestamptz) to service_role;
grant execute on function public.alerts_requeue(uuid, timestamptz) to service_role;
grant execute on function public.alerts_digest_users() to service_role;
grant execute on function public.alerts_digest_done(uuid, date) to service_role;
grant execute on function public.alerts_receipts_due() to service_role;
grant execute on function public.alerts_receipts_done(uuid) to service_role;
grant execute on function public.alerts_drop_token(text) to service_role;

-- 7. Cron: every minute. The Vault secrets alerts_deliver_url and alerts_deliver_secret are created per environment at deploy time (never in git);
-- locally the call finds null secrets and fails harmlessly.
select cron.schedule(
  'alerts-deliver-minute',
  '* * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'alerts_deliver_url'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-alerts-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'alerts_deliver_secret')),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);
