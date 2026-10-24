---
phase: 05-decide-ui
plan: 58
subsystem: ui
tags: [decide, info, sheet, a11y, D-70]
requires: [05-54]
provides:
  - InfoGlyph and InfoButton (16pt drawn glyph, 44pt target, selection haptic)
  - InfoSheet (term, body, What this changes tile, Close) on the app Sheet
  - useInfoSheet (button, sheet, aboutAction, onAccessibilityAction)
  - InfoLabel (rule I: the button is the next flex sibling of its label)
affects: [wave 12 screen plans]
key-files:
  created:
    - src/features/decide/ui/InfoButton.tsx
    - src/features/decide/ui/InfoLabel.tsx
    - src/features/decide/ui/InfoSheet.tsx
    - src/features/decide/ui/useInfoSheet.tsx
    - src/features/decide/ui/__tests__/InfoButton.test.tsx
decisions:
  - "InfoButton is a plain Pressable, not a Pill, so a ReadOnlyScope never disables it on a decided check"
  - "InfoSheet wraps its content in ReadOnlyScope value=false so its own Close pill stays live when the sheet mounts inside a locked check"
  - "The cushion reason is resolved with refText and passed as the reason param of the last body ref"
requirements: [DCU-25, DCU-09]
metrics:
  tasks: 2
  completed: 2026-10-23
---

# Phase 5 Plan 58: Info primitives Summary

The D-70 explanation kit: a hand-drawn info glyph and button, a shared InfoSheet driven entirely by `infoCopy`, a `useInfoSheet` hook that pairs them and exposes an 'about' accessibility action, and an `InfoLabel` row that places the button by rule I.

## Tasks

| Task | Commit | Notes |
|------|--------|-------|
| 1. InfoGlyph, InfoButton, InfoLabel | 3739b37f | label "About {term}", hint, hitSlop 14, selection haptic, no absolute or negative margins |
| 2. InfoSheet, useInfoSheet | 3739b37f | focus to the heading on open, back to the button on close, never dirty, no fixed height |

Both tasks landed in one commit because the shared test file covers both and the tasks were built together.

## Verification

- `npx jest src/features/decide/ui src/features/decide/copy`: 14 suites, 201 tests pass (9 in InfoButton.test.tsx).
- typecheck clean, eslint on `src/features/decide/ui` clean, depcruise clean.
- Acceptance greps: absolute/negative-margin count 0; `maxHeight|height:` in InfoSheet 0; `infoCopy(` present.
- Full `npm run lint` and the whole-repo test run were not run (other executors are changing files in the same worktree).

## Deviations from Plan

**1. [Rule 3 - Blocking] Close pill and read-only scope** - Pill disables itself inside a ReadOnlyScope, and the sheet mounts in the caller's tree, so on a decided check Close would be inert. InfoSheet resets the scope to false for its content. Covered by the 'stays active on a decided check' test.

**2. [Rule 3 - Blocking] Test shape** - RNTL here has no `UNSAFE_getByType`, and a manual `unmount()` between two Sheet renders broke the following tests; the 44pt check reads hitSlop, and the cushion cases are two tests. Test strings sit in constants for the no-literal-string lint rule.

Otherwise as written. No migrations, no Supabase calls.

## Device items

05-EXECUTION-NOTES entry 05-58: the info button beside its label at the text-fit matrix; TalkBack reads "About {term}, button"; focus lands on the term and Close returns it; an info sheet stacks over the card terms sheet.

## Self-Check: PASSED
