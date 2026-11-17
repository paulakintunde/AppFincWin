---
phase: 08-household
plan: 17
subsystem: household-ui
tags: [household, ui, screens, sheets, invites, notices]
requires: [08-13, 08-16]
provides: [HouseholdHomeScreen, NoticesScreen, InviteSheet, RenameHouseholdSheet, HouseholdCurrencySheet, DepartureCard, useHouseholdScope, useNoticeFormat, ownerReasonKey, memberDepartures db wrapper]
affects: [08-18, 08-20, 08-21, 08-24]
key-files:
  created:
    - src/features/household/InviteSheet.tsx
    - src/features/household/RenameHouseholdSheet.tsx
    - src/features/household/HouseholdCurrencySheet.tsx
    - src/features/household/HouseholdHomeScreen.tsx
    - src/features/household/NoticesScreen.tsx
    - src/features/household/DepartureCard.tsx
    - src/features/household/useHouseholdScope.ts
    - src/features/household/noticeText.ts
    - src/features/household/ownerReasons.ts
    - src/db/memberDepartures.ts
    - app/(app)/household/index.tsx
    - app/(app)/household/notices.tsx
    - src/features/household/__tests__/InviteSheet.test.tsx
    - src/features/household/__tests__/HouseholdHomeScreen.test.tsx
  modified:
    - package.json
    - package-lock.json
    - src/features/you/YouScreen.tsx
    - src/features/you/components/youRowIcons.ts
    - src/features/you/__tests__/YouScreen.test.tsx
    - src/i18n/locales/household/home.ts
    - src/i18n/locales/household/notices.ts
requirements: [HH-01, HH-03, HH-10]
completed: 2026-11-15
---

# Phase 8 Plan 17: Household screens Summary

The Household home, notices list, owner sheets (invite, rename, currency), departure card and the You row, built on the 08-16 primitives and the 08-13 data hooks, with no new colours, icons or shadows.

## Commits
- 9b6c1cad: owner sheets, `expo-clipboard`, scope/notice/reason helpers, copy keys
- bc1558fb: Household home, notices, departure card, `memberDepartures.ts`, You row, routes, tests

## What was built
- `InviteSheet`: makes one invite per opening (`createInvite`), shows the grouped code (heading role, read letter by letter), "Copy code" (`expo-clipboard`, polite live region "Code copied"), "Share" (message plus `fincwin://invite?code=...`; no https anywhere). `full` shows the full-household sentence and no code; offline makes no invite and disables Copy and Share; members never see it. Optional `code` / `expiresAt` props let the departure card open it with the code `reinvite_removed` made.
- `RenameHouseholdSheet` (1..60, toast with Undo that renames back with the new version) and `HouseholdCurrencySheet` (ISO list as radio rows; `shared_lines_exist` shows the plain catalogue explanation).
- `HouseholdHomeScreen`: hero (name, owner Rename link, "{{count}} people - amounts in {{currency}}" opening the currency sheet for the owner), the `{/* 08-21: balances */}` marker right after the hero, People card (avatar, resolver name, role, weight, chevron to `MemberSheet`; owner "+ Invite someone"; six-person cap line), pending invites (owner: "Invite sent - expires ...", Valid for one person, Copy link, Cancel invite with Undo through `restoreInvite`), `DepartureCard`, rules rows (`/household/split-default`, `/household/category-defaults`, `/household/shared-accounts`), recent changes (5, "See all" to notices), Leave household (`/household/leave`), footer. Household-of-one: "Just you for now" `EmptyState` with Invite someone and "Have a code?" (`/household/join`); the owner's pending invites and removal card still show. Cards use `FadeIn once=...`; offline disables owner actions with the offline helper; `SyncStatusLine` under the title.
- `NoticesScreen`: all events newest first as `ChangeLine`, marks read on focus (when online) and refreshes the read marker.
- `noticeText.ts` (`useNoticeFormat`): one sentence per server event kind (all 17 kinds the migrations write), names via `useMemberLabel`, amounts via the money formatter, times in the device locale.
- You: "Household" row in the Money group (`MONEY_ROWS` entry, `YouRowId` `household`, `YOU_ROW_ICON` `household`) with sublabel "{{household}} - {{count}} people" or "Just you" and an unread Chip (status slot).
- Routes `app/(app)/household/index.tsx` and `notices.tsx` (thin).

