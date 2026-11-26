-- Phase 10 (10-12): ACC-06/07 device list and per-session revoke. GoTrue has no per-session admin API (RESEARCH Pattern 4).
-- Assumption A5: a SECURITY DEFINER function owned by postgres may delete from auth.sessions (proven by the pgTAP 123 run).

-- touch_my_device: the app records its model/OS/version for the caller's current session.
create or replace function public.touch_my_device(p_model text, p_os text, p_app_version text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session uuid := (auth.jwt() ->> 'session_id')::uuid;
begin
  if v_session is null then
    raise exception 'no session' using errcode = '28000';
  end if;
  if not exists (select 1 from auth.sessions s where s.id = v_session and s.user_id = auth.uid()) then
    raise exception 'session does not belong to caller' using errcode = '42501';
  end if;
  insert into public.devices (session_id, user_id, model, os, app_version, last_active)
  values (v_session, auth.uid(), left(coalesce(p_model, ''), 80), left(coalesce(p_os, ''), 40), left(coalesce(p_app_version, ''), 40), now())
  on conflict (session_id) do update
    set model = excluded.model, os = excluded.os, app_version = excluded.app_version, last_active = now();
end;
$$;

-- list_my_devices: every session of the caller. Only model, OS, app version and times leave the server (no IP, no user agent).
create or replace function public.list_my_devices()
returns table (
  session_id uuid,
  model text,
  os text,
  app_version text,
  last_active timestamptz,
  signed_in_at timestamptz,
  is_current boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    s.id,
    coalesce(d.model, ''),
    coalesce(d.os, ''),
    coalesce(d.app_version, ''),
    greatest(d.last_active, s.refreshed_at, s.updated_at),
    s.created_at,
    s.id = (auth.jwt() ->> 'session_id')::uuid
  from auth.sessions s
  left join public.devices d on d.session_id = s.id
  where s.user_id = auth.uid()
  order by 5 desc nulls last;
$$;

-- revoke_my_session: signs out one of the caller's own sessions. A session id owned by anyone else deletes nothing.
create or replace function public.revoke_my_session(p_session uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted uuid;
begin
  delete from auth.sessions
  where id = p_session and user_id = auth.uid()
  returning id into v_deleted;
  return v_deleted is not null;
end;
$$;

revoke all on function public.touch_my_device(text, text, text) from public, anon;
revoke all on function public.list_my_devices() from public, anon;
revoke all on function public.revoke_my_session(uuid) from public, anon;
grant execute on function public.touch_my_device(text, text, text) to authenticated;
grant execute on function public.list_my_devices() to authenticated;
grant execute on function public.revoke_my_session(uuid) to authenticated;
