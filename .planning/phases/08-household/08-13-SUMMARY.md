---
phase: 08-household
plan: 13
subsystem: client-data
tags: [household, db, query-hooks, cache, export]
requires: [08-02, 08-03, 08-09, 08-12]
provides: [household db modules, household query hooks, useMemberLabel, useFeature, resetHouseholdScope, RpcResult]
affects: [08-14, 08-15, UI plans in waves 6-8]
key-files:
  created:
    - src/db/householdMembers.ts
    - src/db/householdInvites.ts
    - src/db/householdEvents.ts
    - src/features/household/useMemberLabel.ts
    - src/features/household/useFeature.ts
  modified:
    - src/db/household.ts
    - src/db/recordReads.ts
    - src/data/keys.ts
    - src/data/queries/household.ts
    - src/data/queries/activity.ts
    - src/data/exportManifest.ts
    - src/data/cache/persister.ts
    - scripts/cache-shape.lock.json
decisions:
  - "CACHE_SCHEMA_VERSION 11 -> 12 (gate f); lock refreshed"
  - "household_event_reads listed in NOT_USER_DATA (a last-opened time, no content), so 101's export-tables block needed no edit"
  - "Full member rows live under queryKeys.householdMemberRows, nested under the householdMembers prefix, because the names map (activity.ts) and the full rows are different shapes"
requirements: [HH-01, HH-03, HH-10]
completed: 2026-11-15
---

# Phase 8 Plan 13: Client data foundations Summary

Typed db access, query hooks, one member-label resolver and one feature hook for Household, built against the real 20261122* migrations.

## Commits
- ba4ac1b4: db modules (members, invites, events, household row), tests, export manifest
- 0e3e6856: query keys and hooks, resetHouseholdScope, useMemberLabel, useFeature, cache bump to 12, test updates

## Verification
- `npx tsc --noEmit`: clean
- jest (targeted): householdMembers, householdInvites, exportManifest (incl. the 101 export-tables guard), household query test, useMemberLabel, persister, categoryIcon, recordQueries, recordReads: all pass
- `npm run check:cache-version`: unchanged at version 12 after `--update`
- eslint on touched files: clean
- No full suite, no database.

## Server shapes used (built, not guessed)
- Member RPCs take `p_expected_version`, `p_colour_key`, `p_name_hidden`, `p_display_name`; `set_member_role(p_user_id, p_role_label, p_expected_version)`; `set_member_weights(p_weights jsonb)` (user id to percent); `rename_household(p_name, p_expected_version)`; `set_household_currency(p_code)`.
- Invites: `create_invite()` returns `{invite_id, code, expires_at}`; `my_open_invites()` returns `{ok, invites:[{invite_id, code, expires_at, created_at}]}`; `preview_invite` returns household_name, inviter_display_name (null if hidden), inviter_colour_key, member_count, in_other_household, already_member, full; `redeem_invite` returns household_id, household_name, or already_member.
- Invite codes: Crockford alphabet without I, L, O, U, 12 characters, grouped 4-4-4. `normaliseInviteCode` mirrors `hh_normalise_code`.
- The client cannot select `household_invites.code`; only `my_open_invites` returns it.

## Reason codes versus 08-12 copy keys (sharing.reasons.*)
Server reasons from the RPCs built so far, and the copy mapping for 08-15/08-19 to use. The 08-12 `sharing.reasons.*` keys are about writing lines, not membership, so almost none of the membership reasons have a key:

| Server reason | Source | Copy key |
|---|---|---|
| full | create_invite, restore_invite, redeem_invite | household_full (sharing.reasons) |
| not_member | members RPCs | not_in_household |
| version_conflict | set_my_member_display, set_member_role, rename_household | stale_version (needs the name param) |
| not_owner, not_allowed | create_invite, rename, currency, role | NO KEY |
| colour_taken, invalid_name, invalid_role, owner_label_fixed | member RPCs | NO KEY |
| members_mismatch, invalid_weight, all_zero, not_100 | set_member_weights | NO KEY (members.weights.lastHolder covers all_zero only) |
| unknown_currency | set_household_currency | NO KEY |
| invalid, slow_down, in_other_household | preview/redeem | check household.join.* (not re-verified here) |
| not_found, not_open, not_restorable, try_again | invite RPCs | NO KEY |

Write-line reasons in 08-12 (not_creator, settled_line, linked_line_personal, shared_lines_exist, needs_connection) belong to 08-10 RPCs and are not touched by this plan.

## Deviations from Plan
1. [Rule 1 - Bug] `useHouseholdMemberNames` read `display_name` only. `fetchHouseholdMemberNames` now selects `name_hidden, colour_key` and the map is built through `memberLabel`. A member whose name is null now maps to their colour name instead of being omitted. Two existing tests (recordQueries, recordReads) were updated to match.
2. [Rule 3 - Blocking] Two tests pinned `CACHE_SCHEMA_VERSION` to '11' (persister.test.ts, categoryIcon.test.tsx); updated to '12'.
3. Added `household_event_reads` to `NOT_USER_DATA` (the exportManifest guard flags any table src/db reads), instead of the manifest plus an edit to 101. Also added `created_at` to the household_members manifest entry and `owner_id` to households.
4. Member rows use `queryKeys.householdMemberRows` (nested under the `householdMembers` prefix) rather than reusing `householdMembers` directly, since the names map already caches a different shape there.
5. `useMemberLabel` returns "Former member" for an id that is not the viewer and no longer in the member list, rather than inventing a colour.
6. Task 1 alone leaves `check:cache-version` stale (MEMBER_COLUMNS added); it is correct again after commit 2.
7. The plan's `RpcResult` is declared with a generic and an index-signature failure arm; success payloads are typed per wrapper.

## Known Stubs
None. `useFeature` returns true for all three features until Phase 9 (per config).

## Self-Check: PASSED
