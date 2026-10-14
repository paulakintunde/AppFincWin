---
phase: 03-shell
plan: 34
subsystem: ui-primitives
tags: [toast, text-scaling, month-chips, a11y, gap-closure]
requires: []
provides:
  - Toast rise-in and specced pill geometry
  - Default-size scaling for top-level Text without fontSize
  - MonthChips tab semantics, non-overlapping hit areas, uncut month labels
affects: [src/ui/ToastView.tsx, src/ui/Text.tsx, src/ui/TextInput.tsx, src/features/home/MonthChips.tsx]
key-files:
  modified:
    - src/ui/ToastView.tsx
    - src/ui/Text.tsx
    - src/ui/TextInput.tsx
    - src/features/home/MonthChips.tsx
    - src/ui/__tests__/ToastView.tone.test.tsx
    - src/ui/__tests__/Text.test.tsx
    - src/features/home/__tests__/MonthChips.test.tsx
decisions:
  - "M9 confirm-first: RED test proved top-level Text without fontSize did not scale; fix only touches Text with no numeric fontSize"
  - "Text skips the nesting Provider for string/number children so children shape is unchanged"
metrics:
  tasks: 3
  completed: 2026-10-14
---

# Phase 3 Plan 34: Toast, Text scaling, MonthChips gaps Summary

Closes M3 (toast motion and geometry), M9 (Text default-size scaling, confirm-first), L2 and L3 (MonthChips).

## Commits
- b9bc502 fix: toast rise-in (14px + fade, 220ms ease, instant under reduced motion), padding 13/18, gap 14, controls reach 44px via hitSlop
- (test) failing test for Text without fontSize (2 tests failed before fix, confirming the defect)
- 5eb6446 fix: top-level Text with no fontSize scales from 14px with the same 2x / 1.3x caps; TextNestingContext keeps nested Text inheriting; TextInput comment records A12 PASS (no behaviour change)
- 4491b44 fix: MonthChips role tab, hitSlop 2px horizontal, label is the full Intl short name
- final fix: Text nesting wrapper skipped for string/number children

## Deviations from Plan

**1. [Rule 1 - Bug] Text children shape**
Wrapping all children in the nesting Provider broke `recordPrimitives.test.tsx` (expects the alert's children to be the plain string). withNesting() now returns string/number/null children unchanged; only element children get the Provider.

**2. [Test expectation] en-GB September label**
The plan expected 'Sep'; Node ICU's own en-GB short form is 'Sept'. L3 says use the locale's own short name uncut, so tests expect 'Sept'.

## Verification
- tsc: only the known environmental expo-blur error. eslint clean on changed files (one pre-existing no-redeclare warning in TextInput.tsx). depcruise clean.
- jest src/ui src/features src/shell src/theme: 1732 tests pass; 2 suites (TabBar.a11y, shellNavigation) fail to resolve expo-blur (environmental, as noted).

## Known Stubs
None.

## Self-Check: PASSED
