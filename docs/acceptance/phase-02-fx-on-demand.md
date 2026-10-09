# Phase 2: on-demand FX production rollout record

Plan 02-50. Records every production command and what it printed. No secret
values are ever written here (names only).

Approval: approved by the user, 2026-10-08 ("Approve": run Tasks 3–5; cleanup after the device check).
Deployed commit: 3df0828 (main after PR #48, which re-landed #46 after the accidental revert #47).
Pre-rollout main hash (rollback target for resolve-rate): 9988325 (main before #46/#48; resolve-rate v2 was deployed from Phase 1 code).
Fingerprint (installed build / update): differs. Latest EAS build 9caa35a7 (Android preview, 2026-09-27) predates the Phase 2 native modules (@react-native-community/datetimepicker, expo-document-picker); `eas fingerprint:compare` shows the datetimepicker package added. No OTA published (per plan). The test device ran a local arm64 debug build that loads JS from Metro serving main 3df0828.

min_supported_version: unchanged (no table/column dropped or renamed; old-client read paths unchanged)

## Local gate (Task 1)

Run on the commit to be deployed (Task 1 result lines are filled in below by the executor).

| Gate | Result |
|---|---|
| `npx jest` | see "Task 1 gate results" |
| `npm run typecheck` | see below |
| `npm run lint` | see below |
| `npm run depcruise` | see below |
| `npx supabase db reset --local && npx supabase test db` | see below |
| `npm run lint:migrations` | see below |
| `npm run verify:migrations` | see below |
| `npm run check:money-mirror` | see below |
| `npm run check:recurring-mirror` | see below |

### Task 1 gate results

Run 2026-10-08 on worktree base 1fc3a5d (docs/02-31-rollout with 02-41..02-49 merged) plus the Task 1 docs; the deployed commit's own re-run is repeated at deploy time if main differs.

- `npx jest`: Test Suites 158 passed, 1 failed of 159; Tests 4667 passed, 1 failed of 4668. The one failure was `src/features/record/__tests__/useDeviceHomeCurrencyDefault.test.tsx`, a cold-start timeout under full-suite load (same class of flake as 02-49's YouScreen note); re-run alone: 1 suite, 18 tests passed.
- `npm run typecheck`: clean (`tsc --noEmit`, no output).
- `npm run lint`: 255 problems (0 errors, 255 warnings), all pre-existing.
- `npm run depcruise`: no dependency violations found (287 modules, 1366 dependencies cruised).
- `npx supabase db reset --local && npx supabase test db`: Files=41, Tests=760, Result: PASS (the first reset hit a transient Docker container-kill error; after `supabase start` the reset completed).
- `npm run lint:migrations`: MIGRATION COMPAT OK (23 files, floor 0.1.0); two non-fatal warnings from 20261007000300's DEPRECATED comments mentioning min_supported_version.
- `npm run verify:migrations`: MIGRATION GATE OK.
- `npm run check:money-mirror`: up to date.
- `npm run check:recurring-mirror`: up to date.

## Task 3: reversible production steps

Run only after "approve", from the merged main commit.

### 3.1 Preflight
Command: `npm run supabase:preflight`
Observed: Supabase preflight OK: project ref "cohmcbdfgqmiwykztrdg" matches supabase/config.toml and SUPABASE_PROD_PROJECT_REF.

### 3.2 Remote migration state before push
Command: `npx supabase migration list --linked`
Observed (which of 20261007000100 / 000200 / 000300 / 000400 are remote-missing): all four remote-missing.

### 3.3 Push
Command: `npm run supabase:db:push`, then `npx supabase migration list --linked`
Observed: applied 20261007000100, 000200, 000300, 000400 in order; "Finished supabase db push." Migration list: all four local = remote.
Stopped-mid-way branch used (yes/no; if yes, the unschedule output): no.

### 3.4 Deploy resolve-rate
Command: `npx supabase functions deploy resolve-rate`
Observed: "Deployed Functions." resolve-rate ACTIVE v3, 2026-10-08 23:02 UTC (script size 785 kB).

### 3.5 Read-only production checks (Management API SQL endpoint)
1. `select jobname from cron.job order by 1;` (expect recurring-materialise-daily, record-tombstone-purge-daily only)
   Observed: record-tombstone-purge-daily, recurring-materialise-daily. No fx-* job.
2. `select proname from pg_proc where pronamespace = 'public'::regnamespace and proname in ('fx_pending_rows_count','fx_restamp_pending','fx_quotes_needing_fetch','fx_rate_covers','fx_auto_accept_holds') order by 1;`
   Observed: (note: fx_pending_rows_count and fx_restamp_pending are REVOKED and DEPRECATED, not dropped, so they still exist; the check is that they are not executable by anon, authenticated or service_role)
   Result: fx_auto_accept_holds, fx_pending_rows_count, fx_quotes_needing_fetch, fx_rate_covers, fx_restamp_pending; has_function_privilege('service_role', fx_restamp_pending, execute) = false.
3. `select count(*) from public.currencies where end_date is null;` (about 166)
   Observed: 166 (was 0 before the push).
4. `select count(*), max(rate_date) from public.fx_rates;` (at least 2,240 rows)
   Observed: 2,404 rows, max 2026-10-08.
5. `select public.is_iso_currency('THB'), public.is_iso_currency('DEM');` (true, false)
   Observed: true, false.
6. `select (select value from public.app_config where key = 'min_supported_version');` (unchanged, '0.1.0' unless raised earlier)
   Observed: 0.1.0 (unchanged).

### 3.6 Client
Commands: `npx eas build:list --profile development --limit 3 --json`; `npx eas fingerprint:compare --build-id <id>` or `npx eas fingerprint:generate --platform android`
Observed (build id, runtimeVersion, project fingerprint, iOS fingerprint if any): no EAS development build exists; latest is Android preview 9caa35a7 (2026-09-27). Fingerprint differs (datetimepicker and document-picker native modules added). No iOS build (Apple enrolment pending).
Same fingerprint: `npx eas update --channel development --environment development --message "02-41..49 on-demand FX"` (and preview if installed and matching)
Observed (update group ids): none, not published because the fingerprint differs.
Different fingerprint: new `npx eas build --profile development --platform android` instead
Observed (new build id and fingerprint): no new EAS build made. The device check used the local arm64 debug build (gradlew assembleDebug), which already contains both native modules and loads main 3df0828 over Metro. Follow-up: an EAS preview build before the next tester or release round.

## Task 4: device checklist

Android emulator or iPhone XR; restart the development build twice so the EAS update loads.

- [x] 1. Entry sheet currency field shows "Your currency", "Popular" by continent, then the full A-Z list (about 160 rows); same in Add account.
- [x] 2. THB, amount 100, a past weekday in August 2026: the line shows its rate date within seconds. Read-only: `select quote, rate_date, source from fx_rates where quote in ('THB','<home>') and rate_date <= '<date>' order by rate_date desc limit 2;` and `select * from fx_rate_lookups where requested_date = '<date>';` have rows.
- [x] 3. Second THB line on the same date: `fx_rate_lookups.fetched_at` unchanged (no second fetch).
- [x] 4. Account in a non-home currency: card shows the "≈" home figure with a rate date (or "Waiting for a rate" briefly, then the figure after pull-to-refresh).
- [x] 5. Airplane mode on, add a foreign line ("Rate pending"), airplane mode off, foreground the app: the line shows a rate date within a minute (sweep interval permitting).
- [x] 6. Home-currency-only line: no new `fx_rate_lookups` row for that date.
- [ ] 7. Test account with lines in another currency, home currency changed to one with no rate stored for today: `fx_rate_lookups` rows for today for the new home and each currency in use; month totals convert, no "waiting for a rate" line after a refresh.

Observed (per check). Pixel 9 (physical), local debug build, main 3df0828, user account with home currency USD, 2026-10-08 / 09 UTC:
- 1. Pass. Both pickers show Your currency (USD ✓), Popular by continent (North America … Oceania), then All currencies A–Z (154 built-in), in a full-height scrollable sheet.
- 2. Pass. "THB - test 1", ฿100, 2026-08-12, saved 05:01:22 UTC; resolve-rate fetched at 05:01:26 (THB and USD legs, one Frankfurter call, both recorded in fx_rate_lookups); rate_pending false, rate_date 2026-08-12, home −US$3.02.
- 3. Pass. "THB test 2", ฿50, same date, saved 05:08:14: stamped at once (US$1.51), lookups fetched_at unchanged (05:01:26), still 2 fx_rates rows for the date.
- 4. Pass. "Eur test" account (EUR, opening €200) created 05:09:41. EUR→USD for 2026-10-08 was already stored, so no fetch and no lookup (coverage rule).
- 5. Pass, with a caveat. "Offline GBP" (£20, 2026-10-08) was queued offline and reached the server on reconnect (05:14:58), stamped exactly (US$26.46). The GBP 2026-10-08 rate was already stored, so the sweep-fetch path was not exercised on device; it is covered by Jest.
- 6. Pass. "Home only" (US$5, 2026-10-08): no new fx_rate_lookups row.
- 7. Pending: the app has no home-currency setting screen yet (only the device-region default for new profiles); covered by 02-49 Jest tests. Tracked in 02-HUMAN-UAT.md.
- fx_rate_fetch_failures: empty throughout.
- Note: after the reload the app opened signed out, and the user signed in again. Not yet explained; tracked as a follow-up.

## Task 5: irreversible cleanup (only after Task 4 is approved)

### 5.1 Delete functions
Commands: `npx supabase functions delete fx-sync`; `npx supabase functions delete fx-monitor`; `npx supabase functions list`
Observed: "Deleted Edge Function." for fx-sync and fx-monitor. Functions list: resolve-rate only.

### 5.2 Unset secrets
Commands: `npx supabase secrets unset FX_SYNC_SECRET FX_MONITOR_SECRET`; `npx supabase secrets list` (names only)
Observed: "Finished supabase secrets unset." (2). Remaining names: FX_ALERT_TO_EMAIL, RESEND_API_KEY, RESEND_FROM_EMAIL plus the platform-managed SUPABASE_* names.

### 5.3 Vault rows
Commands: `delete from vault.secrets where name in ('fx_sync_url','fx_sync_secret','fx_monitor_url','fx_monitor_secret') returning name;` then `select count(*) from vault.secrets where name like 'fx\_%';` (expect 0)
Observed: deleted fx_sync_url, fx_sync_secret, fx_monitor_secret, fx_monitor_url; remaining fx_* rows: 0.

### 5.4 Endpoints gone
Commands: `curl -s -o /dev/null -w "%{http_code}" -X POST https://$SUPABASE_PROD_PROJECT_REF.supabase.co/functions/v1/fx-sync` (expect 404); same for fx-monitor
Observed: fx-sync 404, fx-monitor 404.

### 5.5 Requirements
`.planning/REQUIREMENTS.md`: MON-06, MON-10, MON-11, ENV-08 ticked `[x]` and traceability set to Complete, citing this record.
Observed: ticked, see the commit that adds this line.
