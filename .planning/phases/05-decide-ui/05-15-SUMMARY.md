---
phase: 05-decide-ui
plan: 15
subsystem: decide-check-step3
tags: [decide, ui, check-flow, step3, verdict, warnings, sections, tdd]
requires: [05-07, 05-09, 05-10, 05-14]
provides:
  - VerdictCard, WarningList, Step3Verdict (answer-first top of step 3)
  - MonthSection, LedgersSection, LinesSection, AssumptionsSection
  - useSettledLabel, refText (CopyRef to text)
affects: [05-16, 05-30, 05-41]
key-files:
  created:
    - src/features/decide/check/VerdictCard.tsx
    - src/features/decide/check/WarningList.tsx
    - src/features/decide/check/useSettledLabel.ts
    - src/features/decide/check/refText.ts
    - src/features/decide/check/steps/Step3Verdict.tsx
    - src/features/decide/check/sections/MonthSection.tsx
    - src/features/decide/check/sections/LedgersSection.tsx
    - src/features/decide/check/sections/LinesSection.tsx
    - src/features/decide/check/sections/AssumptionsSection.tsx
    - src/features/decide/check/sections/sectionUi.tsx
    - src/features/decide/check/__tests__/useSettledLabel.test.ts
    - src/features/decide/check/steps/__tests__/Step3Verdict.test.tsx
    - src/features/decide/check/sections/__tests__/tableSections.test.tsx
decisions:
  - WarningList takes the Verdict (not the Assessment) so card-reason cards on a missing verdict still render
  - AssumptionsSection takes `meta` (source.meta) as an extra required prop because SectionProps carries no snapshot meta
  - A first read has no body line and a title built from the first-read warnings; the logged verdict uses verdictTitle/verdictBody
metrics:
  tasks: 2
  files: 13
  completed: 2026-10-16
---

# Phase 5 Plan 15: Step 3 verdict, warnings and four sections Summary

Step 3's answer-first top (verdict card with chip, basis marker, size label, 3-line title, 2-line body, polite live region with a settled label, one haptic per visit) and up to six warning cards, plus the month line by line, five ledgers, against-your-lines and assumptions sections, all from engine figures in exact or whole minor units.

## Commits
- d19c3c8: VerdictCard, WarningList, Step3Verdict, useSettledLabel, refText (Task 1)
- 3dd4ac9: Month, Ledgers, Lines, Assumptions sections (Task 2)

## What was built
- **VerdictCard**: logged, first read, none ("There is nothing to judge this against yet.", no chip/size/basis) and unconverted (Missing terms chip, currency-named title/body, 44-hit link to `/activity`) states; ink fill, danger fill for `no`; title `numberOfLines 3`, body `2`, cap 1.3; `fw-rise` entrance unless reduced motion; accessibility label goes through `useSettledLabel(label, chip, 150)` (chip change announces at once).
- **WarningList**: card-reason cards, then at most six engine warnings via `warningCard`, then the neutral debt-rate fact (no dot, no colour).
- **Step3Verdict**: hapticSuccess for fits, hapticWarning otherwise, once per `revealKey`; no sections inside.
- **MonthSection**: exact `monthTable` Now/After; rows add up (tested); closing tile short / closes (average or worst).
- **LedgersSection**: 6px dot + Better/Worse/Same word. **LinesSection**: six rows with Clear / Short {x} / Over / Squeezed; zero-income DSR uses `lineDsrDescNoIncome`. **AssumptionsSection**: income, expenses, debt, return, running costs, lines without a rate, derived balances, card payments (tappable with `onEditCardMinimum`), card interest, loan payments, not-a-lender line.

## Verification
- `npx jest src/features/decide src/theme/__tests__/noRawColours.test.ts src/i18n --silent`: 36 suites, 8837 tests passed (check folder 5+1 suites, all named tests from the plan present).
- `npm run typecheck` clean; `npm run lint` 0 errors; `npm run depcruise` clean.

## Deviations from Plan
**1. [Rule 3 - Blocking] WarningList prop is `verdict`, not `assessment`.** cardReasonCards needs the Verdict (missing verdict with `card_not_accepted`).
**2. [Rule 3 - Blocking] AssumptionsSection gains a required `meta: SnapshotMeta` prop.** The shared SectionProps has no meta, but the meta counts drive five rows. 05-30 passes `source.meta`.
**3. [Added files]** `sections/sectionUi.tsx` (SectionProps, TableRow, Dot, Note, Tile, assessmentOf) shared by the four sections, and `check/refText.ts` (CopyRef to string). 05-16 may import SectionProps from `sectionUi.tsx` or keep a local copy.
**4. [Copy]** The catalogue's `asDebtValue` has no plural form, so one debt reads "1 accounts". Left as is (copy owned by 05-31/UI-SPEC); flag for the copy pass.
No engine edits. No migrations.

## Known Stubs
None. First-read cards carry no body line by design (no income basis exists on a first read).

## Human / device verification
- DCU-11 fold budget at 402x874: the verdict plus two warnings must fit without scrolling at 1.3x figures; jest cannot measure layout.
- TalkBack/VoiceOver: the live region announces after the 150 ms settle; the title ends in a full stop so the a11y label reads ".." (template in `decide.verdict.a11y`); check how it sounds.
- Haptic feel of success versus warning on the iPhone XR and Pixel.

## Self-Check: PASSED
