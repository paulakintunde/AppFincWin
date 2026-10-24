---
phase: 05-decide-ui
plan: 113
subsystem: decide-ui
tags: [D-99, R17.3, pushed-screens]
requires: [05-109]
provides:
  - app/(app)/decide/open, changes, lines routes (registered in the (app) stack)
  - OPEN_HREF, CHANGES_HREF, LINES_HREF in checkHref.ts
  - OpenChecksScreen, ChangesScreen, LinesScreen on DetailScreen chrome
key-files:
  created:
    - app/(app)/decide/open.tsx
    - app/(app)/decide/changes.tsx
    - app/(app)/decide/lines.tsx
    - src/features/decide/home/OpenChecksScreen.tsx
    - src/features/decide/home/ChangesScreen.tsx
    - src/features/decide/home/LinesScreen.tsx
    - src/features/decide/home/__tests__/listScreens.test.tsx
  modified:
    - app/(app)/_layout.tsx
    - src/features/decide/home/checkHref.ts
    - src/features/decide/home/OpenChecksCard.tsx
    - src/features/decide/home/ChangesCard.tsx
    - src/features/decide/home/LinesCard.tsx
metrics:
  tasks: 2
  completed: 2026-10-24
---

# Phase 5 Plan 113: Pushed list screens Summary

Open checks, Changes coming up and Lines you will not cross each have a pushed DetailScreen that wraps the shipped card, so swipe and ⋯ Delete with confirm and Undo, the changed markers, combine, the add links, ChangeSheet and the limit editor all keep working.

## Commit

| Tasks | Commit |
|-------|--------|
| 1 and 2 (one commit: the shared test file covers all three screens) | 8bef9708 |

## Design notes

- Titles reuse existing keys (`decide.open.heading`, `decide.depth.changes.heading`, `decide.lines.heading`); no new copy, so nothing depended on 05-110.
- The cards gained small opt-in props, defaults unchanged for the home: `showWhenEmpty` on OpenChecksCard and ChangesCard (heading and links stay with no rows, list omitted), `flat` on LinesCard (sub-copy and five rows, no FoldRow). These touch three files not in the plan's files_modified list.
- Screens use `useDecideHomeViewModel`, so each also runs the wait-reminder reconcile effect (idempotent).

## Verification

- `npx jest src/features/decide/home`: 8 suites; all passed after fixing my own test fixture (listScreens 6/6 passing).
- eslint on `src/features/decide/home` and `app/(app)/decide`: 0 errors (require-import warnings only, same as existing tests).
- `npm run typecheck`: the only errors are in `src/features/decide/home/homeProblems.ts` (another executor's uncommitted work, `label`/`dot` on the problem union); none in my files. Left alone.
- depcruise and full lint not run.

## Deviations

None beyond the card props above and committing both tasks together.

## Device item

05-EXECUTION-NOTES entry 05-113 (not edited here): each pushed screen shows a back arrow, swipe-deletes with confirm and Undo, and Lines rows open the limit editor.

## Known Stubs

None. The home does not link to these routes yet (05-117).

## Self-Check: PASSED
