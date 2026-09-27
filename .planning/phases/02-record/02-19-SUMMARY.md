---
phase: 02-record
plan: 19
subsystem: ui
tags: [react-native, design-system, accessibility, i18next]

requires:
  - phase: 02-record
    provides: "02-10: categorySwatch theme map, radii.sheetTop (28), space.rowPadDense (13), fontSize.amountDisplay (44), i18n a11y.close/a11y.dismiss/a11y.swatch/categories.swatch.* keys"
provides:
  - "Sheet: Modal-based bottom sheet container (28px top radius, backdrop + Android-back dismiss, KeyboardAvoidingView) that every Record sheet composes from"
  - "SheetHeader, ConfirmSheet, ToastView, EmptyState: token-only sheet/toast/empty-state primitives"
  - "Row, Pill, Chip, SwatchDot, CategoryGlyph, AmountDisplay: token-only list/form primitives, all >= 44px touch targets"
  - "textRole(pairing, 'sheetTitle') text role (16/600/lh1.2/-0.01em) in src/theme/typography.ts"
affects: ["02-20", "02-21", "02-22", "02-23", "02-24", "02-25", "02-26", "02-27", "02-28", "02-29", "02-30"]

tech-stack:
  added: []
  patterns:
    - "Sheet is a plain Modal-based component with the exact props Phase 3 (NAV-03) will need when it swaps internals for @gorhom/bottom-sheet"
    - "Chevron and toast-dismiss glyphs are hand-drawn rotated-border/rotated-bar Views, never an icon font (Phase 0 convention, no react-native-vector-icons dependency)"
    - "Decorative glyph-only Views (CategoryGlyph) are hidden from the accessibility tree via accessible={false} + importantForAccessibility='no-hide-descendants' so a screen reader isn't double-announced a bare letter next to a row's own semantic label"

key-files:
  created:
    - src/ui/Sheet.tsx
    - src/ui/SheetHeader.tsx
    - src/ui/ConfirmSheet.tsx
    - src/ui/ToastView.tsx
    - src/ui/EmptyState.tsx
    - src/ui/Row.tsx
    - src/ui/Pill.tsx
    - src/ui/Chip.tsx
    - src/ui/SwatchDot.tsx
    - src/ui/CategoryGlyph.tsx
    - src/ui/AmountDisplay.tsx
    - src/ui/__tests__/recordPrimitives.test.tsx
  modified:
    - src/theme/typography.ts

key-decisions:
  - "Pill.tsx was built in full during Task 1 (not Task 2, where the plan's file list places it) because ConfirmSheet needs it immediately; Task 2 only extended its test coverage"
  - "ToastView's outer alert View carries an explicit accessible={true} alongside accessibilityRole='alert', since @testing-library/react-native's isAccessibilityElement() (and, by the same logic, assistive tech) does not treat a plain View as an accessibility element merely from accessibilityRole/accessibilityLiveRegion without an explicit accessible prop"

patterns-established:
  - "Every new src/ui primitive resolves colour/type/size only through useTheme()/textRole()/space/radii/fontSize -- verified by a zero-hit grep for hex/rgba literals across all 11 new files"

requirements-completed: [REC-01, REC-07, ACT-01]

duration: ~55min
completed: 2026-09-27
---

# Phase 02 Plan 19: Record list/sheet primitives Summary

**Eleven token-only React Native primitives (Sheet, SheetHeader, ConfirmSheet, ToastView, EmptyState, Row, Pill, Chip, SwatchDot, CategoryGlyph, AmountDisplay) plus a new `sheetTitle` text role, giving every later Phase 2 Record screen one shared component set instead of per-screen restyling.**

## Performance

- **Duration:** ~55 min
- **Tasks:** 2 completed
- **Files modified:** 13 (12 created, 1 modified)

## Accomplishments
- Built the complete list/sheet primitive set the UI-SPEC calls out as "build them once, reuse across every Record screen" -- nothing in a later Record screen plan needs to re-style a row, pill, chip or sheet
- Every primitive resolves colour and size only through the theme/layout tokens (verified: zero raw hex/rgba literals across all 11 component files)
- Every tappable primitive is at least 44px tall/wide and carries an accessibility role and label; SwatchDot, Pill and Chip additionally expose `accessibilityState.selected`/`disabled`
- Sheet is a plain Modal-based container with exactly the props Phase 3 (NAV-03) will need when it swaps internals for `@gorhom/bottom-sheet` with drag-to-dismiss
- 32 tests added, all green, alongside the full existing `src/ui`/`src/theme` suite (85 tests, 11 suites)

