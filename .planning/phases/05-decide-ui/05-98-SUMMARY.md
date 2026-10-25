---
phase: 05-decide-ui
plan: 98
subsystem: shell
tags: [you, fab, quick-actions, D-85, R16.1]
requires: [05-88, 05-97]
provides:
  - runQuickActionAfterDismiss(id, { dismissTo, onTransitionEnd, handlers })
  - You "Add" group (Add expense, Add income, Transfer, Import statement, New check)
affects: []
key-files:
  created:
    - src/shell/fab/runQuickActionAfterDismiss.ts
    - src/shell/fab/__tests__/runQuickActionAfterDismiss.test.ts
  modified:
    - src/features/you/YouScreen.tsx
    - src/features/you/__tests__/YouScreen.test.tsx
decisions:
  - "The origin tab root is the last tab entry in the back history (else Activity); You's own navigation transitionEnd with closing=true is the signal, since You is an outer-stack screen and cannot reach the tab root's navigation object"
  - "A 1 s timer fallback runs the handler if transitionEnd never fires, so a tap is never lost; the handler still runs once"
requirements: [NAV-05, REC-01, REC-02, REC-09, DCU-01]
metrics:
  tasks: 1
  completed: 2026-10-23
---

# Phase 5 Plan 98: You Add group Summary

You now opens with an "Add" group whose five rows close You back to the tab root it came from and then run the same handler as the FAB quick action once the dismissal transition ends. A row with no registered handler is hidden, and the old Money import row is gone.

## Tasks

| Task | Commit | Notes |
|------|--------|-------|
| 1. runQuickActionAfterDismiss and the Add group | 94245204 | handlers come from `useFab().quickActions`; rows use `moneyRow` with `PRESSED_OPACITY`, button role and the R16.1 hints; tokens only |

## Verification

- `npx jest src/features/you src/shell/fab`: 11 suites pass (YouScreen 22 tests after a test fix).
- Named tests present: `D-85 the Add group is first with five rows`, `D-85 a row closes You, then runs the quick action after the transition`, `D-85 a row without a handler is hidden`, `D-85 the Money group has no import row`, plus three `D-85` helper tests.
- eslint on `src/features/you` and `src/shell/fab`: clean.
- `npm run typecheck`: one error, `src/features/decide/snapshot/checkInputs.ts(66,104) Cannot find name 'InstalmentFreq'`, another executor's in-flight work; none in this plan's files.

## Deviations from Plan

**1. [Rule 2 - Missing safety] 1 s timer fallback**
- If the stack never emits `transitionEnd` (for example a no-animation route), the action would be lost. The helper falls back to a timer; the handler still runs at most once. Not InteractionManager.

**2. Transition source**
- The plan says the tab root's `transitionEnd`; the tab root's navigation object is not reachable from the outer You screen, so You's own `transitionEnd` with `closing: true` is used. Needs a device check (below).

The `you.record.importCsv` string stays in en.ts (unreferenced; not in this plan's files).

## Device items

05-EXECUTION-NOTES "05-26 device checklist additions (Decide UX refresh)", entry 05-98: from each tab open You, tap each Add row; the sheet or route opens over the tab root you came from, with no sheet under a leaving screen. Confirm `transitionEnd` fires on both iOS and Android (otherwise the 1 s fallback is what runs).

## Known Stubs

None.

## Self-Check: PASSED
