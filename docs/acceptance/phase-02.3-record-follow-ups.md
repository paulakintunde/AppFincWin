# Phase 2.3: record follow-ups production rollout record

Plan 02.3-20. Records every production command and what it printed. No secret
values are ever written here (names only).

PR: https://github.com/paulakintunde/AppFincWin/pull/69 (MERGED 2026-10-13 with gh pr merge --merge, no --admin; checks on head 582a8a4: checks pass, deno pass, rls pass, secret-scan pass). It carried Waves 2–4 and so also merged #68 (Wave 2); Wave 1 landed earlier in #67.
Approval: go 2026-10-13. Before the merge, the user chose "You merge it" for PR #69 and "Go" for the production schema push.
Main commit: ede43d5f1b0cf238471dbf1c071054769ff1a5e1

min_supported_version: unchanged (additive only)

## Local gate (Task 1), run 2026-10-13 on phase branch phase/02.3-wave3

- `npm run lint`: 0 errors (446 warnings, all pre-existing).
- `npm run typecheck`: clean.
- `npm run depcruise`: no dependency violations.
- `npm run check:ignores`: OK.
- `npm run test:coverage`: Test Suites 274 passed; Tests 7324 passed; no threshold failure. engine/categorize, engine/statement and engine/entryList at 100% statements, branches, functions and lines.
- `npm run verify:gates`, `npm run lint:migrations`, `npm run verify:migrations`: OK.
- `npm run check:money-mirror`, `npm run check:recurring-mirror`: up to date.
- `npx supabase db reset --local && npx supabase test db`: Files=53, Tests=1056, Result: PASS (includes 51_category_rules, 52_category_rules_patches, 53_entry_list and regression suites 35, 36, 37, 44, 45).
- `grep -ciE "^\s*update public\." supabase/migrations/20261012000*.sql`: 0 in each of the three files (no production restamp).

## Schema push (Task 2)

Migrations:
1. 20261012000100_category_rules
2. 20261012000200_category_rules_patches
3. 20261012000300_entry_list

Run from a release checkout detached at the main commit (`git diff --quiet origin/main` exit 0), with the FincWin `SUPABASE_ACCESS_TOKEN` and `SUPABASE_DB_PASSWORD` read from C:/dev/fincwin/.env.local and exported per command only. The Supabase MCP connector was not used.

0. `npx supabase link --project-ref <SUPABASE_PROD_PROJECT_REF>`; `npx supabase migration list --linked`. Observed: 32 migrations local = remote through 20261011000300; 20261012000100, 000200, 000300 local only; nothing newer on the remote.
1. Stamp checksum BEFORE (Management API, read_only). T0 = `2026-10-13 18:43:12.061043+00`. `select count(*), md5(string_agg(id:version:home_amount order by id)) from public.transactions where updated_at < T0`. Observed: n = 379, digest = 26c9366e12699b1f145142910014dc1a.
2. `npm run supabase:db:push -- --yes`. Observed: "Supabase preflight OK: project ref "cohmcbdfgqmiwykztrdg" matches supabase/config.toml (project_id) and C:\dev\fincwin\.env.local (SUPABASE_PROD_PROJECT_REF)."; applied 20261012000100_category_rules.sql, 20261012000200_category_rules_patches.sql, 20261012000300_entry_list.sql; "Finished supabase db push." Then `npx supabase migration list --linked`: 20261012000100, 000200, 000300 local = remote.
3. Live checks (Management API, read_only):
   - `select relrowsecurity from pg_class where oid = 'public.category_rules'::regclass`. Observed: true.
   - `select count(*) from pg_policies where schemaname = 'public' and tablename = 'category_rules'`. Observed: 3.
   - `select count(*) from pg_proc where proname in ('apply_patches', 'undo_log_fill') and prosrc like '%category_rules%'`. Observed: 2.
   - `has_function_privilege('authenticated' / 'anon', 'public.record_entry_list(uuid[], jsonb, jsonb)', 'execute')`. Observed: authenticated true, anon false.
   - Stamp checksum AFTER, same T0 filter. Observed: n = 379, digest = 26c9366e12699b1f145142910014dc1a, equal to before. Rows with updated_at >= T0: 0.
4. docs/dependency-register.md, Supabase prod project row: Phase 02.3 note appended; Last checked 2026-10-13.

Result: production carries the 02.3 schema, verified read-only, with no existing row touched.

## Device walkthrough (Task 3)

Pending: the user's walkthrough of the six success criteria (steps 1–8 in plan 02.3-20).