## Task Commits

Each task was committed atomically, following the plan's TDD requirement:

1. **RED (both tasks):** `e78dcd8` (test) -- added the full `recordPrimitives.test.tsx`, confirmed failing (every import unresolved)
2. **Task 1: Sheet, SheetHeader, ConfirmSheet, ToastView, EmptyState + sheetTitle role** - `7d409d1` (feat)
3. **Task 2: Row, Pill, Chip, SwatchDot, CategoryGlyph, AmountDisplay** - `8df7023` (feat)

_No REFACTOR commit was needed -- the GREEN implementations required no follow-up cleanup._

## Files Created/Modified
- `src/theme/typography.ts` - added `'sheetTitle'` to `TextRole` and its resolver case (16px/600 weight/lh 1.2/letter-spacing -0.16)
- `src/ui/Sheet.tsx` - Modal-based bottom sheet: backdrop dismiss, Android back dismiss, 28px top radius (`radii.sheetTop`), `KeyboardAvoidingView` on iOS
- `src/ui/SheetHeader.tsx` - sheetTitle-role title + labelled Cancel control
- `src/ui/ConfirmSheet.tsx` - body text + two Pill actions built on Sheet; destructive variant renders danger text
- `src/ui/ToastView.tsx` - ink surface, `radii.pill`, `accessibilityRole="alert"` + `accessibilityLiveRegion="polite"`, optional action control, dismiss control (rotated-bar "×" glyph, no icon font)
- `src/ui/EmptyState.tsx` - heading (body role) + body (muted label role)
- `src/ui/Row.tsx` - label/value/leading node/chevron, 44px min height, dense vs regular padding, becomes a button when `onPress` is provided
- `src/ui/Pill.tsx` - primary/secondary/danger variants, selected border, disabled state
- `src/ui/Chip.tsx` - fill1 inactive, accentTint1 + accent text when selected
- `src/ui/SwatchDot.tsx` - renders `categorySwatch[colorKey].color`, 44x44 touch target, `a11y.swatch` + `categories.swatch.*` label
- `src/ui/CategoryGlyph.tsx` - 11px-radius tinted tile with a colour letter, hidden from the accessibility tree (decorative)
- `src/ui/AmountDisplay.tsx` - `fontSize.amountDisplay` (44), weight 500, letter-spacing -0.04em, danger tone
- `src/ui/__tests__/recordPrimitives.test.tsx` - 32 tests covering all 11 components plus the new `sheetTitle` role

