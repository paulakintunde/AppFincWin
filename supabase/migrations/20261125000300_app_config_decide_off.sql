-- 08.1-05 (APP-21): the "off fast" switch for Decide. One row in app_config, read by the client like min_supported_version.
-- Default 'false' (Decide on). Set to 'true' with one server update to pause Decide for everyone, no app release.
-- Clients can read it and cannot write it (app_config grants, 20260922000200).

insert into public.app_config (key, value) values ('decide_off', 'false') on conflict (key) do nothing;
