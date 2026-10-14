---
phase: 03-shell
plan: 32
subsystem: shell
tags: [gap-closure, header, refresh, avatar, a11y]
requires: [03-25]
provides: [sync line in large header, offline refresh failed outcome, avatar fallback glyph]
key-files:
  modified:
    - src/shell/screen/useTabRootChrome.tsx
    - src/shell/screen/TabRootScreen.tsx
    - src/shell/refresh/useShellRefresh.ts
    - src/shell/header/AvatarButton.tsx
    - src/shell/header/TabHeader.tsx
    - src/shell/header/__tests__/TabHeader.fontScale.test.tsx
metrics:
  tasks: 2
  completed: 2026-10-14
---

# Phase 3 Plan 32: Shell chrome gap closure Summary

Large header now carries the problem-only sync line on every tab root, offline or paused refresh returns 'failed' with no toast, Home clears the FAB, and the avatar is a 44px target with a drawn person glyph and push guard.

## Commits
- b11b593: sync line in largeHeader, FAB_CLEARANCE padding, scheduleOnRN, narrowed refs eslint-disable, offline/paused refresh
- Task 2 commit (see git log, "avatar 44px target"): AvatarButton and TabHeader changes

## What changed
- G5/L10: `largeHeader` renders `<SyncProblemLine />`; TabRootScreen no longer renders its own. `runOnJS` replaced by `scheduleOnRN`. The file-level refs eslint-disable became a region disable around the JSX only (the rule flags every `chrome.*` use, so line-level would need six comments).
- H3: `runShellRefresh` returns 'failed' when `onlineManager` is offline or any key's fetchStatus is 'paused'; no toast.
- H8/M2: ScrollView `paddingBottom: FAB_CLEARANCE`.
- M5/H7/L3: hitSlop (44 - 42)/2, `pushOnce('/you')`, initial is the first code point upper-cased via `useDeviceLocale().locale`; two-View inkDim glyph (`avatar-person-glyph`) when empty.
- L12: eyebrow hidden from accessibility, title labelled "title, eyebrow".

## Deviations from Plan
**[Rule 3] TabHeader.fontScale.test.tsx and the existing eyebrow test** read the eyebrow with getByText; it is now hidden from accessibility, so they pass `includeHiddenElements: true`. The fontScale file was not in the plan's file list.

## Verification
- `npx jest --silent -w 3 src/shell`: 267 tests pass; 2 suites (TabBar.a11y, shellNavigation) fail to resolve expo-blur, which is environmental per the brief.
- tsc and eslint report only the expo-blur resolution error in TabBar.tsx (environmental). depcruise clean.

## Known Stubs
None.

## Self-Check: PASSED
