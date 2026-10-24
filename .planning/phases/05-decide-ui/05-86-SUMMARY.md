---
phase: 05-decide-ui
plan: 86
subsystem: ui
tags: [decide, step1, item-type, custom, D-81]
requires: [05-58, 05-61, 05-65, 05-68, 05-73, 05-80, 05-83]
provides:
  - itemTypeDisplay copy helper
  - Step 1 item type chip group with Custom... and Treat like
  - custom item type name in Assumptions and the decision detail
affects: [05-87]
key-files:
  created:
    - src/features/decide/copy/itemTypeCopy.ts
    - src/features/decide/copy/__tests__/itemTypeCopy.test.ts
    - src/features/decide/check/steps/__tests__/step1Custom.test.tsx
  modified:
    - src/features/decide/check/steps/Step1Item.tsx
    - src/features/decide/check/steps/__tests__/Step1Item.test.tsx
    - src/features/decide/check/sections/AssumptionsSection.tsx
    - src/features/decide/past/DecisionDetailSheet.tsx
    - src/features/decide/past/__tests__/DecisionDetailSheet.test.tsx
    - src/features/decide/ui/LabelValueRow.tsx
    - src/ui/Chip.tsx
decisions:
  - "The Custom name applies on every keystroke when its trimmed length is 1 to 40; an empty entry is not applied and, on blur with no name set, turns the range line warn1"
  - "A Treat like choice made before a name exists is held in local state and applied when the name is first applied"
  - "The Assumptions and decision detail rows show only when a custom type is set; a built-in type is the default and adds no row"
requirements: [DCU-30, DCU-02, DCU-20, DCU-25, DCU-27]
metrics:
  tasks: 2
  completed: 2026-10-23
---

# Phase 5 Plan 86: Custom item type with Treat like Summary

Step 1's item type is a wrapping chip group (six built-in types plus "Custom...") with the ⓘ explanations. A custom name of 1 to 40 characters is stored as `customItemType`, and the engine still gets only `treatLike ?? 'general'`. The name shows as user text under rule T (two lines, tail ellipsis, full name in the label) in the Step 1 chip, the Assumptions "Item type" row and the decision detail, with "treated like {type}" beneath it when Treat like is set.

## Tasks

| Task | Commit | Notes |
|------|--------|-------|
| 1. itemTypeDisplay, chip group, Custom and Treat like | 8e776f96 | tests "D-81 ..." in step1Custom and itemTypeCopy |
| 2. Name in Assumptions and decision detail | 824f9f25 | tests "D-81 Assumptions ..." and "D-81 the decision detail ..." |

## Verification

- `jest src/features/decide`: 98 suites, 1412 tests passed (includes the DCU-09 copy guards).
- `npm run typecheck` clean. eslint clean on every touched file (one existing `no-require-imports` warning in DecisionDetailSheet.test.tsx, not from this plan).

## Deviations from Plan

**1. [Rule 3] Chip and LabelValueRow take an optional line limit.** Rule T needs `numberOfLines={2}` with a tail ellipsis, which neither `src/ui/Chip.tsx` (`numberOfLines`) nor `LabelValueRow` (`valueLines`) offered. Both props are optional, so existing callers do not change.

**2. Dropdown count.** The acceptance grep `grep -c "Dropdown"` reads 2, not 1: the import line and the single `<Dropdown` use (the Treat like menu). There is no other Dropdown use.

**3. Detail-sheet test location.** The plan said to extend step1Custom.test.tsx with both renders. The decision detail needs the heavy mocks of DecisionDetailSheet.test.tsx, so its "D-81 the decision detail shows the custom name" test lives there. The Assumptions test is in step1Custom.test.tsx.

**4. Rows only for a custom type.** Adding an always-on "Item type" row to Assumptions shifted the fixed five visible rows and the "N assumptions" count and broke 9 existing tests. The rows show only when a custom type is set. This is the case R15.4 describes. If the user wants "Item type: General" shown for built-in types too, those tests need updating.

**5. Existing Step1Item test.** The old `Item type, Vehicle` dropdown trigger no longer exists; the secured-default test now presses the General chip directly.

## Known Stubs

None.

## Threat Flags

None. The name stays in check inputs; no analytics prop or notification text uses it.

## Device item

05-EXECUTION-NOTES "05-26 device checklist additions (Decide UX refresh)", entry 05-86: check the wrapping chip group and a 40-character name on the XR and a Pixel, and the Treat like menu.

## Self-Check: PASSED
