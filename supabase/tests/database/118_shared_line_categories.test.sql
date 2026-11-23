-- pgTAP: Phase 07 (WR-03, D-32). shared_line_categories returns a partner's category only when it sits on a live shared line
-- or a live shared series of the caller's household, with display fields only (never monthly_cap or archived_at); a partner's
-- private category, the caller's own categories and other households' categories never come back; a non-member and anon get
-- nothing. Categories stay owner-only: no member reads a partner's category table row directly.
-- Run only on a local stack (supabase test db); never against the linked project.

begin;
create extension if not exists pgtap with schema extensions;

select extensions.plan(15);

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
select ('' || n || n || n || n || n || n || n || n || '-' || n || n || n || n || '-' || n || n || n || n || '-' || n || n || n || n || '-' || n || n || n || n || n || n || n || n || n || n || n || n)::uuid,
       '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'u' || n || '@test.local',
       json_build_object('full_name', 'User ' || n)::jsonb, now(), now()
  from generate_series(1, 4) n;

create temp table ids as select
  (select id from public.households where owner_id = '11111111-1111-1111-1111-111111111111') as h,
  (select id from public.households where owner_id = '44444444-4444-4444-4444-444444444444') as hd;
grant select on ids to authenticated;
create function public.t118_as(u text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true)
$$;
create function public.t118_cat(u uuid, k text) returns uuid language sql as $$
  select id from public.categories where owner_id = u and builtin_key = k
$$;

-- B joins A's household; D stays alone in their own.
delete from public.household_members where user_id = '22222222-2222-2222-2222-222222222222';
insert into public.household_members (household_id, user_id, is_owner, weight) values
  ((select h from ids), '22222222-2222-2222-2222-222222222222', false, 50);

