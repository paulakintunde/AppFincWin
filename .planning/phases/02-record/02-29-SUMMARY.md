---
phase: 02-record
plan: 29
subsystem: routing
tags: [expo-router, routes, undo-toast]
requires: [02-21, 02-23, 02-24, 02-25, 02-27, 02-28]
provides: [record-routes, app-wide-undo-toast]
affects: [02-30]
key-files:
  created:
    - app/(app)/activity.tsx
    - app/(app)/accounts/index.tsx
    - app/(app)/accounts/[id].tsx
    - app/(app)/categories.tsx
    - app/(app)/history.tsx
    - app/(app)/import.tsx
    - src/features/record/__tests__/routes.test.tsx
  modified:
    - app/(app)/_layout.tsx
metrics:
  tasks: 2
  completed: 2026-10-06
---

# Phase 2 Plan 29: Record routes and toast host Summary

Six thin Expo Router routes expose every Record screen in the signed-in `(app)` group, and `UndoToastHost` is mounted exactly once beside the Stack in the signed-in layout.

## Commits
- f7a7d30 test(02-29): failing routing test (RED, failed on missing route modules)
- 6b1e376 feat(02-29): routes + layout (GREEN)

## What was built
- Routes: activity, accounts (index and `[id]`), categories, history, import. Import validates `entry` against the three literals (anything else becomes `you`) and passes `accountId ?? null` (T-02-29-01). Done returns to `/activity` via `router.replace`.
- Layout: existing consent gating untouched. The Stack is wrapped in a `View flex:1` with `<UndoToastHost />` after it, and the new routes are declared as Stack screens. Still the JS Stack; no tabs or `unstable-native-tabs` (Phase 3 owns navigation chrome).
- Test (8 cases): entry mapping, onDone, account-detail import push params, activity navigation, one host in the layout.

## Review follow-ups
- Item 9 (screen reader, no auto-dismiss) and item 10 (label text): already handled inside `UndoToastHost` (02-28); the layout needs no props for them. Nothing to add here. Mounted once as 02-28's summary requires.
- Preconditions (YouScreen, `app/(app)/_layout.tsx`, QueryProvider) were present.

## Deviations from Plan
- [Rule 3] Test uses `await render(...)`: the installed RNTL render is async (the plan's snippet implied sync).
- Layout additionally declares the new routes as `Stack.Screen` entries (plan only required the wrapper and host). Harmless; keeps explicit route names.
- Test file carries 7 eslint warnings (require-style jest.mock factories, import/first) but zero errors; this matches the existing test style.

## Verification
- `npx jest src/features/record/__tests__/routes.test.tsx`: 8 passed
- `npm run typecheck`: clean. `npm run depcruise`: no violations. `npx eslint` on app/(app) and the test: 0 errors.

## Known Stubs
None.

## Self-Check: PASSED
All seven created files exist; commits f7a7d30 and 6b1e376 exist.
