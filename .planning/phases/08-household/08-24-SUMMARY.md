---
phase: 08-household
plan: 24
subsystem: household-ui
tags: [household, leave, remove, ownership, removed-notice, HH-13]
requires: [08-14, 08-17, 08-23]
provides:
  - "src/db/householdDeparture.ts: leaveHousehold, removeMember, transferOwnership"
  - "LeaveScreen (owner pick step, balance warning, waiting settle-up note, calm done page)"
  - "RemoveMemberScreen (owner confirm, toast Undo through reinvite_removed)"
  - "RemovedNoticeHost (one-time removed-member sheet, mounted in the (app) layout)"
  - "reinviteRequest: hands a reinvite code from the toast Undo to Household home's InviteSheet"
affects: [08-25, 08-26]
key-files:
  created:
    - app/(app)/household/leave.tsx
    - app/(app)/household/remove.tsx
    - src/db/householdDeparture.ts
    - src/features/household/leave/LeaveScreen.tsx
    - src/features/household/leave/RemoveMemberScreen.tsx
    - src/features/household/leave/RemovedNoticeHost.tsx
    - src/features/household/leave/reinviteRequest.ts
    - src/features/household/leave/__tests__/LeaveScreen.test.tsx
    - src/features/household/leave/__tests__/RemoveMemberScreen.test.tsx
  modified:
    - app/(app)/_layout.tsx
    - src/i18n/locales/household/leave.ts
    - src/features/household/HouseholdHomeScreen.tsx
    - src/features/household/__tests__/householdRoutes.test.ts
    - src/features/record/__tests__/routes.test.tsx
    - src/shell/__tests__/shellNavigation.test.tsx
    - src/shell/tabBar/__tests__/tabsLayoutStable.test.tsx
requirements: [HH-13]
decisions:
  - "The leave and remove confirms are the page itself (title, warning, body, danger primary, secondary), not a ConfirmSheet over an empty page"
  - "Undo on the removal toast fires after the remove screen has closed, so the reinvite code goes through a small hand-off module to Household home, which owns the InviteSheet"
metrics:
  tasks: 2
  commits: 2
  completed: 2026-11-16
---

# Phase 8 Plan 24: Leaving, removing and the removed-member notice Summary

A member can leave after one clear confirm (an owner first picks the new owner), the owner can remove a member with a 24-hour Undo that reconnects them by a fresh invite, and a removed person is told once, calmly, that their records are still theirs.

## Commits

- 0bd5285a feat(08-24): leave and remove screens with owner pick and balance warning (Task 1)
- 20a46504 feat(08-24): removed-member notice host and leave/remove routes in the app stack (Task 2)

## What was built

