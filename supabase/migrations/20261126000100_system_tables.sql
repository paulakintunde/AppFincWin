-- Phase 10 (10-02): client-visible System tables. D-09, D-11, D-15; ACC-06/07, ALR-01..05, DAT-01.

-- ---------------------------------------------------------------- devices
create table public.devices (
  session_id uuid primary key references auth.sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  model text not null default '' check (char_length(model) <= 80),
  os text not null default '' check (char_length(os) <= 40),
  app_version text not null default '' check (char_length(app_version) <= 40),
  last_active timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index devices_user_idx on public.devices (user_id);

alter table public.devices enable row level security;
create policy devices_own_read on public.devices
  for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.devices from anon, authenticated;
grant select on public.devices to authenticated;

-- ------------------------------------------------------------ push_tokens
create table public.push_tokens (
  token text primary key check (char_length(token) between 10 and 200),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid references auth.sessions(id) on delete cascade,
  platform text not null check (platform in ('ios', 'android')),
  updated_at timestamptz not null default now()
);
create index push_tokens_user_idx on public.push_tokens (user_id);
create index push_tokens_session_idx on public.push_tokens (session_id);

alter table public.push_tokens enable row level security;
revoke all on public.push_tokens from anon, authenticated;

-- --------------------------------------------------------- alert_settings
create table public.alert_settings (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind text not null check (kind in ('bills_due', 'over_cap', 'goal_reached', 'large_txn', 'low_balance')),
  enabled boolean not null,
  threshold_minor bigint check (threshold_minor > 0 and threshold_minor <= 10000000000000),
  threshold_currency text check (char_length(threshold_currency) between 3 and 8),
  lead_days smallint check (lead_days in (0, 1, 3)),
  version integer not null default 1,
  updated_at timestamptz not null default now(),
  primary key (user_id, kind)
);

alter table public.alert_settings enable row level security;
create policy alert_settings_own_select on public.alert_settings
  for select to authenticated using (user_id = (select auth.uid()));
create policy alert_settings_own_insert on public.alert_settings
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy alert_settings_own_update on public.alert_settings
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy alert_settings_own_delete on public.alert_settings
  for delete to authenticated using (user_id = (select auth.uid()));
revoke all on public.alert_settings from anon;
grant select, insert, update, delete on public.alert_settings to authenticated;

-- ------------------------------------------------------------ alert_prefs
create table public.alert_prefs (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  mode text not null default 'instant' check (mode in ('instant', 'digest')),
  quiet_enabled boolean not null default true,
  quiet_start time not null default '22:00',
  quiet_end time not null default '07:00',
  time_zone text not null default 'UTC' check (char_length(time_zone) <= 64),
  partner_alerts boolean not null default true,
  last_digest_date date,
  version integer not null default 1,
  updated_at timestamptz not null default now()
);

alter table public.alert_prefs enable row level security;
create policy alert_prefs_own_select on public.alert_prefs
  for select to authenticated using (user_id = (select auth.uid()));
create policy alert_prefs_own_insert on public.alert_prefs
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy alert_prefs_own_update on public.alert_prefs
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke all on public.alert_prefs from anon, authenticated;
grant select on public.alert_prefs to authenticated;
grant insert (user_id, mode, quiet_enabled, quiet_start, quiet_end, time_zone, partner_alerts, version, updated_at),
      update (mode, quiet_enabled, quiet_start, quiet_end, time_zone, partner_alerts, version, updated_at)
  on public.alert_prefs to authenticated;

-- -------------------------------------------------------------- alert_log
create table public.alert_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('bills_due', 'over_cap', 'goal_reached', 'large_txn', 'low_balance', 'partner_large', 'digest')),
  params jsonb not null default '{}',
  ref_table text,
  ref_id uuid,
  raised_at timestamptz not null default now(),
  delivered_at timestamptz,
  held_for_quiet boolean not null default false,
  delivery text not null default 'pending' check (delivery in ('pending', 'sent', 'digest', 'no_device', 'failed'))
);
create index alert_log_user_raised_idx on public.alert_log (user_id, raised_at desc);

alter table public.alert_log enable row level security;
create policy alert_log_own_select on public.alert_log
  for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.alert_log from anon, authenticated;
grant select on public.alert_log to authenticated;

-- --------------------------------------------------------- archived_months
create table public.archived_months (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  month text not null check (month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  archived_at timestamptz not null default now(),
  primary key (user_id, month)
);

alter table public.archived_months enable row level security;
create policy archived_months_own_select on public.archived_months
  for select to authenticated using (user_id = (select auth.uid()));
create policy archived_months_own_insert on public.archived_months
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy archived_months_own_delete on public.archived_months
  for delete to authenticated using (user_id = (select auth.uid()));
revoke all on public.archived_months from anon, authenticated;
grant select, insert, delete on public.archived_months to authenticated;

-- ------------------------------------------------------------------- RPCs
create function public.register_push_token(p_token text, p_platform text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  insert into public.push_tokens (token, user_id, session_id, platform, updated_at)
  values (p_token, auth.uid(), nullif(auth.jwt() ->> 'session_id', '')::uuid, p_platform, now())
  on conflict (token) do update
    set user_id = excluded.user_id,
        session_id = excluded.session_id,
        platform = excluded.platform,
        updated_at = now();
end;
$$;

create function public.unregister_push_token(p_token text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  delete from public.push_tokens where token = p_token and user_id = auth.uid();
end;
$$;

revoke execute on function public.register_push_token(text, text) from public, anon;
revoke execute on function public.unregister_push_token(text) from public, anon;
grant execute on function public.register_push_token(text, text) to authenticated;
grant execute on function public.unregister_push_token(text) to authenticated;

-- D-09 defaults: a missing row means bills_due on (1 day), goal_reached on, the rest off.
create function public.alert_setting(p_user uuid, p_kind text)
returns table (enabled boolean, threshold_minor bigint, threshold_currency text, lead_days smallint)
language sql
stable
security definer
set search_path = ''
as $$
  select s.enabled, s.threshold_minor, s.threshold_currency, s.lead_days
    from public.alert_settings s
   where s.user_id = p_user and s.kind = p_kind
  union all
  select (p_kind in ('bills_due', 'goal_reached')),
         null::bigint,
         null::text,
         case when p_kind = 'bills_due' then 1::smallint else null::smallint end
   where not exists (
     select 1 from public.alert_settings s where s.user_id = p_user and s.kind = p_kind
   )
$$;

revoke execute on function public.alert_setting(uuid, text) from public, anon, authenticated;
