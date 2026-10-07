# Phase 2 (Record) — production rollout and acceptance

**Date:** 2026-10-07
**Code:** main at `59ac179` (PR #43, "Phase 2 (Record): engine, schema, data layer and screens")
**Project:** `cohmcbdfgqmiwykztrdg` (the single production project)

## 1. Local gate

Run on the gated tree (`cc71275`, identical to `59ac179`; `git diff --stat cc71275 59ac179` is empty).

| Check | Result |
|---|---|
| `npm run typecheck` | pass |
| `npm run depcruise` | pass, no violations |
| `npx eslint .` (`npm run lint`) | 0 errors (253 warnings) |
| `npm run check:ignores` | OK |
| `npm run test:coverage` (Jest, coverage thresholds) | 141 suites, 4,223 tests, all passing |
| `npm run verify:gates` | GATES OK |
| `npm run lint:migrations`, `verify:migrations` | pass |
| `npm run check:money-mirror`, `check:recurring-mirror` | pass |
| `npx supabase db reset --local && npx supabase test db` | 37 files, 678 tests, PASS |

PR #43 CI: `checks`, `rls`, `secret-scan` all pass.

## 2. Push preflight

- `npm run supabase:preflight`: OK. The ref `cohmcbdfgqmiwykztrdg` matches `supabase/config.toml` and `SUPABASE_PROD_PROJECT_REF`.
- **Precondition (01-16):** `supabase migration list --linked` shows `20260922000100`–`20260924000700` applied remotely. The eight Phase 2 files `20260926000100`–`20260926000800` are local only.
- **`pg_trgm`:** not installed on production; available at version 1.6. Migration `20260926000200` runs `create extension if not exists pg_trgm with schema extensions` and indexes with `extensions.gin_trgm_ops`. This matches the existing `pgcrypto` placement in `extensions`. `pg_cron` 1.6.4 is present.

## 3. Schema push

**Status: PENDING.** The sandbox refused `npm run supabase:db:push -- --yes`. Per plan 02-31, the remaining push and live-check steps are handed to the user (see the checkpoint below).

| Migration | Remote |
|---|---|
| 20260926000100_categories | pending |
| 20260926000200_transactions_record_fields | pending |
| 20260926000300_recurring_series | pending |
| 20260926000400_recurring_materialisation | pending |
| 20260926000500_undo_log | pending |
| 20260926000600_record_read_rpcs | pending |
| 20260926000700_transfer_pairs | pending |
| 20260926000800_import_profiles | pending |

## 4. Live checks

**Status: PENDING** (run after the push).

| Check | Expected | Result |
|---|---|---|
| profiles with fewer than 15 categories | 0 | — |
| cron jobs `recurring-materialise-daily`, `record-tombstone-purge-daily` | 2 rows | — |
| `pg_trgm` extension | 1 row | — |
| `transactions_active` view | 1 | — |
| `transfer_pair_check` trigger | 1 | — |
| `import_profiles` table | 1 | — |
| `transactions` import-provenance columns | 5 | — |
| `accounts` limit columns | 2 | — |

## 5. Statement fixtures (synthetic; no real statement is committed)

- `fixtures/sample-bank-export.csv`: 40 rows over June–August 2026, DD/MM/YYYY, `Paid out`/`Paid in`/`Balance`, comma thousands. It includes a duplicate pair (Coffee House, 12/07/2026), a monthly NETFLIX.COM 10.99, a monthly Salary, and a quoted-comma description.
- `fixtures/overdrawn-current-account.csv`: 15 rows in September 2026. The balance runs from 120.00 to −240.00, with a `CARD PAYMENT TO VISA` of −500.00 on 03/09/2026.
- `fixtures/card-over-limit.ofx`: OFX 1.x SGML `CCSTMTRS` in GBP. Nine positive purchases totalling 1,750.00, and `PAYMENT - THANK YOU` −500.00 on 2026-09-05. `LEDGERBAL` 1250.00, `AVAILBAL` −250.00, placeholder `ACCTID` 99887766.

## 6. Device walkthrough

**Status: PENDING.** This needs a new EAS development build first. Plans 02-20 and 02-26 added the native modules `@react-native-community/datetimepicker` and `expo-document-picker`.
