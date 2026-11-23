---
phase: 07-insights
plan: 12
subsystem: quality-gate
tags: [gate, validation, compliance]
requires: [07-11]
provides: [phase-7 gate evidence, 07-VALIDATION sign-off]
affects: []
key-files:
  modified: [.planning/phases/07-insights/07-VALIDATION.md]
decisions: []
metrics:
  completed: 2026-11-23
---

# Phase 7 Plan 12: Phase gate Summary

Full local gate run once at the phase milestone: all green, no code fixes needed; VALIDATION signed off.

## Gate results

| Command | Result |
|---|---|
| `npm run typecheck` | pass |
| `npm run lint` | pass, 0 errors (1444 existing warnings) |
| `npm run depcruise` | pass, 1382 modules, no violations |
| `npm run check:icons` | pass (66 icons, 5 Lottie) |
| `npm run check:stryker-disables` | pass |
| `npm run test:coverage` | first run: 1091 suites passed, 9 failed (12 tests), 39542 tests passed. All 9 were timeout-only on this loaded machine. Rerun alone with `--testTimeout=120000`: 10 suites, 220 tests, all pass |
| Engine coverage | health, insights, grow, month all 100/100/100/100; no threshold warning in the full run |
| Migrations in phase diff vs origin/main | none |
| `jest.config.js` threshold diff | none lowered |

Timeout-only suites (passed on rerun): answerScreen, decide check stepper, payBills, tabsLayoutStable, headers, useStatementImport.closingBalance, coalesceDrafts, compareContainer, undoCapture.

Mutation run not run (deferred to pre-launch).

## Success criterion 5 / ACT-06

Already met in Phase 2.2 (moved there 2026-10-07; REQUIREMENTS.md marks ACT-06 Complete; evidence `.planning/phases/02.2-record-polish/02.2-VERIFICATION.md`, row "ACT-06 views (week, split, balance, calendar) SATISFIED"). Nothing built in Phase 7.

## Compliance note (S6)

No new table or data category; no migration; reads only through existing security-invoker RPCs (account_paid_before, account_balances, transaction_months) and RLS tables. Copy guard extended with an insights set (advice and grade/band words banned). The score is a declarative reading of the user's own figures ("Score N out of 100, from these figures"; "Not a rating"); short months capped at 74 by property test (Phase 11 criterion 12). No analytics event added; feature ids only. Scope pref under fincwin: (wiped on sign-out and deletion). Household views show shared money only (ARC-22 test in 07-07). Chart colour follows the owner's D-24 exception: theme and state colours at full strength only inside charts where colour carries meaning (money in green, money out orange, below-zero Left bars in the short colour, net-worth line in the theme colour) and the six chart-only chartPalette colours (each 3:1 on every ground, tested in contrast.test.ts) for category bars; colour is never the only signal (spoken labels, summary lines, legend words); non-chart text (change rows, tiles, notes) keeps the normal rule.

## Owner decisions D-24..D-30

Covered by the green suites (chartPalette contrast, score parts sum, 6M window, debt/saving note, <1% grouping, net-worth side labels) per the 07-VALIDATION map.

## Deferred

- Mutation run (pre-launch).
- Device checks: Pixel text-fit 320 dp / font scale 200%, TalkBack, Reduce Motion, score vs Decide same day.

## Known follow-ups (not fixed)

- Household "Money in" may omit salary tied to a pay series with no income kind on the line (app-wide; matches Home/Decide).
- A debt paid off later with no startedBalance shows its current balance in earlier months.
- Default level 4 for users with no setup row means they see the full Insights tab.
- Jest suites time out at the default timeout under full-run load (flaky, not real).

## Deviations from Plan

None. Plan executed as written; no source files changed.

## Self-Check: PASSED
