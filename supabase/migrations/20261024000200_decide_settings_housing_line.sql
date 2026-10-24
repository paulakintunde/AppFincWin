-- Phase 5 (05-119, R18.4; D-103): the housing line, a per-user limit beside dsr_line. Up to 3 digits and 4
-- decimals, at most 100. Null means "use the default" (28, held in the engine). Additive; no server logic reads it,
-- fill_decide_settings and the guards name no columns.
alter table public.decide_settings add column if not exists housing_line text
  check (housing_line is null or (housing_line ~ '^\d{1,3}(\.\d{1,4})?$' and housing_line::numeric <= 100));

-- Column grants are additive; every existing column keeps its grant.
grant insert (housing_line) on public.decide_settings to authenticated;
grant update (housing_line) on public.decide_settings to authenticated;