## Decisions Made
- **Pill built during Task 1, not Task 2** (deviation, documented below) -- ConfirmSheet needs it immediately, so it was implemented in full (all variants, selected/disabled) as part of Task 1's GREEN commit rather than left stubbed
- **ToastView's alert View is explicitly `accessible={true}`** -- without it, `accessibilityRole`/`accessibilityLiveRegion` alone don't register the View as an accessibility element to either the test tooling or, by the same underlying logic, assistive technology
- **CategoryGlyph is hidden from the accessibility tree** (`accessible={false}` + `importantForAccessibility="no-hide-descendants"`) since it always sits beside a row's own semantic category-name label; surfacing the bare letter too would double-announce with no added information

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking dependency] Built Pill.tsx during Task 1 instead of Task 2**
- **Found during:** Task 1 (ConfirmSheet implementation)
- **Issue:** The plan's Task 1 action explicitly says "ConfirmSheet built on Sheet + Pill", but `Pill.tsx` is listed under Task 2's files, not Task 1's -- ConfirmSheet cannot compile or render its two actions without Pill existing first
- **Fix:** Implemented Pill.tsx in full (primary/secondary/danger variants, selected border, disabled state, 44px min height) as part of Task 1's GREEN commit. Task 2 then only needed to add test coverage for the remaining variant/selected/disabled behaviour -- no additional Pill code was needed
- **Files modified:** src/ui/Pill.tsx (created one task earlier than the plan's file list implies)
- **Committed in:** `7d409d1` (Task 1 commit)

**2. [Rule 1 - Bug] `StyleSheet.absoluteFillObject` does not exist on the installed RN types**
- **Found during:** Task 1 (Sheet.tsx implementation), caught by `npm run typecheck`
- **Issue:** Used `StyleSheet.absoluteFillObject` for the Sheet backdrop's full-screen style, which does not exist on this RN version's `StyleSheet` type (only `StyleSheet.absoluteFill` does)
- **Fix:** Changed to `StyleSheet.absoluteFill`
- **Files modified:** src/ui/Sheet.tsx
- **Committed in:** `7d409d1` (Task 1 commit)

**3. [Rule 1 - Bug] Two `fireEvent.press` calls in one test leaked a Pressability timer into the next test**
- **Found during:** test-file authoring (RED/GREEN verification), before the `test(...)` commit
- **Issue:** `ConfirmSheet`'s and `ToastView`'s first draft tests each pressed two different controls (Delete then Cancel; Undo then Dismiss) within a single `it()`. This left a pending React Native Pressability-internal timer that fired into the *next* test's render, throwing "overlapping act() calls" and cascading `Unable to find element` failures across every subsequent test in the file (reproduced in isolation with `-t` filters to confirm the exact trigger)
- **Fix:** Split each into one press per test (one test per action). No production code changed -- this was purely a test-authoring fix, applied before the test file's RED/GREEN commit, so it does not appear as a separate commit
- **Files modified:** src/ui/__tests__/recordPrimitives.test.tsx (already reflected in the committed test file)

**4. [Rule 1 - Bug] `getByRole('alert')` and `getByText` on a hidden element didn't match in tests**
- **Found during:** test-file authoring
- **Issue:** (a) `@testing-library/react-native`'s `isAccessibilityElement()` doesn't treat a plain `View` as queryable by role unless it carries an explicit `accessible` prop, even with `accessibilityRole` set -- ToastView's alert `View` needed `accessible` added; (b) `CategoryGlyph`'s intentionally-hidden container excludes its child `Text` from default RNTL queries
- **Fix:** (a) added `accessible` to ToastView's outer View (also a genuine accessibility correctness fix, not just a test workaround); (b) the CategoryGlyph test uses `getByText('G', { includeHiddenElements: true })` to still assert its styling without changing the intentional accessibility hiding
- **Files modified:** src/ui/ToastView.tsx, src/ui/__tests__/recordPrimitives.test.tsx
- **Committed in:** `7d409d1` (ToastView fix), test file already reflects the query fix

---

**Total deviations:** 4 auto-fixed (1 blocking-dependency reorder, 3 bugs -- 1 production type error, 1 test-authoring timer leak, 1 test-query/accessibility correctness fix)
**Impact on plan:** All auto-fixes were necessary to complete the plan's own stated behaviour (ConfirmSheet needs Pill; Sheet must typecheck; the test suite must be stable and green). No scope creep -- no new components or props beyond what the plan specified.

## Issues Encountered
- First `npx jest` invocation in this worktree took several minutes (cold Babel/jest-expo transform of node_modules); subsequent runs were fast. Not a defect, just first-run cold-start cost noted for future executors in this environment.
- `node_modules` was missing in the fresh worktree; ran `npm ci --legacy-peer-deps` first (~8 min), per the parallel-execution setup instructions.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

All 11 primitives and the `sheetTitle` text role are available for every remaining Phase 2 UI plan (02-20 through 02-30) to compose from directly -- no screen plan needs to build or restyle its own row, pill, chip, swatch or sheet. `npm run typecheck`, `npm run depcruise` and `npx eslint` all pass clean on the full project with these files included. No blockers identified for downstream plans.

---
*Phase: 02-record*
*Completed: 2026-09-27*

## Self-Check: PASSED

- FOUND: all 12 created/modified files (src/theme/typography.ts, src/ui/Sheet.tsx, src/ui/SheetHeader.tsx, src/ui/ConfirmSheet.tsx, src/ui/ToastView.tsx, src/ui/EmptyState.tsx, src/ui/Row.tsx, src/ui/Pill.tsx, src/ui/Chip.tsx, src/ui/SwatchDot.tsx, src/ui/CategoryGlyph.tsx, src/ui/AmountDisplay.tsx, src/ui/__tests__/recordPrimitives.test.tsx)
- FOUND: `e78dcd8` (test commit)
- FOUND: `7d409d1` (Task 1 commit)
- FOUND: `8df7023` (Task 2 commit)
