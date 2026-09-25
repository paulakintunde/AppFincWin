-- pgTAP: MON-04/MON-13/D-06/D-07/D-25 proof for custom currencies and money
-- preferences.
--
-- Proves custom currencies are owner-isolated, cannot shadow an ISO code,
-- must reference a known ISO currency, and have immutable code/decimals
-- (both by grant and, defensively, by the guard trigger even for a
-- privileged writer). Proves profiles.home_currency only accepts a known
-- currency (ISO or the user's own custom one), a household-of-one's
-- reporting_currency tracks its owner's home_currency, and show_cents/
-- lead_figure/region default and validate correctly (RD-02: region is the
-- explicit in-app override, nullable ISO 3166-1 alpha-2, client-writable).

begin;
create extension if not exists pgtap with schema extensions;

select extensions.plan(25);

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@test.local', '{"full_name":"Alice Test"}', now(), now()),
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b@test.local', '{}', now(), now());

insert into public.fx_rates (base, quote, rate, rate_date, source) values
  ('EUR', 'USD', 1.1483, '2026-09-21', 'frankfurter-v2'),
  ('EUR', 'JPY', 180.7, '2026-09-21', 'frankfurter-v2');

-- 1. A can insert a custom currency; B cannot see it (owner-only RLS, D-07).
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

select extensions.lives_ok(
  $$insert into public.custom_currencies (id, code, symbol, decimals, reference_currency, unit_value, as_of)
    values ('aaaaaaa1-1111-1111-1111-111111111111', 'GLD', 'G', 0, 'USD', 2.5, '2026-09-20')$$,
  'A can insert a custom currency'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
select extensions.is(
  (select count(*) from public.custom_currencies)::int, 0, 'B cannot see A''s custom currency'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

-- 2. A custom code cannot shadow an ISO code (an fx_rates quote or EUR).
select extensions.throws_ok(
  $$insert into public.custom_currencies (id, code, symbol, decimals, reference_currency, unit_value, as_of)
    values ('aaaaaaa2-1111-1111-1111-111111111111', 'USD', '$', 2, 'EUR', 1, '2026-09-20')$$,
  '23514', null,
  'custom code USD shadows an ISO currency carried by fx_rates'
);
select extensions.throws_ok(
  $$insert into public.custom_currencies (id, code, symbol, decimals, reference_currency, unit_value, as_of)
    values ('aaaaaaa3-1111-1111-1111-111111111111', 'EUR', 'E', 2, 'USD', 1, '2026-09-20')$$,
  '23514', null,
  'custom code EUR shadows the hardcoded ISO base currency'
);

-- 3. reference_currency must itself be a known ISO currency.
select extensions.throws_ok(
  $$insert into public.custom_currencies (id, code, symbol, decimals, reference_currency, unit_value, as_of)
    values ('aaaaaaa4-1111-1111-1111-111111111111', 'PTS', 'P', 0, 'ABC', 1, '2026-09-20')$$,
  '23514', null,
  'reference currency ABC is not a known ISO currency'
);

-- 4. code and decimals are immutable: neither is in the update grant (42501)
-- and, defensively, the trigger rejects a decimals change even for a
-- writer that bypasses grants entirely (postgres).
select extensions.throws_ok(
  $$update public.custom_currencies set decimals = 2 where id = 'aaaaaaa1-1111-1111-1111-111111111111'$$,
  '42501', null,
  'A cannot update decimals (not in the update grant)'
);
select extensions.throws_ok(
  $$update public.custom_currencies set code = 'GLX' where id = 'aaaaaaa1-1111-1111-1111-111111111111'$$,
  '42501', null,
  'A cannot update code (not in the update grant)'
);
reset role;
select extensions.throws_ok(
  $$update public.custom_currencies set decimals = 2 where id = 'aaaaaaa1-1111-1111-1111-111111111111'$$,
  '23514', null,
  'even a privileged writer cannot change decimals -- guard_custom_currency defends it'
);

-- 5. decimals is bounded 0-4 (MON-13).
select extensions.throws_ok(
  $$insert into public.custom_currencies (id, owner_id, code, symbol, decimals, reference_currency, unit_value, as_of)
    values ('aaaaaaa5-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 'FIV', 'F', 5, 'USD', 1, '2026-09-20')$$,
  '23514', null,
  'decimals 5 violates the 0-4 check'
);

-- 6. version bumps on update (MON-09).
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
update public.custom_currencies set unit_value = 3 where id = 'aaaaaaa1-1111-1111-1111-111111111111';
select extensions.is(
  (select version from public.custom_currencies where id = 'aaaaaaa1-1111-1111-1111-111111111111')::int,
  2,
  'updating unit_value bumps version to 2'
);

-- 7. profiles.home_currency validation, and the household-of-one sync (D-06).
select extensions.lives_ok(
  $$update public.profiles set home_currency = 'JPY' where id = '11111111-1111-1111-1111-111111111111'$$,
  'A can set home_currency to a known ISO currency'
);
select extensions.is(
  (select reporting_currency from public.households where owner_id = '11111111-1111-1111-1111-111111111111'),
  'JPY',
  'A''s household-of-one reporting_currency syncs to the new home_currency'
);
select extensions.throws_ok(
  $$update public.profiles set home_currency = 'ZZZ' where id = '11111111-1111-1111-1111-111111111111'$$,
  '23514', null,
  'A cannot set home_currency to an unknown code'
);
select extensions.lives_ok(
  $$update public.profiles set home_currency = 'GLD' where id = '11111111-1111-1111-1111-111111111111'$$,
  'A can set home_currency to A''s own custom currency'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
select extensions.throws_ok(
  $$update public.profiles set home_currency = 'GLD' where id = '22222222-2222-2222-2222-222222222222'$$,
  '23514', null,
  'B cannot set home_currency to A''s custom currency -- it is not B''s own'
);
reset role;

-- 9. show_cents / lead_figure defaults and validation.
select extensions.is(
  (select show_cents from public.profiles where id = '22222222-2222-2222-2222-222222222222'),
  false,
  'show_cents defaults false'
);
select extensions.is(
  (select lead_figure from public.profiles where id = '22222222-2222-2222-2222-222222222222'),
  'home',
  'lead_figure defaults home'
);
select extensions.throws_ok(
  $$update public.profiles set lead_figure = 'foo' where id = '22222222-2222-2222-2222-222222222222'$$,
  '23514', null,
  'lead_figure foo violates the check constraint'
);

-- 9b. RD-02: profiles.region -- nullable ISO 3166-1 alpha-2 override,
-- client-writable, defaults unset.
select extensions.is(
  (select region from public.profiles where id = '22222222-2222-2222-2222-222222222222'),
  null,
  'region defaults null (unset -- defers to device region / time zone tiebreak)'
);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
select extensions.lives_ok(
  $$update public.profiles set region = 'DE' where id = '22222222-2222-2222-2222-222222222222'$$,
  'a user can set their own explicit region override'
);
select extensions.throws_ok(
  $$update public.profiles set region = 'DEU' where id = '22222222-2222-2222-2222-222222222222'$$,
  '23514', null,
  'a 3-letter region code violates the ISO 3166-1 alpha-2 check constraint'
);
select extensions.throws_ok(
  $$update public.profiles set region = 'de' where id = '22222222-2222-2222-2222-222222222222'$$,
  '23514', null,
  'a lower-case region code violates the check constraint (upper-case only)'
);
select extensions.lives_ok(
  $$update public.profiles set region = null where id = '22222222-2222-2222-2222-222222222222'$$,
  'region can be cleared back to null (unset)'
);
reset role;

-- 10. is_known_currency is hardened the same way every other security
-- definer helper in this codebase is (pinned search_path).
select extensions.ok(
  (select prosecdef from pg_proc where proname = 'is_known_currency'),
  'is_known_currency is security definer'
);
select extensions.ok(
  (select proconfig[1] from pg_proc where proname = 'is_known_currency') = 'search_path=""',
  'is_known_currency pins search_path to an empty string'
);

select * from extensions.finish();
rollback;