- **Wrappers** (`src/db/householdDeparture.ts`), shaped on the real SQL in `20261122000800`: `leave_household(p_new_owner)` -> `{ok, new_household_id, open_balances:[{other_id, amount}]}` or `alone | pick_new_owner | not_member`; `remove_member(p_user)` -> `{ok, departure_id}` or `not_owner | not_member`; `transfer_ownership(p_new_owner)` -> `{ok}` or `not_owner | not_member`. The plan's `{ok}` for remove_member was wrong: the SQL also returns `departure_id`, which the Undo needs.
- **LeaveScreen** (`/household/leave`): an owner with other members sees "Pick the new owner" (radio rows with avatar and resolver name at 64, `hapticTick` on choose); the primary reads "Pick someone to continue" and is disabled until a choice, then "Make {{name}} the owner and leave" opens the confirm. A non-owner goes straight to the confirm. The confirm shows one `WarningCard` per open pair (owes or owed variant, "{{self}} (left)" from `useMemberSeen`), a line per waiting settle-up of the viewer ("will be cancelled. The balance stays.", owner answer 10), the records body, "Leave household" (danger) and "Stay". On ok: `resetHouseholdScope(qc, userId, oldHouseholdId)`, `hapticTap`, the calm `EmptyState` page "You’re no longer in {{household}}" with the records paragraph and "Got it", which goes Home with the toast "You left {{household}}". `pick_new_owner` returns to the pick step; other refusals show the household reason words. Household of one: "Just you here" with a way back. Offline: the primary is disabled with the offline helper.
- **RemoveMemberScreen** (`/household/remove?userId=`): owner only (a member sees "Only the owner can do this."; a person no longer listed sees "This person is no longer in ..."). Owner-side `WarningCard` when the pair has an open balance (owed or owes), the waiting settle-up line when the owner and that person have one, the removal body, "Remove {{name}}" (danger), "Keep {{name}}". On ok: members, balances, settlements and departures are refreshed, `hapticTap`, toast "{{name}} removed" with Undo, and back. Undo calls `reinvite_removed(departure_id)`; the code is handed to Household home, which opens the InviteSheet with it (same path as the DepartureCard's "Invite again"). A refused reinvite shows a refusal toast with the 08-17 owner reason words.
- **RemovedNoticeHost**, mounted once in `app/(app)/_layout.tsx` beside `HouseholdRealtimeHost`: reads the current household's events; an unseen `removed` event with `subject_id` = viewer shows one `Sheet` (48 icon tile, title from `params.household_name`, the body, "Got it"). Got it or a swipe marks `fincwin.removedSeen.<eventId>` in AsyncStorage. If a `/household` screen is open it navigates to Home first. Live: the 08-23 reconciler resets the household scope on the viewer's own `removed` event, the new household's events load, and the sheet appears.
- **Routes**: `household/leave` and `household/remove` are declared in the (app) stack before the Decide gate; `householdRoutes.test.ts` now checks all five household routes.
- **Copy** (`household.leave.*`): added `leaveOwed`, `balanceTitle`, `leavePending`, `ownerPickBody`, `ownerCtaEmpty`, `alone.*`, `removeOwes`, `removePending`, `removeGone`. No advice words; curly apostrophes.

## Verification

- `npx tsc --noEmit`: exit 0.
- `npx jest src/features/household/leave`: 2 suites, 16 tests pass.
- `npx jest src/features/household/__tests__ householdCopy hapticNames noRawColours`: 10 suites, 73 tests pass (includes memberNameOnly, HouseholdHomeScreen, householdRoutes).
- Layout wiring: `routes.test.tsx`, `shellNavigation.test.tsx`, `tabsLayoutStable.test.tsx`, `harness.test.tsx`: 4 suites, 42 tests pass.
- `npx eslint` on every touched file: 0 errors (the only warnings are pre-existing `require()` and import-order warnings in the three layout tests).
- Acceptance greps: `pick_new_owner|newOwner` 7, `reinvite_removed|reinviteRemoved` 3, `resetHouseholdScope` in LeaveScreen 3, `RemovedNoticeHost` in the layout 2, `fincwin.removedSeen` 1.
- No SQL changed, so no database run. No full suite (quick checks per plan).

## Deviations from Plan

1. **[Rule 1] remove_member returns `departure_id`.** The plan's interface said `{ok}`; the SQL returns `{ok, departure_id}` and the Undo needs it. Followed the SQL.
2. **[Rule 3] Hand-off for the Undo code.** The Undo runs from the global toast after the remove screen has gone back, so `src/features/household/leave/reinviteRequest.ts` (not in the plan's file list) passes the code to Household home, and `HouseholdHomeScreen.tsx` gained a 10-line listener that opens its InviteSheet. A code that arrives while Home is not mounted waits until Home mounts.
3. **Confirms are pages, not sheets.** Both routes exist only to confirm, so the confirm is the page (title, warning, body, danger primary, secondary) instead of a `ConfirmSheet` over an empty screen. Wording, button variants and order follow UI-SPEC Screen 11.
4. **[Rule 2] Waiting settle-up note (owner answer 10).** Both confirms say a waiting settle-up will be cancelled and the balance stays, from `useSettlements`.
5. **RNTL 14.** `fireEvent.press` is awaited in the new tests (it is async in RNTL 14), and a test never re-renders after `screen.unmount()` (it broke later tests in the file), so the "only with an open balance" checks are two tests each.
6. **`transferOwnership`** is wrapped but not used on screen: `leave_household(p_new_owner)` transfers ownership itself. A standalone "make someone owner" action is not in this plan's UI.

## Gaps and notes for later

- **Settle-ups the owner cannot see.** The owner's remove confirm can only mention a waiting settle-up between the owner and the person being removed. One between that person and another member is cancelled by the server (and that member is told through `settle_departed`), but the owner's `useSettlements` read only returns settle-ups the owner is in, so the confirm does not mention it.
- **"Seen" is per device.** The removed notice mark is in AsyncStorage, so a second device shows the sheet once more. The key is not in a sign-out wipe list; it only holds an event id.
- **Disk.** The C: drive reported 0 bytes free for this whole run (the scratch temp folder too). Small writes, tsc, jest and git still worked, but the machine needs space freed before the next heavy step (db reset, builds).

## Known Stubs

None.

## Threat Flags

None. Leave and remove call the existing security-definer RPCs (owner powers enforced server-side, T-08-87); the cache is dropped with `resetHouseholdScope` after leaving (T-08-88); the removed person is told once (T-08-89).

## Self-Check: PASSED

## Owner answers (2026-11-16)
- Remove with a waiting settle-up between the removed person and a third member: leave as is. The owner's confirm does not mention it, and the server still cancels it and tells that member.
- The removed-member notice is remembered once per phone, not once per person.
