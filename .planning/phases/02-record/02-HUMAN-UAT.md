---
status: partial
phase: 02-record
source: [02-VERIFICATION.md, docs/acceptance/phase-02-fx-on-demand.md]
started: 2026-10-09T00:00:00Z
updated: 2026-10-09T00:00:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. iOS statement file picker (walkthrough step 20, REC-09)
expected: On the iPhone XR development build, You → Money → Import statement → "Choose a statement file" opens the iOS document picker, a CSV is selected and parsed on device, and the review screen lists its lines.
result: [pending — blocked on Apple Developer enrolment; the Android path was approved 2026-10-07]

### 2. Home-currency switch fetches today's rates (FX device step 7, MON-06)
expected: On a test account with lines in another currency, change the home currency to one with no rate stored for today. fx_rate_lookups gains rows for today for the new home currency and each currency in use, month totals convert, and no "Waiting for a rate" line remains after a refresh.
result: [pending — no home-currency setting screen exists yet; the logic is covered by the 02-49 Jest tests]

## Summary

total: 2
passed: 0
issues: 0
pending: 2
skipped: 0
blocked: 1

## Gaps
