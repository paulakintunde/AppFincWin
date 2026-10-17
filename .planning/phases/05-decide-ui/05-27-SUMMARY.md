---
phase: 05-decide-ui
plan: 27
subsystem: decide-home
tags: [decide, home, your-month, lines, rough-figures, settings]
requires: [05-09, 05-10, 05-12, 05-19, 05-21, 05-28]
provides: [YourMonthCard, LinesCard, LimitEditorSheet, RoughFiguresSheet, DSR_LINE_RE]
affects: [05-30]
key-files:
  created:
    - src/features/decide/home/YourMonthCard.tsx
    - src/features/decide/home/LinesCard.tsx
    - src/features/decide/home/LimitEditorSheet.tsx
    - src/features/decide/home/RoughFiguresSheet.tsx
    - src/features/decide/home/__tests__/LinesAndMonth.test.tsx
  modified:
    - src/features/decide/home/DecideHomeScreen.tsx
    - src/features/decide/home/__tests__/DecideHomeScreen.test.tsx
    - src/features/decide/ui/FigureStrip.tsx
requirements-completed: []
---

# Phase 5 Plan 27: Your month and Lines on Decide home Summary

Decide home now carries the dark Your month card (logged, rough and empty states, with the per-user Worst / Average control) and the Lines you will not cross card with its limit editor, in the UI-SPEC order, and the quick check's "Add rough figures" and "Try again" buttons are no longer dead.

## What was built
- **YourMonthCard**: figures from `prepareContext(snapshot)` only (Comes in = incomeBasis, Goes out = spendingBasis, Left = leftBefore, negative in dangerTint2 with the sign), steadiness chip via `STEADINESS_LABEL`, Activity pill (`router.navigate('/activity')`), basis line (few / no-income / steady / variable), and the Worst / Average radio group only with 3 or more full months, writing `basis_override`. Rough state shows the figures with Edit; none state shows "Nothing to judge against yet" with Add rough figures and Import a statement (`/import`). A rough to logged switch re-renders as logged.
- **RoughFiguresSheet**: two `MoneyInput`s, saves `{ rough_income, rough_spending, currency }` (never `seeded`) as integer minor units; dirty discard through `Sheet`.
- **LinesCard**: five rows, user value or engine default (`context.limits`) with a `default` tag; owns the `LimitEditorSheet` state.
- **LimitEditorSheet**: money via `MoneyInput`, debt line via `RateInput` text, multiple as a 0-120 integer; info line, Use the default (writes null), Save limit; each save writes the one column plus the currency. `DSR_LINE_RE = /^\d{1,3}(\.\d{1,4})?$/` gates the debt line so a queued write can never be refused by the 05-03 column check.
- **DecideHomeScreen**: order is quick check, Your month, Open checks, Past decisions, Lines, sources note; `onAddRough` opens one shared `RoughFiguresSheet` (also used by Your month); `onRetry` stays `vm.retry`.

## Verification
- `npx jest src/features/decide src/theme src/i18n --forceExit`: 73 suites, 9394 tests pass (home folder 2 suites, 45 tests including the 21 new ones).
- `npm run typecheck` clean; `npm run lint` 0 errors (714 warnings, +1 test `require()` warning matching the existing mock pattern); `npm run depcruise` clean; `noRawColours` passes.
- No parseFloat in any new file. No migrations; pgTAP not run (Docker down).

## Deviations from Plan
- **[Rule 3 - Blocking]** `FigureStrip` dark tones: `positive` on the ink card now reads `accentTint1` and `negative` reads `dangerTint2` (UI-SPEC Color); no other caller used `dark`.
- `DecideHomeScreen.test.tsx`: the QuickCheckForm mock now renders a Try again button in the error state, and the add-rough test mounts through the shared providers helper (the Sheet needs the safe-area provider). The existing rerender-based reconcile tests keep the plain ThemeProvider render.
- The shared-cache recompute test mocks the settings mutation to patch a real `QueryClient` entry (the way the 05-19 `onMutate` does) rather than running the real queue.
- No engine edits. No new i18n keys (all copy already existed).

## Human/device items
- Your month and Lines at 402x874 and at large font (figure strip stacking, Activity pill wrap); TalkBack on the Worst / Average radio group and the line rows.
- Money fields commit on blur: confirm Save limit / Save figures enable when the keyboard is dismissed or the field blurs on tapping the button (same behaviour as the 05-23 rough screen).
- Activity pill tab switch on device (`router.navigate('/activity')`).

## Self-Check: PASSED
