---
phase: 10-system
plan: 28
subsystem: record/import
tags: [import, wallets, IMP-06, D-24, D-34]
requires: [10-01, 10-08, 10-26]
provides:
  - walletMarks / WalletMarks (duplicate check + category guess for wallet files, D-34)
  - scripts/ops/strip-wallet-export.mjs (personal-data stripper, D-24)
affects: [10-28 remaining work: real fixtures and reader constants]
key-files:
  created:
    - scripts/ops/strip-wallet-export.mjs
    - scripts/ops/strip-wallet-export.test.mjs
  modified:
    - src/features/record/import/walletModel.ts
    - src/features/record/import/useStatementImport.ts
    - src/features/record/import/WalletReview.tsx
    - src/features/record/import/ImportScreen.tsx
    - src/i18n/locales/system/ownData.ts
    - src/features/record/import/__tests__/{walletModel,walletImport,useStatementImport.wallet,useStatementImport,ImportScreen}.test.*
requirements: [IMP-06]
metrics:
  completed: 2026-11-25
  status: COMPLETE (owner 2026-11-26) - D-34 and stripper done; no real exports, readers stay on synthetic coverage, real-file check open
---

# Phase 10 Plan 28: Wallet real-layout finalisation Summary (partial)

Wallet imports now use the statement import's own duplicate check and category guess (D-34), the pick step no longer needs an account before a wallet file, and the personal-data stripper is built and tested. The real-export work (Task 1 fixtures, Task 2 reader constants and fixture tests) is not done: the owner's files are not available.

## Commits
- 626e0830 feat(10-28): wallet imports use the statement duplicate check and category guess (D-34)
- ce67e56f feat(10-28): wallet export stripper for committing real fixtures (D-24)

## What was built
- **D-34 duplicates and categories (no new matcher):** `walletMarks` calls the existing `findDuplicates` (per account, over settled stored rows, source format csv, so FITID-style `external_id` matches work) and `guessCategory` (personal and shared rules, learned names, keyword defaults). A fee is a duplicate when its payment is, or when a stored "<Wallet> fee" expense with the same date and amount exists (counted per stored copy). `useStatementImport` runs it in an effect once the accounts are known (reads stored rows per linked account, with the same cached-month fallback as statements); the Import pill is disabled until it finishes, and `commitWallet` refuses before then. `buildWalletCommit` skips duplicate lines and fees and sets `category_id` from the guess. The plan has `duplicateCount`, counts exclude duplicates; WalletReview shows "Already imported, skipped" per line and a skipped-count note.
- **PickStep:** "Choose a file" is no longer disabled without an account. A wallet file reads and goes to its own preview; any other file picked with no account returns to the pick step with the existing "Choose or add an account first." note (`needAccount`).
- **Stripper (D-24):** `node scripts/ops/strip-wallet-export.mjs <in> <out> --wallet paypal|wise|revolut`. Replaces name/email/iban/card/reference-type columns with stand-ins, hashes id columns (sha256, 16 chars), scrubs emails/IBANs/13-19 digit numbers/phones in other cells, keeps header, dates, amounts and fee columns, deterministic, and fails (writing nothing) if the git user name or email survives. `--no-owner-check` exists only for the test.

## Tests run (quick checks; no full suite)
- `node --test scripts/ops/strip-wallet-export.test.mjs`: 4 pass.
- `src/features/record/import` + `src/i18n` whole run: 46 suites pass; 3 tests failed and were updated for the new pick behaviour (ImportScreen x2, useStatementImport x1); those three suites plus walletModel re-run: 218 pass.
- New tests: re-importing the same wallet fixture adds nothing and calls no commit; a "Tesco Stores" line gets the Groceries category; a wallet file can be picked with no account while a plain CSV asks for one; walletMarks unit tests (duplicate line + fee, fee-only copy count, guessed category, no-account currency); preview shows the skipped state and the pill waits for the check.
- `npx tsc --noEmit`: clean.

## Not done, needs the owner
- **Real exports are not in the repo.** `C:/dev/fincwin-private/wallet-exports/` does not exist on this machine (no paypal.csv, wise*.csv, revolut.csv found). Task 1 (stripped fixtures) and Task 2 (reader constants, fixtures.test.ts, 100% wallets branch coverage on real layouts, per-currency gross-fee=net and balance checks) are therefore not started; no data was invented. Wallets stay on the 10-08 synthetic coverage. Needed: the three files (or a path), then run the stripper on each into `src/engine/statement/__tests__/fixtures/wallets/` and finish Task 2.

## Deviations from Plan
1. **[Rule 4-adjacent, scope] Tasks 1 (fixtures) and 2 not executed** because their inputs are absent (see above). The stripper part of Task 1 is complete.
2. **[Rule 1 - Bug] Updated three existing tests** that asserted the old "button disabled until an account" behaviour; this is the 10-26 follow-up the amendment asks for.
3. Extra copy keys `walletImport.alreadyImported` and `duplicatesSkipped` (draft wording, for sign-off).
4. No per-row category chooser in the wallet preview: categories are guessed and applied at commit, as the amendment asks; showing or editing them is not built.
5. Commit trailer is Claude Sonnet 5.5, as the attribution reminder specifies.

## Known Stubs
None.

## Self-Check: PASSED (commits 626e0830, ce67e56f present; scripts/ops/strip-wallet-export.mjs and .test.mjs exist; STATE.md and ROADMAP.md untouched)
