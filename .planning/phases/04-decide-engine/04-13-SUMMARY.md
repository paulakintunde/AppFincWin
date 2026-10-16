---
phase: 04-decide-engine
plan: 13
subsystem: engine/decide
tags: [deriveMoney, steadiness, cv, refunds, smoothing, pay-smoothing, one-offs]
requires: [04-05]
provides: [resolveSpendingShare, shareForCategory, summariseMonth, deriveMoney]
affects: [04-07, 04-15, 04-17]
key-files:
  created:
    - src/engine/decide/money.ts
    - src/engine/decide/__tests__/money.test.ts
    - src/engine/decide/__tests__/deviations/d23-series-smoothing.test.ts
    - src/engine/decide/__tests__/deviations/d27-refunds-net-spending.test.ts
    - src/engine/decide/__tests__/deviations/d47-one-off-lines.test.ts
    - src/engine/decide/__tests__/deviations/d60-pay-smoothing.test.ts
key-decisions:
  - "Steadiness compares CV with exact bigint arithmetic (diff*H^2 < T^2*S^2), no square root; incomeCvPercent uses a private bigint isqrt"
  - "D-60 pay smoothing applies only in months the series spans in full (paySpansMonth, checker W2); a month with no paid line of the series gets nothing added"
  - "Refund-only categories net negative and the month total is floored at 0 before smoothed bills are added"
requirements-completed: [DEC-07, DEC-08, DEC-23, DEC-33, DEC-37]
completed: 2026-10-16
---

# Phase 4 Plan 13: deriveMoney Summary

deriveMoney (prototype `dmoney`) over Record lines: paid-only months, refunds netted and floored, transfers and one-offs left out and counted, confirmed non-monthly bills and weekly/fortnightly pay smoothed, D-34 household shares, and exact bigint CV steadiness over the last 6 full months.

## Tasks

| Task | Commit | Notes |
| ---- | ------ | ----- |
| Tests (month summary, deriveMoney, D-23/D-27/D-47/D-60 named deviation files) | 1dd6ded | Written together with the implementation, committed first |
| money.ts | b1dce82 | resolveSpendingShare, shareForCategory, summariseMonth, deriveMoney |

## Verification

- `npx jest src/engine/decide --coverage`: 13 suites, 208 tests pass; money.ts 100% statements, branches, functions and lines.
- `npx eslint` on touched files: clean. `npm run depcruise`: no violations. `npm run check:ignores`: OK.
- `npx tsc --noEmit`: only the known pre-existing `expo-blur` error in `src/shell/tabBar/TabBar.tsx`.
- Named checks: CV boundaries at exactly 0.06 and 0.22 land in the upper class; fortnightly fixture gives variable/CV 17 unsmoothed and steady/CV 0 smoothed; PARTIAL_START gives January 200_000, average 394_444, CV 22, volatile.

## Deviations from Plan

- TDD ordering: tests and implementation were written together, then committed as test (1dd6ded) then feat (b1dce82). The test commit alone has no passing implementation behind it, but a separate observed RED run was not performed. No separate refactor commit.
- Quarterly conversion in money.test.ts uses 1_000 (333) rather than 30_000 (10_000); the plan's 10_000 case is covered by the yearly 120_000 case.
- Files were formatted with explicit prettier options (single quotes, width 120, es5 commas) on touched files only.

## Known Stubs

None.

## Self-Check: PASSED
