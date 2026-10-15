---
phase: 03-shell
plan: 05
subsystem: ui
tags: [accessibility, font-scale, DSG-07, eslint, codemod]
requires: [03-01]
provides:
  - Text and TextInput primitives with D-19 caps (body 2x, capped 1.3x)
  - FontScaleProvider mounted at the root
  - eslint ban on importing Text/TextInput from react-native
affects: [all later UI plans, which must import from @/ui/Text and @/ui/TextInput]
key-files:
  created:
    - src/theme/fontScale.ts
    - src/theme/FontScaleProvider.tsx
    - src/ui/Text.tsx
    - src/ui/TextInput.tsx
    - scripts/migrate-text-imports.mjs
    - src/theme/__tests__/fontScale.test.ts
    - src/ui/__tests__/Text.test.tsx
  modified: [app/_layout.tsx, eslint.config.js, src/ui/AmountDisplay.tsx, "73 source files (imports only)"]
requirements-completed: [DSG-07]
duration: ~45 min
completed: 2026-10-13
---

# Phase 3 Plan 05: Text scaling primitives Summary

One scaled Text primitive (body up to 2x, capped tier up to 1.3x, applied manually from the OS font scale) and a 2x-capped TextInput replace every react-native Text/TextInput import across 73 files, with a lint rule blocking regressions.

## Commits
- 56c8465 feat: fontScale, FontScaleProvider, Text, TextInput primitives plus tests
- d167778 refactor: codemod migration of 73 files, AmountDisplay capped, eslint ban

## Results
- Codemod migrated exactly 73 files (69 Text, 11 TextInput), as expected; no aliased imports found. Residue check script returns 0 remaining.
- AmountDisplay uses `scale="capped"`. AmountField delegates to AmountDisplay, so no change there.
- Full jest: 288 suites, 7701 tests pass. tsc clean. eslint 0 errors.

## Deviations from Plan
1. [Rule 1 - Bug] `Text` returned `style=[style, {}]` at scale 1, breaking 5 existing tests that read `props.style.color`. Fix: pass the caller style through untouched when nothing is scaled. Matches the plan's "at scale 1 rendered style equals input".
2. [Rule 3 - Blocking] 3 files used `TextInput` as a type (`useRef<TextInput>`). Added `export type TextInput = RNTextInput` merged with the component export.
3. RNTL in this repo is async, so the new Text tests `await render(...)`; JSX text literals wrapped as `{'x'}` for the i18next lint rule.
4. A comment in fontScale.ts first cited issue numbers with a leading `#`, which the DSG-02 raw-colour test flagged as hex; reworded.

## Notes for device check (03-14)
Not verified on device: TextInput relies on maxFontSizeMultiplier=2 (native scaling), as planned. Tab labels and Home figures do not yet use `scale="capped"`; those components arrive in later plans.

## Self-Check: PASSED
