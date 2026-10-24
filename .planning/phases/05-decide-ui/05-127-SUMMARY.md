---
phase: 05-decide-ui
plan: 127
subsystem: decide pots UI
tags: [pots, D-101, R18.2, DCU-36]
requires: [05-122, 05-124, 05-125, 05-131]
provides: [PotsScreen, PotRow, PotSheet, /decide/pots route, potsModel]
affects: [05-129, 05-134]
key-files:
  created:
    - app/(app)/decide/pots.tsx
    - src/features/decide/pots/PotsScreen.tsx
    - src/features/decide/pots/PotRow.tsx
    - src/features/decide/pots/PotSheet.tsx
    - src/features/decide/pots/potsModel.ts
    - src/features/decide/pots/usePots.ts
    - src/features/decide/pots/__tests__/potsModel.test.ts
    - src/features/decide/pots/__tests__/PotsScreen.test.tsx
    - src/features/decide/pots/__tests__/PotSheet.test.tsx
  modified:
    - app/(app)/_layout.tsx
    - src/features/decide/__tests__/decideTextFit.test.ts
requirements: [DCU-36]
completed: 2026-10-24
---

# Phase 5 Plan 127: Pots UI Summary

The Pots screen, sheet, row and route: a user can add, edit, mark done, reopen and delete pots (one undo step each), see what each takes a month from `potSetAside`, and every state (loading, error, empty, populated, done fold) is handled.

## What was built
- `potsModel.ts` (pure): per-row display state and line 3 from `potSetAside`; summary total and count; the 50-pot add limit (`MAX_POTS`, plain pots only); `lastDayOfMonth`, the month window (this month to +50 years, an existing pot's own month stays valid when unchanged).
- `usePots.ts`: reads the pots view and tagged transfer lines; a pot in a non-home currency converts at the latest stored rate (target and opening via `convertLatest`), else the row reads "Waiting for a {{currency}} rate".
- `PotRow.tsx`: name clamped to two lines, `GoalProgress` bar and caption, line 3 by state (past due in `warn1` with a dot, never red), the ⋯ menu through the shared `Dropdown`, swipe-left Delete for plain pots only; a Wait pot has Mark done / Reopen only and no swipe; per-state row a11y labels.
- `PotsScreen.tsx`: heading with ⓘ, `+ Pot` (hidden until loaded and at 0, disabled with "Up to 50 pots" at 50), summary line, one white list, closed Done fold, skeleton, list error with `decide.flow.retry`, empty state with one primary "Add a pot". A Wait pot opens the existing `DecisionDetailSheet`; a plain pot opens `PotSheet`.
- `PotSheet.tsx`: Name, Target, By (month, stored as the last day of the month), Already saved (blank is 0), polite live-region preview from `potSetAside` settled with `useSettledLabel`, discard question when dirty, edit mode with saved-so-far note, tagged transfers with 44 px untag and Tag a transfer (AttachLineSheet in transfer mode). Edits send only changed fields.
- Route `app/(app)/decide/pots.tsx` wrapped in `GoalTagEditProvider`, registered in the app stack.
- Toasts (`destructive`, about 6 s, with Undo): Pot saved, Pot deleted, Marked done, Reopened.

## Verification
- `npx jest src/features/decide/pots`: 3 suites, 28 tests pass (all named D-101 acceptance tests present).
- `npx jest src/features/decide/__tests__/decideTextFit.test.ts`: 6 pass.
- eslint on the plan's files: 0 errors (5 `require()` warnings in the test mocks, the repo's usual pattern).
- `npm run depcruise`: no violations.
- typecheck: 0 errors.

## Deviations from Plan
1. **[Rule 3] `app/(app)/_layout.tsx`**: one line, `<Stack.Screen name="decide/pots" />`, so the pushed route is registered like `decide/lines`.
2. **No ⋯ GEOMETRY_HEIGHT entry.** The ⋯ 44 x 44 target is the shared `Dropdown` glyph trigger (outside `features/decide`), so PotRow has no `height:` to count. Added entries: `pots/PotRow.tsx` user-name 1 and `pots/PotsScreen.tsx` height 1 (skeleton bars).
3. **Caption wording.** The bar reuses `GoalProgress` as the plan says, so its caption reads "{{saved}} of {{target}} saved" and its a11y value "{{pct}} percent" (the existing `decide.depth.goal.*` keys), not `pots.caption`. The `pots.caption` / `pots.progressA11y` keys are unused by this screen.
4. **Done fold preview is empty** (`FoldRow` requires a preview; the spec gives none), so its a11y label ends with a trailing separator.
5. The set-aside marker for a past-due row is the character "●" in the text (a drawn dot would add a `height:` to the rule F allowlist).

## Known Stubs
None.

## Notes
- The "Undo restores the row" test asserts the toast carries the mutation's undo step id (the undo host and mutation pairs are tested in 05-122); the screen has no undo logic of its own.
- A non-home-currency pot converts target and opening at the latest stored rate on this screen with `convertLatest` (builder rounds target up and opening down; this display uses `convertLatest`'s own rounding). Only matters after a home-currency change.
- Device item: 05-EXECUTION-NOTES entry 05-127 (not edited here); the requirement DCU-36 is not ticked (the device check is outstanding).

## Self-Check
PASSED. Commits 99000a69, 8d495586 exist; files present; ROADMAP diff is the single 05-127 tick.
