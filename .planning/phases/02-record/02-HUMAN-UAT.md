---
status: carried
phase: 02-record
carried_to: "00-20 first iOS build on the iPhone XR (item 1); item 2 passed in the 02.2 walkthrough (2026-11-22 close-out)"
source: [02-VERIFICATION.md, docs/acceptance/phase-02-fx-on-demand.md]
started: 2026-10-09T00:00:00Z
updated: 2026-11-22T00:00:00Z
---

## Current Test

[closed 2026-11-22: item 2 passed; item 1 carried to plan 00-20]

## Tests

### 1. iOS statement file picker (walkthrough step 20, REC-09)
expected: On the iPhone XR development build, You → Money → Import statement → "Choose a statement file" opens the iOS document picker, a CSV is selected and parsed on device, and the review screen lists its lines.
result: [carried to plan 00-20 (first iOS build on the iPhone XR), which waits on Apple enrolment; the Android path was approved 2026-10-07]

### 2. Home-currency switch fetches today's rates (FX device step 7, MON-06)
expected: On a test account with lines in another currency, change the home currency to one with no rate stored for today. fx_rate_lookups gains rows for today for the new home currency and each currency in use, month totals convert, and no "Waiting for a rate" line remains after a refresh.
result: pass — checked on the Pixel 9 in the 02.2 walkthrough, criterion 8 (docs/acceptance/phase-02.2-record-polish.md): changing the home currency to EUR first failed with "Couldn't get today's rates", was fixed (261010-i7u) and rechecked

## Summary

total: 2
passed: 1
issues: 0
pending: 0
skipped: 0
blocked: 0
carried: 1

## Gaps
