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

**Status: DONE, 2026-10-07.** `npm run supabase:db:push -- --yes` ran with the preflight first, after the user explicitly asked for it; the sandbox had refused the first attempt. All eight files applied without error: "Finished supabase db push."

`npx supabase migration list --linked` (Phase 2 rows):

| Migration | Local | Remote |
|---|---|---|
| 20260926000100_categories | 20260926000100 | 20260926000100 |
| 20260926000200_transactions_record_fields | 20260926000200 | 20260926000200 |
| 20260926000300_recurring_series | 20260926000300 | 20260926000300 |
| 20260926000400_recurring_materialisation | 20260926000400 | 20260926000400 |
| 20260926000500_undo_log | 20260926000500 | 20260926000500 |
| 20260926000600_record_read_rpcs | 20260926000600 | 20260926000600 |
| 20260926000700_transfer_pairs | 20260926000700 | 20260926000700 |
| 20260926000800_import_profiles | 20260926000800 | 20260926000800 |

## 4. Live checks (Management API, read-only)

| Check | Expected | Result |
|---|---|---|
| profiles with fewer than 15 categories | 0 | 0 (of 1 profile; the backfill seeded it) |
| cron `recurring-materialise-daily` | scheduled | `20 0 * * *` |
| cron `record-tombstone-purge-daily` | scheduled | `40 3 * * *` |
| `pg_trgm` extension | 1 row | installed in `extensions` |
| `transactions_active` view | 1 | 1 |
| `transfer_pair_check` trigger | 1 | 1 |
| `import_profiles` table | 1 | 1 |
| `transactions` import-provenance columns | 5 | 5 |
| `accounts` limit columns | 2 | 2 |

## 5. Statement fixtures (synthetic; no real statement is committed)

- `fixtures/sample-bank-export.csv`: 40 rows over June–August 2026, DD/MM/YYYY, `Paid out`/`Paid in`/`Balance`, comma thousands. It includes a duplicate pair (Coffee House, 12/07/2026), a monthly NETFLIX.COM 10.99, a monthly Salary, and a quoted-comma description.
- `fixtures/overdrawn-current-account.csv`: 15 rows in September 2026. The balance runs from 120.00 to −240.00, with a `CARD PAYMENT TO VISA` of −500.00 on 03/09/2026.
- `fixtures/card-over-limit.ofx`: OFX 1.x SGML `CCSTMTRS` in GBP. Nine positive purchases totalling 1,750.00, and `PAYMENT - THANK YOU` −500.00 on 2026-09-05. `LEDGERBAL` 1250.00, `AVAILBAL` −250.00, placeholder `ACCTID` 99887766.

## 6. Device walkthrough

**Device:** Pixel 9 (Android, physical), development build from `main` at 59ac179 plus the walkthrough fixes (`npx expo` dev client and Metro over USB). Backend: production.
**Status: approved by the user, 2026-10-07.**

| Step | Result |
|---|---|
| 1 Sign-in, first account, bring your history | Pass after fixes. The first run landed on You instead of Activity, the home currency stayed USD on an en-CA device, and the import file button was disabled with no reason. All three are fixed in `02-31-WALKTHROUGH-FIXES.md`. |
| 2 CSV import, column check, date format | Pass |
| 3 Review: duplicate, category guesses, import toast | Pass |
| 4 Netflix recurring suggestion, pending line | Pass |
| 5 Add and undo a line | Pass |
| 6 Mark paid, "This and future", skip, end series | Pass |
| 7 Months, search every month, filters | Pass |
| 8 Bulk delete and undo | Pass |
| 9 Categories: rename, recolour, add, merge, undo | Pass |
| 10 Account balance, still to come | Pass |
| 11 History, "Undo to here" | Pass |
| 12 Refusal after a server-side change | Pass. Coffee House `57f3bc86…`, version 4 to 5, then undo refused as "changed elsewhere". |
| 13 Offline queue and replay in order | Pass |
| 14 TalkBack: toast stays until dismissed | Pass |
| 15 Overdrawn current account, reconciliation, standing | Pass |
| 16 Card over limit (OFX): format flip, limit offer | Pass |
| 17 Transfer link from import, totals exclude, over-limit warning | Pass |
| 18 Undo the OFX import | Pass |
| 19 Re-import duplicates; manual transfer delete and undo | Pass |
| 20 iPhone XR file picker | Pending, Apple enrolment |

**New finding, out of scope for Phase 2:** money accounts can only be archived, not deleted. The user decided on 2026-10-07 to allow deleting an account only while it has no lines. This is tracked as a follow-up; it needs a migration.

approved
