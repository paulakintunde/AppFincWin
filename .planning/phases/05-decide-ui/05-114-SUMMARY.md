---
phase: 05-decide-ui
plan: 114
subsystem: decide-home
tags: [dark-card, hero, D-95, D-97, R17.3]
requires: [05-110, 05-111, 05-112]
provides: [HomeSummaryCard, HomeHero, heroAmountText]
affects: [05-116, 05-117, 05-118]
key-files:
  created:
    - src/features/decide/home/heroAmountText.ts
    - src/features/decide/home/HomeSummaryCard.tsx
    - src/features/decide/home/__tests__/HomeSummaryCard.test.tsx
  modified:
    - src/features/decide/__tests__/decideTextFit.test.ts
decisions:
  - The hero's minimumFontScale 0.75 is the declared hero-only rule-N exception; recorded in the decideTextFit NUMBER_ALLOW figure list (home/HomeSummaryCard.tsx, 1).
  - Group-separator detection treats any of . , NBSP, narrow NBSP, typographic apostrophe as a separator only when exactly three digits follow it, so decimal marks never get a break.
  - Details is hidden in the first-run state (the R17.4 wireframe has none) and shown in the figure and unavailable states (M5).
  - The card does not call markHomeBasisSeen; the screen (05-116) owns that, using homeCardModel's markBasisSeen, and must keep the switched label for the whole visit.
requirements: [DCU-34, DCU-14, DCU-01, DCU-10, MON-15]
metrics:
  tasks: 2
  completed: 2026-10-24
---

# Phase 5 Plan 114: HomeSummaryCard Summary

The dark card at the top of Decide home: a two-Text 42pt hero that keeps its amount whole, the model-driven states, and the dark quick check inside it.

## Commits
- 6d1cdfe8 Task 1: heroAmountText and the two-Text hero (plus the text-fit allowlist entry)
- 1cbb1f19 Task 2: card rows, states, result shrink, reading order

## What was built
- `heroAmountText(formatted)` returns `{ text, fitOneLine }`: up to 10 characters is one line; longer gets U+200B after each group separator and drops the one-line rule.
- `HomeHero`: amount (display face, `fontSize.netWorth`, capped 1.3x, `numberOfLines 1`, `adjustsFontSizeToFit`, `minimumFontScale 0.75`, `dangerTint2` when short) and the word in a wrapping baseline row.
- `HomeSummaryCard` props: `source, settings, status, homeBasisSeen, currency, today, onOpenDetails, onAddRough, onRetry, onRunFull`. State from `homeCardModel`.
  - figure: eyebrow row (label upper-cased `inkSoft1`, ⓘ `tightestFigures` for the tightest label, Details › 44 x 44), hero, sub-line, In/Out, dark `QuickCheckForm` (placeholder and short placeholder through `t()`), Full check › (`openNewCheck('buy')`, hidden while a result shows).
  - While a result is open (`onResultOpenChange` into state): one `s13_5` line "{amount} left · In · Out", sub-line and In/Out hidden.
  - first run / unavailable: "Not worked out yet", the reason, one solid DarkPill (Add rough figures, or See lines waiting for a rate navigating to `/activity`).
  - loading: busy skeleton (surface at .12 bars, no shimmer) plus the form's own skeleton; error: the form's dark "Your figures didn't load" with Try again.
- Reading order: summary group (Pressable, `formatMoneyA11y`, hint "Opens month details") first, then Details, the field, Check it, result, Full check. Done with a `column-reverse` wrapper so the eyebrow row stays visually on top; the eyebrow label text is hidden from a11y since the summary label carries it.

## Verify
- `npx jest src/features/decide/home/__tests__/HomeSummaryCard.test.tsx` 16 passed (named D-97 / D-95 / R17.7 tests present, hero test loops all 4 font pairings at 320 / 2.0x).
- `npx jest src/features/decide/__tests__ src/features/decide/copy src/i18n/__tests__/decideCopy.test.ts` 23 suites, 6719 tests passed (decideTextFit and copy guards included).
- `npm run typecheck` clean; eslint 0 errors on the touched files.

## Deviations
1. [Plan wording] "A quick check in the first-run state returns the existing Missing terms result": the form's existing result for no figures is "There is nothing to judge this against yet." (no chip); "Missing terms" is the unconverted (missing rate) result. The card passes `source` through unchanged, so each state gets the form's existing result; tests assert both.
2. [Rule 3] Added the `home/HomeSummaryCard.tsx` figure entry to the decideTextFit NUMBER_ALLOW list (a numberOfLines allowance, not a height); no height allowlist change (skeletons and rows use `minHeight`).
3. The quick field's accessibility label is the form's existing "Quick check"; the 05-110 key `decide.home.field.a11y` ("Quick check, something and a price") is not applied because `QuickCheckForm` has no prop for it (05-112 scope). Needs a small follow-up in QuickCheckForm if wanted.
4. The tests render the hero at 320 / 2.0x via `FontScaleProvider` and a seeded theme cache; RNTL cannot lay text out, so "whole on line 1" is asserted structurally (one-line props, fit scale, separate wrapping words Text) and the layout itself is a device check.

## Device item
05-EXECUTION-NOTES entry 05-114 (hero at 402 and 320, 1.0x and 2.0x per pairing; short tint; shrink with result; TalkBack order). Requirements not ticked.

## Known Stubs
None.

## Self-Check: PASSED
Files exist; commits 6d1cdfe8 and 1cbb1f19 exist.
