---
phase: 2
slug: record
status: approved
nyquist_compliant: true
wave_0_complete: false
created: 2026-09-25
revised: 2026-09-25
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest ~29.7.0 via `jest-expo` ~57.0.5, `fast-check` / `@fast-check/jest` (property tests), pgTAP (`supabase/tests/database/*.test.sql`) |
| **Config file** | `jest.config.js` (per-directory coverage thresholds) |
| **Quick run command** | `npm test -- <changed-file-pattern>` |
| **Full suite command** | `npm run test:coverage` and `supabase test db` |
| **Estimated runtime** | ~120 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm test -- <changed-file-pattern>`
- **After every plan wave:** Run `npm run test:coverage` and `supabase test db`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 120 seconds

---

## Per-Task Verification Map

Filled in by the planner and executor as tasks are created. Baseline mapping from research:

| Requirement | Test Type | Automated Command | File Exists | Status |
|-------------|-----------|-------------------|-------------|--------|
| REC-01/02 | unit + property | `npm test -- src/data/mutations/__tests__/transactions.test.tsx` | ❌ W0 (extend) | ⬜ pending |
| REC-03/04 | unit | `npm test -- src/data/mutations/__tests__/transactions.test.tsx` | ❌ W0 (extend) | ⬜ pending |
| REC-05/06 | property + pgTAP | `npm test -- src/engine/recurring` / `supabase test db` | ❌ W0 | ⬜ pending |
| REC-07 | unit + pgTAP (RLS) | `npm test -- src/db/__tests__/categories.test.ts` / `supabase test db` | ❌ W0 | ⬜ pending |
| REC-08 | unit | `npm test -- src/data/queries/__tests__/accounts.test.ts` | ❌ W0 | ⬜ pending |
| REC-09/10 | property | `npm test -- src/engine/csv` | ❌ W0 | ⬜ pending |
| REC-11/12 | unit + pgTAP (RLS) | `npm test -- src/engine/undo` / `supabase test db` | ❌ W0 | ⬜ pending |
| ACT-01..05 | unit + pgTAP | `npm test -- src/data/queries/__tests__/activitySearch.test.ts` | ❌ W0 | ⬜ pending |
| ANL-05 | unit (typed catalogue) | `npm test -- src/services/analytics` | ✅ | ⬜ pending |

### Import extension (2026-09-25) — Validation Architecture (extension)

From 02-RESEARCH.md "Validation Architecture (extension)". Framework unchanged (Jest via jest-expo, fast-check / `@fast-check/jest`, pgTAP). Plan 02-33 adds `ofx`, `statement`, `transfer` and `accounts` to `jest.config.js`'s FULL (100%) list; `parseNotatedAmount` sits in `engine/money`, already FULL. A wrong sign, balance or pair moves real money the wrong way, so every module below is property-tested.

| Requirement | Module (plan) | Property tests (fast-check) | Example tests | Automated Command | File Exists | Status |
|-------------|---------------|-----------------------------|---------------|-------------------|-------------|--------|
| REC-09 | `statement/decodeText`, `statement/sniffFormat` (02-32) | any string -> UTF-8 (±BOM) -> decode = original; UTF-16LE/BE with BOM round-trip; any bytes -> never throws, length <= bytes | CP1252 0xA3 -> £, 0x80 -> €; invalid UTF-8 -> CP1252 fallback; OFX/CSV/unknown sniffing within 4 KB | `npm test -- src/engine/statement` | ❌ W0 | ⬜ pending |
| REC-09 | `ofx/tokenize`, `ofx/tree` (02-33) | generated statement model serialised as SGML unclosed / SGML closed / XML / single line / CRLF / random whitespace -> same tree; arbitrary strings up to 1 MB never throw; 200 KB adversarial dotless-tag input under 500 ms (ReDoS guard) | stray close -> warning; unclosed aggregate; bare & kept; CDATA; INTU.BID kept; 5 MB / 20k / depth-64 budgets | `npm test -- src/engine/ofx` | ❌ W0 | ⬜ pending |
| REC-09 / REC-14 | `ofx/date`, `ofx/amount`, `ofx/parse` (02-34) | valid date -> localDate = first 8 chars for every offset form; int a, exponent e, '.'/',' and zero padding -> magnitude a | [-5:EST], [+5.30:IST], [0:GMT], no offset, month 13 -> null; -12.5000 ok; -12.5001 too-many-decimals; multi-statement; CCSTMTRS; investment -> unsupported; fixture ACCTID never in output | `npm test -- src/engine/ofx` | ❌ W0 | ⬜ pending |
| REC-14 | `money/parseNotatedAmount` (02-32) | magnitude m under every renderer (leading/trailing minus, U+2212, en dash, parens, DR/CR prefix/suffix, currency symbol or code, western/Indian/space/apostrophe grouping, NBSP) -> (m, marker); marker sign reproduces the signed input | '-12.50 CR' conflicting-markers; '="12.50"'; '12.500' exp 2 -> 1250; Indian vs western grouping; parseAmount tests unchanged and green | `npm test -- src/engine/money` | ❌ W0 | ⬜ pending |
| REC-09 / REC-10 / REC-14 | `csv/inferFormat`, `csv/detectColumns`, `csv/mapRows` (02-02, 02-03) | rendered notation family recovered by inferNumberNotation; any amount rendered in any notation -> magnitude + marker, no issues | balance/direction/limit roles; summary lines removed into stated opening/closing; debit/credit -> dr/cr; direction column; raw strings <= 64 | `npm test -- src/engine/csv` | ❌ W0 | ⬜ pending |
| REC-13 | `statement/profile` (02-36) | generated ledger (opening any sign) rendered under random s, kind-fixed balance meaning and order -> inferProfile recovers s; the mirror (−s, −k) is never a candidate once kind is fixed (numRuns 500) | card over limit (issuer view, 1,250 owed vs 1,000); overdrawn current account; debit/credit columns; payment-row sign; one-row file; all-one-sign with no balance -> ambiguous; remembered profile that stops reconciling -> back to confirm | `npm test -- src/engine/statement` | ❌ W0 | ⬜ pending |
| REC-14 | `statement/convert` (02-35) | for any decided profile, Σ converted = closing − opening; available-credit differences equal held-view differences | card CR balance -> positive; available with and without a limit | `npm test -- src/engine/statement` | ❌ W0 | ⬜ pending |
| REC-15 | `statement/reconcile` (02-35) | consistent ledger (either orientation) all verified; perturb one amount -> exactly one link fails; delete one row -> one link fails; blank balances verify by segments; same-date shuffle -> verified-as-group; 5,000 rows near 1e13 exact (bigint); openings crossing zero both ways never flagged | ends-only mismatch -> every row cannot-verify; none-in-file; OFX LEDGERBAL with a stored opening (02-26) | `npm test -- src/engine/statement src/features/record/import` | ❌ W0 | ⬜ pending |
| REC-16 | `statement/duplicates` (02-04) | k identical file rows vs m similar stored rows -> exactly min(k, m) flagged; same-file rows never flag each other; order-independent | FITID across a date shift; conflicting FITIDs disable FITID for the file; same FITID different amount not a dup; CSV-then-OFX ±2 days only across formats (D-54) | `npm test -- src/engine/statement` | ❌ W0 | ⬜ pending |
| REC-16 / D-55 | `recurring/payMatch` (02-04) | — | pending Netflix + imported Netflix -> one match; window −3/+7 days; 10% amount; one-to-one | `npm test -- src/engine/recurring` | ❌ W0 | ⬜ pending |
| REC-17 | `accounts/standing` (02-37) | any balance and limit -> exactly one kind; beyondBy + limit = overdrawnBy; overBy + limit = owed; never throws | 0; −limit; −limit−1; limit null vs 0; card +15 (refund); card 0 -> owing-within 0; loan; cash -> plain | `npm test -- src/engine/accounts` | ❌ W0 | ⬜ pending |
| REC-17 | standing copy (02-24) | — | every Standing kind -> the UI-SPEC sentence, 'Nothing owing.' for a zero card, warn tone only for beyond/over | `npm test -- src/features/record/accounts` | ❌ W0 | ⬜ pending |
| REC-18 | `transfer/match`, `transfer/pair` (02-37) | every pair one-to-one, different accounts, opposite signs, |Δd| <= 3, same-currency amounts equal; output invariant under input permutation; linked rows never suggested | card payment 2 days later; two equal payments pair by closest date; cross-currency within 5% not at 6.5%; exact tie -> choose; payment-like orphan; pair build/edit rules | `npm test -- src/engine/transfer` | ❌ W0 | ⬜ pending |
| REC-18 | view maths (02-06) | adding any transfer pair leaves month income, spending, net and still-to-come unchanged | filter 'transfers'; per-account filter shows one leg | `npm test -- src/engine/activity` | ❌ W0 | ⬜ pending |
| REC-18 | `undo` (02-05) + import finalize (02-15) + transfers (02-40) | — | inverse(create pair) deletes both legs; inverseOfImport soft-deletes imported rows at post-link versions (2, not 1) and unlinks the stored leg; transfer edit/delete one step over both legs; bulk delete expands partner legs (02-16) | `npm test -- src/engine/undo src/data/mutations` | ❌ W0 | ⬜ pending |
| REC-13 / REC-15…18 | import pipeline + hook + screens (02-26, 02-39, 02-27) | buildPreview reproduces generated ledgers under any convention | ambiguous profile never committable; negative balances never lock or flag a row; the D-42 sentence exactly; four reconciliation states; limit offer; transfer and mark-paid cards; funnel properties are literals | `npm test -- src/features/record/import src/services/files` | ❌ W0 | ⬜ pending |
| ANL-05 (widened) | analytics catalogue (02-10) | — | import_committed carries format and reconciliation enums; `format: 'pdf'` and numeric size are type errors | `npm run typecheck && npm test -- src/services/analytics` | ✅ (extend) | ⬜ pending |
| REC-14 / REC-16 / REC-17 / REC-18 | pgTAP (02-07, 02-38, 02-09) | — | 31 import provenance (insert-only raw_*/external_id/import_format, 64/255 caps, FITID not unique); 32 accounts limits (nullable, >= 0, <= 1e13, negative opening balance accepted, kind change with a limit accepted); 33 transfer pairs (two-row insert ok; lone, third, same-account, same-sign, cross-household legs 23514; delete-both ok, delete-one 23514; each leg stamped in its own currency; RLS); 34 import_profiles (owner-only RLS, unique triple, cascade, 2 KB cap, account-in-household); 29 apply_patches links/unlinks a pair, marks a pending bill paid, sets a limit, rejects provenance keys; 30 balances include transfer legs | `npx supabase db reset --local && npx supabase test db` | ❌ W0 | ⬜ pending |
| Security (V7) | every new engine module + pipeline | — | no-leak tests: sensitive fixture strings ('TESCO STORES 3021', 'DR JONES PHARMACY', '1 234,56 OD at ACME LTD') never appear in any returned error, warning, issue list, analytics property or failed-write record; no `console.*` or content-bearing `throw` in engine/ofx, engine/statement, engine/transfer, engine/accounts | `npm test -- src/engine src/features/record/import` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/engine/recurring/__tests__/schedule.test.ts` — property tests for REC-05/06 (weekly, biweekly, monthly clamped, quarterly, yearly, month-end clamping)
- [ ] `src/engine/csv/__tests__/tokenize.test.ts`, `detectColumns.test.ts`, `inferFormat.test.ts` — property tests for REC-09/10
- [ ] `src/engine/categorize/__tests__/guessCategory.test.ts` — unit tests for keyword and learned-description rules
- [ ] `src/engine/undo/__tests__/computeInverse.test.ts` — inverse of every mutation kind
- [ ] pgTAP files (next free numbers) — RLS isolation for `categories`, `recurring_series`, `undo_log`; soft-delete read-path filtering
- [ ] `supabase/tests/fixtures/recurring-schedule-cases.json` — shared fixture proving TS and plpgsql schedule maths agree
- [ ] `jest.config.js` — add `recurring`, `csv`, `categorize`, `undo` to the 100% coverage bucket

