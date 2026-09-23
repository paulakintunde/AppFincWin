-- Server-authoritative client config (D-25, FND-09).
--
-- Readable by anon (pre-sign-in) so the client can gate on
-- min_supported_version before a user has authenticated. Writable by no
-- client role -- values change only through migrations, never through the
-- dashboard.

create table public.app_config (
  key text primary key check (key ~ '^[a-z_]+$'),
  value text not null,
  updated_at timestamptz not null default now()
);

alter table public.app_config enable row level security;

create policy "app_config readable before and after sign-in" on public.app_config for select to anon, authenticated using (true);

revoke insert, update, delete, truncate on public.app_config from anon, authenticated;

insert into public.app_config (key, value) values ('min_supported_version', '0.1.0');

comment on table public.app_config is 'Server-authoritative client config (D-25). Change values only through migrations; never through the dashboard.';
