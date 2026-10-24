---
phase: 05-decide-ui
plan: 33
subsystem: data
tags: [fx, read-side, bigint, tdd]
requires: []
provides: [resolvePerEur, convertLatest, basisRateText, displayRate, earlierDate]
affects: [src/data/mutations/provisional.ts]
key-files:
  created: [src/data/queries/fxConvert.ts, src/data/queries/__tests__/fxConvert.test.ts]
  modified: [src/data/mutations/provisional.ts]
requirements-completed: [DCU-01, DCU-03, DCU-23]
completed: 2026-10-16
---

# Phase 5 Plan 33: fxConvert Summary

Read-side custom-currency-aware FX resolver (moved from Record's provisional stamp) plus latest-stored-rate conversion that returns null on any gap, and bigint-only basis-rate display text.

## Commits
- test: failing fx read-side tests
- 25a62ec feat: read-side fx conversion

## Deviations from Plan
- [Rule 1] `resolvePerEur` moved with one change: `customPerEur` throws RangeError when the rate rounds to zero, so the verbatim `rate <= 0n` check was dead code and the spec'd "rounds to 0 gives null" failed. It now catches the throw and returns null. Provisional behaviour is unchanged (it previously caught the throw into the pending stamp; same result, all provisional tests green).
- `findCustom` is also exported and imported by provisional.ts (still needed there for exponents).
- Header wording avoids the literal "fxResolve" so the acceptance grep returns 0.

## Verification
fxConvert + queries + provisional jest: 128 pass; fxConvert.ts 100% branch coverage; typecheck, depcruise clean; lint 0 errors.

## Self-Check: PASSED
