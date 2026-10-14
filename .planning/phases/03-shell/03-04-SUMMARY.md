---
phase: 03-shell
plan: 04
subsystem: i18n
tags: [i18n, copy, shell, home]
requires: []
provides:
  - "shell.*, sheet.discard.*, refresh.*, home.* typed catalogue keys"
affects: [shell, home]
key-files:
  created: [src/shell/__tests__/shellCopy.test.ts]
  modified: [src/i18n/locales/en.ts, src/i18n/copyStatus.ts]
requirements-completed: [NAV-01, NAV-04, NAV-05, NAV-06, HOME-01, HOME-02, HOME-03, HOME-04]
duration: ~20min
completed: 2026-10-13
---

# Phase 3 Plan 04: Shell and Home copy contract Summary

Added the full Phase 3 copy contract (tabs, FAB, quick add, discard dialog, refresh toasts, Home) to the typed English catalogue, pinned by an exact-string test that also rejects "advice", "recommend" and "you should".

## Tasks
1. Copy keys, draft registration, copy test: commit f91ac94.

## Verification
Jest (shellCopy plus src/i18n: 6 suites, 3076 tests), tsc --noEmit and eslint on the changed files all passed.

## Deviations from Plan
None. The worktree node_modules junction could not be re-pointed to fincwin-p3 (the sandbox refused the powershell call); the existing junction to fincwin-w1 worked for all checks.

## Self-Check: PASSED
