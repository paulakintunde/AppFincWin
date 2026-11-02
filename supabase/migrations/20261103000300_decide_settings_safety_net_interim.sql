-- 05.4 D-33: interim safety-net switch and size. Interim, removed in 05.5 (BO-07 item 3). Do not build on these columns.
-- safety_net_protect: the safety net is held back by default. safety_net_size: null means the starter size.

alter table public.decide_settings
  add column if not exists safety_net_protect boolean not null default true,
  add column if not exists safety_net_size bigint check (safety_net_size is null or safety_net_size >= 0);

comment on column public.decide_settings.safety_net_protect is 'interim, removed in 05.5 (BO-07 item 3)';
comment on column public.decide_settings.safety_net_size is 'interim, removed in 05.5 (BO-07 item 3); null = starter size';

grant insert (safety_net_protect, safety_net_size) on public.decide_settings to authenticated;
grant update (safety_net_protect, safety_net_size) on public.decide_settings to authenticated;
