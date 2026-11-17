-- 05.5 D-21 (Band B): raise the minimum supported app version to 0.2.0. Testers' phones run 0.2.0 (owner-confirmed,
-- 05.5-PRECONDITIONS.md TESTERS_ON_0.2.0, 2026-11-16). The column drops in 20261121000300 cite this floor.
update public.app_config set value = '0.2.0' where key = 'min_supported_version';