-- B's categories: Pets (on a shared line), Gym (on a shared series), Secret (on a private line only), Gone (on a deleted
-- shared line only). Pets carries a monthly cap that must never leave B.
insert into public.categories (id, owner_id, name, color_key, monthly_cap) values
  ('c2000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'Pets', 'plum', 12345),
  ('c2000000-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 'Gym', 'green', null),
  ('c2000000-0000-0000-0000-000000000003', '22222222-2222-2222-2222-222222222222', 'Secret', 'slate', 999),
  ('c2000000-0000-0000-0000-000000000004', '22222222-2222-2222-2222-222222222222', 'Gone', 'slate', null);
-- D's category on D's own line in D's household.
insert into public.categories (id, owner_id, name, color_key) values
  ('c4000000-0000-0000-0000-000000000001', '44444444-4444-4444-4444-444444444444', 'D stuff', 'green');

insert into public.accounts (id, household_id, created_by, name, kind, currency, opening_balance, is_shared) values
  ('a1180000-0000-0000-0000-00000000000b', (select h from ids), '11111111-1111-1111-1111-111111111111', 'A joint', 'checking', 'USD', 0, true),
  ('b1180000-0000-0000-0000-00000000000a', (select h from ids), '22222222-2222-2222-2222-222222222222', 'B personal', 'checking', 'USD', 0, false),
  ('d1180000-0000-0000-0000-00000000000a', (select hd from ids), '44444444-4444-4444-4444-444444444444', 'D personal', 'checking', 'USD', 0, false);

-- Lines on the joint account are shared on arrival; B's personal-account line stays private.
insert into public.transactions (id, household_id, created_by, account_id, original_amount, original_currency, local_date, time_zone, name, status, category_id) values
  ('e1180000-0000-0000-0000-000000000001', (select h from ids), '22222222-2222-2222-2222-222222222222', 'a1180000-0000-0000-0000-00000000000b', -4000, 'USD', '2026-11-02', 'UTC', 'Vet', 'paid', 'c2000000-0000-0000-0000-000000000001'),
  ('e1180000-0000-0000-0000-000000000002', (select h from ids), '22222222-2222-2222-2222-222222222222', 'a1180000-0000-0000-0000-00000000000b', -3000, 'USD', '2026-11-02', 'UTC', 'Shop', 'paid', public.t118_cat('22222222-2222-2222-2222-222222222222', 'Groceries')),
  ('e1180000-0000-0000-0000-000000000003', (select h from ids), '22222222-2222-2222-2222-222222222222', 'b1180000-0000-0000-0000-00000000000a', -2000, 'USD', '2026-11-02', 'UTC', 'Private', 'paid', 'c2000000-0000-0000-0000-000000000003'),
  ('e1180000-0000-0000-0000-000000000004', (select h from ids), '22222222-2222-2222-2222-222222222222', 'a1180000-0000-0000-0000-00000000000b', -1000, 'USD', '2026-11-02', 'UTC', 'Deleted', 'paid', 'c2000000-0000-0000-0000-000000000004'),
  ('e1180000-0000-0000-0000-000000000005', (select h from ids), '11111111-1111-1111-1111-111111111111', 'a1180000-0000-0000-0000-00000000000b', -1500, 'USD', '2026-11-02', 'UTC', 'A shop', 'paid', public.t118_cat('11111111-1111-1111-1111-111111111111', 'Groceries')),
  ('e4180000-0000-0000-0000-000000000001', (select hd from ids), '44444444-4444-4444-4444-444444444444', 'd1180000-0000-0000-0000-00000000000a', -1000, 'USD', '2026-11-02', 'UTC', 'D line', 'paid', 'c4000000-0000-0000-0000-000000000001');
update public.transactions set deleted_at = now() where id = 'e1180000-0000-0000-0000-000000000004';
insert into public.recurring_series (id, household_id, created_by, account_id, name, amount, currency, freq, anchor_date, time_zone, is_shared, category_id) values
  ('51180000-0000-0000-0000-000000000001', (select h from ids), '22222222-2222-2222-2222-222222222222', 'a1180000-0000-0000-0000-00000000000b', 'Gym', -5000, 'USD', 'monthly', '2026-12-01', 'UTC', true, 'c2000000-0000-0000-0000-000000000002');

-- 1. Setup: the vet line is shared, the private line is not.
select extensions.ok((select is_shared from public.transactions where id = 'e1180000-0000-0000-0000-000000000001')
  and not (select is_shared from public.transactions where id = 'e1180000-0000-0000-0000-000000000003'), 'setup: shared and private lines');

set local role authenticated;
select public.t118_as('11111111-1111-1111-1111-111111111111');

-- 2-8. A sees B's categories on shared lines and series only, with display fields.
select extensions.ok(exists (select 1 from public.shared_line_categories((select h from ids)) where id = 'c2000000-0000-0000-0000-000000000001'), 'a partner category on a shared line comes back');
select extensions.ok(exists (select 1 from public.shared_line_categories((select h from ids)) where id = 'c2000000-0000-0000-0000-000000000002'), 'a partner category on a shared series comes back');
select extensions.ok(exists (select 1 from public.shared_line_categories((select h from ids))
                              where owner_id = '22222222-2222-2222-2222-222222222222' and builtin_key = 'Groceries'), 'a partner built-in comes back with its builtin_key');
select extensions.ok(not exists (select 1 from public.shared_line_categories((select h from ids)) where id = 'c2000000-0000-0000-0000-000000000003'), 'a partner category on a private line never comes back');
select extensions.ok(not exists (select 1 from public.shared_line_categories((select h from ids)) where id = 'c2000000-0000-0000-0000-000000000004'), 'a category only on a deleted shared line does not come back');
select extensions.ok(not exists (select 1 from public.shared_line_categories((select h from ids)) where owner_id = '11111111-1111-1111-1111-111111111111'), 'the caller''s own categories are not returned');
select extensions.is((select jsonb_build_object('name', name, 'color', color_key, 'owner', owner_id) from public.shared_line_categories((select h from ids)) where id = 'c2000000-0000-0000-0000-000000000001'),
  '{"name": "Pets", "color": "plum", "owner": "22222222-2222-2222-2222-222222222222"}'::jsonb, 'display fields and the owner');

-- 9. A still cannot read B's category rows directly (no new select policy).
select extensions.is((select count(*)::int from public.categories where owner_id = '22222222-2222-2222-2222-222222222222'), 0, 'categories stay owner-only');

-- 11. Asking about another household returns nothing.
select extensions.is((select count(*)::int from public.shared_line_categories((select hd from ids))), 0, 'another household''s categories never come back');

-- 12. B sees A's built-in on A's shared line, and not their own.
select public.t118_as('22222222-2222-2222-2222-222222222222');
select extensions.ok(exists (select 1 from public.shared_line_categories((select h from ids)) where owner_id = '11111111-1111-1111-1111-111111111111')
  and not exists (select 1 from public.shared_line_categories((select h from ids)) where owner_id = '22222222-2222-2222-2222-222222222222'), 'each member sees the other''s, never their own');

-- 13. A non-member sees nothing.
select public.t118_as('44444444-4444-4444-4444-444444444444');
select extensions.is((select count(*)::int from public.shared_line_categories((select h from ids))), 0, 'a non-member sees nothing');

-- 14. Anonymous callers are refused.
reset role;
set local role anon;
select extensions.throws_ok($$select * from public.shared_line_categories('00000000-0000-0000-0000-000000000000')$$, '42501', null, 'anon cannot call it');
reset role;

-- 15-16. The function is security definer with a pinned search_path, and its result columns are display fields only.
select extensions.ok((select prosecdef and proconfig @> array['search_path=""'] from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                       where n.nspname = 'public' and p.proname = 'shared_line_categories'), 'security definer with an empty search_path');
select extensions.is((select proargnames from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                       where n.nspname = 'public' and p.proname = 'shared_line_categories'),
  array['p_household', 'id', 'owner_id', 'builtin_key', 'name', 'color_key', 'icon_key'], 'only id, owner, builtin_key and display fields come out');

select * from extensions.finish();
rollback;
