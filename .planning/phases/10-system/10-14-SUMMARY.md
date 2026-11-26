---
phase: 10-system
plan: 14
requirements: [ACC-10, DAT-04]
key-files:
  modified:
    - src/services/account/deleteAccount.ts
    - src/features/auth/signOut.ts
    - src/features/you/DeleteAccountScreen.tsx
---
# Phase 10 Plan 14: Account deletion flow Summary

Deletion now follows D-17..D-20: optional "Save a copy of my records" (exportCsv), Google forgotten after server confirmation with the pre-captured email, backup-window line, and the `deleted` sign-out reason.

## Tasks
1. Service: order isOnline -> getEmail -> invoke -> forgetGoogle(email) -> setSignOutReason('deleted') -> signOut(wipe). Null email skips forgetGoogle; forgetGoogle/getEmail failures never block the wipe.
2. Screen: fill1 card with download IconTile and secondary Pill, Preparing/saved/failed states (failed uses soft WarningCard + hapticFailed once), backup line before the typed confirm. Delete readiness is independent of copy state.

## Deviations
- [Rule 1] `performSignOut` overwrote any pre-set reason with 'local' unless 'remote'; it now also keeps 'deleted' (src/features/auth/signOut.ts), otherwise the deleted reason would never reach the signed-out screen.
- WarningCard has tones hard/soft (no "tight"); used soft with the failure text as title and empty value/body.

## Tests
`npx jest --no-watchman -i src/services/account src/features/you/__tests__/DeleteAccountScreen.test.tsx src/features/auth`: 7 suites, 72 tests pass.

## Notes
The signed-out screen text 'Your account was deleted.' (system.ownData.deleted) is not rendered by this plan; the reason is recorded, consumption belongs to the signed-out screen (10-12 area). No STATE/ROADMAP edits.
