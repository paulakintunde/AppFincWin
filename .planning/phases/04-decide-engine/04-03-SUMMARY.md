---
phase: 04-decide-engine
plan: 03
subsystem: engine/decide test fixtures
tags: [golden, parity, prototype, node-vm, fixtures]
requires: []
provides: [prototype-payoff.json, prototype-decide.json, generate-golden.mjs --check]
affects: [04-04, 04-11]
tech-stack:
  added: []
  patterns: [evaluate reference source text via node:vm instead of transcribing, generator with --check drift mode]
key-files:
  created:
    - scripts/decide-golden/generate-golden.mjs
    - scripts/decide-golden/scenarios.mjs
    - src/engine/payoff/__tests__/golden/prototype-payoff.json
    - src/engine/decide/__tests__/golden/prototype-decide.json
key-decisions:
  - "Card loan in the harness is named 'Revolver' because the prototype's dsecured() regex matches 'car' inside 'Card'"
  - "Floor set below investing in the month+inv and income scenarios so month and inv shortfalls are not equal (tie rule 6)"
requirements-completed: [DEC-01, DEC-02, DEC-03, DEC-04, DEC-06, DEC-07, DEC-08, DEC-09]
duration: ~20 min
completed: 2026-10-16
---

# Phase 4 Plan 03: Prototype golden fixtures Summary

Golden fixtures for D-22 parity are produced by slicing the prototype's own `dhh(){` to `dfits(price)` block out of `FincWin United.dc.html` and evaluating it unmodified with `node:vm`; only `items`, `dseries()` and `cvt()` are stubbed. `node scripts/decide-golden/generate-golden.mjs --check` regenerates in memory and fails on drift (CRLF-tolerant).

- Payoff fixture: 9 `dpmt`, 7 `dfv`, 6 `dSimMin` cases (zero-rate, zero-month, n=1, n=600, 29.99% APR).
- Decide fixture: 22 deviation-neutral scenarios covering cash, loan, card (full/months/minimum), instalment, household even/weight, invest lump/monthly, steady/variable/volatile income, day fees plus running costs. Outcomes confirmed: states fits/adjust/no/missing; warning codes month, cash, dsr, owe, inv each appear (dsr, owe, cash isolated alone; month+inv combined with distinct shortfalls).

## Deviations from Plan

- Prototype method block starts at line 4012 (plan said about 4057); markers are matched by text so this has no effect.
- [Rule 1 - Bug] Debt named "Card" would be classified secured by the prototype regex; renamed to "Revolver" in the harness.
- Two commits fixed the `--check` CRLF normalisation (git autocrlf on Windows rewrites the JSON on checkout); first attempt was syntactically broken via shell quoting and repaired in the next commit.
- eslint ignores `scripts/**` by config, so no lint run applies to the harness.

## Known Stubs

None.

## Commits

- 6196f3c feat(04-03): vm harness evaluating the prototype Decide methods
- 16d0297 feat(04-03): scenario matrix and golden fixtures
- e36b8b1 fix(04-03): --check tolerates CRLF checkouts (broken, superseded)
- 20419cd fix(04-03): repair --check CRLF normalisation

## Self-Check: PASSED
