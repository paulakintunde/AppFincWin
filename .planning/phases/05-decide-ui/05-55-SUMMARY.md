---
phase: 05-decide-ui
plan: 55
subsystem: ui
tags: [ui, text-fit, decide, D-76]
requires: [05-25]
provides:
  - shared Text and TextInput with app-wide no-hyphenation defaults (rule H)
  - shouldStack / useShouldStack (rule S) and LabelValueRow
  - SegmentedToggle radio-list variant (Seg), FigureStrip one-line figures (rule N)
affects: [wave 12 refresh screens, 05-26]
key-files:
  created:
    - src/features/decide/ui/textFit.ts
    - src/features/decide/ui/LabelValueRow.tsx
    - src/features/decide/ui/__tests__/textFit.test.tsx
  modified:
    - src/ui/Text.tsx
    - src/ui/TextInput.tsx
    - src/ui/__tests__/Text.test.tsx
    - src/features/decide/ui/SegmentedToggle.tsx
    - src/features/decide/ui/FigureStrip.tsx
decisions:
  - "Stack thresholds are exported constants (360, 1.3, 16); boundaries do not stack"
  - "FigureItem.kind defaults to 'figure' (one line, scaled to 0.8); 'words' wraps"
  - "Segment height became minHeight so a two-line label grows it (rule G)"
requirements: [DCU-27, DCU-11]
metrics:
  tasks: 3
  completed: 2026-10-23
---

# Phase 5 Plan 55: Text-fit groundwork Summary

Text and TextInput default to `textBreakStrategy="simple"` (Text also `android_hyphenationFrequency="none"`) with caller override; one pure `shouldStack` helper and hook decide stacking; LabelValueRow, SegmentedToggle and FigureStrip follow it.

## Tasks

| Task | Commit | Notes |
|------|--------|-------|
| 1. Rule H defaults | 46a98454 | both Text render branches and TextInput |
| 2. shouldStack, useShouldStack, LabelValueRow | a5779a8d | no height or numberOfLines in the row |
| 3. SegmentedToggle radio list, FigureStrip one-line figures | ac20e4d2 | strip stacking now uses the shared helper (adds width < 360) |

## Verification

- `npx jest src/ui src/features/decide`: all suites pass (textFit 10 tests, Text 13).
- typecheck clean, lint 0 errors, depcruise clean.

## Deviations from Plan

- The `useWindowDimensions` mock in textFit.test.tsx targets `react-native/Libraries/Utilities/useWindowDimensions` (a source module) because `jest.spyOn` on the react-native barrel did not take effect; `useFontScale` is driven through the real FontScaleProvider rather than a spy.
- The radio-dot test uses `includeHiddenElements` since RadioDot hides itself from accessibility.

Otherwise the plan ran as written. No migrations, no Supabase calls.

## Device items

05-EXECUTION-NOTES "05-26 device checklist additions (Decide UX refresh)", entry 05-55: Record and Home inherit rule H (no mid-word hyphens on Android); check at 320 wide and 2.0x that segmented controls become radio lists and strips stack.

## Self-Check: PASSED
