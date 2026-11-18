---
phase: 08-household
plan: 22
subsystem: account-deletion
tags: [edge-function, deno, supabase-auth-admin, compliance, household]
requires: [08-14, 08-17]
provides:
  - "supabase/functions/delete-account: service-role deletion of the verified caller, storage first"
  - "requestAccountDeletion: invoke, then sign out and wipe the device only after the server confirms"
  - "Delete my account screen at /delete-account and the red row at the end of You > Account"
affects: [08-27]
key-files:
  created:
    - supabase/functions/delete-account/index.ts
    - supabase/functions/delete-account/delete.ts
    - supabase/functions/delete-account/delete.test.ts
    - supabase/functions/delete-account/deno.json
    - src/db/accountDeletion.ts
    - src/services/account/deleteAccount.ts
    - src/services/account/__tests__/deleteAccount.test.ts
    - src/features/you/DeleteAccountScreen.tsx
    - src/features/you/useAccountDeletionPreview.ts
    - src/features/you/__tests__/DeleteAccountScreen.test.tsx
    - app/(app)/delete-account.tsx
  modified:
    - supabase/config.toml
    - package.json
    - src/features/you/YouScreen.tsx
    - src/features/you/__tests__/YouScreen.test.tsx
    - src/i18n/locales/household/account.ts
decisions:
  - "delete.test.ts runs under both Deno (CI deno job, npm run test:deno) and Jest (default suite): one file, no runner imports, explicit .ts import."
  - "The caller id is read only from auth.getUser(); deleteAccount() never receives or reads a body."
  - "The sign-out completion is performSignOut with the wipe injected, so the device is wiped once and only after ok."
metrics:
  tasks: 2
  commits: 2
---

# Phase 8 Plan 22: Account deletion Summary

In-app account deletion end to end: the Edge Function deletes the auth user with the service role (the 08-14 trigger then runs the household rule), and the app wipes the device only after the server confirms.

## Commits

- e9d0ae50 feat(08-22): delete-account Edge Function with injected-deps tests (Task 1)
- 5eb710d6 feat(08-22): in-app Delete my account: service, screen with household paragraph, You row (Task 2)

## What was built

- **Edge Function** (`index.ts` wiring, `delete.ts` logic with injected deps): POST only (405 otherwise); no verified caller gives 401; the caller's statement uploads (`statement-uploads/<user id>/...`, the only Storage bucket in the app) are removed first; `auth.admin.deleteUser(caller)` fires the 08-14 before-delete trigger; any storage or auth error gives 500 `delete_failed`. The service role key is read from the function environment and never returned or logged. `config.toml` has `[functions.delete-account] verify_jwt = true`. `test:deno` now also runs the new tests.
- **Client service** (`requestAccountDeletion`): needs a connection; calls `supabase.functions.invoke('delete-account', { method: 'POST' })`; on `ok` runs `performSignOut` with `wipeDeviceData` (analytics off, local sign-out, wipe, theme reset); on any failure returns a typed error and touches nothing.
- **Screen** (`DeleteAccountScreen`, route `/delete-account`): title, plain intro of what is erased, and for someone in a shared household the paragraph from `account_deletion_preview()` ("Shared lines you created stay in {{household}}, shown as Former member. Everything personal is erased. Balances others are owed stay correct.") plus, for an owner, "{{name}} becomes the owner and is told." with the name through the member resolver. Typed confirmation (DELETE, any case), danger Pill, progress line, failure line (same button retries), offline helper. Never blocked by household state.
- **You row**: a red-words Pressable at the end of the Account group, after Sign out, no tile, no animation, spacing from the layout tokens.

## Verification

- `deno test` on `delete.test.ts`: 8 passed (Deno 2.9.5 is installed here). Same file under Jest: passes.
- jest: `src/services/account` (5), `DeleteAccountScreen` (5), YouScreen (36, one added), i18n suites incl. householdCopy and copyGuard: all pass.
- eslint on touched files clean; `tsc --noEmit` exit 0.
- `npm run supabase:preflight`: not runnable here. It fails because the worktree has no `.env.local` (the production ref lives only in the main checkout). Not worked around. **Gate (e) preflight pending** for 08-27.
- No deploy, no secrets set, no production call.

## Deviations from Plan

1. **[Rule 3] Single test file for two runners.** The plan names `delete.test.ts` and a `deno test` command, but Jest's testMatch also picks up `supabase/functions/**/*.test.ts`. The file uses a tiny shim (`Deno.test` when present, Jest `test` otherwise) and a `.ts` import, so both runners work. Added a YouScreen test for the new row (not in the plan's file list).
2. **Storage scope.** The plan says "prefixed by the caller id or household id"; the only bucket is `statement-uploads/<user id>/`, so only that is listed and removed. No household-id objects exist.
3. **Sign-out after a deleted user.** `performSignOut` calls `auth.signOut({ scope: 'local' })`, which may reach the server for a user that no longer exists; its errors are already swallowed and the local wipe still runs.

## Known Stubs

None.

## Threat Flags

None beyond the plan's register (T-08-78 to T-08-81 mitigated: caller from JWT only with a body-ignored test; key only in function env; 500 on any failure with wipe only after ok; storage removed before the user).

## Self-Check: PASSED
