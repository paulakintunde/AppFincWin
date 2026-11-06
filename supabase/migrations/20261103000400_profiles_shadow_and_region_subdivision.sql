-- 05.4 M5: shadow-run consent flag and region subdivision on profiles. Additive.
-- decide_shadow (D-09): tester consent to quiet shadow runs. Server-only write, exactly like decide_v3: no grant to authenticated,
--   so the app can never record consent. Read through the existing own-profile select policy. Set for named testers by a data
--   statement with the FincWin Management API token after the push (05.4-31). Not the same flag as decide_v3 ("show Decide").
-- region_subdivision (D-19): state or province code (for example CA, ON, NSW) used for the tax lookup. User-writable like region.
alter table public.profiles add column if not exists decide_shadow boolean not null default false;
comment on column public.profiles.decide_shadow is '05.4 D-09: tester consent to shadow runs. Server-only write: no grant to authenticated.';

alter table public.profiles add column if not exists region_subdivision text
  check (region_subdivision is null or region_subdivision ~ '^[A-Z0-9]{1,3}$');
comment on column public.profiles.region_subdivision is '05.4 D-19: state or province code, 1-3 upper-case letters or digits. Null = not set.';

grant update (region_subdivision) on public.profiles to authenticated;
