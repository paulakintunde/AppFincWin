-- pgTAP: Phase 9 plan 09-05 (D-13, D-16, D-18, D-19, D-39; Owner P4 2026-11-19). Needs 20261124000100..000400.
-- plan_apply turns a subscriber snapshot into one covering row; a takeover opens a double cover when the old payer recovers;
-- either payer (and only they) picks, the 7-day default keeps the takeover plan, and the home stays covered throughout.
-- The RPCs are security definer and read the caller from request.jwt.claims, so the test calls them as the table owner.
--
-- Users (n -> role): 1 A, 2 B, 3 C = household 1 (B picks) | 4 A, 5 B = household 4 (A picks) | 6 A, 7 B, 8 C = household 6 (too small)
-- 9 A, 10 B = household 9 (fallback) | 11 A, 12 B = household 11 (7-day default) | 13 A, 14 B = household 13 (6 days)
-- 15 B, 16 C = household 15 (extra buyer) | 17 trial payer, 18 member | 19 normal payer | 20 grace | 21 store grace
-- 22 not entitled with billing issue | 23 lapsed | 24 payer, 25 member, 26 joiner = household 24 | 27 unknown product
-- 28 no household | 29 not entitled, no row | 30 sweep target | 31 stranger | 32 lapsed by date | 33 leave log

begin;
create extension if not exists pgtap with schema extensions;

