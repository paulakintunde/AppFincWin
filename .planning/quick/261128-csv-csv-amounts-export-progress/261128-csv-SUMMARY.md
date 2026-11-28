---
phase: quick-261128-csv
plan: 01
status: complete
date: 2026-11-28
---

# Quick 261128-csv summary

Owner decisions 2026-11-28, cited in code as `10-review-2 (D-1..D-4)`. **D-1 supersedes 10-review D-1** (CSV amounts as
whole minor units only).

## What changed

- **D-1 amounts:** Export, "Save a copy" (delete-account screen) and the import template write the money columns of
  accounts, savings_goals, debts and holdings as normal amounts in the row's currency (USD 25.00, JPY 2500, KWD 1.250;
  custom currencies use their own decimals), plus a trailing `amount_format` = `decimal` column. Other tables keep minor
  units. Import decides the unit once per file without asking: marker; else an older FincWin export (UUID ids +
  household_id/created_at/updated_at header + plain integers) reads as minor units; else normal amounts. Debts schema gains
  `credit_limit` and `revolving` (an exported debts.csv failed the header check before).
- **D-2 separators:** `src/engine/dataCsv/amount.ts` reads "5,69", "1.234,56", "1 234,56", "1'234.50", "$1,234.56",
  "(25.00)", "25.00-", codes and symbols either side. "1,234" is settled by the column's (else the file's) proven mark,
  then the currency's decimals, then the device's decimal mark, else grouping with a non-blocking "Read as ..." note.
  Contradicting rows and extra decimals are flagged per row; zeros past a currency's decimals are dropped exactly
  ("2500.00" JPY is 2500), any other extra digit is flagged, never rounded.
- **Copy:** the long `decimalAmount` line is gone. Per-row: "More decimals than {{currency}} has", "Written unlike the
  other amounts", "Read as {{amount}}". Once above the rows: "Rows marked Check have an amount to fix in the file. Fix it,
  then choose the file again." and, for an older export, "This is an older FincWin export, so amounts are read in the
  smallest unit, such as cents." Intro ends "Write amounts like 25.00."
- **D-3:** Android shows "With the lock on, FincWin shows a blank card in the app switcher and blocks screenshots." iOS
  keeps "FincWin always shows a plain screen in the app switcher, even with the lock off."
- **D-4:** Android picks the folder first (cancel reads nothing), then a progress bar "Gathering your records · 5 of 14",
  "Writing files", then the saved toast. Nothing written until all tables are read; a failed write removes what it wrote.
  iOS: progress, then the share sheet. Same view on "Save a copy".

## Verification

Engine dataCsv suites (amount.ts and exportRow.ts 100%; owner example table for USD/EUR/JPY/KWD on both device marks;
fast-check export->import identity), app suites for export, dataImport, delete account, security, i18n copy; tsc;
eslint (warnings only, existing fast-check pattern); check:cache-version unchanged (19).