## Verification
- `npx tsc --noEmit`: clean
- jest (targeted): `src/features/household` (InviteSheet 4, HouseholdHomeScreen 8, MemberSheet, WeightsSheet, memberNameOnly, useMemberLabel), `src/features/you` (YouScreen incl. 2 new Household row tests, youLife, others), `hapticNames`, `householdCopy`, `noRawColours`: 14 suites, 122 tests pass (+ noRawColours 2)
- eslint on `src/features/household`, `src/features/you`, `src/db/memberDepartures.ts`, `app/(app)/household`, `src/i18n/locales/household`: clean (including i18next no-literal-string)
- `node scripts/check-cache-version.mjs`: unchanged (version 12). No full suite, no database, no push.

## Native module
`expo-clipboard ~57.0.2` was added with `npx expo install expo-clipboard` (package.json and package-lock.json only). It is a native module, so the next dev-client or preview build must include it; an OTA onto an older binary would crash on the import. The install was written through the junction into `C:\dev\fincwin-hh\node_modules`, which is the shared tree, so other worktrees now see the package on disk.

## Cache-shape lock
No refresh needed. `src/db/memberDepartures.ts` uses an inline select list (no `*_COLUMNS` constant) and the departures query uses an inline key (not added to `src/data/keys.ts`), so the lock hash is unchanged. If 08-15 or later wants the departures read persisted deliberately, promote it to a constant and bump then.

## Deviations from Plan
1. [Rule 2] New copy keys (home.ts: `unnamed`, `noticesUnread`, `roleOwner`, `pendingInvites`, `linkCopied`, `restoreFailed`, `currencySheet.saved`, `reasons.*`; notices.ts: `renamed`, `currency_changed`, `departure_undone`, `settle_cancelled`, `settle_undone`, `written_off`, `settled_plain`, `split_changed_plain`, `category_default_changed`, `fallback`). The 08-12 set had no wording for six server event kinds or for refusal reasons. `householdCopy` stays green.
2. [Rule 1] "Split changed" uses a plain sentence ("Sam changed how a line is split"). The event carries before/after JSON, not a line or category name, so the copy keys that name `{{line}}` cannot be filled from `params`.
3. Two small helper files not in the plan: `useHouseholdScope.ts` (user, household, members, owner, online) and `ownerReasons.ts` (refusal reason to copy key), plus `noticeText.ts`; all under `src/features/household`.
4. Sheets mount a body component per opening so state starts clean (the lint rule forbids setState in an effect); behaviour is as planned.
5. No `Stack.Screen` entries added to `app/(app)/_layout.tsx` (not in the plan's file list); Expo Router registers the two routes automatically with the default options.

## Gaps for follow-up (not blockers)
- A removed person is named "Former member" on the departure card ("Former member was removed. Invite Former member again..."). The resolver returns that for anyone no longer in the member list, and `household_former_members` has no client wrapper. Fixing it needs resolver support in `useMemberLabel.ts` (out of bounds here).
- People card does not list "(left)" members with an open balance; that needs the balances data from 08-21.
- The Rules rows show no current default value (the default rule is read in 08-20) and the read-only summary link row is omitted (deferred, D-45).
- Notices are not tappable yet (the target screens, settle-up and others, belong to later plans). Opening the list marks everything read at once.
- A removed-member sheet (Screen 11) and the leave and remove routes belong to 08-24; this plan only links to them.

## Known Stubs
None that block the plan's goal; the three gaps above are data that later plans supply.

## Threat flags
None. The invite link is `fincwin://` only (T-08-105); owner actions are hidden from members and refused by the server (T-08-62).

## Self-Check: PASSED