select extensions.plan(117);

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
select ('a1150000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid,
       '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'u' || n || '@test.local',
       json_build_object('full_name', 'User ' || n)::jsonb, now(), now()
  from generate_series(1, 33) n;

create temp table hh as select owner_id, id from public.households;
create temp table codes (label text primary key, code text);
create temp table vers (label text primary key, v int);

create function public.t115_u(n int) returns uuid language sql immutable as $$
  select ('a1150000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid
$$;
create function public.t115_h(n int) returns uuid language sql stable as $$
  select id from hh where owner_id = public.t115_u(n)
$$;
create function public.t115_as(n int) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', public.t115_u(n)::text, 'role', 'authenticated')::text, true)
$$;
create function public.t115_none() returns void language sql as $$
  select set_config('request.jwt.claims', '{}', true)
$$;
-- Moves user n into the household owned by user h.
create function public.t115_member(p_n int, p_h int) returns void language plpgsql as $$
begin
  delete from public.household_members where user_id = public.t115_u(p_n);
  insert into public.household_members (household_id, user_id, is_owner, weight, created_at)
  values (public.t115_h(p_h), public.t115_u(p_n), false, 0, now() - interval '1 day');
end;
$$;
create function public.t115_snap(p_ent boolean, p_prod text, p_store text, p_period text, p_exp timestamptz,
                                 p_bi timestamptz default null, p_sg timestamptz default null, p_otid text default null)
returns jsonb language sql as $$
  select jsonb_build_object('entitled', p_ent, 'product_id', p_prod, 'store', p_store, 'environment', 'PRODUCTION',
    'period_type', p_period, 'expires_at', p_exp, 'billing_issue_detected_at', p_bi, 'grace_period_expires_at', p_sg,
    'unsubscribe_detected_at', null, 'original_transaction_id', p_otid, 'purchased_at', now())
$$;
-- Records a webhook row, then applies the snapshot for it (so every apply has an event to mark).
create function public.t115_apply(p_n int, p_snap jsonb, p_ev text default null) returns jsonb language plpgsql as $$
declare ev text := coalesce(p_ev, 'ev-' || gen_random_uuid()::text);
begin
  insert into public.plan_events (rc_event_id, type, app_user_id) values (ev, 'INITIAL_PURCHASE', public.t115_u(p_n)::text)
  on conflict do nothing;
  return public.plan_apply(public.t115_u(p_n), p_snap, ev);
end;
$$;
create function public.t115_events(p_h int, p_kind text) returns int language sql stable as $$
  select count(*)::int from public.household_events where household_id = public.t115_h(p_h) and kind = p_kind
$$;
-- A in grace on an Apple plan, then B takes over on Google, then A recovers: the double cover is open. Returns A's note.
create function public.t115_open(p_a int, p_b int, p_recovered text default 'fincwin.household.month') returns text language plpgsql as $$
begin
  perform public.t115_apply(p_a, public.t115_snap(true, 'fincwin.household.month', 'APP_STORE', 'NORMAL',
    now() + interval '2 days', now() - interval '1 day', null, 'apple-1'));
  perform public.t115_apply(p_b, public.t115_snap(true, 'fincwin_household:monthly', 'PLAY_STORE', 'NORMAL',
    now() + interval '30 days', null, null, 'play-B'));
  return public.t115_apply(p_a, public.t115_snap(true, p_recovered, 'APP_STORE', 'NORMAL',
    now() + interval '30 days', null, null, 'apple-2')) ->> 'note';
end;
$$;

update public.plan_settings set paid_from = now() - interval '1 day', enforce_for = '{}';

-- Household moves
select public.t115_member(2, 1);
select public.t115_member(3, 1);
select public.t115_member(5, 4);
select public.t115_member(7, 6);
select public.t115_member(8, 6);
select public.t115_member(10, 9);
select public.t115_member(12, 11);
select public.t115_member(14, 13);
select public.t115_member(16, 15);
select public.t115_member(18, 17);
select public.t115_member(25, 24);
delete from public.household_members where user_id = public.t115_u(28);

-- 1-6. A trial is recorded once per person and per household (D-16).
select extensions.is(public.t115_apply(17, public.t115_snap(true, 'fincwin_duo:yearly', 'PLAY_STORE', 'TRIAL', now() + interval '14 days'))
  ->> 'note', 'applied', 'a trial snapshot is applied');
select extensions.is((select status from public.household_plans where household_id = public.t115_h(17)), 'trial', 'the row is a trial');
select extensions.is((select plan_size::int from public.household_plans where household_id = public.t115_h(17)), 2,
  'a duo trial is size 2, from plan_products');
select extensions.is((select trial_ends_at from public.household_plans where household_id = public.t115_h(17)), now() + interval '14 days',
  'trial_ends_at is the store expiry');
select extensions.is(public.t115_apply(18, public.t115_snap(true, 'fincwin_duo:yearly', 'PLAY_STORE', 'TRIAL', now() + interval '14 days')) ->> 'note',
  'double_cover', 'another member buying while the first trial covers is the extra-buyer case (first purchase wins)');
select extensions.is((select count(*)::int from public.trial_ledger where household_id = public.t115_h(17)), 1,
  'one trial_ledger row per household');
select extensions.is((select count(*)::int from public.trial_ledger where user_id = public.t115_u(18)), 0,
  'the second member has no trial_ledger row');

-- 7-13. A normal snapshot, applied twice.
select extensions.is(public.t115_apply(19, public.t115_snap(true, 'fincwin.household.month', 'APP_STORE', 'NORMAL', now() + interval '30 days'))
  ->> 'note', 'applied', 'a normal snapshot is applied');
select extensions.is((select status || plan_size::text from public.household_plans where household_id = public.t115_h(19)), 'active6',
  'the row is active with the household size');
select extensions.is((select covered_until from public.household_plans where household_id = public.t115_h(19)), now() + interval '30 days',
  'covered_until is the store expiry');
insert into public.plan_events (rc_event_id, type, app_user_id) values ('old-1', 'RENEWAL', public.t115_u(19)::text);
select public.t115_apply(19, public.t115_snap(true, 'fincwin.household.month', 'APP_STORE', 'NORMAL', now() + interval '30 days'));
select extensions.is((select version from public.household_plans where household_id = public.t115_h(19)), 2, 'applying again bumps the version once');
select extensions.is((select count(*)::int from public.household_plans where household_id = public.t115_h(19)), 1, 'there is still one row');
select extensions.is((select count(*)::int from public.household_events where household_id = public.t115_h(19)), 0, 'a repeat applies no notice');
select extensions.is((select note from public.plan_events where rc_event_id = 'old-1'), 'superseded',
  'an earlier unapplied event for the same person is marked superseded');

-- 14-24. Grace (D-19).
select public.t115_apply(20, public.t115_snap(true, 'fincwin.duo.month', 'APP_STORE', 'NORMAL', now() + interval '3 days', now() - interval '1 day'));
select extensions.is((select status from public.household_plans where household_id = public.t115_h(20)), 'grace', 'a billing issue puts the plan in grace');
select extensions.is((select grace_until from public.household_plans where household_id = public.t115_h(20)), now() - interval '1 day' + interval '7 days',
  'grace lasts 7 days from the first billing failure');
select extensions.is((select covered_until from public.household_plans where household_id = public.t115_h(20)), now() - interval '1 day' + interval '7 days',
  'covered_until is the later of the expiry and the grace end');
select extensions.is(public.t115_events(20, 'plan_grace'), 1, 'one plan_grace notice');
select public.t115_apply(20, public.t115_snap(true, 'fincwin.duo.month', 'APP_STORE', 'NORMAL', now() + interval '3 days', now() - interval '1 day'));
select extensions.is(public.t115_events(20, 'plan_grace'), 1, 'a repeat does not add a second plan_grace notice');
select public.t115_apply(21, public.t115_snap(true, 'fincwin.duo.month', 'APP_STORE', 'NORMAL', now() + interval '3 days',
  now() - interval '1 day', now() + interval '10 days'));
select extensions.is((select grace_until from public.household_plans where household_id = public.t115_h(21)), now() + interval '10 days',
  'the store grace wins when it is longer');
select public.t115_apply(22, public.t115_snap(true, 'fincwin.duo.month', 'APP_STORE', 'NORMAL', now() + interval '3 days'));
select public.t115_apply(22, public.t115_snap(false, 'fincwin.duo.month', 'APP_STORE', 'NORMAL', now() - interval '1 day', now() - interval '2 days'));
select extensions.is((select status from public.household_plans where household_id = public.t115_h(22)), 'grace',
  'not entitled with a billing issue 2 days ago is still grace (account hold)');
select extensions.is((select grace_until from public.household_plans where household_id = public.t115_h(22)), now() - interval '2 days' + interval '7 days',
  'the hold lasts until the billing failure plus 7 days');
select public.t115_apply(23, public.t115_snap(true, 'fincwin.duo.month', 'APP_STORE', 'NORMAL', now() + interval '3 days'));
select public.t115_apply(23, public.t115_snap(false, 'fincwin.duo.month', 'APP_STORE', 'NORMAL', now() - interval '1 day'));
select extensions.is(public.household_plan_state(public.t115_h(23)), 'lapsed', 'not entitled, no billing issue and expired is lapsed');
select extensions.is(public.t115_events(23, 'plan_locked'), 1, 'one plan_locked notice');
select public.t115_apply(23, public.t115_snap(false, 'fincwin.duo.month', 'APP_STORE', 'NORMAL', now() - interval '1 day'));
select extensions.is(public.t115_events(23, 'plan_locked'), 1, 'a repeat does not add a second plan_locked notice');

-- 25-66. Takeover, double cover, and B (the takeover payer) picks (D-19, Owner P4).
insert into public.accounts (id, household_id, created_by, name, kind, currency, opening_balance, is_shared) values
  ('a1150000-0000-0000-0000-0000000a0001', public.t115_h(1), public.t115_u(3), 'C account', 'checking', 'USD', 0, false);
select public.t115_apply(1, public.t115_snap(true, 'fincwin.household.month', 'APP_STORE', 'NORMAL', now() + interval '2 days',
  now() - interval '1 day', null, 'apple-1'));
select extensions.is(public.t115_apply(2, public.t115_snap(true, 'fincwin_household:monthly', 'PLAY_STORE', 'NORMAL',
  now() + interval '30 days', null, null, 'play-B')) ->> 'note', 'takeover', 'a member buying while the home is in grace is a takeover');
select extensions.is((select payer_id from public.household_plans where household_id = public.t115_h(1)), public.t115_u(2), 'the payer is now B');
select extensions.is((select store from public.household_plans where household_id = public.t115_h(1)), 'PLAY_STORE', 'the store is Google Play');
select extensions.is((select original_transaction_id from public.household_plans where household_id = public.t115_h(1)), 'play-B',
  'the Play purchase token is linked');
select extensions.is((select count(*)::int from public.household_events where household_id = public.t115_h(1) and kind = 'plan_takeover'
  and params ->> 'previous_payer' = public.t115_u(1)::text), 1, 'one plan_takeover notice names the previous payer');
select extensions.is((select audience from public.household_events where household_id = public.t115_h(1) and kind = 'plan_takeover'), null,
  'the takeover notice goes to every member');
select extensions.is((select count(*)::int from public.household_plans where household_id = public.t115_h(1)
  and 'apple-1' in (coalesce(original_transaction_id, ''), coalesce(dc_original_transaction_id, ''))), 0,
  'the Apple transaction is unlinked by the Play takeover');

select extensions.is(public.t115_apply(1, public.t115_snap(true, 'fincwin.household.month', 'APP_STORE', 'NORMAL',
  now() + interval '30 days', null, null, 'apple-2')) ->> 'note', 'double_cover_opened', 'the old payer recovering opens a double cover');
select extensions.is((select payer_id::text || original_transaction_id from public.household_plans where household_id = public.t115_h(1)),
  public.t115_u(2)::text || 'play-B', 'the covering columns are unchanged');
select extensions.is((select dc_payer_id::text || dc_original_transaction_id from public.household_plans where household_id = public.t115_h(1)),
  public.t115_u(1)::text || 'apple-2', 'the recovered subscription is held in the dc columns');
select extensions.ok((select double_cover_since is not null and chosen_payer is null from public.household_plans where household_id = public.t115_h(1)),
  'double_cover_since is set and nobody has chosen yet');
select extensions.is((select count(*)::int from public.household_events where household_id = public.t115_h(1) and kind = 'plan_double_cover'
  and params ->> 'mode' = 'choose'), 1, 'one choose notice');
select extensions.ok((select audience @> array[public.t115_u(1), public.t115_u(2)] and cardinality(audience) = 2
  from public.household_events where household_id = public.t115_h(1) and kind = 'plan_double_cover'), 'both payers get the choose notice');

select extensions.is(public.t115_apply(1, public.t115_snap(true, 'fincwin.household.month', 'APP_STORE', 'NORMAL',
  now() + interval '40 days', null, null, 'apple-2')) ->> 'note', 'double_cover_updated', 'another snapshot from the old payer only updates it');
select extensions.is(public.t115_events(1, 'plan_double_cover'), 1, 'no second choose notice');
select extensions.is((select dc_expires_at from public.household_plans where household_id = public.t115_h(1)), now() + interval '40 days',
  'dc_expires_at follows the snapshot');

select extensions.is(public.household_plan_state(public.t115_h(1)), 'active', 'the home is active during the double cover');
select extensions.ok(public.household_writable(public.t115_h(1)), 'the home is writable during the double cover');
select public.t115_as(3);
select extensions.lives_ok($$ insert into public.transactions (id, household_id, created_by, account_id, original_amount, original_currency, local_date, time_zone, name, status, is_shared)
  values ('a1150000-0000-0000-0000-0000000a0002', public.t115_h(1), public.t115_u(3), 'a1150000-0000-0000-0000-0000000a0001', -500, 'USD', current_date, 'UTC', 'Open', 'paid', false) $$,
  'member C can write during the double cover (no PT402)');
select public.t115_none();

select public.t115_as(1);
select extensions.ok(public.plan_double_cover_state() is not null, 'the state is visible to payer A');
select public.t115_as(2);
select extensions.ok(public.plan_double_cover_state() is not null, 'the state is visible to payer B');
select extensions.is(public.plan_double_cover_state() ->> 'chosen_payer', null, 'nobody has chosen in the state');
select extensions.is((public.plan_double_cover_state() ->> 'choose_by')::timestamptz,
  (select double_cover_since + interval '7 days' from public.household_plans where household_id = public.t115_h(1)),
  'choose_by is 7 days after the double cover began');
select public.t115_as(3);
select extensions.ok(public.plan_double_cover_state() is null, 'a member who is not a payer sees nothing');

select extensions.throws_ok($$ select public.plan_double_cover_choose(public.t115_h(1), public.t115_u(2)) $$, '42501', null,
  'a member who is not a payer cannot choose');
select public.t115_as(31);
select extensions.throws_ok($$ select public.plan_double_cover_choose(public.t115_h(1), public.t115_u(2)) $$, '42501', null,
  'a stranger cannot choose');
select public.t115_none();
select extensions.throws_ok($$ select public.plan_double_cover_choose(public.t115_h(1), public.t115_u(2)) $$, '42501', null,
  'a caller with no session cannot choose');
select public.t115_as(1);
select extensions.throws_ok($$ select public.plan_double_cover_choose(public.t115_h(1), public.t115_u(3)) $$, '22023', null,
  'the plan to keep must belong to one of the two payers');

select public.t115_as(2);
select extensions.is(public.plan_double_cover_choose(public.t115_h(1), public.t115_u(2)) ->> 'note', 'chosen', 'B keeps the takeover plan');
select extensions.is((select chosen_payer from public.household_plans where household_id = public.t115_h(1)), public.t115_u(2), 'chosen_payer is B');
select extensions.is((select payer_id::text || original_transaction_id from public.household_plans where household_id = public.t115_h(1)),
  public.t115_u(2)::text || 'play-B', 'the covering columns are unchanged by the pick');
select extensions.is((select count(*)::int from public.household_events where household_id = public.t115_h(1) and kind = 'plan_recovered_after_takeover'
  and audience = array[public.t115_u(1)] and params ->> 'chosen_by' = 'payer'), 1, 'only A is told their plan was not picked');

select extensions.is(public.plan_double_cover_choose(public.t115_h(1), public.t115_u(2)) ->> 'note', 'already_chosen', 'picking again changes nothing');
select extensions.is(public.t115_events(1, 'plan_recovered_after_takeover'), 1, 'no new notice on the repeat');
select public.t115_as(1);
select extensions.is(public.plan_double_cover_choose(public.t115_h(1), public.t115_u(1)) ->> 'note', 'already_chosen', 'the other payer cannot re-pick');
select extensions.is((select chosen_payer::text || payer_id::text from public.household_plans where household_id = public.t115_h(1)),
  public.t115_u(2)::text || public.t115_u(2)::text, 'the first pick wins and covers');
select public.t115_none();

select extensions.is(public.t115_apply(1, public.t115_snap(true, 'fincwin.household.month', 'APP_STORE', 'NORMAL',
  now() + interval '40 days', null, null, 'apple-2')) ->> 'note', 'not_chosen', 'the plan that was not picked leaves the covering row alone');
select extensions.is(public.t115_events(1, 'plan_recovered_after_takeover'), 1, 'at most one not-picked notice per 30 days');
select extensions.is((select payer_id from public.household_plans where household_id = public.t115_h(1)), public.t115_u(2), 'B still covers');
select extensions.is(public.t115_apply(1, public.t115_snap(false, 'fincwin.household.month', 'APP_STORE', 'NORMAL',
  now() - interval '1 day')) ->> 'note', 'double_cover_ended', 'when the not-picked subscription ends the dc columns are cleared');
select extensions.is((select dc_payer_id from public.household_plans where household_id = public.t115_h(1)), null, 'dc_payer_id is cleared');
select extensions.is((select payer_id from public.household_plans where household_id = public.t115_h(1)), public.t115_u(2), 'the covering plan is untouched');

-- 67-74. The old payer (A) picks their own plan.
select extensions.is(public.t115_open(4, 5), 'double_cover_opened', 'setup: a second double cover is open');
insert into vers select 'h4', version from public.household_plans where household_id = public.t115_h(4);
select public.t115_as(4);
select extensions.is(public.plan_double_cover_choose(public.t115_h(4), public.t115_u(4)) ->> 'note', 'chosen', 'A keeps their own plan');
select public.t115_none();
select extensions.is((select payer_id::text || store || product_id || original_transaction_id from public.household_plans where household_id = public.t115_h(4)),
  public.t115_u(4)::text || 'APP_STORE' || 'fincwin.household.month' || 'apple-2', 'the covering columns are now A''s subscription');
select extensions.is((select plan_key from public.household_plans where household_id = public.t115_h(4)), 'household', 'plan_key follows plan_products');
select extensions.is((select version from public.household_plans where household_id = public.t115_h(4)), (select v + 1 from vers where label = 'h4'),
  'the pick bumps the version once');
select extensions.is((select dc_payer_id::text || dc_original_transaction_id from public.household_plans where household_id = public.t115_h(4)),
  public.t115_u(5)::text || 'play-B', 'B''s subscription is now the one held aside');
select extensions.is((select count(*)::int from public.household_events where household_id = public.t115_h(4) and kind = 'plan_recovered_after_takeover'
  and audience = array[public.t115_u(5)]), 1, 'only B is told their plan was not picked');
select extensions.is(public.household_plan_state(public.t115_h(4)), 'active', 'the home is active after the swap');
select extensions.ok(public.household_writable(public.t115_h(4)), 'the home is writable after the swap');

-- 75-77. A recovered plan that is too small cannot be picked (D-44).
select extensions.is(public.t115_open(6, 7, 'fincwin.duo.year'), 'double_cover_opened', 'setup: the old payer recovers on a duo plan');
select public.t115_as(6);
select extensions.is(public.plan_double_cover_choose(public.t115_h(6), public.t115_u(6)) ->> 'reason', 'plan_too_small',
  'a duo plan cannot be picked for 3 members');
select extensions.is(public.plan_double_cover_state() -> 'old' ->> 'fits', 'false', 'the state says the recovered plan does not fit');
select public.t115_none();
select extensions.is((select payer_id from public.household_plans where household_id = public.t115_h(6)), public.t115_u(7),
  'the takeover plan still covers after the refused pick');

-- 78-83. The covering plan lapses while the other is live: the home switches straight over.
select extensions.is(public.t115_open(9, 10), 'double_cover_opened', 'setup: a double cover is open');
select extensions.is(public.t115_apply(10, public.t115_snap(false, 'fincwin_household:monthly', 'PLAY_STORE', 'NORMAL',
  now() - interval '1 day')) ->> 'note', 'double_cover_fallback', 'the home switches to the other live plan');
select extensions.is((select payer_id::text || original_transaction_id from public.household_plans where household_id = public.t115_h(9)),
  public.t115_u(9)::text || 'apple-2', 'the covering columns now hold the other subscription');
select extensions.is((select chosen_payer::text || chosen_by from public.household_plans where household_id = public.t115_h(9)),
  public.t115_u(9)::text || 'fallback', 'the fallback is recorded');
select extensions.is(public.household_plan_state(public.t115_h(9)), 'active', 'the home never lapsed');
select extensions.is(public.t115_events(9, 'plan_locked'), 0, 'no plan_locked notice');

-- 84-88. The 7-day default keeps the takeover plan.
select extensions.is(public.t115_open(11, 12), 'double_cover_opened', 'setup: a double cover is open for 8 days');
select extensions.is(public.t115_open(13, 14), 'double_cover_opened', 'setup: a double cover is open for 6 days');
update public.household_plans set double_cover_since = now() - interval '8 days' where household_id = public.t115_h(11);
update public.household_plans set double_cover_since = now() - interval '6 days' where household_id = public.t115_h(13);
select public.plan_sweep();
select extensions.is((select chosen_payer::text || chosen_by || payer_id::text from public.household_plans where household_id = public.t115_h(11)),
  public.t115_u(12)::text || 'default' || public.t115_u(12)::text, 'after 8 days the takeover plan is kept by default');
select extensions.is((select count(*)::int from public.household_events where household_id = public.t115_h(11) and kind = 'plan_recovered_after_takeover'
  and audience = array[public.t115_u(11)] and params ->> 'chosen_by' = 'default'), 1, 'the old payer is told once');
select public.plan_sweep();
select extensions.is(public.t115_events(11, 'plan_recovered_after_takeover'), 1, 'a second sweep adds nothing');
select extensions.is((select chosen_payer from public.household_plans where household_id = public.t115_h(13)), null, 'after 6 days nobody is chosen yet');

-- 89-91. A member buying while another member's plan covers.
select public.t115_apply(15, public.t115_snap(true, 'fincwin.household.month', 'APP_STORE', 'NORMAL', now() + interval '30 days'));
select extensions.is(public.t115_apply(16, public.t115_snap(true, 'fincwin_household:monthly', 'PLAY_STORE', 'NORMAL',
  now() + interval '30 days')) ->> 'note', 'double_cover', 'the second buyer is told, nothing changes');
select extensions.is((select payer_id from public.household_plans where household_id = public.t115_h(15)), public.t115_u(15), 'the first purchase still covers');
select extensions.is((select count(*)::int from public.household_events where household_id = public.t115_h(15) and kind = 'plan_double_cover'
  and params ->> 'mode' = 'extra' and audience = array[public.t115_u(16)]), 1, 'the extra buyer gets an extra notice');

-- 92-93. A waiting join request is admitted when the plan grows.
select public.t115_apply(24, public.t115_snap(true, 'fincwin.duo.year', 'APP_STORE', 'NORMAL', now() + interval '365 days'));
select public.t115_as(24);
insert into codes select 'k24', r ->> 'code' from (select public.create_invite() r) s;
select public.t115_as(26);
select public.redeem_invite((select code from codes where label = 'k24'));
select public.t115_none();
select public.t115_apply(24, public.t115_snap(true, 'fincwin.household.month', 'APP_STORE', 'NORMAL', now() + interval '365 days'));
select extensions.is((select count(*)::int from public.household_members where user_id = public.t115_u(26) and household_id = public.t115_h(24)), 1,
  'the waiting person is admitted after a household-size snapshot');
select extensions.is((select status from public.plan_join_requests where user_id = public.t115_u(26) and household_id = public.t115_h(24)), 'admitted',
  'the request is marked admitted');

-- 94-97. Other return paths.
select extensions.is(public.t115_apply(27, public.t115_snap(true, 'fincwin.nope', 'APP_STORE', 'NORMAL', now() + interval '30 days')) ->> 'note',
  'unknown_product', 'an unknown product changes nothing');
select extensions.is((select count(*)::int from public.household_plans where household_id = public.t115_h(27)), 0, 'no plan row is written for it');
select extensions.is(public.t115_apply(28, public.t115_snap(true, 'fincwin.duo.year', 'APP_STORE', 'NORMAL', now() + interval '30 days')) ->> 'note',
  'no_household', 'a person with no household is noted');
select extensions.is(public.t115_apply(29, public.t115_snap(false, null, null, null, null)) ->> 'note', 'not_entitled',
  'a not-entitled snapshot with no plan is noted only');

-- 98. Every return path marks its webhook row applied.
select extensions.is((select count(*)::int from public.plan_events where applied_at is null), 0,
  'every plan_apply return path leaves the event applied');

-- 99-104. plan_sweep_targets (09-06 reconcile).
insert into public.plan_events (rc_event_id, type, app_user_id, received_at)
values ('tgt-1', 'INITIAL_PURCHASE', public.t115_u(30)::text, now() - interval '20 minutes'),
       ('tgt-test', 'TEST', public.t115_u(31)::text, now() - interval '20 minutes'),
       ('tgt-anon', 'INITIAL_PURCHASE', '$RCAnonymousID:abc', now() - interval '20 minutes');
select extensions.ok(exists (select 1 from public.plan_sweep_targets() t where t.app_user_id = public.t115_u(30)),
  'a stored but unapplied event with no plan row is a target');
select extensions.ok(not exists (select 1 from public.plan_sweep_targets() t where t.app_user_id = public.t115_u(31)),
  'a TEST event is not a target');
select extensions.lives_ok($$ select count(*) from public.plan_sweep_targets() $$, 'a non-UUID app user id is skipped without an error');
select public.plan_apply(public.t115_u(30), public.t115_snap(false, null, null, null, null), 'tgt-1');
select extensions.ok(not exists (select 1 from public.plan_sweep_targets() t where t.app_user_id = public.t115_u(30)),
  'once the event is applied the user is no longer a target');
select extensions.ok(exists (select 1 from public.plan_sweep_targets() t where t.app_user_id = public.t115_u(5)),
  'the held-aside payer of a resolved double cover is a target');
select extensions.ok(exists (select 1 from public.plan_sweep_targets() t where t.app_user_id = public.t115_u(13)),
  'the held-aside payer of an open double cover is a target');
select extensions.is((select count(*)::int from public.plan_sweep_targets()), (select count(distinct t.app_user_id)::int from public.plan_sweep_targets() t),
  'targets are never duplicated');

-- 106-109. plan_sweep.
insert into public.household_plans (household_id, payer_id, store, plan_size, status, covered_until, plan_key, period)
values (public.t115_h(32), public.t115_u(32), 'APP_STORE', 2, 'active', now() - interval '1 day', 'duo', 'month');
select public.plan_sweep();
select extensions.is(public.t115_events(32, 'plan_locked'), 1, 'a household whose cover passed gets one plan_locked notice');
select public.plan_sweep();
select extensions.is(public.t115_events(32, 'plan_locked'), 1, 'a second sweep adds none');
insert into public.household_leave_log (user_id, household_id, left_at, reason) values
  (public.t115_u(33), public.t115_h(33), now() - interval '14 months', 'left'),
  (public.t115_u(33), public.t115_h(33), now() - interval '1 month', 'left');
select public.plan_sweep();
select extensions.is((select count(*)::int from public.household_leave_log where user_id = public.t115_u(33) and left_at < now() - interval '13 months'), 0,
  'leave-log rows older than 13 months are purged');
select extensions.is((select count(*)::int from public.household_leave_log where user_id = public.t115_u(33)), 1, 'newer leave-log rows are kept');

-- 110-112. Privileges and cron.
select extensions.is(has_function_privilege('authenticated', 'public.plan_apply(uuid, jsonb, text)', 'execute'), false, 'clients cannot call plan_apply');
select extensions.is(has_function_privilege('authenticated', 'public.plan_sweep()', 'execute'), false, 'clients cannot call plan_sweep');
select extensions.is(has_function_privilege('authenticated', 'public.plan_sweep_targets()', 'execute'), false, 'clients cannot call plan_sweep_targets');
select extensions.is((select count(*)::int from cron.job where jobname in ('plan-sweep-daily', 'plan-reconcile-daily')), 2,
  'both cron jobs exist');

select * from extensions.finish();
rollback;
