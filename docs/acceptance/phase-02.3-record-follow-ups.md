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

## Device walkthrough (Task 3), 2026-10-13

Device: Pixel 9 (Android). Development build: the Oct 10 dev client already installed on the phone (no rebuild). It loaded JS from Metro:
- first merged main ede43d5 from C:/dev/fincwin-w1 on port 8072;
- then branch fix/02.3-walkthrough from C:/dev/fincwin-fix on port 8073, to verify the walkthrough fixes before merging.

02.3 adds no native module. The merged-main fingerprint is 6088ff5a301c613ffa8dd5854f0d448c16fd574c. The latest EAS development build, e07f9578, has 1b0223ca14e7a85881da87770a9a5e7e0dcedfdc, because PR #66 changed expo-updates settings. The installed dev client still ran the JS. The dev client was opened with `exp+fincwin://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A<port>` after `adb reverse`. Opening it with `localhost` failed a DNS lookup on this phone and bounced to DevLauncherErrorActivity.

Fixtures pushed to /sdcard/Download: current-account.pdf (02.1 fixture) and docs/acceptance/fixtures/sample-bank-export.csv.

User approval: "all approved", 2026-10-13, after the fixes below were checked on the device.

| Step | Criterion | Result |
|------|-----------|--------|
| 1 | Import: reconcile or add every line (REC-26) | pass |
| 2 | Rules, personal and shared, across entry, paste and import (REC-27) | pass |
| 3 | Continue as / Use a different account / Not you? Remove (ACC-14) | pass |
| 4 | Compact amount, pad on tap (REC-28) | pass, after fix 2 below |
| 5 | Add account from the picker (REC-29) | pass, after fix 3 below |
| 6 | Bulk list with a repeating item, app close and one Undo (REC-30) | pass, after fixes 1, 4 and 5 below |
| 7 | iPhone XR | pending: Apple enrolment (no iOS development build exists) |
| 8 | Remembered-accounts privacy paragraph on fincwin.com/privacy | pending: website (text ready in docs/compliance/privacy-policy-remembered-accounts.md) |

Gate on fix/02.3-walkthrough before its PR: lint (0 errors), typecheck, depcruise, check:ignores, test:coverage (278 suites, 7354 tests, no threshold failure), verify:gates, lint:migrations, verify:migrations, money and recurring mirrors. All pass. The fixes add no migration.

### Fixes made during the walkthrough (branch fix/02.3-walkthrough)

1. **Swipe inside sheets did nothing on Android** (step 6), commit 4d77161. Sheets render in an RN Modal, a separate native window on Android, and the only GestureHandlerRootView was outside it. Each sheet now has its own root. Debug record: .planning/debug/resolved/sheet-swipe-android.md.
2. **Amount received is prefilled across currencies** (step 4, user request), commits 70eb6b2 and e5d17a3, quick task 261013-izi.
   - It fills from the stored latest rates while untouched, and never fetches.
   - The first key on a prefilled figure replaces it.
   - It stops recalculating after a manual edit.
   - It stays empty with no rate.
3. **Dim scrim behind every sheet**, including a sheet opened over another (step 5, user request), commit 9bf7b56, quick task 261013-izi.
   - It adds one token, `colors.scrim` = rgba(0,0,0,.4), the only colour beyond §2, as the user approved.
   - The scrim stays fixed while the sheet slides in.
   - Side effect: closing a sheet no longer animates.
4. **Activity crashed on the first launch after a restart**, commit e95893d. Found after rebooting the Pixel 9; a Phase 02.2 bug.
   - The dismissed-offer keys were cached as a Set, and the persisted JSON cache restored it as {}, so `dismissedKeys.has is not a function` was thrown.
   - Now cached as string[], and a restored {} reads as no keys.
5. **Undo after removing an entry-list item** (step 6, user request), commits c678528 and 6918c34, quick task 261013-kf4.
   - "Removed · {name}" with a local Undo (6 s) that restores the item at its index.
   - It needed a new optional `onUndo` on the undo toast.
   - UI-SPEC lines 203 and 353 were updated; they previously said no toast.
