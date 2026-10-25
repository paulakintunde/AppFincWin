---
phase: 05-decide-ui
plan: 103
subsystem: ui
tags: [decide, instalment, frequency, go-ahead, written-lines, copy, D-89, D-90, R16.5]
requires: [05-88, 05-91, 05-92, 05-102]
provides:
  - instalment card with How often chips, How many 1 to 500 and a first payment that follows the frequency
  - Go ahead writes instalment series at weekly / fortnightly / monthly / quarterly, dated by occurrenceDate
  - written lines that name the frequency
  - frequency-correct variants of the "rate works out to" note
affects: [05-109]
key-files:
  modified:
    - src/features/decide/check/steps/step2/MethodPanels.tsx
    - src/features/decide/check/steps/__tests__/step2Instalment.test.tsx
    - src/features/decide/check/steps/__tests__/step2Custom.test.tsx
    - src/features/decide/check/writtenLines.ts
    - src/features/decide/check/__tests__/writtenLines.test.ts
    - src/data/mutations/decideGoAhead.ts
    - src/data/mutations/__tests__/decideGoAhead.test.tsx
    - src/features/decide/copy/instalmentCopy.ts
    - src/features/decide/copy/__tests__/instalmentCopy.test.ts
    - src/i18n/locales/en.ts
decisions:
  - "An instalment plan's steps are period-indexed, so the series anchor is occurrenceDate(start, plan.freq ?? 'monthly', step.fromMonth); loan and card writes stay monthly"
  - "The calc note keeps decide.pay.instalmentCalcNote for monthly and uses decide.pay.instalmentCalcNoteBy.{weekly,fortnightly,quarterly} ('a week', 'every 2 weeks', 'a quarter'); no plural is needed because the note carries no count"
  - "Non-monthly written lines are writtenInstalmentBy.{freq} (with the first payment's date), writtenInstalmentThenBy.{freq} and writtenInstalmentFinal (with the last payment's date); monthly lines keep their old keys and text"
  - "The impliedApr info button wraps the rate clause (instRateAbout / Above / Zero) with InfoTitle, not the lead"
requirements: [DCU-31, DCU-07, DCU-25]
metrics:
  tasks: 2
  completed: 2026-10-23
---

# Phase 5 Plan 103: Instalment frequency UI and writes Summary

The instalment card now opens with a "How often" radiogroup of chips (Weekly, Every 2 weeks, Monthly, Quarterly; default Monthly; the instalmentFrequency info button), "How many" runs 1 to 500 with the "1 to 500" range line (a stored 600 shows the warn range line and is scored as stored), and "First payment" reads Today / In a week | In 2 weeks | In a month | In 3 months and writes `next_period`. Go ahead writes each instalment run as a recurring series at the plan's frequency, and the written lines say the same thing with the dates from `occurrenceDate`.

## Tasks

| Task | Commit | Notes |
|------|--------|-------|
| 2. Written lines and Go ahead by frequency (plus the frequency-correct calc note) | 41dbeaea | tests "D-89 Go ahead writes a weekly instalment series", "D-89 written lines name the frequency", "D-89 monthly writes are unchanged" (both files), "D-89 the difference note names the frequency, never 'a month' for a weekly quote" |
| 1. How often chips, 1 to 500, first-payment labels, impliedApr info | 50a23970 | tests "D-89 How often defaults to Monthly and sets freq", "D-89 How many runs to 500", "D-89 the first-payment label follows the frequency", "D-89 the difference note follows the frequency", "D-90 the true APR note carries its ⓘ" |

Task 2 was committed first because the new copy keys it adds (en.ts, instalmentCopy.ts) are used by both tasks.

## Extra requested by the user

`decide.pay.instalmentCalcNote` said "a month" for every frequency. `instalmentNotes` now picks `decide.pay.instalmentCalcNoteBy.{weekly|fortnightly|quarterly}` by `inst.freq` ("The rate works out to {{calc}} a week; the quote is {{typed}}." and so on, `{{calc}}` being the payment for one period); monthly still uses the old key. Named test: `D-89 the difference note names the frequency, never "a month" for a weekly quote` (copy), plus `D-89 the difference note follows the frequency` (panel).

## No migration

`recurring_series.freq` already allows weekly, fortnightly, monthly, quarterly (and yearly) in `20260926000300_recurring_series.sql`; the Go ahead test reads that migration and `RECURRING_FREQS` to prove it.

## Verification

- `npx jest src/features/decide/check/steps` (17 suites, 300 tests), `writtenLines`, `decideGoAhead`, `instalmentCopy` suites: pass.
- `npx jest src/features/decide src/data`: 162 of 165 suites pass. The three failures are not from this plan: `engineBarrel.test.ts` (another executor added `CARD_MAX_PURCHASE_USD` to the barrel), `commit.test.tsx` "CR-C05" (fails against another executor's uncommitted `CheckFlowScreen.tsx` speed work; nothing in this plan touches Go ahead's account handling), and `CheckFlow.test.tsx` (passes alone, act warnings only). Earlier in this run `codeMaps.test.ts` also failed on `card_limit_rate_missing` (another plan's in-flight work).
- `npm run typecheck` clean. eslint 0 errors on every touched file (fast-check `fc` warnings in decideGoAhead.test.tsx are pre-existing).
- Copy guards (`src/features/decide/copy`, `src/i18n`) pass for the new keys.

## Deviations from Plan

**1. [Rule 3 - Blocking] step2Custom.test.tsx updated**
- The existing "instalment count refuses 121" test and its `'1 to 120'` range line broke by design with the 1 to 500 bound; it now refuses 501 and reads '1 to 500'. Not in the plan's file list.
- Commit: 50a23970.

**2. [Rule 2 - Missing] Dates in the non-monthly written lines**
- The task said the written-lines dates use `occurrenceDate`, but the old payment lines had no dates. Non-monthly lines now carry the first payment date ("from {{date}}") and the last payment date; monthly lines are word-for-word unchanged.

**3. ROADMAP**
- `roadmap update-plan-progress` also ticked 05-110 and rewrote the Phase 5 status cell (the known prefix bug). Unticked 05-110 by hand and restored the status text with the count at 103/118.

## Decisions for the user

- DCU-31 ticked (engine 05-91/05-92, copy 05-102, UI and writes here). DCU-29 left unticked: it also covers the Step 2 card work and D-86/D-87 outside this plan, so I could not confirm it from this plan alone.
- The no-rate note still renders as two lines (lead, then the rate clause with its ⓘ), as 05-102 left it.

## Device items

05-EXECUTION-NOTES entry 05-103: How often chips wrap at 2.0x font scale; a weekly plan's Go ahead writes a weekly series visible in Record. Not run on a device in this plan.

## Known Stubs

None.

## Self-Check: PASSED
