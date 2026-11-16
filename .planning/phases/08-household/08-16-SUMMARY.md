---
phase: 08-household
plan: 16
subsystem: household-ui
tags: [household, ui, primitives, sheets, a11y]
requires: [08-03, 08-12, 08-13]
provides: [MemberAvatar, MemberName, WeightRow, SplitRuleList, SharedBadge, ChangeLine, householdIcons, useMemberSeen, MemberSheet, WeightsSheet]
affects: [08-17, 08-19, 08-20, 08-21]
key-files:
  created:
    - src/features/household/components/MemberAvatar.tsx
    - src/features/household/components/MemberName.tsx
    - src/features/household/components/WeightRow.tsx
    - src/features/household/components/SplitRuleList.tsx
    - src/features/household/components/SharedBadge.tsx
    - src/features/household/components/ChangeLine.tsx
    - src/features/household/glyphs.tsx
    - src/features/household/MemberSheet.tsx
    - src/features/household/WeightsSheet.tsx
    - src/features/household/__tests__/memberNameOnly.test.ts
    - src/features/household/__tests__/MemberSheet.test.tsx
    - src/features/household/__tests__/WeightsSheet.test.tsx
  modified:
    - src/features/household/useMemberLabel.ts
    - src/i18n/locales/household/members.ts
requirements: [HH-03, HH-10]
completed: 2026-11-15
---

# Phase 8 Plan 16: Household primitives and member sheets Summary

Shared Household building blocks (avatar, name, weight row, split rule radio list, Shared badge, change line) plus the member and weights sheets, built on the 06.2 kit with no new colours, icons or shadows.

## Commits
- 93649c8c: primitives, glyph map, `useMemberSeen`, name-resolver guard test
- 5c6262de: MemberSheet, WeightsSheet, tests, copy

## What was built
- `MemberName` renders only through `useMemberLabel`; the guard test walks src/features and src/shell and fails on `display_name` / `full_name` outside the resolver and four own-profile files (rememberedAccounts, useProfile, YouScreen, AvatarButton).
- `MemberAvatar` (28/32/40), colour from `memberColors`, initial from what others see; former member shows the `profile` glyph.
- `WeightRow`: steps of 5 (44 px), tap-to-type, `adjustable` with increment/decrement actions, 0% meta line.
- `SplitRuleList`: radio rows (64 min), weight/amount rows gated by `useFeature`.
- `SharedBadge`: neutral 24-tall pill drawn like StatusBadge; `ChangeLine` with Undo; `householdIcons` maps people/swap/settle/person onto existing icons, no link icon.
- `MemberSheet`: role chips plus Other (maxLength 24, counter, blocked above 24 or empty), six 44 px colour swatches (taken ones disabled, "Rust, taken by Sam"), My name / My colour with "Others see" preview, weights row, Save changes, `colour_taken` and `version_conflict` handled (WarningCard), owner Remove and non-owner Leave as danger text links to `/household/remove?userId=` and `/household/leave`.
- `WeightsSheet`: `rebalanceWeights` on every change; last positive weight keeps its value with the stateTight glyph helper and `hapticWarn`; "Adds up to 100%" badge in a polite live region debounced 600 ms through `useSettledLabel`; Save calls `setMemberWeights`, toast with Undo, `hapticTap`, then `onSaved(before)`.

## Verification
- `npx tsc --noEmit`: clean
- jest: `src/features/household/__tests__` (memberNameOnly, useMemberLabel, MemberSheet, WeightsSheet), `householdCopy`, `hapticNames`, `noRawColours`: all pass (31 + 8 tests)
- eslint on src/features/household and the household locale files: clean
- No hex colours in src/features/household. No full suite, no database.

## Deviations from Plan
1. [Rule 2] `useMemberSeen` added to `useMemberLabel.ts` (the allowed file): the "Others see" preview and avatar initial need the viewer's own shown name, which `useMemberLabel` hides behind "You", and no other file may read the name column.
2. [Rule 2] New copy under `household.members.reasons.*` (refusal messages) and `weight.a11yYou` ("Your weight, N percent") in members.ts; householdCopy stays green.
3. [Rule 1] The version-conflict card cannot name who changed it: `set_my_member_display`, `set_member_role` return only `current_version`. The card says "Changed by someone else" and refreshes the member list. Naming the actor needs a server change (not in this plan).
4. `set_member_weights` takes no expected version (08-13 wrapper), so T-08-106 is mitigated for display and role only; the server rejects a weights set that does not match the current members (`members_mismatch`), which the sheet reports.
5. The sheets call the db wrappers directly with `supabase` and invalidate `queryKeys.householdMembers`, because 08-13 shipped no mutation hooks. The display name is sent as null (server keeps the stored one).
6. Minus/plus on `WeightRow` are drawn bars in `ink`, since the 06.2 set has no minus icon and no substitute was added.
7. Tests mock `react-native/Libraries/Utilities/useWindowDimensions` (as accountsLife does) and await `render`, matching this repo's RNTL.

## Known Stubs
None.

## Self-Check: PASSED
