---
phase: 10-system
plan: 08
subsystem: engine/statement
tags: [import, wallets, paypal, wise, revolut, tdd]
requires: []
provides:
  - detectWallet, readWallet, walletToDrafts (engine/statement/wallets)
affects: [10-26 import UI, 10-28 real-fixture finalisation]
tech-stack:
  added: []
  patterns: [header-signature detection ahead of generic CSV import, per-wallet date-format constant]
key-files:
  created:
    - src/engine/statement/wallets/types.ts
    - src/engine/statement/wallets/common.ts
    - src/engine/statement/wallets/detect.ts
    - src/engine/statement/wallets/paypal.ts
    - src/engine/statement/wallets/wise.ts
    - src/engine/statement/wallets/revolut.ts
    - src/engine/statement/wallets/toDrafts.ts
    - src/engine/statement/wallets/index.ts
    - src/engine/statement/__tests__/wallets/ (detect, readers, toDrafts tests, synthetic.ts)
  modified:
    - src/engine/statement/index.ts
decisions:
  - "A wallet row with an unreadable amount, fee, date or currency fails the whole read as 'unreadable' rather than silently dropping money."
  - "DraftRow.index equals WalletLine.index (file data-row position) so fee lines and transfer pairs point at draft rows directly."
  - "Only a clean two-line, two-currency conversion group becomes a transfer pair; anything else stays plain payments."
requirements: [IMP-06]
metrics:
  completed: 2026-11-22
---

# Phase 10 Plan 08: Wallet statement readers Summary

Pure-engine PayPal, Wise and Revolut CSV readers on synthetic rows: header detection, signed gross/fee/net lines, one draft per currency, separate fee lines and linked conversion pairs, so each currency balance moves by exactly the net.

## Commits
- c6dfce2a test(10-08): failing tests (RED)
- b5ce4c0c feat(10-08): implement readers (GREEN)

## Tests
- Wallet tests: 38 passed; coverage of `src/engine/statement/wallets` 100% statements, branches, functions and lines.
- Existing statement tests: 10 suites, 330 passed.
- Property test: per currency sum(gross) - sum(fees) === sum(net).
- Sentinel test: payer/payee name, email, account number, card digits absent from every output.
- No `parseFloat`, `toFixed`, `Math.round` in wallets/.
- `tsc --noEmit` was not run (machine heavily loaded; ts-jest compiled all files).

## Deviations from Plan
- Added `src/engine/statement/wallets/common.ts` (shared money, date and row-loop helpers) which is not in the plan's file list; keeps the three readers small.
- `readWallet` lives in `detect.ts` rather than `index.ts` (index stays a barrel).
- Rows are read assuming `tokenize` pads short rows (it does), so no ragged-row branch exists.
- Money parsing assumes en-US separators ('.' decimal, ',' grouping) for all wallets; localized PayPal exports are a 10-28 item.

## Assumptions to confirm in 10-28 (D-24)
Date formats (Wise dd-MM-yyyy, Revolut YYYY-MM-DD, PayPal MM/DD/YYYY: one constant each, `WISE_DATE`, `REVOLUT_DATE`, `PAYPAL_DATE`); PayPal Gross/Fee sign convention (fee taken as magnitude); Wise Amount treated as gross with `Total fees` separate; Revolut exchange pair keyed on identical Completed Date; PayPal conversion pair keyed on Reference Txn ID; Wise conversion pair keyed on TransferWise ID.

## Known Stubs
None. DraftRow `rawAmount`/`rawBalance` are null by design (wallet lines are already parsed to integers).

## Self-Check: PASSED
