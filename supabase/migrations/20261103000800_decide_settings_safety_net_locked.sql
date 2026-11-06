-- 05.4 D-61: the safety net up to its set size is locked by default and left out of Decide's answers; unlocked only in Decide settings with a confirm step (08.1). Interim with D-33's columns, removed in 05.5 (BO-07 item 3).
-- Existing rows take the default, so existing users with a net are locked by default.

alter table public.decide_settings
  add column if not exists safety_net_locked boolean not null default true;

comment on column public.decide_settings.safety_net_locked is 'interim, removed in 05.5 (BO-07 item 3); D-61 locked by default';

grant insert (safety_net_locked) on public.decide_settings to authenticated;
grant update (safety_net_locked) on public.decide_settings to authenticated;
