---
phase: 10-system
plan: 11
subsystem: lock
tags: [app-lock, pin, biometrics, securestore, expo-local-authentication]
requires: []
provides: [src/services/lock/*]
affects: [10-21 lock screens]
tech-stack:
  added: [expo-local-authentication ~57.0.2]
key-files:
  created:
    - src/services/lock/pin.ts
    - src/services/lock/lockStore.ts
    - src/services/lock/biometric.ts
    - src/services/lock/reauth.ts
    - src/services/lock/__tests__/pin.test.ts
    - src/services/lock/__tests__/lockStore.test.ts
    - src/services/lock/__tests__/reauth.test.ts
  modified: [package.json, app.config.ts, jest.setup.ts]
requirements-completed: [ACC-08, ACC-09]
completed: 2026-11-22
---

# Phase 10 Plan 11: Lock services Summary

Lock services for ACC-08/ACC-09: salted SHA-256 6-digit PIN in SecureStore (THIS_DEVICE_ONLY), 30 s to 15 min wrong-try ladder with re-sign-in at 10, persisted timing and backgroundedAt, strong-only biometrics with no device fallback, and the D-29 keep/wipe rule.

## Commits
- 78cb4afb, 3803c3bb: dependency pin, config plugin (faceIDPermission), virtual jest mock
- 428c3ba9: failing tests (RED)
- 871ceed5: implementation (GREEN)

## Verification
`npx jest src/services/lock`: 3 suites, 35 tests passed. ESLint and `tsc` not completed (see below).

## Orchestrator must do
- Run the real install (`npx expo install expo-local-authentication` or `npm install`) from a real checkout. node_modules was not touched and package-lock.json is unchanged. Until installed, `tsc` cannot resolve `expo-local-authentication` in biometric.ts; the jest mock is `virtual: true` so tests pass either way.
- The Face ID plugin needs a new dev build (cannot ship over OTA). Face ID string is draft copy for owner sign-off.

## Deviations
- Base: the worktree started at 7afd42f2; reset to the given base 493c04d9 as the brief instructs.
- Task 1 verify (`npm run typecheck`) not run: package not installed (see above). ESLint run was started but not awaited (slow on the junctioned node_modules).
- Test-side mocks for expo-secure-store and expo-crypto are local to the test files (jest.setup.ts has no global ones).
- checkPin with a malformed PIN counts as a wrong try (hash cannot match).

## Self-Check: PASSED (files and commits present)
