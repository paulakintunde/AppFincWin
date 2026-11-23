---
phase: 10-system
plan: 07
subsystem: engine
tags: [csv, import, engine, DAT-03]
requires: []
provides:
  - parseDataCsv, classifyRows, unescapeCell, DATA_CSV_SCHEMAS (src/engine/dataCsv)
affects: [10-18]
tech-stack:
  added: []
  patterns: [tokenize-based parsing, integer minor units, export-column template]
key-files:
  created:
    - src/engine/dataCsv/schemas.ts
    - src/engine/dataCsv/parse.ts
    - src/engine/dataCsv/index.ts
    - src/engine/dataCsv/__tests__/parse.test.ts
    - src/engine/dataCsv/__tests__/roundTrip.test.ts
    - src/data/__tests__/dataCsvColumns.test.ts
key-decisions:
  - "Money cells: plain integer = minor units (as exported); decimal mark = major units checked against the currency exponent; never parseFloat"
  - "A blank currency is flagged currency-missing and the exponent callback is called with an empty string"
requirements-completed: [DAT-03]
duration: long (jest slow under watchman)
completed: 2026-11-22
---

# Phase 10 Plan 07: Data CSV import parsing Summary

Pure CSV import parsing for accounts, goals, debts and holdings that mirrors export columns, reads money as integer minor units and reverses the export's injection apostrophe.

## Commits
- 9fa20e1e test(10-07): failing tests (RED; both engine suites failed on the missing parse module)
- d3c25dfc feat(10-07): parse.ts (GREEN)

## Verification
- `npx jest -c jest.engine.config.js src/engine/dataCsv`: 2 suites, 21 tests pass. Branch coverage of src/engine/dataCsv: 95.78% (parse.ts), statements 99.17%, lines 100%, functions 100%.
- Enum lists taken from migration CHECK constraints (accounts.kind, debts.kind, holdings.type, goals kind/bucket). Acceptance greps: no parseFloat; tokenize( used.
- Data guard test (src/data/__tests__/dataCsvColumns.test.ts) passes with the engine suites: 3 suites, 29 tests. First run failed because the shared bookkeeping list named columns absent from some tables; fixed by listing ignored columns per table (Rule 1).
- tsc and lint were not run (milestone rule; jest ran slowly here).

## Deviations from Plan
None of substance. Round-trip property test covers the goals table (names with commas, quotes, newlines, leading = + - @, unicode; negative integer minor units); the other tables share the same code path.

## Known Stubs
None.

## Notes
The `.gitattributes` autocrlf warning on commit is cosmetic.

## Self-Check: PASSED
