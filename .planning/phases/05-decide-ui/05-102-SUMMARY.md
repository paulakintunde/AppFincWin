---
phase: 05-decide-ui
plan: 102
subsystem: copy
tags: [copy, decide, instalment, apr, D-89, D-90, R16.16-M6]
requires: [05-88, 05-90, 05-91]
provides:
  - CheckComputation.impliedApr, solved in computeDetails (settled path) only
  - instalmentNotes and methodSummary worded from the one M6 table (frequency x rate x timing)
affects: [05-103, 05-109]
key-files:
  modified:
    - src/features/decide/snapshot/types.ts
    - src/features/decide/snapshot/computeCheck.ts
    - src/features/decide/snapshot/__tests__/computeCheck.test.ts
    - src/features/decide/copy/instalmentCopy.ts
    - src/features/decide/copy/methodCardCopy.ts
    - src/features/decide/copy/__tests__/instalmentCopy.test.ts
    - src/features/decide/copy/__tests__/methodCardCopy.test.ts
    - src/features/decide/check/steps/step2/MethodPanels.tsx
    - src/features/decide/check/steps/__tests__/step2Instalment.test.tsx
    - src/features/decide/check/steps/__tests__/Step2PriceAndPay.test.tsx
decisions:
  - "impliedApr is solved before computeDetails' verdict-missing early return, from methodPlans.instalment: a resolved no-rate plan gives financed (plan.financed), the typed payment and count, the frequency's periods per year, and 'due' for a first payment today, else 'ordinary'"
  - "The no-rate note is two CopyRefs: the frequency lead and one clause (instRateAbout with impliedAprDisplay, instRateZero for apr 0, instRateAbove, or none when the settled figure has not arrived or for one payment on the day)"
  - "A total below the amount financed (plan null) keeps the D-49 instalmentBelowPrice note, which needs no monthly figure; instRateBelow from 05-88 stays unused"
  - "The rated note's payment is the typed quote, else the worked-out payment, else the monthly equivalent; {when} is passed as a keyParam (decide.pay.when.today / .{freq})"
  - "The folded summary drops the old summaryInstalment* keys for instSummary.{freq} + instSummaryNoRate / instSummaryRate / instSummaryFirst; an invalid typed rate leaves the rate part out, as before"
metrics:
  tasks: 2
  completed: 2026-10-23
---

# Phase 5 Plan 102: M6 instalment copy and the true APR Summary

Instalment notes and folded summaries now follow the R16.16 M6 table, and a no-rate plan shows the true nominal APR from `impliedApr`, computed on the settled path only and labelled "worked out from the figures you typed". The solved rate never fills the rate field and never reaches the verdict.

## Tasks

| Task | Commit | Notes |
|------|--------|-------|
| 1. impliedApr on the settled path | 7d1b9a11 | `CheckComputation.impliedApr`; computeCore never calls the solver (spy on `@/engine/payoff/impliedApr`); 7 "D-90" tests; snapshot coverage 100% |
| 2. M6 copy table | 73cced4d | `instalmentNotes` takes the solved rate as an optional sixth argument; 4 frequencies x 2 rate modes x 2 timings table test; summaries name the frequency |

## Verification

- Snapshot coverage command (100% statements, branches, functions, lines): pass; 12 suites, 242 tests.
- `npx jest src/features/decide/copy`: passes except `codeMaps.test.ts` (ITEM_TYPE_LABEL, another plan's item-type work, not touched).
- `npx jest src/features/decide/check/steps`: 295 pass.
- `npm run typecheck` clean, `npm run depcruise` clean, eslint clean on every touched file.
- Named tests present: "D-90 the true APR is solved on the settled path only", "D-90 a rated plan has no implied APR", "D-89 the instalment note follows the frequency, rate and timing table", "D-90 the no-rate note shows the true APR rounded up", "D-90 above the cap reads above 999.99% a year", "D-89 summaries name the frequency".

## Deviations from Plan

**1. [Rule 3 - Blocking] MethodPanels passes the solved rate; two step-2 test files follow the new wording**
- `MethodPanels.tsx` (one line) now passes `computation.impliedApr` to `instalmentNotes`, otherwise the live panel would lose its rate clause. `step2Instalment.test.tsx` and `Step2PriceAndPay.test.tsx` asserted the old R15 strings ("No rate was quoted. 12 × ... about N% a year", "12 × $130.00 · no rate", "12 payments of ... the first on the day") and were updated to the M6 wording. None of these files is in the plan's list.
- Commit: 73cced4d.

**2. `methodCardCopy.test.ts` only gained frequency assertions**; the full table lives in `instalmentCopy.test.ts`.

## Issues for later plans / for the user

- `decide.pay.instalmentCalcNote` still reads "The rate works out to {calc} a month". For a weekly, fortnightly or quarterly quote `{calc}` is the per-period payment, so "a month" is wrong. M6 keeps the note as it is, and fixing it needs a new key in `en.ts` (a frequency-aware variant or "a payment"). Left for 05-103 or 05-109 to decide.
- The no-rate note renders as two lines (lead, then clause); 05-103 can join them if the UI wants one paragraph.
- Unused now: `instalmentRateNote*`, `instalmentNote`, `instalmentNoteFees`, `summaryInstalment*`, `summaryTimes`, `summaryFirstInMonth`, `instRateBelow`. 05-109 retires them.
- `next_month` still parses as an alias of `next_period`; the UI chips still write `next_month` until 05-103.

## Device items

05-EXECUTION-NOTES "05-26 device checklist additions (Decide UX refresh)", entry 05-102: read each frequency x rate x timing note once on the Pixel when 05-103 lands the frequency chips. Until then only the monthly row is reachable.

## Known Stubs

None.

## Self-Check: PASSED
