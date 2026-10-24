---
phase: 05-decide-ui
plan: 99
subsystem: shell, decide copy
tags: [navigation, copy, a11y, D-93]
requirements: [NAV-02, DCU-14]
key-files:
  modified:
    - src/shell/screen/useTabRootChrome.tsx
    - src/shell/header/TabHeader.tsx
    - src/shell/header/CompactHeader.tsx
    - src/shell/screen/__tests__/TabRootScreen.test.tsx
    - src/features/decide/copy/keyFiguresCopy.ts
    - src/features/decide/copy/foldCopy.ts
    - src/features/decide/copy/__tests__/keyFiguresCopy.test.ts
    - src/features/decide/copy/__tests__/foldCopy.test.ts
    - src/i18n/locales/en.ts
completed: 2026-10-23
---

# Phase 5 Plan 99: Tab-root back control and "Over 50 years" Summary

A tab root no longer shows the back control, and cushion or runway above 600 months reads "Over 50 years".

## Root cause (D-93.1)
`TabHeader` and `CompactHeader` showed "‹" whenever `useBackHistory().canGoBack` was true. That is the app-wide 8-deep history, which is non-empty after returning from Android Settings, after a reload onto a tab, or after opening Decide through a route push. A tab root has no stack to pop, so the history is the wrong signal. Both headers now take `showBack?: boolean` (omitted keeps the old rule). `useTabRootChrome`, the only consumer of both headers, passes `showBack={!isTabRoot}` with `isTabRoot = true`, since every screen built from the hook is a tab root under `(tabs)`.

## Tasks
1. `3e483d8d` no back control on a tab root (test `D-93 a tab root never shows a back control after a push and pop`, written red first).
2. `8e012f40`: `keyFigures` cushion above 600 gives "Over 50 years" (kind `words`, wraps), a11y "Cushion: over 50 years of costs"; `setbacksPreview` above 600 gives "Runway over 50 years". Boundary: 600 still reads "600 months".

## Deviations
- **[Rule 3] Added `decide.verdict.key.over50YearsSpoken` ('over 50 years') to `src/i18n/locales/en.ts`.** The a11y template reads "Cushion: {{months}} of costs", so the capitalised visible value would have produced "Cushion: Over 50 years of costs". The 05-88 `over50YearsA11y` string is a whole sentence and does not fit the template. The result matches the required text.
- The headers' "showBack" rule is a constant at the one consumer rather than a runtime route read, because nothing else renders these headers. A route read can be added if a non-tab consumer appears.

## Verification
- `npx jest src/shell` 29 suites / 307 tests pass; `npx jest src/features/decide/copy` 13 suites / 170 tests pass.
- `npm run typecheck` clean. eslint on `src/shell` and `src/features/decide/copy`: 0 errors, 2 pre-existing warnings in files not touched.
- No ROADMAP update was run.

## Device item
05-EXECUTION-NOTES "05-26 device checklist additions (Decide UX refresh)", entry 05-99: Decide root shows no "‹" after Settings return, reload onto a tab, and a route push.

## Self-Check: PASSED