### Wave 0 (extension)

- [ ] `src/engine/money/__tests__/parseNotatedAmount.test.ts` (02-32)
- [ ] `src/engine/statement/__tests__/{decodeText,sniffFormat,convert,reconcile,profile,duplicates}.test.ts` and the ledger fixture generator `src/engine/statement/__tests__/fixtures/ledgers.ts` (02-32, 02-35, 02-36, 02-04)
- [ ] `src/engine/ofx/__tests__/{tokenize,tree,date,amount,parse}.test.ts` (02-33, 02-34)
- [ ] `src/engine/transfer/__tests__/{match,pair}.test.ts`, `src/engine/accounts/__tests__/standing.test.ts` (02-37)
- [ ] `src/engine/recurring/__tests__/payMatch.test.ts` (02-04)
- [ ] pgTAP `31_transactions_import_provenance`, `32_accounts_limits` (02-07), `33_transfer_pairs`, `34_import_profiles` (02-38); extended 29/30 (02-09)
- [ ] Synthetic fixture set: bank SGML, card QFX with positive purchases, XML 2.x, multi-statement, card over limit (`src/engine/ofx/__tests__/fixtures/`, 02-34); newest-first CSV with end-of-day balances and an overdrawn current account (generated by the ledger fixture, 02-36); device fixtures `docs/acceptance/fixtures/overdrawn-current-account.csv` and `card-over-limit.ofx` (02-31). Only synthetic or scrubbed files are ever committed; the redacted real statements the user collects are added to the same folders when available.
- [ ] `jest.config.js` — add `ofx`, `statement`, `transfer`, `accounts` to the FULL list (02-33)

