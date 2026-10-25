---
phase: 05-decide-ui
plan: 63
subsystem: ui
tags: [decide, verdict-card, key-figures, info, a11y, D-74, D-70, D-76]
requires: [05-54, 05-55, 05-58]
provides:
  - keyFigures / keyFigureInputs (pure key-figure copy over runwayMonthsOf)
  - VerdictCard rebuilt summary-first with size, edge and cushion info buttons
  - ConfidenceChip with a 12px info glyph; ConfidenceSheet opens with the Basis explanation
  - FigureStrip optional group (one focus stop) and captionAccessory
affects: [05-64, 05-74, 05-87]
key-files:
  created:
    - src/features/decide/copy/keyFiguresCopy.ts
    - src/features/decide/copy/__tests__/keyFiguresCopy.test.ts
    - src/features/decide/check/__tests__/verdictCard.test.tsx
  modified:
    - src/features/decide/check/VerdictCard.tsx
    - src/features/decide/check/ConfidenceSheet.tsx
    - src/features/decide/check/steps/Step3Verdict.tsx
    - src/features/decide/ui/ConfidenceChip.tsx
    - src/features/decide/ui/FigureStrip.tsx
    - src/features/decide/check/__tests__/verdictDepth.test.tsx
    - src/features/decide/check/steps/__tests__/Step3Verdict.test.tsx
    - src/features/decide/ui/__tests__/depthPrimitives.test.tsx
decisions:
  - "keyFigures takes a CopyRef resolver as its fourth argument so months wording and the screen-reader line come out as text while the module stays free of React and t()"
  - "Focus order uses a column-reverse wrapper: the summary group is first in the tree and the size/edge/chip row follows it, yet is drawn above the verdict"
  - "The key-figures group is one accessible element; the Cushion info button stays inside the caption (touchable) and the group offers the 'about' accessibility action"
  - "The confidence chip reaches 44pt with hitSlop instead of minHeight, so row 1 keeps its visible height with no negative margins"
requirements: [DCU-11, DCU-14, DCU-25, DCU-27]
metrics:
  tasks: 2
  completed: 2026-10-23
---

# Phase 5 Plan 63: Summary-first verdict card Summary

The Step 3 verdict card now leads with the state words as the heading, the old title as a one-line reason, the optional difference line, three key figures (Left a month, Cushion, A month) and the basis marker. Nothing on it is clamped; the old body sentence is gone.

## Tasks

| Task | Commit | Notes |
|------|--------|-------|
| 1. keyFiguresCopy, chip glyph, Basis on the sheet | b6ee92cc | cushion = `runwayMonthsOf(cashAfterBillsAndPurchase, burn)`; first read uses rough monthly spending as the burn |
| 2. VerdictCard layout, info buttons, focus stops | c806da73 | tests updated for the new rows; new verdictCard.test.tsx with the five named tests |

## Verification

- `npx jest src/features/decide` : 85 suites, 1253 tests pass.
- `npx eslint` on the touched files: 0 errors (9 pre-existing warnings in untouched tests). `npm run depcruise`: clean.
- `npm run typecheck`: no errors in this plan's files. Remaining errors are in `snapshot/__tests__/checkInputs.test.ts` and `computeCheck.test.ts` (`cheaperRatioPercent`, `computeCheck.ts` line 187), from another executor's in-flight work.
- `grep -cE "numberOfLines|marginVertical: -|position: 'absolute'" VerdictCard.tsx` returns 0.

## Deviations from Plan

**1. [Rule 3 - Blocking] Step3Verdict passes two new props**
- VerdictCard needs the exact (cents) formatter for the monthly figure and the rough spending for the first-read cushion; neither was available to it. `Step3Verdict.tsx` now passes `fmtCents` and `roughBurn` (three lines). Not in the plan's file list.

**2. [Rule 3 - Blocking] FigureStrip extended (05-55 file)**
- Added optional `group` (one accessible element for the strip, with accessibility actions) and per-item `captionAccessory`, because the plan needs a caption with an info button inside a single key-figures focus stop. Existing callers are unchanged.

**3. [Rule 1] ConfidenceChip target by hitSlop**
- The chip's 44pt `minHeight` was the reason for the removed `marginVertical: -8`. The target is now `hitSlop` 9 on each side, and the depthPrimitives test asserts hitSlop rather than minHeight.

**4. Tests**
- The WR-C05 accessibility-action tests became "the link is its own link" and "the chip opens the reasons, Basis explanation at the top". The first-read live-region label no longer contains the confidence words (R2 summary label excludes them). The verdictDepth "Strong needs 6 full months" query became `getAllByText` because the footer and the Basis explanation both carry it.

## Known Stubs

None.

## Decisions for the user

- Focus order on iOS: VoiceOver orders by screen position, so it may still read the size/edge/chip row before the summary. The tree order is correct for TalkBack and for the tests; check on device.
- The Cushion info button sits inside the key-figures accessibility group, so VoiceOver reaches it through the group's "about" action rather than as a separate stop.
- The card's y = 389.5 budget (233.5 high) is not measured here; it depends on the chip row being 27 high. Check on device.

## Device items

05-EXECUTION-NOTES "05-26 device checklist additions (Decide UX refresh)", entry 05-63: at 402x874 the card ends at y = 389.5 (258.5 with the difference line); at 320 wide and 2.0x the strip stacks and word values wrap; TalkBack reads the summary, then the info buttons and chip, then the key figures; VoiceOver order as noted above.

## Self-Check: PASSED
