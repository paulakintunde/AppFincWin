---
phase: 06-grow
plan: 23
subsystem: theme
tags: [design-tokens, depth, typography, accessibility]
requires: ["06-20"]
provides:
  - canvas #F6F4EE page tone
  - shadows.card (boxShadow), shadows.edge, depthShadows()
  - bodyStrong text role
affects: [06-27, 06-28, 06-36]
key-files:
  modified:
    - src/theme/tokens.ts
    - src/theme/typography.ts
    - src/theme/__tests__/contrast.test.ts
    - src/ui/Row.tsx
    - src/features/record/activity/ActivityRow.tsx
    - src/features/home/ComingUpCard.tsx
    - src/features/home/AccountsCard.tsx
    - src/features/decide/home/OpenChecksCard.tsx
    - app.config.ts
    - CLAUDE.md
  created:
    - src/theme/__tests__/depthTokens.test.ts
key-decisions:
  - "D-31: depth from canvas, white surface and three shadow tokens only; no new hex"
metrics:
  completed: 2026-11-07
---

# Phase 6 Plan 23: App-wide depth tokens Summary

Page tone #F6F4EE (the fill6 value), a three-layer `card` boxShadow, a light two-layer `edge` shadow for grouped Activity rows, and a `bodyStrong` role (body metrics, 600 face) for card item names and row amounts.

## Commits
- Task 1: d4277568 tokens, bodyStrong, tests, CLAUDE.md, splash colour
- Task 2: see git log (`feat(06-23): bodyStrong on card names, edge shadow on Activity rows, inkFaint off canvas (D-31)`)

## Notes
- `depthShadows()` is exported so tests can re-run it after mocking Platform; `shadows` is built from it at load. Android below API 28 gets `{ elevation: 3 }` for card and `{}` for edge. `fab` unchanged.
- `app.config.ts` splash background is now #F6F4EE. This rides the next native build; it is not OTA-able.
- CLAUDE.md design-fidelity bullet rewritten without the state-colour clause. 06.1 (PR #99) edits the same bullet and must insert its state-colour clause on merge; 06.1's contrast test should also assert on the new canvas.
- Row.tsx gained opt-in `emphasis` (default false); no current caller sets it, so settings and field rows are unchanged.
- inkFaint on canvas is 4.44:1; documented in contrast.test.ts.
- Cost note: the jest runs on this host were very slow (theme folder 348 s with parallel load).

## inkFaint audit (outside src/features/grow)

| Site | Background | Decision |
|------|------------|----------|
| auth/AppleSignInButton.tsx:64 pending note | page (canvas) | moved to inkMuted |
| decide/check/sections/AssumptionsSection.tsx:238 not-lender note | page (canvas) | moved to inkMuted |
| decide/check/steps/Step2PriceAndPay.tsx:215 not-lender note | page (canvas) | moved to inkMuted |
| decide/check/steps/Step4Alternatives.tsx:246 descriptor | card row (surface/fill5) | no change |
| decide/past/AttachLineSheet.tsx:104 | sheet (surface) | no change |
| decide/past/DecisionDetailSheet.tsx:311,359 dates | sheet (surface) | no change |
| decide/past/PastDecisionsScreen.tsx:156 | card row (surface) | no change |
| decide/ui/SliderWithField.tsx:113 | inside check card | no change |
| record/activity/ActivityRow.tsx:104 Moved tone | row (surface) | no change |
| record/activity/GroupHeader.tsx:53,54,59 | page (canvas) | moved to inkMuted |
| record/activity/views/CalendarView.tsx:67 | dot fill, not text | no change |
| record/entry/AmountField.tsx:51 hint | sheet (surface) | no change |
| record/history/HistoryScreen.tsx:94,95,110 | page (canvas) | moved to inkMuted |
| you/YouScreen.tsx:254 credits | page (canvas) | moved to inkMuted |
| ui/RateAttribution.tsx:75 | page or sheet | moved to inkMuted (passes on every light ground) |
| ui/CustomValueChips.tsx:123 | dark/sheet chips | no change |
| Placeholders, borders, chevrons, radio dots (stepUi, QuickCheckForm, DebtSheet, AccountSheet, CategorySheet, RuleSheet, RepeatsField, TransactionSheet, import/*, RateInput, ToggleRow, RadioDot, Row chevron and others) | fields or glyphs, not page text | no change |

## Deviations from Plan

**1. [Rule 1 - Bug] depthTokens test used `jest.replaceProperty` on `Platform.Version`, which is a getter.** Switched to `jest.spyOn(Platform, 'Version', 'get')`. Commit d4277568.

Otherwise the plan executed as written. The `middle` group row previously had no shadow; every position now uses `edge` as planned.

## Self-Check
See bottom of file.

Task 2 commit: 7b9e922b. Also adjusted ComingUpCard.test.tsx to accept `boxShadow` (it asserted the old shadow keys). Checks run: related jest (121 suites, all pass after that fix), lint, typecheck, depcruise exit 0.

## Self-Check: PASSED
Files and commits d4277568, 7b9e922b exist.
