---
phase: 05-decide-ui
plan: 91
subsystem: engine
tags: [engine, decide, instalment, frequency, D-89, E3]
requires: [05-89]
provides:
  - instalment freq weekly | fortnightly | monthly | quarterly (default monthly) and firstPayment next_period (next_month kept as alias)
  - MAX_INSTALMENTS = 500 (UI input bound; the engine scores stored counts up to 600)
  - monthlyStepsOf(plan) for month-indexed consumers
  - CheckInputs.instalment.freq, parsed and passed to the engine
affects: [05-92, 05-103, 05-109]
key-files:
  modified:
    - src/engine/decide/types.ts
    - src/engine/decide/plan.ts
    - src/engine/decide/constants.ts
    - src/engine/decide/payback.ts
    - src/engine/decide/investmentViews.ts
    - src/features/decide/snapshot/types.ts
    - src/features/decide/snapshot/checkInputs.ts
    - src/features/decide/snapshot/__tests__/checkInputs.test.ts
    - src/features/decide/__tests__/engineBarrel.test.ts
  created:
    - src/engine/decide/__tests__/deviations/d89-instalment-frequency.test.ts
decisions:
  - "Plan.freq is set only when the check names a frequency, so a check with none yields exactly today's plan (golden parity); the snapshot always passes freq, so snapshot-built monthly plans carry freq 'monthly' and monthlyStepsOf returns their steps untouched"
  - "months = ceil(payments x 12 / periodsPerYear) for non-monthly; monthly keeps payments as its months"
  - "monthlyStepsOf gives each month 1..plan.months the monthly equivalent capped at what is left, the last month the remainder, so the total equals the instalments after day one"
  - "finalMonthly stays the final per-period payment (display figure)"
  - "impliedAnnualRate flat figure scales by periods per year instead of 12"
requirements: [DCU-31, DCU-17, DCU-29]
metrics:
  tasks: 2
  completed: 2026-10-23
---

# Phase 5 Plan 91: Engine E3b, instalment frequency Summary

An instalment can now fall weekly, every 2 weeks, monthly or quarterly. With a rate the payment comes from `amortise` / `amortiseDue` at 52 / 26 / 12 / 4 periods per year; `Plan.monthly` is the monthly equivalent of the level payment, rounded half-up once (M6). `paymentSteps` are indexed by payment period (documented on `PaymentStep`), and `monthlyStepsOf(plan)` turns them into month runs for the month-based consumers. The check inputs carry `instalment.freq` (default monthly) and `next_period` (a stored `next_month` parses to it).

## Tasks

| Task | Commit | Notes |
|------|--------|-------|
| 1. Engine: freq, next_period, MAX_INSTALMENTS, monthlyStepsOf | 1406f17b | tests named "D-89" in d89-instalment-frequency.test.ts, including the guard "month-indexed consumers read monthlyStepsOf" |
| 2. Inputs: freq and next_period through parse and toEngine | ba41fe5b | three "D-89" tests in checkInputs.test.ts |

## Verification

- `npx jest src/engine` (175 suites, 3395 tests) and engine/decide + engine/payoff global coverage threshold 100% on all four measures: pass (the only 0% rows are the type-only index/types files).
- Golden suites (decide and payoff) pass.
- Snapshot coverage threshold 100%: pass; `npx jest src/features/decide src/data/mutations`: 140 suites pass.
- `npm run typecheck` clean, `npm run depcruise` clean, eslint clean on all touched files.

## Deviations from Plan

**1. [Rule 3 - Blocking] payback.ts and investmentViews.ts now read monthlyStepsOf**
- Both are month-indexed consumers of `plan.paymentSteps` outside the plan's file list; leaving them would misread a weekly plan, and the guard test requires only plan.ts and cashPath.ts (05-92) to read `.paymentSteps`. Monthly plans are unaffected (monthlyStepsOf returns the same array).

**2. [Rule 3 - Blocking] engineBarrel.test.ts and the constants citation**
- `DECIDE_RUNTIME_EXPORTS` gained `MAX_INSTALMENTS` and `monthlyStepsOf`; the constants test needs a `// Cite:` line above `MAX_INSTALMENTS`.

**3. plan.test.ts not touched**: the D-89 cases live in the deviation test file; nothing in plan.test.ts needed changing.

## Notes for later plans

- Still reading `plan.paymentSteps` as months: `cashPath.ts` (05-92, allowlisted), and outside the engine `data/mutations/decideGoAhead.ts` and `features/decide/check/writtenLines.ts` (05-103). For a non-monthly plan they misread until moved; the UI cannot yet set a frequency, so nothing reaches them before 05-103.
- `next_month` stays in both unions until 05-109.

## Device items

05-EXECUTION-NOTES "05-26 device checklist additions (Decide UX refresh)", entry 05-91: engine and inputs only; nothing visible until 05-103.

## Known Stubs

None.

## Self-Check: PASSED
