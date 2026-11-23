---
phase: 10-system
plan: 26
subsystem: record/import
tags: [import, wallets, paypal, wise, revolut, IMP-06, D-21, D-22, D-23]
requires: [10-04, 10-08, 10-13]
provides:
  - walletPlan, walletItems, buildWalletCommit (src/features/record/import/walletModel.ts)
  - WalletReview, WalletAccountsCard (wallet preview inside ReviewStep)
  - ImportCommitInput.walletFees / walletPairs (importFinalize)
affects: [10-28 real-fixture finalisation]
key-files:
  created:
    - src/features/record/import/walletModel.ts
    - src/features/record/import/WalletAccountsCard.tsx
    - src/features/record/import/WalletReview.tsx
    - src/features/record/import/__tests__/walletModel.test.ts
    - src/features/record/import/__tests__/walletImport.test.tsx
    - src/features/record/import/__tests__/useStatementImport.wallet.test.tsx
    - src/data/mutations/__tests__/importFinalize.wallet.test.ts
  modified:
    - src/features/record/import/importPipeline.ts
    - src/features/record/import/useStatementImport.ts
    - src/features/record/import/ReviewStep.tsx
    - src/features/record/import/__tests__/importPipeline.test.ts
    - src/data/mutations/importFinalize.ts
    - src/i18n/locales/system/ownData.ts
decisions:
  - "A wallet file stays in the import machine's 'review' stage (wallet state beside the generic preview), so ImportScreen, back/cancel and the done step are unchanged."
  - "Conversion legs are inserted already sharing a transfer_id and the Transfer category (the orphan-transfer precedent), not linked afterwards by patch: both legs are in the one undo step at version 1, so one undo removes both with no pair-trigger risk."
  - "Fee rows are linked with fx_fee_of to the payment row. fx_fee_of has no foreign key and no constraint on what it points at (20261011000300_statement_conversions.sql: insert-only uuid, only 'not self'), so payment fees and conversion fees both use it; no fallback was needed."
requirements: [IMP-06]
metrics:
  completed: 2026-11-23
---

# Phase 10 Plan 26: Wallet import in the statement flow Summary

PayPal, Wise and Revolut CSVs now open their own preview: one account per currency (offered, never created without a tap), payments at gross, each fee its own linked expense in the person's Fees category, and each conversion saved as a linked transfer, all in one undoable commit.

## Commits
- 1bf77e77 feat(10-26): commit wallet fee expenses and conversion transfers in one undo step (Task 3)
- 0e37cc05 feat(10-26): detect wallet files and plan accounts, fees and conversions per currency (Task 1)
- a91b1966 feat(10-26): wallet preview with new-accounts card, fee rows and conversion rows (Task 2)

