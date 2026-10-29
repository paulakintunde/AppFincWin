-- 05.2 D-02: per-account Decide v3 switch. Server-only write: no grant to authenticated. Read via the existing own-profile select policy.
-- Set for named test accounts only by a data statement with the FincWin Management API token after the push (05.2-36).
alter table public.profiles add column if not exists decide_v3 boolean not null default false;
