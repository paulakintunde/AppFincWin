---
phase: 08-household
plan: 18
subsystem: household-ui
tags: [household, invite, deep-link, join, expo-router]
requires: [08-13, 08-17]
provides: [JoinScreen, WhatsSharedSheet, pendingInvite, app/invite route, useInviterLabel]
affects: [08-24, 08-27]
key-files:
  created:
    - app/invite.tsx
    - app/(app)/household/join.tsx
    - src/features/household/join/JoinScreen.tsx
    - src/features/household/join/WhatsSharedSheet.tsx
    - src/features/household/join/pendingInvite.ts
    - src/features/household/join/__tests__/JoinScreen.test.tsx
    - src/features/household/join/__tests__/pendingInvite.test.ts
  modified:
    - app/index.tsx
    - src/features/household/useMemberLabel.ts
    - src/i18n/locales/household/join.ts
requirements: [HH-01, HH-02, HH-15]
completed: 2026-11-15
---

# Phase 8 Plan 18: The invitee side Summary

Opening `fincwin://invite?code=XXXX-XXXX-XXXX` (or typing or pasting a code) shows who invited you and which household, joins on one tap, and then shows the one-time what's-shared card. The custom scheme only: there is no web page and no https link anywhere.

## Commits
- e64914b0: feat(08-18) deep link and pending-invite store (task 1)
- the second `feat(08-18)` commit on `hh/w8-c`: join screen, preview, errors, what's-shared card, tests (task 2)

## What was built
- `pendingInvite.ts`: `savePendingInvite` (only a code that `normaliseInviteCode` accepts is stored, under `fincwin.pendingInvite.v1`), `peekPendingInvite`, `takePendingInvite` (clears), 7-day expiry, a wipe handler for sign-out, and `formatTypedCode` (groups as you type: O reads as 0, I and L as 1).
- `app/invite.tsx` (top-level, so it resolves signed out): saves the code, then redirects to `/household/join` when signed in and to `/` otherwise. `app/index.tsx`: the `app` branch checks for a waiting code first and goes to the join screen, else to home. No `https` anywhere in the route.
- `JoinScreen`: code field (`autoCapitalize="characters"`, `autoCorrect={false}`, paste allowed, grouped as typed, spoken character by character), "Check code" disabled until 12 valid characters or offline, preview card ("Sam invited you to Flat 4B", "2 people so far", the records-come-with-you line when the person has accounts), "Join Flat 4B", "Not now". A code from the link or stored before sign-in fills the field and shows the preview but never joins by itself (T-08-66).
- Errors: every `invalid` reason (and any unknown one) gives the same message (HH-15); `slow_down` gives the too-many-tries message; `full` and `in_other_household` give their own (the second as a warning card with "Go to my household" and no Join button); offline gives the connection message.
- Join: `redeemInvite`, then `resetHouseholdScope(qc, userId, oldHouseholdId)`, then `hapticTap` (06.2 D-20: joining is a light tap, not a milestone). `WhatsSharedSheet` shows the D-09 body (`household.join.shared.body`) once per household (`fincwin.whatsSharedSeen.<householdId>`), with a 48 `household` icon tile and "Got it", then the app goes to `/household`.
- `useInviterLabel` (in `useMemberLabel.ts`): the inviter's name for the preview, colour name when hidden, kept in the resolver file so the D-32 guard stays green.

## Verification
- `npx tsc --noEmit`: clean. eslint on `src/features/household`, `src/i18n/locales/household` and `app`: clean.
- jest (each alone): `src/features/household/join` (JoinScreen 11, pendingInvite 8), `memberNameOnly`, `useMemberLabel`, `householdCopy`, `noRawColours`, and `hapticNames` (run with the 08-21 batch): all pass. No full suite, no database. Manual: the invite link opening the app on a real phone stays a VALIDATION manual row.

## Deviations from Plan
1. [Rule 3] `useInviterLabel` added to `useMemberLabel.ts` (not in the plan's file list): the preview carries the inviter's name column and the D-32 guard forbids reading it anywhere else.
2. `app/_layout.tsx` was not edited: it does not allow-list routes. Only `update-required`, `(auth)` and `(app)` are declared under `Stack.Protected`; `index` and `invite` are plain top-level routes, so `invite` renders in every route state with no change.
3. New copy in `join.ts`: `codeA11y`, `checking`, `inviterFallback` ("the person who invited you", used when no inviter is known). The rest was already in the 08-12 catalogue.
4. The plan's preview shape has `ok: false, reason: 'full'`; the server (08-13) returns `ok: true` with a `full` flag. The screen handles both.
5. `already_member` navigates to the household without a preview, as the plan says.
6. The first commit holds the route and storage files; `app/index.tsx` imports only the storage file, so both commits compile alone except that `app/(app)/household/join.tsx` (added in the second commit) is what the redirect targets.

## Known Stubs
None.

## Threat Flags
None. A malformed link is rejected by `normaliseInviteCode` before storage or any call (T-08-64); one message for every invalid cause (T-08-65); joining always needs a tap after the preview (T-08-66); the stored code expires after 7 days and is wiped on sign-out (T-08-67).
