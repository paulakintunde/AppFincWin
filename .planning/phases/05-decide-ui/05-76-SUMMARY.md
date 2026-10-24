---
phase: 05-decide-ui
plan: 76
subsystem: ui
tags: [decide, quick-check, D-78, D-71, D-70, D-76, R2b]
requires: [05-54, 05-55, 05-58, 05-61, 05-83]
provides:
  - Quick-check duration 1 to 120 months through useQuickCheck.setTerm
  - Trimmed R2b card: pill-only idle, toggle and result with a result, Clear text button
affects: [05-26 device checklist]
key-files:
  modified:
    - src/features/decide/quick/useQuickCheck.ts
    - src/features/decide/quick/QuickCheckForm.tsx
    - src/features/decide/quick/QuickResult.tsx
    - src/features/decide/quick/__tests__/useQuickCheck.test.ts
    - src/features/decide/quick/__tests__/QuickCheckForm.test.tsx
decisions:
  - "setTerm keeps the 1..DURATION_MAX bound in the hook (T-05-76-01); out-of-range or non-integer input is ignored"
  - "Cash with no combine pill and no one-open-check line renders no footer row at all"
  - "Run the full check is a local ink Pressable (flex 1, 48 high) because Pill has no ink variant or flex"
requirements: [DCU-01, DCU-12, DCU-26, DCU-25, DCU-27, DCU-10]
metrics:
  tasks: 2
  completed: 2026-10-23
---

# Phase 5 Plan 76: Quick-check card trimmed (R2b) Summary

The quick check is one pill until it has an answer. With a result it shows the Cash / Credit toggle, the result block, and in Credit the APR field (beforeInterest info button, 0 to 999.99% range line), the Over {n} months chips with Custom 1 to 120, "+ Tax, fees" with a chevron (sales tax capped at 100% with a range line), then "Run the full check" and a "Clear" text button.

## Tasks

| Task | Commit | Notes |
|------|--------|-------|
| 1. Duration 1-120 in the hook | d48f5071 | setTerm bound in the hook; 90 months reaches loan.termMonths |
| 2. Trimmed card, result block, Clear, info buttons | d6fcd38d | R2b layout, 9 named tests plus a custom-duration test |

## Verification

- `jest src/features/decide/quick`: 46 passed (both files).
- `jest src/features/decide src/app`: 1355 passed, 3 failed in two suites outside this plan (see below).
- `npm run typecheck` clean; eslint clean on `src/features/decide/quick`.
- Full `npm run test:coverage` not run (other executors share the worktree). Task 1 changed no snapshot file, so snapshot coverage is unaffected.

## Deviations from Plan

**1. [Rule 3 - Blocking] Tests need a SafeAreaProvider.** The size and combined info sheets mount in the result block and InfoSheet reads safe-area insets, so `QuickCheckForm.test.tsx` now wraps renders in `SafeAreaProvider` with fixed metrics. Home and onboarding suites already pass unchanged.

**2. Chip checked state.** The duration chips are `Chip` (accessibilityState `selected`), not radio `checked`, so the existing term assertions were moved to `selected`.

**3. Ink button.** Pill cannot be ink or flex, so Run the full check is a local Pressable with `colors.ink` and `colors.surface` text (both existing tokens).

## Out-of-scope failures (not fixed)

`check/sections/__tests__/depthSections.test.tsx` and `tableSections.test.tsx` fail (3 tests). They are in files owned by other executors in this worktree and do not touch the quick check.

## Device items

05-EXECUTION-NOTES "05-26 device checklist additions (Decide UX refresh)", entry 05-76: Credit result block ends at or above y 562 at 402 x 874 with the footer last; six duration chips wrap to two rows; Check it pill sits inside the amount pill with 6 inset; placeholder short form under 360 or above 1.3x.

## Known Stubs

None.

## Self-Check: PASSED