## What was built
- **Detection (D-21):** `prepareCsv` runs `readWallet(text)`; a match adds `csv.wallet` (drafts, or an error), and the generic column reading is kept so "Match columns" can hand the file to the existing mapper. Anything else is untouched. `missing-column` shows the warning; `unreadable` rejects as unreadable; a wallet read with no lines rejects as no_rows. OFX/PDF paths unchanged.
- **walletModel (pure):** `walletPlan` (one target per currency; suggests an existing account only when exactly one non-archived account in that currency carries the wallet name; else createName "Wise EUR", `create` false), held-back line indexes, counts. `walletItems` builds the preview list (linked conversion as one item with its fee, fee under payment, held-back flags, unlink/relink). `buildWalletCommit` builds rows at gross, fee expenses ('<Wallet> fee', category Fees) and pairs; a pair is only formed when both legs are imported, on different accounts, out then in, a Transfer category exists and the person has not unlinked it, so the DB pair rule can never reject the commit.
- **Preview (UI-SPEC 8):** reader chip with connected glyph; WalletAccountsCard with the owner-exact title (names arrive quoted via the `names` param), a switch per currency starting off, "Use an existing account" Dropdown (only shown when an account in that currency exists), "Create selected accounts" disabled until a switch is on, "Skip these lines"; held-back lines with "Not imported: no account yet" and "Choose" (turns that currency's switch on); fee rows with the connected glyph; conversion row with the transfer glyph and its fee beneath; meta line; summary; pinned "Import {n} lines"; missing-column WarningCard (soft tone) with "Match columns". `useAddAccount` is called only inside the Create handler.
- **Commit:** `useStatementImport.commitWallet` refuses a currency switched on but not yet created, finds the person's own 'Fees' category (case-insensitive, non-system) or creates it on first use (slate), counts rows + fees (+1 for a new category) against `useQueueGuard().canAdd` before any mutation or category creation (D-27/D-28, 'queueFull' shown with QueueNote), then calls `useImportCommit`. `importFinalize` takes `walletFees` (inserted with `fx_fee_of = forRowId`) and `walletPairs` (shared transfer_id + Transfer category), refuses a pair with no Transfer category before enqueueing, and everything joins the one "Imported N lines" undo step.

## Tests run (quick checks, milestone rule)
- `walletModel.test.ts` 16 pass; `walletImport.test.tsx` 7 pass; `useStatementImport.wallet.test.tsx` 6 pass; `importFinalize.wallet.test.ts` 5 pass; `importFinalize.test.tsx` 20 pass (unchanged behaviour).
- `src/features/record/import` whole directory plus `src/i18n`: all suites pass after one fix (see deviations); the four suites that failed on first run (importLife, ImportScreen, ReviewStep.issues, walletImport) were re-run and pass (135 tests).
- `tsc --noEmit`: clean apart from the known expo-local-authentication error (final re-run recorded below).
- eslint on touched files: 0 errors; the remaining warnings are pre-existing (`payMatchRows` hook deps).

## Deviations from Plan
1. **[Rule 1 - Bug] ReviewStep delegation guard** treated an undefined `state.wallet` (older test state stubs) as non-null and rendered the wallet view. Guard is now `(state.wallet ?? null) !== null`.
2. **Extra files:** `WalletReview.tsx` (new, keeps ReviewStep small) and `useStatementImport.wallet.test.tsx` (hook-level proof of D-22/D-27/Fees category); neither is in files_modified.
3. **Extra copy keys** in `system.ownData.walletImport`: `and`, `unlink`, `relink` (needed for the joined title words and the "unlink it" requirement). Draft wording, for the sign-off.
4. **walletFees.forRowId is `string | null`** (plan said string): a fee-only wallet line has no payment row to point at, so its fee is inserted unlinked.
5. **walletPairs implemented as inline transfer_id on insert**, not as finalize patch links (reason in Decisions). The plan's key_link text "pair links to the finalize patch list" is satisfied in effect (one atomic undo step) but not literally.
6. **Wallet commit skips** duplicate detection, category guessing, recurring suggestions, statement-period recording and the closing-balance/limit offers: the wallet drafts carry no reconcile data, and the plan scoped wallet drafts to accounts/fees/conversions. Lines import uncategorised. Worth a decision before 10-28.
7. Commit trailer is `Co-Authored-By: Claude Sonnet 5.5` (the model that ran), not the Opus line named in the brief.

## Known limitations / for the orchestrator and owner
- **Pick step still wants an account first.** `PickStep` disables "Choose a file" until an account is picked, even though a wallet file ignores it (it is only used if the person falls back to "Match columns"). Not changed to avoid touching the generic entry; a small follow-up in 10-28.
- The Fees category and each created account write their own undo steps and toasts-free entries (separate from the import's step), so undoing the import does not remove them.
- Created accounts are 'checking' with opening balance 0. The wallet's own running balance is not used to set an opening balance.
- Column formats remain synthetic (10-08 assumptions; real-file confirmation is 10-28).
- No installs, migrations or pgTAP are needed. No change to STATE.md or ROADMAP.md.

## Known Stubs
None.

## Self-Check: PASSED (files exist; commits 1bf77e77, 0e37cc05, a91b1966 present)