*No new framework install needed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| CSV file picked from device storage | REC-09 | Native document picker needs a real device or emulator | Dev build on Android emulator / iPhone XR: Import CSV, pick a bank export, confirm preview |
| Undo toast timing and haptics | REC-11 | Haptics and toast feel need a real device | Add a transaction, tap Undo on the toast, confirm the row disappears |
| Household conflict refusal on undo | REC-12 | Needs two signed-in household members | Member A edits, member B edits the same row, member A undoes; confirm the refusal copy |
| Statement import on a device: OFX pick, format step, overdrawn and over-limit standing, transfer link, one-step undo | REC-09, REC-13, REC-15, REC-17, REC-18 | Native picker, real rendering and the full queue need a device | 02-31 Task 2 steps 15-19 with the synthetic fixtures |
| `.ofx`/`.qfx` selectable in the iOS file picker | REC-09 | iOS may grey out files without a registered UTType (RESEARCH assumption E4); the '*/*' fallback needs a real iPhone | 02-31 Task 2 step 20 on the iPhone XR, or recorded pending until Apple enrolment clears |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 120s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-09-25 (plan checker: 0 blockers; TDD plans write their failing tests first, so Wave 0 test files land during execution). Extended the same day for the import extension (REC-13…REC-18, widened REC-09/ANL-05): every new requirement has an automated command above; the two device-only behaviours are in Manual-Only Verifications and 02-31. Re-check by the plan checker pending.
