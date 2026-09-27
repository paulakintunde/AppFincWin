---
status: partial
phase: 01-money-core
source: [01-VERIFICATION.md]
started: 2026-09-26T00:00:00Z
updated: 2026-09-26T00:00:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Region-derived separators on a physical device (WR-A11)
expected: With the device language set to English and the region set to Germany, typing and displaying amounts uses the region's separators ("1.234,56"), and parseAmount/formatAmount read and write them correctly.
result: [pending]

### 2. Rate attribution next to every converted amount (MON-07)
expected: When Phase 2 (Record) ships a screen that shows a converted amount, RateAttribution (or an equivalent) is mounted next to it, showing the rate's own publication date.
result: [pending — nothing renders a converted amount until Phase 2]

### 3. FX hold-drop restamp heuristic and ISO 4217 withdrawn-code list (WR-B05/WR-B06)
expected: A product review confirms the row-selection rule in fx_drop_hold / fx_restamp_by_rate and the static withdrawn-code list in is_iso4217_code. Both are implemented and covered by pgTAP; this review is of their content.
result: [pending]

## Summary

total: 3
passed: 0
issues: 0
pending: 3
skipped: 0
blocked: 0

## Gaps
