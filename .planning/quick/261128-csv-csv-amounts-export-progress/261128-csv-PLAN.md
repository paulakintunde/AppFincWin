---
phase: quick-261128-csv
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/engine/dataCsv/amount.ts
  - src/engine/dataCsv/exportRow.ts
  - src/engine/dataCsv/parse.ts
  - src/engine/dataCsv/schemas.ts
  - src/engine/dataCsv/index.ts
  - src/features/dataImport/DataImportScreen.tsx
  - src/features/dataImport/DataImportPreview.tsx
  - src/features/dataImport/templates.ts
  - src/features/export/csvExport.ts
  - src/features/export/ExportScreen.tsx
  - src/features/export/ExportProgressView.tsx
  - src/features/you/DeleteAccountScreen.tsx
  - src/features/security/LockSection.tsx
  - src/ui/ProgressBar.tsx
  - src/i18n/locales/system/ownData.ts
  - src/i18n/locales/system/security.ts
autonomous: true
requirements: [owner 2026-11-28 D-1 CSV amounts, owner 2026-11-28 D-2 separators, owner 2026-11-28 D-3 switcher line, owner 2026-11-28 D-4 export progress]
---

# Quick 261128-csv: CSV amounts as normal money, export folder first with progress, platform switcher line

Branch `fix/10-csv-amounts-export-progress` from `origin/main`. Decisions are cited in code as `10-review-2 (D-x)`.

## D-1 CSV amounts are normal money amounts (supersedes 10-review D-1 "whole minor units only")

- Export (and "Save a copy" on the delete-account screen, which calls the same `exportCsv`) writes the money columns of
  accounts, savings_goals, debts and holdings as normal amounts in the row's currency, canonical form: dot decimal, the
  currency's own decimals (ISO table plus the person's custom currencies), no grouping, hyphen minus. Other tables keep
  minor units as stored. The template uses the same `toExportRow`.
- **Marker:** a trailing `amount_format` column, value `decimal` on every row. Chosen over a header naming convention
  because it leaves every existing column name unchanged, survives Excel/Sheets round-trips (a spreadsheet that re-saves
  25.00 as 25 keeps the column), and the file stays plain CSV. `minor` is also understood. It is kept out of the schema
  `allowed` list (it is not a table column; the manifest guard test stays as is).
- **Import unit, once per file, never asked:** (a) the marker; (b) an older FincWin export: header has `id`,
  `household_id`, `created_at`, `updated_at` (export-only bookkeeping; the template and hand-made files never had them),
  no `amount_format` column, every row a UUID id, every amount a plain integer -> whole minor units; (c) otherwise normal
  amounts ("2500" is 2,500.00).
- Debts: `credit_limit` and `revolving` (exported since DD-03) join the debts schema; before this an exported debts.csv
  failed the import header check.

## D-2 Separator rules (owner update 2026-11-28; replaces the "ask once" prompt)

Pure engine code in `src/engine/dataCsv/amount.ts`, file context in `parse.ts`:
- Strip currency symbols/codes before or after, spaces/NBSP/apostrophes used as grouping. Parentheses or a leading or
  trailing minus mean negative.
- Both ',' and '.': the last is the decimal mark, the other grouping (groups of 3 checked).
- One kind more than once: grouping. One kind once with other than 3 digits after: decimal.
- One kind once with exactly 3 digits after ("1,234"): (1) the mark proven by the column, else the file; (2) currency
  exponent < 3 -> grouping; (3) device decimal mark (passed in from src/services/locale); (4) grouping plus a per-row
  non-blocking "Read as ..." note.
- More decimals than the currency allows -> per-row flag (zeros past the decimals are dropped exactly, never rounded).
- A value contradicting the column's (else file's) majority convention -> per-row flag on that row only; a tie goes to
  the device mark.
- A marked (Export) file defaults to the dot when nothing else proves a mark, so KWD 1.250 stays 1.25.
- Preview shows each row's formatted amount (so "1.234,56" EUR shows as EUR 1,234.56); per-row reasons are one short line;
  the longer explanation shows once above the rows. The old long `decimalAmount` string is removed.

## D-3 Security switcher line per platform

iOS: the JS AppCover always covers the snapshot (lock on or off), so the existing line stays. Android (10-30, amends
D-04): FLAG_SECURE only while the lock is on, so a new `switcherMetaAndroid` line, chosen in `SwitcherMetaLine`.

## D-4 Export: folder first, then progress

Android opens `Directory.pickDirectoryAsync()` (in `withExternalActivity`) on tap; a cancel reads nothing. Then a
determinate bar with "Gathering your records · 5 of 14" (one step per table, `onProgress` on `buildCsvFiles`), then
"Writing files", then the existing toast. Nothing is written until every table is read; a failed write removes what it
wrote. iOS shows the same progress, then the share sheet. The bar is `accessibilityRole="progressbar"` with
`accessibilityValue {min, max, now}` in steps and a spoken label. Same view on the delete screen's "Save a copy".

## Verify

Engine jest (dataCsv, 100% on amount.ts/exportRow.ts; fast-check round trip and table of owner examples for USD, EUR,
JPY, KWD on both device marks), app jest for export, dataImport, delete, security; tsc; eslint on changed files;
check:cache-version (no cached row shape changes).
