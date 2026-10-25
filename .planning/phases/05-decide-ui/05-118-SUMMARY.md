---
phase: 05-decide-ui
plan: 118
subsystem: decide-home
tags: [cleanup, guards, copy, r17]
requires: [05-117]
provides: [R17 closed: dead home components and copy retired, hero-only fit guard, dark out-of-range prefix]
affects: []
key-files:
  modified:
    - src/i18n/locales/en.ts
    - src/features/decide/home/YourMonthCard.tsx
    - src/features/decide/ui/CustomValueChips.tsx
    - src/features/decide/ui/RateInput.tsx
    - tests: customValue, inputPrimitives, LinesAndMonth, homeDepth, decideTextFit, decideCopy, decideCopyFit, infoTerms
  deleted:
    - src/features/decide/home/AddChangeRow.tsx
    - src/features/decide/home/__tests__/AddChangeRow.test.tsx
decisions:
  - decide.month.eyebrow and decide.month.roughEyebrow were also unread once the YourMonthCard wrapper went (they were its eyebrows), so they were removed too.
  - YourMonthCard tests for the none / null / unconverted states were dropped; MonthDetailsSheet.test already covers unavailable and first-run. The remaining logged/rough tests now render MonthDetailsBody (dark).
requirements: [DCU-34, DCU-09, DCU-27]
metrics:
  completed: 2026-10-24
  tasks: 2 plus 2 additions
---

# Phase 5 Plan 118: R17 close-out Summary

Retired the components and copy that R17 replaced, held R17 with the guards, and added the R17.13 "Out of range:" prefix on dark range lines.

## Commits

- d2964648 feat(05-118): dark out-of-range line carries the prefix word (R17.13) (addition 1)
- c201cfbe refactor(05-118): remove AddChangeRow and the YourMonthCard wrapper; hero-only fit guard (addition 2, plan Tasks 1 and 2)
- 4ce8662f refactor(05-118): retire copy keys no longer read after R17; R17 count-string guard (addition 2, plan Tasks 1 and 2)
- c9eaf596 fix(05-118): type-safe regex captures in the hero fit guard

## What was built

Plan:
- Deleted `AddChangeRow.tsx` and its test (no importer). Removed the `YourMonthCard` default component, keeping `MonthDetailsBody`, `MonthDetailsBodyProps`, `YourMonthCardProps` (used by MonthDetailsSheet); dropped its now-unused imports.
- Removed keys with no non-test reader: `decide.tab.*`, `decide.fab.*`, `decide.home.pastRow`, `pastCount_one/_other`, `addChange`, `checkInvestment`, `decide.month.eyebrow`, `decide.month.roughEyebrow`. Kept `decide.home.linesFold.*` and `decide.home.noFigures.*`.
- Guards: `it('R17 the hero is the only fit below 0.8')` in decideTextFit resolves every `minimumFontScale` (literal or same-file const) and requires exactly `home/HomeSummaryCard.tsx: [0.75]`, failing on any unresolved token. Stale AddChangeRow entries removed from the two exact-count allowlists (GEOMETRY_HEIGHT, OVERLAY_ABSOLUTE). decideCopyFit gained an R17 test: home plural keys exist with `{{count}}`, retired keys stay gone (rule U already ran over every leaf). Guard lists in decideCopy and infoTerms updated.

Additions:
1. `decide.custom.outOfRange` = "Out of range: {{range}}". Dark CustomValueField shows it when the entry is refused or above range (in range it stays the plain hint); the dark stored-above line in CustomValueChips always shows it; dark RateInput shows it on a refused keystroke. Surface text, no colour change. Light rendering is unchanged. Tests: customValue (dark chips and field, dark vs light rate), inputPrimitives updated. Copy guards accept it (declarative).
2. Dead code, as listed above.

## Verification

- `npx jest src/features/decide src/shell src/features/you src/i18n src/ui`: 191 suites, 16563 tests pass.
- `npm run typecheck` clean; eslint 0 errors (751 pre-existing warnings); `npm run depcruise` no violations.
- Not run: `test:coverage` and `verify:gates` from the plan's verify line (the request listed the targeted checks only).
- ROADMAP: `05-118-PLAN.md` ticked by hand, a one-line diff.

## Deviations from Plan

**1. MoneyInput not changed (addition 1).** Its dark error line is a parser message (empty, invalid, ambiguous separator, too many decimals, too large), not a range line, so the "Out of range:" prefix would be wrong for most of them. Left as surface text. Decision for the caller: if "too large" should carry the prefix, that is a small follow-up.

**2. Extra keys removed.** `decide.month.eyebrow` / `roughEyebrow` (unread after the wrapper went).

**3. Tests moved, not just edited.** LinesAndMonth/homeDepth YourMonthCard tests for eyebrow text, none state, null source and the D-37 missing-rate card were removed; the sheet's tests cover the unavailable and first-run states.

**4. Commit grouping.** The AddChangeRow allowlist cleanup and the hero guard share a file, so they landed in one commit (c201cfbe). A follow-up fix (c9eaf596) corrected a TypeScript error in the guard.

## Device item

05-26 entry 05-118 (no retired home string anywhere; whole home at the text-fit matrix) needs a device. DCU-34 and related requirements were not ticked in REQUIREMENTS.md.

## Known Stubs

None.

## Self-Check: PASSED
