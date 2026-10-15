---
phase: 03-shell
plan: 16
subsystem: ui
tags: [sheet, dismissal, discard, dirty, d-26, d-27]
requires: [03-04, 03-05, 03-09]
provides:
  - "Sheet `dirty` prop and stacked 'Discard changes?' prompt"
  - "useIsDirty / isStructurallyEqual"
affects: [03-24]
key-files:
  created:
    - src/ui/useIsDirty.ts
    - src/ui/__tests__/useIsDirty.test.ts
    - src/ui/__tests__/Sheet.dismissal.test.tsx
    - src/features/record/__tests__/editSheets.dirty.test.tsx
  modified:
    - src/ui/Sheet.tsx
    - src/features/record/accounts/AccountSheet.tsx
    - src/features/record/categories/CategorySheet.tsx
    - src/features/record/categories/RuleSheet.tsx
    - src/features/record/activity/FilterSheet.tsx
    - src/features/record/import/PasteSheet.tsx
    - src/features/record/import/PasswordPromptSheet.tsx
    - src/features/record/entry/RepeatsField.tsx
requirements-completed: [NAV-04, NAV-06]
duration: ~45 min
completed: 2026-10-14
---

# Phase 3 Plan 16: Sheet dirty prop and Discard changes Summary

Dirty sheets now ask "Discard changes?" on drag, Android back and backdrop; untouched sheets close at once; Cancel never asks. Seven non-entry edit sheets report dirty by comparing current fields to their opening values.

## Commits
- ffe61c0 feat(03-16): Sheet dirty prop with stacked Discard changes prompt, useIsDirty
- 8600b19 feat(03-16): dirty reports on account, category, rule, filter, paste, password and repeats sheets

## What was built
- `SheetProps.dirty` (optional, default false). `requestDismiss` opens the prompt when dirty; `canDragDismiss` mirrors `dismissible && !dirty`, so a dirty drag snaps back and `onBlockedDismiss` opens the prompt (the hook point left by 03-09).
- `DiscardPrompt` lives in Sheet.tsx (no ConfirmSheet import, avoiding the cycle) and renders inside the edit sheet's container as a nested Modal. Keep editing (secondary, left), Discard (danger, right); its own back, backdrop and drag mean Keep editing.
- `useIsDirty(initial, current)` with structural `isStructurallyEqual`.
- Sheets: Account `{name, kind, pickedCurrency, openingText, signChoice, limitText}`; Category `{name, colorKey, capText}`; Rule `{keyword, scope, categoryId}`; Filter `{draft, minText, maxText}`; Paste `text.trim() !== ''`; Password `hasText`; Repeats `{countText}` compared to the count text captured when the sheet is opened (frequency and end picks apply to `value` immediately).
- Cancel wiring untouched (D-27).

## Deviations
- [Rule 1 - lint] The plan's "reset discardOpen when visible turns false" as an effect tripped `react-hooks/set-state-in-effect`; implemented as a state adjustment during render instead. Same behaviour.
- RepeatsField's opening count is captured on each open (not at mount) so reopening after an earlier edit starts clean.

## Verification
- tsc: only the known environmental `expo-blur` error in TabBar.tsx. eslint clean on changed files.
- Full `npx jest --silent -w 3`: 316 of 317 suites, 7872 tests pass; the one failing suite is `TabBar.a11y.test.tsx` (expo-blur not installed in the junctioned node_modules, environmental).
- Existing Sheet gestureRoot, keyboard, scrim, drag and stack tests pass unchanged.

## Known Stubs
None.

## Self-Check: PASSED
