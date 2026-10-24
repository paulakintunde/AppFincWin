---
phase: 05-decide-ui
plan: 96
subsystem: money-display
tags: [money, format, a11y, decide, D-94, R16.15]
requires: [05-87]
provides:
  - formatAmount shows USD as "$" in every locale and gives other bare-"$" currencies a marker (CA$, A$, NZ$, HK$, S$, NT$, MX$, else ISO code + no-break space)
  - formatMoneyA11y in engine/money (currencyDisplay 'name'; USD reads "dollars" at a USD home, "US dollars" otherwise)
  - useMoneyFormatter(showCents, homeCurrency?) exposes formatMoneyA11y
  - refTextA11y, moneyA11yFn, moneyA11yOf; a11yValue on FigureStrip items and AmountDisplay
affects: [05-109]
key-files:
  created:
    - src/features/decide/check/__tests__/moneyA11y.test.tsx
  modified:
    - src/engine/money/formatAmount.ts
    - src/engine/money/__tests__/formatAmount.test.ts
    - src/ui/money/useMoneyFormatter.ts
    - src/ui/AmountDisplay.tsx
    - src/features/decide/ui/FigureStrip.tsx
    - src/features/decide/ui/SegmentedToggle.tsx
    - src/features/decide/home/__tests__/LinesAndMonth.test.tsx
    - src/features/decide/ui/__tests__/textFit.test.tsx
    - src/ui/__tests__/recordPrimitives.test.tsx
    - src/features/decide/check/steps/Step2PriceAndPay.tsx
    - src/features/decide/quick/QuickResult.tsx
    - src/features/decide/check/steps/Step5Decision.tsx
    - src/features/decide/check/steps/Step4Alternatives.tsx
    - src/features/decide/ui/MoneyInput.tsx
    - src/features/decide/check/refText.ts
decisions:
  - "formatMoneyA11y takes (money, opts) with opts.homeCurrency and opts.customName, matching formatAmount; a custom currency reads customName, else its symbol"
  - "The fallback marker 'CODE + U+00A0' collapses against a locale's own separator (es-AR '$ 1.500' gives 'ARS 1.500', one space)"
  - "useMoneyFormatter takes homeCurrency as an optional second argument rather than reading the record context itself; only CheckFlowScreen passes it (rc.homeCurrency). Without it USD reads 'US dollars', which is never ambiguous"
  - "Sentences are spoken by rebuilding the same copy with a spoken Fmt (fmtA11y) and using that label; refTextA11y(t, ref, a11yParams) exists for the explicit-params form"
  - "MoneyInput sets accessibilityValue.text (not accessibilityLabel) so the field keeps its label (tests and users find it by label) and speaks the committed figure by currency name"
requirements: [MON-15, DCU-27]
metrics:
  tasks: 3
  completed: 2026-10-23
---

# Phase 5 Plan 96: D-94 "$" always means the US dollar, plus a11y money labels Summary

One formatter change reaches every screen: USD is "$1,500" in en-US, en-GB, en-CA and fr-CA (suffix order kept), CAD is "CA$1,500" even in en-CA, and money read aloud names its currency ("1,500 Canadian dollars").

## Tasks

| Task | Commit | Notes |
|------|--------|-------|
| 1. formatAmount marker rule and formatMoneyA11y | 823d611a | USD uses narrowSymbol; others use symbol and a bare "$" is swapped from the marker map; engine/money stays pure at 100% (branches, functions, lines, statements) |
| 2. Hook, a11y labels, fallout tests | dba16a8b | AmountDisplay and FigureStrip take `a11yValue`; "US$" display assertions in LinesAndMonth, textFit and the SegmentedToggle comment changed to "$" |
| 3. Decide figures and sentences | c40c34e1 | Step2 final price, QuickResult monthly figure and line, Step5 plan strip and set-aside, Step4 rows, cheaper price and Not spent, slider/compact MoneyInput, verdict summary and key-figures group, warning rows and cards |

## Verification

- `npx jest src/engine/money` with the 100% threshold on engine/money: pass (formatAmount.ts 100% in all four).
- `npx jest src/features/decide src/ui src/engine/money`: 151 suites, 2090 tests pass.
- `npm run typecheck`: clean. `npx eslint src/engine/money src/ui src/features/decide`: 0 errors (75 pre-existing warnings). `npm run depcruise`: clean.
- `git diff --stat src/engine/statement`: empty. foreign.ts and its test untouched.
- Named tests present: `D-94 USD always shows $`, `D-94 other dollar currencies keep their marker`, `D-94 a custom $ currency keeps its symbol`, `D-94 money reads currency names aloud`, `D-94 a money figure reads its currency name` (AmountDisplay and FigureStrip), `D-94 Decide figures read currency names`, `D-94 sentences built from amounts read currency names`.
- A full-suite run (taken mid-plan, other plans editing concurrently) also showed failures in `src/data`, `src/features/record` (for example `useSegments is not a function` in FabProvider) that are other plans' in-flight work, outside this plan. No failure traces to "US$" display.

## Deviations from Plan

**1. [Rule 3 - Blocking] Extra files touched beyond the plan's list**
- Task 2/3 tests asserting the spoken form now read "N dollars": `src/features/decide/ui/__tests__/displayPrimitives.test.tsx` (new FigureStrip test), `src/features/decide/check/steps/__tests__/Step3Verdict.test.tsx`, `src/features/decide/check/steps/__tests__/Step4Alternatives.test.tsx`, `src/features/decide/check/__tests__/expectedReturnSurfaces.test.tsx`, `src/features/decide/check/__tests__/verdictDepth.test.tsx`, and the fake formatters in `src/features/decide/check/steps/__tests__/helpers/stepProps.tsx` (added `formatMoneyA11y`).
- Source files needed for the sentence work (accessible elements named in Task 3): `src/features/decide/check/VerdictCard.tsx`, `steps/Step3Verdict.tsx`, `WarningList.tsx`, `src/features/decide/ui/WarningCard.tsx`, `check/sections/WhatBreaksSection.tsx`, `check/sections/sectionUi.tsx`, `check/steps/stepUi.tsx`, `quick/QuickCheckForm.tsx`, `check/CheckFlowScreen.tsx` (passes `rc.homeCurrency`).
- Commit: c40c34e1.
- No Jest snapshot contained "US$", so none were regenerated.

**2. [Rule 1 - Bug] verdictLineOne can be null**
- First cut of the spoken line used a non-null assertion and crashed; now null-safe in VerdictCard. Fixed before the commit.

**3. MoneyInput speaks via accessibilityValue, not accessibilityLabel**
- Plan Task 3 says accessibilityLabel for the slider/compact field values. Changing the label would break every `getByLabelText` on those fields and the label names the field, not the amount. The value text carries "1,500 Canadian dollars" instead. SliderWithField needed no change since it renders MoneyInput.

## Notes for later plans

- Callers other than CheckFlowScreen do not pass `homeCurrency`, so USD there reads "US dollars" even at a USD home (never wrong, only wordier). Record/Home/Activity do not yet set `a11yValue` on their figures; only the shared AmountDisplay and Decide figures were wired, as scoped.
- Free-standing sentence Texts that are not accessible groups were left alone; their text is read as "$" and is now unambiguous.

## Device items

05-EXECUTION-NOTES "05-26 device checklist additions (Decide UX refresh)", entry 05-96: with TalkBack on, a CAD figure reads "Canadian dollars" and a USD figure "US dollars"; a CAD-home user sees "CA$1,500" for CAD and "$1,500" for USD.

## Known Stubs

None.

## Self-Check: PASSED
