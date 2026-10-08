# Phase 2: on-demand FX production rollout record

Plan 02-50. Records every production command and what it printed. No secret
values are ever written here (names only).

Approval: (pending, Task 2)
Deployed commit: (pending, the merged main hash)
Pre-rollout main hash (rollback target for resolve-rate): (pending)
Fingerprint (installed build / update): (pending)

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
Observed:

### 3.2 Remote migration state before push
Command: `npx supabase migration list --linked`
Observed (which of 20261007000100 / 000200 / 000300 / 000400 are remote-missing):

### 3.3 Push
Command: `npm run supabase:db:push`, then `npx supabase migration list --linked`
Observed:
Stopped-mid-way branch used (yes/no; if yes, the unschedule output):

### 3.4 Deploy resolve-rate
Command: `npx supabase functions deploy resolve-rate`
Observed:

### 3.5 Read-only production checks (Management API SQL endpoint)
1. `select jobname from cron.job order by 1;` (expect recurring-materialise-daily, record-tombstone-purge-daily only)
   Observed:
2. `select proname from pg_proc where pronamespace = 'public'::regnamespace and proname in ('fx_pending_rows_count','fx_restamp_pending','fx_quotes_needing_fetch','fx_rate_covers','fx_auto_accept_holds') order by 1;`
   Observed: (note: fx_pending_rows_count and fx_restamp_pending are REVOKED and DEPRECATED, not dropped, so they still exist; the check is that they are not executable by anon, authenticated or service_role)
3. `select count(*) from public.currencies where end_date is null;` (about 166)
   Observed:
4. `select count(*), max(rate_date) from public.fx_rates;` (at least 2,240 rows)
   Observed:
5. `select public.is_iso_currency('THB'), public.is_iso_currency('DEM');` (true, false)
   Observed:
6. `select (select value from public.app_config where key = 'min_supported_version');` (unchanged, '0.1.0' unless raised earlier)
   Observed:

### 3.6 Client
Commands: `npx eas build:list --profile development --limit 3 --json`; `npx eas fingerprint:compare --build-id <id>` or `npx eas fingerprint:generate --platform android`
Observed (build id, runtimeVersion, project fingerprint, iOS fingerprint if any):
Same fingerprint: `npx eas update --channel development --environment development --message "02-41..49 on-demand FX"` (and preview if installed and matching)
Observed (update group ids):
Different fingerprint: new `npx eas build --profile development --platform android` instead
Observed (new build id and fingerprint):

## Task 4: device checklist

Android emulator or iPhone XR; restart the development build twice so the EAS update loads.

- [ ] 1. Entry sheet currency field shows "Your currency", "Popular" by continent, then the full A-Z list (about 160 rows); same in Add account.
- [ ] 2. THB, amount 100, a past weekday in August 2026: the line shows its rate date within seconds. Read-only: `select quote, rate_date, source from fx_rates where quote in ('THB','<home>') and rate_date <= '<date>' order by rate_date desc limit 2;` and `select * from fx_rate_lookups where requested_date = '<date>';` have rows.
- [ ] 3. Second THB line on the same date: `fx_rate_lookups.fetched_at` unchanged (no second fetch).
- [ ] 4. Account in a non-home currency: card shows the "≈" home figure with a rate date (or "Waiting for a rate" briefly, then the figure after pull-to-refresh).
- [ ] 5. Airplane mode on, add a foreign line ("Rate pending"), airplane mode off, foreground the app: the line shows a rate date within a minute (sweep interval permitting).
- [ ] 6. Home-currency-only line: no new `fx_rate_lookups` row for that date.
- [ ] 7. Test account with lines in another currency, home currency changed to one with no rate stored for today: `fx_rate_lookups` rows for today for the new home and each currency in use; month totals convert, no "waiting for a rate" line after a refresh.

Observed (per check):

## Task 5: irreversible cleanup (only after Task 4 is approved)

### 5.1 Delete functions
Commands: `npx supabase functions delete fx-sync`; `npx supabase functions delete fx-monitor`; `npx supabase functions list`
Observed:

### 5.2 Unset secrets
Commands: `npx supabase secrets unset FX_SYNC_SECRET FX_MONITOR_SECRET`; `npx supabase secrets list` (names only)
Observed:

### 5.3 Vault rows
Commands: `delete from vault.secrets where name in ('fx_sync_url','fx_sync_secret','fx_monitor_url','fx_monitor_secret') returning name;` then `select count(*) from vault.secrets where name like 'fx\_%';` (expect 0)
Observed:

### 5.4 Endpoints gone
Commands: `curl -s -o /dev/null -w "%{http_code}" -X POST https://$SUPABASE_PROD_PROJECT_REF.supabase.co/functions/v1/fx-sync` (expect 404); same for fx-monitor
Observed:

### 5.5 Requirements
`.planning/REQUIREMENTS.md`: MON-06, MON-10, MON-11, ENV-08 ticked `[x]` and traceability set to Complete, citing this record.
Observed:
